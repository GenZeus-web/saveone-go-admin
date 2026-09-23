// ============================================================
// views/benchmark.js — เทียบสาขา + เทรนด์รายเดือน + ป้ายเตือน (BM-01/02/04)        [เดิม 3710-3913]
// ============================================================
// ── BENCHMARK ──
// v2.10.0 BM-04: เปลี่ยนชื่อจาก `bmBranches` เป็น `bmSelected` — ชื่อเดิมชนกับ field ใหม่
//   `bmBranches` ใน users/ (สิทธิ์: เทียบสาขาไหนได้บ้าง) · `bmSelected` (UI: ตอนนี้เลือกดูสาขาไหน)
let bmSelected=new Set(['SS']);
let bmSelInit=false;
const BM_COLORS={SS:'rgba(240,165,0,.85)',BG:'rgba(74,158,255,.85)',BN:'rgba(61,214,140,.85)'};
const BM_NAMES={SS:'ศรีสมาน',BG:'ประตูกรุงเทพ',BN:'บางนา'};

// ตั้งต้น = สาขาแรกที่ผู้ใช้ "เทียบได้" ไม่ใช่ 'SS' ตายตัว (manager BN ที่ไม่มี SS จะได้ BN)
function bmEnsureInit(){
  if(bmSelInit) return;
  bmSelInit=true;
  const list=myBmBranches();
  bmSelected=new Set(list.length?[list[0]]:['SS']);
  syncBmPills();
}
// ให้ class .sel ของปุ่มตรงกับ bmSelected เสมอ (HTML เขียน sel ไว้ที่ SS ตายตัว)
function syncBmPills(){
  const list=myBmBranches();
  document.querySelectorAll('#bmBranchPills .mc-pill').forEach(el=>{
    const m=/toggleBmBranch\('(\w+)'/.exec(el.getAttribute('onclick')||'');
    if(!m) return;
    const ok=list.includes(m[1]);
    el.style.display=ok?'':'none';
    el.classList.toggle('sel', ok&&bmSelected.has(m[1]));
  });
}
// ด่าน auth เรียกตัวนี้หลังรู้สิทธิ์จริงแล้ว — บังคับตั้งต้นใหม่อีกรอบ
window.initBmPills=function(){ bmSelInit=false; bmEnsureInit(); };

function toggleBmBranch(b,btn){
  bmEnsureInit();
  if(!myBmBranches().includes(b)) return;   // กันเรียกจาก console ข้ามสิทธิ์
  if(bmSelected.has(b)){if(bmSelected.size>1){bmSelected.delete(b);btn.classList.remove('sel');}}
  else{bmSelected.add(b);btn.classList.add('sel');}
  renderBenchmark();
}

function getBranchMerged(b){
  if(b==='SS') return merged;
  if(b==='BG') return bgMerged;
  if(b==='BN') return bnMerged;
  return [];
}

// ── v2.5.8 BM-01/BM-02: เทรนด์ล็อกเฉลี่ย/วัน รายเดือน + ป้ายเตือนสาขาไหลลง ──
const BM_MIN_DAYS=7;   // เดือนที่มีข้อมูลน้อยกว่านี้ ไม่เอามาคิด "ตกต่อเนื่อง" (กันเดือนปัจจุบันเพิ่งเริ่ม)
const BM_ALERT_N=3;    // ตกติดกันกี่เดือน = ธงแดง "ไหลลงไม่หยุด"
const BM_DROP_PCT=3;   // ต้องลดเกินกี่ % ถึงนับว่า "ตก" (deadband) — กันกราฟที่ราบแล้วโดนนับเป็นไหลลง

// ล็อกเฉลี่ย/วัน รายเดือน — ตัดวันที่ยอด = 0 ออกก่อนเฉลี่ย (วันปิด/ไม่มีข้อมูล)
function bmMonthlyAvg(b){
  const mon={};
  getBranchMerged(b).forEach(r=>{
    const v=getLock(r,'all');
    if(!v) return;
    const k=mKey(r.date);
    if(!mon[k])mon[k]={s:0,c:0};
    mon[k].s+=v; mon[k].c++;
  });
  const out={};
  Object.keys(mon).forEach(k=>{out[k]={avg:mon[k].s/mon[k].c,days:mon[k].c};});
  return out;
}

// นับจำนวนเดือนที่ "ตกต่อเนื่อง" นับถอยหลังจากเดือนล่าสุด
function bmTrend(b){
  const m=bmMonthlyAvg(b);
  const ks=Object.keys(m).sort().filter(k=>m[k].days>=BM_MIN_DAYS);
  if(ks.length<2) return null;
  const vals=ks.map(k=>m[k].avg);
  // นับ "ตก" เฉพาะเดือนที่ลดเกิน BM_DROP_PCT% — สาขาที่เจอพื้นแล้วนิ่ง (เช่น BN)
  // จะไม่ถูกนับเป็นไหลลง แม้ตัวเลขจะขยับลงนิดหน่อยทุกเดือน
  let streak=0;
  for(let i=vals.length-1;i>0;i--){
    const prev=vals[i-1];
    const dropPct=prev?(prev-vals[i])/prev*100:0;
    if(dropPct>BM_DROP_PCT) streak++; else break;
  }
  const peak=Math.max(...vals), last=vals[vals.length-1];
  return {ks,vals,streak,peak,last,fromPeak:peak?Math.round((last-peak)/peak*100):0,
          lastLbl:(function(){const q=ks[ks.length-1].split('-');return mLbl(new Date(q[0],q[1]-1,1));})()};
}

function renderBenchmark(){
  bmEnsureInit();                       // v2.10.0 BM-04
  const branches=[...bmSelected].filter(b=>myBmBranches().includes(b));
  // KPI cards
  const kpiRow=document.getElementById('bmKpiRow');
  if(kpiRow){
    kpiRow.innerHTML=branches.map(b=>{
      const d=getBranchMerged(b);
      if(!d.length) return `<div class="mom-card" style="border-color:${sc(BM_COLORS[b])}"><div class="mom-month" style="color:${sc(BM_COLORS[b])}">${BM_NAMES[b]}</div><div style="font-size:11px;color:var(--ink3)">ยังไม่มีข้อมูล</div></div>`;
      const days=d.length||1;
      const totalLock=d.reduce((s,r)=>s+getLock(r,'all'),0);
      const avgLock=(totalLock/days).toFixed(1);
      const totalRev=d.reduce((s,r)=>s+revST(r,'all',b)+revNon(r,'all',b),0); // PRICE-01: ใช้ราคาของสาขา b ไม่ใช่สาขาที่เปิดดูอยู่
      const fds=d.filter(r=>r.freeDay).length;
      const canSeeRev=window.userPerms?.showRevenue;
      return `<div class="mom-card" style="border-color:${sc(BM_COLORS[b])}">
        <div class="mom-month" style="color:${sc(BM_COLORS[b])};font-weight:700">${BM_NAMES[b]}</div>
        <div class="mom-val" style="color:${sc(BM_COLORS[b])}">${fmtN(avgLock,1)}</div>
        <div style="font-size:10px;color:var(--ink3)">ล็อกเฉลี่ย/วัน</div>
        <div style="font-size:10px;color:var(--ink2);margin-top:4px">รายรับรวม ${canSeeRev ? fmtN(totalRev)+' ฿' : '—'}</div>
        <div style="font-size:10px;color:var(--gold);margin-top:2px">วันฝน ${fds} วัน</div>
      </div>`;
    }).join('');
  }

  // ── ป้ายเตือนอัตโนมัติ: สาขาที่ตกต่อเนื่อง ──
  const alertBox=document.getElementById('bmAlert');
  if(alertBox){
    alertBox.innerHTML=branches.map(b=>{
      const t=bmTrend(b);
      const nm=`<strong style="color:${sc(BM_COLORS[b])}">${BM_NAMES[b]}</strong>`;
      if(!t) return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:8px 12px;font-size:12px;color:var(--ink3)">⚪ ${nm} — ข้อมูลยังไม่พอประเมินเทรนด์ (ต้องมีอย่างน้อย 2 เดือนที่มีข้อมูล ≥ ${BM_MIN_DAYS} วัน)</div>`;
      let ic,txt,col,bg;
      if(t.streak>=BM_ALERT_N){ ic='🔴'; col='var(--red)'; bg='rgba(255,77,79,.12)'; txt=`<strong>ไหลลงไม่หยุด</strong> — ตกต่อเนื่อง ${t.streak} เดือนติด`; }
      else if(t.streak===2){ ic='🟡'; col='var(--gold)'; bg='rgba(240,165,0,.12)'; txt='<strong>เฝ้าระวัง</strong> — ตก 2 เดือนติด'; }
      else if(t.streak===1){ ic='🟡'; col='var(--gold)'; bg='rgba(240,165,0,.08)'; txt=`ตกจากเดือนก่อน 1 เดือน (ยังไม่นับว่าเป็นเทรนด์)`; }
      else { ic='🟢'; col='var(--green)'; bg='rgba(61,214,140,.10)'; txt=`<strong>ไม่ไหลลง</strong> — เดือนล่าสุดไม่ได้ลดเกิน ${BM_DROP_PCT}% จากเดือนก่อน`; }
      const peakTxt=t.fromPeak<0?` · ต่ำกว่าจุดพีค ${Math.abs(t.fromPeak)}%`:' · อยู่ที่จุดพีค';
      return `<div style="background:${bg};border:1px solid ${col};border-radius:7px;padding:8px 12px;font-size:12px;color:var(--ink);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span>${ic}</span><span>${nm} — ${txt}</span>
        <span style="color:var(--ink3);font-size:11px">(${t.lastLbl} เฉลี่ย ${fmtN(t.last,1)} ล็อก/วัน${peakTxt})</span>
      </div>`;
    }).join('');
  }

  // กราฟล็อกเฉลี่ย/วัน รายเดือน แต่ละสาขา
  const allMks=[...new Set(branches.flatMap(b=>getBranchMerged(b).map(r=>mKey(r.date))))].sort();
  const mkLabels=allMks.map(k=>{const[y,m]=k.split('-');return mLbl(new Date(y,m-1,1));});

  dChart('cBmAvg');
  charts.cBmAvg=makeChart('cBmAvg',{
    type:'line',
    data:{
      labels:mkLabels,
      datasets:branches.map(b=>{
        const m=bmMonthlyAvg(b);
        return{label:BM_NAMES[b],
          data:allMks.map(k=>m[k]?+m[k].avg.toFixed(1):null),
          borderColor:BM_COLORS[b],backgroundColor:'transparent',borderWidth:2.5,
          // เดือนที่ข้อมูลน้อยกว่า BM_MIN_DAYS วาดจุดกลวง = ยังไม่ครบเดือน อ่านเผื่อใจ
          pointRadius:allMks.map(k=>m[k]?(m[k].days>=BM_MIN_DAYS?3.5:5):0),
          pointStyle:allMks.map(k=>m[k]&&m[k].days<BM_MIN_DAYS?'circle':'circle'),
          pointBackgroundColor:allMks.map(k=>m[k]&&m[k].days<BM_MIN_DAYS?'transparent':BM_COLORS[b]),
          tension:.3,spanGaps:true};
      })
    },
    options:cOpts()
  });

  // กราฟล็อกรวมรายเดือน
  dChart('cBmMonth');
  charts.cBmMonth=makeChart('cBmMonth',{
    type:'line',
    data:{
      labels:mkLabels,
      datasets:branches.map(b=>{
        const d=getBranchMerged(b);
        const mon={};
        d.forEach(r=>{const k=mKey(r.date);if(!mon[k])mon[k]=0;mon[k]+=getLock(r,'all');});
        return{label:BM_NAMES[b],data:allMks.map(k=>mon[k]||null),borderColor:BM_COLORS[b],backgroundColor:'transparent',borderWidth:2,pointRadius:3,tension:.3,spanGaps:true};
      })
    },
    options:cOpts()
  });

  // กราฟรายวัน 60 วันล่าสุด
  const today=new Date();
  const cut=new Date(today);cut.setDate(cut.getDate()-60);
  // รวม unique dates จากทุกสาขา sort ตาม Date object จริง
  const dayMapRaw={};
  branches.forEach(b=>{
    getBranchMerged(b).filter(r=>r.date>=cut).forEach(r=>{
      const k=r.date.getTime(); // ใช้ timestamp เป็น key
      if(!dayMapRaw[k])dayMapRaw[k]={date:r.date,label:fmtD(r.date)};
      dayMapRaw[k][b]=getLock(r,'all');
    });
  });
  // เรียงตาม timestamp
  const daySorted=Object.values(dayMapRaw).sort((a,b)=>a.date-b.date);
  const dayKeys=daySorted.map(d=>d.label);
  const dayMap={};
  daySorted.forEach(d=>{dayMap[d.label]=d;});
  dChart('cBmDaily');
  charts.cBmDaily=makeChart('cBmDaily',{
    type:'line',
    data:{
      labels:dayKeys,
      datasets:branches.map(b=>({
        label:BM_NAMES[b],
        data:daySorted.map(d=>d[b]||null),
        borderColor:BM_COLORS[b],
        backgroundColor:'transparent',
        borderWidth:1.5,pointRadius:1.5,tension:.3,spanGaps:false
      }))
    },
    options:{...cOpts(),plugins:{legend:{labels:{color:chartClr().lbl,font:{family:'Noto Sans Thai',size:11}}}}}
  });
}



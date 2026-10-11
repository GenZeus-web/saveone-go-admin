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

// BM-05: ตามปุ่มโซนใน sidebar — applyZone() ล้างยอดโซนที่ไม่ได้เลือกเป็น 0
//   → getLock/revST/revNon ทุกจุดในหน้านี้ได้ยอดเฉพาะโซนเอง ไม่ต้องแยกเคส
// BM-06: การ์ด + กราฟ ตามช่วงเวลาด้วย · ป้ายเตือนไหลลงใช้ bmAllRows() ทั้งประวัติ
//   (ต้องเห็น ≥ 3 เดือนถึงนับ "ตก 3 เดือนติด" ได้ ช่วง 7 วัน/30 วัน/3 เดือน จะประเมินไม่ได้)
function bmAllRows(b){
  if(b==='SS') return applyZone(merged);
  if(b==='BG') return applyZone(bgMerged);
  if(b==='BN') return applyZone(bnMerged);
  return [];
}
function getBranchMerged(b){ return applyPeriod(bmAllRows(b)); }

// BM-07: ช่วงก่อนหน้าที่ยาวเท่ากัน · เลือกเดือน = เดือนก่อน · "ทั้งหมด" = ไม่มีให้เทียบ (null)
function bmPrevRange(){
  if(selMonth){
    const[y,m]=selMonth.split('-').map(Number);
    return {from:new Date(y,m-2,1),to:new Date(y,m-1,0,23,59,59)};
  }
  if(customFrom&&customTo){
    const len=customTo-customFrom;
    return {from:new Date(customFrom-len-1),to:new Date(customFrom-1)};
  }
  if(period>0){
    const to=new Date();to.setDate(to.getDate()-period);
    const from=new Date(to);from.setDate(from.getDate()-period);
    return {from,to:new Date(to-1)};
  }
  return null;
}
// ล็อกเฉลี่ย/วัน แบบเดียวกับการ์ดสาขา (ยอดรวม ÷ จำนวนวันที่มีแถว) · ไม่มีแถว = null
function bmAvgPerDay(rows){
  return rows.length?rows.reduce((s,r)=>s+getLock(r,'all'),0)/rows.length:null;
}
// ป้ายโซนบนหัวการ์ด — Non ของ SS = Boot Seller · ของ BG/BN = รถ (Car) คนละแบบกัน
function bmZoneLabel(branches){
  if(zone==='st') return 'ST · Street Food';
  if(zone!=='non') return 'ทุกโซน';
  const hasSS=branches.includes('SS'), hasCar=branches.some(b=>b!=='SS');
  return hasSS&&hasCar?'Non (SS) / Car (BG·BN)':hasSS?'Non · Boot Seller':'Car';
}

// ── v2.5.8 BM-01/BM-02: เทรนด์ล็อกเฉลี่ย/วัน รายเดือน + ป้ายเตือนสาขาไหลลง ──
const BM_MIN_DAYS=7;   // เดือนที่มีข้อมูลน้อยกว่านี้ ไม่เอามาคิด "ตกต่อเนื่อง" (กันเดือนปัจจุบันเพิ่งเริ่ม)
const BM_ALERT_N=3;    // ตกติดกันกี่เดือน = ธงแดง "ไหลลงไม่หยุด"
const BM_DROP_PCT=3;   // ต้องลดเกินกี่ % ถึงนับว่า "ตก" (deadband) — กันกราฟที่ราบแล้วโดนนับเป็นไหลลง

// ล็อกเฉลี่ย/วัน รายเดือน — ตัดวันที่ยอด = 0 ออกก่อนเฉลี่ย (วันปิด/ไม่มีข้อมูล)
function bmMonthlyAvg(rows){
  const mon={};
  rows.forEach(r=>{
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
  const m=bmMonthlyAvg(bmAllRows(b));
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
  const zt=document.getElementById('bmZoneTag');
  if(zt) zt.textContent=bmZoneLabel(branches);
  // KPI cards
  const kpiRow=document.getElementById('bmKpiRow');
  if(kpiRow){
    kpiRow.innerHTML=branches.map(b=>{
      const d=getBranchMerged(b);
      if(!d.length) return `<div class="mom-card" style="border-color:${sc(BM_COLORS[b])}"><div class="mom-month" style="color:${sc(BM_COLORS[b])}">${BM_NAMES[b]}</div><div style="font-size:11px;color:var(--ink3)">${bmAllRows(b).length?'ไม่มีข้อมูลในช่วงที่เลือก':'ยังไม่มีข้อมูล'}</div></div>`;
      const days=d.length||1;
      const totalLock=d.reduce((s,r)=>s+getLock(r,'all'),0);
      const avgLock=(totalLock/days).toFixed(1);
      const totalRev=d.reduce((s,r)=>s+revST(r,'all',b)+revNon(r,'all',b),0); // PRICE-01: ใช้ราคาของสาขา b ไม่ใช่สาขาที่เปิดดูอยู่
      const fds=d.filter(r=>r.freeDay).length;
      const _canRev=canSeeRev(); // SET-01 + PERM-06: ด่านกลางใน utils.js
      return `<div class="mom-card" style="border-color:${sc(BM_COLORS[b])}">
        <div class="mom-month" style="color:${sc(BM_COLORS[b])};font-weight:700">${BM_NAMES[b]}</div>
        <div class="mom-val" style="color:${sc(BM_COLORS[b])}">${fmtN(avgLock,1)}</div>
        <div style="font-size:10px;color:var(--ink3)">ล็อกเฉลี่ย/วัน</div>
        <div style="font-size:10px;color:var(--ink2);margin-top:4px">รายรับรวม ${_canRev ? fmtN(totalRev)+' ฿' : '—'}</div>
        <div style="font-size:10px;color:var(--gold);margin-top:2px">วันฝน ${fds} วัน</div>
      </div>`;
    }).join('');
  }

  // ── BM-07: แท่งเทียบช่วงก่อนหน้า — สีตามสาขา · จาง = ช่วงก่อน · เข้ม = ช่วงนี้ ──
  const pr=bmPrevRange();
  const cur=branches.map(b=>bmAvgPerDay(getBranchMerged(b)));
  const prev=pr?branches.map(b=>bmAvgPerDay(bmAllRows(b).filter(r=>r.date>=pr.from&&r.date<=pr.to))):null;
  const fade=c=>c.replace(/,\s*[\d.]+\)$/,',.28)');
  const r1=v=>v==null?null:+v.toFixed(1);
  const chg=i=>prev&&prev[i]&&cur[i]!=null?(cur[i]-prev[i])/prev[i]*100:null;
  const sets=[];
  if(prev) sets.push({label:'ช่วงก่อนหน้า',data:prev.map(r1),backgroundColor:branches.map(b=>fade(BM_COLORS[b])),
    borderColor:branches.map(b=>BM_COLORS[b]),borderWidth:1,borderRadius:4,borderSkipped:'bottom',maxBarThickness:56});
  sets.push({label:'ช่วงนี้',data:cur.map(r1),backgroundColor:branches.map(b=>BM_COLORS[b]),borderRadius:4,borderSkipped:'bottom',maxBarThickness:56});
  // ป้ายบนแท่ง: ค่า + ▲▼% (สัญลักษณ์บอกทิศ ไม่พึ่งสีอย่างเดียว · ตัวหนังสือใช้สีหมึก ไม่ใช่สีสาขา)
  const cmpLbl={id:'bmCmpLbl',afterDatasetsDraw(ch){
    const{ctx}=ch;ctx.save();ctx.textAlign='center';ctx.textBaseline='bottom';
    ch.data.datasets.forEach((ds,di)=>{
      const isCur=di===ch.data.datasets.length-1;
      ch.getDatasetMeta(di).data.forEach((bar,i)=>{
        const v=ds.data[i]; if(v==null) return;
        ctx.font=isCur?'600 11px JetBrains Mono':'400 10px JetBrains Mono';
        ctx.fillStyle=isCur?chartClr().lbl:chartClr().tick;
        ctx.fillText(fmtN(v,1),bar.x,bar.y-(isCur&&chg(i)!=null?16:3));
        const p=isCur?chg(i):null;
        if(p!=null){ctx.font='700 11px Noto Sans Thai';ctx.fillStyle=chartClr().lbl;
          ctx.fillText(`${p>=0?'▲':'▼'} ${Math.abs(p).toFixed(1)}%`,bar.x,bar.y-3);}
      });
    });
    ctx.restore();}};
  dChart('cBmCmp');
  const cmpOpts=cOpts();
  charts.cBmCmp=makeChart('cBmCmp',{
    type:'bar',
    data:{labels:branches.map(b=>BM_NAMES[b]),datasets:sets},
    options:{...cmpOpts,layout:{padding:{top:34}},
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:t=>{
          const p=t.datasetIndex===sets.length-1?chg(t.dataIndex):null;
          return ` ${t.dataset.label}: ${t.raw==null?'ไม่มีข้อมูล':fmtN(t.raw,1)+' ล็อก/วัน'}${p!=null?` (${p>=0?'+':''}${p.toFixed(1)}%)`:''}`;}}}},
      scales:{x:{...cmpOpts.scales.x,grid:{display:false},ticks:{...cmpOpts.scales.x.ticks,color:chartClr().lbl,font:{family:'Noto Sans Thai',size:11}}},
        y:{...cmpOpts.scales.y,beginAtZero:true}}},
    plugins:[cmpLbl]
  });
  const note=document.getElementById('bmCmpNote');
  if(note) note.innerHTML=pr
    ? `ช่วงก่อนหน้า = ${fmtD(pr.from)} – ${fmtD(pr.to)} (แท่งจาง / จุดกลวง) · ช่วงที่เลือก = แท่งเข้ม / จุดทึบ · ▲▼ = เปลี่ยนจากช่วงก่อนหน้า · ใช้ <strong>เฉลี่ย/วัน</strong> · เปลี่ยนแบบกราฟได้ที่ไอคอนมุมขวา`
    : 'เลือก "ทั้งหมด" อยู่ — ไม่มีช่วงก่อนหน้าให้เทียบ · เลือก 7 วัน / 30 วัน / 3 เดือน / เดือน เพื่อดูการเปลี่ยนแปลง';

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
        <span style="color:var(--ink3);font-size:11px">(${t.lastLbl} เฉลี่ย ${fmtN(t.last,1)} ล็อก/วัน${peakTxt} · ดูทั้งประวัติ ไม่ตามช่วงเวลา)</span>
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
        const m=bmMonthlyAvg(getBranchMerged(b));
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

  // กราฟรายวัน — ตามช่วงเวลาที่เลือก (BM-06 · เดิมตายตัว 60 วันล่าสุด)
  // รวม unique dates จากทุกสาขา sort ตาม Date object จริง
  const dayMapRaw={};
  branches.forEach(b=>{
    getBranchMerged(b).forEach(r=>{
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



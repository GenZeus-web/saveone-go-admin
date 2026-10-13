// ============================================================
// views/util.js — UTIL-03: แท็บ 💧 น้ำ-ไฟ (สิทธิ์ showUtil · ยอดเงินบิล = showUtilMoney)
// ข้อมูล: data/{BR}_UTIL (เลขไมล์) + utilbill/{BR} (บิล) ผ่าน fetchUtilFromFirestore ใน auth.js
// คำนวณทั้งหมดใน js/util-calc.js — ไฟล์นี้แค่วาด
// ใช้ปุ่มสาขา + ช่วงเวลาของเมนูข้าง (applyPeriod) · ไม่ใช้ปุ่มโซน ST/Non (มิเตอร์ไม่ได้แยกโซน)
// ============================================================
const UT_TTL=5*60e3;          // อ่าน Firestore ซ้ำได้ทุก 5 นาที (Apps Script ส่งขึ้นทุก 10 นาที)
const UT={cache:{},loading:{},chartIds:[]};
// สีแท่งตามธง — ค่า rgb ชุดเดียวกับ SERIES_LIGHT ใน charts.js (โหมดสว่างแปลงให้เอง)
const UT_LEVEL={
  green:  {rgb:'61,214,140', icon:'✅',txt:'ปกติ'},
  yellow: {rgb:'240,165,0',  icon:'🟡',txt:'สูงกว่าปกติ'},
  red:    {rgb:'224,92,92',  icon:'🔴',txt:'สูงผิดปกติ'},
  leak:   {rgb:'167,139,250',icon:'🟣',txt:'สูงต่อเนื่อง · สงสัยรั่ว'},
  partial:{rgb:'140,148,170',icon:'⚪',txt:'ข้อมูลยังไม่ครบวัน'},
  nodata: {rgb:'140,148,170',icon:'⚪',txt:'ยังไม่มีฐานเทียบ'}
};
const UT_TYPE={water:'💧 น้ำ',elec:'⚡ ไฟ'};

function canSeeUtilMoney(){ return window.userPerms?.showUtilMoney===true; }
function utEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function utNum(v){ const n=Number(String(v==null?'':v).replace(/[,\s]/g,'')); return Number.isFinite(n)?n:null; }
function utFmt(n,dp=0){ return n==null?'—':n.toLocaleString('th-TH',{minimumFractionDigits:dp,maximumFractionDigits:dp}); }
function utDM(iso){ const [,m,d]=iso.split('-'); return `${+d}/${+m}`; }
function utWhen(ms){ return new Date(ms).toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}); }
function utAgo(ms){
  const h=(Date.now()-ms)/3600e3;
  return h<1?'ไม่ถึงชั่วโมง':h<48?`${Math.round(h)} ชม.ที่แล้ว`:`${Math.round(h/24)} วันที่แล้ว`;
}
function utCsv(csv){ return csv?Papa.parse(csv,{header:true,skipEmptyLines:true}).data:[]; }

async function utLoad(br){
  if(UT.loading[br]) return UT.loading[br];
  const money=canSeeUtilMoney();
  UT.loading[br]=(async()=>{
    try{
      const r=await window.fetchUtilFromFirestore(br,money);
      const readings=utCsv(r.csv), bills=utCsv(r.billsCsv);
      // มิเตอร์ที่เปิดอยู่ + มิเตอร์ที่ปิดแล้วแต่ยังมีข้อมูล (SS ปิดสาขา = active FALSE ทุกตัว แต่ต้องดูย้อนหลังได้)
      // ไม่มีเอกสาร data/{BR}_UTIL (สาขาที่ไม่เคยจดผ่านแอป) แต่มีบิล → สร้างการ์ดจากบิล
      const used=new Set([...readings,...bills].map(x=>x.meter_id));
      const meters=utCsv(r.metersCsv).filter(m=>utilTrue(m.active)||used.has(m.meter_id));
      bills.forEach(b=>{ if(!meters.some(m=>m.meter_id===b.meter_id))
        meters.push({meter_id:b.meter_id,branch_code:br,type:b.type,location:'',active:'FALSE'}); });
      if(r.billsErr) console.warn('UTIL-03 อ่านบิลไม่ได้:',r.billsErr);
      UT.cache[br]={at:Date.now(),money,ts:r.ts,readings,meters,bills,billsErr:r.billsErr};
    }catch(e){
      UT.cache[br]={at:Date.now(),money,err:e.code==='permission-denied'
        ?'ไม่มีสิทธิ์อ่านข้อมูลน้ำ-ไฟของสาขานี้ (เช็คสาขาที่ดูแล / สิทธิ์ยอดเงินบิล / Firestore Rules)'
        :(e.message||String(e))};
      console.error('UTIL-03 โหลดไม่ได้:',e);
    }finally{ delete UT.loading[br]; }
  })();
  return UT.loading[br];
}

function renderUtil(){
  const host=document.getElementById('utilBody'); if(!host) return;
  const br=activeBranch, c=UT.cache[br];
  // สิทธิ์ยอดเงินเปลี่ยน (admin แก้แล้ว login ใหม่) = โหลดใหม่ · ไม่งั้นใช้ของในเครื่องไม่เกิน 5 นาที
  if(!c||Date.now()-c.at>UT_TTL||c.money!==canSeeUtilMoney()){
    if(!c) host.innerHTML='<div class="ut-empty">กำลังโหลดข้อมูลน้ำ-ไฟ…</div>';
    utLoad(br).then(()=>{ if(view==='util'&&activeBranch===br) utDraw(host,br); });
    if(!c) return;
  }
  utDraw(host,br);
}

function utDraw(host,br){
  const c=UT.cache[br];
  UT.chartIds.forEach(dChart); UT.chartIds=[];
  if(c.err){ host.innerHTML=`<div class="ut-empty ut-err">${utEsc(c.err)}</div>`; return; }
  if(!c.meters.length){
    host.innerHTML='<div class="ut-empty">สาขานี้ยังไม่มีข้อมูลจดมิเตอร์ · แอปกรอกส่งขึ้นเว็บทุก 10 นาที</div>';
    return;
  }
  const now=Date.now(), S=utilSettings({},br), money=canSeeUtilMoney()&&!c.billsErr;
  const cards=c.meters.map((m,i)=>utCard(m,i,c,S,now,money)).join('');   // ต้องก่อน utSummary (ตั้ง m._res)
  const head=`<div class="ut-head">
      <div><b>💧⚡ น้ำ-ไฟ</b> <span class="ut-sub">ข้อมูล ณ ${c.ts?utWhen(c.ts):'—'} · ตลาดเปิด ${S.hours.default.open}–${S.hours.default.close} = 1 วันตลาด · แตะกราฟเพื่อขยาย</span></div>
      <div class="ut-legend">
        <span><i class="ut-ln base"></i>ปกติ (ค่ากลางวันเดียวกัน ${S.baseWeeks} สัปดาห์ก่อน)</span>
        <span><i class="ut-ln yel"></i>เส้นเหลือง</span><span><i class="ut-ln red"></i>เส้นแดง</span>
        <span class="ut-sub">แท่งเกินเส้น = ขึ้นธงสีนั้น · แท่งจาง = เฉลี่ยจากช่วงที่ขาดจด</span>
      </div></div>`;
  const warn=c.billsErr?'<div class="ut-anom" style="margin:-6px 0 12px">⚠️ อ่านบิลไม่ได้ ('+utEsc(c.billsErr)+') · แสดงเฉพาะเลขมิเตอร์</div>':'';
  host.innerHTML=head+warn+utSummary(c,money)+'<div class="ut-grid">'+cards+'</div>';
  UT.br=br;
  c.meters.forEach((m,i)=>{
    if(m._days.length) utMake('cUtil_'+i,utDailyCfg(m,m._days));
    else if(document.getElementById('cUtilBill_'+i)) utMake('cUtilBill_'+i,utBillCfg(m,c));
  });
}
function utMake(id,cfg){ if(cfg&&makeChart(id,cfg)) UT.chartIds.push(id); }

// ── แถบสรุปบนสุด (มุมผู้บริหาร) ──
//   ต้องดูตอนนี้ = มิเตอร์ที่เปิดอยู่ ธงล่าสุดแดง/สงสัยรั่ว หรือขาดจด · ทุกคนที่เห็นแท็บเห็น
//   บิลเดือนล่าสุด + น้ำ/ไฟ = เฉพาะสิทธิ์ยอดเงิน · % เทียบคิดเฉพาะมิเตอร์ที่มีบิลทั้งสองเดือน (บัญชีกรอกไม่ครบไม่ทำให้ % เพี้ยน)
function utSummary(c,money){
  const act=c.meters.filter(m=>utilTrue(m.active)), read=act.filter(m=>m._res.last);
  const watch=act.filter(m=>['red','leak'].includes(m._full?.level)||(m._res.stale&&m._res.last));
  const name=m=>(UT_TYPE[m.type]||'').split(' ')[0]+' '+utEsc(m.location||m.meter_id);
  // ยังไม่มีอะไรให้ตัดสิน ≠ ปกติ — สาขาปิด / ยังไม่เริ่มจด บอกตรงๆ ไม่ขึ้น ✅
  const [cls,val,sub]=!act.length?['','ปิดใช้แล้ว','ทุกมิเตอร์ปิดใช้ · ดูข้อมูลย้อนหลังได้']
    :watch.length?['red',watch.length+' มิเตอร์',watch.map(name).join(' · ')]
    :!read.length?['','ยังไม่เริ่มจด',`ยังไม่มีการจด (0/${act.length} มิเตอร์)`]
    :['green','✅ ปกติ',`มีการจดแล้ว ${read.length}/${act.length} มิเตอร์`];
  let h=`<div class="kpi ${cls}"><div class="kpi-lbl">ต้องดูตอนนี้</div><div class="kpi-val">${val}</div><div class="kpi-sub">${sub}</div></div>`;
  if(money&&c.bills.length){
    // เดือนล่าสุดแยกตามชนิด — บัญชีกรอกบิลน้ำกับไฟไม่พร้อมกัน · รวม = เดือนล่าสุดที่มีครบทั้งสองชนิด (ไม่งั้น "รวม" มีแต่น้ำ)
    const last=type=>c.bills.filter(b=>!type||b.type===type).map(b=>b.bill_month).sort().pop();
    const types=[...new Set(c.bills.map(b=>b.type))], Lall=types.map(last).sort()[0];
    const sum=(mo,type)=>{ const r={}; c.bills.forEach(b=>{ if(b.bill_month===mo&&(!type||b.type===type)) r[b.meter_id]=(r[b.meter_id]||0)+(utNum(b.amount_incl_vat)||0); }); return r; };
    const kpi=(lbl,type,cls)=>{
      const L=type?last(type):Lall; if(!L) return '';
      const P=utAddMonth(L,-1), Y=utAddMonth(L,-12);
      const cur=sum(L,type), ids=Object.keys(cur); if(!ids.length) return '';
      const tot=ids.reduce((s,k)=>s+cur[k],0);
      const vs=(mo,t)=>{ const o=sum(mo,type), both=ids.filter(k=>k in o); if(!both.length) return '';
        const a=both.reduce((s,k)=>s+cur[k],0), b=both.reduce((s,k)=>s+o[k],0); if(!b) return '';
        const p=(a-b)/b*100, part=both.length<ids.length?` <span class="ut-sub">(เทียบ ${both.length} มิเตอร์)</span>`:'';
        return `<span class="${p>0?'ut-up':'ut-down'}">${t} ${p>0?'▲':'▼'}${Math.abs(p).toFixed(0)}%</span>${part}`; };
      return `<div class="kpi ${cls}"><div class="kpi-lbl">${lbl} · บิล ${utMonthTh(L)}</div>
        <div class="kpi-val">฿${utFmt(tot)}</div>
        <div class="kpi-sub">${[vs(P,'เดือนก่อน'),vs(Y,'ปีก่อน')].filter(Boolean).join(' · ')||'ยังไม่มีบิลให้เทียบ'} · ${ids.length} มิเตอร์</div></div>`;
    };
    h+=(types.length>1?kpi('ค่าน้ำ-ไฟรวม','','gold'):'')+kpi('💧 ค่าน้ำ','water','blue')+kpi('⚡ ค่าไฟ','elec','orange');
  }
  return `<div class="kpi-row ut-kpis">${h}</div>`;
}

// การ์ด 1 มิเตอร์ · ผลวิเคราะห์เก็บไว้ที่ m._res / m._days / m._full ให้กราฟ + สรุป + หน้าขยายใช้ต่อ (ไม่คำนวณซ้ำ)
function utCard(m,i,c,S,now,money){
  const meter={meter_id:m.meter_id,type:m.type,branch_code:m.branch_code};
  const res=utilAnalyze(c.readings,meter,{},now);
  const days=applyPeriod(res.days.map(d=>({date:new Date(d.date+'T00:00:00'),d}))).map(x=>x.d);
  const full=[...res.days].reverse().find(d=>d.cover>=0.999);
  m._res=res; m._days=days; m._full=full; m._th=S.thresholds[m.type]||S.thresholds.water;
  const lv=UT_LEVEL[full?.level]||UT_LEVEL.nodata;
  const cnt=k=>days.filter(d=>d.level===k).length;
  const flags=[['leak','สงสัยรั่ว'],['red','แดง'],['yellow','เหลือง']].filter(([k])=>cnt(k))
    .map(([k,t])=>`<span class="ut-chip ${k}">${t} ${cnt(k)} วัน</span>`).join('');
  const closed=res.closed.filter(x=>x.level).pop();
  const anoms=res.anomalies.filter(a=>!days.length||a.t>=Date.parse(days[0].date)).slice(-3).map(a=>
    a.kind==='backward'?`เลขถอยหลัง ${utFmt(a.from)} → ${utFmt(a.to)} (${utWhen(a.t)}) · ไม่นับแถวนี้`
                       :`เปลี่ยนมิเตอร์ (${utWhen(a.t)}) · เลขใหม่เป็นจุดตั้งต้น`);
  const hasBills=money&&c.bills.some(b=>b.meter_id===m.meter_id);
  // กล่องกราฟ: มีวันในช่วง = กราฟรายวัน · ไม่เคยจดแต่มีบิล = กราฟบิลรายเดือนแทน · ไม่งั้นบอกเหตุผล + ทางไปต่อ
  let chart;
  if(days.length) chart=`<div class="ut-chart ut-zoom" onclick="utOpen(${i})"><canvas id="cUtil_${i}"></canvas></div>`;
  else if(!res.last&&hasBills) chart=`<div class="ut-chart ut-zoom" onclick="utOpen(${i})"><canvas id="cUtilBill_${i}"></canvas></div>
    <div class="ut-sub" style="margin-top:4px">ยังไม่มีการจดมิเตอร์นี้ · แสดงยอดบิลรายเดือนแทน</div>`;
  else if(!res.last) chart=`<div class="ut-empty">ยังไม่มีการจดมิเตอร์นี้${utilTrue(m.active)?'<br>จดผ่านแอปกรอก 2 ครั้งขึ้นไป แล้วกราฟจะขึ้นเองภายใน 10 นาที':''}</div>`;
  else chart=`<div class="ut-empty">ไม่มีการจดในช่วงเวลาที่เลือก · จดล่าสุด ${utWhen(res.last)}<br>
    <button class="mc-pill" style="margin-top:8px" onclick="setPeriod(0,document.getElementById('p0'))">ดูทั้งหมด</button></div>`;
  return `<div class="sc ut-card lv-${full?.level||'nodata'}">
    <div class="ut-top">
      <div style="flex:1;min-width:0"><div class="ut-name">${UT_TYPE[m.type]||utEsc(m.type)} · ${utEsc(m.location||m.meter_id)}</div>
        <div class="ut-sub">${utEsc(m.meter_id)}${utilTrue(m.active)?'':' · ปิดใช้แล้ว (ดูย้อนหลัง)'}</div></div>
      <div class="ut-badge">${lv.icon} ${lv.txt}</div>
      ${days.length||hasBills?`<button type="button" class="ut-zbtn" onclick="utOpen(${i})" title="ขยาย" aria-label="ขยายกราฟ">⤢</button>`:''}
    </div>
    <div class="ut-meta">
      ${res.last?`<span>จดล่าสุด ${utWhen(res.last)} · ${utAgo(res.last)}</span>`:''}
      ${res.stale&&res.last&&utilTrue(m.active)?`<span class="ut-warn">⚠️ ไม่มีการจดเกิน ${S.staleDays} วัน</span>`:''}
      ${full?`<span>วันตลาด ${utDM(full.date)} ใช้ <b>${utFmt(full.units,1)}</b> หน่วย${full.base!=null?` · ปกติ ~${utFmt(full.base,1)}`:''}</span>`:''}
      ${closed?`<span>ช่วงตลาดปิดล่าสุด ${utFmt(closed.rate,2)} หน่วย/ชม. ${closed.level==='red'?'🔴 เกินเกณฑ์ (น้ำไหลตอนไม่มีคน)':'✅'}</span>`:''}
    </div>
    ${flags?`<div class="ut-flags">ในช่วงที่เลือก: ${flags}</div>`:''}
    ${chart}
    ${anoms.length?`<div class="ut-anom">${anoms.map(a=>'⚠️ '+utEsc(a)).join('<br>')}</div>`:''}
    ${hasBills?utBills(m,c,res,6):''}
  </div>`;
}

// ── กราฟรายวัน: แท่งสีตามธง + เส้นปกติ/เหลือง/แดง · _ct ส่งข้อมูลดิบให้แบบอื่น (chart-types.js ตัดทิ้งก่อนวาด) ──
function utDailyCfg(m,days,big){
  const bands=days.map(d=>utilBands(d,m._th));
  const fill=d=>`rgba(${(UT_LEVEL[d.level]||UT_LEVEL.nodata).rgb},${d.est?0.4:0.85})`;
  const line=(label,key,color,dash)=>({type:'line',label,data:bands.map(b=>b[key]),borderColor:color,borderWidth:1.5,
    borderDash:dash,pointRadius:0,stepped:'middle',spanGaps:false,fill:false,order:1});
  const o=cOpts();
  o.plugins.legend={display:!!big,labels:o.plugins.legend.labels};
  o.plugins.tooltip={callbacks:{
    title:it=>'วันตลาด '+it[0].label,
    afterBody:it=>{
      const d=days[it[0].dataIndex], lv=UT_LEVEL[d.level]||UT_LEVEL.nodata;
      return [lv.icon+' '+lv.txt+(d.est?' · เฉลี่ยจากช่วงขาดจด':'')+(d.baseFrom==='setting'?' · ฐานจากค่าตั้ง':'')];
    }}};
  o.scales.y.beginAtZero=true;
  if(big) o.scales.x.ticks.maxTicksLimit=24;
  return {type:'bar',data:{labels:days.map(d=>utDM(d.date)),datasets:[
    {type:'bar',label:'ใช้ (หน่วย)',data:days.map(d=>+d.units.toFixed(2)),backgroundColor:days.map(fill),borderRadius:3,order:2},
    line('ปกติ','base',chartClr().lbl,[4,4]),
    line('เส้นเหลือง','yellow','rgba(240,165,0,.9)',[6,3]),
    line('เส้นแดง','red','rgba(224,92,92,.95)',[])
  ]},options:o,_ct:{days,bands}};
}

// ── บิลรายเดือน 12 เดือนล่าสุด เทียบเดือนเดียวกันปีก่อน ──
const UT_TH_MON=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function utAddMonth(ym,k){ const [y,m]=ym.split('-').map(Number), n=y*12+m-1+k; return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`; }
function utMonthTh(ym){ const [y,m]=ym.split('-').map(Number); return `${UT_TH_MON[m-1]} ${String(y+543).slice(2)}`; }
function utBillSeries(m,c){
  const by={}; c.bills.filter(b=>b.meter_id===m.meter_id).forEach(b=>{
    const o=by[b.bill_month]||(by[b.bill_month]={amt:0,units:0});
    o.amt+=utNum(b.amount_incl_vat)||0; o.units+=utNum(b.units)||0; });
  const L=Object.keys(by).sort().pop(); if(!L) return null;
  const months=[...Array(12)].map((_,k)=>utAddMonth(L,k-11));
  const pick=(mo,f)=>by[mo]?f(by[mo]):null;
  const ser=f=>({cur:months.map(mo=>pick(mo,f)),prev:months.map(mo=>pick(utAddMonth(mo,-12),f))});
  return {labels:months.map(utMonthTh),amt:ser(o=>o.amt),units:ser(o=>o.units||null),rate:ser(o=>o.units?o.amt/o.units:null)};
}
function utBillCfg(m,c,big){
  const s=utBillSeries(m,c); if(!s) return null;
  const o=cOpts();
  o.plugins.legend={display:true,labels:o.plugins.legend.labels};
  o.plugins.tooltip={callbacks:{label:it=>`${it.dataset.label}: ${it.raw==null?'—':utFmt(it.raw,2)}`}};
  o.scales.y.beginAtZero=true; o.scales.y.ticks.callback=v=>'฿'+utFmt(v);
  return {type:'bar',data:{labels:s.labels,datasets:[
    {type:'bar',label:'ยอดบิล (ปีนี้)',data:s.amt.cur,backgroundColor:'rgba(240,165,0,.75)',borderRadius:3,order:2},
    {type:'line',label:'เดือนเดียวกันปีก่อน',data:s.amt.prev,borderColor:'rgba(74,158,255,.9)',backgroundColor:'rgba(74,158,255,.9)',
     borderWidth:2,pointRadius:big?3:2,spanGaps:false,fill:false,order:1}
  ]},options:o,_ct:s};
}

// ── แบบกราฟให้เลือก (CHT-04 ปุ่มมุมการ์ด) · ทุกการ์ดใช้ค่าเดียวกัน (cUtil_0 · cUtil_1 · cUtil_big → คีย์ cUtil) ──
CT_SPEC.cUtil={icon:'combo',opts:[['orig','แท่ง+เส้นเกณฑ์','สีตามธง · เส้นปกติ/เหลือง/แดง'],['line','เส้น','แนวโน้ม · จุดสีตามธง'],
  ['pct','% ของปกติ','ปกติ = 100% · เทียบมิเตอร์ต่างขนาดกันได้'],['cum','สะสม','ใช้ไปรวมเท่าไหร่ในช่วงที่เลือก']]};
CT_SPEC.cUtilBill={icon:'bar',opts:[['orig','แท่ง เทียบปีก่อน','ยอดเงินรายเดือน'],['line','เส้น 2 ปี','แนวโน้มทั้งปี'],
  ['units','หน่วยตามบิล','ใช้มากขึ้น หรือแค่ราคาขึ้น'],['rate','บาท/หน่วย','ราคาต่อหน่วยเปลี่ยนไหม']]};
const utWith=(cfg,datasets,y)=>({...cfg,data:{labels:cfg.data.labels,datasets},
  options:{...cfg.options,scales:{...cfg.options.scales,y:{...cfg.options.scales.y,...(y||{})}}}});
CT_ALT.cUtil={
  line(cfg){
    const b=cfg.data.datasets[0];
    return utWith({...cfg,type:'line'},[{type:'line',label:b.label,data:b.data,borderColor:chartClr().lbl,borderWidth:1.5,tension:.25,
      pointRadius:3,pointBackgroundColor:b.backgroundColor,pointBorderColor:b.backgroundColor,order:2},...cfg.data.datasets.slice(1)]);
  },
  pct(cfg,{days,bands}){
    const p=(v,i)=>bands[i].base?v/bands[i].base*100:null, ds=cfg.data.datasets;
    return utWith(cfg,[{...ds[0],label:'% ของปกติ',data:days.map((d,i)=>p(d.units,i))},
      {...ds[1],data:bands.map(b=>b.base?100:null)},{...ds[2],data:bands.map((b,i)=>p(b.yellow,i))},{...ds[3],data:bands.map((b,i)=>p(b.red,i))}],
      {ticks:{...cfg.options.scales.y.ticks,callback:v=>v+'%'}});
  },
  cum(cfg,{days}){
    let s=0; const data=days.map(d=>+(s+=d.units).toFixed(1));
    return utWith({...cfg,type:'line'},[{type:'line',label:'ใช้สะสม (หน่วย)',data,borderColor:'rgba(74,158,255,.9)',
      backgroundColor:'rgba(74,158,255,.15)',fill:true,pointRadius:0,borderWidth:2}]);
  }
};
CT_ALT.cUtilBill={
  line(cfg){ const [a,b]=cfg.data.datasets;
    return utWith({...cfg,type:'line'},[{type:'line',label:a.label,data:a.data,borderColor:a.backgroundColor,backgroundColor:a.backgroundColor,
      borderWidth:2,pointRadius:3,spanGaps:false},{...b}]); },
  units(cfg,s){ const [a,b]=cfg.data.datasets;
    return utWith(cfg,[{...a,label:'หน่วยตามบิล (ปีนี้)',data:s.units.cur},{...b,data:s.units.prev}],
      {ticks:{...cfg.options.scales.y.ticks,callback:v=>utFmt(v)}}); },
  rate(cfg,s){ const [a,b]=cfg.data.datasets;
    return utWith({...cfg,type:'line'},[{type:'line',label:'บาท/หน่วย (ปีนี้)',data:s.rate.cur,borderColor:a.backgroundColor,
      backgroundColor:a.backgroundColor,borderWidth:2,pointRadius:3,spanGaps:false},{...b,data:s.rate.prev}],
      {beginAtZero:false,ticks:{...cfg.options.scales.y.ticks,callback:v=>'฿'+utFmt(v,2)}}); }
};

// ── หน้าขยาย: กราฟรายวันใหญ่ + บิลรายเดือนเทียบปีก่อน + ตารางบิลทั้งหมด ──
function utOpen(i){
  const c=UT.cache[UT.br], m=c&&c.meters[i]; if(!m) return;
  let box=document.getElementById('utModal');
  if(!box){
    box=document.createElement('div'); box.id='utModal'; box.className='ut-modal';
    box.addEventListener('click',e=>{ if(e.target===box) utClose(); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&box.style.display==='flex') utClose(); });
    document.body.appendChild(box);
  }
  const money=canSeeUtilMoney()&&!c.billsErr, hasBills=money&&c.bills.some(b=>b.meter_id===m.meter_id);
  const lv=UT_LEVEL[m._full?.level]||UT_LEVEL.nodata;
  box.innerHTML=`<div class="ut-mcard" role="dialog" aria-modal="true" aria-label="${utEsc(m.location||m.meter_id)}">
    <div class="ut-top"><div style="flex:1;min-width:0"><div class="ut-name">${UT_TYPE[m.type]||''} · ${utEsc(m.location||m.meter_id)} <span class="ut-sub">${utEsc(m.meter_id)}</span></div>
      <div class="ut-sub">${lv.icon} ${lv.txt}${m._res.last?' · จดล่าสุด '+utWhen(m._res.last):''}</div></div>
      <button type="button" class="day-x" onclick="utClose()" aria-label="ปิด">✕</button></div>
    ${m._days.length?`<div class="sc ut-msec"><div class="ut-top"><div class="sc-title" style="flex:1;margin:0">ใช้ต่อวันตลาด · ${m._days.length} วัน (ตามช่วงเวลาในเมนูข้าง)</div></div>
      <div class="ut-chart-big"><canvas id="cUtil_big"></canvas></div></div>`:''}
    ${hasBills?`<div class="sc ut-msec"><div class="ut-top"><div class="sc-title" style="flex:1;margin:0">บิลรายเดือน 12 เดือนล่าสุด เทียบเดือนเดียวกันปีก่อน</div></div>
      <div class="ut-chart-mid"><canvas id="cUtilBill_big"></canvas></div>${utBills(m,c,m._res,0)}</div>`:''}
  </div>`;
  box.style.display='flex'; document.body.style.overflow='hidden';
  // ไม่เข้า UT.chartIds — แท็บวาดใหม่ (รีเฟรช 5 นาที) ระหว่างเปิดอยู่ต้องไม่ลบกราฟในหน้าขยาย
  if(m._days.length) makeChart('cUtil_big',utDailyCfg(m,m._days,true));
  if(hasBills) makeChart('cUtilBill_big',utBillCfg(m,c,true));
}
function utClose(){
  const box=document.getElementById('utModal'); if(!box) return;
  ['cUtil_big','cUtilBill_big'].forEach(dChart);
  box.style.display='none'; box.innerHTML=''; document.body.style.overflow='';
}

// บิลของมิเตอร์นี้ (n = กี่ใบล่าสุด · 0 = ทั้งหมด) · เทียบหน่วยที่จดได้ในเดือนที่ใช้จริง (bill_month เลื่อนตาม billMonthOffset)
function utBills(m,c,res,n){
  let rows=c.bills.filter(b=>b.meter_id===m.meter_id).sort((a,b)=>a.bill_month<b.bill_month?1:-1);
  if(n) rows=rows.slice(0,n);
  if(!rows.length) return '';
  const tr=rows.map(b=>{
    const units=utNum(b.units), amt=utNum(b.amount_incl_vat), use=utilBillUsageMonth(b.bill_month);
    const md=res.days.filter(d=>d.date.startsWith(use)), got=md.reduce((s,d)=>s+d.units,0);
    const [y,mm]=use.split('-').map(Number), nDays=new Date(y,mm,0).getDate(), cov=md.reduce((s,d)=>s+d.cover,0);
    const meas=md.length?`${utFmt(got,0)}${cov<nDays-0.5?` <span class="ut-sub">(${Math.round(cov)}/${nDays} วัน)</span>`:''}`:'—';
    return `<tr><td>${utEsc(b.bill_month)}</td><td class="n">${utFmt(units)}</td><td class="n">${utFmt(amt,2)}</td>
      <td class="n">${units&&amt!=null?utFmt(amt/units,2):'—'}</td><td class="n">${meas}</td></tr>`;
  }).join('');
  return `<div class="ut-bills${n?'':' ut-bills-all'}"><table>
    <thead><tr><th>เดือนในบิล</th><th>หน่วยบิล</th><th>ยอดเงิน (รวม VAT)</th><th>บาท/หน่วย</th><th>จดได้ (เดือนก่อนบิล)</th></tr></thead>
    <tbody>${tr}</tbody></table></div>`;
}

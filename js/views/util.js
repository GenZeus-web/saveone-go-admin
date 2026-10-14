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
      // UTIL-09 ตรวจบิล: ทำครั้งเดียวตอนโหลด · chk[meter@เดือน] ให้กราฟ/ตาราง/การ์ดเปิดดูเร็ว
      const check=utilBillCheck(bills.map(x=>({bill_month:x.bill_month,branch_code:br,type:x.type,meter_id:x.meter_id,
        units:utNum(x.units),amount:utNum(x.amount_incl_vat)})));
      const chk={}; check.forEach(x=>{ if(x.high||x.dup||x.round) chk[x.meter_id+'@'+x.bill_month]=x; });
      UT.cache[br]={at:Date.now(),money,ts:r.ts,readings,meters,bills,billsErr:r.billsErr,check,chk};
    }catch(e){
      UT.cache[br]={at:Date.now(),money,err:e.code==='permission-denied'
        ?'ไม่มีสิทธิ์อ่านข้อมูลน้ำ-ไฟของสาขานี้ (เช็คสาขาที่ดูแล / สิทธิ์ยอดเงินบิล / Firestore Rules)'
        :(e.message||String(e))};
      console.error('UTIL-03 โหลดไม่ได้:',e);
    }finally{ delete UT.loading[br]; }
  })();
  return UT.loading[br];
}

// สาขาที่ต้องโหลด = สาขาที่เปิดดู (มิเตอร์รายวัน) + สาขาที่เลือกเทียบบิล (ต้องมีสิทธิ์ยอดเงิน)
function renderUtil(){
  const host=document.getElementById('utilBody'); if(!host) return;
  const br=activeBranch, money=canSeeUtilMoney();
  const need=[...new Set([br,...(money?utCmpBranches():[])])];
  // สิทธิ์ยอดเงินเปลี่ยน (admin แก้แล้ว login ใหม่) = โหลดใหม่ · ไม่งั้นใช้ของในเครื่องไม่เกิน 5 นาที
  const stale=need.filter(b=>{ const c=UT.cache[b]; return !c||Date.now()-c.at>UT_TTL||c.money!==money; });
  if(stale.length){
    if(!UT.cache[br]) host.innerHTML='<div class="ut-empty">กำลังโหลดข้อมูลน้ำ-ไฟ…</div>';
    Promise.all(stale.map(utLoad)).then(()=>{ if(view==='util'&&activeBranch===br) utDraw(host,br); });
    if(!UT.cache[br]) return;
  }
  utDraw(host,br);
}

function utDraw(host,br){
  const c=UT.cache[br];
  UT.chartIds.forEach(dChart); UT.chartIds=[];
  UT.br=br;   // ต้องตั้งก่อนสร้างการ์ด (utSummary/utBills อ่านธงบิลของสาขานี้)
  const money=canSeeUtilMoney();
  // แท็บย่อย: 📊 เทียบสาขา (บิลรายเดือน · แบบที่ ผอ. ส่งมา · หน้าหลัก) | 📟 มิเตอร์รายวัน (ตรวจรั่ว)
  //   ไม่มีสิทธิ์ยอดเงิน = เทียบสาขาอ่านบิลไม่ได้ → เหลือมิเตอร์รายวันอย่างเดียว ไม่มีแถบแท็บย่อย
  const sub=money?utSub():'meter';
  UT.shown=sub;   // แท็บย่อยที่แสดงจริง (ไม่มีสิทธิ์เงิน = meter แม้จำ cmp ไว้) — utVals ใช้ตัวนี้
  const bar=utToolbar(money,sub);
  if(sub==='cmp'){
    host.innerHTML=bar+utCompareHtml();
    UT.br=br; utCompareCharts();
    return;
  }
  let meters;
  if(c.err) meters=`<div class="ut-empty ut-err">${utEsc(c.err)}</div>`;
  else if(!c.meters.length) meters='<div class="ut-empty">สาขานี้ยังไม่มีข้อมูลจดมิเตอร์ · แอปกรอกส่งขึ้นเว็บทุก 10 นาที</div>';
  else{
    const now=Date.now(), S=utilSettings({},br), bm=money&&!c.billsErr;
    const cards=c.meters.map((m,i)=>utCard(m,i,c,S,now,bm)).join('');   // ต้องก่อน utSummary (ตั้ง m._res)
    meters=`<div class="ut-head">
        <div class="ut-sub">ข้อมูล ณ ${c.ts?utWhen(c.ts):'—'} · ตลาดเปิด ${S.hours.default.open}–${S.hours.default.close} = 1 วันตลาด · แตะกราฟเพื่อขยาย</div>
        <div class="ut-legend">
          <span><i class="ut-ln base"></i>ปกติ (ค่ากลางวันเดียวกัน ${S.baseWeeks} สัปดาห์ก่อน)</span>
          <span><i class="ut-ln yel"></i>เส้นเหลือง</span><span><i class="ut-ln red"></i>เส้นแดง</span>
          <span class="ut-sub">แท่งเกินเส้น = ขึ้นธงสีนั้น · แท่งจาง = เฉลี่ยจากช่วงที่ขาดจด</span>
        </div></div>`
      +(c.billsErr?'<div class="ut-anom" style="margin:-6px 0 12px">⚠️ อ่านบิลไม่ได้ ('+utEsc(c.billsErr)+') · แสดงเฉพาะเลขมิเตอร์</div>':'')
      +utSummary(c)+'<div class="ut-grid">'+cards+'</div>';
  }
  host.innerHTML=bar+`<div class="ut-sec-t">📟 มิเตอร์รายวัน — ตรวจรั่ว · ${utEsc(BM_NAMES[br]||br)}
      <span class="ut-sub">(เปลี่ยนสาขาที่เมนูข้าง)</span></div>`+meters;
  UT.br=br;
  if(!c.err) c.meters.forEach((m,i)=>{
    if(document.getElementById('cUtil_'+i)) utMake('cUtil_'+i,utDailyCfg(m,m._days));
    else if(document.getElementById('cUtilBill_'+i)) utMake('cUtilBill_'+i,utBillCfg(m,c));
  });
}
// แท็บย่อยที่เลือก จำในเครื่อง (ค่าตั้งต้น = เทียบสาขา) · localStorage อาจใช้ไม่ได้ (โหมดส่วนตัว) → ค่าตั้งต้น
function utSub(){ if(!UT.sub){ try{ UT.sub=localStorage.getItem('utSub'); }catch(e){} if(UT.sub!=='meter') UT.sub='cmp'; } return UT.sub; }
function setUtSub(k){ UT.sub=k; try{ localStorage.setItem('utSub',k); }catch(e){} renderUtil(); }
// ตัวเลขบนแท่ง/จุด (ใช้ plugin bmVals ของ Benchmark) · จำในเครื่อง แยกตามแท็บย่อย และแยกจาก Benchmark
//   เทียบสาขา = เปิดเป็นค่าเริ่มต้น (เจ้าของสั่ง · กราฟรายเดือนแท่งน้อย อ่านตัวเลขได้) · มิเตอร์รายวัน = ซ่อน (90 แท่ง รก)
const UT_VALS_KEY={cmp:['utValsCmp',true],meter:['utValsMeter',false]};
function utVals(){
  const k=UT.shown==='cmp'?'cmp':'meter', [key,def]=UT_VALS_KEY[k];
  UT.vals=UT.vals||{};
  if(UT.vals[k]==null){ let v=null; try{ v=localStorage.getItem(key); }catch(e){} UT.vals[k]=v==null?def:v==='1'; }
  return UT.vals[k];
}
function toggleUtVals(){
  const k=UT.shown==='cmp'?'cmp':'meter', v=!utVals();
  UT.vals[k]=v; try{ localStorage.setItem(UT_VALS_KEY[k][0],v?'1':'0'); }catch(e){} renderUtil();
}
// only = index ของ dataset ที่จะใส่ตัวเลข (ไม่ส่ง = ทุกตัว) · เปิดแล้วเว้นที่ด้านบนแกน Y ให้ป้ายไม่ชนขอบ
function utValOpts(o,only){
  o.plugins.bmVals={on:utVals(),only};
  if(utVals()) o.scales.y.afterDataLimits=s=>{ s.max+=(s.max-s.min)*0.14; };
  return o;
}
function utToolbar(money,sub){
  const tabs=money?[['cmp','📊 เทียบสาขา (บิลรายเดือน)'],['meter','📟 มิเตอร์รายวัน · ตรวจรั่ว']]
    .map(([k,t])=>`<button class="mc-pill${sub===k?' sel':''}" role="tab" aria-selected="${sub===k}" onclick="setUtSub('${k}')">${t}</button>`).join(''):'';
  const cv=money&&sub==='meter'?`<span class="ut-sep"></span>${[['day','📈 กราฟรายวัน'],['bill','🧾 กราฟบิลรายเดือน']]
    .map(([k,t])=>`<button class="mc-pill${utCardView()===k?' sel':''}" onclick="setUtCardView('${k}')">${t}</button>`).join('')}`:'';
  return `<div class="ut-subtabs"><div class="ut-subtabs-l" role="tablist">${tabs}${cv}</div>
    <button class="mc-pill" onclick="toggleUtVals()" aria-pressed="${utVals()}">🔢 ${utVals()?'ซ่อนตัวเลข':'แสดงตัวเลข'}</button></div>`;
}
// กราฟในการ์ดมิเตอร์: รายวัน (ตั้งต้น) หรือบิลรายเดือน — ทุกการ์ดเหมือนกัน (เดิมการ์ดที่ไม่เคยจดเห็นบิล ที่จดแล้วเห็นรายวัน)
//   มิเตอร์ที่ยังไม่มีข้อมูลรายวัน แสดงบิลเสมอ · เริ่มจดผ่านแอป 2 ครั้ง = เปลี่ยนเป็นรายวันเอง
function utCardView(){ if(!UT.cardView){ try{ UT.cardView=localStorage.getItem('utCardView'); }catch(e){} if(UT.cardView!=='bill') UT.cardView='day'; } return UT.cardView; }
function setUtCardView(v){ UT.cardView=v; try{ localStorage.setItem('utCardView',v); }catch(e){} renderUtil(); }
// บาท/หน่วยของวันตลาด = บิลที่ครอบเดือนนั้น (บิลเดือน M = ใช้จริง M-1 ตาม billMonthOffset)
//   ไม่มีบิลเดือนนั้น (ยังไม่ออก) = ใช้บิลล่าสุดก่อนหน้า แล้วติดป้าย "ประมาณ"
function utDayRates(m,c,days){
  if(!canSeeUtilMoney()||!c||c.billsErr) return null;
  const by={}; c.bills.filter(b=>b.meter_id===m.meter_id).forEach(b=>{ const u=utNum(b.units), a=utNum(b.amount_incl_vat); if(u>0&&a!=null) by[b.bill_month]=a/u; });
  const ks=Object.keys(by).sort(); if(!ks.length) return null;
  return days.map(d=>{
    const mo=utAddMonth(d.date.slice(0,7),-UTIL_DEFAULTS.billMonthOffset);
    if(by[mo]!=null) return {rate:by[mo],mo,est:false};
    const k=[...ks].reverse().find(x=>x<=mo)||ks[0];
    return {rate:by[k],mo:k,est:true};
  });
}
function utMake(id,cfg){ if(cfg&&makeChart(id,cfg)) UT.chartIds.push(id); }

// ── ส่วน 1–2: เทียบสาขาจากบิลรายเดือน (ต้นแบบจาก ผอ.) ──
//   12 เดือนล่าสุด · ค่าเฉลี่ย/ตารางสรุปคิดเฉพาะ "ช่วงที่ทับกัน" (ทุกสาขาที่เลือกมีบิลชนิดนั้นครบเดือน) ให้เทียบกันได้จริง
//   สาขาที่เทียบได้ = admin ทุกสาขา · คนอื่น = สาขาที่ดูแล (กฎ utilbill/ เปิดแค่นั้น)
const UT_ALL_BR=['BG','BN','SS'];
function utCmpReadable(){ return window.userRole==='admin'?UT_ALL_BR:UT_ALL_BR.filter(b=>(window.userBranches||[]).includes(b)); }
function utCmpBranches(){
  const ok=utCmpReadable();
  if(!UT.cmpSel){ const open=ok.filter(b=>b!=='SS'); UT.cmpSel=new Set(open.length?open:ok); }   // ตั้งต้น = สาขาที่ยังเปิด
  return ok.filter(b=>UT.cmpSel.has(b));
}
function toggleUtCmp(b){
  utCmpBranches();
  if(UT.cmpSel.has(b)){ if(UT.cmpSel.size>1) UT.cmpSel.delete(b); } else UT.cmpSel.add(b);
  renderUtil();
}
const UT_SECS=[['elec','⚡','ไฟฟ้า','ค่าไฟ','kWh'],['water','💧','ประปา','ค่าน้ำ','ลบ.ม.']];
// ข้อมูลส่วนหนึ่ง: บิลรวมทุกมิเตอร์ของชนิดนั้น ต่อสาขา ต่อเดือน
function utCmpData(type){
  const brs=utCmpBranches().filter(b=>UT.cache[b]&&!UT.cache[b].err&&!UT.cache[b].billsErr);
  const by={};
  brs.forEach(b=>{ by[b]={}; UT.cache[b].bills.filter(x=>x.type===type).forEach(x=>{
    const o=by[b][x.bill_month]||(by[b][x.bill_month]={units:0,amt:0});
    o.units+=utNum(x.units)||0; o.amt+=utNum(x.amount_incl_vat)||0; }); });
  const has=brs.filter(b=>Object.keys(by[b]).length);
  if(!has.length) return null;
  // เดือนบิลทั้งหมดที่มี (เติมเดือนที่ขาดให้แกนต่อเนื่อง) → ตัดตามช่วงเวลาในเมนูข้าง
  const ks=has.flatMap(b=>Object.keys(by[b])).sort(), all=[];
  for(let mo=ks[0];mo<=ks[ks.length-1];mo=utAddMonth(mo,1)) all.push(mo);
  const months=utRangeMonths(all), L=ks[ks.length-1];
  // เทียบเฉพาะสาขาที่มีบิลในช่วงนี้ (สาขาที่ยังไม่เปิด/ปิดไปแล้ว ไม่ทำให้ "ช่วงที่ทับกัน" หายหมด)
  const hasW=has.filter(b=>months.some(mo=>by[b][mo]));
  if(!hasW.length) return {type,has:hasW,by,months:[],overlap:[],stat:[],last:L};
  const overlap=months.filter(mo=>hasW.every(b=>by[b][mo]));
  const stat=hasW.map(b=>{
    const ms=overlap.length?overlap:months.filter(mo=>by[b][mo]);
    const u=ms.reduce((s,mo)=>s+by[b][mo].units,0), a=ms.reduce((s,mo)=>s+by[b][mo].amt,0);
    const inWin=months.filter(mo=>by[b][mo]);
    return {b,n:ms.length,units:u,amt:a,avgU:ms.length?u/ms.length:null,avgA:ms.length?a/ms.length:null,rate:u?a/u:null,
            from:inWin[0],to:inWin[inWin.length-1]};
  });
  return {type,has:hasW,by,months,overlap,stat,last:L};
}
// ช่วงเปรียบเทียบ = เดือนล้วน (บิลออกเดือนละใบ) · แท็บนี้ไม่ใช้ปุ่มช่วงเวลาในเมนูข้าง (7 วัน = บิลทั้งเดือน ชวนงง) — เจ้าของเลือก 13 ต.ค.
//   n เดือน = n เดือนบิลล่าสุดของชนิดนั้น (บิลน้ำกับไฟออกไม่พร้อมกัน) · จาก–ถึง = ช่วงเดียวกันทั้งสองส่วน
function utRange(){
  if(!UT.range){ let r=null; try{ r=JSON.parse(localStorage.getItem('utCmpRange')||'null'); }catch(e){}
    UT.range=r&&(['3','6','12','all'].includes(r.p)||(r.p==='custom'&&r.from&&r.to))?r:{p:'12'}; }
  return UT.range;
}
function setUtRange(p,from,to){
  UT.range=p==='custom'?{p,from,to}:{p};
  try{ localStorage.setItem('utCmpRange',JSON.stringify(UT.range)); }catch(e){}
  renderUtil();
}
function utRangeMonths(all){
  const r=utRange();
  if(r.p==='all') return all;
  if(r.p==='custom'){ const [f,t]=r.from<=r.to?[r.from,r.to]:[r.to,r.from]; return all.filter(mo=>mo>=f&&mo<=t); }
  return all.slice(-Number(r.p));
}
function utRangeHtml(){
  const r=utRange(), brs=utCmpBranches().filter(b=>UT.cache[b]&&UT.cache[b].bills);
  const ms=[...new Set(brs.flatMap(b=>UT.cache[b].bills.map(x=>x.bill_month)))].sort();
  if(!ms.length) return '';
  const from=r.p==='custom'?r.from:ms[Math.max(0,r.p==='all'?0:ms.length-Number(r.p))], to=r.p==='custom'?r.to:ms[ms.length-1];
  const opt=v=>ms.map(mo=>`<option value="${mo}"${mo===v?' selected':''}>${utMonthTh(mo)}</option>`).join('');
  const btn=(p,t)=>`<button class="mc-pill${r.p===p?' sel':''}" onclick="setUtRange('${p}')">${t}</button>`;
  return `<div class="ut-pills">ช่วงเปรียบเทียบ: ${btn('3','3 เดือน')}${btn('6','6 เดือน')}${btn('12','12 เดือน')}${btn('all','ทั้งหมด')}
    <span class="ut-range">จาก <select id="utFrom" onchange="setUtRange('custom',this.value,document.getElementById('utTo').value)">${opt(from)}</select>
    ถึง <select id="utTo" onchange="setUtRange('custom',document.getElementById('utFrom').value,this.value)">${opt(to)}</select></span>
    <span class="ut-sub">เดือน = เดือนที่บิลออก · แท็บนี้ไม่ใช้ช่วงเวลาในเมนูข้าง</span></div>`;
}
// ── ผลตรวจบิล (UTIL-09) ──
const UT_MK_NOTE='<span class="ut-mknote"><b class="hi">⚠</b> บิลสูงผิดปกติ · <b>?</b> บิลต้องเช็คกับบัญชี (ซ้ำบิลก่อน / หน่วยเลขกลม อาจเป็นยอดประมาณ) · ชี้ที่แท่งดูเหตุผล</span>';
function utMeterName(b,id){ const m=(UT.cache[b]?.meters||[]).find(x=>x.meter_id===id); return (m&&m.location)||id; }
function utFlagText(b,x){
  const who=`${utEsc(BM_NAMES[b]||b)} · ${UT_TYPE[x.type]?UT_TYPE[x.type].split(' ')[0]+' ':''}${utEsc(utMeterName(b,x.meter_id))}`;
  const out=[];
  if(x.high) out.push({k:'high',t:`${who} บิล ${utMonthTh(x.bill_month)}: ${utFmt(x.units)} หน่วย สูงกว่าปกติ +${x.high.pct.toFixed(0)}% (ปกติ ~${utFmt(x.high.base)})`});
  if(x.dup) out.push({k:'q',t:`${who} บิล ${utMonthTh(x.bill_month)}: หน่วยและเงินซ้ำกับบิล ${utMonthTh(x.dup)} ทุกหลัก — อาจคัดลอกผิด`});
  if(x.round) out.push({k:'q',t:`${who} บิล ${utMonthTh(x.bill_month)}: ${utFmt(x.units)} หน่วย เป็นเลขกลมหลักพัน — อาจเป็นยอดประมาณ`});
  return out;
}
// ธงสูงผิดปกติใน n บิลล่าสุดของแต่ละมิเตอร์ (ของที่เพิ่งเกิด = ต้องดูตอนนี้)
function utRecentHigh(b){
  const c=UT.cache[b]; if(!c||!c.check) return [];
  const n=UTIL_DEFAULTS.billCheck.recent, by={};
  c.check.forEach(x=>{ (by[x.meter_id]=by[x.meter_id]||[]).push(x); });
  return Object.values(by).flatMap(rs=>rs.sort((a,z)=>a.bill_month<z.bill_month?-1:1).slice(-n).filter(x=>x.high));
}
function utCheckBox(){
  const brs=utCmpBranches().filter(b=>UT.cache[b]&&UT.cache[b].check);
  const hi=brs.flatMap(b=>utRecentHigh(b).map(x=>({b,x}))).sort((a,z)=>a.x.bill_month<z.x.bill_month?1:-1);
  const n=UTIL_DEFAULTS.billCheck.recent;
  if(!hi.length) return `<div class="ut-check ok">✅ ตรวจบิล ${n} ใบล่าสุดของทุกมิเตอร์ (${brs.map(b=>BM_NAMES[b]||b).join(' · ')}) — ไม่พบหน่วยสูงผิดปกติ</div>`;
  return `<div class="ut-check bad"><b>⚠️ ต้องดู: บิล ${n} ใบล่าสุดสูงผิดปกติ ${new Set(hi.map(h=>h.x.meter_id)).size} มิเตอร์</b>
    <ul>${hi.map(({b,x})=>`<li>${utFlagText(b,x).filter(f=>f.k==='high').map(f=>f.t).join('')}</li>`).join('')}</ul>
    <div class="ut-sub">เกณฑ์: สูงกว่าค่ากลาง ${UTIL_DEFAULTS.billCheck.lookback} บิลก่อนหน้า เกิน ${Math.round((UTIL_DEFAULTS.billCheck.ratio-1)*100)}% และเกินขั้นต่ำ (น้ำ ${UTIL_DEFAULTS.billCheck.minDiff.water} · ไฟ ${utFmt(UTIL_DEFAULTS.billCheck.minDiff.elec)} หน่วย) · บิลสูงยังไม่ใช่รั่วเสมอไป ต้องตรวจสาเหตุหน้างาน</div></div>`;
}
// ธงในส่วน (ไฟ/น้ำ) ตามช่วงที่เลือก — ใต้ KPI
function utSecFlags(d){
  const set=new Set(d.months), list=[];
  d.has.forEach(b=>(UT.cache[b].check||[]).forEach(x=>{ if(x.type===d.type&&set.has(x.bill_month)) utFlagText(b,x).forEach(f=>list.push({...f,mo:x.bill_month})); }));
  if(!list.length) return '';
  list.sort((a,z)=>(a.k===z.k?0:a.k==='high'?-1:1)||(a.mo<z.mo?1:-1));
  const hi=list.filter(f=>f.k==='high'), q=list.filter(f=>f.k==='q');
  return `<div class="ut-flagbox">${hi.length?`<div class="ut-fh">⚠️ สูงผิดปกติ ${hi.length} บิล</div><ul>${hi.map(f=>`<li>${f.t}</li>`).join('')}</ul>`:''}
    ${q.length?`<details><summary class="ut-fq">❓ ข้อมูลต้องเช็คกับบัญชี ${q.length} บิล</summary><ul>${q.map(f=>`<li>${f.t}</li>`).join('')}</ul></details>`:''}</div>`;
}
// ป้ายบนแท่ง: ⚠ = มีมิเตอร์สูงผิดปกติในเดือนนั้น · ? = ข้อมูลต้องเช็ค (Chart.js plugin ต่อกราฟ ไม่ลงทะเบียนทั้งเว็บ)
const utFlagPlugin={id:'utFlag',afterDatasetsDraw(ch){
  const marks=ch.options.plugins.utFlag; if(!marks) return;
  const ctx=ch.ctx; ctx.save(); ctx.textAlign='center'; ctx.textBaseline='bottom'; ctx.font='bold 12px "Noto Sans Thai",sans-serif';
  ch.data.datasets.forEach((ds,di)=>{ const meta=ch.getDatasetMeta(di); if(meta.hidden) return;
    meta.data.forEach((el,i)=>{ const m=marks[di]&&marks[di][i]; if(!m||el.y==null) return;
      ctx.fillStyle=m==='high'?sc('rgba(224,92,92,1)'):chartClr().tick;
      ctx.fillText(m==='high'?'⚠':'?',el.x,el.y-(ch.options.plugins.bmVals?.on?16:3)); }); });   // เปิดตัวเลข = ยกขึ้นเหนือตัวเลข
  ctx.restore(); }};
function utMonthFlags(b,type,mo){ return (UT.cache[b].check||[]).filter(x=>x.type===type&&x.bill_month===mo&&(x.high||x.dup||x.round)); }

function utCompareHtml(){
  const ok=utCmpReadable(), sel=new Set(utCmpBranches());
  const pills=ok.length>1?`<div class="ut-pills">เทียบสาขา: ${ok.map(b=>`<button class="mc-pill${sel.has(b)?' sel':''}" onclick="toggleUtCmp('${b}')">${utEsc(BM_NAMES[b]||b)} (${b})${b==='SS'?' · ปิดแล้ว':''}</button>`).join('')}</div>`:'';
  return pills+utRangeHtml()+utCheckBox()+UT_SECS.map(([type,icon,name,money,unit],k)=>{
    const d=utCmpData(type);
    const t=`<div class="ut-sec-t">${k+1}. ${icon} ${name} — หน่วยใช้และ${money}</div>`;
    if(!d) return `<div class="sc ut-sec">${t}<div class="ut-empty">ยังไม่มีบิล${name}ของสาขาที่เลือก</div></div>`;
    if(!d.months.length) return `<div class="sc ut-sec">${t}<div class="ut-empty">ไม่มีบิล${name}ในช่วงที่เลือก · บิลล่าสุด ${utMonthTh(d.last)}<br>
      <button class="mc-pill" style="margin-top:8px" onclick="setUtRange('12')">12 เดือนล่าสุด</button></div></div>`;
    const nm=b=>utEsc(BM_NAMES[b]||b), dot=b=>`<i class="ut-dot" style="background:${sc(BM_COLORS[b])}"></i>`;
    const ov=d.overlap.length;
    const mm=d.months, range=`บิล ${utMonthTh(mm[0])} – ${utMonthTh(mm[mm.length-1])} · `+d.stat.map(s=>`${nm(s.b)}มีข้อมูล ${utMonthTh(s.from)} – ${utMonthTh(s.to)}`).join(' · ')
      +(d.has.length>1?(ov?` · ตัวเลขเทียบใช้ช่วงที่ทับกัน ${utMonthTh(d.overlap[0])} – ${utMonthTh(d.overlap[ov-1])} (${ov} เดือน)`:' · ไม่มีเดือนที่ทับกัน (เฉลี่ยแยกตามข้อมูลของแต่ละสาขา)'):'');
    const ref=d.stat[0];
    const vs=key=>d.stat.length<2||ref[key]==null?'':d.stat.slice(1).map(s=>{
      if(s[key]==null||!ref[key]) return '';
      const p=(s[key]-ref[key])/ref[key]*100; return `${nm(s.b)}เทียบ${nm(ref.b)} ${p>=0?'+':'−'}${Math.abs(p).toFixed(1)}%`;
    }).filter(Boolean).join(' · ');
    const kpi=(lbl,key,dp,pre)=>`<div class="kpi ut-ckpi"><div class="kpi-lbl">${lbl}</div>
      ${d.stat.map(s=>`<div class="ut-crow">${dot(s.b)}<span>${nm(s.b)}</span><b>${s[key]==null?'—':(pre||'')+utFmt(s[key],dp)}</b></div>`).join('')}
      <div class="kpi-sub">${vs(key)||'&nbsp;'}</div></div>`;
    const rows=d.stat.map(s=>`<tr><td>${dot(s.b)}${nm(s.b)}</td><td class="n">${utFmt(s.units)}</td><td class="n">${utFmt(s.amt)}</td><td class="n">${s.rate==null?'—':utFmt(s.rate,2)}</td></tr>`).join('');
    const sumT=ov?`${utMonthTh(d.overlap[0])} – ${utMonthTh(d.overlap[ov-1])}`:'ตามข้อมูลของแต่ละสาขา';
    return `<div class="sc ut-sec">${t}<div class="ut-sub" style="margin-bottom:10px">${range}</div>
      <div class="ut-ckpis">${kpi(`หน่วย${name==='ไฟฟ้า'?'ไฟ':'น้ำ'}เฉลี่ยต่อเดือน (${unit})`,'avgU',0)}${kpi(`${money}เฉลี่ยต่อเดือน (บาท)`,'avgA',0)}${kpi(`${money}ต่อหน่วย (บาท)`,'rate',2)}</div>
      ${utSecFlags(d)}
      <div class="sc ut-csub"><div class="sc-title">หน่วย${name==='ไฟฟ้า'?'ไฟ':'น้ำ'}ที่ใช้รายเดือน (${unit}) ${UT_MK_NOTE}</div><div class="ut-chart-mid"><canvas id="cUtilCmp_${type}U"></canvas></div></div>
      <div class="ut-c2">
        <div class="sc ut-csub"><div class="sc-title">${money}รายเดือน (บาท) ${UT_MK_NOTE}</div><div class="ut-chart-mid"><canvas id="cUtilCmp_${type}A"></canvas></div></div>
        <div class="sc ut-csub"><div class="sc-title">สรุป${name} ${sumT}</div>
          <div class="ut-bills"><table><thead><tr><th>สาขา</th><th class="n">หน่วยรวม</th><th class="n">${money}รวม (บาท)</th><th class="n">บาท/หน่วย</th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="ut-sub" style="margin-top:8px">ยอดตามบิล (รวม VAT) ทุกมิเตอร์ของสาขา · เดือน = เดือนที่บิลออก</div></div>
      </div></div>`;
  }).join('');
}
function utCompareCharts(){
  UT_SECS.forEach(([type])=>{
    const d=utCmpData(type); if(!d||!d.months.length) return;
    const lbl=d.months.map(utMonthTh);
    const cfg=(key,money)=>{
      const o=cOpts();
      o.plugins.legend={display:true,labels:o.plugins.legend.labels};
      // UTIL-09: ป้าย ⚠/? บนแท่ง + เหตุผลใน tooltip · dataset ลำดับเดียวกับ d.has
      const flags=d.has.map(b=>d.months.map(mo=>utMonthFlags(b,type,mo)));
      o.plugins.utFlag=flags.map(r=>r.map(fs=>!fs.length?null:fs.some(x=>x.high)?'high':'q'));
      o.plugins.tooltip={callbacks:{label:it=>`${it.dataset.label}: ${it.raw==null?'—':utFmt(it.raw,money?2:0)}`,
        afterLabel:it=>(flags[it.datasetIndex][it.dataIndex]||[]).flatMap(x=>utFlagText(d.has[it.datasetIndex],x))
          .map(f=>(f.k==='high'?'⚠ ':'? ')+f.t.replace(/^.*?บิล [^:]+: /,'').replace(/<[^>]+>/g,''))}};
      o.scales.y.beginAtZero=true; o.scales.y.ticks.callback=v=>utFmt(v);
      o.layout={padding:{top:14}};   // เว้นที่ให้ป้ายบนแท่งสูงสุด
      utValOpts(o);
      return {type:'bar',data:{labels:lbl,datasets:d.has.map(b=>({type:'bar',label:`${BM_NAMES[b]||b} (${b})`,
        data:d.months.map(mo=>d.by[b][mo]?+d.by[b][mo][key].toFixed(2):null),backgroundColor:BM_COLORS[b],borderRadius:3,maxBarThickness:28}))},
        options:o,plugins:[utFlagPlugin]};
    };
    utMake(`cUtilCmp_${type}U`,cfg('units',false));
    utMake(`cUtilCmp_${type}A`,cfg('amt',true));
  });
}
CT_SPEC.cUtilCmp={icon:'bar',opts:[['orig','แท่งคู่','เทียบสาขาทีละเดือน'],['line','เส้น','แนวโน้มแต่ละสาขา']]};
CT_ALT.cUtilCmp={line(cfg){
  return {...cfg,type:'line',data:{labels:cfg.data.labels,datasets:cfg.data.datasets.map(d=>({type:'line',label:d.label,data:d.data,
    borderColor:d.backgroundColor,backgroundColor:d.backgroundColor,borderWidth:2,pointRadius:3,tension:.25,spanGaps:false}))}};
}};

// ── สรุปส่วนมิเตอร์รายวัน: ต้องดูตอนนี้ = มิเตอร์ที่เปิดอยู่ ธงล่าสุดแดง/สงสัยรั่ว หรือขาดจด ──
function utSummary(c){
  const act=c.meters.filter(m=>utilTrue(m.active)), read=act.filter(m=>m._res.last);
  const billHi=new Set(canSeeUtilMoney()?utRecentHigh(UT.br||activeBranch).map(x=>x.meter_id):[]);   // UTIL-09
  const watch=c.meters.filter(m=>(utilTrue(m.active)&&(['red','leak'].includes(m._full?.level)||(m._res.stale&&m._res.last)))||billHi.has(m.meter_id));
  const name=m=>(UT_TYPE[m.type]||'').split(' ')[0]+' '+utEsc(m.location||m.meter_id)+(billHi.has(m.meter_id)?' (บิลสูง)':'');
  // ยังไม่มีอะไรให้ตัดสิน ≠ ปกติ — สาขาปิด / ยังไม่เริ่มจด บอกตรงๆ ไม่ขึ้น ✅
  const [cls,val,sub]=!act.length?['','ปิดใช้แล้ว','ทุกมิเตอร์ปิดใช้ · ดูข้อมูลย้อนหลังได้']
    :watch.length?['red',watch.length+' มิเตอร์',watch.map(name).join(' · ')]
    :!read.length?['','ยังไม่เริ่มจด',`ยังไม่มีการจด (0/${act.length} มิเตอร์)`]
    :['green','✅ ปกติ',`มีการจดแล้ว ${read.length}/${act.length} มิเตอร์`];
  let h=`<div class="kpi ${cls}"><div class="kpi-lbl">ต้องดูตอนนี้</div><div class="kpi-val">${val}</div><div class="kpi-sub">${sub}</div></div>`;
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
  if(utCardView()==='bill'&&hasBills) chart=`<div class="ut-chart ut-zoom" onclick="utOpen(${i})"><canvas id="cUtilBill_${i}"></canvas></div>`;
  else if(days.length) chart=`<div class="ut-chart ut-zoom" onclick="utOpen(${i})"><canvas id="cUtil_${i}"></canvas></div>`;
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
      ${res.stale&&res.last&&utilTrue(m.active)?`<span class="ut-warn">⚠️ ไม่มีการจดเกิน ${res.staleDays} วัน</span>`:''}
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
  utValOpts(o,[0]);
  return {type:'bar',data:{labels:days.map(d=>utDM(d.date)),datasets:[
    {type:'bar',label:'ใช้ (หน่วย)',data:days.map(d=>+d.units.toFixed(2)),backgroundColor:days.map(fill),borderRadius:3,order:2},
    line('ปกติ','base',chartClr().lbl,[4,4]),
    line('เส้นเหลือง','yellow','rgba(240,165,0,.9)',[6,3]),
    line('เส้นแดง','red','rgba(224,92,92,.95)',[])
  ]},options:o,_ct:{days,bands,rates:utDayRates(m,UT.cache[UT.br],days)}};
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
  utValOpts(o,[0]);
  return {type:'bar',data:{labels:s.labels,datasets:[
    {type:'bar',label:'ยอดบิล (ปีนี้)',data:s.amt.cur,backgroundColor:'rgba(240,165,0,.75)',borderRadius:3,order:2},
    {type:'line',label:'เดือนเดียวกันปีก่อน',data:s.amt.prev,borderColor:'rgba(74,158,255,.9)',backgroundColor:'rgba(74,158,255,.9)',
     borderWidth:2,pointRadius:big?3:2,spanGaps:false,fill:false,order:1}
  ]},options:o,_ct:s};
}

// ── แบบกราฟให้เลือก (CHT-04 ปุ่มมุมการ์ด) · ทุกการ์ดใช้ค่าเดียวกัน (cUtil_0 · cUtil_1 · cUtil_big → คีย์ cUtil) ──
CT_SPEC.cUtil={icon:'combo',opts:[['orig','แท่ง+เส้นเกณฑ์','สีตามธง · เส้นปกติ/เหลือง/แดง'],['line','เส้น','แนวโน้ม · จุดสีตามธง'],
  ['pct','% ของปกติ','ปกติ = 100% · เทียบมิเตอร์ต่างขนาดกันได้'],['cum','สะสม','ใช้ไปรวมเท่าไหร่ในช่วงที่เลือก'],
  ['baht','เป็นเงิน (บาท)','หน่วย × บาท/หน่วยของบิลเดือนนั้น']],
  need:{baht:()=>canSeeUtilMoney()?'':'ต้องมีสิทธิ์ "น้ำ-ไฟ: ยอดเงินบิล"'}};
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
  // เป็นเงิน: แท่ง + เส้นเกณฑ์ คูณบาท/หน่วยของวันนั้น · มิเตอร์ที่ไม่มีบิล = คืน null → chart-types ใช้แบบเดิม
  baht(cfg,{days,bands,rates}){
    if(!rates) return null;
    const ds=cfg.data.datasets, x=(v,i)=>v==null||!rates[i]?null:+(v*rates[i].rate).toFixed(2);
    const tip=cfg.options.plugins.tooltip||{};
    const out=utWith(cfg,[{...ds[0],label:'ค่าใช้จ่าย (บาท)',data:days.map((d,i)=>x(d.units,i))},
      {...ds[1],data:bands.map((b,i)=>x(b.base,i))},{...ds[2],data:bands.map((b,i)=>x(b.yellow,i))},{...ds[3],data:bands.map((b,i)=>x(b.red,i))}],
      {ticks:{...cfg.options.scales.y.ticks,callback:v=>'฿'+utFmt(v)}});
    out.options={...out.options,plugins:{...out.options.plugins,tooltip:{...tip,callbacks:{...(tip.callbacks||{}),
      label:it=>`${it.dataset.label}: ${it.raw==null?'—':'฿'+utFmt(it.raw,2)}`,
      footer:it=>{ const r=rates[it[0].dataIndex]; return r?`บาท/หน่วย ${utFmt(r.rate,2)} จากบิล ${utMonthTh(r.mo)}${r.est?' (ประมาณ — บิลเดือนนี้ยังไม่ออก)':''}`:''; }}}}};
    return out;
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
  const c=UT.cache[UT.br], m=c&&c.meters[i]; if(!m||!m._res) return;   // _res มีเฉพาะตอนวาดแท็บย่อยมิเตอร์แล้ว
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
    const f=c.chk&&c.chk[m.meter_id+'@'+b.bill_month], ft=f?utFlagText(UT.br||activeBranch,f).map(x=>x.t.replace(/<[^>]+>/g,'')).join(' · '):'';
    const mk=!f?'':f.high?` <span class="ut-mk hi" title="${utEsc(ft)}">⚠</span>`:` <span class="ut-mk q" title="${utEsc(ft)}">?</span>`;
    return `<tr><td>${utEsc(b.bill_month)}${mk}</td><td class="n">${utFmt(units)}</td><td class="n">${utFmt(amt,2)}</td>
      <td class="n">${units&&amt!=null?utFmt(amt/units,2):'—'}</td><td class="n">${meas}</td></tr>`;
  }).join('');
  return `<div class="ut-bills${n?'':' ut-bills-all'}"><table>
    <thead><tr><th>เดือนในบิล</th><th>หน่วยบิล</th><th>ยอดเงิน (รวม VAT)</th><th>บาท/หน่วย</th><th>จดได้ (เดือนก่อนบิล)</th></tr></thead>
    <tbody>${tr}</tbody></table></div>${tr.includes('ut-mk')?`<div class="ut-sub" style="margin-top:4px">${UT_MK_NOTE.replace('ชี้ที่แท่ง','ชี้ที่เครื่องหมาย')}</div>`:''}`;
}

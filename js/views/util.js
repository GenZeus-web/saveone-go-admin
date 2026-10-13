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
  const now=Date.now(), S=utilSettings({},br);
  const head=`<div class="ut-head">
      <div><b>💧⚡ น้ำ-ไฟ</b> <span class="ut-sub">ข้อมูล ณ ${c.ts?utWhen(c.ts):'—'} · ตลาดเปิด ${S.hours.default.open}–${S.hours.default.close} = 1 วันตลาด</span></div>
      <div class="ut-legend">
        <span><i class="ut-ln base"></i>ปกติ (ค่ากลางวันเดียวกัน ${S.baseWeeks} สัปดาห์ก่อน)</span>
        <span><i class="ut-ln yel"></i>เส้นเหลือง</span><span><i class="ut-ln red"></i>เส้นแดง</span>
        <span class="ut-sub">แท่งเกินเส้น = ขึ้นธงสีนั้น · แท่งจาง = เฉลี่ยจากช่วงที่ขาดจด</span>
      </div></div>`;
  const warn=c.billsErr?'<div class="ut-anom" style="margin:-6px 0 12px">⚠️ อ่านบิลไม่ได้ ('+utEsc(c.billsErr)+') · แสดงเฉพาะเลขมิเตอร์</div>':'';
  host.innerHTML=head+warn+'<div class="ut-grid">'+c.meters.map((m,i)=>utCard(m,i,c,S,now)).join('')+'</div>';
  c.meters.forEach((m,i)=>utChart(m,i));
}

// การ์ด 1 มิเตอร์ · ผลวิเคราะห์เก็บไว้ที่ m._res ให้ utChart ใช้ต่อ (ไม่คำนวณซ้ำ)
function utCard(m,i,c,S,now){
  const meter={meter_id:m.meter_id,type:m.type,branch_code:m.branch_code};
  const res=utilAnalyze(c.readings,meter,{},now);
  const days=applyPeriod(res.days.map(d=>({date:new Date(d.date+'T00:00:00'),d}))).map(x=>x.d);
  m._res=res; m._days=days; m._th=S.thresholds[m.type]||S.thresholds.water;
  const full=[...res.days].reverse().find(d=>d.cover>=0.999);
  const lv=UT_LEVEL[full?.level]||UT_LEVEL.nodata;
  const cnt=k=>days.filter(d=>d.level===k).length;
  const flags=[['leak','สงสัยรั่ว'],['red','แดง'],['yellow','เหลือง']].filter(([k])=>cnt(k))
    .map(([k,t])=>`<span class="ut-chip ${k}">${t} ${cnt(k)} วัน</span>`).join('');
  const closed=res.closed.filter(x=>x.level).pop();
  const anoms=res.anomalies.filter(a=>!days.length||a.t>=Date.parse(days[0].date)).slice(-3).map(a=>
    a.kind==='backward'?`เลขถอยหลัง ${utFmt(a.from)} → ${utFmt(a.to)} (${utWhen(a.t)}) · ไม่นับแถวนี้`
                       :`เปลี่ยนมิเตอร์ (${utWhen(a.t)}) · เลขใหม่เป็นจุดตั้งต้น`);
  return `<div class="sc ut-card lv-${full?.level||'nodata'}">
    <div class="ut-top">
      <div><div class="ut-name">${UT_TYPE[m.type]||utEsc(m.type)} · ${utEsc(m.location||m.meter_id)}</div>
        <div class="ut-sub">${utEsc(m.meter_id)}${utilTrue(m.active)?'':' · ปิดใช้แล้ว (ดูย้อนหลัง)'}</div></div>
      <div class="ut-badge">${lv.icon} ${lv.txt}</div>
    </div>
    <div class="ut-meta">
      ${res.last?`<span>จดล่าสุด ${utWhen(res.last)} · ${utAgo(res.last)}</span>`:'<span>ยังไม่เคยจด</span>'}
      ${res.stale&&res.last&&utilTrue(m.active)?`<span class="ut-warn">⚠️ ไม่มีการจดเกิน ${S.staleDays} วัน</span>`:''}
      ${full?`<span>วันตลาด ${utDM(full.date)} ใช้ <b>${utFmt(full.units,1)}</b> หน่วย${full.base!=null?` · ปกติ ~${utFmt(full.base,1)}`:''}</span>`:''}
      ${closed?`<span>ช่วงตลาดปิดล่าสุด ${utFmt(closed.rate,2)} หน่วย/ชม. ${closed.level==='red'?'🔴 เกินเกณฑ์ (น้ำไหลตอนไม่มีคน)':'✅'}</span>`:''}
    </div>
    ${flags?`<div class="ut-flags">ในช่วงที่เลือก: ${flags}</div>`:''}
    <div class="ut-chart">${days.length?`<canvas id="cUtil_${i}"></canvas>`:'<div class="ut-empty">ไม่มีข้อมูลในช่วงเวลาที่เลือก</div>'}</div>
    ${anoms.length?`<div class="ut-anom">${anoms.map(a=>'⚠️ '+utEsc(a)).join('<br>')}</div>`:''}
    ${canSeeUtilMoney()&&!c.billsErr?utBills(m,c,res):''}
  </div>`;
}

function utChart(m,i){
  const days=m._days; if(!days.length) return;
  const id='cUtil_'+i, bands=days.map(d=>utilBands(d,m._th));
  const fill=d=>`rgba(${(UT_LEVEL[d.level]||UT_LEVEL.nodata).rgb},${d.est?0.4:0.85})`;
  const line=(label,key,color,dash)=>({type:'line',label,data:bands.map(b=>b[key]),borderColor:color,borderWidth:1.5,
    borderDash:dash,pointRadius:0,stepped:'middle',spanGaps:false,fill:false,order:1});
  const o=cOpts();
  o.plugins.legend={display:false};
  o.plugins.tooltip={callbacks:{
    title:it=>'วันตลาด '+it[0].label,
    afterBody:it=>{
      const d=days[it[0].dataIndex], lv=UT_LEVEL[d.level]||UT_LEVEL.nodata;
      return [lv.icon+' '+lv.txt+(d.est?' · เฉลี่ยจากช่วงขาดจด':'')+(d.baseFrom==='setting'?' · ฐานจากค่าตั้ง':'')];
    }}};
  o.scales.y.beginAtZero=true;
  const cfg={type:'bar',data:{labels:days.map(d=>utDM(d.date)),datasets:[
    {type:'bar',label:'ใช้ (หน่วย)',data:days.map(d=>+d.units.toFixed(2)),backgroundColor:days.map(fill),borderRadius:3,order:2},
    line('ปกติ','base',chartClr().lbl,[4,4]),
    line('เส้นเหลือง','yellow','rgba(240,165,0,.9)',[6,3]),
    line('เส้นแดง','red','rgba(224,92,92,.95)',[])
  ]},options:o};
  if(makeChart(id,cfg)) UT.chartIds.push(id);
}

// บิล 6 ใบล่าสุดของมิเตอร์นี้ · เทียบหน่วยที่จดได้ในเดือนที่ใช้จริง (bill_month เลื่อนตาม billMonthOffset)
function utBills(m,c,res){
  const rows=c.bills.filter(b=>b.meter_id===m.meter_id).sort((a,b)=>a.bill_month<b.bill_month?1:-1).slice(0,6);
  if(!rows.length) return '<div class="ut-bills ut-sub">ยังไม่มีบิลของมิเตอร์นี้</div>';
  const tr=rows.map(b=>{
    const units=utNum(b.units), amt=utNum(b.amount_incl_vat), use=utilBillUsageMonth(b.bill_month);
    const md=res.days.filter(d=>d.date.startsWith(use)), got=md.reduce((s,d)=>s+d.units,0);
    const [y,mm]=use.split('-').map(Number), nDays=new Date(y,mm,0).getDate(), cov=md.reduce((s,d)=>s+d.cover,0);
    const meas=md.length?`${utFmt(got,0)}${cov<nDays-0.5?` <span class="ut-sub">(${Math.round(cov)}/${nDays} วัน)</span>`:''}`:'—';
    return `<tr><td>${utEsc(b.bill_month)}</td><td class="n">${utFmt(units)}</td><td class="n">${utFmt(amt,2)}</td>
      <td class="n">${units&&amt!=null?utFmt(amt/units,2):'—'}</td><td class="n">${meas}</td></tr>`;
  }).join('');
  return `<div class="ut-bills"><table>
    <thead><tr><th>เดือนในบิล</th><th>หน่วยบิล</th><th>ยอดเงิน (รวม VAT)</th><th>บาท/หน่วย</th><th>จดได้ (เดือนก่อนบิล)</th></tr></thead>
    <tbody>${tr}</tbody></table></div>`;
}

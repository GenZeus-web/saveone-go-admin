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
  partial:{rgb:'140,148,170',icon:'⚪',txt:'จดยังไม่ครบ'},
  nodata: {rgb:'140,148,170',icon:'⚪',txt:'ข้อมูลยังไม่พอเทียบ'}
};
const UT_TYPE={water:'💧 น้ำ',elec:'⚡ ไฟ'};
const utU=t=>(t&&t.type||t)==='water'?'ลบ.ม.':'หน่วย';   // หน่วยวัดตามชนิด (รับ meter หรือชนิด)

function canSeeUtilMoney(){ return window.userPerms?.showUtilMoney===true; }function utEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function utNum(v){ const n=Number(String(v==null?'':v).replace(/[,\s]/g,'')); return Number.isFinite(n)?n:null; }
function utFmt(n,dp=0){ return n==null?'—':n.toLocaleString('th-TH',{minimumFractionDigits:dp,maximumFractionDigits:dp}); }
function utDM(iso){ const [,m,d]=iso.split('-'); return `${+d}/${+m}`; }
function utWhen(ms){ return new Date(ms).toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}); }
function utAgo(ms){
  const h=(Date.now()-ms)/3600e3;
  return h<1?'ไม่ถึงชั่วโมง':h<48?`${Math.round(h)} ชม.ที่แล้ว`:`${Math.round(h/24)} วันที่แล้ว`;
}
// เกณฑ์จาก settings/utility (หน้าตั้งค่า · firebase/settings.js ตั้ง window.UTIL_SETTINGS) · ยังไม่โหลด/ไม่มี = ค่าตั้งต้น
function utSet(){ return window.UTIL_SETTINGS||{}; }
function utCsv(csv){ return csv?Papa.parse(csv,{header:true,skipEmptyLines:true}).data:[]; }

async function utLoad(br){
  if(UT.loading[br]) return UT.loading[br];
  const money=canSeeUtilMoney();
  UT.loading[br]=(async()=>{
    try{
      const r=await window.fetchUtilFromFirestore(br,money);
      // UTIL-23: มีสิทธิ์เงิน = บิลเต็ม · ไม่มี (หรืออ่านบิลเต็มไม่ได้) = หน่วยในบิลจาก data/ (ไม่มี amount_incl_vat → ทุกจุดที่โชว์เงินไม่มีเลขให้โชว์)
      const readings=utCsv(r.csv), full=utCsv(r.billsCsv), bills=full.length?full:utCsv(r.billUnitsCsv||'');
      // มิเตอร์ที่เปิดอยู่ + มิเตอร์ที่ปิดแล้วแต่ยังมีข้อมูล (SS ปิดสาขา = active FALSE ทุกตัว แต่ต้องดูย้อนหลังได้)
      // ไม่มีเอกสาร data/{BR}_UTIL (สาขาที่ไม่เคยจดผ่านแอป) แต่มีบิล → สร้างการ์ดจากบิล
      const used=new Set([...readings,...bills].map(x=>x.meter_id));
      const meters=utCsv(r.metersCsv).filter(m=>utilTrue(m.active)||used.has(m.meter_id));
      bills.forEach(b=>{ if(!meters.some(m=>m.meter_id===b.meter_id))
        meters.push({meter_id:b.meter_id,branch_code:br,type:b.type,location:'',active:'FALSE'}); });
      if(r.billsErr) console.warn('UTIL-03 อ่านบิลไม่ได้:',r.billsErr);
      // UTIL-09 ตรวจบิล: ทำครั้งเดียวตอนโหลด · chk[meter@เดือน] ให้กราฟ/ตาราง/การ์ดเปิดดูเร็ว
      const check=utilBillCheck(bills.map(x=>({bill_month:x.bill_month,branch_code:br,type:x.type,meter_id:x.meter_id,
        units:utNum(x.units),amount:utNum(x.amount_incl_vat)})),utSet());
      const chk={}; check.forEach(x=>{ if(x.high||x.dup||x.round) chk[x.meter_id+'@'+x.bill_month]=x; });
      UT.cache[br]={at:Date.now(),money,ts:r.ts,readings,meters,bills,billsErr:r.billsErr,check,chk};
    }catch(e){
      UT.cache[br]={at:Date.now(),money,err:e.code==='permission-denied'
        ?'ไม่มีสิทธิ์ดูข้อมูลน้ำ-ไฟของสาขานี้'
        :(e.message||String(e))};
      console.error('UTIL-03 โหลดไม่ได้:',e);
    }finally{ delete UT.loading[br]; }
  })();
  return UT.loading[br];
}

// สาขาที่ต้องโหลด = สาขาที่เปิดดู (มิเตอร์รายวัน) + สาขาที่เลือกเทียบบิล (UTIL-30: ไม่มีสิทธิ์เงินก็เทียบหน่วยได้)
function renderUtil(){
  const host=document.getElementById('utilBody'); if(!host) return;
  const br=activeBranch, money=canSeeUtilMoney();
  const need=[...new Set([br,...utCmpBranches()])];
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
  UT.br=br;   // ต้องตั้งก่อนสร้างการ์ด (utSummary/util-meter อ่านธงบิลของสาขานี้)
  const money=canSeeUtilMoney();
  // แท็บย่อย: 📊 เทียบสาขา (บิลรายเดือน · แบบที่ ผอ. ส่งมา · หน้าหลัก) | 📟 มิเตอร์รายวัน (ตรวจรั่ว)
  //   UTIL-30: ไม่มีสิทธิ์ยอดเงิน = เทียบสาขาเห็นแต่หน่วย (billUnitsCsv) · ตัด KPI/กราฟ/คอลัมน์เงินใน utCompareHtml
  const sub=utSub();
  UT.shown=sub;   // แท็บย่อยที่แสดงจริง — utVals ใช้ตัวนี้
  const bar=utToolbar(sub);
  if(sub==='cmp'){
    host.innerHTML=bar+utCompareHtml();
    UT.br=br; utCompareCharts();
    return;
  }
  let meters;
  if(c.err) meters=`<div class="ut-empty ut-err">${utEsc(c.err)}</div>`;
  else if(!c.meters.length) meters='<div class="ut-empty">สาขานี้ยังไม่มีข้อมูลจดมิเตอร์</div>';
  else{
    const now=Date.now(), S=utilSettings(utSet(),br);
    c.meters.forEach(m=>utPrep(m,c,S,now));   // ต้องก่อน utSummary / utMeterHtml (ตั้ง m._res ฯลฯ)
    meters=`<div class="ut-head"><div class="ut-sub">ข้อมูล ณ ${c.ts?utWhen(c.ts):'—'} · แตะการ์ดหรือช่องเพื่อดูรายละเอียด</div></div>`
      +utHelpHtml(S,c.meters.some(m=>m.type==='elec'))
      +(c.billsErr?'<div class="ut-anom" style="margin:-6px 0 12px">⚠️ อ่านบิลไม่ได้ ('+utEsc(c.billsErr)+') · แสดงเฉพาะเลขมิเตอร์</div>':'')
      +utSummary(c)+utMeterHtml(c);   // UTIL-15: views/util-meter.js
  }
  host.innerHTML=bar+`<div class="ut-sec-t">📟 มิเตอร์ · ${utEsc(BM_NAMES[br]||br)}</div>`+meters;
  UT.br=br;
}
// ── กล่อง "❓ วิธีอ่าน · วิธีคำนวณเกณฑ์" (UTIL-14) — พับไว้เป็นค่าเริ่มต้น ──
//   ตัวเลขทุกตัวดึงจาก S / UTIL_DEFAULTS (เกณฑ์จริง) และคำนวณตัวอย่างด้วยฟังก์ชันเดียวกับตัวตรวจ ไม่พิมพ์ตายตัว
//   เปิดค้างไว้แล้วแท็บวาดใหม่ (รีเฟรช 5 นาที) ต้องไม่หุบเอง → จำใน UT.helpOpen
function utHelpHtml(S,hasElec){
  const w=S.thresholds.water, e=S.thresholds.elec, B=utilBillCfg(utSet()), H=S.hours.default;
  const yl=n=>Math.max(n*w.yellow,n+w.minDiff), rl=n=>Math.max(n*w.red,n+w.minDiff);
  const ex=n=>yl(n)>=rl(n)?`ค่ากลาง ${n} → เกิน ${utFmt(rl(n),1)} = แดงเลย`:`ค่ากลาง ${n} → เกิน ${utFmt(yl(n),1)} = เหลือง · เกิน ${utFmt(rl(n),1)} = แดง`;
  // ตัวอย่างจริง: บิลน้ำสำนักงานบางนา ก.ค. 69 = 153 · 4 บิลก่อน 68 · 82 · 131 · 116
  const bBase=utilMedian([68,82,131,116]), bNow=153;
  // สูตรเขียนเป็นการเทียบตรงๆ "ค่ากลาง × 1.5 < ที่ใช้" (เจ้าของเข้าใจง่ายกว่า "ค่าที่มากกว่าระหว่าง…" · 14 ต.ค.)
  const rule=(x,d,who)=>`ค่ากลาง × ${x} &lt; ${who} <b>และ</b> ค่ากลาง + ${d} ≤ ${who}`;
  const shut=((utilHm(H.open)-utilHm(H.close))/3600e3+24)%24;
  return `<details class="ut-help"${UT.helpOpen?' open':''} ontoggle="UT.helpOpen=this.open">
    <summary>❓ วิธีอ่าน · วิธีคำนวณเกณฑ์</summary>
    <div class="ut-help-b">
      <div class="ut-help-h">วิธีอ่าน</div>
      <p>ดูกล่อง "ต้องดูตอนนี้" ด้านบน และป้ายมุมขวาบนของแต่ละการ์ด</p>
      <table><tr><th></th><th>เมื่อไหร่</th><th>ทำอะไร</th></tr>
        <tr><td>✅ ปกติ</td><td>ไม่เกินเส้นเหลือง</td><td>—</td></tr>
        <tr><td>🟡 เหลือง</td><td>เกินเส้นเหลือง</td><td>จับตาดู</td></tr>
        <tr><td>🔴 แดง</td><td>เกินเส้นแดง</td><td>ไปดูหน้างาน</td></tr>
        <tr><td>🟣 ม่วง</td><td>เกินเส้นเหลืองติดกัน ${w.streak} วัน</td><td>เช็คท่อ/ก๊อก น่าจะรั่ว</td></tr></table>
      <p>สีจาง = วันที่ไม่ได้จด (ระบบเฉลี่ยให้) · สีเทา = จดยังไม่ครบ</p>

      <div class="ut-help-h">วิธีคำนวณ</div>
      <ol>
        <li><b>ใช้ต่อวัน</b> = เลขครั้งนี้ − เลขครั้งก่อน · 1 วัน นับ ${H.open} ถึง ${H.open} วันถัดไป</li>
        <li><b>ค่ากลาง</b> = ตัวกลางของวันเดียวกันในสัปดาห์ ย้อน ${S.baseWeeks} สัปดาห์ (ต้องมีอย่างน้อย ${S.baseMinDays}) ไม่นับวันที่แดง · เช่น 30 · 34 · 36 · 80 → ${utFmt(utilMedian([30,34,36,80]))}<br>ช่วงแรกที่ยังมีไม่ถึง ${S.baseMinDays} = ใช้ค่าเฉลี่ยต่อวันจาก ${S.billBase.n} บิลล่าสุดแทน</li>
        <li><b>🟡 เหลือง</b> = ${rule(w.yellow,w.minDiff,'ที่ใช้')}<br><b>🔴 แดง</b> = ${rule(w.red,w.minDiff,'ที่ใช้')}<br>เช่น ${ex(20)} · ${ex(5)}</li>
        <li><b>🟣 ม่วง</b> = วันนั้นเหลือง และเกินเส้นเหลืองติดกันถึงวันที่ ${w.streak} (วันแดงนับรวม)</li>
        ${hasElec?`<li><b>⚡ ไฟ</b> = เหลือง ${rule(e.yellow,utFmt(e.minDiff),'ที่ใช้')} · แดง ค่ากลาง × ${e.red} · ม่วง เหลืองติดกัน ${e.streak} วัน</li>`:''}
        <li><b>⚠ บิล</b> = ค่ากลาง ${B.lookback} บิลก่อน × ${B.ratio} &lt; บิลนี้ <b>และ</b> ค่ากลาง + ${B.minDiff.water} (ไฟ ${utFmt(B.minDiff.elec)}) ≤ บิลนี้
          · ต้องมีบิลก่อนหน้าอย่างน้อย ${B.minPrev} ใบ · ไม่ตรวจ ${B.warmup} เดือนแรกของสาขา
          <br>เช่น บิลน้ำสำนักงานบางนา ก.ค. 69 = ${bNow} · ${utFmt(bBase)} × ${B.ratio} = ${utFmt(bBase*B.ratio,1)} &lt; ${bNow} และ ${utFmt(bBase)} + ${B.minDiff.water} = ${utFmt(bBase+B.minDiff.water)} ≤ ${bNow} → ⚠ +${utFmt((bNow/bBase-1)*100)}%</li>
        <li><b>ใช้ 0</b> = มิเตอร์ไม่ขยับ → ขึ้นเตือนให้เช็คมิเตอร์</li>
        <li><b>ช่วงตลาดปิด</b> = (เลขตอน ${H.open} − เลขตอน ${H.close}) ÷ ${utFmt(shut)} ชม. เกิน ${w.closedRate} ลบ.ม./ชม. = แดง · ต้องจดวันละ 2 รอบ</li>
      </ol>
    </div></details>`;
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
function utToolbar(sub){
  const tabs=[['cmp','📊 เทียบสาขา (บิลรายเดือน)'],['meter','📟 มิเตอร์ · ตรวจรั่ว']]
    .map(([k,t])=>`<button class="mc-pill${sub===k?' sel':''}" role="tab" aria-selected="${sub===k}" onclick="setUtSub('${k}')">${t}</button>`).join('');
  // ปุ่มตัวเลขบนกราฟ: เฉพาะเทียบสาขา (แท็บมิเตอร์ UTIL-15 ไม่มีป้ายตัวเลขบนกราฟ)
  const vals=sub==='cmp'?`<button class="mc-pill" onclick="toggleUtVals()" aria-pressed="${utVals()}">🔢 ${utVals()?'ซ่อนตัวเลข':'แสดงตัวเลข'}</button>`:'';
  return `<div class="ut-subtabs"><div class="ut-subtabs-l" role="tablist">${tabs}</div>${vals}</div>`;
}
// สีแกน/เส้นตาราง/ป้ายในกราฟน้ำ-ไฟ ตามธีมที่ใช้อยู่ (night.css) — chartClr() ยังเป็นสีธีมเดิม
//   วัดจริง 14 ต.ค.: ตัวเลขแกนบนการ์ดโหมดมืด contrast 3.1 (ต้อง ≥ 4.5) · เส้นตาราง rgba ขาว 4% แทบไม่เห็น
function utInk(){
  const cs=getComputedStyle(document.body), light=document.body.classList.contains('light-mode');
  return {ink2:cs.getPropertyValue('--ink2').trim()||chartClr().lbl, grid:light?'rgba(0,0,0,.09)':'rgba(255,255,255,.09)'};
}
function utAxis(o){
  const k=utInk();
  Object.values(o.scales||{}).forEach(ax=>{ if(ax.ticks) ax.ticks.color=k.ink2; if(ax.grid&&ax.grid.display!==false) ax.grid.color=k.grid; });
  if(o.plugins?.legend?.labels) o.plugins.legend.labels={...o.plugins.legend.labels,color:k.ink2};
  return o;
}
function utMake(id,cfg){ if(cfg&&makeChart(id,cfg)) UT.chartIds.push(id); }

// ── ส่วน 1–2: เทียบสาขาจากบิลรายเดือน (ต้นแบบจาก ผอ.) ──
//   12 เดือนล่าสุด · ค่าเฉลี่ย/ตารางสรุปคิดเฉพาะ "ช่วงที่ทับกัน" (ทุกสาขาที่เลือกมีบิลชนิดนั้นครบเดือน) ให้เทียบกันได้จริง
//   สาขาที่เทียบได้ = admin ทุกสาขา · คนอื่น = สาขาที่ดูแล (กฎ utilbill/ เปิดแค่นั้น · ไม่มีสิทธิ์เงินก็ใช้ชุดเดียวกัน)
//   UTIL-30: ไม่มีสิทธิ์เงิน = บิลไม่มี amount_incl_vat → ซ่อน KPI เงิน/บาทต่อหน่วย · กราฟเงิน · คอลัมน์เงินในตาราง
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
    <span class="ut-sub">เดือน = เดือนที่บิลออก</span></div>`;
}
// ── ผลตรวจบิล (UTIL-09) ──
// UTIL-36: ป้าย ? ปิดอยู่ (settings billCheck.ask) = ไม่ต้องอธิบาย ?
const utMkNote=()=>`<span class="ut-mknote"><b class="hi">⚠</b> บิลสูงผิดปกติ${utilBillCfg(utSet()).ask?' · <b>?</b> ต้องเช็คกับบัญชี':''} · ชี้ที่แท่งดูเหตุผล</span>`;
function utMeterName(b,id){ const m=(UT.cache[b]?.meters||[]).find(x=>x.meter_id===id); return (m&&m.location)||id; }
function utFlagText(b,x){
  const who=`${utEsc(BM_NAMES[b]||b)} · ${UT_TYPE[x.type]?UT_TYPE[x.type].split(' ')[0]+' ':''}${utEsc(utMeterName(b,x.meter_id))}`;
  const out=[];
  if(x.high) out.push({k:'high',t:`${who} บิล ${utMonthTh(x.bill_month)}: ${utFmt(x.units)} ${utU(x.type)} สูงกว่าค่ากลาง +${x.high.pct.toFixed(0)}% (ค่ากลาง ${utFmt(x.high.base)})`});
  if(x.dup) out.push({k:'q',t:`${who} บิล ${utMonthTh(x.bill_month)}: หน่วยและเงินซ้ำกับบิล ${utMonthTh(x.dup)} ทุกหลัก — อาจคัดลอกผิด`});
  if(x.round) out.push({k:'q',t:`${who} บิล ${utMonthTh(x.bill_month)}: ${utFmt(x.units)} ${utU(x.type)} เป็นเลขกลมหลักพัน — อาจเป็นยอดประมาณ`});
  return out;
}
// ธงสูงผิดปกติใน n บิลล่าสุดของแต่ละมิเตอร์ (ของที่เพิ่งเกิด = ต้องดูตอนนี้)
function utRecent(b){   // n บิลล่าสุดของแต่ละมิเตอร์ (ทุกใบที่ตรวจ ไม่ใช่แค่ที่สูง)
  const c=UT.cache[b]; if(!c||!c.check) return [];
  const n=utilBillCfg(utSet()).recent, by={};
  c.check.forEach(x=>{ (by[x.meter_id]=by[x.meter_id]||[]).push(x); });
  return Object.values(by).flatMap(rs=>rs.sort((a,z)=>a.bill_month<z.bill_month?-1:1).slice(-n));
}
function utRecentHigh(b){ return utRecent(b).filter(x=>x.high); }
function utCheckBox(){
  const brs=utCmpBranches().filter(b=>UT.cache[b]&&UT.cache[b].check);
  const hi=brs.flatMap(b=>utRecentHigh(b).map(x=>({b,x}))).sort((a,z)=>a.x.bill_month<z.x.bill_month?1:-1);
  const B=utilBillCfg(utSet());
  // UTIL-35: เดิม "บิล 3 ใบล่าสุดสูงผิดปกติ 2 มิเตอร์" แต่ลิสต์ 4 รายการ — เจ้าของงง · ลอง "3 เดือนล่าสุด" ก็ยังงง (ลิสต์มีแค่ ส.ค./ก.ย.)
  //   → หัวนับบิลให้ตรงกับรายการ · บรรทัดใต้หัวบอกช่วงเดือนที่ตรวจจริง แยกน้ำ/ไฟ (ต.ค. ตรวจแล้วปกติ จึงไม่อยู่ในลิสต์)
  //   ช่วงเดียวรวมทุกมิเตอร์ใช้ไม่ได้: บิลไฟ/น้ำออกไม่พร้อมกัน · BN-E-TEMP บิลล่าสุด ก.พ. 69 ลากเป็น "ม.ค.–ต.ค." → ไม่นับมิเตอร์ที่บิลหยุดเกิน billBase.maxAge
  const rec=brs.flatMap(b=>utRecent(b)), ix=k=>{ const [y,m]=k.split('-').map(Number); return y*12+m; };
  const MA=utilSettings(utSet(),activeBranch).billBase.maxAge;
  const span=['water','elec'].map(t=>{
    const rs=rec.filter(x=>x.type===t); if(!rs.length) return '';
    const L=rs.reduce((a,x)=>x.bill_month>a?x.bill_month:a,''), by={};
    rs.forEach(x=>{ (by[x.meter_id]=by[x.meter_id]||[]).push(x.bill_month); });
    const st=Object.values(by).map(ms=>ms.sort()).filter(ms=>ix(L)-ix(ms[ms.length-1])<=MA).map(ms=>ms[0]).sort()[0]||L;
    return `${t==='water'?'💧 น้ำ':'⚡ ไฟ'} ${st===L?utMonthTh(L):`${utMonthTh(st)} – ${utMonthTh(L)}`}`;
  }).filter(Boolean).join(' · ');
  const scope=`ตรวจ ${B.recent} บิลล่าสุดของแต่ละมิเตอร์: ${span}`;
  if(!hi.length) return `<div class="ut-check ok">✅ ไม่พบหน่วยสูงผิดปกติ (${brs.map(b=>BM_NAMES[b]||b).join(' · ')}) · ${scope}</div>`;
  return `<div class="ut-check bad"><b>⚠️ ต้องดู: บิลสูงผิดปกติ ${hi.length} ใบ (${new Set(hi.map(h=>h.x.meter_id)).size} มิเตอร์)</b>
    <div class="ut-sub">${scope}</div>
    <ul>${hi.map(({b,x})=>`<li>${utFlagText(b,x).filter(f=>f.k==='high').map(f=>f.t).join('')}</li>`).join('')}</ul>
    <div class="ut-sub">เกณฑ์: ค่ากลาง ${B.lookback} บิลก่อน × ${B.ratio} &lt; บิลนี้ และ ค่ากลาง + ${B.minDiff.water} (ไฟ ${utFmt(B.minDiff.elec)}) ≤ บิลนี้</div></div>`;
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
      ctx.fillStyle=m==='high'?sc('rgba(224,92,92,1)'):utInk().ink2;
      ctx.fillText(m==='high'?'⚠':'?',el.x,el.y-(ch.options.plugins.bmVals?.on?16:3)); }); });   // เปิดตัวเลข = ยกขึ้นเหนือตัวเลข
  ctx.restore(); }};
function utMonthFlags(b,type,mo){ return (UT.cache[b].check||[]).filter(x=>x.type===type&&x.bill_month===mo&&(x.high||x.dup||x.round)); }

function utCompareHtml(){
  const ok=utCmpReadable(), sel=new Set(utCmpBranches()), $=canSeeUtilMoney(), one=$?'':' one';
  const pills=ok.length>1?`<div class="ut-pills">เทียบสาขา: ${ok.map(b=>`<button class="mc-pill${sel.has(b)?' sel':''}" onclick="toggleUtCmp('${b}')">${utEsc(BM_NAMES[b]||b)} (${brCode(b)})${b==='SS'?' · ปิดแล้ว':''}</button>`).join('')}</div>`:'';
  return pills+utRangeHtml()+utCheckBox()+UT_SECS.map(([type,icon,name,money,unit],k)=>{
    const d=utCmpData(type);
    // หัวส่วนติดบนจอตอนเลื่อน + สีประจำชนิด (ไฟ เหลือง · น้ำ ฟ้า · UTIL-28 พื้นการ์ด) — เจ้าของ: เลื่อนเร็วๆ ไม่รู้ส่วนไหนไฟ ส่วนไหนน้ำ
    const t=`<div class="ut-cmp-h">${icon} ${name}<span>หน่วยใช้${$?'และ'+money:''}</span></div>`, sec=`sc ut-sec ut-sec-${type}`;
    if(!d) return `<div class="${sec}">${t}<div class="ut-empty">ยังไม่มีบิล${name}ของสาขาที่เลือก</div></div>`;
    if(!d.months.length) return `<div class="${sec}">${t}<div class="ut-empty">ไม่มีบิล${name}ในช่วงที่เลือก · บิลล่าสุด ${utMonthTh(d.last)}<br>
      <button class="mc-pill" style="margin-top:8px" onclick="setUtRange('12')">12 เดือนล่าสุด</button></div></div>`;
    const nm=b=>utEsc(BM_NAMES[b]||b), dot=b=>`<i class="ut-dot" style="background:${sc(BM_COLORS[b])}"></i>`;
    const ov=d.overlap.length;
    const mm=d.months, range=d.has.length>1&&ov?`ตัวเลขเทียบ ${utMonthTh(d.overlap[0])} – ${utMonthTh(d.overlap[ov-1])} (${ov} เดือนที่ทุกสาขามีบิล)`
      :`บิล ${utMonthTh(mm[0])} – ${utMonthTh(mm[mm.length-1])}`+(d.has.length>1?' · ไม่มีเดือนที่ทุกสาขามีบิล':'');
    const ref=d.stat[0];
    const vs=key=>d.stat.length<2||ref[key]==null?'':d.stat.slice(1).map(s=>{
      if(s[key]==null||!ref[key]) return '';
      const p=(s[key]-ref[key])/ref[key]*100; return `${nm(s.b)}เทียบ${nm(ref.b)} ${p>=0?'+':'−'}${Math.abs(p).toFixed(1)}%`;
    }).filter(Boolean).join(' · ');
    const kpi=(lbl,key,dp,pre)=>`<div class="kpi ut-ckpi"><div class="kpi-lbl">${lbl}</div>
      ${d.stat.map(s=>`<div class="ut-crow">${dot(s.b)}<span>${nm(s.b)}</span><b>${s[key]==null?'—':(pre||'')+utFmt(s[key],dp)}</b></div>`).join('')}
      <div class="kpi-sub">${vs(key)||'&nbsp;'}</div></div>`;
    const rows=d.stat.map(s=>`<tr><td>${dot(s.b)}${nm(s.b)}</td><td class="n">${utFmt(s.units)}</td>${$?`<td class="n">${utFmt(s.amt)}</td><td class="n">${s.rate==null?'—':utFmt(s.rate,2)}</td>`:''}</tr>`).join('');
    const sumT=ov?`${utMonthTh(d.overlap[0])} – ${utMonthTh(d.overlap[ov-1])}`:'ตามข้อมูลของแต่ละสาขา';
    return `<div class="${sec}">${t}<div class="ut-sub" style="margin-bottom:10px">${range}</div>
      <div class="ut-ckpis${one}">${kpi(`${icon} หน่วย${name==='ไฟฟ้า'?'ไฟ':'น้ำ'}เฉลี่ยต่อเดือน (${unit})`,'avgU',0)}${$?kpi(`${icon} ${money}เฉลี่ยต่อเดือน (บาท)`,'avgA',0)+kpi(`${icon} ${money}ต่อหน่วย (บาท)`,'rate',2):''}</div>
      ${utSecFlags(d)}
      <div class="sc ut-csub"><div class="sc-title">${icon} หน่วย${name==='ไฟฟ้า'?'ไฟ':'น้ำ'}ที่ใช้รายเดือน (${unit}) ${utMkNote()}</div><div class="ut-chart-mid"><canvas id="cUtilCmp_${type}U"></canvas></div></div>
      <div class="ut-c2${one}">
        ${$?`<div class="sc ut-csub"><div class="sc-title">${icon} ${money}รายเดือน (บาท) ${utMkNote()}</div><div class="ut-chart-mid"><canvas id="cUtilCmp_${type}A"></canvas></div></div>`:''}
        <div class="sc ut-csub"><div class="sc-title">${icon} สรุป${name} ${sumT}</div>
          <div class="ut-bills"><table><thead><tr><th>สาขา</th><th class="n">หน่วยรวม</th>${$?`<th class="n">${money}รวม (บาท)</th><th class="n">บาท/หน่วย</th>`:''}</tr></thead><tbody>${rows}</tbody></table></div>
          <div class="ut-sub" style="margin-top:8px">${$?'รวม VAT ทุกมิเตอร์ของสาขา':'รวมทุกมิเตอร์ของสาขา'}</div></div>
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
      utValOpts(o); utAxis(o);
      return {type:'bar',data:{labels:lbl,datasets:d.has.map(b=>({type:'bar',label:`${BM_NAMES[b]||b} (${brCode(b)})`,
        data:d.months.map(mo=>d.by[b][mo]?+d.by[b][mo][key].toFixed(2):null),backgroundColor:BM_COLORS[b],borderRadius:3,maxBarThickness:28}))},
        options:o,plugins:[utFlagPlugin]};
    };
    utMake(`cUtilCmp_${type}U`,cfg('units',false));
    if(canSeeUtilMoney()) utMake(`cUtilCmp_${type}A`,cfg('amt',true));   // UTIL-30: ไม่มีสิทธิ์เงิน = ไม่มี canvas นี้
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
  const billHi=new Set(utRecentHigh(UT.br||activeBranch).map(x=>x.meter_id));   // UTIL-09 · UTIL-23 ดูจากหน่วย ไม่ต้องมีสิทธิ์เงิน
  const zero=new Set(c.meters.filter(m=>umZero(m).length).map(m=>m.meter_id));   // ใช้ 0 = มิเตอร์ค้าง/ลอกเลข (views/util-meter.js)
  const watch=c.meters.filter(m=>(utilTrue(m.active)&&(['red','leak'].includes(m._full?.level)||(m._res.stale&&m._res.last)))||billHi.has(m.meter_id)||zero.has(m.meter_id));
  const name=m=>(UT_TYPE[m.type]||'').split(' ')[0]+' '+utEsc(m.location||m.meter_id)+(billHi.has(m.meter_id)?' (บิลสูง)':'')+(zero.has(m.meter_id)?' (ใช้ 0)':'');
  // ยังไม่มีอะไรให้ตัดสิน ≠ ปกติ — สาขาปิด / ยังไม่เริ่มจด บอกตรงๆ ไม่ขึ้น ✅
  const [cls,val,sub]=!act.length?['','ปิดใช้แล้ว','ทุกมิเตอร์ปิดใช้ · ดูข้อมูลย้อนหลังได้']
    :watch.length?['red',watch.length+' มิเตอร์',watch.map(name).join(' · ')]
    :!read.length?['','ยังไม่เริ่มจด',`ยังไม่มีการจด (0/${act.length} มิเตอร์)`]
    :['green','✅ ปกติ',`มีการจดแล้ว ${read.length}/${act.length} มิเตอร์`];
  let h=`<div class="kpi ${cls}"><div class="kpi-lbl">ต้องดูตอนนี้</div><div class="kpi-val">${val}</div><div class="kpi-sub">${sub}</div></div>`;
  return `<div class="kpi-row ut-kpis">${h}</div>`;
}

// ผลวิเคราะห์ 1 มิเตอร์ เก็บที่ m._res / m._days / m._full / m._th / m._anoms
//   ให้การ์ด สรุป ตาราง และกล่องรายละเอียด (views/util-meter.js) ใช้ต่อ ไม่คำนวณซ้ำ
//   น้ำ + ไฟ รายวันเหมือนกัน (UTIL-37 · ไฟเคยจดทุกวันจันทร์แล้วรวมเป็นรายสัปดาห์ UTIL-13)
function utPrep(m,c,S,now){
  const meter={meter_id:m.meter_id,type:m.type,branch_code:m.branch_code};
  const res=utilAnalyze(c.readings,meter,utSet(),now,c.bills);   // บิล = ฐานช่วงแรก (UTIL-21)
  const days=applyPeriod(res.days.map(d=>({date:new Date(d.date+'T00:00:00'),d}))).map(x=>x.d);
  m._res=res; m._days=days; m._th=S.thresholds[m.type]||S.thresholds.water;
  m._full=[...res.days].reverse().find(d=>d.cover>=0.999);
  m._anoms=res.anomalies.filter(a=>!days.length||a.t>=Date.parse(days[0].date)).slice(-3).map(a=>
    a.kind==='backward'?`เลขถอยหลัง ${utFmt(a.from)} → ${utFmt(a.to)} (${utWhen(a.t)}) · ไม่นับแถวนี้`
                       :`เปลี่ยนมิเตอร์ (${utWhen(a.t)}) · เลขใหม่เป็นจุดตั้งต้น`);
}

// ── ชื่อเดือนไทย (แท็บเทียบสาขา + มิเตอร์) ──
const UT_TH_MON=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function utAddMonth(ym,k){ const [y,m]=ym.split('-').map(Number), n=y*12+m-1+k; return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`; }
function utMonthTh(ym){ const [y,m]=ym.split('-').map(Number); return `${UT_TH_MON[m-1]} ${String(y+543).slice(2)}`; }
// ── ปิดกล่องรายละเอียด (#utModal · views/util-meter.js) ──
function utClose(){
  const box=document.getElementById('utModal'); if(!box) return;
  dChart('cUmFull');
  box.style.display='none'; box.innerHTML=''; syncModalLock();
}

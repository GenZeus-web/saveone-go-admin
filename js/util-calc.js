// ============================================================
// util-calc.js — UTIL-01: น้ำ-ไฟ จากเลขไมล์ดิบ (ฟังก์ชันล้วน ไม่แตะ DOM/Firestore · เทสต์: tests/util-calc.test.js)
// สัญญาข้อมูล: docs/util-data-contract.md
// ============================================================
// หลัก: เก็บเลขไมล์ ไม่เก็บ "ใช้งาน" · ไม่ผูกรอบจด — ดูจากเวลาจริง (ts) ว่าช่วงไหนตลาดเปิด/ปิด
//   จะจดวันละกี่รอบ ตอนไหน ก็คำนวณได้ ต่างกันแค่ความแม่นของเกณฑ์ตอนปิด
// "วันตลาด D" = เวลาเปิดของวัน D → เวลาเปิดของวัน D+1
//   ตลาดเปิดคร่อมเที่ยงคืน (14:00–01:00) → เลขที่จดตี 1 ครึ่งของวันที่ 2 เป็นยอดของวันตลาดที่ 1
// ใบจดกระดาษไม่มีเวลา → ถือว่าจดตอนเปิด = ปิดยอดของวันตลาดก่อนหน้า (ได้ผลเท่าการหารจำนวนวันตรงๆ)

const UTIL_TZ=7*3600e3;   // ไทย UTC+7 ไม่มีเวลาออมแสง → คิดเลขตรงได้ ไม่ต้องพึ่ง timezone ของเครื่อง
const UTIL_DAY=864e5;

// ค่าตั้งต้น — ของจริงอยู่ Firestore settings/utility (แก้จากหน้าตั้งค่า) · ห้ามเก็บ localStorage
const UTIL_DEFAULTS={
  hours:{default:{open:'14:00',close:'01:00'}},  // ต่อสาขาได้: hours.BN = {...}
  edgeMin:15,        // จดคลาดจากเวลาเปิด/ปิดไม่เกินนี้ ยังนับเป็น "ช่วงปิดล้วน"
  staleDays:2,       // ไม่มีการจดเกินนี้ = เตือนบนการ์ด (ชนิดไหนตั้ง thresholds.<ชนิด>.staleDays ไว้ ใช้ค่านั้นแทน)
  baseWeeks:4,       // ฐาน = วันเดียวกันในสัปดาห์ ย้อนกี่สัปดาห์
  baseMinDays:2,     // วันปกติเหลือน้อยกว่านี้ → ใช้ค่าเฉลี่ยบิล (billBase) แทน
  thresholds:{
    water:{yellow:1.5,red:2,minDiff:10,streak:3,closedRate:0.5},  // จดวันละรอบ 14:00 (เจ้าของเลือก 14 ต.ค. 69)
    // ไฟ: ยังไม่มีข้อมูลจริง minDiff/closedRate เป็นค่าเดา · จดทุกวันจันทร์ → เลยรอบ 1 วันยังไม่เตือน
    elec:{yellow:1.5,red:2,minDiff:100,streak:3,closedRate:null,staleDays:8}
  },
  rates:[],          // [{meter_id, field:'multiplier'|'rate', value, effective_from}] — ห้ามแก้ย้อน (ADR 0001)
  billMonthOffset:-1, // บิลเดือน M = ใช้จริงเดือน M-1 (เทียบใบจดบางนา ก.ย.–ต.ค. 69) — รอบัญชียืนยัน
  // ตรวจบิลรายเดือน (UTIL-09) — เพิ่มหลังน้ำ BN บิล ก.ค.–ก.ย. 69 พุ่งแต่ตัวตรวจรายวันไม่เห็น (เริ่มจดรายวัน 4 ก.ย.)
  billCheck:{ratio:1.3,lookback:6,minPrev:3,warmup:6,minDiff:{water:50,elec:3000},recent:3},
  // ช่วงแรกที่ค่ากลางยังไม่พอ → ค่าเฉลี่ยต่อวันจาก n บิลล่าสุด (UTIL-21) · บิลล่าสุดเก่าเกิน maxAge เดือน = ไม่ใช้
  //   maxAge 4: บิลเดือน M ออกช้า (ต.ค. ยังไม่มีบิลไฟ BG ใช้จริง ก.ย.) → ต.ค. ยังได้ มิ.ย.–ส.ค. ครบ 3
  billBase:{n:3,maxAge:4}
};

function utilHm(s){ const [h,m]=String(s).split(':').map(Number); return ((h||0)*60+(m||0))*60e3; }
function utilIso(idx){ return new Date(idx*UTIL_DAY).toISOString().slice(0,10); }
function utilIdx(iso){ return Math.round(Date.parse(iso+'T00:00:00Z')/UTIL_DAY); }
function utilMarketIdx(t,openMs){ return Math.floor((t+UTIL_TZ-openMs)/UTIL_DAY); }
function utilMarketStart(idx,openMs){ return idx*UTIL_DAY-UTIL_TZ+openMs; }
function utilMedian(a){ const s=[...a].sort((x,y)=>x-y),m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; }
function utilTrue(v){ return v===true||String(v).trim().toUpperCase()==='TRUE'; }

// รวมค่าตั้งต้น + ค่าจาก Firestore · เกณฑ์รวมทีละชนิด (แก้แค่บางช่องได้)
function utilSettings(s,branch){
  s=s||{}; const D=UTIL_DEFAULTS;
  const th={}; for(const k of Object.keys(D.thresholds)) th[k]={...D.thresholds[k],...((s.thresholds||{})[k]||{})};
  const hrs={...D.hours,...(s.hours||{})}, h=hrs[branch]||hrs.default;
  return {...D,...s,thresholds:th,rates:s.rates||[],billBase:{...D.billBase,...(s.billBase||{})},
          openMs:utilHm(h.open),closeMs:utilHm(h.close)};
}

// ค่าที่มีผลในวันนั้น (ตัวคูณ / บาทต่อหน่วย) — แถวล่าสุดที่ effective_from <= iso
function utilValueAt(rates,meterId,field,iso,dflt){
  let best=null;
  for(const r of rates||[])
    if(r.meter_id===meterId&&r.field===field&&r.effective_from<=iso&&(!best||r.effective_from>best.effective_from)) best=r;
  return best?Number(best.value):dflt;
}

// แถวดิบ → เรียงตามเวลา · ตัด void / เลขไม่ใช่ตัวเลข
function utilPrep(readings,meterId,openMs){
  return (readings||[]).filter(r=>r&&r.meter_id===meterId&&r.status!=='void'&&r.reading!==''&&Number.isFinite(+r.reading))
    .map(r=>({reading:+r.reading,reset:utilTrue(r.meter_reset),paper:!r.ts,
              t:r.ts?(typeof r.ts==='number'?r.ts:Date.parse(r.ts)):utilMarketStart(utilIdx(r.read_date),openMs)}))
    .filter(r=>Number.isFinite(r.t)).sort((a,b)=>a.t-b.t);
}

// ช่วงระหว่างการจดที่ใช้ได้ {p,q,d} + สิ่งผิดปกติในข้อมูล
//   เลขถอยหลัง (ไม่ได้ติ๊กเปลี่ยนมิเตอร์) → ข้ามแถวนั้น เทียบแถวถัดไปกับตัวก่อนหน้าแทน
//   (ถ้าใช้เป็นจุดตั้งต้นใหม่ พิมพ์ผิด 109 แทน 1009 → ครั้งถัดไปจะกลายเป็นใช้ 900+ หน่วย)
//   เปลี่ยนมิเตอร์ → ช่วงนั้นไม่รู้ว่าใช้เท่าไหร่ (ไม่นับ) เลขใหม่เป็นจุดตั้งต้น
function utilSegments(rows){
  const segs=[],anomalies=[]; let p=null;
  for(const q of rows){
    if(!p||q.reset){ if(p) anomalies.push({kind:'reset',t:q.t}); p=q; continue; }
    const d=q.reading-p.reading;
    if(d<0){ anomalies.push({kind:'backward',t:q.t,from:p.reading,to:q.reading}); continue; }
    if(q.t>p.t) segs.push({p,q,d});
    p=q;
  }
  return {segs,anomalies};
}

// ใช้ต่อวันตลาด — กระจายผลต่างตามเวลาที่คาบวันนั้น × ตัวคูณที่มีผล "วันนั้น"
//   cover = สัดส่วนของวันที่มีข้อมูลครอบ (1 = ครบวัน) · est = มาจากช่วงห่างเกิน 1.5 วัน (เฉลี่ยวันขาดจด)
function utilDaily(segs,meterId,S){
  const days=new Map();
  for(const {p,q,d} of segs){
    const span=q.t-p.t, est=span>1.5*UTIL_DAY;
    for(let k=utilMarketIdx(p.t,S.openMs);utilMarketStart(k,S.openMs)<q.t;k++){
      const s=Math.max(p.t,utilMarketStart(k,S.openMs)), e=Math.min(q.t,utilMarketStart(k+1,S.openMs));
      if(e<=s) continue;
      const iso=utilIso(k), o=days.get(k)||{idx:k,date:iso,units:0,cover:0,est:false,span:0};
      o.units+=d*(e-s)/span*utilValueAt(S.rates,meterId,'multiplier',iso,1);
      o.cover+=(e-s)/UTIL_DAY; o.est=o.est||est; o.span=Math.max(o.span,span/UTIL_DAY);   // span = ช่วงจดยาวสุดที่คาบวันนี้ (วัน)
      days.set(k,o);
    }
  }
  return [...days.values()].sort((a,b)=>a.idx-b.idx);
}

// ช่วงที่อยู่ใน "ตลาดปิด" ล้วนๆ (ปิด → เปิดของวันตลาดเดียวกัน) → หน่วย/ชม.
//   ช่วงที่มีเวลาเปิดปน ไม่เอามาตัดสินรั่ว (คนใช้จริงจะกลายเป็นธงปลอม)
function utilClosed(segs,meter,S){
  const th=S.thresholds[meter.type]||{}, edge=S.edgeMin*60e3, gap=(S.closeMs-S.openMs+UTIL_DAY)%UTIL_DAY, out=[];
  for(const {p,q,d} of segs){
    const k=utilMarketIdx(p.t+edge,S.openMs);
    const from=utilMarketStart(k,S.openMs)+gap, to=utilMarketStart(k+1,S.openMs);
    if(p.t<from-edge||q.t>to+edge) continue;
    const hours=(q.t-p.t)/3600e3, iso=utilIso(k);
    const rate=d*utilValueAt(S.rates,meter.meter_id,'multiplier',iso,1)/hours;
    out.push({date:iso,from:p.t,to:q.t,hours,rate,level:th.closedRate==null?null:rate>th.closedRate?'red':'green'});
  }
  return out;
}

// ค่าเฉลี่ยต่อวันจากบิล (UTIL-21) = ฐานชั่วคราวช่วงแรกที่ยังจดไม่พอหาค่ากลาง
//   ใช้บิลของเดือนที่ใช้จริง "ก่อน" เดือนของวันนั้น (เดือนที่พุ่งไม่ดึงฐานของตัวเองขึ้น) · n เดือนล่าสุด
//   เดือนที่เก่ากว่า maxAge เดือนไม่นับ · ไม่เหลือเลย = null (BN-E-TEMP บิลล่าสุด ก.พ. 69 ไม่ใช่ภาพปัจจุบัน)
// bills = [{bill_month, meter_id, units}] (units เป็นข้อความมีคอมม่าได้ · ไม่มีแถว void)
// คืน {perDay, months:[เดือนที่ใช้จริง]} | null
function utilBillDaily(bills,meterId,iso,S){
  const per={}, B=S.billBase||UTIL_DEFAULTS.billBase;
  for(const b of bills||[]){
    const u=Number(String(b.units??'').replace(/[,\s]/g,''));
    if(b.meter_id!==meterId||!(u>0)) continue;
    const k=utilBillUsageMonth(b.bill_month,S.billMonthOffset);
    per[k]=(per[k]||0)+u;
  }
  const ix=k=>{ const [y,m]=k.split('-').map(Number); return y*12+m; };
  const mo=iso.slice(0,7), ks=Object.keys(per).sort().filter(k=>k<mo&&ix(mo)-ix(k)<=B.maxAge).slice(-B.n);
  if(!ks.length) return null;
  const dim=k=>{ const [y,m]=k.split('-').map(Number); return new Date(Date.UTC(y,m,0)).getUTCDate(); };
  return {perDay:ks.reduce((s,k)=>s+per[k]/dim(k),0)/ks.length,months:ks};
}

// เลือกฐาน: ค่ากลาง (หลัก) → ค่าเฉลี่ยจากบิล (ช่วงแรก) → ไม่มี
//   ฐานตั้งต้นแบบกรอกเอง (baseline) เอาออก 15 ต.ค. 69 — ไม่มีหน้าให้กรอก ค่าเฉลี่ยบิลทำหน้าที่แทน
//   mult = 1 รายวัน · 7 รายสัปดาห์ · ตั้ง o.base / o.baseFrom ('median'|'bill'|null) / o.billMonths
function utilPickBase(o,hist,meter,S,bills,iso,mult){
  let fb;
  if(hist.length>=S.baseMinDays){ o.base=utilMedian(hist); o.baseFrom='median'; }
  else if((fb=utilBillDaily(bills,meter.meter_id,iso,S))){ o.base=fb.perDay*mult; o.baseFrom='bill'; o.billMonths=fb.months; }
  else{ o.base=null; o.baseFrom=null; }
}

// ฐาน + ป้ายรายวัน (เรียงตามเวลา — วันที่แดงไปแล้วถูกตัดออกจากฐานของวันหลัง)
//   ฐาน = ค่ากลางของวันเดียวกันในสัปดาห์ ย้อน baseWeeks สัปดาห์ · ข้ามวันแดง/รั่ว · ข้ามวันข้อมูลไม่ครบ
//   ค่ากลางยังไม่พอ (ช่วงแรก) → utilPickBase ใช้ค่าเฉลี่ยจากบิล
//   ป้าย: ต้องเกินทั้ง "กี่เท่า" และ "เพิ่มขั้นต่ำ" = เส้นแดงคือค่าที่สูงกว่าระหว่าง ฐาน×red กับ ฐาน+minDiff
function utilFlags(days,meter,S,bills){
  const th=S.thresholds[meter.type], byIdx=new Map(days.map(d=>[d.idx,d])), bad=new Set();
  let streak=0,lastIdx=null,lastHot=false;
  for(const d of days){
    if(d.cover<0.999){ d.level='partial'; continue; }
    const hist=[];
    for(let w=1;w<=S.baseWeeks;w++){ const h=byIdx.get(d.idx-7*w); if(h&&h.cover>=0.999&&!bad.has(h.idx)) hist.push(h.units); }
    utilPickBase(d,hist,meter,S,bills,d.date,1);
    if(d.base==null){ d.level='nodata'; lastHot=false; lastIdx=d.idx; continue; }
    d.ratio=d.base>0?d.units/d.base:Infinity; d.diff=d.units-d.base;
    const over=x=>d.ratio>x&&d.diff>=th.minDiff;
    d.level=over(th.red)?'red':over(th.yellow)?'yellow':'green';
    const hot=d.level!=='green';
    streak=hot?(lastHot&&lastIdx===d.idx-1?streak+1:1):0;
    if(d.level==='yellow'&&streak>=th.streak) d.level='leak';
    if(d.level==='red'||d.level==='leak') bad.add(d.idx);
    lastHot=hot; lastIdx=d.idx;
  }
  return days;
}

// เส้นเกณฑ์ของวันนั้น (ขีดบนกราฟ) — สูตรเดียวกับ over() ใน utilFlags: ต้องเกินทั้ง "กี่เท่า" และ "เพิ่มขั้นต่ำ"
//   → เส้น = ค่าที่สูงกว่าระหว่าง ฐาน×เท่า กับ ฐาน+minDiff · แท่งสูงกว่าเส้น = ขึ้นธงสีนั้น (ยกเว้นวันข้อมูลไม่ครบ)
//   ไม่มีฐาน = null (กราฟเว้นช่วงเส้น ไม่ลากผ่าน)
function utilBands(day,th){
  if(!day||day.base==null) return {base:null,yellow:null,red:null};
  const b=day.base, line=x=>Math.max(b*x,b+th.minDiff);
  return {base:b,yellow:line(th.yellow),red:line(th.red)};
}

// วิเคราะห์ 1 มิเตอร์ · meter = {meter_id, type:'water'|'elec', branch_code} · now = ms (ส่งเข้ามาเพื่อให้เทสต์ได้)
//   bills = บิลของสาขา (ไม่ส่ง = ไม่มีฐานจากบิล · ผู้ไม่มีสิทธิ์ยอดเงินอ่านบิลไม่ได้)
function utilAnalyze(readings,meter,settings,now,bills){
  const S=utilSettings(settings,meter.branch_code), rows=utilPrep(readings,meter.meter_id,S.openMs);
  const {segs,anomalies}=utilSegments(rows), last=rows.length?rows[rows.length-1]:null;
  const ageDays=last?(now-last.t)/UTIL_DAY:null, staleDays=S.thresholds[meter.type]?.staleDays??S.staleDays;
  return {days:utilFlags(utilDaily(segs,meter.meter_id,S),meter,S,bills),closed:utilClosed(segs,meter,S),anomalies,
          last:last&&last.t,ageDays,staleDays,stale:last==null||ageDays>staleDays};
}

// ── รายสัปดาห์ (UTIL-13 · ไฟจดทุกวันจันทร์ 14:00) ──
// รวมวันตลาดเป็นสัปดาห์ จันทร์–อาทิตย์ · วันตลาดเริ่ม 14:00 → จดจันทร์ 14:00 = ขอบสัปดาห์พอดี (1 ช่วงจด = 1 สัปดาห์เต็ม)
//   ธงรายวันใช้กับไฟไม่ได้: ช่วงจด 7 วันถูกเฉลี่ยเท่ากันทุกวัน แท่งรายวันแบนเหมือนจดทุกวันทั้งที่ไม่ได้จด
//   ฐาน = ค่ากลางสัปดาห์เต็มย้อน baseWeeks สัปดาห์ (ข้ามสัปดาห์แดง · น้อยกว่า baseMinDays = ค่าเฉลี่ยบิล × 7)
//   เกณฑ์ "กี่เท่า" เท่ารายวัน · "เพิ่มขั้นต่ำ" = minDiff ต่อวัน × 7 · ไม่มีธงรั่ว (3 รอบติด = 3 สัปดาห์ ช้าเกินมีความหมาย)
// days = ผลจาก utilAnalyze().days · คืน [{idx, date (จันทร์), end (อาทิตย์), units, cover (วัน), est, base, ratio, diff, level}]
function utilWeekIdx(dayIdx){ return dayIdx-((dayIdx+3)%7); }   // idx 0 = 1970-01-01 วันพฤหัส → (idx+3)%7 = 0 คือวันจันทร์
function utilWeekly(days,meter,S,bills){
  const th=S.thresholds[meter.type]||S.thresholds.water, by=new Map();
  for(const d of days||[]){
    const w=utilWeekIdx(d.idx), o=by.get(w)||{idx:w,date:utilIso(w),end:utilIso(w+6),units:0,cover:0,est:false};
    // est ของสัปดาห์ = ช่วงจดยาวเกิน 7.5 วัน (ขาดจดวันจันทร์) · est รายวัน (>1.5 วัน) จริงทุกสัปดาห์สำหรับไฟ ใช้ไม่ได้
    o.units+=d.units; o.cover+=d.cover; o.est=o.est||(d.span||0)>7.5; by.set(w,o);
  }
  const weeks=[...by.values()].sort((a,b)=>a.idx-b.idx), bad=new Set(), minDiff=th.minDiff*7;
  for(const w of weeks){
    if(w.cover<6.999){ w.level='partial'; continue; }
    const hist=[];
    for(let k=1;k<=S.baseWeeks;k++){ const h=by.get(w.idx-7*k); if(h&&h.cover>=6.999&&!bad.has(h.idx)) hist.push(h.units); }
    utilPickBase(w,hist,meter,S,bills,utilIso(w.idx+3),7);   // เดือนของสัปดาห์ = เดือนของวันพฤหัส
    if(w.base==null){ w.level='nodata'; continue; }
    w.ratio=w.base>0?w.units/w.base:Infinity; w.diff=w.units-w.base;
    const over=x=>w.ratio>x&&w.diff>=minDiff;
    w.level=over(th.red)?'red':over(th.yellow)?'yellow':'green';
    if(w.level==='red') bad.add(w.idx);
  }
  return weeks;
}
// เส้นเกณฑ์ของสัปดาห์ — สูตรเดียวกับ over() ใน utilWeekly
function utilWeekBands(w,th){
  if(!w||w.base==null) return {base:null,yellow:null,red:null};
  const b=w.base, line=x=>Math.max(b*x,b+th.minDiff*7);
  return {base:b,yellow:line(th.yellow),red:line(th.red)};
}

// ── ตรวจบิลรายเดือน (UTIL-09) ──
// ชั้น 1 สูงผิดปกติ: หน่วย > ค่ากลาง lookback บิลก่อนหน้าของมิเตอร์เดียวกัน × ratio และเกินฐานอย่างน้อย minDiff
//   ฐานเป็นค่ากลาง ไม่ใช่ค่าเฉลี่ย (เดือนพุ่งเดือนเดียวไม่ดึงฐานขึ้น) · ต้องมีบิลก่อนหน้า ≥ minPrev
//   ไม่ตรวจ warmup เดือนแรกนับจากบิลใบแรกของ "สาขา" (ช่วงเปิดสาขายอดไต่ขึ้นเป็นปกติ)
//     ไม่นับจากมิเตอร์ — BN เปิด ม.ค. 69 แต่บิลน้ำเริ่ม มี.ค. ถ้านับจากมิเตอร์จะพลาดเคส ก.ค.–ก.ย. ที่ต้องจับ
// ชั้น 2 ข้อมูลต้องเช็ค: หน่วย+เงินซ้ำกับบิลใดบิลหนึ่งใน lookback บิลก่อน (คัดลอกผิด) · หน่วยเลขกลมหลักพัน (ยอดประมาณ)
// bills = [{bill_month, branch_code, type, meter_id, units, amount}] (ตัวเลขแล้ว · ไม่มีแถว void)
// คืน [{bill_month, meter_id, branch_code, type, units, amount, high:{base,pct}|null, dup:'YYYY-MM'|null, round:bool}]
// เกณฑ์ตรวจบิล = ค่าตั้งต้น + ค่าจาก settings/utility (แก้แค่บางช่องได้) — ใช้ร่วมกับหน้าจอ (ค่ากลางบิล · กล่องวิธีคิด)
function utilBillCfg(settings){
  const s=(settings||{}).billCheck||{}, D=UTIL_DEFAULTS.billCheck;
  return {...D,...s,minDiff:{...D.minDiff,...(s.minDiff||{})}};
}
function utilBillCheck(bills,settings){
  const C=utilBillCfg(settings);
  const first={}, byMeter={};
  for(const b of bills||[]){
    if(!first[b.branch_code]||b.bill_month<first[b.branch_code]) first[b.branch_code]=b.bill_month;
    (byMeter[b.meter_id]=byMeter[b.meter_id]||[]).push(b);
  }
  const mIdx=ym=>{ const [y,m]=ym.split('-').map(Number); return y*12+m-1; };
  const out=[];
  for(const rows of Object.values(byMeter)){
    rows.sort((a,b)=>a.bill_month<b.bill_month?-1:1);
    rows.forEach((b,i)=>{
      const prev=rows.slice(Math.max(0,i-C.lookback),i), u=Number(b.units)||0;
      const r={bill_month:b.bill_month,meter_id:b.meter_id,branch_code:b.branch_code,type:b.type,units:u,amount:b.amount,high:null,dup:null,round:false};
      const pu=prev.map(p=>Number(p.units)||0).filter(x=>x>0);
      if(u>0&&pu.length>=C.minPrev&&mIdx(b.bill_month)-mIdx(first[b.branch_code])>=C.warmup){
        const base=utilMedian(pu), min=C.minDiff[b.type]??0;
        if(u>base*C.ratio&&u-base>=min) r.high={base,pct:(u/base-1)*100};
      }
      // UTIL-23: บิลแบบหน่วยอย่างเดียว (ไม่มีสิทธิ์เงิน) ไม่มียอดเงิน → ไม่ตัดสินว่าซ้ำ (ไม่งั้น 0 = 0 ขึ้น ? ทุกเดือนที่หน่วยเท่ากัน)
      const d=Number(b.amount)>0?[...prev].reverse().find(p=>u>0&&Number(p.units)===u&&Number(p.amount)===Number(b.amount)):null;
      if(d) r.dup=d.bill_month;
      r.round=u>=1000&&u%1000===0;
      out.push(r);
    });
  }
  return out;
}

// เดือนในบิล → เดือนที่ใช้จริง ('2026-10', -1 → '2026-09')
function utilBillUsageMonth(billMonth,offset){
  const [y,m]=billMonth.split('-').map(Number), n=y*12+(m-1)+(offset??UTIL_DEFAULTS.billMonthOffset);
  return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
}

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
  staleDays:2,       // ไม่มีการจดเกินนี้ = เตือนบนการ์ด
  baseWeeks:4,       // ฐาน = วันเดียวกันในสัปดาห์ ย้อนกี่สัปดาห์
  baseMinDays:2,     // วันปกติเหลือน้อยกว่านี้ → ใช้ฐานตั้งต้น (baseline) แทน
  thresholds:{
    water:{yellow:1.5,red:2,minDiff:10,streak:3,closedRate:0.5},
    elec:{yellow:1.5,red:2,minDiff:100,streak:3,closedRate:null}  // ไฟ: ยังไม่มีข้อมูลจริง minDiff/closedRate เป็นค่าเดา
  },
  baseline:{},       // ฐานตั้งต้นต่อมิเตอร์ {meter_id: หน่วย/วัน} — แก้ทับได้ (กระทบอดีต)
  rates:[],          // [{meter_id, field:'multiplier'|'rate', value, effective_from}] — ห้ามแก้ย้อน (ADR 0001)
  billMonthOffset:-1 // บิลเดือน M = ใช้จริงเดือน M-1 (เทียบใบจดบางนา ก.ย.–ต.ค. 69) — รอบัญชียืนยัน
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
  return {...D,...s,thresholds:th,baseline:{...(s.baseline||{})},rates:s.rates||[],
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
      const iso=utilIso(k), o=days.get(k)||{idx:k,date:iso,units:0,cover:0,est:false};
      o.units+=d*(e-s)/span*utilValueAt(S.rates,meterId,'multiplier',iso,1);
      o.cover+=(e-s)/UTIL_DAY; o.est=o.est||est;
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

// ฐาน + ป้ายรายวัน (เรียงตามเวลา — วันที่แดงไปแล้วถูกตัดออกจากฐานของวันหลัง)
//   ฐาน = ค่ากลางของวันเดียวกันในสัปดาห์ ย้อน baseWeeks สัปดาห์ · ข้ามวันแดง/รั่ว · ข้ามวันข้อมูลไม่ครบ
//   ป้าย: ต้องเกินทั้ง "กี่เท่า" และ "เพิ่มขั้นต่ำ" = เส้นแดงคือค่าที่สูงกว่าระหว่าง ฐาน×red กับ ฐาน+minDiff
function utilFlags(days,meter,S){
  const th=S.thresholds[meter.type], byIdx=new Map(days.map(d=>[d.idx,d])), bad=new Set();
  let streak=0,lastIdx=null,lastHot=false;
  for(const d of days){
    if(d.cover<0.999){ d.level='partial'; continue; }
    const hist=[];
    for(let w=1;w<=S.baseWeeks;w++){ const h=byIdx.get(d.idx-7*w); if(h&&h.cover>=0.999&&!bad.has(h.idx)) hist.push(h.units); }
    const fromMedian=hist.length>=S.baseMinDays;
    d.base=fromMedian?utilMedian(hist):(S.baseline[meter.meter_id]??null);
    d.baseFrom=fromMedian?'median':d.base==null?null:'setting';
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
function utilAnalyze(readings,meter,settings,now){
  const S=utilSettings(settings,meter.branch_code), rows=utilPrep(readings,meter.meter_id,S.openMs);
  const {segs,anomalies}=utilSegments(rows), last=rows.length?rows[rows.length-1]:null;
  const ageDays=last?(now-last.t)/UTIL_DAY:null;
  return {days:utilFlags(utilDaily(segs,meter.meter_id,S),meter,S),closed:utilClosed(segs,meter,S),anomalies,
          last:last&&last.t,ageDays,stale:last==null||ageDays>S.staleDays};
}

// เป็นเงิน = หน่วย × บาท/หน่วยที่มีผลวันนั้น · ไม่มีราคา = null (อย่าเดาเป็น 0)
function utilCost(units,meterId,iso,settings){
  const r=utilValueAt((settings||{}).rates,meterId,'rate',iso,null);
  return r==null?null:units*r;
}

// เดือนในบิล → เดือนที่ใช้จริง ('2026-10', -1 → '2026-09')
function utilBillUsageMonth(billMonth,offset){
  const [y,m]=billMonth.split('-').map(Number), n=y*12+(m-1)+(offset??UTIL_DEFAULTS.billMonthOffset);
  return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
}

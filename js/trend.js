// ============================================================
// trend.js — TREND-01: "ตอนนี้กำลังไปทางไหน" (ฟังก์ชันล้วน ไม่แตะ DOM · เทสต์: tests/trend.test.js)
// ============================================================
// เทียบ "เฉลี่ย/วัน 7 วันล่าสุด" กับ "7 วันก่อนหน้านั้น"
//   ทำไม 7: ตลาดขึ้นลงตามวันในสัปดาห์ (ส.-อา. คนเยอะ) หน้าต่างครบ 7 วันหักผลนี้ออกเอง
//   ทำไมไม่เทียบทั้งช่วงที่เลือก: นั่นตอบ "ช่วงนี้ดีกว่าช่วงก่อนไหม" ไม่ใช่ "ตอนนี้ขึ้นหรือลง"
const TREND_WIN=7;         // วันต่อหน้าต่าง
const TREND_MIN_DAYS=4;    // หน้าต่างไหนมีข้อมูลน้อยกว่านี้ = ไม่สรุปทิศทาง (ข้อมูลไม่พอ)
const TREND_FLAT_PCT=2;    // เปลี่ยนไม่ถึง ±2% = ทรงตัว (กันลูกศรสะบัดจากความผันผวนปกติ)
const TREND_SMALL=20;      // ค่าเฉลี่ยต่ำกว่านี้ → แสดงเป็น "จำนวน/วัน" แทน % (4.5→5.4 = +20% ดูน่าตกใจเกินจริง)
const TREND_SMALL_FLAT=0.5;// ...และเปลี่ยนไม่ถึง 0.5/วัน = ทรงตัว

// เลขวันแบบไม่สนเวลา/โซนเวลา — ใช้หาว่าแถวไหนอยู่ในหน้าต่าง
function trendDayIdx(d){ return Math.round(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5); }

// rows = แถวทั้งหมดของสาขา+โซนที่เลือก (ไม่ตัดตามช่วงเวลา — หน้าต่างก่อนหน้าอาจอยู่นอกช่วงที่เลือก)
// anchor = วันล่าสุดของช่วงที่ดูอยู่ · pick(r) = ค่าของแถวนั้น
// คืน null ถ้าข้อมูลไม่พอ · dir = 'up' | 'down' | 'flat'
function trendOf(rows,anchor,pick){
  if(!rows||!rows.length||!anchor) return null;
  const A=trendDayIdx(anchor);
  let s1=0,n1=0,s0=0,n0=0;
  for(const r of rows){
    if(!r||!r.date) continue;
    const k=A-trendDayIdx(r.date);
    if(k>=0&&k<TREND_WIN){s1+=pick(r)||0;n1++;}
    else if(k>=TREND_WIN&&k<2*TREND_WIN){s0+=pick(r)||0;n0++;}
  }
  if(n1<TREND_MIN_DAYS||n0<TREND_MIN_DAYS) return null;
  const cur=s1/n1, prev=s0/n0, diff=cur-prev;
  const pct=prev>0?diff/prev*100:null;
  const small=Math.max(cur,prev)<TREND_SMALL;
  let dir='flat';
  if(small||pct===null){ if(Math.abs(diff)>=TREND_SMALL_FLAT) dir=diff>0?'up':'down'; }
  else if(Math.abs(pct)>=TREND_FLAT_PCT) dir=diff>0?'up':'down';
  return {cur,prev,diff,pct,dir,small:small||pct===null};
}

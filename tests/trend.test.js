// ============================================================
// tests/trend.test.js — ทิศทางตอนนี้ (TREND-01) · รัน: node --test tests/
// ============================================================
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm');
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..','js','trend.js'),'utf8')+
  '\n;Object.assign(globalThis,{trendOf});');

const D=(y,m,d)=>new Date(y,m-1,d);
// สร้างแถวย้อนหลัง n วันจาก end · val(i) i=0 คือวันล่าสุด
const days=(end,n,val)=>Array.from({length:n},(_,i)=>{const d=new Date(end);d.setDate(end.getDate()-i);return{date:d,v:val(i)};});
const END=D(2026,9,23), pick=r=>r.v;

test('ขึ้น: 7 วันล่าสุดเฉลี่ย 420 เทียบ 400 = +5%',()=>{
  const t=trendOf(days(END,14,i=>i<7?420:400),END,pick);
  assert.equal(t.dir,'up'); assert.equal(t.cur,420); assert.equal(t.prev,400);
  assert.equal(Math.round(t.pct*10)/10,5); assert.equal(t.small,false);
});

test('ลง และทรงตัวที่ขอบ ±2%',()=>{
  assert.equal(trendOf(days(END,14,i=>i<7?380:400),END,pick).dir,'down');
  assert.equal(trendOf(days(END,14,i=>i<7?407:400),END,pick).dir,'flat');   // +1.75%
  assert.equal(trendOf(days(END,14,i=>i<7?408:400),END,pick).dir,'up');     // +2% พอดี = ขึ้น
});

test('ค่าน้อย: ตัดสินด้วยจำนวน/วัน ไม่ใช่ %',()=>{
  const t=trendOf(days(END,14,i=>i<7?4.8:4.5),END,pick);                    // +6.7% แต่แค่ +0.3/วัน
  assert.equal(t.small,true); assert.equal(t.dir,'flat');
  assert.equal(trendOf(days(END,14,i=>i<7?5.4:4.5),END,pick).dir,'up');     // +0.9/วัน
});

test('ข้อมูลไม่พอ = null (ไม่เดาทิศทาง)',()=>{
  assert.equal(trendOf(days(END,10,()=>400),END,pick),null);                // หน้าต่างก่อนหน้ามี 3 วัน
  assert.equal(trendOf([],END,pick),null);
});

test('วันขาดในหน้าต่าง: เฉลี่ยเฉพาะวันที่มีข้อมูล · anchor ตามช่วงที่เลือก ไม่ใช่วันนี้',()=>{
  const rows=days(END,14,i=>i<7?420:400).filter((_,i)=>i!==2);              // วันที่ 3 หายไป
  assert.equal(trendOf(rows,END,pick).cur,420);
  const anchor=D(2026,9,16);                                                 // ดูย้อนหลัง: สัปดาห์ก่อน
  const t=trendOf(days(END,21,i=>i<7?999:i<14?420:400),anchor,pick);
  assert.equal(t.cur,420); assert.equal(t.prev,400);                        // ไม่เอา 999 ที่อยู่หลัง anchor
});

test('ก่อนหน้าเป็น 0: ไม่หารศูนย์ ใช้จำนวนแทน',()=>{
  const t=trendOf(days(END,14,i=>i<7?3:0),END,pick);
  assert.equal(t.pct,null); assert.equal(t.dir,'up'); assert.equal(t.small,true);
});

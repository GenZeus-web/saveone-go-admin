// ============================================================
// tests/pricing.test.js — เทสต์กติการาคา (PRICE-01)
// รัน: node --test tests/
// โหลด config.js + utils.js แบบ classic script เหมือนในเบราว์เซอร์ (global scope)
// ============================================================
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm');

global.localStorage={getItem:()=>null,setItem:()=>{}};
global.document={getElementById:()=>null};
const src=['config.js','utils.js'].map(f=>fs.readFileSync(path.join(__dirname,'..','js',f),'utf8')).join('\n');
vm.runInThisContext(src+'\n;globalThis.__setBranch=b=>{activeBranch=b};'+
  'Object.assign(globalThis,{revST,revNon,calcDiscount,getNonPrice,nonPriceAt,seasonOf,lockPrices,rainHalvesWalkIn});');

// เสาร์ 19 ก.ย. 2569 (low season, วันหยุด)
const row=(o={})=>({date:new Date(2026,8,19),onlineLock:300,walkInLock:20,extraLock:0,
  nonOnlineLock:100,nonWalkInLock:10,nonExtraLock:0,freeDay:false,...o});
const rev=(r,br)=>revST(r,'all',br)+revNon(r,'all',br);

test('ตารางราคา Car ตามสาขา × season × วัน',()=>{
  assert.equal(nonPriceAt('BG',9,false),250); assert.equal(nonPriceAt('BG',9,true),300);
  assert.equal(nonPriceAt('BG',12,false),300); assert.equal(nonPriceAt('BG',12,true),350);
  assert.equal(nonPriceAt('BN',9,false),200); assert.equal(nonPriceAt('BN',2,true),300);
  assert.equal(nonPriceAt('SS',12,true),30);
});

test('ฤดูกาล: high = พ.ย.–ก.พ. · รอยต่อทุกจุด',()=>{
  const high=[11,12,1,2], low=[3,4,5,6,7,8,9,10];
  high.forEach(m=>assert.equal(seasonOf(m),'high',`เดือน ${m}`));
  low.forEach(m=>assert.equal(seasonOf(m),'low',`เดือน ${m}`));
  // ราคาเปลี่ยนจริงตรงรอยต่อ (BG วันธรรมดา)
  assert.equal(nonPriceAt('BG',10,false),250); assert.equal(nonPriceAt('BG',11,false),300); // ต.ค.→พ.ย.
  assert.equal(nonPriceAt('BG',2,false),300);  assert.equal(nonPriceAt('BG',3,false),250);  // ก.พ.→มี.ค.
  assert.equal(nonPriceAt('BN',12,true),300);  assert.equal(nonPriceAt('BN',1,true),300);   // ธ.ค.→ม.ค. ข้ามปี
  // ผ่าน Date จริง: 31 ต.ค. vs 1 พ.ย. 2569 (วันเสาร์/อาทิตย์)
  assert.equal(getNonPrice(new Date(2026,9,31),'BG'),300);
  assert.equal(getNonPrice(new Date(2026,10,1),'BG'),350);
  // ST ไม่เปลี่ยนตาม season
  assert.deepEqual(lockPrices(new Date(2026,9,31),'st','BG'),lockPrices(new Date(2026,10,1),'st','BG'));
});

test('ราคาป้ายต่อล็อก: ST ทุกสาขาเท่ากัน · Car วอล์กอิน +50 · SS Non ราคาเดียว',()=>{
  const d=new Date(2026,8,19);
  for(const br of ['SS','BG','BN']) assert.deepEqual(lockPrices(d,'st',br),{po:130,pw:160});
  assert.deepEqual(lockPrices(d,'non','BG'),{po:300,pw:350});
  assert.deepEqual(lockPrices(d,'non','SS'),{po:30,pw:30});
});

test('รายรับ 1 วันของแต่ละสาขา (ตัวเลขอ้างอิง)',()=>{
  assert.equal(rev(row(),'BG'),75700);
  assert.equal(rev(row(),'BN'),70200);
  assert.equal(rev(row(),'SS'),45500);
});

test('วันฝน: SS ลดเฉพาะออนไลน์ · BG/BN ลดครึ่งทุกประเภท',()=>{
  const r=row({freeDay:true});
  assert.equal(revST(r,'walkin','SS'),20*160);
  assert.equal(revST(r,'walkin','BG'),20*160/2);
  assert.equal(rainHalvesWalkIn('SS'),false);
  assert.equal(rainHalvesWalkIn('BN'),true);
  assert.equal(calcDiscount(r,'all','SS'),300*130*0.5+100*30*0.5);
});

// บั๊กเดิม: Benchmark คิดรายรับสาขาอื่นด้วยราคาของสาขาที่เปิดดูอยู่
test('ส่งสาขาเอง = ไม่ขึ้นกับสาขาที่เปิดดูอยู่ (Benchmark)',()=>{
  for(const viewing of ['SS','BG','BN']){
    __setBranch(viewing);
    assert.equal(rev(row(),'BG'),75700,`เปิดดู ${viewing} แล้วคิดรายรับ BG`);
  }
});

test('ไม่ส่งสาขา = ใช้สาขาที่เปิดดูอยู่ (หน้าอื่นเรียกแบบเดิม)',()=>{
  __setBranch('BN');
  assert.equal(revST(row())+revNon(row()),70200);
  assert.equal(getNonPrice(new Date(2026,8,19)),250);
});

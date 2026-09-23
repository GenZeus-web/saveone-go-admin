// ============================================================
// tests/pricing.test.js — เทสต์กติการาคา (PRICE-01 · SET-01)
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
  'Object.assign(globalThis,{revST,revNon,calcDiscount,getNonPrice,lockPrices,rainHalvesWalkIn,'+
  'priceCellFor,setPricing,seasonAt,pricingVersionAt,DEFAULT_PRICING});');

const clone=o=>JSON.parse(JSON.stringify(o));
// เสาร์ 19 ก.ย. 2569 (low season, วันหยุด)
const row=(o={})=>({date:new Date(2026,8,19),onlineLock:300,walkInLock:20,extraLock:0,
  nonOnlineLock:100,nonWalkInLock:10,nonExtraLock:0,freeDay:false,...o});
const rev=(r,br)=>revST(r,'all',br)+revNon(r,'all',br);
const D=(y,m,d)=>new Date(y,m-1,d);

test.beforeEach(()=>setPricing(null,'default'));

test('ค่าตั้งต้น = ราคาเดิมก่อนมีหน้าตั้งค่า (Car ตามสาขา × ฤดูกาล × วัน)',()=>{
  assert.equal(getNonPrice(D(2026,9,17),'BG'),250); assert.equal(getNonPrice(D(2026,9,19),'BG'),300);
  assert.equal(getNonPrice(D(2026,12,17),'BG'),300); assert.equal(getNonPrice(D(2026,12,19),'BG'),350);
  assert.equal(getNonPrice(D(2026,9,17),'BN'),200); assert.equal(getNonPrice(D(2027,2,20),'BN'),300);
  assert.equal(getNonPrice(D(2026,12,19),'SS'),30);
});

test('ฤดูกาลตั้งต้น: high = 1 พ.ย.–29 ก.พ. · รอยต่อทุกจุด',()=>{
  const v=pricingVersionAt(D(2026,9,23));
  const s=(y,m,d)=>seasonAt(v,'BG',D(y,m,d)).key;
  assert.equal(s(2026,10,31),'low');  assert.equal(s(2026,11,1),'high');   // ต.ค.→พ.ย.
  assert.equal(s(2027,2,28),'high');  assert.equal(s(2027,3,1),'low');     // ก.พ.→มี.ค.
  assert.equal(s(2028,2,29),'high');                                       // ปีอธิกสุรทิน
  assert.equal(s(2026,12,31),'high'); assert.equal(s(2027,1,1),'high');    // ข้ามปี
  assert.equal(getNonPrice(D(2026,10,31),'BG'),300);  // ส. low
  assert.equal(getNonPrice(D(2026,11,1),'BG'),350);   // อา. high
});

test('ราคาป้ายต่อล็อก: ST ทุกสาขาเท่ากัน · Car วอล์กอิน +50 · SS Non ราคาเดียว',()=>{
  const d=D(2026,9,19);
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

// ── SET-01: ชุดราคามีวันเริ่มใช้ ──
function withNewVersion(effective, edit){
  const base=clone(DEFAULT_PRICING.versions[0]);
  const v=clone(base); v.id='v2'; v.effective=effective; edit(v);
  setPricing({versions:[base,v]},'fresh');
}

test('ขึ้นราคามีผลตั้งแต่วันเริ่มใช้ · วันก่อนหน้าคิดราคาเดิมเสมอ (ADR 0001)',()=>{
  withNewVersion('2026-11-01', v=>{ v.prices.BG.high.non.on=[320,380]; });
  assert.equal(getNonPrice(D(2026,10,31),'BG'),300);   // ก่อนวันเริ่มใช้ = ราคาเดิม
  assert.equal(getNonPrice(D(2026,11,1),'BG'),380);    // อา. 1 พ.ย. = ราคาใหม่ ศ–อา
  assert.equal(getNonPrice(D(2026,11,2),'BG'),320);    // จ. = ราคาใหม่ ธรรมดา
  assert.equal(getNonPrice(D(2025,12,1),'BG'),300);    // high ปีก่อน ไม่เปลี่ยน
  assert.equal(rev(row(),'BG'),75700);                 // ยอด 19 ก.ย. ไม่เปลี่ยน
});

test('ตั้งล่วงหน้าหลายชุด: แต่ละช่วงใช้ชุดของตัวเอง',()=>{
  const base=clone(DEFAULT_PRICING.versions[0]);
  const a=clone(base); a.id='a'; a.effective='2026-11-01'; a.prices.BG.low.non.on=[280,330]; a.prices.BG.high.non.on=[280,330];
  const b=clone(a);    b.id='b'; b.effective='2027-03-01'; b.prices.BG.low.non.on=[260,310]; b.prices.BG.high.non.on=[260,310];
  setPricing({versions:[b,base,a]},'fresh');           // ลำดับใน array ไม่สำคัญ
  assert.equal(getNonPrice(D(2026,10,29),'BG'),250);
  assert.equal(getNonPrice(D(2026,11,2),'BG'),280);
  assert.equal(getNonPrice(D(2027,3,2),'BG'),260);
  // ยกเลิกชุด a → ช่วงนั้นกลับไปใช้ราคาเดิม ชุด b ยังอยู่
  setPricing({versions:[base,b]},'fresh');
  assert.equal(getNonPrice(D(2026,11,2),'BG'),300);    // high เดิม
  assert.equal(getNonPrice(D(2027,3,2),'BG'),260);
});

test('เลื่อนช่วงฤดูกาลมีผลเฉพาะหลังวันเริ่มใช้',()=>{
  withNewVersion('2027-10-01', v=>{
    v.seasons.BG=[{key:'high',name:'High',from:[10,15],to:[2,29]},{key:'low',name:'Low',from:[3,1],to:[10,14]}];
  });
  assert.equal(getNonPrice(D(2026,10,20),'BG'),250);   // ปีนี้ 20 ต.ค. ยัง low
  assert.equal(getNonPrice(D(2027,10,20),'BG'),300);   // ปีหน้า 20 ต.ค. เป็น high แล้ว
});

test('ฤดูกาลทับกัน → ช่วงที่สั้นกว่าชนะ',()=>{
  withNewVersion('2026-10-01', v=>{
    v.seasons.BG.push({key:'sk',name:'สงกรานต์',from:[4,10],to:[4,16]});
    v.prices.BG.sk={st:{on:[150,150],wi:[180,180]},non:{on:[400,400],wi:[450,450]}};
  });
  assert.equal(getNonPrice(D(2027,4,12),'BG'),400);
  assert.deepEqual(lockPrices(D(2027,4,12),'st','BG'),{po:150,pw:180});
  assert.equal(getNonPrice(D(2027,4,17),'BG'),300);    // ส. หลังเทศกาล = low ศ–อา
});

test('ST แยกราคาตามฤดูกาลได้ · วอล์กอิน Car ตั้งเองได้ (ไม่ผูก +50)',()=>{
  withNewVersion('2026-11-01', v=>{
    v.prices.SS.high.st={on:[110,140],wi:[140,170]};
    v.prices.BN.high.non.wi=[330,390];
  });
  assert.deepEqual(lockPrices(D(2026,11,2),'st','SS'),{po:110,pw:140});
  assert.deepEqual(lockPrices(D(2026,10,30),'st','SS'),{po:130,pw:160}); // ศ. ก่อนวันเริ่มใช้
  assert.deepEqual(lockPrices(D(2026,11,6),'non','BN'),{po:300,pw:390});
});

test('ไม่ส่งสาขา = ใช้สาขาที่เปิดดูอยู่ (หน้าอื่นเรียกแบบเดิม)',()=>{
  __setBranch('BN');
  assert.equal(revST(row())+revNon(row()),70200);
  assert.equal(getNonPrice(D(2026,9,19)),250);
});

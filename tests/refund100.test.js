// ============================================================
// tests/refund100.test.js — FreeDay = 100 คืนเต็มวัน (REFUND-01)
// ช่อง FreeDay ในชีต: n = ปกติ · 50 (หรือ 1 แถวเก่า) = ฝนลดครึ่ง · 100 = คืน 100% (เช่น วันน้ำท่วม 26–27 ก.ย. 69)
// รัน: node --test tests/
// ============================================================
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm');

global.localStorage={getItem:()=>null,setItem:()=>{}};
global.document={getElementById:()=>null};
const src=['config.js','utils.js'].map(f=>fs.readFileSync(path.join(__dirname,'..','js',f),'utf8')).join('\n');
const ctx={localStorage:global.localStorage,document:global.document,console};
vm.createContext(ctx);
vm.runInContext(src+'\n;this.api={revST,revNon,revSTNormal,revNonNormal,calcDiscount,isRainDay,mapST,mapNon,setPricing};',ctx);
const A=ctx.api;

const csvRow=(fd,o={})=>({'วันที่':'26/09/2026','Online_Lock':'300','Online_Rai':'100','WalkIn_Lock':'20','WalkIn_Rai':'5',
  'ล็อกเสริม-Lock':'4','ล็อกเสริม_Rai':'2','Cancel_Lock':'0','Absent_Lock':'0','Cancel_Rai':'0','Absent_Rai':'0','FreeDay':fd,...o});

test.beforeEach(()=>A.setPricing(null,'default'));

test('อ่านช่อง FreeDay: n/0/ว่าง = ปกติ · 50/1/true = ฝน · 100 = คืนเต็ม',()=>{
  for(const [v,fd,full] of [['n',false,false],['0',false,false],['',false,false],['1',true,false],['TRUE',true,false],['50',true,false],['100',true,true],[' 100 ',true,true],['10',false,false]]){
    for(const map of [A.mapST,A.mapNon]){
      const r=map(csvRow(v));
      assert.equal(r.freeDay,fd,`${map===A.mapST?'ST':'Non'} "${v}" freeDay`);
      assert.equal(!!r.full,full,`${map===A.mapST?'ST':'Non'} "${v}" full`);
    }
  }
});

for(const br of ['BG','BN','SS']){
  test(`${br}: คืนเต็ม → รายรับ 0 · ส่วนลด = รายรับปกติทั้งก้อน`,()=>{
    const st=A.mapST(csvRow('100')), non=A.mapNon(csvRow('100'));
    const r={...st,nonOnlineLock:non.onlineLock,nonWalkInLock:non.walkInLock,nonExtraLock:non.extraLock,nonFree:non.freeDay,nonFull:non.full};
    assert.equal(A.revST(r,'all',br),0);
    assert.equal(A.revNon(r,'all',br),0);
    const normal=A.revSTNormal(r,'all',br)+A.revNonNormal(r,'all',br);
    assert.ok(normal>0);
    assert.equal(A.calcDiscount(r,'all',br),normal);
    assert.equal(A.isRainDay(r),true);
  });

  test(`${br}: ฝน (50) ยังลดเท่าเดิม · รายรับ + ส่วนลด = รายรับปกติ`,()=>{
    const st=A.mapST(csvRow('50')), non=A.mapNon(csvRow('50'));
    const r={...st,nonOnlineLock:non.onlineLock,nonWalkInLock:non.walkInLock,nonExtraLock:non.extraLock,nonFree:non.freeDay,nonFull:non.full};
    const normal=A.revSTNormal(r,'all',br)+A.revNonNormal(r,'all',br);
    const got=A.revST(r,'all',br)+A.revNon(r,'all',br);
    assert.ok(got<normal&&got>0);
    assert.equal(got+A.calcDiscount(r,'all',br),normal);
  });
}

test('คืนเต็มเฉพาะ Car (ST ปกติ) → ST เต็มราคา · Car 0',()=>{
  const st=A.mapST(csvRow('n')), non=A.mapNon(csvRow('100'));
  const r={...st,nonOnlineLock:non.onlineLock,nonWalkInLock:non.walkInLock,nonExtraLock:non.extraLock,nonFree:non.freeDay,nonFull:non.full};
  assert.equal(A.revST(r,'all','BG'),A.revSTNormal(r,'all','BG'));
  assert.equal(A.revNon(r,'all','BG'),0);
  assert.equal(A.calcDiscount(r,'all','BG'),A.revNonNormal(r,'all','BG'));
});

test('แยกกลุ่ม (online/walkin/extra) รวมกันเท่ากับ all ในวันคืนเต็ม',()=>{
  const st=A.mapST(csvRow('100'));
  const r={...st,nonOnlineLock:50,nonWalkInLock:5,nonExtraLock:1,nonFree:true,nonFull:true};
  const sum=['online','walkin','extra'].reduce((s,g)=>s+A.calcDiscount(r,g,'BN'),0);
  assert.equal(sum,A.calcDiscount(r,'all','BN'));
});

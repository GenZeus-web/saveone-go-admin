// ============================================================
// tests/util-calc.test.js — น้ำ-ไฟ (UTIL-01) · รัน: node --test tests/
// ตัวเลขจริง: ใบจดน้ำบางนา ก.ย.–ต.ค. 2569 (กระดาษ ไม่มีเวลาจด)
// ============================================================
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm');
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..','js','util-calc.js'),'utf8')+
  '\n;Object.assign(globalThis,{utilAnalyze,utilValueAt,utilCost,utilBillUsageMonth,utilMedian,utilBands,UTIL_DEFAULTS});');

const OFFICE={meter_id:'BN-W-OFFICE',type:'water',branch_code:'BN'};
const TOILET={meter_id:'BN-W-TOILET',type:'water',branch_code:'BN'};
const NOW=Date.parse('2026-10-13T15:00:00+07:00');
const paper=(meter_id,rows)=>rows.map(([read_date,reading])=>({read_date,meter_id,reading:String(reading),status:'ok',ts:''}));
const at=(meter_id,ts,reading,o={})=>({ts,meter_id,reading,status:'ok',...o});
const day=(res,iso)=>res.days.find(d=>d.date===iso);
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);

// ── ใบจดบางนา (ถอดจากรูป) ──
const BN_OFFICE=paper('BN-W-OFFICE',[['2026-09-04',1009],['2026-09-05',1020],['2026-09-06',1027],['2026-09-07',1040],
  ['2026-09-08',1048],['2026-09-11',1059],['2026-09-12',1063],['2026-09-13',1068],['2026-09-14',1076],
  ['2026-09-15',1081],['2026-09-16',1086],['2026-09-18',1096],['2026-10-01',1139],['2026-10-02',1145],
  ['2026-10-04',1153],['2026-10-05',1158],['2026-10-06',1164],['2026-10-08',1169],['2026-10-09',1175],
  ['2026-10-10',1178],['2026-10-11',1183],['2026-10-12',1188]]);
const BN_TOILET=paper('BN-W-TOILET',[['2026-09-18',7017],['2026-10-02',7454],['2026-10-04',7515]]);

test('เกณฑ์ผ่านเฟส 5: บางนา 1 ต.ค. สำนักงาน = 3.3 หน่วย/วัน (43 ÷ 13) ไม่ใช่ 43',()=>{
  const r=utilAnalyze(BN_OFFICE,OFFICE,{},NOW);
  // จด 18 ก.ย. → 1 ต.ค. = วันตลาด 18–30 ก.ย. (13 วัน) ได้วันละเท่ากัน
  for(const iso of ['2026-09-18','2026-09-25','2026-09-30']) near(day(r,iso).units,43/13);
  near(r.days.filter(d=>d.date>='2026-09-18'&&d.date<='2026-09-30').reduce((s,d)=>s+d.units,0),43);
  assert.equal(day(r,'2026-09-25').est,true);                         // มาจากช่วงขาดจด
  assert.equal(day(r,'2026-09-04').units,11); assert.equal(day(r,'2026-09-04').est,false);
});

test('ห้องน้ำ 2 ต.ค. ใบจดลง 437 = 14 วัน → 31.2/วัน (ไม่ใช่รั่ว)',()=>{
  const r=utilAnalyze(BN_TOILET,TOILET,{},NOW);
  near(day(r,'2026-09-20').units,437/14);
  near(day(r,'2026-10-02').units,61/2);
});

test('ผลรวมรายวัน = ผลต่างเลขไมล์ทั้งช่วง (ไม่มีหน่วยหาย/ซ้ำ)',()=>{
  const r=utilAnalyze(BN_OFFICE,OFFICE,{},NOW);
  near(r.days.reduce((s,d)=>s+d.units,0),1188-1009);
});

test('ตัวคูณเปลี่ยนกลางช่วง: วันก่อน effective_from ไม่เปลี่ยน',()=>{
  const rates=[{meter_id:'BN-W-OFFICE',field:'multiplier',value:1,effective_from:'2026-01-01'},
               {meter_id:'BN-W-OFFICE',field:'multiplier',value:30,effective_from:'2026-09-25'}];
  const r=utilAnalyze(BN_OFFICE,OFFICE,{rates},NOW);
  near(day(r,'2026-09-24').units,43/13);
  near(day(r,'2026-09-25').units,43/13*30);
  assert.equal(day(r,'2026-09-04').units,11);
});

test('ใช้ค่าที่มีผลตามวัน (utilValueAt / utilCost)',()=>{
  const rates=[{meter_id:'X',field:'rate',value:7.45,effective_from:'2026-01-01'},
               {meter_id:'X',field:'rate',value:4.9,effective_from:'2027-02-01'}];
  assert.equal(utilValueAt(rates,'X','rate','2026-12-31',null),7.45);
  assert.equal(utilValueAt(rates,'X','rate','2027-02-01',null),4.9);
  assert.equal(utilValueAt(rates,'X','rate','2025-12-31',null),null);
  near(utilCost(100,'X','2027-03-01',{rates}),490);
  assert.equal(utilCost(100,'Y','2027-03-01',{rates}),null);          // ไม่มีราคา ≠ 0 บาท
});

test('แถว void ไม่ถูกนับ',()=>{
  const rows=[...BN_OFFICE,{read_date:'2026-09-25',meter_id:'BN-W-OFFICE',reading:'2000',status:'void',ts:''}];
  near(day(utilAnalyze(rows,OFFICE,{},NOW),'2026-09-25').units,43/13);
});

test('เลขถอยหลัง (พิมพ์ผิด) → ข้ามแถวนั้น ไม่ติดลบ ไม่เป็นจุดตั้งต้นใหม่',()=>{
  const rows=paper('BN-W-OFFICE',[['2026-10-04',1153],['2026-10-05',115],['2026-10-06',1164]]);
  const r=utilAnalyze(rows,OFFICE,{},NOW);
  assert.equal(r.anomalies[0].kind,'backward');
  assert.ok(r.days.every(d=>d.units>=0));
  near(day(r,'2026-10-05').units,5.5);                                // 1153 → 1164 ใน 2 วัน
});

test('เปลี่ยนมิเตอร์ (meter_reset) → ช่วงนั้นไม่นับ · เลขใหม่เป็นจุดตั้งต้น',()=>{
  const rows=[...paper('BN-W-OFFICE',[['2026-10-04',1153],['2026-10-06',3],['2026-10-07',9]])];
  rows[1].meter_reset='TRUE';
  const r=utilAnalyze(rows,OFFICE,{},NOW);
  assert.equal(r.anomalies[0].kind,'reset');
  assert.equal(day(r,'2026-10-04'),undefined);
  assert.equal(day(r,'2026-10-06').units,6);
});

// ── วันตลาด: เปิด 14:00 ปิด 01:00 คร่อมเที่ยงคืน ──
test('จดตี 1 ครึ่ง = ยอดของวันตลาดก่อนหน้า',()=>{
  const rows=[at('M','2026-10-01T14:00:00+07:00',100),at('M','2026-10-02T01:30:00+07:00',130),
              at('M','2026-10-02T14:00:00+07:00',132)];
  const r=utilAnalyze(rows,{meter_id:'M',type:'water',branch_code:'BN'},{},NOW);
  assert.equal(r.days.length,1);
  assert.equal(r.days[0].date,'2026-10-01'); assert.equal(r.days[0].units,32);
});

test('ตอนปิดล้วน (01:30 → 13:45): น้ำเกิน 0.5/ชม. = แดง',()=>{
  const M={meter_id:'M',type:'water',branch_code:'BN'};
  const rows=[at('M','2026-10-02T01:30:00+07:00',100),at('M','2026-10-02T13:45:00+07:00',113)];
  const c=utilAnalyze(rows,M,{},NOW).closed;
  assert.equal(c.length,1); assert.equal(c[0].date,'2026-10-01');
  near(c[0].rate,13/12.25); assert.equal(c[0].level,'red');
  const ok=utilAnalyze([rows[0],at('M','2026-10-02T13:45:00+07:00',103)],M,{},NOW).closed[0];
  assert.equal(ok.level,'green');
});

test('ช่วงที่มีเวลาเปิดปน ไม่เอามาตัดสินรั่ว',()=>{
  const M={meter_id:'M',type:'water',branch_code:'BN'};
  const pairs=[['2026-10-01T23:00:00+07:00','2026-10-02T14:00:00+07:00'],   // แบบ ข: ช่างจด 23:00 (ตลาดยังเปิด)
               ['2026-10-02T01:30:00+07:00','2026-10-02T15:00:00+07:00'],   // ก่อนเปิดจดช้า (ตลาดเปิดไปแล้ว 1 ชม.)
               ['2026-10-01T14:00:00+07:00','2026-10-02T14:00:00+07:00']];  // จดรอบเดียว
  for(const [a,b] of pairs) assert.equal(utilAnalyze([at('M',a,100),at('M',b,150)],M,{},NOW).closed.length,0,a);
  // คลาดไม่เกิน 15 นาที ยังนับเป็นช่วงปิดล้วน
  assert.equal(utilAnalyze([at('M','2026-10-02T00:50:00+07:00',100),at('M','2026-10-02T14:10:00+07:00',101)],M,{},NOW).closed.length,1);
});

test('ไฟ: ยังไม่ตั้งเกณฑ์ตอนปิด → รายงานหน่วย/ชม. แต่ไม่ให้ป้าย',()=>{
  const E={meter_id:'E',type:'elec',branch_code:'BN'};
  const rows=[at('E','2026-10-02T01:30:00+07:00',100),at('E','2026-10-02T13:30:00+07:00',400)];
  const c=utilAnalyze(rows,E,{},NOW).closed[0];
  assert.equal(c.rate,25); assert.equal(c.level,null);
});

// ── ฐาน + ป้าย ──
// สร้างจดก่อนเปิดทุกวัน · use(i) = หน่วยของวันที่ i (เริ่ม 2026-08-03 จันทร์)
function daily(useOf,n,start='2026-08-03'){
  const rows=[]; let v=1000; const s=Date.parse(start+'T14:00:00+07:00');
  for(let i=0;i<=n;i++){ rows.push(at('W',s+i*864e5,v)); v+=useOf(i)||0; }
  return rows;
}
const W={meter_id:'W',type:'water',branch_code:'BN'};
const lv=(r,i)=>r.days[i].level;

test('ค่ากลาง ไม่ใช่ค่าเฉลี่ย (วันฝนตก 20 ไม่ดึงฐานลง)',()=>{
  assert.equal(utilMedian([36,37,38,20]),36.5);
  assert.equal(utilMedian([36,37,38]),37);
});

test('ฐาน = วันเดียวกันในสัปดาห์ 4 สัปดาห์ก่อน · เสาร์ไม่ปนกับวันธรรมดา',()=>{
  // จ.–ศ. ใช้ 37 · ส.–อา. ใช้ 70 (คนเยอะ) → เสาร์สัปดาห์ที่ 5 ต้องเขียว
  const r=utilAnalyze(daily(i=>[5,6].includes(i%7)?70:37,35),W,{},NOW);
  const sat=r.days[33];
  assert.equal(new Date(sat.idx*864e5).getUTCDay(),6);
  assert.equal(sat.base,70); assert.equal(sat.baseFrom,'median'); assert.equal(sat.level,'green');
});

test('ข้อมูลไม่พอ → ใช้ฐานตั้งต้น · ไม่มีฐานตั้งต้น → nodata',()=>{
  assert.equal(lv(utilAnalyze(daily(()=>37,5),W,{},NOW),2),'nodata');
  const r=utilAnalyze(daily(()=>37,5),W,{baseline:{W:29}},NOW);
  assert.equal(r.days[2].base,29); assert.equal(r.days[2].baseFrom,'setting');
});

test('เส้นแดง = ค่าที่สูงกว่าระหว่าง ฐาน×2 กับ ฐาน+10',()=>{
  const one=(base,use)=>lv(utilAnalyze(daily(()=>use,1),W,{baseline:{W:base}},NOW),0);
  assert.equal(one(5,10),'green');     // 2 เท่าพอดี ไม่เกิน · +5
  assert.equal(one(5,14),'green');     // 2.8 เท่า แต่ +9 (มิเตอร์เล็ก)
  assert.equal(one(5,15),'red');       // 3 เท่า · +10
  assert.equal(one(37.5,60),'yellow'); // 1.6 เท่า · +22.5
  assert.equal(one(37.5,75),'yellow'); // 2 เท่าพอดี
  assert.equal(one(37.5,80),'red');    // 2.13 เท่า
});

test('เหลือง 3 วันติด = น่าจะรั่ว · ขาดตอนนับใหม่',()=>{
  const r=utilAnalyze(daily(i=>[0,1,3,4,5].includes(i)?60:37,6),W,{baseline:{W:37}},NOW);
  assert.deepEqual(r.days.map(d=>d.level),['yellow','yellow','green','yellow','yellow','leak']);
});

test('ตัดวันแดงออกจากฐาน: รั่วต่อเนื่อง 5 สัปดาห์ ธงไม่หายเอง',()=>{
  // 4 สัปดาห์ปกติ (37) แล้วรั่วเป็น 80 ทุกวันอีก 5 สัปดาห์
  const r=utilAnalyze(daily(i=>i<28?37:80,63),W,{baseline:{W:37}},NOW);
  assert.ok(r.days.slice(28).every(d=>d.level==='red'),r.days.slice(28).map(d=>d.level).join());
  assert.equal(r.days[62].base,37);    // ฐานไม่ถูกดึงขึ้นเป็น 80
});

test('วันที่ข้อมูลยังไม่ครบวัน = partial ไม่ให้ป้าย',()=>{
  const rows=[at('W','2026-10-01T14:00:00+07:00',100),at('W','2026-10-02T01:30:00+07:00',150)];
  assert.equal(utilAnalyze(rows,W,{baseline:{W:5}},NOW).days[0].level,'partial');
});

test('ขาดจดเกิน 2 วัน = เตือน',()=>{
  assert.equal(utilAnalyze(BN_OFFICE,OFFICE,{},NOW).stale,false);   // จดล่าสุด 12 ต.ค.
  assert.equal(utilAnalyze(BN_OFFICE,OFFICE,{},Date.parse('2026-10-15T15:00:00+07:00')).stale,true);
  assert.equal(utilAnalyze([],OFFICE,{},NOW).stale,true);
});

test('ตั้งเกณฑ์บางช่องจาก Firestore ได้ ช่องอื่นใช้ค่าตั้งต้น',()=>{
  const r=utilAnalyze(daily(()=>15,1),W,{baseline:{W:5},thresholds:{water:{minDiff:20}}},NOW);
  assert.equal(r.days[0].level,'green');                             // +10 ไม่ถึง 20
  assert.equal(UTIL_DEFAULTS.thresholds.water.minDiff,10);           // ค่าตั้งต้นไม่ถูกแก้ทับ
});

test('เดือนในบิล → เดือนที่ใช้จริง',()=>{
  assert.equal(utilBillUsageMonth('2026-10'),'2026-09');
  assert.equal(utilBillUsageMonth('2026-01'),'2025-12');
  assert.equal(utilBillUsageMonth('2026-10',0),'2026-10');
});

test('เส้นเกณฑ์บนกราฟตรงกับธงทุกวัน (แท่งเกินเส้น = ขึ้นธง)',()=>{
  const th=UTIL_DEFAULTS.thresholds.water;
  // ฐาน 5 · minDiff 10 → เส้นเหลือง = max(7.5, 15) = 15 · แดง = max(10, 15) = 15
  near(utilBands({base:5},th).yellow,15); near(utilBands({base:5},th).red,15);
  // ฐาน 40 → เหลือง = max(60, 50) = 60 · แดง = max(80, 50) = 80
  near(utilBands({base:40},th).yellow,60); near(utilBands({base:40},th).red,80);
  assert.equal(utilBands({base:null},th).red,null);
  const units=[30,35,40,45,61,79,81,200,40,38,59,60,90,42];
  const r=utilAnalyze(daily(i=>units[i%units.length],60),W,{baseline:{W:40}},NOW);
  let n=0;
  for(const d of r.days){
    if(d.base==null||d.level==='partial') continue;
    const b=utilBands(d,th), flag=d.level!=='green';
    assert.equal(d.units>b.yellow,flag,`${d.date} units ${d.units} เส้นเหลือง ${b.yellow} ธง ${d.level}`);
    assert.equal(d.units>b.red,d.level==='red',`${d.date} เส้นแดง`);
    n++;
  }
  assert.ok(n>40);
});

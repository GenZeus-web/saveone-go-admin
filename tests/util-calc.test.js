// ============================================================
// tests/util-calc.test.js — น้ำ-ไฟ (UTIL-01) · รัน: node --test tests/
// ตัวเลขจริง: ใบจดน้ำบางนา ก.ย.–ต.ค. 2569 (กระดาษ ไม่มีเวลาจด)
// ============================================================
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm');
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..','js','util-calc.js'),'utf8')+
  '\n;Object.assign(globalThis,{utilAnalyze,utilValueAt,utilBillUsageMonth,utilMedian,utilBands,utilBillCheck,utilBillCfg,utilSettings,utilRound,UTIL_DEFAULTS});');

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

test('ใช้ค่าที่มีผลตามวัน (utilValueAt)',()=>{
  const rates=[{meter_id:'X',field:'rate',value:7.45,effective_from:'2026-01-01'},
               {meter_id:'X',field:'rate',value:4.9,effective_from:'2027-02-01'}];
  assert.equal(utilValueAt(rates,'X','rate','2026-12-31',null),7.45);
  assert.equal(utilValueAt(rates,'X','rate','2027-02-01',null),4.9);
  assert.equal(utilValueAt(rates,'X','rate','2025-12-31',null),null);
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
  const rows=[at('M','2026-10-01T16:00:00+07:00',100),at('M','2026-10-02T01:30:00+07:00',130),
              at('M','2026-10-02T16:00:00+07:00',132)];
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
// สร้างจดทุกวันรอบ 16:00 · use(i) = หน่วยของวันที่ i (เริ่ม 2026-08-03 จันทร์)
function daily(useOf,n,start='2026-08-03'){
  const rows=[]; let v=1000; const s=Date.parse(start+'T16:00:00+07:00');
  for(let i=0;i<=n;i++){ rows.push(at('W',s+i*864e5,v)); v+=useOf(i)||0; }
  return rows;
}
const W={meter_id:'W',type:'water',branch_code:'BN'};
const lv=(r,i)=>r.days[i].level;
// ฐานช่วงแรกจากบิล: บิล ส.ค. 69 = ใช้จริง ก.ค. (31 วัน) → ค่าเฉลี่ยต่อวัน = perDay พอดี (แทน baseline เดิม)
const bb=perDay=>[{bill_month:'2026-08',meter_id:'W',units:String(perDay*31)}];

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

test('ข้อมูลไม่พอ → ใช้ค่าเฉลี่ยบิล · ไม่มีบิล → ค่าเฉลี่ยวันที่จดครบ (≥ 2 วัน) · ยังไม่ถึง 2 วัน → nodata',()=>{
  const r=utilAnalyze(daily(()=>37,5),W,{},NOW,bb(29));
  assert.equal(r.days[2].base,29); assert.equal(r.days[2].baseFrom,'bill');
  const a=utilAnalyze(daily(i=>[30,40,80][i]??35,5),W,{},NOW).days;   // UTIL-47 มิเตอร์ย่อยไม่มีบิล
  assert.deepEqual(a.slice(0,2).map(d=>d.level),['nodata','nodata']);
  assert.equal(a[2].baseFrom,'avg'); near(a[2].base,35); assert.equal(a[2].avgN,2); assert.equal(a[2].level,'red');   // 80 > 35×2 และ ≥ 35+10
  near(a[3].base,35);   // วันแดงไม่เข้าค่าเฉลี่ย
});

test('เส้นแดง = ค่าที่สูงกว่าระหว่าง ฐาน×2 กับ ฐาน+10',()=>{
  const one=(base,use)=>lv(utilAnalyze(daily(()=>use,1),W,{},NOW,bb(base)),0);
  assert.equal(one(5,10),'green');     // 2 เท่าพอดี ไม่เกิน · +5
  assert.equal(one(5,14),'green');     // 2.8 เท่า แต่ +9 (มิเตอร์เล็ก)
  assert.equal(one(5,15),'red');       // 3 เท่า · +10
  assert.equal(one(37.5,60),'yellow'); // 1.6 เท่า · +22.5
  assert.equal(one(37.5,75),'yellow'); // 2 เท่าพอดี
  assert.equal(one(37.5,80),'red');    // 2.13 เท่า
});

test('เหลือง 3 วันติด = น่าจะรั่ว · ขาดตอนนับใหม่',()=>{
  const r=utilAnalyze(daily(i=>[0,1,3,4,5].includes(i)?60:37,6),W,{},NOW,bb(37));
  assert.deepEqual(r.days.map(d=>d.level),['yellow','yellow','green','yellow','yellow','leak']);
});

test('ตัดวันแดงออกจากฐาน: รั่วต่อเนื่อง 5 สัปดาห์ ธงไม่หายเอง',()=>{
  // 4 สัปดาห์ปกติ (37) แล้วรั่วเป็น 80 ทุกวันอีก 5 สัปดาห์
  const r=utilAnalyze(daily(i=>i<28?37:80,63),W,{},NOW,bb(37));
  assert.ok(r.days.slice(28).every(d=>d.level==='red'),r.days.slice(28).map(d=>d.level).join());
  assert.equal(r.days[62].base,37);    // ฐานไม่ถูกดึงขึ้นเป็น 80
});

test('วันที่ข้อมูลยังไม่ครบวัน = partial ไม่ให้ป้าย',()=>{
  const rows=[at('W','2026-10-01T14:00:00+07:00',100),at('W','2026-10-02T01:30:00+07:00',150)];
  assert.equal(utilAnalyze(rows,W,{},NOW,bb(5)).days[0].level,'partial');
});

test('ขาดจดเกิน 2 วัน = เตือน',()=>{
  assert.equal(utilAnalyze(BN_OFFICE,OFFICE,{},NOW).stale,false);   // จดล่าสุด 12 ต.ค.
  assert.equal(utilAnalyze(BN_OFFICE,OFFICE,{},Date.parse('2026-10-15T15:00:00+07:00')).stale,true);
  assert.equal(utilAnalyze([],OFFICE,{},NOW).stale,true);
});

test('ตั้งเกณฑ์บางช่องจาก Firestore ได้ ช่องอื่นใช้ค่าตั้งต้น',()=>{
  const r=utilAnalyze(daily(()=>15,1),W,{thresholds:{water:{minDiff:20}}},NOW,bb(5));
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
  const r=utilAnalyze(daily(i=>units[i%units.length],60),W,{},NOW,bb(40));
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

// ── ตรวจบิลรายเดือน (UTIL-09) · หน่วยจากบิลจริง · ยอดเงินสมมติ (repo สาธารณะ ห้ามใส่ยอดจริง) ──
const bill=(br,type,meter_id,pairs)=>pairs.map(([bill_month,units])=>({bill_month,branch_code:br,type,meter_id,units,amount:units*16}));
const BN_BILLS=[
  ...bill('BN','elec','BN-E-MAIN',[['2026-01',3000]]),   // สาขาเปิด ม.ค. 69 (บิลน้ำเริ่ม มี.ค.)
  ...bill('BN','water','BN-W-OFFICE',[['2026-03',68],['2026-04',82],['2026-05',131],['2026-06',116],['2026-07',153],['2026-08',219],['2026-09',245],['2026-10',142]]),
  ...bill('BN','water','BN-W-TOILET',[['2026-03',960],['2026-04',844],['2026-05',646],['2026-06',727],['2026-07',887],['2026-08',1156],['2026-09',1282],['2026-10',1035]])];
const highs=r=>r.filter(x=>x.high).map(x=>x.meter_id+'@'+x.bill_month);

test('ตรวจบิล: จับน้ำบางนาพุ่ง บิล ก.ค.–ก.ย. 69 ที่ตัวตรวจรายวันไม่เห็น',()=>{
  assert.deepEqual(highs(utilBillCheck(BN_BILLS)).sort(),
    ['BN-W-OFFICE@2026-07','BN-W-OFFICE@2026-08','BN-W-OFFICE@2026-09','BN-W-TOILET@2026-08','BN-W-TOILET@2026-09']);
  const r=utilBillCheck(BN_BILLS).find(x=>x.meter_id==='BN-W-OFFICE'&&x.bill_month==='2026-09');
  assert.equal(r.high.base,123.5); near(r.high.pct,245/123.5*100-100);    // ค่ากลาง 6 บิลก่อน (116+131)/2
});

test('ตรวจบิล: ช่วงเปิดสาขา 6 เดือนแรกไม่ตรวจ (นับจากบิลใบแรกของสาขา ไม่ใช่ของมิเตอร์)',()=>{
  const bg=bill('BG','elec','BG-E-1',[['2023-10',651],['2023-11',14931],['2023-12',18693],['2024-01',21397],['2024-02',22123],['2024-03',32448],['2024-04',31039]]);
  assert.deepEqual(highs(utilBillCheck(bg)),['BG-E-1@2024-04']);          // ม.ค.–มี.ค. 67 ไต่ขึ้นช่วงเปิด ไม่ขึ้นธง
  // ถ้านับจากมิเตอร์ BN น้ำ (เริ่ม มี.ค.) จะไม่ตรวจถึง ก.ย. — นับจากสาขา (ม.ค.) ต้องตรวจตั้งแต่ ก.ค.
  assert.ok(highs(utilBillCheck(BN_BILLS)).includes('BN-W-OFFICE@2026-07'));
});

test('ตรวจบิล: เพิ่มน้อยกว่าขั้นต่ำไม่ขึ้นธง แม้เกิน 30%',()=>{
  const r=utilBillCheck(bill('SS','water','W',[['2026-01',20],['2026-02',22],['2026-03',21],['2026-04',40]]),{billCheck:{warmup:0}});
  assert.deepEqual(highs(r),[]);                                          // +19 หน่วย < 50
});

test('ตรวจบิล: ข้อมูลต้องเช็ค (เปิด ask) — ซ้ำบิลก่อนทุกหลัก (ย้อนได้ 6 ใบ) · เลขกลมไม่ขึ้น ?',()=>{
  const ON={billCheck:{ask:true}};
  const rows=[...bill('BG','water','BG-W-MAIN',[['2026-06',645],['2026-07',607],['2026-08',646],['2026-09',607]]),
              ...bill('BN','elec','BN-E-MAIN',[['2026-08',40000],['2026-09',33000],['2026-10',33417]])];
  const r=utilBillCheck(rows,ON), at=(m,mo)=>r.find(x=>x.meter_id===m&&x.bill_month===mo);
  assert.equal(at('BG-W-MAIN','2026-09').dup,'2026-07');                  // ไม่ใช่เดือนติดกันก็จับได้
  assert.equal(at('BG-W-MAIN','2026-08').dup,null);
  assert.equal(at('BN-E-MAIN','2026-09').dup,null);                       // UTIL-45: 33000 กลม (มิเตอร์ ×1000) ไม่ใช่ความผิดปกติ
  assert.equal('round' in at('BN-E-MAIN','2026-09'),false);
  const diffAmt=[...bill('X','water','X',[['2026-01',100]]),{bill_month:'2026-02',branch_code:'X',type:'water',meter_id:'X',units:100,amount:1}];
  assert.equal(utilBillCheck(diffAmt,ON)[1].dup,null);                    // หน่วยเท่าแต่เงินต่าง = ไม่ใช่คัดลอก
  // UTIL-36: ค่าตั้งต้น = ปิด → ไม่มี ? เลย แต่ธงบิลสูง (high) ยังตรวจเหมือนเดิม
  const off=utilBillCheck(rows), atO=(m,mo)=>off.find(x=>x.meter_id===m&&x.bill_month===mo);
  assert.equal(atO('BG-W-MAIN','2026-09').dup,null);
  assert.deepEqual(highs(utilBillCheck(BN_BILLS)),highs(utilBillCheck(BN_BILLS,ON)));
});

// ── UTIL-37 ไฟจดรายวันเหมือนน้ำ (ที่ประชุม 21 ต.ค. 69 · เดิม UTIL-13 จดทุกวันจันทร์ ดูรายสัปดาห์) ──
const ELEC1={meter_id:'BG-E-1',type:'elec',branch_code:'BG'};
const el=(iso,reading)=>at('BG-E-1',Date.parse(iso+'T16:00:00+07:00'),reading);
const isoAdd=(iso,n)=>new Date(Date.parse(iso+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
// จดทุกวัน 16:00 เริ่ม start · per(k) = หน่วยที่ใช้วันที่ k (นับจาก 0)
const elDaily=(start,n,per)=>{ const r=[el(start,0)]; let v=0; for(let k=0;k<n;k++){ v+=per(k); r.push(el(isoAdd(start,k+1),v)); } return r; };

test('ไฟจดรายวัน: เลยไป 1 วันยังไม่เตือน · 3 วันเตือน (เหมือนน้ำ)',()=>{
  const r=[el('2026-10-12',1000)], t=n=>Date.parse('2026-10-12T16:00:00+07:00')+n*864e5;
  assert.equal(utilAnalyze(r,ELEC1,{},t(1)).stale,false);
  assert.equal(utilAnalyze(r,ELEC1,{},t(3)).stale,true);
  assert.equal(utilAnalyze(r,ELEC1,{},t(3)).staleDays,2);
});

test('ไฟรายวัน: จด 16:00 = วันละ 1 ช่อง จดครบ · ค่ากลางวันเดียวกัน 4 สัปดาห์ · พุ่ง = แดง ไม่เข้าฐาน',()=>{
  const spike=27;   // วันที่ 28 พุ่ง 2,000 (ปกติ 900)
  const days=utilAnalyze(elDaily('2026-10-19',36,k=>k===spike?2000:900),ELEC1,{},NOW).days;
  assert.equal(days.length,36); assert.ok(days.every(d=>Math.abs(d.cover-1)<1e-9&&!d.est));
  assert.equal(days[0].date,'2026-10-19'); near(days[0].units,900);
  assert.equal(days[spike].level,'red'); near(days[spike].base,900);   // 2,000 > 900 × 2 และ ≥ 900 + 100
  assert.equal(days[spike+7].level,'green'); near(days[spike+7].base,900);   // วันแดงไม่ดึงค่ากลางสัปดาห์ถัดไป
});

test('ไฟรายวัน: เพิ่มขั้นต่ำ minDiff 100 ต่อวัน · มิเตอร์เล็กเกิน 2 เท่าแต่เพิ่มไม่ถึง 100 = เขียว',()=>{
  const days=utilAnalyze(elDaily('2026-10-19',15,k=>k===14?120:40),ELEC1,{},NOW).days;
  near(days[14].ratio,3); assert.equal(days[14].level,'green');
});

test('เปลี่ยนจากจดวันจันทร์มาจดรายวัน: ช่วงที่ยังจดรายสัปดาห์ = ยอดเฉลี่ย (est) · หลังจากนั้นจดครบ',()=>{
  const r=[el('2026-10-12',0),el('2026-10-19',6300),el('2026-10-20',7200),el('2026-10-21',8100)];
  const days=utilAnalyze(r,ELEC1,{},NOW).days;
  assert.ok(days.filter(d=>d.date<'2026-10-19').every(d=>d.est)); near(days[0].units,900);
  assert.deepEqual(days.filter(d=>d.date>='2026-10-19').map(d=>d.est),[false,false]);
});

// ── UTIL-21 ช่วงแรกค่ากลางยังไม่พอ → ค่าเฉลี่ยต่อวันจาก 3 บิลล่าสุด ──
// บิล BG-E-1 ก.ค.–ก.ย. 69 = ใช้จริง มิ.ย.–ส.ค. (billMonthOffset −1)
const BG_E1_BILLS=[['2026-06','28148'],['2026-07','28,394'],['2026-08','28790'],['2026-09','26837']]
  .map(([bill_month,units])=>({bill_month,meter_id:'BG-E-1',units}));   // หน่วยเป็นข้อความมีคอมม่าได้ (CSV จากชีต)
test('ไฟช่วงแรก: ค่ากลางยังไม่พอ → ค่าเฉลี่ยต่อวัน 3 บิลล่าสุด · ครบ 2 ครั้งวันเดียวกันกลับไปใช้ค่ากลาง',()=>{
  const days=utilAnalyze(elDaily('2026-10-19',15,k=>k===1?1500:k===14?1300:900),ELEC1,{},NOW,BG_E1_BILLS).days;
  const avg=(28394/30+28790/31+26837/31)/3;   // ต.ค. → ใช้จริงก่อน ต.ค. 3 เดือน = มิ.ย. ก.ค. ส.ค. (บิล ก.ค.–ก.ย.)
  assert.equal(days[0].baseFrom,'bill'); near(days[0].base,avg); assert.deepEqual(days[0].billMonths,['2026-06','2026-07','2026-08']);
  assert.equal(days[0].level,'green');
  assert.equal(days[1].level,'yellow');   // 1,500 > ~914 × 1.5 แต่ไม่ถึง × 2
  assert.equal(days[14].baseFrom,'median'); near(days[14].base,900);   // วันจันทร์ 19 + 26 ต.ค. จดครบแล้ว
});
test('ค่าเฉลี่ยบิล: ไม่ใช้บิลเดือนเดียวกับวันนั้น · เดือนที่เก่าเกิน 4 เดือน = ไม่ใช้',()=>{
  const bills=[{bill_month:'2026-02',meter_id:'W',units:'310'},{bill_month:'2026-10',meter_id:'W',units:'600'}];   // ใช้จริง ม.ค. · ก.ย.
  const one=(iso,s={})=>utilAnalyze(daily(()=>20,1,iso),W,s,NOW,bills).days[0];
  const sep=one('2026-09-10');   // ก.ย. ใช้บิลก่อน ก.ย. ได้แค่ ม.ค. (เก่า 8 เดือน) → ไม่มีฐาน
  assert.equal(sep.base,null); assert.equal(sep.level,'nodata');
  const oct=one('2026-10-10');   // ต.ค. → ใช้จริง ก.ย. 600/30 = 20 ต่อวัน
  assert.equal(oct.baseFrom,'bill'); near(oct.base,20); assert.deepEqual(oct.billMonths,['2026-09']);
  assert.equal(utilAnalyze(daily(()=>20,1,'2026-10-10'),W,{},NOW).days[0].level,'nodata');   // ไม่ส่งบิล (ไม่มีสิทธิ์ยอดเงิน)
});

// ── UTIL-47 ตัดวันที่รอบจด 16:00 (เดิม 14:00 = เวลาเปิด) · จดคลาดรอบ = เฉลี่ยเต็มวันไปก่อน ──
// เลขจริง SG 22–23 ต.ค. 69 (แอป · มีรูป) · ห้องน้ำ A ใบกระดาษจดถึง 31 ส.ค. แล้วเว้นไป
const SG_MAIN={meter_id:'SG-W-MAIN',type:'water',branch_code:'BG'}, SG_A={meter_id:'SG-W-TOILET-A',type:'water',branch_code:'BG'};
const SG_NOW=Date.parse('2026-10-23T16:30:00+07:00');
test('1 วัน = เลขครั้งนี้ − ครั้งก่อน: จด 16:03 → 15:58 วันถัดไป = 5 (เฉลี่ยเต็มวัน) ไม่ถูกหั่นเป็น 2 วัน',()=>{
  const d=utilAnalyze([at('SG-W-MAIN','2026-10-22T16:03:00+07:00',9197),at('SG-W-MAIN','2026-10-23T15:58:00+07:00',9202)],SG_MAIN,{},SG_NOW).days;
  assert.equal(d.length,1); assert.equal(d[0].date,'2026-10-22');
  near(d[0].units,5,0.05); assert.equal(d[0].cover,1); assert.ok(d[0].fill>0.99&&d[0].fill<1);
  assert.notEqual(d[0].level,'partial');
});
test('วันแรกที่กลับมาจด: คาบช่วงขาดจดแค่ไม่กี่นาที = ไม่ใช่ยอดเฉลี่ย · ยอด ≈ เลขที่จดได้',()=>{
  const rows=[...paper('SG-W-TOILET-A',[['2026-08-31',6975]]),at('SG-W-TOILET-A','2026-10-22T16:01:00+07:00',7377),at('SG-W-TOILET-A','2026-10-23T16:09:00+07:00',7387)];
  const r=utilAnalyze(rows,SG_A,{},SG_NOW), d22=day(r,'2026-10-22'), d21=day(r,'2026-10-21');
  assert.equal(d22.est,false); near(d22.units,10,0.1);
  assert.equal(d21.est,true);   // 31 ส.ค. → 22 ต.ค. = ยอดเฉลี่ย
});
test('จดคลาดรอบไม่เกิน ~2 ชม. = เฉลี่ยเต็มวัน · ขาดเกินนั้น = จดยังไม่ครบ · รอบหน้ามาแล้วได้ยอดจริง',()=>{
  const M={meter_id:'M',type:'water',branch_code:'BG'};
  const two=(a,b)=>utilAnalyze([at('M',a,100),at('M',b,124)],M,{},SG_NOW).days[0];
  const early=two('2026-10-21T16:00:00+07:00','2026-10-22T15:00:00+07:00');   // จดเร็ว 1 ชม. (UTIL-43 ±1 ชม.)
  near(early.units,24*24/23); assert.equal(early.cover,1);
  assert.equal(two('2026-10-21T16:00:00+07:00','2026-10-22T10:00:00+07:00').level,'partial');   // 18 ชม. = 75%
  const full=utilAnalyze([at('M','2026-10-21T16:00:00+07:00',100),at('M','2026-10-22T15:00:00+07:00',124),at('M','2026-10-23T16:00:00+07:00',149)],M,{},SG_NOW).days[0];
  near(full.units,24+1); assert.equal(full.fill,undefined);   // 15:00–16:00 ได้จากรอบถัดไป (25 ÷ 25 ชม.)
});

// ── UTIL-16 หน้าตั้งค่าเกณฑ์ (settings/utility) ──
test('เกณฑ์บิลจากหน้าตั้งค่า: แก้บางช่อง ที่เหลือใช้ค่าตั้งต้น', ()=>{
  const C=utilBillCfg({billCheck:{ratio:1.5,minDiff:{water:80}}});
  assert.equal(C.ratio,1.5); assert.equal(C.lookback,UTIL_DEFAULTS.billCheck.lookback);
  assert.deepEqual(C.minDiff,{water:80,elec:UTIL_DEFAULTS.billCheck.minDiff.elec});
  assert.deepEqual(utilBillCfg(null),{...UTIL_DEFAULTS.billCheck,minDiff:{...UTIL_DEFAULTS.billCheck.minDiff}});
});
test('เกณฑ์บิลจากหน้าตั้งค่ามีผลกับตัวตรวจ: ×1.3 → ×2 บิลน้ำสำนักงาน ก.ค. 69 (+55%) ไม่ขึ้นธง', ()=>{
  const hi=s=>utilBillCheck(BN_BILLS,s).filter(x=>x.high).map(x=>x.meter_id+'@'+x.bill_month);
  assert.ok(hi().includes('BN-W-OFFICE@2026-07'));
  assert.ok(!hi({billCheck:{ratio:2}}).includes('BN-W-OFFICE@2026-07'));
});
test('เกณฑ์รายวันจากหน้าตั้งค่า: น้ำ minDiff 10 → 3 มิเตอร์เล็กขึ้นเหลืองได้', ()=>{
  const S=utilSettings({thresholds:{water:{minDiff:3,staleDays:5}}},'BN');
  assert.equal(S.thresholds.water.minDiff,3); assert.equal(S.thresholds.water.yellow,1.5);
  assert.deepEqual(utilBands({base:4},S.thresholds.water),{base:4,yellow:7,red:8});
  const a=utilAnalyze([],OFFICE,{thresholds:{water:{staleDays:5}}},NOW);
  assert.equal(a.staleDays,5);
});

// ── UTIL-48 จดรอบนี้แล้วกี่ตัว (เดิมนับ "เคยจด" → SG ขาดซักล้าง 23 ต.ค. ก็ขึ้น 6/6) ──
test('รอบจด: ก่อน 15:00 = รอบเมื่อวาน (ปิดแล้ว) · 15:00–17:00 = รอบวันนี้ยังเปิด · หลัง 17:00 = ปิด',()=>{
  const S=utilSettings({},'BG'), t=s=>Date.parse('2026-10-23T'+s+':00+07:00'), R=s=>utilRound(t(s),S);
  assert.deepEqual([R('14:59').date,R('14:59').open],['2026-10-22',false]);
  assert.deepEqual([R('15:00').date,R('15:00').open],['2026-10-23',true]);
  assert.equal(R('16:30').from,t('15:00')); assert.equal(R('16:30').to,t('17:00'));
  assert.deepEqual([R('17:00').date,R('17:00').open],['2026-10-23',false]);
  // ซักล้างจดล่าสุด 22 ต.ค. 16:53 → ไม่นับเป็นรอบ 23 · เมน 23 ต.ค. 15:58 นับ
  assert.ok(Date.parse('2026-10-22T16:53:00+07:00')<R('17:30').from);
  assert.ok(Date.parse('2026-10-23T15:58:00+07:00')>=R('17:30').from);
});

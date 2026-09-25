// ============================================================
// utils.js — ตัวแปลงรูปแบบ, ราคา/รายรับ/ส่วนลด, แปลงแถว CSV -> object            [เดิม 2193-2378]
// ============================================================
let charts={};

const n=v=>parseFloat(String(v||0).replace(/[,"']/g,'').trim())||0;
const parseD=s=>{
  if(!s) return null;
  const str=String(s).trim();
  const p=str.split('/');
  if(p.length===3){
    const d=parseInt(p[0]),m=parseInt(p[1]),y=parseInt(p[2]);
    if(!isNaN(d)&&!isNaN(m)&&!isNaN(y)) return new Date(y,m-1,d);
  }
  return null;
};
const fmtD=d=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543}`;
const fmtN=(x,d=0)=>d?parseFloat(x).toFixed(d):Math.round(x).toLocaleString('th-TH');
const mKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const mLbl=d=>`${MONTHS[d.getMonth()]} ${String(d.getFullYear()+543).slice(-2)}`;
const isWknd=d=>[0,5,6].includes(d.getDay());

// ── ราคา ──
// PRICE-01: กติการาคาทั้งหมดอยู่ที่นี่ที่เดียว · ทุกฟังก์ชันรับสาขา (br) ได้ตรงๆ
//   ค่าตั้งต้น = activeBranch เพื่อให้หน้าที่ดูสาขาเดียวเรียกแบบเดิมได้
//   หน้าที่คิดเงิน "หลายสาขาพร้อมกัน" (Benchmark) ต้องส่ง br เองเสมอ
//   เดิมอ่าน activeBranch ตรงๆ → Benchmark คิดราคา BG ด้วยราคา SS (ขาด 40%)
// ── SET-01: ราคามาจาก "ชุดราคา" ที่ admin ตั้งในหน้าตั้งค่า (Firestore settings/pricing) ──
//   ชุดราคา 1 ชุด = วันเริ่มใช้ + ฤดูกาลของแต่ละสาขา + ราคาทุกช่อง (snapshot เต็ม ไม่ใช่ส่วนต่าง)
//   วันไหนก็คิดด้วยชุดที่วันเริ่มใช้ล่าสุด <= วันนั้น → ราคาวันเก่าไม่มีวันเปลี่ยน (ADR 0001)
//   prices[สาขา][ฤดูกาล][st|non] = { on:[ธรรมดา, ศ–อา], wi:[ธรรมดา, ศ–อา] }  (wi = วอล์กอิน/ล็อกเสริม)
//   ฤดูกาล = ช่วง [เดือน,วัน] วนทุกปี · ช่วงทับกัน → ช่วงที่สั้นกว่าชนะ
//   ค่าตั้งต้นข้างล่าง = ราคาที่ใช้จริงก่อนมีหน้าตั้งค่า (ตัวเลขเดิมทุกตัว)
const PRICE_BRANCHES=['SS','BG','BN'];
const DEFAULT_SEASONS=()=>[
  {key:'high',name:'High Season',from:[11,1],to:[2,29]},
  {key:'low', name:'Low Season', from:[3,1], to:[10,31]},
];
const DEFAULT_PRICING=(()=>{
  const st={on:[100,130],wi:[130,160]};
  const car=(on)=>({on,wi:[on[0]+50,on[1]+50]});
  const cp=o=>JSON.parse(JSON.stringify(o));
  return {versions:[{
    id:'base', effective:'2000-01-01',
    seasons:{SS:DEFAULT_SEASONS(),BG:DEFAULT_SEASONS(),BN:DEFAULT_SEASONS()},
    prices:{
      SS:{high:{st:cp(st),non:{on:[30,30],wi:[30,30]}}, low:{st:cp(st),non:{on:[30,30],wi:[30,30]}}},
      BG:{high:{st:cp(st),non:car([300,350])}, low:{st:cp(st),non:car([250,300])}},
      BN:{high:{st:cp(st),non:car([250,300])}, low:{st:cp(st),non:car([200,250])}},
    },
  }]};
})();
let PRICING=null;          // เอกสาร settings/pricing ที่โหลดมา (null = ยังไม่มี → ใช้ค่าตั้งต้น)
let PRICING_STATE='default'; // default | cache | fresh | failed
const pricingDoc=()=>PRICING||DEFAULT_PRICING;
// PERM-06: ด่านเดียวของ "ตัวเลขเงิน" — ไม่มีสิทธิ์รายรับ หรือไม่รู้ราคาจริง = ไม่สร้างตัวเลขเงินลงหน้าเลย
//   (เดิมหลายจุดซ่อนด้วย CSS .col-rev อย่างเดียว → บนจอไม่เห็น แต่เลขยังอยู่ใน DOM เปิด Inspect ก็อ่านได้)
//   ยังไม่รู้สิทธิ์ (userPerms ยังไม่มา) = ไม่ให้เห็น
function canSeeRev(){ return window.userPerms?.showRevenue===true && PRICING_STATE!=='failed'; }
// PERM-07: ค่าไฟใช้หลักเดียวกัน (สิทธิ์ showElec) — เดิมซ่อนด้วย CSS .col-elec อย่างเดียว
function canSeeElec(){ return window.userPerms?.showElec===true; }
// เปลี่ยนชุดราคาที่ใช้คำนวณ (เรียกจาก firebase/settings.js) · doc=null = กลับไปค่าตั้งต้น
function setPricing(doc,state){
  PRICING=doc&&Array.isArray(doc.versions)&&doc.versions.length?doc:null;
  PRICING_STATE=state;
  _cellMemo={};
}
const isoDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
// ชุดราคาที่มีผลในวันนั้น
function pricingVersionAt(date){
  const k=isoDate(date);
  const vs=pricingDoc().versions||[];
  let hit=null;
  for(const v of vs){ if(v.effective<=k && (!hit||v.effective>=hit.effective)) hit=v; }
  return hit||DEFAULT_PRICING.versions[0];
}
// ช่วงฤดูกาลครอบวันที่ไหม (รองรับช่วงข้ามปี เช่น 1 พ.ย.–29 ก.พ.)
const mdNum=(m,d)=>m*100+d;
function seasonHas(s,m,d){
  const x=mdNum(m,d),a=mdNum(s.from[0],s.from[1]),b=mdNum(s.to[0],s.to[1]);
  return a<=b ? (x>=a&&x<=b) : (x>=a||x<=b);
}
const _seasonLenMemo={};
function seasonLength(s){ // นับวันในปีอธิกสุรทิน (366) ไว้ตัดสินช่วงที่ทับกัน
  const k=s.from+'-'+s.to;
  if(_seasonLenMemo[k]!==undefined) return _seasonLenMemo[k];
  let n=0; for(let t=new Date(2024,0,1);t.getFullYear()===2024;t.setDate(t.getDate()+1)) if(seasonHas(s,t.getMonth()+1,t.getDate())) n++;
  return (_seasonLenMemo[k]=n);
}
function seasonAt(ver,br,date){
  const m=date.getMonth()+1,d=date.getDate();
  let best=null,bestLen=1e9;
  for(const s of (ver.seasons?.[br]||[])){
    if(!seasonHas(s,m,d)) continue;
    const len=seasonLength(s);
    if(len<bestLen){best=s;bestLen=len;}
  }
  return best;
}
// ราคาทั้งช่อง {on:[ธรรมดา,ศ–อา], wi:[…]} ของ สาขา × โซน ในวันนั้น
// ถูกเรียกหลายครั้งต่อแถว × หลายร้อยแถว → จำผลไว้ ล้างทุกครั้งที่ชุดราคาเปลี่ยน (setPricing)
let _cellMemo={};
function priceCellFor(br,z,date){
  const mk=br+z+date.getFullYear()+'-'+date.getMonth()+'-'+date.getDate();
  return _cellMemo[mk]||(_cellMemo[mk]=_priceCell(br,z,date));
}
function _priceCell(br,z,date){
  const ver=pricingVersionAt(date);
  const s=seasonAt(ver,br,date);
  const cell=s&&ver.prices?.[br]?.[s.key]?.[z==='non'?'non':'st'];
  if(cell) return cell;
  // ชุดราคาไม่ครบ (ไม่ควรเกิด หน้าตั้งค่าตรวจก่อนบันทึก) → ถอยไปค่าตั้งต้น ไม่ให้เว็บพัง
  const b=DEFAULT_PRICING.versions[0];
  return b.prices[br]?.[seasonAt(b,br,date)?.key]?.[z==='non'?'non':'st']||{on:[0,0],wi:[0,0]};
}
// ราคาป้าย ออนไลน์/วอล์กอิน ต่อล็อก (zone==='non' = Car/Non · อื่นๆ = ST)
function lockPrices(date,z,br=activeBranch){
  const c=priceCellFor(br,z,date), i=isWknd(date)?1:0;
  return{po:c.on[i], pw:c.wi[i]};
}
function getBranchPrice(date,br=activeBranch){ return lockPrices(date,'st',br); }
function getNonPrice(date,br=activeBranch){ return lockPrices(date,'non',br).po; }
function getNonWalkPrice(date,br=activeBranch){ return lockPrices(date,'non',br).pw; }
// วันฝน: SS ลดครึ่งเฉพาะออนไลน์ · BG/BN ลดครึ่งทุกประเภท
const rainHalvesWalkIn=(br=activeBranch)=>br!=='SS';
function revST(r,g='all',br=activeBranch){
  const{po,pw}=getBranchPrice(r.date,br);
  const fd=r.freeDay;
  // เลือก lock ตาม group
  const online = (g==='all'||g==='online') ? (r.onlineLock||0) : 0;
  const walkin = (g==='all'||g==='walkin') ? (r.walkInLock||0) : 0;
  const extra  = (g==='all'||g==='extra')  ? (r.extraLock||0)  : 0;
  // cancel/absent อยู่ใน online อยู่แล้ว ไม่นับซ้ำ

  if(br==='SS'){
    return online*po*(fd?0.5:1) + walkin*pw + extra*pw;
  } else {
    return online*po*(fd?0.5:1) + walkin*pw*(fd?0.5:1) + extra*pw*(fd?0.5:1);
  }
}
function revSTNormal(r,g='all',br=activeBranch){
  const{po,pw}=getBranchPrice(r.date,br);
  const online = (g==='all'||g==='online') ? (r.onlineLock||0) : 0;
  const walkin = (g==='all'||g==='walkin') ? (r.walkInLock||0) : 0;
  const extra  = (g==='all'||g==='extra')  ? (r.extraLock||0)  : 0;
  return online*po + walkin*pw + extra*pw;
}
function revNon(r,g='all',br=activeBranch){
  if(!r||!r.date) return 0;
  const p=getNonPrice(r.date,br);
  const fd=r.nonFree||r.freeDay||false;
  const online = (g==='all'||g==='online') ? (r.nonOnlineLock||0) : 0;
  const walkin = (g==='all'||g==='walkin') ? (r.nonWalkInLock||0) : 0;
  const extra  = (g==='all'||g==='extra')  ? (r.nonExtraLock||0)  : 0;

  const pw=getNonWalkPrice(r.date,br); // วอล์กอิน/ล็อกเสริม (ตั้งต้น: Car = ออนไลน์ +50 · SS Non = ราคาเดียว)
  if(br==='SS'){
    return online*p*(fd?0.5:1) + walkin*pw + extra*pw;
  } else {
    return (online*p + (walkin+extra)*pw)*(fd?0.5:1);
  }
}
function revNonNormal(r,g='all',br=activeBranch){
  if(!r||!r.date) return 0;
  const p=getNonPrice(r.date,br);
  const online = (g==='all'||g==='online') ? (r.nonOnlineLock||0) : 0;
  const walkin = (g==='all'||g==='walkin') ? (r.nonWalkInLock||0) : 0;
  const extra  = (g==='all'||g==='extra')  ? (r.nonExtraLock||0)  : 0;
  const pw=getNonWalkPrice(r.date,br);
  return online*p + (walkin+extra)*pw;
}

function calcDiscount(r,g='all',br=activeBranch){
  if(!r.freeDay) return 0;
  const{po,pw}=getBranchPrice(r.date,br);
  const np=getNonPrice(r.date,br);
  const nonFd=r.nonFree||r.freeDay||false;
  // FD-03: รองรับ filter ตาม "กลุ่มข้อมูล" (online/walkin/extra/cancel/all) เหมือน revST/revNon/getLock
  const online=(g==='all'||g==='online')?1:0;
  const walkin=(g==='all'||g==='walkin')?1:0;
  const extra =(g==='all'||g==='extra') ?1:0;
  let stDisc=0, nonDisc=0;

  if(br==='SS'){
    // SS ST: เฉพาะ Online ที่ลด
    stDisc=online*(r.onlineLock||0)*po*0.5;
    // SS Non: WalkIn ไม่ลด
    nonDisc=online*(r.nonOnlineLock||0)*np*0.5;
  } else {
    // BG/BN ST: ทุกประเภทลด (Online ใช้ po, WalkIn/Extra ใช้ pw)
    stDisc=online*(r.onlineLock||0)*po*0.5 + (walkin*(r.walkInLock||0)+extra*(r.extraLock||0))*pw*0.5;
    // BG/BN Car: ทุกประเภทลด
    if(nonFd){
      const npw=getNonWalkPrice(r.date,br); // วอล์กอิน/ล็อกเสริม รถ
      nonDisc=(online*(r.nonOnlineLock||0)*np + (walkin*(r.nonWalkInLock||0)+extra*(r.nonExtraLock||0))*npw)*0.5;
    }
  }
  return stDisc+nonDisc;
}
const discST=r=>calcDiscount(r);

function getLock(r,g){
  const stOnline=r.onlineLock||0;
  const stWalkIn=r.walkInLock||0;
  const stExtra=r.extraLock||0;
  const stAbsent=r.absentLock||0;
  const stCancel=r.cancelLock||0;
  const nOnline=r.nonOnlineLock||0;
  const nWalkIn=r.nonWalkInLock||0;
  const nExtra=r.nonExtraLock||0;
  const nCancel=r.nonCancelLock||0;
  const nAbsent=r.nonAbsentLock||0;

  if(g==='online') return stOnline+nOnline;
  if(g==='walkin') return stWalkIn+nWalkIn;
  if(g==='extra')  return stExtra+nExtra;
  if(g==='cancel') return stCancel+stAbsent+nCancel+nAbsent;
  // all
  return stOnline+stWalkIn+stExtra+nOnline+nWalkIn+nExtra;
}
function getRai(r,g){
  const stOnlineRai=r.onlineRai||0;
  const stWalkInRai=r.walkInRai||0;
  const nOnlineRai=r.nonOnlineRai||0;
  const nWalkInRai=r.nonWalkInRai||0;
  if(g==='online') return stOnlineRai+nOnlineRai;
  if(g==='walkin') return stWalkInRai+nWalkInRai;
  if(g==='extra')  return (r.extraRai||0)+(r.nonExtraRai||0);
  if(g==='cancel') return (r.cancelRai||0)+(r.absentRai||0)+(r.nonCancelRai||0)+(r.nonAbsentRai||0);
  return stOnlineRai+stWalkInRai+nOnlineRai+nWalkInRai;
}

const mapST=r=>{
  const date=parseD(r['วันที่']);if(!date)return null;
  // รองรับทุกสาขา SS/BG/BN
  const l1=n(r['L1_SS_Street']||r['L1_BG_Street']||r['L1_BN_Street']||0);
  const l2=n(r['L2_SS_Street']||r['L2_BG_Street']||r['L2_BN_Street']||0);
  return{date,dateStr:r['วันที่'],onlineLock:n(r['Online_Lock']),onlineRai:n(r['Online_Rai']),
    walkInLock:n(r['WalkIn_Lock']),walkInRai:n(r['WalkIn_Rai']),extraLock:n(r['ล็อกเสริม-Lock']),extraRai:n(r['ล็อกเสริม_Rai']),
    cancelLock:n(r['Cancel_Lock']),absentLock:n(r['Absent_Lock']),cancelRai:n(r['Cancel_Rai']),absentRai:n(r['Absent_Rai']),
    freeDay:['1','true','1'].includes(String(r['FreeDay']).trim().toLowerCase())&&String(r['FreeDay']).trim()!=='0'&&String(r['FreeDay']).trim().toLowerCase()!=='n'&&String(r['FreeDay']).trim().toLowerCase()!=='false',
    l1,l2};
};
const mapNon=r=>{
  const date=parseD(r['วันที่']);if(!date)return null;
  // รองรับทุกสาขา SS Non / BG Car / BN Car — อ่านครบทุกคอลัมน์
  const l1=n(r['L1_SS_Non']||r['L1_BG_Car']||r['L1_BN_Car']||0);
  const l2=n(r['L2_SS_Non']||r['L2_BG_Car']||r['L2_BN_Car']||0);
  const onlineLock=n(r['Online_Lock']);
  const onlineRai=n(r['Online_Rai']);
  const walkInLock=n(r['WalkIn_Lock']);
  const walkInRai=n(r['WalkIn_Rai']);
  const extraLock=n(r['ล็อกเสริม-Lock']);
  const extraRai=n(r['ล็อกเสริม_Rai']);
  const cancelLock=n(r['Cancel_Lock']);
  const absentLock=n(r['Absent_Lock']);
  const cancelRai=n(r['Cancel_Rai']);
  const absentRai=n(r['Absent_Rai']);
  const cutLock=n(r['ตัดไม่มาทำการค้า_Lock']);
  const fd_raw=String(r['FreeDay']||'').trim().toLowerCase();const freeDay=fd_raw==='1'||fd_raw==='true';
  // รวม lock ทั้งหมดสำหรับโซน Non/Car
  const totalLock=onlineLock+walkInLock+extraLock;
  const totalRai=onlineRai+walkInRai;
  return{date,dateStr:r['วันที่'],
    onlineLock,onlineRai,walkInLock,walkInRai,extraLock,extraRai,
    cancelLock,absentLock,cancelRai,absentRai,cutLock,
    freeDay,l1,l2,
    // เก็บไว้ backward compat
    totalLock,totalRai};
};


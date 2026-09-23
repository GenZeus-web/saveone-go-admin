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
function getBranchPrice(date){
  // ST ทุกสาขาใช้ราคาเดียวกัน
  const wk=isWknd(date);
  return{po:wk?130:100, pw:wk?160:130};
}
// ── ฤดูกาล (ใช้กับราคา Car เท่านั้น · ST ราคาเดียวทั้งปี) ──
// high = พ.ย.–ก.พ. (ข้ามปี) · low = มี.ค.–ต.ค.
const HIGH_SEASON_MONTHS=[11,12,1,2];
const seasonOf=month=>HIGH_SEASON_MONTHS.includes(month)?'high':'low';
// ราคา Car ต่อล็อก [วันธรรมดา, ศ–อา] แยกตาม season · SS Non = 30 ทุกวันทุก season
const NON_PRICE={
  BG:{high:[300,350], low:[250,300]},
  BN:{high:[250,300], low:[200,250]},
};
function nonPriceAt(br,month,wk){
  const t=NON_PRICE[br]; if(!t) return 30; // SS Non
  return t[seasonOf(month)][wk?1:0];
}
function getNonPrice(date,br=activeBranch){
  return nonPriceAt(br,date.getMonth()+1,isWknd(date));
}
// ราคาป้าย ออนไลน์/วอล์กอิน ต่อล็อก ของโซนที่ดูอยู่ (zone==='non' = Car/Non · อื่นๆ = ST)
// Car: วอล์กอิน/ล็อกเสริม = ออนไลน์ +50 · SS Non ราคาเดียว
function lockPrices(date,z,br=activeBranch){
  if(z!=='non') return getBranchPrice(date);
  const p=getNonPrice(date,br);
  return{po:p, pw:br==='SS'?p:p+50};
}
// วันฝน: SS ลดครึ่งเฉพาะออนไลน์ · BG/BN ลดครึ่งทุกประเภท
const rainHalvesWalkIn=(br=activeBranch)=>br!=='SS';
function revST(r,g='all',br=activeBranch){
  // ST ทุกสาขาใช้ราคาเดียวกัน (100/130 Online, 130/160 WalkIn)
  const{po,pw}=getBranchPrice(r.date);
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
  const{po,pw}=getBranchPrice(r.date);
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

  if(br==='SS'){
    return online*p*(fd?0.5:1) + walkin*p + extra*p;
  } else {
    const pw=p+50; // Car: Walk-in/ล็อกเสริม = ราคาออนไลน์ +50 (ทุก season)
    return (online*p + (walkin+extra)*pw)*(fd?0.5:1);
  }
}
function revNonNormal(r,g='all',br=activeBranch){
  if(!r||!r.date) return 0;
  const p=getNonPrice(r.date,br);
  const online = (g==='all'||g==='online') ? (r.nonOnlineLock||0) : 0;
  const walkin = (g==='all'||g==='walkin') ? (r.nonWalkInLock||0) : 0;
  const extra  = (g==='all'||g==='extra')  ? (r.nonExtraLock||0)  : 0;
  const pw=(br==='SS')?p:p+50; // SS Non ไม่บวก / Car +50
  return online*p + (walkin+extra)*pw;
}

function calcDiscount(r,g='all',br=activeBranch){
  if(!r.freeDay) return 0;
  const{po,pw}=getBranchPrice(r.date);
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
      const npw=np+50; // Walk-in/ล็อกเสริม รถ +50
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


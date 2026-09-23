// ============================================================
// config.js — URL Apps Script, ค่าคงที่, ตัวแปร state ส่วนกลาง, เป้ารายวัน (ENH-05)  [เดิม 2123-2192]
// ============================================================
const PROXIES={
  SS:'https://script.google.com/macros/s/AKfycbwi_fXqPttjmkiNdjdN46Gqx1cM3-9_k2r4AAjR3b6rBTPPGtVLjUHiidad5mx7pieR/exec',
  BG:'https://script.google.com/macros/s/AKfycbzgZx9slbAw95GBMHAJFRURU-Zlh-5coW9_aIg1lae0TS1pG8qeNfrGxBMy7chZpFNP/exec',
  BN:'https://script.google.com/macros/s/AKfycbwQPzzxpQsWY8fqiS1AZ1V0eYTU7xB1wKEMEb4N19lwnADguiPuzAbOjKb3eHc7cj7DAg/exec',
};
const DAYS=['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
const MONTHS=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

let stData=[],nonData=[],merged=[];
let bgStData=[],bgCarData=[],bgMerged=[];
let bnStData=[],bnCarData=[],bnMerged=[];
let period=90,selMonth='',zone='all',group='all',view='overview';
let customFrom=null,customTo=null;
let activeBranch='SS'; // SS, BG, BN
let targetLock=400; // เป้าล็อกต่อวัน ของสาขา+โซนที่เลือกอยู่ (คำนวณจาก TARGETS)

// ── ENH-05: เป้าแยกสาขา × โซน ──
// SET-01: เป้าใช้ร่วมกันทุกคน เก็บที่ Firestore settings/targets · แก้ได้เฉพาะ admin
//   localStorage เหลือหน้าที่เป็น cache ให้เปิดเว็บแล้วเห็นเป้าทันที (และเป็นค่าตั้งต้น
//   ครั้งแรกก่อน admin เคยบันทึก = ค่าที่เครื่องนั้นเคยตั้งไว้เอง)
const TGT_KEY='saveone_targets_v1';
const TGT_DEF={SS:{st:400,non:0},BG:{st:350,non:120},BN:{st:300,non:90}};
const TGT_MISS_STREAK=3; // หลุดเป้ากี่วันติดถึงเตือน
let TARGETS=loadTargets();
function loadTargets(){
  const def=JSON.parse(JSON.stringify(TGT_DEF));
  try{
    const raw=localStorage.getItem(TGT_KEY);
    if(!raw) return def;
    const o=JSON.parse(raw)||{};
    ['SS','BG','BN'].forEach(b=>{
      if(o[b]){
        def[b].st=Math.max(0,parseInt(o[b].st)||0);
        def[b].non=Math.max(0,parseInt(o[b].non)||0);
      }
    });
    return def;
  }catch(e){console.warn('โหลดเป้าไม่ได้ ใช้ค่าเริ่มต้น',e);return def;}
}
function saveTargets(){
  try{localStorage.setItem(TGT_KEY,JSON.stringify(TARGETS));}
  catch(e){console.warn('บันทึกเป้าไม่ได้',e);}
}
// เป้าของสาขา+โซนที่เลือกอยู่ (all = ST + Car/Non)
function currentTarget(){
  const t=TARGETS[activeBranch]||{st:0,non:0};
  if(zone==='st') return t.st||0;
  if(zone==='non') return t.non||0;
  return (t.st||0)+(t.non||0);
}
// อัปเดตช่อง input + ป้ายในไซด์บาร์ให้ตรงสาขา/โซนปัจจุบัน
function syncTargetUI(){
  targetLock=Math.max(1,currentTarget()||1);
  const t=TARGETS[activeBranch]||{st:0,non:0};
  const iSt=document.getElementById('targetInputST'); if(iSt) iSt.value=t.st||0;
  const iNon=document.getElementById('targetInputNon'); if(iNon) iNon.value=t.non||0;
  const names={SS:'ศรีสมาน',BG:'ประตูกรุงเทพ',BN:'บางนา'};
  const bl=document.getElementById('tgtBranchLbl'); if(bl) bl.textContent=names[activeBranch]||activeBranch;
  const zl=document.getElementById('tgtZoneNote');
  if(zl){
    const zn=zone==='st'?'ST':zone==='non'?(activeBranch==='SS'?'Non':'Car'):'ทั้งหมด';
    zl.textContent=`โซนที่ดูอยู่: ${zn} → ใช้เป้า ${fmtN(currentTarget())} ล็อก/วัน`;
  }
  const nl=document.getElementById('tgtNonLbl'); if(nl) nl.textContent=activeBranch==='SS'?'Non':'Car';
}
function setTargetZone(z,v){
  const t=TARGETS[activeBranch]; if(!t) return;
  if(window.userRole!=='admin'){ syncTargetUI(); return; } // ช่องถูก disabled อยู่แล้ว กันไว้อีกชั้น
  const val=Math.max(0,Math.min(99999,parseInt(v)||0));
  const before=JSON.parse(JSON.stringify(TARGETS));
  if(z==='non') t.non=val; else t.st=val;
  saveTargets();
  syncTargetUI();
  applyAll();
  if(typeof window.saveSharedTargets==='function') window.saveSharedTargets(TARGETS,before);
}
// รับเป้าชุดกลางจาก Firestore (หรือหลัง admin บันทึก) → ใช้ทันที + เก็บ cache
function applySharedTargets(o){
  if(!o) return;
  PRICE_TARGET_BRANCHES.forEach(b=>{
    if(o[b]){
      TARGETS[b]={st:Math.max(0,parseInt(o[b].st)||0), non:Math.max(0,parseInt(o[b].non)||0)};
    }
  });
  saveTargets();
  syncTargetUI();
}
const PRICE_TARGET_BRANCHES=['SS','BG','BN'];

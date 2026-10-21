// ============================================================
// config.js — ค่าคงที่, ตัวแปร state ส่วนกลาง, เป้ารายวัน (ENH-05)  [เดิม 2123-2192]
// ============================================================
// SEC-10 (v3.0.1): ลบ PROXIES (URL Apps Script เดิม) — ARCH-01 อ่าน Firestore แทนตั้งแต่ v2.8.0 ไม่มีโค้ดไหนใช้
//   และ doGet ของ Apps Script ตอบ Unauthorized แล้ว ทางถอยกลับเดิมใช้ไม่ได้อยู่ดี · ดู git history ถ้าต้องการ URL
const DAYS=['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
const MONTHS=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

let stData=[],nonData=[],merged=[];
let bgStData=[],bgCarData=[],bgMerged=[];
let bnStData=[],bnCarData=[],bnMerged=[];
let period=90,selMonth='',zone='all',group='all',view='overview';
let customFrom=null,customTo=null;
let activeBranch='BG'; // SS, BG, BN · เปิดเว็บมาที่ประตูกรุงเทพ (เจ้าของสั่ง 14 ต.ค. 69 · SS ปิดสาขาแล้ว) — ไม่มีสิทธิ์ BG = auth.js ย้ายไปสาขาแรกที่มีสิทธิ์
let targetLock=400; // เป้าล็อกต่อวัน ของสาขา+โซนที่เลือกอยู่ (คำนวณจาก TARGETS)
// BR-02: รหัสที่คนเห็น = รหัสฝั่งบัญชี (เจ้าของ 21 ต.ค. 69 · จำง่าย ขึ้นต้น S)
//   ข้างใน (ข้อมูล · สิทธิ์ users.branches · เอกสาร Firestore · กฎ · ราคา/เป้า · ผัง 3D ?branch=) ยังใช้ SS/BG/BN
//   แสดงรหัสสาขาที่ไหน ผ่าน brCode() เสมอ · ตรงกับคอลัมน์ acc_code แท็บ branches ของชีต UTIL
const BR_CODE_SHOW={SS:'SR',BG:'SG',BN:'SB'};
const brCode=b=>BR_CODE_SHOW[b]||b;

// ── ENH-05: เป้าแยกสาขา × โซน ──
// SET-01: เป้าใช้ร่วมกันทุกคน เก็บที่ Firestore settings/targets · แก้ได้เฉพาะ admin
//   localStorage เหลือหน้าที่เป็น cache ให้เปิดเว็บแล้วเห็นเป้าทันที (และเป็นค่าตั้งต้น
//   ครั้งแรกก่อน admin เคยบันทึก = ค่าที่เครื่องนั้นเคยตั้งไว้เอง)
const TGT_KEY='saveone_targets_v1';
const TGT_DEF={SS:{st:400,non:0},BG:{st:350,non:120},BN:{st:300,non:90}};
const TGT_MISS_STREAK=3; // หลุดเป้ากี่วันติดถึงเตือน
let TARGETS=loadTargets();
// ENH-06: คนที่ไม่ใช่ admin ลองใส่เป้าเองได้ — เก็บในหน่วยความจำอย่างเดียว ไม่ลง localStorage/Firestore
//   ล้างทุกครั้งที่ล็อกอิน (settings.js loadSettings) · รีเฟรชหน้า = หายเอง · TARGETS (เป้ากลาง) ไม่ถูกแตะ
let TGT_TRIAL={};
function tgtNow(){ const s=TARGETS[activeBranch]||{st:0,non:0}, t=TGT_TRIAL[activeBranch]; return t?{...s,...t}:s; }
function resetTargetTrial(quiet){
  TGT_TRIAL={}; syncTargetUI();
  if(!quiet&&typeof applyAll==='function') applyAll();
}
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
  const t=tgtNow();
  if(zone==='st') return t.st||0;
  if(zone==='non') return t.non||0;
  return (t.st||0)+(t.non||0);
}
// อัปเดตช่อง input + ป้ายในไซด์บาร์ให้ตรงสาขา/โซนปัจจุบัน
function syncTargetUI(){
  targetLock=Math.max(1,currentTarget()||1);
  const t=tgtNow();
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
  // ENH-06: กำลังลองเป้าเองในสาขานี้ → บอกเป้ากลาง + ปุ่มกลับ
  const tn=document.getElementById('tgtTrialNote');
  if(tn){
    const s=TARGETS[activeBranch]||{st:0,non:0};
    tn.style.display=TGT_TRIAL[activeBranch]?'':'none';
    if(TGT_TRIAL[activeBranch]) tn.innerHTML=`🧪 ลองเป้าเอง ไม่บันทึก · ออก/เข้าใหม่ = กลับเป้ากลาง (ST ${fmtN(s.st||0)} · ${activeBranch==='SS'?'Non':'Car'} ${fmtN(s.non||0)})
      <a href="#" onclick="resetTargetTrial();return false" style="color:var(--blue)">กลับเป้ากลาง</a>`;
  }
}
function setTargetZone(z,v){
  const t=TARGETS[activeBranch]; if(!t) return;
  const val=Math.max(0,Math.min(99999,parseInt(v)||0));
  if(window.userRole!=='admin'){   // ENH-06: ลองเองในหน่วยความจำ · ไม่บันทึก
    TGT_TRIAL[activeBranch]={...(TGT_TRIAL[activeBranch]||{}),[z==='non'?'non':'st']:val};
    syncTargetUI(); applyAll(); return;
  }
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

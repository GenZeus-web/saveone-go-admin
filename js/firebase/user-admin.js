// ============================================================
// firebase/user-admin.js — เมนูโปรไฟล์ (USR-02) + จัดการผู้ใช้ (USR-01, admin เท่านั้น)
// ============================================================
//
// ⚠️ ทุกฟังก์ชันเช็ค window.userRole === 'admin' ซ้ำอีกชั้นก่อนทำงาน
//    การซ่อนปุ่มอย่างเดียวไม่ใช่การป้องกัน — ด่านจริงอยู่ที่ Firestore Security Rules
//
// ต้องโหลด "หลัง" auth.js เพราะ auth.js เป็นคนตั้ง window.userRole
//   (ในทางปฏิบัติไม่ race: โค้ดในไฟล์นี้ทำงานตอนผู้ใช้กดปุ่มเท่านั้น)

import { db, firebaseConfig } from "./init.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ---- ORIGINAL (index.html) ----
/* ══════════════════════════════════════════════════════════════
   USR-01: จัดการผู้ใช้ (admin เท่านั้น)
   ⚠️ ทุกฟังก์ชันเช็ค window.userRole==='admin' ซ้ำอีกชั้นก่อนทำงาน
      (ซ่อนปุ่มอย่างเดียวไม่พอ — ด่านจริงอยู่ที่ Firestore Rules)
   ══════════════════════════════════════════════════════════════ */
/* ── USR-02: เมนูโปรไฟล์ + เปิด/ปิดหน้าจัดการผู้ใช้ ── */
window.toggleProfMenu = function(ev){
  if(ev) ev.stopPropagation();
  const m = document.getElementById('profMenu');
  const b = document.getElementById('profBtn');
  if(!m) return;
  const open = m.classList.toggle('open');
  if(b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
};
window.closeProfMenu = function(){
  const m = document.getElementById('profMenu');
  const b = document.getElementById('profBtn');
  if(m) m.classList.remove('open');
  if(b) b.setAttribute('aria-expanded','false');
};
// คลิกที่อื่น / กด Esc = ปิดเมนู
document.addEventListener('click', e => {
  const w = e.target.closest && e.target.closest('.prof-wrap');
  if(!w) window.closeProfMenu();
});
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  window.closeProfMenu();
  const um = document.getElementById('usersModal');
  if(um && um.style.display === 'flex') window.closeUsersPanel();
});

window.openUsersPanel = function(){
  if(!isAdmin()) return;
  window.closeProfMenu();
  const m = document.getElementById('usersModal');
  if(!m) return;
  m.style.display = 'flex';
  window.loadUserList();
};
window.closeUsersPanel = function(){
  const m = document.getElementById('usersModal');
  if(m) m.style.display = 'none';
};

const PERM_KEYS = ['showRevenue','showElec','showExport','showPriceNote','showFreeday','showWhatIf','showCompare','showForecast','showRawData','showHeatmap','showBenchmark','showMap3D'];
// WI-01: ป้าย What If บอกด้วยว่ามันอยู่ในแท็บพยากรณ์ — คนตั้งสิทธิ์จะได้เห็นความสัมพันธ์
const PERM_LABEL = {showRevenue:'รายรับ',showElec:'ค่าไฟ',showExport:'Export',showPriceNote:'หมายเหตุราคา',showFreeday:'วันฝน',showWhatIf:'What If (อยู่ในแท็บพยากรณ์)',showCompare:'เปรียบเทียบเดือน',showForecast:'พยากรณ์',showRawData:'ข้อมูลดิบ',showHeatmap:'ปฏิทินล็อก',showBenchmark:'Benchmark',showMap3D:'ผัง 3D'};
/* PERM-06 (v2.10.0): คีย์ที่ตั้งต้นเป็น "เปิด" ตอนสร้าง manager ใหม่
   + showFreeday  — ปลอดภัย ตัวเลขเงินในแท็บถูกซ่อนด้วย .col-rev อยู่แล้ว (FD-01) เห็นแค่จำนวนล็อก/วัน
   + showWhatIf   — คู่กับ showForecast ที่เปิดอยู่แล้ว (WI-01)
   − showRawData  — อันตรายกว่า: ให้ล็อกรายวันแยกออนไลน์/วอล์กอิน/โซนครบทุกวัน
                    ถึงซ่อนคอลัมน์เงิน แต่เอาไปคูณราคาเองก็ได้รายรับกลับมาเกือบเป๊ะ
                    ซ่อนผลลัพธ์แต่ไม่ซ่อนตัวตั้ง = ไม่ได้ซ่อนจริง · สอดคล้องกับ showPriceNote ที่ปิด default */
const PERM_DEFAULT_ON = ['showFreeday','showWhatIf','showCompare','showForecast','showHeatmap','showBenchmark','showMap3D'];
const ALL_BRANCHES = ['SS','BG','BN'];
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function isAdmin(){ return window.userRole === 'admin'; }
function usrErr(msg){
  const el = document.getElementById('usrError');
  if(!el) return;
  if(!msg){ el.style.display='none'; el.textContent=''; return; }
  el.style.display='block'; el.textContent = msg;
}

// ── โหลดรายชื่อผู้ใช้ทั้งหมด ──
window.loadUserList = async function(){
  const tb = document.getElementById('usrTbody');
  const st = document.getElementById('usrStatus');
  if(!tb) return;
  if(!isAdmin()){ tb.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--red)">ไม่มีสิทธิ์</td></tr>'; return; }
  usrErr('');
  tb.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--ink3)">กำลังโหลด…</td></tr>';
  try{
    const snap = await getDocs(collection(db, 'users'));
    const rows = [];
    snap.forEach(d => rows.push({ uid: d.id, ...d.data() }));
    rows.sort((a,b) => String(a.email||'').localeCompare(String(b.email||'')));
    if(!rows.length){
      tb.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--ink3)">ยังไม่มีผู้ใช้</td></tr>';
    } else {
      tb.innerHTML = rows.map(u => renderUserRow(u)).join('');
    }
    if(st) st.textContent = 'ทั้งหมด ' + rows.length + ' คน · อัปเดต ' + new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    console.error('loadUserList:', e);
    tb.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--ink3)">โหลดไม่สำเร็จ</td></tr>';
    usrErr(e.code === 'permission-denied'
      ? 'Firestore ปฏิเสธการอ่าน — ยังไม่ได้อัปเดต Security Rules ให้ admin อ่าน collection users ได้ (ดูวิธีใน 6_project-setup.md)'
      : ('โหลดไม่สำเร็จ: ' + (e.message || e)));
  }
};

function renderUserRow(u){
  const isSelf = (window.userEmail && u.email === window.userEmail);
  const admin = u.role === 'admin';
  const brs = Array.isArray(u.branches) ? u.branches : [];
  const permTxt = admin
    ? '<span style="color:var(--gold)">ทุกอย่าง (admin)</span>'
    : (PERM_KEYS.filter(k => u[k] === true).map(k => PERM_LABEL[k]).join(', ') || '<span style="color:var(--ink3)">—</span>');
  return '<tr data-uid="' + esc(u.uid) + '" style="border-bottom:1px solid var(--border)">'
    + '<td style="padding:9px 6px">' + esc(u.email || '(ไม่มีอีเมล)')
      + (isSelf ? ' <span style="font-size:9px;background:var(--surface3);color:var(--ink3);padding:1px 5px;border-radius:3px">คุณ</span>' : '')
      + '<div style="font-size:9px;color:var(--ink3);font-family:\'JetBrains Mono\',monospace">' + esc(u.uid) + '</div></td>'
    + '<td style="padding:9px 6px"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:' + (admin?'rgba(240,165,0,.15)':'var(--surface3)') + ';color:' + (admin?'var(--gold)':'var(--ink2)') + '">' + esc(u.role || 'manager') + '</span></td>'
    + '<td style="padding:9px 6px">' + (brs.length ? esc(brs.join(', ')) : '<span style="color:var(--ink3)">—</span>') + '</td>'
    + '<td style="padding:9px 6px;font-size:11px;color:var(--ink2)">' + permTxt + '</td>'
    + '<td style="padding:9px 6px;text-align:right;white-space:nowrap">'
      + '<button onclick="editUser(\'' + esc(u.uid) + '\')" style="background:var(--surface2);border:1px solid var(--border);color:var(--ink2);padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px;font-family:\'Noto Sans Thai\',sans-serif;margin-right:4px">แก้ไข</button>'
      + (isSelf ? '' : '<button onclick="removeUser(\'' + esc(u.uid) + '\')" style="background:transparent;border:1px solid var(--red);color:var(--red);padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px;font-family:\'Noto Sans Thai\',sans-serif">ลบ</button>')
    + '</td></tr>';
}

// ── แก้ไขผู้ใช้: เปลี่ยนแถวเป็นฟอร์มในที่ ──
window.editUser = async function(uid){
  if(!isAdmin()) return;
  const tr = document.querySelector('#usrTbody tr[data-uid="' + uid + '"]');
  if(!tr) return;
  usrErr('');
  let u = {};
  try{
    const d = await getDoc(doc(db, 'users', uid));
    if(d.exists()) u = d.data();
  }catch(e){ usrErr('อ่านข้อมูลไม่สำเร็จ: ' + (e.message||e)); return; }

  const brs = Array.isArray(u.branches) ? u.branches : [];
  const bms = Array.isArray(u.bmBranches) ? u.bmBranches : [];   // BM-04
  const cb = (id, on, label) => '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px"><input type="checkbox" id="' + id + '"' + (on?' checked':'') + '> ' + label + '</label>';
  tr.innerHTML = '<td colspan="5" style="padding:14px 6px;background:var(--surface2)">'
    + '<div style="font-size:12px;font-weight:700;margin-bottom:10px">' + esc(u.email || uid) + '</div>'
    + '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">'
      + '<div><div style="font-size:10px;color:var(--ink3);margin-bottom:4px">ROLE</div>'
        + '<select id="edRole_' + uid + '" onchange="syncEditRole(\'' + uid + '\')" style="padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--ink);font-size:12px;font-family:\'Noto Sans Thai\',sans-serif">'
        + '<option value="manager"' + (u.role!=='admin'?' selected':'') + '>manager</option>'
        + '<option value="admin"' + (u.role==='admin'?' selected':'') + '>admin</option></select></div>'
      + '<div><div style="font-size:10px;color:var(--ink3);margin-bottom:4px">สาขา</div><div style="display:flex;gap:12px">'
        + ALL_BRANCHES.map(b => cb('edBr_' + uid + '_' + b, brs.includes(b), b)).join('') + '</div>'
        // BM-04: สาขาที่เอาข้อมูลมาเทียบได้ในหน้า Benchmark เท่านั้น (ไม่ใช่สาขาที่ดูแล)
        + '<div id="edBmBox_' + uid + '" style="margin-top:8px"><div style="font-size:10px;color:var(--ink3);margin-bottom:4px">สาขาที่เทียบได้ใน Benchmark</div><div style="display:flex;gap:12px">'
        + ALL_BRANCHES.map(b => cb('edBm_' + uid + '_' + b, bms.includes(b), b)).join('') + '</div></div></div>'
      + '<div><div style="font-size:10px;color:var(--ink3);margin-bottom:4px">สิทธิ์</div>'
        + '<div id="edPermBox_' + uid + '" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 14px">'
        + PERM_KEYS.map(k => cb('edP_' + uid + '_' + k, u[k] === true, PERM_LABEL[k])).join('') + '</div></div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:12px">'
      + '<button onclick="saveUser(\'' + uid + '\')" style="background:var(--gold);color:#1a1f2e;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;font-family:\'Noto Sans Thai\',sans-serif">บันทึก</button>'
      + '<button onclick="loadUserList()" style="background:var(--surface3);border:1px solid var(--border);color:var(--ink2);padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-family:\'Noto Sans Thai\',sans-serif">ยกเลิก</button>'
    + '</div></td>';
  syncEditRole(uid);
  // WI-01: ผูก What If เข้ากับ พยากรณ์ (แถวถูกสร้างใหม่ทุกครั้ง → ไม่มี listener ซ้อน)
  bindWhatIfPair(document.getElementById('edP_' + uid + '_showWhatIf'),
                 document.getElementById('edP_' + uid + '_showForecast'));
};

/* WI-01 (v2.10.0): #whatif-section เป็น .fc-panel ที่ฝังอยู่ "ข้างใน" แท็บ 🔮 พยากรณ์
   ไม่ใช่แท็บของตัวเอง — ปิด showForecast = เข้าไม่ถึง What If แม้ showWhatIf จะเปิด
   แก้ที่ต้นทาง: ผูกคู่กันตั้งแต่ตอนคนตั้งสิทธิ์ติ๊ก ไม่ใช่ไปแก้ตัว gate ตอน login */
function bindWhatIfPair(wi, fc){
  if(!wi || !fc) return;
  wi.addEventListener('change', () => { if(wi.checked) fc.checked = true; });
  fc.addEventListener('change', () => { if(!fc.checked) wi.checked = false; });
}

// admin = เปิดสิทธิ์ทุกช่องและล็อกไว้ (ให้ตรงกับ logic ตอน login)
window.syncEditRole = function(uid){
  const sel = document.getElementById('edRole_' + uid);
  if(!sel) return;
  const admin = sel.value === 'admin';
  PERM_KEYS.forEach(k => {
    const el = document.getElementById('edP_' + uid + '_' + k);
    if(!el) return;
    if(admin){ el.checked = true; el.disabled = true; } else { el.disabled = false; }
  });
  // BM-04: admin เทียบได้ทุกสาขาเสมอ → ติ๊กครบแล้วล็อก (เหมือน perms อื่น)
  ALL_BRANCHES.forEach(b => {
    const el = document.getElementById('edBm_' + uid + '_' + b);
    if(!el) return;
    if(admin){ el.checked = true; el.disabled = true; } else { el.disabled = false; }
  });
  const bmBox = document.getElementById('edBmBox_' + uid);
  if(bmBox) bmBox.style.opacity = admin ? '.55' : '1';
  const box = document.getElementById('edPermBox_' + uid);
  if(box) box.style.opacity = admin ? '.55' : '1';
};

window.saveUser = async function(uid){
  if(!isAdmin()) return;
  usrErr('');
  const role = document.getElementById('edRole_' + uid).value;
  const branches = ALL_BRANCHES.filter(b => {
    const el = document.getElementById('edBr_' + uid + '_' + b);
    return el && el.checked;
  });
  if(!branches.length){ usrErr('ต้องเลือกอย่างน้อย 1 สาขา'); return; }
  // BM-04: สาขาที่เทียบได้ใน Benchmark (ว่างได้ = เห็นแค่สาขาตัวเอง)
  const bmBranches = (role === 'admin') ? ALL_BRANCHES.slice() : ALL_BRANCHES.filter(b => {
    const el = document.getElementById('edBm_' + uid + '_' + b);
    return el && el.checked;
  });

  const payload = { role, branches, bmBranches };
  PERM_KEYS.forEach(k => {
    const el = document.getElementById('edP_' + uid + '_' + k);
    payload[k] = (role === 'admin') ? true : !!(el && el.checked);
  });
  // WI-01: normalize อีกชั้นก่อนเขียน — กันข้อมูลเก่าที่ค้างสถานะขัดกันอยู่แล้ว
  if(payload.showWhatIf === true) payload.showForecast = true;

  try{
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
    await window.loadUserList();
  }catch(e){
    console.error('saveUser:', e);
    usrErr(e.code === 'permission-denied'
      ? 'Firestore ปฏิเสธการเขียน — ยังไม่ได้อัปเดต Security Rules (ดูวิธีใน 6_project-setup.md)'
      : ('บันทึกไม่สำเร็จ: ' + (e.message || e)));
  }
};

window.removeUser = async function(uid){
  if(!isAdmin()) return;
  usrErr('');
  let email = uid;
  try{
    const d = await getDoc(doc(db, 'users', uid));
    if(d.exists()) email = d.data().email || uid;
  }catch(e){}
  if(!confirm('ลบสิทธิ์ของ ' + email + ' ?\n\nบัญชี login จะยังอยู่ — ต้องลบใน Firebase Console อีกที')) return;
  try{
    await deleteDoc(doc(db, 'users', uid));
    await window.loadUserList();
  }catch(e){
    console.error('removeUser:', e);
    usrErr(e.code === 'permission-denied'
      ? 'Firestore ปฏิเสธการลบ — ยังไม่ได้อัปเดต Security Rules'
      : ('ลบไม่สำเร็จ: ' + (e.message || e)));
  }
};

// ── เพิ่มผู้ใช้ใหม่ ──
let nuPairBound = false;   // WI-01: ผูก What If ↔ พยากรณ์ ในกล่องเพิ่มผู้ใช้แล้วหรือยัง
window.openAddUser = function(){
  if(!isAdmin()) return;
  const m = document.getElementById('addUserModal');
  if(!m) return;
  ['nuEmail','nuPass'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  const r = document.getElementById('nuRole'); if(r) r.value = 'manager';
  const ss = document.getElementById('nuBrSS'); if(ss) ss.checked = true;
  ['nuBrBG','nuBrBN'].forEach(id => { const el = document.getElementById(id); if(el) el.checked = false; });
  // BM-04: ตั้งต้นไม่ติ๊กเลย = เห็นแค่สาขาตัวเองใน Benchmark (พฤติกรรมเดิม)
  ALL_BRANCHES.forEach(b => { const el = document.getElementById('nuBm' + b); if(el){ el.checked = false; el.disabled = false; } });
  PERM_KEYS.forEach(k => { const el = document.getElementById('nu' + k.charAt(0).toUpperCase() + k.slice(1)); if(el){ el.checked = PERM_DEFAULT_ON.includes(k); el.disabled = false; } });
  const err = document.getElementById('nuError'); if(err){ err.style.display='none'; err.textContent=''; }
  // WI-01: กล่องนี้เป็น HTML คงที่ (ไม่ได้สร้างใหม่ทุกครั้ง) → ผูก listener ครั้งเดียวพอ
  if(!nuPairBound){
    nuPairBound = true;
    bindWhatIfPair(document.getElementById('nuShowWhatIf'), document.getElementById('nuShowForecast'));
  }
  window.syncNuRole();
  m.style.display = 'flex';
};
window.closeAddUser = function(){
  const m = document.getElementById('addUserModal');
  if(m) m.style.display = 'none';
};
window.syncNuRole = function(){
  const sel = document.getElementById('nuRole');
  if(!sel) return;
  const admin = sel.value === 'admin';
  PERM_KEYS.forEach(k => {
    const el = document.getElementById('nu' + k.charAt(0).toUpperCase() + k.slice(1));
    if(!el) return;
    if(admin){ el.checked = true; el.disabled = true; } else { el.disabled = false; }
  });
  // BM-04: admin เทียบได้ทุกสาขาเสมอ
  ALL_BRANCHES.forEach(b => {
    const el = document.getElementById('nuBm' + b);
    if(!el) return;
    if(admin){ el.checked = true; el.disabled = true; } else { el.disabled = false; }
  });
  const bmBox = document.getElementById('nuBmBox');
  if(bmBox) bmBox.style.opacity = admin ? '.55' : '1';
  const box = document.getElementById('nuPermBox');
  if(box) box.style.opacity = admin ? '.55' : '1';
};

window.submitAddUser = async function(){
  if(!isAdmin()) return;
  const err = document.getElementById('nuError');
  const btn = document.getElementById('nuSubmit');
  const show = m => { if(err){ err.style.display='block'; err.textContent = m; } };
  if(err){ err.style.display='none'; err.textContent=''; }

  const email = (document.getElementById('nuEmail').value || '').trim();
  const pass  = document.getElementById('nuPass').value || '';
  const role  = document.getElementById('nuRole').value;
  const branches = ALL_BRANCHES.filter(b => {
    const el = document.getElementById('nuBr' + b);
    return el && el.checked;
  });
  // BM-04
  const bmBranches = (role === 'admin') ? ALL_BRANCHES.slice() : ALL_BRANCHES.filter(b => {
    const el = document.getElementById('nuBm' + b);
    return el && el.checked;
  });

  if(!email){ show('กรอกอีเมล'); return; }
  if(pass.length < 6){ show('รหัสผ่านต้องอย่างน้อย 6 ตัว'); return; }
  if(!branches.length){ show('ต้องเลือกอย่างน้อย 1 สาขา'); return; }

  btn.disabled = true; btn.textContent = 'กำลังสร้าง…';

  // สร้าง auth account ผ่าน "แอปสำรอง" — ไม่งั้น createUser จะสลับ session
  // ทำให้ admin หลุดออกจากระบบทันทีที่สร้างคนใหม่
  let secondary = null;
  try{
    secondary = initializeApp(firebaseConfig, 'usrAdmin_' + Date.now());
    const secAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secAuth, email, pass);
    const newUid = cred.user.uid;
    await signOut(secAuth);

    const payload = { email, role, branches, bmBranches };
    PERM_KEYS.forEach(k => {
      const el = document.getElementById('nu' + k.charAt(0).toUpperCase() + k.slice(1));
      payload[k] = (role === 'admin') ? true : !!(el && el.checked);
    });
    // WI-01: normalize อีกชั้นก่อนเขียน
    if(payload.showWhatIf === true) payload.showForecast = true;
    await setDoc(doc(db, 'users', newUid), payload);

    window.closeAddUser();
    await window.loadUserList();
  }catch(e){
    console.error('submitAddUser:', e);
    const map = {
      'auth/email-already-in-use': 'อีเมลนี้มีบัญชีอยู่แล้ว — ถ้าต้องการให้สิทธิ์ ให้หา uid ใน Firebase Console แล้วเพิ่มเอกสารเอง',
      'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
      'auth/weak-password': 'รหัสผ่านอ่อนเกินไป (ต้องอย่างน้อย 6 ตัว)',
      'auth/operation-not-allowed': 'Firebase ปิดการสมัครด้วย Email/Password อยู่ — เปิดใน Console → Authentication → Sign-in method',
      'permission-denied': 'สร้างบัญชีแล้วแต่เขียนสิทธิ์ลง Firestore ไม่ได้ — ยังไม่ได้อัปเดต Security Rules (บัญชีถูกสร้างไปแล้ว ต้องไปเพิ่มเอกสารเองใน Console)'
    };
    show(map[e.code] || ('สร้างไม่สำเร็จ: ' + (e.message || e)));
  }finally{
    btn.disabled = false; btn.textContent = 'สร้างผู้ใช้';
  }
};

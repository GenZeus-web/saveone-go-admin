// ============================================================
// supabase/user-admin.js — เมนูโปรไฟล์ (USR-02) + จัดการผู้ใช้ (USR-01, admin เท่านั้น · ย้ายใหญ่ ขั้น 3)
// ============================================================
//
// ⚠️ ทุกฟังก์ชันเช็ค window.userRole === 'admin' ซ้ำอีกชั้นก่อนทำงาน
//    การซ่อนปุ่มอย่างเดียวไม่ใช่การป้องกัน — ด่านจริงอยู่ที่กติกาสิทธิ์ goadmin.profiles + Edge Function goadmin-users
//
// บัญชีล็อกอิน (auth.users) ใช้ร่วมกับแอปอื่น (สต็อก) → หน้านี้ "ลบ" = ลบสิทธิ์แดชบอร์ดเท่านั้น บัญชียังอยู่
//   สร้างบัญชี / ตั้งรหัสใหม่ ต้องใช้กุญแจลับ → Edge Function goadmin-users (เช็ค admin ฝั่งเซิร์ฟเวอร์อีกชั้น)
//   อีเมล @saveone.go ไม่มีจริง ส่งลิงก์ตั้งรหัสไม่ได้ → admin ตั้งรหัสให้ในแถวแก้ไข
//
// ต้องโหลด "หลัง" auth.js เพราะ auth.js เป็นคนตั้ง window.userRole
//   (ในทางปฏิบัติไม่ race: โค้ดในไฟล์นี้ทำงานตอนผู้ใช้กดปุ่มเท่านั้น)

import { sb, sbErr } from "./init.js";

// แถว goadmin.profiles ↔ รูปเอกสาร users/{uid} เดิม (ตัวเดียวกับใน auth.js)
const profileDoc = (r) => ({ ...(r.perms || {}), uid: r.user_id, email: r.email, role: r.role,
  branches: r.branches, bmBranches: r.bm_branches, active: r.active });
const profileRow = (p) => ({ role: p.role, branches: p.branches, bm_branches: p.bmBranches,
  perms: Object.fromEntries(PERM_KEYS.map(k => [k, p[k] === true])) });

// เรียก Edge Function goadmin-users (ส่ง token ของ admin ที่ล็อกอินอยู่ไปให้ฟังก์ชันเช็ค)
async function usersFn(body){
  const { data, error } = await sb.functions.invoke('goadmin-users', { body });
  if(error){
    let msg = error.message;
    try{ const j = await error.context.json(); if(j && j.error) msg = j.error; }catch(_){}
    throw new Error(msg);
  }
  return data;
}

// ---- ORIGINAL (index.html) ----
/* ══════════════════════════════════════════════════════════════
   USR-01: จัดการผู้ใช้ (admin เท่านั้น)
   ⚠️ ทุกฟังก์ชันเช็ค window.userRole==='admin' ซ้ำอีกชั้นก่อนทำงาน
      (ซ่อนปุ่มอย่างเดียวไม่พอ — ด่านจริงอยู่ที่กติกาสิทธิ์ใน goadmin)
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

const PERM_KEYS = ['showRevenue','showElec','showExport','showPriceNote','showFreeday','showWhatIf','showCompare','showForecast','showRawData','showHeatmap','showBenchmark','showUtil','showUtilMoney'];
// MAP3D-OFF: เอา showMap3D ออก (ผัง 3D-Market-SR ไม่ทำต่อ) · ค่าเดิมในเอกสาร users ทิ้งไว้ได้ ไม่มีที่อ่านแล้ว
// WI-01: ป้าย What If บอกด้วยว่ามันอยู่ในแท็บพยากรณ์ — คนตั้งสิทธิ์จะได้เห็นความสัมพันธ์
const PERM_LABEL = {showRevenue:'รายรับ',showElec:'ค่าไฟ',showExport:'Export',showPriceNote:'หมายเหตุราคา',showFreeday:'วันฝน',showWhatIf:'What If (อยู่ในแท็บพยากรณ์)',showCompare:'เปรียบเทียบเดือน',showForecast:'พยากรณ์',showRawData:'ข้อมูลดิบ',showHeatmap:'ปฏิทินล็อก',showBenchmark:'Benchmark',showUtil:'น้ำ-ไฟ',showUtilMoney:'น้ำ-ไฟ: ยอดเงินบิล (รวมแท็บเทียบสาขา)'};
/* PERM-06 (v2.10.0): คีย์ที่ตั้งต้นเป็น "เปิด" ตอนสร้าง manager ใหม่
   + showFreeday  — ปลอดภัย ตัวเลขเงินในแท็บถูกซ่อนด้วย .col-rev อยู่แล้ว (FD-01) เห็นแค่จำนวนล็อก/วัน
   + showWhatIf   — คู่กับ showForecast ที่เปิดอยู่แล้ว (WI-01)
   − showRawData  — อันตรายกว่า: ให้ล็อกรายวันแยกออนไลน์/วอล์กอิน/โซนครบทุกวัน
                    ถึงซ่อนคอลัมน์เงิน แต่เอาไปคูณราคาเองก็ได้รายรับกลับมาเกือบเป๊ะ
                    ซ่อนผลลัพธ์แต่ไม่ซ่อนตัวตั้ง = ไม่ได้ซ่อนจริง · สอดคล้องกับ showPriceNote ที่ปิด default */
const PERM_DEFAULT_ON = ['showFreeday','showWhatIf','showCompare','showForecast','showHeatmap','showBenchmark'];
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
    const { data, error } = await sb.from('profiles').select('*');
    if(error) throw sbErr(error);
    const rows = (data || []).map(profileDoc);
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
      ? 'ฐานข้อมูลปฏิเสธการอ่าน — บัญชีนี้ไม่ใช่ admin ใน goadmin.profiles'
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
    + '<td style="padding:9px 6px">' + (brs.length ? esc(brs.map(brCode).join(', ')) : '<span style="color:var(--ink3)">—</span>') + '</td>'
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
    const { data, error } = await sb.from('profiles').select('*').eq('user_id', uid).maybeSingle();
    if(error) throw sbErr(error);
    if(data) u = profileDoc(data);
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
        + ALL_BRANCHES.map(b => cb('edBr_' + uid + '_' + b, brs.includes(b), brCode(b))).join('') + '</div>'
        // BM-04: สาขาที่เอาข้อมูลมาเทียบได้ในหน้า Benchmark เท่านั้น (ไม่ใช่สาขาที่ดูแล)
        + '<div id="edBmBox_' + uid + '" style="margin-top:8px"><div style="font-size:10px;color:var(--ink3);margin-bottom:4px">สาขาที่เทียบได้ใน Benchmark</div><div style="display:flex;gap:12px">'
        + ALL_BRANCHES.map(b => cb('edBm_' + uid + '_' + b, bms.includes(b), brCode(b))).join('') + '</div></div></div>'
      + '<div><div style="font-size:10px;color:var(--ink3);margin-bottom:4px">สิทธิ์</div>'
        + '<div id="edPermBox_' + uid + '" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 14px">'
        + PERM_KEYS.map(k => cb('edP_' + uid + '_' + k, u[k] === true, PERM_LABEL[k])).join('') + '</div></div>'
      // ย้ายใหญ่: อีเมลไม่มีจริง ส่งลิงก์ตั้งรหัสไม่ได้ → admin ตั้งให้ · เว้นว่าง = ไม่เปลี่ยน · ใช้กับทุกแอปที่ใช้บัญชีนี้
      + '<div><div style="font-size:10px;color:var(--ink3);margin-bottom:4px">ตั้งรหัสผ่านใหม่</div>'
        + '<input type="password" id="edPw_' + uid + '" autocomplete="new-password" placeholder="เว้นว่าง = ไม่เปลี่ยน" style="padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--ink);font-size:12px;width:160px">'
        + '<div style="font-size:9px;color:var(--ink3);margin-top:3px">อย่างน้อย 6 ตัว · ใช้กับระบบสต็อกด้วย</div></div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:12px">'
      + '<button onclick="saveUser(\'' + uid + '\')" style="background:var(--gold);color:#1a1f2e;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;font-family:\'Noto Sans Thai\',sans-serif">บันทึก</button>'
      + '<button onclick="loadUserList()" style="background:var(--surface3);border:1px solid var(--border);color:var(--ink2);padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-family:\'Noto Sans Thai\',sans-serif">ยกเลิก</button>'
    + '</div></td>';
  syncEditRole(uid);
  // WI-01: ผูก What If เข้ากับ พยากรณ์ (แถวถูกสร้างใหม่ทุกครั้ง → ไม่มี listener ซ้อน)
  bindWhatIfPair(document.getElementById('edP_' + uid + '_showUtilMoney'),   // UTIL-03: สิทธิ์ย่อยคู่แม่ แบบเดียวกับ What If
                 document.getElementById('edP_' + uid + '_showUtil'));
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
  if(payload.showUtilMoney === true) payload.showUtil = true;   // UTIL-03: สิทธิ์ย่อยต้องมีแม่

  const pw = (document.getElementById('edPw_' + uid) || {}).value || '';
  if(pw && pw.length < 6){ usrErr('รหัสผ่านต้องอย่างน้อย 6 ตัว'); return; }

  try{
    // แก้ตัวเองไม่ได้ (กติกาเดิม) → RLS ปฏิเสธเงียบ = 0 แถว · นับแถวเพื่อบอกให้ชัด
    const { data, error } = await sb.from('profiles').update(profileRow(payload)).eq('user_id', uid).select('user_id');
    if(error) throw sbErr(error);
    if(!data || !data.length) throw Object.assign(new Error('no rows'), { code: 'permission-denied' });
    if(pw) await usersFn({ action: 'password', user_id: uid, password: pw });
    await window.loadUserList();
  }catch(e){
    console.error('saveUser:', e);
    usrErr(e.code === 'permission-denied'
      ? 'บันทึกไม่ได้ — แก้สิทธิ์ตัวเองไม่ได้ (ให้ admin อีกคนแก้) หรือบัญชีนี้ไม่ใช่ admin'
      : ('บันทึกไม่สำเร็จ: ' + (e.message || e)));
  }
};

window.removeUser = async function(uid){
  if(!isAdmin()) return;
  usrErr('');
  let email = uid;
  try{
    const { data } = await sb.from('profiles').select('email').eq('user_id', uid).maybeSingle();
    if(data) email = data.email || uid;
  }catch(e){}
  if(!confirm('ลบสิทธิ์แดชบอร์ดของ ' + email + ' ?\n\nบัญชีล็อกอินยังอยู่ (ใช้ร่วมกับระบบสต็อก) — แค่เข้าแดชบอร์ดไม่ได้')) return;
  try{
    const { data, error } = await sb.from('profiles').delete().eq('user_id', uid).select('user_id');
    if(error) throw sbErr(error);
    if(!data || !data.length) throw Object.assign(new Error('no rows'), { code: 'permission-denied' });
    await window.loadUserList();
  }catch(e){
    console.error('removeUser:', e);
    usrErr(e.code === 'permission-denied'
      ? 'ลบไม่ได้ — ลบสิทธิ์ตัวเองไม่ได้ หรือบัญชีนี้ไม่ใช่ admin'
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
    bindWhatIfPair(document.getElementById('nuShowUtilMoney'), document.getElementById('nuShowUtil'));
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

  // สร้างบัญชีผ่าน Edge Function goadmin-users (กุญแจลับอยู่ฝั่งเซิร์ฟเวอร์ · admin ไม่หลุดจากระบบ)
  //   อีเมลนี้มีบัญชีอยู่แล้ว (เช่น ใช้ระบบสต็อกอยู่) = ใช้บัญชีเดิม รหัสเดิม แค่เพิ่มสิทธิ์แดชบอร์ด
  try{
    const payload = { email, role, branches, bmBranches };
    PERM_KEYS.forEach(k => {
      const el = document.getElementById('nu' + k.charAt(0).toUpperCase() + k.slice(1));
      payload[k] = (role === 'admin') ? true : !!(el && el.checked);
    });
    // WI-01: normalize อีกชั้นก่อนเขียน
    if(payload.showWhatIf === true) payload.showForecast = true;
    if(payload.showUtilMoney === true) payload.showUtil = true;   // UTIL-03: สิทธิ์ย่อยต้องมีแม่
    const r = await usersFn({ action: 'create', email, password: pass, profile: { email, ...profileRow(payload) } });

    window.closeAddUser();
    await window.loadUserList();
    if(r && r.existed) usrErr('ℹ️ ' + email + ' มีบัญชีอยู่แล้ว (เช่น ระบบสต็อก) — เพิ่มสิทธิ์แดชบอร์ดให้แล้ว รหัสผ่านยังเป็นรหัสเดิม');
  }catch(e){
    console.error('submitAddUser:', e);
    show('สร้างไม่สำเร็จ: ' + (e.message || e));
  }finally{
    btn.disabled = false; btn.textContent = 'สร้างผู้ใช้';
  }
};

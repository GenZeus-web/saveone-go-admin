// ============================================================
// supabase/auth.js — เข้าสู่ระบบ / ออกจากระบบ / กระจายสิทธิ์ตาม role (ย้ายจาก firebase/auth.js · ย้ายใหญ่ ขั้น 3)
// ============================================================
//
// รับผิดชอบ: onAuthStateChange (สลับหน้า login <-> dashboard),
//   อ่าน role + branches + perms จาก goadmin.profiles แล้วซ่อน/แสดง UI ตามสิทธิ์,
//   doLogin / doLogout / getIdToken / fetchBundleFromFirestore
//   (ชื่อ fetch*FromFirestore คงไว้ — js/data-load.js · views/util.js เรียกชื่อนี้ ไม่ต้องแตะ classic script)
//
// ผูกกับหน้าเว็บผ่าน window.* เพราะ index.html ยังเรียกด้วย onclick="..."
//   (โค้ดใน ES module ไม่ได้อยู่ใน global scope จึงต้องแปะไว้ที่ window เอง)
//
// ลำดับการรัน: <script type="module"> ถูก defer เสมอ -> ทำงานหลัง DOM พร้อม
//   และหลังไฟล์ js/*.js (classic script ท้าย body) ทั้งหมดแล้ว
//   จึงเรียก showSplash() / loadAll() / setBranch() ที่นิยามในไฟล์เหล่านั้นได้

import { sb, sbErr, setCurrentUser, currentEmail, signOutHere } from "./init.js";
import { loadSettings } from "./settings.js";

// แถวใน goadmin.profiles → รูปเดียวกับเอกสาร users/{uid} เดิม ({role, branches, bmBranches, showX…})
//   โค้ดสิทธิ์ข้างล่างจึงไม่ต้องเปลี่ยน · perms เก็บเป็น jsonb ก้อนเดียว
//   (user-admin.js มีตัวเดียวกัน — import ภายใน js/supabase/ ไม่มี ?v= จึงไม่แชร์ชื่อใหม่ข้ามไฟล์)
const profileDoc = (r) => ({ ...(r.perms || {}), uid: r.user_id, email: r.email, role: r.role,
  branches: r.branches, bmBranches: r.bm_branches, active: r.active });

// ---- สถานะล็อกอิน ----
// Supabase ยิงเหตุการณ์บ่อยกว่า Firebase (INITIAL_SESSION · SIGNED_IN ตอนสลับแท็บ/ใส่รหัสยืนยันราคา · TOKEN_REFRESHED)
//   → ทำงานจริงเฉพาะตอน "คนเปลี่ยน" (uid ใหม่ / ออกจากระบบ) · คนเดิม = แค่อัปเดตข้อมูลผู้ใช้ในตัวแปร
//   ห้าม await คำสั่ง Supabase ในตัวรับเหตุการณ์ตรงๆ (ค้างตาย — คู่มือ supabase-js) → setTimeout ออกไปก่อน
let shownUid;   // undefined = ยังไม่เคยตัดสิน · null = หน้า login
sb.auth.onAuthStateChange((event, session) => {
  const user = session ? session.user : null;
  setCurrentUser(user);
  const uid = user ? user.id : null;
  if (uid === shownUid) return;
  shownUid = uid;
  setTimeout(() => onUser(user), 0);
});

async function onUser(user) {
  if (user) {
    // UI-3D: เพิ่งกดเข้าสู่ระบบ → เริ่มพุ่งทันที คู่ขนานกับการอ่านสิทธิ์ด้านล่าง (ไม่ให้หน้าจอนิ่งค้างระหว่างรอ Firestore)
    if (window.__loginZoom && typeof window.beginLoginWarp === 'function') window.beginLoginWarp();
    let role = 'manager';
    let branches = ['SS'];
    // BM-04 (v2.10.0): สาขาที่ "เทียบได้ใน Benchmark" — แยกคนละแกนกับ branches
    //   branches   = สาขาที่ดูแล    → เห็นข้อมูลเต็ม ทุกแท็บ ทุกตัวเลข
    //   bmBranches = สาขาที่เทียบได้ → เอาข้อมูลมาใช้ในหน้า Benchmark เท่านั้น
    // fail-safe: ไม่มี field = ว่าง = พฤติกรรมเดิมเป๊ะ ไม่มีใครโดนเปิดสิทธิ์เงียบๆ ตอน deploy
    let bmBranches = [];
    let perms = {
      showRevenue: false,
      showElec: false,
      showExport: false,
      showPriceNote: false,
      showFreeday: false,
      showWhatIf: false,
      // PERM-03: 6 คีย์ใหม่ v2.9.0 — ของเดิมทุกคนเห็นอยู่แล้ว จึงตั้งต้นเป็น "เปิด"
      showCompare: true,
      showForecast: true,
      showRawData: true,
      showHeatmap: true,
      showBenchmark: true,
      // UTIL-03: น้ำ-ไฟ · ข้อมูลใหม่ ไม่มีใครเห็นมาก่อน → ตั้งต้น "ปิด" (=== true)
      //   showUtilMoney = สิทธิ์ย่อย ยอดเงินในบิล · มีผลเฉพาะเมื่อเปิด showUtil ด้วย · ด่านจริง = กฎ utilbill/
      showUtil: false,
      showUtilMoney: false
    };

    try {
      const { data: row, error } = await sb.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (error) throw sbErr(error);
      // ปิดบัญชีไว้ (active = false) = เหมือนไม่มีโปรไฟล์ · กติกาสิทธิ์ก็ไม่ให้อ่านข้อมูลอยู่แล้ว
      if (row && row.active) {
        const d = profileDoc(row);
        role = d.role || 'manager';
        branches = d.branches || ['SS'];
        // BM-04: อ่าน field ใหม่ — ไม่มี/ผิดชนิด = ว่าง (ไม่ใช่ ['SS'] แบบ branches)
        bmBranches = Array.isArray(d.bmBranches) ? d.bmBranches : [];
        // ถ้าเป็น admin ให้เห็นทุกอย่าง
        if (role === 'admin') {
          perms = {
            showRevenue: true,
            showElec: true,
            showExport: true,
            showPriceNote: true,
            showFreeday: true,
            showWhatIf: true,
            showCompare: true,
            showForecast: true,
            showRawData: true,
            showHeatmap: true,
            showBenchmark: true,
            showUtil: true,
            showUtilMoney: true
          };
          bmBranches = ['SS','BG','BN'];   // BM-04: admin เทียบได้ทุกสาขาเสมอ
        } else {
          // อ่านค่าจาก Firestore ถ้ามี ไม่งั้นใช้ default false
          perms.showRevenue = d.showRevenue === true;
          perms.showElec = d.showElec === true;
          perms.showExport = d.showExport === true;
          perms.showPriceNote = d.showPriceNote === true;
          perms.showFreeday = d.showFreeday === true;
          perms.showWhatIf = d.showWhatIf === true;
          // PERM-03: คีย์ใหม่ v2.9.0 ใช้ `!== false` — ผู้ใช้เดิมที่ยังไม่มี field นี้
          // ใน Firestore จะเห็นเหมือนเดิมทุกอย่าง ไม่มีแท็บหายไปเงียบๆ ตอน deploy
          perms.showCompare = d.showCompare !== false;
          perms.showForecast = d.showForecast !== false;
          perms.showRawData = d.showRawData !== false;
          perms.showHeatmap = d.showHeatmap !== false;
          perms.showBenchmark = d.showBenchmark !== false;
          perms.showUtil = d.showUtil === true;
          perms.showUtilMoney = perms.showUtil && d.showUtilMoney === true;
        }
      } else {
        // ERR-02: ล็อกอินได้แต่ไม่มีโปรไฟล์แดชบอร์ด (เช่น พนักงานสต็อก — บัญชีชุดเดียวกัน · ถูกลบโปรไฟล์ / ปิดบัญชี)
        //   เดิมได้ค่าตั้งต้น SS แล้วอ่านข้อมูลไม่ได้ (กฎต้อง hasProfile) → แดชบอร์ดว่าง · ตอนนี้ปฏิบัติเหมือนไม่มีสิทธิ์
        throw Object.assign(new Error('no user profile'), { code: 'no-profile' });
      }
    } catch(e) {
      console.error('profile error:', e);
      // ERR-01: อ่านโปรไฟล์ไม่ได้ = ไม่เปิดแดชบอร์ด
      //   เดิมเปิดต่อด้วยค่าตั้งต้น (branches=['SS']) → ทุกสาขา 0/0 · admin ก็ได้แค่ SS
      //   ผู้ใช้แยกไม่ออกว่า "ไม่มีข้อมูล" หรือ "เน็ตหลุด" (เจอจริง 25 ก.ย. 20:10 · client is offline)
      await showProfileError(e);
      return;
    }

    // ซ่อน login page แสดง dashboard
    // UI-3D: เพิ่งกดเข้าสู่ระบบ = รอให้ฉากพุ่งจบก่อนซ่อน (js/login-fx.js) · ไม่มีฟังก์ชัน = ซ่อนทันทีแบบเดิม
    if (typeof window.leaveLoginPage === 'function') window.leaveLoginPage();
    else document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainHeader').style.display = 'flex';
    document.getElementById('mainLayout').style.display = 'flex';

    // ตั้งค่า global
    window.userRole = role;
    window.userBranches = branches;
    window.userBmBranches = bmBranches;   // BM-04
    window.userPerms = perms;
    window.userEmail = user.email;

    // แสดง email ใน header
    const userEl = document.getElementById('userDisplay');
    if (userEl) userEl.textContent = user.email;

    // USR-02: เติมข้อมูลเมนูโปรไฟล์
    const initial = (user.email || '?').trim().charAt(0) || '?';
    ['profAvatar','profAvatarLg'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = initial;
    });
    const pe = document.getElementById('profEmail');
    if (pe) pe.textContent = user.email || '';
    const pr = document.getElementById('profRole');
    if (pr) pr.textContent = (role === 'admin' ? 'ผู้ดูแลระบบ (admin)' : 'ผู้จัดการ (manager)')
      + ' · ' + (Array.isArray(branches) ? branches.map(brCode).join(', ') : '');

    // USR-01: เมนูจัดการผู้ใช้ — เฉพาะ admin เท่านั้น
    const usersBtn = document.getElementById('profUsers');
    if (usersBtn) usersBtn.style.display = (role === 'admin') ? '' : 'none';
    // SET-01: หน้าตั้งค่าราคา/ฤดูกาล/เป้ายอด — เฉพาะ admin (ด่านจริงคือ Firestore Rules)
    const setBtn = document.getElementById('profSettings');
    if (setBtn) setBtn.style.display = (role === 'admin') ? '' : 'none';

    // ซ่อนสาขาที่ไม่มีสิทธิ์
    document.querySelectorAll('.branch-item[data-branch]').forEach(el => {
      const branch = el.getAttribute('data-branch');
      el.style.display = branches.includes(branch) ? '' : 'none';
    });

    // BM-04 (v2.10.0): Benchmark คุมด้วย showBenchmark ตัวเดียว
    //   ถอดด่าน `branches.length > 1` ของ PERM-01/02 ออก — manager สาขาเดียวที่ได้สิทธิ์นี้
    //   ต้องเข้าได้ ส่วนจะ "เห็นข้อมูลสาขาไหน" คุมด้วย bmBranches แทน (คนละแกน)
    //   ตัวเลขเงินในหน้านี้ยัง gate ด้วย showRevenue เหมือนเดิม (จุดเดียวที่ #bmKpiRow)
    const bmTab = document.getElementById('tab-benchmark');
    if (bmTab) bmTab.style.display = perms.showBenchmark ? '' : 'none';
    // ปุ่มเลือกสาขาในหน้า Benchmark — ซ่อนตาม "สาขาที่เทียบได้" (branches ∪ bmBranches)
    // ไม่ใช่ตาม branches อย่างเดียวเหมือน PERM-02 เดิม
    const bmView = ['SS','BG','BN'].filter(b => branches.includes(b) || bmBranches.includes(b));
    document.querySelectorAll('#bmBranchPills .mc-pill').forEach(el => {
      const m = /toggleBmBranch\('(\w+)'/.exec(el.getAttribute('onclick') || '');
      if (m) el.style.display = bmView.includes(m[1]) ? '' : 'none';
    });
    // ตั้งต้นปุ่มที่ถูกเลือก = สาขาแรกที่เทียบได้ (ไม่ใช่ 'SS' ตายตัวใน HTML)
    if (typeof window.initBmPills === 'function') window.initBmPills();

    // ตั้ง activeBranch เป็นสาขาแรกที่มีสิทธิ์
    if (typeof activeBranch !== 'undefined' && !branches.includes(activeBranch)) {
      if(typeof setBranch === 'function'){
        const firstBtn = document.querySelector('.branch-item[data-branch="'+branches[0]+'"]');
        if(firstBtn) setBranch(branches[0], firstBtn);
      }
    }

    // แสดง/ซ่อน features ตาม permissions
    // รายรับ (admin only)
    const revSection = document.getElementById('revSection');
    if(revSection) revSection.style.display = perms.showRevenue ? '' : 'none';
    // สถิติการจอง (ทุก role เห็น)
    const statsSection = document.getElementById('statsSection');
    if(statsSection) statsSection.style.display = '';
    // ค่าไฟ
    const elecCard = document.getElementById('k-elec-card');
    if(elecCard) elecCard.style.display = perms.showElec ? '' : 'none';
    // Export CSV
    document.querySelectorAll('.btn-export').forEach(el => {
      el.style.display = perms.showExport ? '' : 'none';
    });
    // หมายเหตุราคา tab
    const priceTab = document.getElementById('tab-pricenote');
    if(priceTab) priceTab.style.display = perms.showPriceNote ? '' : 'none';
    // วันฝน tab
    const freedayTab = document.getElementById('tab-freeday');
    if(freedayTab) freedayTab.style.display = perms.showFreeday ? '' : 'none';
    // What If section
    const whatifSection = document.getElementById('whatif-section');
    if(whatifSection) whatifSection.style.display = perms.showWhatIf ? '' : 'none';

    // PERM-03: แท็บใหม่ที่เพิ่งมีสิทธิ์คุม (v2.9.0)
    [['tab-compare','showCompare'],['tab-forecast','showForecast'],
     ['tab-rawdata','showRawData'],['tab-heatmap','showHeatmap'],['tab-util','showUtil']].forEach(([id,key]) => {
      const el = document.getElementById(id);
      if(el) el.style.display = perms[key] ? '' : 'none';
    });

    // PERM-04: แท็บที่กำลังเปิดอยู่ถูกซ่อน → เด้งกลับหน้าภาพรวม
    // (กันเคสผู้ใช้ค้างอยู่ในแท็บที่เพิ่งโดนถอดสิทธิ์ แล้วยังเห็นข้อมูลต่อ)
    try {
      const firstTab = document.querySelector('.vtabs .vtab');
      const activeTab = document.querySelector('.vtabs .vtab.active');
      if (activeTab && activeTab.style.display === 'none' && firstTab && typeof setView === 'function') {
        setView('overview', firstTab);
      }
    } catch(e){ console.warn('PERM-04:', e); }

    // ซ่อนคอลัมน์รายรับ/ค่าไฟ ในตาราง (ข้อมูลดิบ ฯลฯ) ตามสิทธิ์
    document.body.classList.toggle('no-rev', !perms.showRevenue);
    document.body.classList.toggle('no-elec', !perms.showElec);

    // โหลดข้อมูล — แสดง splash ก่อน
    if (typeof showSplash === 'function') showSplash();
    // SET-01: ราคา + เป้ายอดต้องพร้อมก่อนคำนวณรายรับ
    //   เคยโหลดแล้ว (มี cache) = ไม่รอ · เครื่องใหม่ = รออ่าน Firestore ก่อน (< 1 วิ)
    try { await loadSettings(); } catch(e) { console.error('loadSettings:', e); }
    if (typeof loadAll === 'function') loadAll();

  } else {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('mainHeader').style.display = 'none';
    document.getElementById('mainLayout').style.display = 'none';
  }
}

// ERR-01: ค้างที่หน้า login พร้อมบอกสาเหตุ
//   ไม่มีสิทธิ์อ่านโปรไฟล์ / ไม่มีโปรไฟล์ (ERR-02) = ออกจากระบบ ให้ติดต่อ admin (ลองซ้ำก็ไม่ผ่าน)
//   อย่างอื่น (เน็ตหลุด/Firestore ล่ม) = ยังล็อกอินค้างไว้ ปุ่มกลายเป็น "ลองใหม่" → โหลดหน้าใหม่
//   (กดเข้าสู่ระบบซ้ำด้วย user เดิมไม่ได้ผล — ตัวรับสถานะข้างบนไม่ทำงานซ้ำถ้า uid ไม่เปลี่ยน)
async function showProfileError(e) {
  if (typeof window.abortLoginWarp === 'function') window.abortLoginWarp();
  const denied = e && (e.code === 'permission-denied' || e.code === 'no-profile');   // ERR-02
  if (denied) { try { await signOutHere(); } catch(_) {} }
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('mainHeader').style.display = 'none';
  document.getElementById('mainLayout').style.display = 'none';
  const btn = document.getElementById('loginBtn');
  btn.disabled = false;
  btn.textContent = denied ? 'เข้าสู่ระบบ' : 'ลองใหม่';
  window.__profileErr = !denied;
  document.getElementById('loginErr').textContent = denied
    ? 'บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน — ติดต่อผู้ดูแลระบบ'
    : 'เชื่อมต่อฐานข้อมูลไม่ได้ — เช็คอินเทอร์เน็ตแล้วกด "ลองใหม่"';
}

// Login function
window.doLogin = async function() {
  if (window.__profileErr) { location.reload(); return; }   // ERR-01
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginErr');
  const btn = document.getElementById('loginBtn');
  
  if (!email || !password) {
    errEl.textContent = 'กรุณากรอก Email และ Password';
    return;
  }
  
  btn.textContent = 'กำลังเข้าสู่ระบบ...';
  window.__loginZoom = true;
  if (typeof window.loginCharge === 'function') window.loginCharge(true);   // UI-3D: ฉากเริ่มเร่งระหว่างรอเซิร์ฟเวอร์
  btn.disabled = true;
  errEl.textContent = '';
  
  try {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  } catch (e) {
    window.__loginZoom = false;
    if (typeof window.loginCharge === 'function') window.loginCharge(false);
    btn.textContent = 'เข้าสู่ระบบ';
    btn.disabled = false;
    errEl.textContent = (e && /fetch|network/i.test(e.message || ''))
      ? 'เชื่อมต่อไม่ได้ — เช็คอินเทอร์เน็ตแล้วลองใหม่'
      : 'Email หรือ Password ไม่ถูกต้อง';
  }
};

// Logout function — ออกเฉพาะเครื่องนี้ (แอปสต็อกที่ใช้บัญชีเดียวกันในเครื่องอื่นไม่หลุด)
window.doLogout = async function() {
  await signOutHere();
};

/* ══════════════════════════════════════════════════════════════
   ARCH-01 (v2.8.0): อ่านข้อมูลจาก Firestore แทนการยิงถาม Apps Script
   Apps Script ดันข้อมูลขึ้น collection `data` เองทุก 10 นาที (time trigger)
   ผู้ใช้จึงไม่ต้องรอ Apps Script อีกเลย — อ่าน Firestore ตรงๆ ไม่ถึงวินาที
   ══════════════════════════════════════════════════════════════ */
// ย้ายใหญ่ ขั้น 3: อ่านจาก goadmin.data_docs (Apps Script เขียนผ่าน Edge Function goadmin-ingest)
//   payload = ช่องเดียวกับเอกสาร data/{id} เดิม (csv · rows · ts · branch · sheet)
//   กติกาสิทธิ์กรองแถวเอง: ไม่มีสิทธิ์ = ไม่ได้แถวนั้นกลับมา (ไม่ใช่ error) → แยก "ยังไม่มี" กับ "ไม่มีสิทธิ์" ไม่ได้
window.fetchBundleFromFirestore = async function(docIds){
  const out = {};   // { ss_st:'csv…', … }
  const meta = {};  // { ss_st:{ts,rows}, … }
  const errs = [];
  try{
    const { data, error } = await sb.from('data_docs').select('doc_id,payload').in('doc_id', docIds);
    if(error) throw sbErr(error);
    const got = new Map((data || []).map(r => [r.doc_id, r.payload]));
    docIds.forEach(id => {
      const key = id.toLowerCase();   // SS_ST -> ss_st (ให้ตรงกับ key เดิมทั้งระบบ)
      const d = got.get(id);
      if(!d){ errs.push({url:id, msg:'ยังไม่มีข้อมูล หรือไม่มีสิทธิ์อ่าน (เช็คสาขาของผู้ใช้)'}); return; }
      if(typeof d.csv !== 'string' || !d.csv){ errs.push({url:id, msg:'เอกสารว่าง'}); return; }
      out[key]  = d.csv;
      meta[key] = { ts:Number(d.ts)||0, rows:Number(d.rows)||0 };
    });
  }catch(e){
    const msg = e.code === 'permission-denied' ? 'ไม่มีสิทธิ์อ่าน (เช็คสาขาของผู้ใช้)' : (e.message || String(e));
    docIds.forEach(id => errs.push({url:id, msg}));
  }
  return { csv:out, meta, errs };   // ครั้งเดียวได้ครบทุกเอกสาร (เดิมอ่าน Firestore ทีละเอกสารขนานกัน)
};

// UTIL-03: น้ำ-ไฟ ของสาขาเดียว · data_docs {BR}_UTIL = เลขไมล์ + รายการมิเตอร์ (กติกาสาขาที่ดูแล + showUtil)
//   withBills = อ่าน util_bills ด้วย (ยอดเงิน · กติกาแยก ต้องมี showUtilMoney) · ไม่มีสิทธิ์อย่าส่ง true
//   ไม่มีแถว = ค่าว่าง ไม่ใช่ error (สาขาที่ยังไม่เคยจด)
window.fetchUtilFromFirestore = async function(branch, withBills){
  const one = async (q) => { const { data, error } = await q.maybeSingle(); if(error) throw sbErr(error); return data ? data.payload : null; };
  // บิลอ่านไม่ได้ (ถูกถอดสิทธิ์ / เน็ตสะดุด) ต้องไม่ล้มทั้งแท็บ → เลขไมล์ยังขึ้น แค่บอกว่าบิลอ่านไม่ได้
  let billsErr = '';
  const [u, b] = await Promise.all([one(sb.from('data_docs').select('payload').eq('doc_id', branch + '_UTIL')),
    withBills ? one(sb.from('util_bills').select('payload').eq('branch', branch)).catch(e => { billsErr = e.code || e.message || String(e); return null; }) : null]);
  return {
    billsErr,
    csv: u && typeof u.csv === 'string' ? u.csv : '',
    metersCsv: u && typeof u.metersCsv === 'string' ? u.metersCsv : '',
    ts: u ? Number(u.ts) || 0 : 0,
    billsCsv: b && typeof b.csv === 'string' ? b.csv : '',
    // UTIL-23: หน่วยในบิล ไม่มียอดเงิน (อยู่ใน data/ ใช้กฎสาขาเดิม) · Apps Script เก่ายังไม่ส่ง = ค่าว่าง
    billUnitsCsv: u && typeof u.billUnitsCsv === 'string' ? u.billUnitsCsv : ''
  };
};

// UTIL-51: ประวัติการส่งออก CSV น้ำ-ไฟ · goadmin.export_log เพิ่มได้อย่างเดียว · อ่านได้เฉพาะ admin
//   by_email ต้องเป็นอีเมลคนที่ล็อกอิน (กติกาตรวจ) · เขียนไม่ได้ = throw → views/util.js ไม่ปล่อยไฟล์ (ดึงต้องมีประวัติ)
//   device เขียนซ้ำที่นี่ ไม่ import จาก settings.js (import ภายใน js/supabase/ ไม่มี ?v= → ไฟล์เก่าในแคชไม่มีชื่อใหม่ = auth.js ล้มทั้งไฟล์)
window.logUtilExport = async function(x){
  const ua = navigator.userAgent || '';
  const device = (/iPhone|iPad/.test(ua)?'iOS' : /Android/.test(ua)?'Android' : /Windows/.test(ua)?'Windows' : /Mac OS X/.test(ua)?'Mac' : 'อื่นๆ')
    + ' · ' + (/Edg\//.test(ua)?'Edge' : /Chrome\//.test(ua)?'Chrome' : /Safari\//.test(ua)?'Safari' : /Firefox\//.test(ua)?'Firefox' : 'อื่นๆ');
  const { error } = await sb.from('export_log').insert({
    by_email: currentEmail(), device, kind: 'util',
    branch: String(x.branch), from_date: String(x.from), to_date: String(x.to),
    meters: (x.meters || []).map(String), rows: Number(x.rows) || 0, note: String(x.note || '').slice(0, 200)
  });
  if(error) throw sbErr(error);
};
window.loadUtilExportLog = async function(n){
  const { data, error } = await sb.from('export_log').select('*').order('at', { ascending: false }).limit(n || 30);
  if(error) throw sbErr(error);
  // รูปเดียวกับเอกสาร exportLog เดิม (views/util.js อ่าน at · by · device · branch · from · to · meters · rows · note)
  return (data || []).map(x => ({ at: x.at ? Date.parse(x.at) : null, by: x.by_email, device: x.device, kind: x.kind,
    branch: x.branch, from: x.from_date, to: x.to_date, meters: x.meters || [], rows: x.rows, note: x.note }));
};

// token ของผู้ใช้ปัจจุบัน (เดิมแนบไป Apps Script ยุคก่อน ARCH-01 · ตอนนี้ไม่มีที่เรียก คงไว้ให้ชื่อเดิมยังอยู่)
window.getIdToken = async function() {
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.access_token : null;
};

// Enter key login
window.loginKeyPress = function(e) {
  if (e.key === 'Enter') window.doLogin();
};


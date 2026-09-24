// ============================================================
// firebase/auth.js — เข้าสู่ระบบ / ออกจากระบบ / กระจายสิทธิ์ตาม role
// ============================================================
//
// รับผิดชอบ: onAuthStateChanged (สลับหน้า login <-> dashboard),
//   อ่าน role + branches + perms จาก Firestore แล้วซ่อน/แสดง UI ตามสิทธิ์,
//   doLogin / doLogout / getIdToken / fetchBundleFromFirestore
//
// ผูกกับหน้าเว็บผ่าน window.* เพราะ index.html ยังเรียกด้วย onclick="..."
//   (โค้ดใน ES module ไม่ได้อยู่ใน global scope จึงต้องแปะไว้ที่ window เอง)
//
// ลำดับการรัน: <script type="module"> ถูก defer เสมอ -> ทำงานหลัง DOM พร้อม
//   และหลังไฟล์ js/*.js (classic script ท้าย body) ทั้งหมดแล้ว
//   จึงเรียก showSplash() / loadAll() / setBranch() ที่นิยามในไฟล์เหล่านั้นได้

import { auth, db } from "./init.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { loadSettings } from "./settings.js";

// ---- ORIGINAL (index.html) ----
// เช็ค login state
onAuthStateChanged(auth, async (user) => {
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
      showMap3D: true
    };

    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const d = userDoc.data();
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
            showMap3D: true
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
          perms.showMap3D = d.showMap3D !== false;
        }
      }
    } catch(e) {
      console.error('Firestore error:', e);
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
      + ' · ' + (Array.isArray(branches) ? branches.join(', ') : '');

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
     ['tab-rawdata','showRawData'],['tab-heatmap','showHeatmap']].forEach(([id,key]) => {
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

    // PERM-05: ลิงก์ผัง 3D — คุมด้วย showMap3D ตัวเดียว
    // v2.10.0 LAY-03: อ้างด้วย id แทน `[data-branch]` เพราะถอด data-branch ออกแล้ว
    //   (ไม่งั้นลูป "ซ่อนสาขาที่ไม่มีสิทธิ์" ข้างบนจะซ่อนปุ่มนี้จาก manager BG/BN
    //    ทั้งที่ผัง 3D เปิดให้ดูข้ามสาขาได้แล้ว)
    // v2.10.4 LAY-04-link: คุมลิงก์ผัง 3D ทุกตัว (SS + BN พรีวิว) ด้วย showMap3D ตัวเดียว
    //   ใช้ querySelectorAll เผื่อเพิ่มสาขาใหม่ในอนาคต ไม่ต้องกลับมาแก้ตรงนี้อีก
    document.querySelectorAll('[id^="link-map3d"]').forEach(el => {
      el.style.display = perms.showMap3D ? '' : 'none';
    });

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
});

// Login function
window.doLogin = async function() {
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
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    window.__loginZoom = false;
    if (typeof window.loginCharge === 'function') window.loginCharge(false);
    btn.textContent = 'เข้าสู่ระบบ';
    btn.disabled = false;
    errEl.textContent = 'Email หรือ Password ไม่ถูกต้อง';
  }
};

// Logout function
window.doLogout = async function() {
  await signOut(auth);
};

/* ══════════════════════════════════════════════════════════════
   ARCH-01 (v2.8.0): อ่านข้อมูลจาก Firestore แทนการยิงถาม Apps Script
   Apps Script ดันข้อมูลขึ้น collection `data` เองทุก 10 นาที (time trigger)
   ผู้ใช้จึงไม่ต้องรอ Apps Script อีกเลย — อ่าน Firestore ตรงๆ ไม่ถึงวินาที
   ══════════════════════════════════════════════════════════════ */
window.fetchBundleFromFirestore = async function(docIds){
  const out = {};   // { ss_st:'csv…', … }
  const meta = {};  // { ss_st:{ts,rows}, … }
  const errs = [];
  const jobs = docIds.map(async id => {
    const key = id.toLowerCase();   // SS_ST -> ss_st (ให้ตรงกับ key เดิมทั้งระบบ)
    try{
      const snap = await getDoc(doc(db, 'data', id));
      if(!snap.exists()){ errs.push({url:id, msg:'ยังไม่มีข้อมูล (Apps Script ยังไม่เคยดันขึ้นมา)'}); return; }
      const d = snap.data();
      if(!d || typeof d.csv !== 'string' || !d.csv){ errs.push({url:id, msg:'เอกสารว่าง'}); return; }
      out[key]  = d.csv;
      meta[key] = { ts:Number(d.ts)||0, rows:Number(d.rows)||0 };
    }catch(e){
      errs.push({url:id, msg: e.code === 'permission-denied'
        ? 'ไม่มีสิทธิ์อ่าน (เช็ค branches ของผู้ใช้ / Firestore Rules)'
        : (e.message || String(e))});
    }
  });
  await Promise.all(jobs);   // อ่าน Firestore ขนานได้เต็มที่ ไม่มีปัญหาแบบ Apps Script
  return { csv:out, meta, errs };
};

// ดึง ID token ของ user ปัจจุบัน (ไว้แนบไป Apps Script)
// ไม่ force = คืน token ที่ cache ในเครื่องทันที (ไม่พึ่งเน็ต) Firebase จะ refresh ให้เองตอนใกล้/หมดอายุ
// → token นิ่ง ~55 นาที ทำให้ cache ฝั่ง Apps Script hit ซ้ำได้ + กัน Unauthorized ตอนเน็ตสะดุด
window.getIdToken = function() {
  return auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null);
};

// Enter key login
window.loginKeyPress = function(e) {
  if (e.key === 'Enter') window.doLogin();
};


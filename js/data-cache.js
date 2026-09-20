// ============================================================
// data-cache.js — CACHE-01 เก็บ CSV ใน localStorage + สิทธิ์สาขา/ท่อข้อมูล         [เดิม 2479-2588]
// ============================================================
// ══ v2.6.3 CACHE-01: เก็บข้อมูลไว้ในเครื่อง แล้วโชว์ทันทีตอนเปิดเว็บ ══
// ปัญหาที่แก้: Apps Script อยู่ในเส้นทางที่ผู้ใช้ต้องรอ ปรับ retry/timeout/จำนวนท่อ
//   ยังไงก็ยังต้องรอ. cache ทำให้ "การรอ" หายไปเลย — เปิดปุ๊บเห็นข้อมูลรอบก่อนทันที
//   แล้วค่อยดึงของใหม่เบื้องหลัง ได้ก็อัปเดต ไม่ได้ก็ใช้ของเก่าต่อ (มีป้ายบอกเวลาเสมอ)
// เก็บเป็น "CSV ดิบ" ไม่ใช่ object ที่ parse แล้ว — เล็กกว่ามาก (~260 KB) และไม่มีปัญหา Date
const CACHE_KEY='saveone_data_v1';
const CACHE_MAX_AGE=7*24*60*60*1000;  // เก่าเกิน 7 วันไม่ใช้ (กันเอาข้อมูลค้างนานมาโชว์)
let rawCSV={};      // {ss_st:'csv...', ss_non:'...', bg_st:..., bg_car:..., bn_st:..., bn_car:...}
let cacheShownAt=0; // เวลาของข้อมูลที่โชว์อยู่ตอนนี้ (0 = ยังไม่มี)

// ── v2.7.1 PERM-01: สาขาที่ผู้ใช้คนนี้มีสิทธิ์ ──
// ใช้เป็นตัวกำหนดว่าจะยิงกี่ท่อ + cache ชุดไหน
// ถ้ายังไม่รู้ (เรียกก่อน onAuthStateChanged เสร็จ) ให้ถือว่าครบ 3 สาขาไว้ก่อน = พฤติกรรมเดิม
const ALL_BR=['SS','BG','BN'];
const BR_PIPES={SS:['ss_st','ss_non'], BG:['bg_st','bg_car'], BN:['bn_st','bn_car']};
function myBranches(){
  const b=window.userBranches;
  if(!Array.isArray(b)||!b.length) return ALL_BR.slice();
  const f=ALL_BR.filter(x=>b.includes(x));
  return f.length?f:ALL_BR.slice();
}
// ── v2.10.0 BM-04: สาขาที่ผู้ใช้ "เทียบได้" ในหน้า Benchmark ──
// = สาขาที่ดูแล (branches) ∪ สาขาที่เปิดให้เทียบ (bmBranches)
// bmBranches ไม่มี/ว่าง = ได้เท่ากับ myBranches() = พฤติกรรมเดิมก่อน v2.10.0 เป๊ะ
function myBmBranches(){
  const x=window.userBmBranches;
  const extra=Array.isArray(x)?ALL_BR.filter(b=>x.includes(b)):[];
  const mine=myBranches();
  return ALL_BR.filter(b=>mine.includes(b)||extra.includes(b));
}
// รายชื่อ key ของท่อที่ "ควรได้" สำหรับผู้ใช้คนนี้
// v2.10.0: รวมสาขาที่เทียบได้ด้วย ไม่งั้น renderBenchmark ได้ bgMerged/bnMerged = [] → "ยังไม่มีข้อมูล"
function myPipeKeys(){ return myBmBranches().flatMap(b=>BR_PIPES[b]); }
// ลายเซ็นชุดสาขา — ใช้กัน cache ของ admin (3 สาขา) ไปโผล่ให้ manager (สาขาเดียว) และกลับกัน
// v2.10.0: ต้องรวม bmBranches ด้วย ไม่งั้น cache ของคนที่เทียบ 3 สาขาจะไปปนกับคนที่มีสาขาเดียว
//   (ลายเซ็นเปลี่ยนรูปแบบ → cache เก่าก่อน v2.10.0 ใช้ไม่ได้ ทิ้งแล้วโหลดใหม่รอบเดียว)
function brSig(){ return myBranches().join('-')+'+'+myBmBranches().join('-'); }

function saveCache(){
  try{
    // v2.7.1 PERM-01: เช็คเฉพาะท่อที่ผู้ใช้คนนี้ควรได้ ไม่ใช่ทั้ง 6 ท่อ
    //   ของเดิมบังคับครบ 6 → manager ที่โหลดแค่สาขาตัวเองจะไม่มีวันได้ cache เลย
    const keys=myPipeKeys();
    if(!keys.every(k=>rawCSV[k])) { console.warn('cache: ข้อมูลไม่ครบ ไม่บันทึก'); return; }
    localStorage.setItem(CACHE_KEY, JSON.stringify({ts:Date.now(), br:brSig(), csv:rawCSV}));
    console.log('💾 บันทึก cache แล้ว ('+brSig()+')');
  }catch(e){ console.warn('cache: บันทึกไม่ได้ (พื้นที่เต็ม?)', e.message); }
}

function loadCache(){
  try{
    const raw=localStorage.getItem(CACHE_KEY);
    if(!raw) return null;
    const o=JSON.parse(raw);
    if(!o || !o.csv || !o.ts) return null;
    if(Date.now()-o.ts > CACHE_MAX_AGE){ console.warn('cache: เก่าเกิน 7 วัน ไม่ใช้'); return null; }
    // v2.7.1 PERM-01: cache ที่เก็บไว้ตอนสิทธิ์ไม่ตรงกัน ใช้ไม่ได้
    //   (ไม่มี br = cache เก่าก่อน v2.7.1 → ทิ้ง ให้โหลดใหม่รอบเดียว)
    if(o.br !== brSig()){ console.warn('cache: คนละชุดสาขา ('+(o.br||'ไม่ระบุ')+' ≠ '+brSig()+') ไม่ใช้'); return null; }
    return o;
  }catch(e){ console.warn('cache: อ่านไม่ได้', e.message); return null; }
}

// แปลง CSV ดิบ 6 ก้อน -> เข้าตัวแปรข้อมูลของระบบ (ใช้ทางเดียวกับตอนโหลดสด)
// v2.8.0: รับ quiet เข้ามา — โหลดสดจาก Firestore ก็ใช้ทางนี้ ไม่ควรขึ้น log ว่า "จาก cache"
function applyCsvBundle(csv, quiet=true){
  const P=t=>t?Papa.parse(t,{header:true,skipEmptyLines:true,dynamicTyping:false}).data:[];
  return applyRowsBundle({
    ss_st:P(csv.ss_st), ss_non:P(csv.ss_non),
    bg_st:P(csv.bg_st), bg_car:P(csv.bg_car),
    bn_st:P(csv.bn_st), bn_car:P(csv.bn_car)
  }, quiet);
}

// map + merge ทั้ง 3 สาขา — แยกออกมาเพื่อให้ทั้ง "โหลดสด" และ "อ่าน cache" ใช้ตัวเดียวกัน
function applyRowsBundle(R, quiet){
  const ss_st=(R.ss_st||[]).map(mapST).filter(Boolean), ss_non=(R.ss_non||[]).map(mapNon).filter(Boolean);
  if(ss_st.length===0 && ss_non.length===0){ if(!quiet) console.warn('SS โหลดแรกได้ข้อมูลว่าง'); }
  else{ stData=ss_st; nonData=ss_non; mergeData(); dataLoaded.SS=true; }

  const bg_st=(R.bg_st||[]).map(mapST).filter(Boolean), bg_car=(R.bg_car||[]).map(mapNon).filter(Boolean);
  if(bg_st.length===0 && bg_car.length===0){ if(!quiet) console.warn('BG โหลดแรกได้ข้อมูลว่าง'); }
  else{ bgStData=bg_st; bgCarData=bg_car; mergeBG(); dataLoaded.BG=true; }

  const bn_st=(R.bn_st||[]).map(mapST).filter(Boolean), bn_car=(R.bn_car||[]).map(mapNon).filter(Boolean);
  if(bn_st.length===0 && bn_car.length===0){ if(!quiet) console.warn('BN โหลดแรกได้ข้อมูลว่าง'); }
  else{ bnStData=bn_st; bnCarData=bn_car; mergeBN(); dataLoaded.BN=true; }

  console.log(`${quiet?'💾 จาก cache':'🌐 โหลดสด'} — SS ${stData.length}/${nonData.length} · BG ${bgStData.length}/${bgCarData.length} · BN ${bnStData.length}/${bnCarData.length}`);
}

// ป้ายบอกอายุข้อมูล — ผู้ใช้ต้องรู้เสมอว่ากำลังดูข้อมูลของเมื่อไหร่
// state: 'loading' = กำลังดึงของใหม่ · 'fresh' = เพิ่งอัปเดต · 'stale' = ดึงไม่สำเร็จ ใช้ของเก่า
function setDataAge(ts, state){
  cacheShownAt=ts||cacheShownAt;
  const el=document.getElementById('updTime');
  if(!el) return;
  const t=cacheShownAt?new Date(cacheShownAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}):'—';
  const d=cacheShownAt?new Date(cacheShownAt):null;
  const sameDay=d && d.toDateString()===new Date().toDateString();
  const when=sameDay?t:(d?d.toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit'})+' '+t:'—');
  if(state==='loading'){
    el.innerHTML=`ข้อมูล ${when} <span style="color:var(--ink3)">· กำลังอัปเดต…</span>`;
  }else if(state==='stale'){
    el.innerHTML=`ข้อมูล ${when} <span style="color:var(--red);font-weight:700">· อัปเดตไม่สำเร็จ</span>`;
  }else{
    el.innerHTML=`อัปเดต ${when}`;
  }
}


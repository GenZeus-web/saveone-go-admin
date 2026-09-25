// ============================================================
// ui.js — splash, sidebar/drawer มือถือ, ธีมสว่าง-มืด, auto refresh, What If        [เดิม 3945-4129]
// ============================================================
// ── SPLASH ANIMATION ──
function showSplash(){
  const splash=document.getElementById('splash');
  const logo=document.getElementById('splashLogo');
  const wordmark=document.getElementById('splashWordmark');
  const company=document.getElementById('splashCompany');
  const bar=document.getElementById('splashBar');
  const fill=document.getElementById('splashFill');
  if(!splash) return;
  // SPLASH-01: มี cache = loadAll โชว์ข้อมูลทันที → splash ได้แค่แวบเดียวตอน F5 (กะพริบ) · โชว์เฉพาะเครื่องที่ยังไม่มี cache
  if(typeof loadCache==='function' && loadCache()) return;
  // reset state
  if(logo) logo.classList.remove('show');
  if(wordmark) wordmark.classList.remove('show');
  if(company) company.classList.remove('show');
  if(bar) bar.classList.remove('show');
  if(fill) fill.classList.remove('go');
  splash.style.display='flex';
  // animate
  setTimeout(()=>{if(logo) logo.classList.add('show');},300);
  setTimeout(()=>{if(wordmark) wordmark.classList.add('show');},900);
  setTimeout(()=>{if(company) company.classList.add('show');},1300);
  setTimeout(()=>{if(bar) bar.classList.add('show');setTimeout(()=>{if(fill) fill.classList.add('go');},50);},1500);
}

// ── SIDEBAR TOGGLE ──
let sidebarOpen=true;
function toggleSidebar(){
  sidebarOpen=!sidebarOpen;
  const sb=document.getElementById('sidebar');
  const btn=document.getElementById('sidebarBtn');
  if(sb) sb.classList.toggle('collapsed',!sidebarOpen);
  if(btn) btn.textContent=sidebarOpen?'◀':'▶';
}

/* ── v2.11.0 RWD-01: drawer สำหรับมือถือ (<=768px) ──
   แยกคนละคลาสกับ .collapsed ของจอใหญ่ เพื่อไม่ให้ 2 โหมดตีกัน
   ไม่แตะ state ของข้อมูล/สิทธิ์ใดๆ — เปิด/ปิดหน้าตาอย่างเดียว */
function isMobileNav(){ return window.matchMedia('(max-width:768px)').matches; }
function setMobileNav(open){
  const sb=document.getElementById('sidebar');
  const bd=document.getElementById('sbBackdrop');
  const btn=document.getElementById('mnavBtn');
  if(sb) sb.classList.toggle('mopen',open);
  if(bd) bd.classList.toggle('show',open);
  document.body.classList.toggle('mnav-open',open);   // LAY-06: ยก .layout เหนือหัวเว็บตอนเปิด (responsive.css)
  document.documentElement.classList.toggle('mnav-open',open);   // LAY-08: ตรึงทั้งหน้าบน iPhone (responsive.css)
  if(btn) btn.setAttribute('aria-expanded',open?'true':'false');
}
function toggleMobileNav(){
  const sb=document.getElementById('sidebar');
  setMobileNav(!(sb&&sb.classList.contains('mopen')));
}
function closeMobileNav(){ setMobileNav(false); }

// แตะลิงก์ที่พาออกจากหน้า (ผัง 3D เปิดแท็บใหม่) แล้วปิด drawer เอง
// ส่วนตัวกรอง สาขา/โซน/ช่วงเวลา ตั้งใจให้ drawer ค้างเปิด เพราะมักตั้งหลายอย่างติดกัน
// (แท็บรายงาน .vtabs อยู่ในพื้นที่เนื้อหา ไม่ได้อยู่ใน sidebar จึงไม่เกี่ยวกับ drawer)
document.addEventListener('click',function(e){
  if(!isMobileNav()) return;
  const sb=document.getElementById('sidebar');
  if(!sb||!sb.classList.contains('mopen')) return;
  if(e.target.closest&&e.target.closest('#sidebar a')) closeMobileNav();
});
/* v2.11.1 RWD-02: มือถือ = ย้ายแท็บรายงานเข้า drawer (ตามดีไซน์) · จอใหญ่ = ย้ายกลับที่เดิม
   ย้ายโหนดจริงด้วย appendChild ไม่ใช่ copy — event handler เดิมจึงติดไปด้วยทั้งหมด
   จำที่อยู่เดิมไว้ครั้งแรกครั้งเดียว เพื่อคืนตำแหน่งให้ถูกเป๊ะตอนกลับจอใหญ่ */
let _navHome=null;
function syncNavPlacement(){
  const vt=document.querySelector('.vtabs');
  const host=document.getElementById('sbNavHost');
  if(!vt||!host) return;
  if(!_navHome) _navHome={parent:vt.parentElement,next:vt.nextSibling};
  if(isMobileNav()){
    if(vt.parentElement!==host){ host.appendChild(vt); }
    host.style.display='';
  }else{
    if(vt.parentElement!==_navHome.parent){ _navHome.parent.insertBefore(vt,_navHome.next); }
    host.style.display='none';
  }
}
document.addEventListener('DOMContentLoaded',syncNavPlacement);
// แตะเมนูรายงานใน drawer แล้วปิด drawer เอง (ถือว่าไปหน้าใหม่แล้ว)
document.addEventListener('click',function(e){
  if(!isMobileNav()) return;
  if(e.target.closest&&e.target.closest('#sbNavHost .vtab')) closeMobileNav();
});

// ปิด drawer อัตโนมัติเมื่อหมุนจอ/ขยายกลับเป็นจอใหญ่ กัน state ค้าง
window.addEventListener('resize',function(){ if(!isMobileNav()) closeMobileNav(); syncNavPlacement(); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeMobileNav(); });

// ── DARK/LIGHT MODE จำค่า ──
let isDark=localStorage.getItem('swTheme')!=='light';
function toggleTheme(){
  isDark=!isDark;
  document.body.classList.toggle('light-mode',!isDark);
  const btn=document.getElementById('themeBtn');
  if(btn) btn.innerHTML=isDark?'🌙<span class="rf-lbl"> Dark</span>':'☀️<span class="rf-lbl"> Light</span>'; // .rf-lbl ซ่อนบนจอแคบ
  localStorage.setItem('swTheme',isDark?'dark':'light');
  if(Object.keys(charts).length>0) applyAll();
}
// โหลดค่า theme จาก localStorage
(function(){
  if(!isDark){
    document.body.classList.add('light-mode');
    const btn=document.getElementById('themeBtn');
    if(btn) btn.innerHTML='☀️<span class="rf-lbl"> Light</span>';
  }
})();

// ── FONT-01: ขนาดตัวอักษร 3 ระดับ (ปกติ/ใหญ่/ใหญ่มาก) จำค่าต่อเครื่อง ──
//   CSS ทั้งเว็บเขียนเป็น px → เปลี่ยน font-size ราก ไม่มีผล จึงใช้ zoom (ดู base.css body.fs-1/fs-2)
//   กราฟเป็น canvas: คูณ devicePixelRatio ตามซูม ไม่งั้นภาพเบลอ แล้ววาดใหม่
const FONT_KEY='sg_font', FONT_ZOOM=[1,1.15,1.3];
let fontLevel=0;
try{ fontLevel=Math.min(2,Math.max(0,parseInt(localStorage.getItem(FONT_KEY),10)||0)); }catch(e){}
function setFontLevel(lv){
  fontLevel=Math.min(2,Math.max(0,lv|0));
  document.body.classList.remove('fs-1','fs-2');
  if(fontLevel) document.body.classList.add('fs-'+fontLevel);
  document.querySelectorAll('[data-fs]').forEach(b=>b.classList.toggle('active',+b.dataset.fs===fontLevel));
  try{ localStorage.setItem(FONT_KEY,String(fontLevel)); }catch(e){}
  if(typeof Chart!=='undefined') Chart.defaults.devicePixelRatio=(window.devicePixelRatio||1)*FONT_ZOOM[fontLevel];
  if(Object.keys(charts).length>0) applyAll();
}
(function(){
  if(fontLevel) document.body.classList.add('fs-'+fontLevel);
  if(typeof Chart!=='undefined') Chart.defaults.devicePixelRatio=(window.devicePixelRatio||1)*FONT_ZOOM[fontLevel];
  document.querySelectorAll('[data-fs]').forEach(b=>b.classList.toggle('active',+b.dataset.fs===fontLevel));
})();

// ── AUTO REFRESH ──
let autoRefreshInterval=null;
let autoRefreshMin=5;
function startAutoRefresh(minutes){
  if(autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshMin=minutes||5;
  autoRefreshInterval=setInterval(()=>{
    console.log('Auto refresh...');
    refreshBranch();
  },autoRefreshMin*60*1000);
}
// เริ่ม auto refresh ทุก 5 นาที
startAutoRefresh(5);

// ── KPI ANIMATE ──
function animateNumber(el,target,duration=1400){
  if(!el) return;
  const start=0;
  const startTime=performance.now();
  const isFloat=String(target).includes('.');
  function update(now){
    const elapsed=now-startTime;
    const progress=Math.min(elapsed/duration,1);
    const ease=1-Math.pow(1-progress,3);
    const current=start+(target-start)*ease;
    el.textContent=isFloat?fmtN(current,1):fmtN(Math.round(current));
    if(progress<1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}


// ── WHAT IF ──
function calcWhatIf(){
  const lockPerDay=parseFloat(document.getElementById('wiLock')?.value)||0;
  const days=parseInt(document.getElementById('wiDays')?.value)||30;
  // คำนวณ % วันหยุดอัตโนมัติจากวันที่จริง
  const startDate=new Date();
  let wkndDaysAuto=0;
  for(let i=0;i<days;i++){const d=new Date(startDate);d.setDate(d.getDate()+i);if([0,5,6].includes(d.getDay()))wkndDaysAuto++;}
  const wkndPct=wkndDaysAuto/days;
  const res=document.getElementById('wiResult');
  const note=document.getElementById('wiNote');
  if(!res||lockPerDay<=0) return;

  const wkndDays=Math.round(days*wkndPct);
  const wdDays=days-wkndDays;
  const totalLock=lockPerDay*days;
  const zoneLbl=activeBranch==='SS'?'ST · Street Food (70% Online/30% WalkIn)':'Car/Non · Boot Sale';
  const lockCards=`
    <div class="fc-card"><div class="fc-val">${fmtN(lockPerDay,1)}</div><div class="fc-lbl">ล็อก/วัน (จำลอง)</div></div>
    <div class="fc-card"><div class="fc-val">${fmtN(totalLock)}</div><div class="fc-lbl">ล็อกรวม ${days} วัน</div></div>`;

  // PERM-06: เดิมไม่เช็คสิทธิ์เลย — ปิด showRevenue แล้วยังเห็นรายรับ/วันที่นี่ (หารกลับได้ราคาต่อล็อก)
  //   ไม่มีสิทธิ์ หรือโหลดราคาไม่ได้ = ไม่คำนวณเงินเลย (ไม่ใช่ซ่อนด้วย CSS ที่ยังเหลือเลขใน DOM) · canSeeRev() ใน utils.js
  if(!canSeeRev()){
    res.innerHTML=lockCards;
    note.innerHTML=`สมมติฐาน: ${wkndDays} วันหยุด (ศ-อา) ${wdDays} วันธรรมดา | สาขา ${activeBranch} | โซน ${zoneLbl}`;
    return;
  }

  // คำนวณรายรับตามสาขา
  let revPerDay=0;
  if(activeBranch==='SS'){
    const st=priceCellFor('SS','st',new Date()); // SET-01: ราคาจากหน้าตั้งค่า (ชุดที่มีผลวันนี้)
    const po_wd=st.on[0], po_wk=st.on[1], pw_wd=st.wi[0], pw_wk=st.wi[1];
    // สมมติ 70% online 30% walkin
    const onlineWd=lockPerDay*0.7*po_wd, walkWd=lockPerDay*0.3*pw_wd;
    const onlineWk=lockPerDay*0.7*po_wk, walkWk=lockPerDay*0.3*pw_wk;
    revPerDay=(onlineWd*wdDays+onlineWk*wkndDays+walkWd*wdDays+walkWk*wkndDays)/days;
  } else {
    const car=priceCellFor(activeBranch,'non',new Date()); // SET-01: ราคาจากหน้าตั้งค่า (ชุดที่มีผลวันนี้)
    const p_wd=car.on[0], p_wk=car.on[1];
    revPerDay=(p_wd*wdDays+p_wk*wkndDays)/days*lockPerDay;
  }

  const totalRev=Math.round(revPerDay*days);
  const revPerDayRound=Math.round(revPerDay);

  res.innerHTML=lockCards+`
    <div class="fc-card" style="background:rgba(63,185,80,.1);border-color:rgba(63,185,80,.3)"><div class="fc-val" style="color:var(--green)">${fmtN(revPerDayRound)}</div><div class="fc-lbl">รายรับเฉลี่ย/วัน (฿)</div></div>
    <div class="fc-card" style="background:rgba(63,185,80,.1);border-color:rgba(63,185,80,.3)"><div class="fc-val" style="color:var(--green)">${fmtN(totalRev)}</div><div class="fc-lbl">รายรับรวม ${days} วัน (฿)</div></div>
  `;
  note.innerHTML=`สมมติฐาน: ${wkndDays} วันหยุด (ศ-อา) ${wdDays} วันธรรมดา | สาขา ${activeBranch} | โซน ${zoneLbl} | ราคาตามฤดูกาลปัจจุบัน`;
}


// ── LAY-05: ป๊อปอัปทุกตัวใช้กลไกเดียวกับยอดวันนี้ (body.modal-open ใน components.css) ──
//   เดิมมีแค่ todayModal ที่ใส่ class → อีก 5 ตัวโดนหัวเว็บบัง + ข้างหลังเลื่อนตามได้
//   ไม่แก้ฟังก์ชันเปิด/ปิดทีละตัว (10+ จุด รวม Esc/คลิกพื้นหลัง) แต่เฝ้า style ของกล่องแทน
//   → เปิดอยู่ ≥1 ตัว = ล็อก · ปิดครบ = ปลด (ป๊อปอัปซ้อนกัน เช่น ยืนยันรหัสบนหน้าตั้งค่า ก็ถูก)
(function(){
  const ids=['dayModal','todayModal','settingsModal','setConfirm','usersModal','addUserModal'];
  const els=ids.map(id=>document.getElementById(id)).filter(Boolean);
  const sync=()=>document.body.classList.toggle('modal-open',els.some(el=>el.style.display&&el.style.display!=='none'));
  const mo=new MutationObserver(sync);
  els.forEach(el=>mo.observe(el,{attributes:true,attributeFilter:['style']}));
  sync();
})();

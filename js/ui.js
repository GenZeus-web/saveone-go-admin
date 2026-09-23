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
  if(btn) btn.textContent=isDark?'🌙 Dark':'☀️ Light';
  localStorage.setItem('swTheme',isDark?'dark':'light');
  if(Object.keys(charts).length>0) applyAll();
}
// โหลดค่า theme จาก localStorage
(function(){
  if(!isDark){
    document.body.classList.add('light-mode');
    const btn=document.getElementById('themeBtn');
    if(btn) btn.textContent='☀️ Light';
  }
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
  
  // คำนวณรายรับตามสาขา
  let revPerDay=0;
  if(activeBranch==='SS'){
    const po_wd=100, po_wk=130, pw_wd=130, pw_wk=160;
    // สมมติ 70% online 30% walkin
    const onlineWd=lockPerDay*0.7*po_wd, walkWd=lockPerDay*0.3*pw_wd;
    const onlineWk=lockPerDay*0.7*po_wk, walkWk=lockPerDay*0.3*pw_wk;
    revPerDay=(onlineWd*wdDays+onlineWk*wkndDays+walkWd*wdDays+walkWk*wkndDays)/days;
  } else {
    const m=new Date().getMonth()+1;
    const p_wd=nonPriceAt(activeBranch,m,false), p_wk=nonPriceAt(activeBranch,m,true); // PRICE-01: ตารางราคาเดียวกับ utils.js
    revPerDay=(p_wd*wdDays+p_wk*wkndDays)/days*lockPerDay;
  }

  const totalLock=lockPerDay*days;
  const totalRev=Math.round(revPerDay*days);
  const revPerDayRound=Math.round(revPerDay);

  res.innerHTML=`
    <div class="fc-card"><div class="fc-val">${fmtN(lockPerDay,1)}</div><div class="fc-lbl">ล็อก/วัน (จำลอง)</div></div>
    <div class="fc-card"><div class="fc-val">${fmtN(totalLock)}</div><div class="fc-lbl">ล็อกรวม ${days} วัน</div></div>
    <div class="fc-card" style="background:rgba(63,185,80,.1);border-color:rgba(63,185,80,.3)"><div class="fc-val" style="color:var(--green)">${fmtN(revPerDayRound)}</div><div class="fc-lbl">รายรับเฉลี่ย/วัน (฿)</div></div>
    <div class="fc-card" style="background:rgba(63,185,80,.1);border-color:rgba(63,185,80,.3)"><div class="fc-val" style="color:var(--green)">${fmtN(totalRev)}</div><div class="fc-lbl">รายรับรวม ${days} วัน (฿)</div></div>
  `;
  const zoneLbl=activeBranch==='SS'?'ST · Street Food (70% Online/30% WalkIn)':'Car/Non · Boot Sale';
  note.innerHTML=`สมมติฐาน: ${wkndDays} วันหยุด (ศ-อา) ${wdDays} วันธรรมดา | สาขา ${activeBranch} | โซน ${zoneLbl} | ราคาตามฤดูกาลปัจจุบัน`;
}


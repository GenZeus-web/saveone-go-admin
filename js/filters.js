// ============================================================
// filters.js — ตัวกรอง (สาขา/โซน/กลุ่ม/ช่วงเวลา/เดือน) + applyAll ตัวกระจายงาน   [เดิม 2868-3014]
// ============================================================
let selMonths=new Set(); // multi-select months for compare view

function buildMonths(){
  const sel=document.getElementById('monthSel');
  const ks=[...new Set(getActiveMerged().map(r=>mKey(r.date)))].sort().reverse();
  sel.innerHTML='<option value="">— ทุกเดือน —</option>';
  ks.forEach(k=>{const[y,m]=k.split('-');const o=document.createElement('option');o.value=k;o.textContent=mLbl(new Date(y,m-1,1));sel.appendChild(o);});
  // สร้าง pills สำหรับ compare
  const pills=document.getElementById('mcPills');
  if(pills){
    // เลือก 3 เดือนล่าสุดเป็น default
    const recent=ks.slice(0,3);
    recent.forEach(k=>selMonths.add(k));
    const _allSel=ks.length&&ks.every(k=>selMonths.has(k));
    const _allBtn=`<button class="mc-pill mc-pill-all${_allSel?' sel':''}" onclick="toggleAllMonths(this)">${_allSel?'ล้างทั้งหมด':'ทั้งหมด'}</button>`;
    pills.innerHTML=_allBtn+ks.map(k=>{const[y,m]=k.split('-');return `<button class="mc-pill${selMonths.has(k)?' sel':''}" data-mk="${k}" onclick="toggleMonth('${k}',this)">${mLbl(new Date(y,m-1,1))}</button>`;}).join('');
  }
}

function _syncAllMonthBtn(){
  const a=document.querySelector('.mc-pill-all');
  if(!a) return;
  const ks=[...new Set(getActiveMerged().map(r=>mKey(r.date)))];
  const allSel=ks.length&&ks.every(k=>selMonths.has(k));
  a.classList.toggle('sel',allSel);
  a.textContent=allSel?'ล้างทั้งหมด':'ทั้งหมด';
}
function toggleMonth(k,btn){
  if(selMonths.has(k)){selMonths.delete(k);btn.classList.remove('sel');}
  else{selMonths.add(k);btn.classList.add('sel');}
  _syncAllMonthBtn();
  if(view==='compare') renderCompare();
}
function toggleAllMonths(btn){
  const ks=[...new Set(getActiveMerged().map(r=>mKey(r.date)))];
  const allSel=ks.length&&ks.every(k=>selMonths.has(k));
  if(allSel) selMonths.clear();
  else ks.forEach(k=>selMonths.add(k));
  document.querySelectorAll('#mcPills .mc-pill[data-mk]').forEach(b=>b.classList.toggle('sel',selMonths.has(b.dataset.mk)));
  _syncAllMonthBtn();
  if(view==='compare') renderCompare();
}

function updateZoneLabel(){
  const el=document.getElementById('zNonLabel');
  if(!el) return;
  el.textContent=activeBranch==='SS'?'Non · Boot Seller':'Car · Boot Sale';
}

function setBranch(b,btn){
  document.querySelectorAll('.branch-item').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  activeBranch=b;
  updateZoneLabel();
  // อัปเดตชื่อสาขาใน header
  const names={SS:'ศรีสมาน',BG:'ประตูกรุงเทพ',BN:'บางนา'};
  const badges={SS:'SS',BG:'BG',BN:'BN'};
  const el=document.getElementById('rtBranch');if(el)el.textContent=names[b]||b;
  const badge=document.querySelector('.rt-badge');if(badge)badge.textContent=badges[b]||b;
  // รีเซ็ต zone เป็น all
  zone='all';document.querySelectorAll('[id^="z-"]').forEach(x=>x.classList.remove('active'));
  const za=document.getElementById('z-all');if(za)za.classList.add('active');
  syncTargetUI();
  // สลับข้อมูลทันที ไม่ต้องโหลดใหม่
  buildMonths();applyAll();
}
function setZone(z,btn){zone=z;document.querySelectorAll('[id^="z-"]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');syncTargetUI();applyAll();}
function setGroup(v){group=v;applyAll();}
function setPeriod(d,btn){period=d;selMonth='';customFrom=null;customTo=null;document.getElementById('monthSel').value='';document.getElementById('customDateWrap').style.display='none';document.querySelectorAll('[id^="p"]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');applyAll();}
function setMonth(v){selMonth=v;period=0;customFrom=null;customTo=null;document.getElementById('customDateWrap').style.display='none';document.querySelectorAll('[id^="p"]').forEach(x=>x.classList.remove('active'));applyAll();}
function toggleCustomDate(btn){
  const wrap=document.getElementById('customDateWrap');
  const isOpen=wrap.style.display!=='none';
  if(isOpen){wrap.style.display='none';setPeriod(90,document.getElementById('p90'));}
  else{wrap.style.display='block';period=0;selMonth='';document.getElementById('monthSel').value='';document.querySelectorAll('[id^="p"]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');}
}
function applyCustomDate(){
  const f=document.getElementById('dateFrom').value;
  const t=document.getElementById('dateTo').value;
  if(!f||!t) return;
  customFrom=new Date(f+'T00:00:00');customTo=new Date(t+'T23:59:59');
  period=0;selMonth='';applyAll();
}
function setView(v,btn){
  view=v;
  document.querySelectorAll('.vtab').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  ['overview','freeday','forecast','pricenote','rawdata','compare','heatmap','benchmark'].forEach(id=>{
    const el=document.getElementById('view-'+id);
    if(el)el.style.display=id===v?'block':'none';
  });
  applyAll();
}

function applyZone(d){
  if(zone==='st'){
    return d.map(r=>({...r,nonLock:0,nonRai:0,l1n:0,l2n:0,
      nonOnlineLock:0,nonWalkInLock:0,nonExtraLock:0,nonCancelLock:0,nonAbsentLock:0,
      nonOnlineRai:0,nonWalkInRai:0,
      nonExtraRai:0,nonCancelRai:0,nonAbsentRai:0,nonFree:false}));
  } else if(zone==='non'){
    return d.map(r=>({...r,
      onlineLock:0,onlineRai:0,walkInLock:0,walkInRai:0,extraLock:0,
      cancelLock:0,absentLock:0,extraRai:0,cancelRai:0,absentRai:0,l1:0,l2:0
    }));
  }
  return d;
}
function getFiltered(){
  let d=getActiveMerged();
  if(selMonth) d=d.filter(r=>mKey(r.date)===selMonth);
  else if(customFrom&&customTo) d=d.filter(r=>r.date>=customFrom&&r.date<=customTo);
  else if(period>0){const cut=new Date();cut.setDate(cut.getDate()-period);d=d.filter(r=>r.date>=cut);}
  return applyZone(d);
}

function updateDateRange(d){
  const zoneNames={all:'ทุกโซน',st:'ST เท่านั้น',non:'Non/Car เท่านั้น'};
  const groupNames={all:'ทุกประเภท',online:'ออนไลน์',walkin:'วอคอิน',extra:'ล็อกเสริม',cancel:'ยกเลิก/ลา'};
  if(!d.length){
    ['drFrom','drTo'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='ไม่มีข้อมูล';});
    const dd=document.getElementById('drDays');if(dd)dd.textContent='0 วัน';
  } else {
    const sorted=[...d].sort((a,b)=>a.date-b.date);
    const elFrom=document.getElementById('drFrom');if(elFrom)elFrom.textContent=fmtD(sorted[0].date);
    const elTo=document.getElementById('drTo');if(elTo)elTo.textContent=fmtD(sorted[sorted.length-1].date);
    const elDays=document.getElementById('drDays');if(elDays)elDays.textContent=`${d.length} วัน`;
  }
  const elZone=document.getElementById('drZone');if(elZone)elZone.textContent=zoneNames[zone]||zone;
  const elGroup=document.getElementById('drGroup');if(elGroup)elGroup.textContent=groupNames[group]||group;
}

function updateRange(d){}

function applyAll(){
  targetLock=Math.max(1,currentTarget()||1); // ENH-05: เป้าตามสาขา+โซนปัจจุบัน
  const d=getFiltered();
  updateDateRange(d);
  if(view==='overview') renderOverview(d);
  else if(view==='freeday') renderFreeday(d);
  else if(view==='forecast') renderForecast();
  else if(view==='rawdata') renderRaw(d);
  else if(view==='compare') renderCompare();
  else if(view==='heatmap') renderHeatmap();
  else if(view==='benchmark') renderBenchmark();
}


// ============================================================
// data-load.js — loadAll, แบนเนอร์สถานะข้อมูล, refreshBranch, รวมข้อมูล ST+Non    [เดิม 2589-2867]
// ============================================================
async function loadAll(){
  const ts=Date.now();

  // ── v2.6.3 CACHE-01: ขั้นที่ 1 — มี cache ไหม? มีก็โชว์ทันที ไม่ต้องรอ Apps Script ──
  let shownFromCache=false;
  const cached=loadCache();
  if(cached){
    try{
      rawCSV={...cached.csv};
      applyCsvBundle(cached.csv);
      syncTargetUI(); buildMonths(); applyAll();
      document.getElementById('loadingState').style.display='none';
      document.getElementById('mainContent').style.display='block';
      hideSplash();
      setDataAge(cached.ts,'loading');
      shownFromCache=true;
      console.log('⚡ โชว์จาก cache ทันที — กำลังดึงของใหม่เบื้องหลัง');
    }catch(e){
      console.warn('cache: ใช้ไม่ได้ ข้ามไปโหลดสด', e.message);
      shownFromCache=false;
    }
  }

  // ── ขั้นที่ 2 — ดึงของใหม่ (ถ้าโชว์ cache อยู่แล้ว ทำเงียบๆ เบื้องหลัง ไม่บังหน้าจอ) ──
  if(!shownFromCache){
    document.getElementById('loadingState').style.display='flex';
    document.getElementById('mainContent').style.display='none';
  }
  try{
    document.getElementById('spinTxt').textContent='กำลังโหลดข้อมูล...';
    loadErrors=[]; fetchTimes=[];
    const _tAll=Date.now();

    // ══ v2.8.0 ARCH-01: อ่านจาก Firestore แทนการยิงถาม Apps Script ══
    //   Apps Script ดันข้อมูลขึ้นเองทุก 10 นาที (time trigger) ผู้ใช้จึงไม่ต้องรอมันอีก
    //   เดิม: เปิดเว็บ -> รอ Apps Script 9-108 วิ (สุ่มพัง 404/timeout แก้ที่โค้ดไม่ได้)
    //   ใหม่: อ่าน Firestore < 1 วิ  ยิงขนานได้เต็มที่ ไม่มีลิมิต concurrency แบบ Apps Script
    const _br=myBranches();
    const _docIds=myPipeKeys().map(k=>k.toUpperCase());   // ss_st -> SS_ST
    console.log(`📡 อ่าน Firestore ${_docIds.length} เอกสาร (สาขาที่มีสิทธิ์: ${_br.join(', ')})`);

    if(typeof window.fetchBundleFromFirestore!=='function'){
      throw new Error('ตัวอ่าน Firestore ยังไม่พร้อม (โมดูล Firebase โหลดไม่สำเร็จ)');
    }
    const FB=await window.fetchBundleFromFirestore(_docIds);
    loadErrors=FB.errs||[];

    // เก็บ CSV ดิบไว้ทั้งก้อน แล้วเข้าเส้นทางเดียวกับ cache (applyCsvBundle)
    rawCSV={...rawCSV, ...FB.csv};
    applyCsvBundle(FB.csv, false);

    // ป้ายเวลา = เวลาที่ Apps Script เขียนขึ้น Firestore (ไม่ใช่เวลาที่เราเพิ่งอ่าน)
    //   ผู้ใช้ต้องรู้ว่ากำลังดูข้อมูลของเมื่อไหร่จริงๆ ไม่ใช่แค่ "เพิ่งโหลด"
    const _stamps=Object.values(FB.meta||{}).map(m=>m.ts).filter(Boolean);
    const _dataTs=_stamps.length?Math.min(..._stamps):0;

    console.log(`⏱ อ่าน Firestore เสร็จใน ${((Date.now()-_tAll)/1000).toFixed(2)} วิ`
      + (_dataTs?` · ข้อมูลอัปเดตล่าสุด ${new Date(_dataTs).toLocaleString('th-TH')}`:'')
      + (loadErrors.length?` · พลาด ${loadErrors.length} เอกสาร`:''));
    if(loadErrors.length) console.warn('เอกสารที่อ่านไม่ได้:', loadErrors);

    syncTargetUI();buildMonths();applyAll();
    renderDataHealth(); // v2.6.2 NET-03: เตือนถ้าสาขาไหนโหลดไม่ครบ

    // v2.6.3 CACHE-01: ได้ของใหม่แล้ว -> เก็บ cache + อัปป้ายเวลา
    // v2.8.0: ป้ายบอก "เวลาที่ข้อมูลถูกเขียนขึ้น Firestore" ไม่ใช่เวลาที่เราเพิ่งอ่าน
    if(loadErrors.length===0){ saveCache(); setDataAge(_dataTs||Date.now(),'fresh'); }
    else { setDataAge(_dataTs||cacheShownAt||Date.now(),'stale'); }

    document.getElementById('loadingState').style.display='none';
    document.getElementById('mainContent').style.display='block';
    hideSplash();
    if(typeof maybeShowTodayPopup==='function') maybeShowTodayPopup(); // TODAY-01
  }catch(e){
    console.error('loadAll ล้มเหลว:', e.message);
    // v2.6.2 NET-04: ต้องซ่อน splash ด้วย ไม่งั้น error ถูก splash (z-index 9999) บังหมด เห็นเป็นหน้าโหลดค้าง
    hideSplash();
    // v2.6.3 CACHE-01: ถ้ามีข้อมูลจาก cache โชว์อยู่แล้ว "ห้าม" เอาหน้า error ไปทับ
    //   ผู้ใช้ยังทำงานต่อได้ด้วยข้อมูลรอบก่อน แค่เปลี่ยนป้ายบอกว่าอัปเดตไม่สำเร็จ
    if(shownFromCache){
      setDataAge(cacheShownAt,'stale');
      renderDataHealth();
      if(typeof maybeShowTodayPopup==='function') maybeShowTodayPopup(); // TODAY-01
    }else{
      document.getElementById('loadingState').style.display='flex';
      document.getElementById('loadingState').innerHTML=`<div style="text-align:center;color:var(--red)">❌ โหลดไม่ได้: ${e.message}<br><br><button class="rfbtn" onclick="loadAll()">ลองใหม่</button></div>`;
    }
  }
}

// v2.6.2 PERF-01: สรุปเวลาโหลดใน console — จะได้เห็นว่าเวลาหมดไปตรงไหน ไม่ต้องเดา
function logLoadTimes(msToken, msTotal, workers){
  if(!fetchTimes.length && !loadErrors.length) return;
  const sorted=[...fetchTimes].sort((a,b)=>b.ms-a.ms);
  const slow=sorted[0];
  console.log('%c⏱ สรุปเวลาโหลด','font-weight:bold;font-size:13px');
  console.log(`   อุ่น token      : ${(msToken/1000).toFixed(1)} วิ`);
  sorted.forEach(f=>{
    console.log(`   ${(f.ms/1000).toFixed(1).padStart(5)} วิ  ${f.url}  (${f.rows} แถว${f.tries>1?` · ลอง ${f.tries} ครั้ง`:''})`);
  });
  if(loadErrors.length) console.log(`   ❌ พลาด ${loadErrors.length} ท่อ: ${loadErrors.map(e=>e.url).join(', ')}`);
  // PERF-05: เกณฑ์เตือนเดิม (เทียบกับ "ท่อช้าสุด x1.8") ใช้ได้เฉพาะตอนยิงขนานทั้งหมด
  //   พอมาใช้ pool คุมที่ FETCH_CONCURRENCY เวลารวม "ควรจะ" เป็น ผลรวมทุกท่อ ÷ จำนวน worker อยู่แล้ว
  //   เกณฑ์เก่าเลยเตือนผิดทุกครั้ง (เตือนหมาป่า) — เปลี่ยนมาเทียบกับค่าที่ควรเป็นจริงๆ
  //   v2.7.1: จำนวน worker จริงส่งเข้ามา (สาขาเดียวบังคับ 1) ไม่ใช่ FETCH_CONCURRENCY เสมอไป
  const W=Math.max(1, workers||FETCH_CONCURRENCY);
  const sum=fetchTimes.reduce((a,f)=>a+f.ms,0);
  const expect=sum/W;
  console.log(`   ── รวมทั้งหมด   : ${(msTotal/1000).toFixed(1)} วิ   (ควรได้ ~${(expect/1000).toFixed(1)} วิ = งานรวม ${(sum/1000).toFixed(1)} ÷ ${W} ท่อพร้อมกัน)`);
  if(slow) console.log(`   ท่อที่ช้าสุด    : ${slow.url} (${(slow.ms/1000).toFixed(1)} วิ)`);

  const hadRetry=fetchTimes.some(f=>f.tries>1)||loadErrors.length>0;
  if(hadRetry){
    console.warn('   ⚠️ มีท่อที่ต้องลองซ้ำ — เวลารวมจึงสูงกว่าที่ควร ดูรายการข้างบนว่าท่อไหน');
  }else if(msTotal > expect*1.3+1000){
    console.warn(`   ⚠️ เวลารวมสูงกว่าที่ควรเกิน 30% — ท่ออาจไม่ได้ขนานกันจริง (ตรวจ fetchPool / FETCH_CONCURRENCY)`);
  }
}

// v2.6.2 NET-04: แยกเป็นฟังก์ชันเพื่อเรียกได้ทั้งตอนสำเร็จและตอน error
function hideSplash(){
  const splash=document.getElementById('splash');
  if(splash && splash.style.display!=='none'){
    splash.classList.add('hide');
    setTimeout(()=>{splash.classList.remove('hide');splash.style.display='none';},600);
  }
}

// v2.6.2 NET-03: แบนเนอร์เตือนเมื่อข้อมูลบางสาขาโหลดไม่ครบ
// เดิมเขียนแค่ console.warn → ผู้ใช้เห็นเลข 0 แล้วนึกว่าไม่มีลูกค้าจริง (อันตรายกว่าเว็บพัง)
function renderDataHealth(){
  const el=document.getElementById('dataHealth');
  if(!el) return;
  // v2.7.1 PERM-01: เตือนเฉพาะสาขาที่ผู้ใช้มีสิทธิ์ — สาขาที่ไม่ได้โหลดเพราะไม่มีสิทธิ์ ไม่ใช่ "ข้อมูลไม่ครบ"
  const _mine=myBranches();
  const NAME={SS:'ศรีสมาน (SS)', BG:'ประตูกรุงเทพ (BG)', BN:'บางนา (BN)'};
  const bad=_mine.filter(b=>!dataLoaded[b]).map(b=>NAME[b]);
  // v2.10.0 BM-04: เอกสารที่พลาดเพราะเป็นสาขาที่ "เทียบได้เฉยๆ" (bmBranches) ไม่ใช่สาขาที่ดูแล
  //   ไม่ใช่ "ข้อมูลไม่ครบ" ของคนนี้ — ขึ้นแบนเนอร์แดงจะเป็นการเตือนมั่ว (docId = SS_ST / BG_CAR …)
  const _errMine=loadErrors.filter(x=>_mine.includes(String(x.url||'').split('_')[0].toUpperCase()));
  if(bad.length===0 && _errMine.length===0){ el.style.display='none'; el.innerHTML=''; return; }
  const detail=_errMine.length
    ? `<div style="font-size:11px;color:var(--ink3);margin-top:6px">รายละเอียด: ${_errMine.map(x=>`${x.url} — ${x.msg}`).join(' · ')}</div>`
    : '';
  const head=bad.length
    ? `⚠️ ข้อมูลไม่ครบ — อ่านไม่ได้: <strong>${bad.join(', ')}</strong>`
    : `⚠️ บางส่วนอ่านไม่สำเร็จ ข้อมูลอาจไม่ครบ`;
  el.style.display='block';
  // v2.8.0: ข้อมูลมาจาก Firestore แล้ว — อ่านไม่ได้ = Apps Script ยังไม่เคยดันขึ้นมา หรือสิทธิ์ไม่ถึง
  el.innerHTML=`<div style="background:rgba(255,86,86,.12);border:1px solid var(--red);border-radius:10px;padding:12px 14px;margin-bottom:14px">
    <div style="color:var(--red);font-weight:700;font-size:13px">${head}</div>
    <div style="font-size:12px;color:var(--ink2);margin-top:4px">ตัวเลขบนหน้านี้ <strong>ยังไม่ใช่ยอดจริง</strong> อย่าเพิ่งเอาไปใช้ตัดสินใจ — กด "รีเฟรช" อีกครั้ง · ถ้ายังไม่หาย เช็คว่า Apps Script ของสาขานั้นรัน trigger อยู่ไหม (ดู APPSCRIPT-v3-firestore.md)</div>
    ${detail}
  </div>`;
}

// v2.8.0 ARCH-01: รีเฟรชสาขาที่ดูอยู่ = อ่าน Firestore 2 เอกสาร (เร็ว ไม่แตะ Apps Script)
//   เดิมยิง Apps Script ทีละท่อ (limit=1) เสียเวลา ~2.5 วิ และสุ่มพังได้
//   ตอนนี้ข้อมูลถูกดันขึ้นมาแล้วโดย trigger — "รีเฟรช" จึงแค่ไปหยิบของล่าสุดมาดู
async function refreshBranch(){
  try{
    loadErrors=[];
    if(!myBranches().includes(activeBranch)){ console.warn('refresh: ไม่มีสิทธิ์สาขา '+activeBranch); return; }
    if(typeof window.fetchBundleFromFirestore!=='function'){ console.warn('refresh: ตัวอ่าน Firestore ยังไม่พร้อม'); return; }

    const ids=(BR_PIPES[activeBranch]||[]).map(k=>k.toUpperCase());
    const FB=await window.fetchBundleFromFirestore(ids);
    loadErrors=FB.errs||[];

    const P=t=>t?Papa.parse(t,{header:true,skipEmptyLines:true,dynamicTyping:false}).data:[];
    const [kSt,kNon]=BR_PIPES[activeBranch];
    const st=P(FB.csv[kSt]).map(mapST).filter(Boolean);
    const non=P(FB.csv[kNon]).map(mapNon).filter(Boolean);

    // กันข้อมูลหาย: อ่านไม่ได้/ว่าง ห้ามทับของเดิม (เจตนาเดิมจาก v2.6.2)
    if(st.length===0 && non.length===0){
      console.warn(activeBranch+' refresh: ข้อมูลว่าง ข้ามการอัปเดต (คงข้อมูลเดิม)');
      renderDataHealth(); setDataAge(cacheShownAt,'stale'); return;
    }

    rawCSV[kSt]=FB.csv[kSt]; rawCSV[kNon]=FB.csv[kNon];
    if(activeBranch==='SS'){ stData=st;nonData=non;mergeData();dataLoaded.SS=true; }
    else if(activeBranch==='BG'){ bgStData=st;bgCarData=non;mergeBG();dataLoaded.BG=true; }
    else if(activeBranch==='BN'){ bnStData=st;bnCarData=non;mergeBN();dataLoaded.BN=true; }

    buildMonths();applyAll();
    renderDataHealth();
    const _ts=Object.values(FB.meta||{}).map(m=>m.ts).filter(Boolean);
    const _dataTs=_ts.length?Math.min(..._ts):0;
    if(loadErrors.length===0){ saveCache(); setDataAge(_dataTs||Date.now(),'fresh'); }
    else { setDataAge(_dataTs||cacheShownAt,'stale'); }
  }catch(e){console.error('รีเฟรชไม่ได้:',e.message);setDataAge(cacheShownAt,'stale');}
}

function getDateKey(date){
  if(!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function mergeBranch(stArr, nonArr){
  const map={};
  // ใส่ ST ก่อน
  stArr.forEach(r=>{
    const key=getDateKey(r.date);
    if(!key) return;
    map[key]={
      date:r.date, dateStr:r.dateStr,
      onlineLock:r.onlineLock||0, onlineRai:r.onlineRai||0,
      walkInLock:r.walkInLock||0, walkInRai:r.walkInRai||0,
      extraLock:r.extraLock||0, extraRai:r.extraRai||0,
      cancelLock:r.cancelLock||0, absentLock:r.absentLock||0,
      cancelRai:r.cancelRai||0, absentRai:r.absentRai||0,
      freeDay:r.freeDay,
      l1:r.l1||0, l2:r.l2||0,
      // Non fields เริ่มที่ 0
      nonLock:0, nonRai:0, l1n:0, l2n:0, nonFree:false,
      nonOnlineLock:0, nonWalkInLock:0, nonExtraLock:0,
      nonCancelLock:0, nonAbsentLock:0,
      nonOnlineRai:0, nonWalkInRai:0,
      nonExtraRai:0, nonCancelRai:0, nonAbsentRai:0
    };
  });
  // merge Non เข้าไป โดยใช้ getDateKey เพื่อให้ format ตรงกัน
  nonArr.forEach(r=>{
    const key=getDateKey(r.date);
    if(!key) return;
    const nOnline=r.onlineLock||0;
    const nWalkIn=r.walkInLock||0;
    const nExtra=r.extraLock||0;
    const nLock=nOnline+nWalkIn+nExtra;
    const nOnlineRai=r.onlineRai||0;
    const nWalkInRai=r.walkInRai||0;
    const nRai=nOnlineRai+nWalkInRai;
    if(map[key]){
      map[key].nonLock=nLock;
      map[key].nonRai=nRai;
      map[key].nonOnlineRai=nOnlineRai;
      map[key].nonWalkInRai=nWalkInRai;
      map[key].nonOnlineLock=nOnline;
      map[key].nonWalkInLock=nWalkIn;
      map[key].nonExtraLock=nExtra;
      map[key].nonCancelLock=r.cancelLock||0;
      map[key].nonAbsentLock=r.absentLock||0;
      map[key].nonExtraRai=r.extraRai||0;
      map[key].nonCancelRai=r.cancelRai||0;
      map[key].nonAbsentRai=r.absentRai||0;
      map[key].l1n=r.l1||0;
      map[key].l2n=r.l2||0;
      map[key].nonFree=r.freeDay;
    } else {
      // มี Non แต่ไม่มี ST วันนั้น
      map[key]={
        date:r.date, dateStr:r.dateStr,
        onlineLock:0, onlineRai:0,
        walkInLock:0, walkInRai:0,
        extraLock:0, cancelLock:0, absentLock:0,
        extraRai:0, cancelRai:0, absentRai:0,
        freeDay:r.freeDay, l1:0, l2:0,
        nonLock:nLock, nonRai:nRai,
        nonOnlineLock:nOnline, nonWalkInLock:nWalkIn, nonExtraLock:nExtra,
        nonCancelLock:r.cancelLock||0, nonAbsentLock:r.absentLock||0,
        nonExtraRai:r.extraRai||0, nonCancelRai:r.cancelRai||0, nonAbsentRai:r.absentRai||0,
        nonOnlineRai:nOnlineRai, nonWalkInRai:nWalkInRai,
        l1n:r.l1||0, l2n:r.l2||0, nonFree:r.freeDay
      };
    }
  });
  return Object.values(map).sort((a,b)=>b.date-a.date);
}
function mergeBG(){bgMerged=mergeBranch(bgStData,bgCarData);}
function mergeBN(){bnMerged=mergeBranch(bnStData,bnCarData);}
function getActiveMerged(){
  if(activeBranch==='BG') return bgMerged;
  if(activeBranch==='BN') return bnMerged;
  return merged;
}

function mergeData(){
  merged=mergeBranch(stData,nonData);
}


// ============================================================
// today.js — TODAY-01: ป๊อปอัป "ยอดวันนี้" สำหรับ ผอ. ที่เข้ามาดูแค่ยอดวันเดียว
// ============================================================
// เด้งเองครั้งแรกของวัน (ต่อเครื่อง) + ปุ่ม 📅 บนหัวเว็บเปิดซ้ำได้
// ยอดวันนี้เข้าระบบรอบแรก 15:00 (Fetch.gs 15/18/22) · 22:00 = ยอดปิดจริง
//   → ก่อนมียอดวันนี้ โชว์ยอดวันล่าสุดที่มี + บอกให้กลับมาดู 15:00–16:00
// ไม่ทำให้ SS (ปิดสิ้น ก.ย. 69) — ฟีเจอร์ใหม่ไม่ต้องทำให้ SS
// ⚠️ สูตรล็อก/ราย/รายรับ ใช้ของเดิม (getLock/getRai/revST/revNon) ห้ามคิดใหม่
//    เงิน/ค่าไฟ ใส่ col-rev / col-elec — body.no-rev / no-elec ซ่อนตามสิทธิ์ให้เอง
const TODAY_SEEN_KEY='sg_today_seen';
const TODAY_BR_NAME={BG:'ประตูกรุงเทพ',BN:'บางนา'};

function _todayRows(br){ return br==='BG'?bgMerged:br==='BN'?bnMerged:[]; }
const _hasSales=r=>r && (getLock(r,'all')>0);

// หาแถวที่จะโชว์: วันนี้ถ้ามียอดแล้ว ไม่งั้นวันล่าสุดก่อนหน้าที่มียอด
function _pickDay(rows, todayKey){
  const t=rows.find(r=>getDateKey(r.date)===todayKey);
  if(_hasSales(t)) return {r:t, isToday:true};
  const prev=rows.filter(r=>getDateKey(r.date)<todayKey && _hasSales(r))
                 .sort((a,b)=>b.date-a.date)[0];
  return {r:prev||null, isToday:false};
}

// หน้าตาเดียวกับกล่องกดจุดบนกราฟ (openDayModal ใน overview.js) แต่ ผอ. ขอ (24 ก.ย.):
//   ไม่มีหมวดไม่มา/ลา และไม่เอาไม่มา/ลามาหัก → แถว "ออนไลน์" = ยอดเต็ม ผลบวกแถวย่อย = ตัวใหญ่พอดี
//   กล่องบนกราฟยังแสดง "ออนไลน์สุทธิ" + หมวดไม่มา/ลา ตามเดิม (คนละที่ใช้ ไม่ต้องให้เหมือนกัน)
// ⚠️ ล็อก/ราย/รายรับ ใช้ getLock/getRai/revST/revNon ตัวเดิม ห้ามคิดใหม่
function _todayBranchHtml(br, r){
  const sec=(icon,txt,color)=>`<div class="day-sec" style="color:${color}">${icon} ${txt}</div>`;
  const row=(k,v,u='',cls='')=>`<div class="day-r ${cls}"><span>${k}</span><span>${v}${u?`<span class="u">${u}</span>`:''}</span></div>`;
  const rl=(k,rai,lock)=>row(k,`${fmtN(rai||0)}<span class="u">ราย</span> / ${fmtN(lock||0)}`,'ล็อก'); // ราย / ล็อก
  const l1=(r.l1||0)+(r.l1n||0), l2=(r.l2||0)+(r.l2n||0);
  const rvSt=revST(r,'all',br), rvCar=revNon(r,'all',br);
  const chip = r.freeDay ? '<span class="day-chip fd">🌧 วันฝน</span>'
             : isWknd(r.date) ? '<span class="day-chip wk">วันหยุด ศ–อา</span>'
                              : '<span class="day-chip nm">วันธรรมดา</span>';

  // การ์ดใหญ่ ล็อก|ราย แยกทีละโซน (ไม่มีกล่องรวมทั้งสาขา) · ราย ไม่นับล็อกเสริม เหมือน getRai
  const big=(lock,rai)=>`<div class="day-big tdy-big">
      <div><div class="v" style="color:var(--gold)">${fmtN(lock)}</div><div class="k">🔒 ล็อก</div></div>
      <div><div class="v" style="color:var(--green)">${fmtN(rai)}</div><div class="k">👥 ราย</div></div>
    </div>`;
  const stLock=(r.onlineLock||0)+(r.walkInLock||0)+(r.extraLock||0);
  const stRai=(r.onlineRai||0)+(r.walkInRai||0);
  const carRai=(r.nonOnlineRai||0)+(r.nonWalkInRai||0);

  let h=`<div class="tdy-br">
    <div class="tdy-brh"><span>${TODAY_BR_NAME[br]} <span class="tdy-code">${br}</span></span>${chip}</div>`;
  h+=sec('🍜','ST · Street Food','var(--gold)')+big(stLock,stRai)+'<div class="day-grp st">';
  h+=rl('ออนไลน์',r.onlineRai,r.onlineLock);
  h+=rl('วอล์กอิน',r.walkInRai,r.walkInLock);
  if(r.extraLock) h+=rl('ล็อกเสริม',r.extraRai,r.extraLock);
  h+='</div>';
  if(r.nonLock){
    h+=sec('🚗','Car · Boot Sale','var(--purple)')+big(r.nonLock,carRai)+'<div class="day-grp non">';
    h+=rl('ออนไลน์',r.nonOnlineRai,r.nonOnlineLock);
    h+=rl('วอล์กอิน',r.nonWalkInRai,r.nonWalkInLock);
    if(r.nonExtraLock) h+=rl('ล็อกเสริม',r.nonExtraRai,r.nonExtraLock);
    h+='</div>';
  }
  h+=`<div class="col-rev">${sec('💰','รายรับ','var(--green)')}<div class="day-grp rev">`
    +row('อาหาร',fmtN(rvSt),'฿')
    +((r.nonLock||rvCar)?row('Car',fmtN(rvCar),'฿'):'')   // มีเงินต้องมีแถว ไม่งั้นรวมไม่เท่าผลบวกที่เห็น
    +row('รายรับรวม',fmtN(rvSt+rvCar),'฿','hi')
    +'</div></div>';
  if(l1+l2>0){
    h+=`<div class="col-elec">${sec('⚡','ค่าไฟ','var(--orange)')}<div class="day-grp elec">`
      +row('L1',fmtN(l1),'฿')+row('L2',fmtN(l2),'฿')+row('รวม',fmtN(l1+l2),'฿','hi')
      +'</div></div>';
  }
  return h+'</div>';
}

function openTodayModal(){
  const m=document.getElementById('todayModal');
  if(!m) return;
  const now=new Date(), todayKey=getDateKey(now);
  const brs=myBranches().filter(b=>b!=='SS');
  const picks=brs.map(br=>({br, ..._pickDay(_todayRows(br)||[], todayKey)}));
  const allToday=picks.length>0 && picks.every(p=>p.isToday);

  document.getElementById('todayTitle').textContent=allToday?'ยอดวันนี้':'ยอดล่าสุด';
  document.getElementById('todaySub').textContent=`${DAYS[now.getDay()]} ${fmtD(now)}`;

  let h='';
  if(!picks.length){
    h='<div class="tdy-note">บัญชีนี้ไม่มีสาขาที่เปิดอยู่ (BG/BN)</div>';
  }else{
    picks.forEach(p=>{
      if(!p.r){ h+=`<div class="tdy-br"><div class="tdy-brh"><span>${TODAY_BR_NAME[p.br]}</span></div><div class="tdy-note">ยังไม่มีข้อมูล</div></div>`; return; }
      const tag=p.isToday
        ? (now.getHours()<22?'ยอดระหว่างวัน · ยอดปิดจริงหลัง 22:00':'ยอดปิดวัน')
        : `ยอดวันที่ ${fmtD(p.r.date)} (ยอดปิดวัน)`;
      h+=`<div class="tdy-tag">${tag}</div>`+_todayBranchHtml(p.br,p.r);
    });
    if(!allToday) h+='<div class="tdy-note">🕒 ยอดวันนี้ยังไม่เข้าระบบ — กลับมาดูใหม่ช่วง <b>15:00–16:00</b></div>';
  }
  document.getElementById('todayRows').innerHTML=h;
  m.style.display='flex';
  document.body.classList.add('modal-open');   // ล็อกข้างหลัง + ยกเหนือหัวเว็บ (components.css)
  try{ localStorage.setItem(TODAY_SEEN_KEY, todayKey); }catch(e){}
}

function closeTodayModal(){
  const m=document.getElementById('todayModal');
  if(m) m.style.display='none';
  document.body.classList.remove('modal-open');
}

// เรียกหลัง loadAll ได้ข้อมูลแล้ว — เด้งครั้งแรกของวัน (รอ splash/เอฟเฟกต์ login จางก่อน)
function maybeShowTodayPopup(){
  let seen=''; try{ seen=localStorage.getItem(TODAY_SEEN_KEY)||''; }catch(e){}
  if(seen===getDateKey(new Date())) return;
  if(!myBranches().some(b=>b!=='SS')) return;
  setTimeout(openTodayModal, 900);
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeTodayModal(); });

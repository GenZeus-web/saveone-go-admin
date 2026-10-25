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
const TODAY_DAY_FULL=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

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
  const chip = isRainDay(r) ? '<span class="day-chip fd">🌧 วันฝน</span>'
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
    <div class="tdy-brh"><span>${TODAY_BR_NAME[br]} <span class="tdy-code">${brCode(br)}</span></span>${chip}</div>`;
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
  if(canSeeRev()) h+=`<div class="col-rev">${sec('💰','รายรับ','var(--green)')}<div class="day-grp rev">`   // PERM-06
    +row('อาหาร',fmtN(rvSt),'฿')
    +((r.nonLock||rvCar)?row('Car',fmtN(rvCar),'฿'):'')   // มีเงินต้องมีแถว ไม่งั้นรวมไม่เท่าผลบวกที่เห็น
    +row('รายรับรวม',fmtN(rvSt+rvCar),'฿','hi')
    +'</div></div>';
  if(l1+l2>0&&canSeeElec()){   // PERM-07
    h+=`<div class="col-elec">${sec('⚡','ค่าไฟ','var(--orange)')}<div class="day-grp elec">`
      +row('L1',fmtN(l1),'฿')+row('L2',fmtN(l2),'฿')+row('รวม',fmtN(l1+l2),'฿','hi')
      +'</div></div>';
  }
  return h+'</div>';
}

// ── TODAY-02 (แบบ A ที่เจ้าของเลือก 25 ต.ค.): ตารางกราฟบนสุด แถวหัว = สาขา (สีประจำสาขา) · คอลัมน์ = โซน
//   ในช่อง = ล็อกแยกช่องทาง ออนไลน์ | วอล์กอิน | เสริม | รวม (น้ำตาลเข้ม · เจ้าของเลือก) · % เทียบวันที่ล็อกมากสุดของโซน (ปัดเต็ม)
//   เส้นระดับ 100/75/50/25/0 (ผอ.: 100 กับ 0 ทึบ · ที่เหลือจาง) · ราย = สรุปตัวเลขเดียว ไม่มีแท่ง
//   เปิดท้ายมีช่องเสริมเสมอ (ตอนนี้ 0 · อ่านจาก nonExtraLock อยู่แล้ว ไม่ต้องแก้ชีต)
//   เพดาน 100% = วันที่ล็อกมากสุดของโซนนั้นในข้อมูลทั้งหมดของสาขา (เจ้าของ 25 ต.ค.) · นับแบบ "5 วันที่ล็อกมากสุด"
//   (ออนไลน์+วอล์กอิน+เสริม) แต่ไม่ขึ้นกับช่วงเวลาที่เลือกบนหน้า · รวมวันนี้ด้วย → เกินสถิติ = 100% พอดี
const _tgZoneLock={st:r=>(r.onlineLock||0)+(r.walkInLock||0)+(r.extraLock||0), car:r=>(r.nonOnlineLock||0)+(r.nonWalkInLock||0)+(r.nonExtraLock||0)};
function _tgMax(br){
  const o={};
  ['st','car'].forEach(k=>{ let best=null; (_todayRows(br)||[]).forEach(r=>{ const v=_tgZoneLock[k](r); if(v>0&&(!best||v>best.v)) best={v,date:r.date}; }); o[k]=best; });
  return o;
}
const _tgShortD=d=>{ const s=fmtD(d); return s.slice(0,6)+s.slice(-2); };   // 05/10/2568 → 05/10/68
const TG_H=70, TG_BASE=112;   // ความสูงแท่งที่ 100% · ฐานแท่ง (px จากบนกล่อง) — ต้องตรงกับ .tgA/.a-bars ใน components.css
                              // 70 = เหลือ 26px เหนือเส้น 100 ให้เลข+% ของแท่งที่เต็ม ไม่ทับป้ายล็อกทั้งหมด
let _tgPicks=[];

function _tgZones(br,r){
  if(!r) return null;
  const n=v=>v||0, mx=_tgMax(br), cap=k=>mx[k]?mx[k].v:0, capD=k=>mx[k]?mx[k].date:null;
  return {
    st:{cap:cap('st'), capDate:capD('st'), lock:[n(r.onlineLock),n(r.walkInLock),n(r.extraLock)], rai:n(r.onlineRai)+n(r.walkInRai)},
    car:r.nonLock?{cap:cap('car'), capDate:capD('car'), lock:[n(r.nonOnlineLock),n(r.nonWalkInLock),n(r.nonExtraLock)], rai:n(r.nonOnlineRai)+n(r.nonWalkInRai)}:null
  };
}

function _tgCell(z,br){
  const pI=v=>z.cap?Math.round(v/z.cap*100)+'%':'–';
  const hOf=v=>z.cap&&v?Math.max(2,Math.min(v/z.cap,1)*TG_H):0;   // เกินล็อกทั้งหมด = เต็มเส้น 100
  const t=z.lock.reduce((s,v)=>s+v,0);
  const grid=[1,.75,.5,.25,0].map(p=>{ const f=p%1?' f':'', y=TG_BASE-TG_H*p;
    return `<div class="tgA-gl${f}" style="top:${y}px"></div><div class="tgA-tk${f}" style="top:${y}px">${p*100}</div>`; }).join('');
  const bars=z.lock.map((v,i)=>`<div class="a-b"><span>${fmtN(v)}</span><small>${pI(v)}</small><i class="c${i}" style="height:${hOf(v)}px"></i></div>`).join('')
    +`<div class="a-b a-t"><span>${fmtN(t)}</span><small>${pI(t)}</small><i class="c3" style="height:${hOf(t)}px"></i></div>`;
  return `<div class="tgA"><span class="tg-brc">${brCode(br)}</span><div class="tgA-capt">สูงสุด ${z.cap?`${fmtN(z.cap)} <small>(${_tgShortD(z.capDate)})</small>`:'–'}</div>${grid}<div class="a-bars">${bars}</div></div>`
    +'<div class="a-x"><span>ออนไลน์</span><span>วอล์กอิน</span><span>เสริม</span><b>รวม</b></div>'
    +`<div class="a-sum"><b>จองรวม ${fmtN(t)} ล็อก · ${pI(t)}</b><span>ผู้ค้า ${fmtN(z.rai)} ราย</span></div>`;
}

function _tgHtml(){
  let h='<div class="tg"><div class="tg-grid"><div class="tg-ch st">🍜 สตรีทฟู้ด</div><div class="tg-ch car">🚗 เปิดท้าย</div>';
  _tgPicks.forEach(p=>{
    const z=_tgZones(p.br,p.r);
    h+=`<div class="tg-rh tg-${p.br}"><b>${brCode(p.br)}</b><span>${TODAY_BR_NAME[p.br]}</span>${p.r&&!p.isToday?`<em>ยอดวันที่ ${fmtD(p.r.date)}</em>`:''}</div>`;
    ['st','car'].forEach(k=>{
      const c=z&&z[k];
      h+= c ? `<div class="tg-cell tg-${p.br}">${_tgCell(c,p.br)}</div>` : `<div class="tg-cell tg-${p.br} tg-na">—</div>`;
    });
  });
  return h+'</div></div>';
}

function openTodayModal(){
  const m=document.getElementById('todayModal');
  if(!m) return;
  const now=new Date(), todayKey=getDateKey(now);
  const brs=myBranches().filter(b=>b!=='SS');
  const picks=brs.map(br=>({br, ..._pickDay(_todayRows(br)||[], todayKey)}));
  const allToday=picks.length>0 && picks.every(p=>p.isToday);

  // TODAY-02: หัวบอกวันที่ชัดๆ "ยอดจองวันนี้ 25/10/2569" · ยังไม่มียอดวันนี้ = ยอดจองล่าสุด (วันที่อยู่ที่แถบสาขา)
  document.getElementById('todayTitle').textContent=allToday?`ยอดจองวันนี้ ${fmtD(now)}`:'ยอดจองล่าสุด';
  document.getElementById('todaySub').textContent=allToday?`วัน${TODAY_DAY_FULL[now.getDay()]}`:`วันนี้ ${DAYS[now.getDay()]} ${fmtD(now)} · ยอดวันนี้ยังไม่เข้า`;

  let h='';
  if(!picks.length){
    h='<div class="tdy-note">บัญชีนี้ไม่มีสาขาที่เปิดอยู่ (SG/SB)</div>';
  }else{
    picks.forEach(p=>{
      if(!p.r){ h+=`<div class="tdy-br"><div class="tdy-brh"><span>${TODAY_BR_NAME[p.br]}</span></div><div class="tdy-note">ยังไม่มีข้อมูล</div></div>`; return; }
      const tag=p.isToday
        ? (now.getHours()<22?'ยอดระหว่างวัน · ยอดปิดจริงหลัง 22:00':'ยอดปิดวัน')
        : `ยอดวันที่ ${fmtD(p.r.date)} (ยอดปิดวัน)`;
      h+=`<div class="tdy-tag">${tag}</div>`+_todayBranchHtml(p.br,p.r);
    });
    if(!allToday) h+='<div class="tdy-note">🕒 ยอดวันนี้ยังไม่เข้าระบบ — กลับมาดูใหม่ช่วง <b>15:00–16:00</b></div>';
    _tgPicks=picks;
    if(picks.some(p=>p.r)) h=_tgHtml()+'<div class="tg-sep">รายละเอียด</div>'+h;   // TODAY-02: กราฟบนสุด รายงานเดิมต่อข้างล่าง
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

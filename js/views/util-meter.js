// ============================================================
// js/views/util-meter.js — แท็บย่อย 📟 มิเตอร์ (UTIL-15 · v3.3.0 · เจ้าของเลือกตัวเลือก 1 จากต้นแบบ 14 ต.ค.)
//   บน: การ์ดมิเตอร์ละใบ (ตัวเลขล่าสุด + % จากค่ากลาง + แถบโซน + บิลล่าสุด)
//   ล่าง: ตารางความร้อน (บิลรายเดือน % จากค่ากลาง · ระดับรายวัน/รายสัปดาห์)
//   กดจุดไหนได้เรื่องของจุดนั้น: ช่องบิล/บรรทัดบิล → umBillDetail · ช่องวัน/ตัวเลขใหญ่/แท่งกราฟ → umPointDetail
//   พื้นการ์ด/ชื่อแถว → umMeterDetail (หน้ามิเตอร์เต็ม)
//   ผลวิเคราะห์มาจาก utPrep() ใน views/util.js (m._res · m._days · m._weeks · m._full · m._th) ไม่คำนวณซ้ำ
//   ต้นแบบ 5 แบบ + วิธีรวม 3 แบบ อยู่ branch prototype/util-redesign (ไม่ได้ merge)
// ============================================================

// ── ของที่ใช้ร่วม ──
const UM_RANK={red:0,leak:0,yellow:1,green:2,partial:3,nodata:3};
const umRgb=lv=>sc(`rgb(${(UT_LEVEL[lv]||UT_LEVEL.nodata).rgb})`).replace(/^rgb\(|\)$/g,'');
const umHot=lv=>['yellow','red','leak'].includes(lv);
function umPts(m){ return m._weeks||m._days||[]; }
function umBands(m,p){ return m._weeks?utilWeekBands(p,m._th):utilBands(p,m._th); }
function umWhen(m,p){ return m._weeks?`สัปดาห์ ${utDM(p.date)}–${utDM(p.end)}`:`วันที่ ${utDM(p.date)}`; }
function umName(m){ return `${(UT_TYPE[m.type]||'').split(' ')[0]} ${utEsc(m.location||m.meter_id)}`; }
function umBillHi(){ return new Set(canSeeUtilMoney()?utRecentHigh(UT.br||activeBranch).map(x=>x.meter_id):[]); }
const UM_HI_TAG='<span class="um-tag">⚠ บิลสูง</span>';
// ทุกมิเตอร์ที่ utLoad ส่งมา (เปิดอยู่ หรือปิดแล้วแต่มีข้อมูล/บิล — SS ปิดสาขาต้องดูย้อนหลังได้) · ตัวที่ต้องดูขึ้นก่อน
function umOrder(c){
  return c.meters.map((m,i)=>({m,i})).sort((a,b)=>(UM_RANK[a.m._full?.level]??4)-(UM_RANK[b.m._full?.level]??4));
}
function umGroups(c){
  const all=umOrder(c).filter(({m})=>umPts(m).length);
  return [['ใช้ต่อวัน',all.filter(({m})=>!m._weeks)],['ใช้ต่อสัปดาห์',all.filter(({m})=>m._weeks)]].filter(g=>g[1].length);
}
// ค่าที่ลงครึ่ง (ค่ากลางของจำนวนคู่ เช่น 123.5 · 4.15) แสดงเพิ่ม 1 ตำแหน่ง ให้เลขในสูตรบวกลบตรงกัน
function umFb(v,dp){ return utFmt(v,Math.abs(v*10**dp-Math.round(v*10**dp))>1e-9?dp+1:dp); }

// แถบโซน: พื้น 3 โซน (เขียว → เส้นเหลือง → เส้นแดง) + แท่งค่าล่าสุด + ขีดค่ากลาง
function umBullet(m,p){
  const B=umBands(m,p), max=Math.max(B.red*1.25,p.units*1.08), pc=v=>Math.min(100,v/max*100);
  return `<span class="um-bul" role="img" aria-label="ใช้ ${utFmt(p.units,1)} ค่ากลาง ${utFmt(p.base,1)} เส้นเหลือง ${utFmt(B.yellow,1)} เส้นแดง ${utFmt(B.red,1)}">
    <i style="left:0;width:${pc(B.yellow)}%;background:rgba(${umRgb('green')},.22)"></i>
    <i style="left:${pc(B.yellow)}%;width:${pc(B.red)-pc(B.yellow)}%;background:rgba(${umRgb('yellow')},.32)"></i>
    <i style="left:${pc(B.red)}%;right:0;background:rgba(${umRgb('red')},.3)"></i>
    <i class="v" style="width:${pc(p.units)}%"></i><i class="b" style="left:${pc(p.base)}%"></i></span>`;
}
const umBulKey=()=>`<span><i style="background:rgba(${umRgb('green')},.35)"></i>โซนปกติ</span><span><i style="background:rgba(${umRgb('yellow')},.45)"></i>โซนเหลือง</span>
  <span><i style="background:rgba(${umRgb('red')},.45)"></i>โซนแดง</span><span><i style="background:var(--ink)"></i>ใช้ล่าสุด</span>
  <span><i style="width:2px;background:var(--ink2)"></i>ค่ากลาง</span>`;

// บิลต่อเดือนของมิเตอร์ + ค่ากลาง lookback บิลก่อน (ต้องมี ≥ minPrev) — ตรงกับ utilBillCheck
function umBillRatios(c,id){
  const B=UTIL_DEFAULTS.billCheck, by={};
  c.bills.filter(b=>b.meter_id===id).forEach(b=>{ const u=utNum(b.units); if(u>0) by[b.bill_month]=(by[b.bill_month]||0)+u; });
  const ks=Object.keys(by).sort(), out={};
  ks.forEach((k,j)=>{ const prev=ks.slice(Math.max(0,j-B.lookback),j).map(x=>by[x]);
    const med=prev.length>=B.minPrev?utilMedian(prev):null;
    out[k]={units:by[k],med,ratio:med?by[k]/med:null}; });
  return out;
}
const umPct=x=>x.ratio==null?'':(x.ratio>=1?'+':'')+Math.round((x.ratio-1)*100)+'%';
// สีช่องบิล: สีเดียว อ่อน→เข้ม ตามสูงกว่าค่ากลางกี่ % (ไม่สูงกว่า = พื้นเรียบ)
const UM_SEQ=[[1,.0],[1.15,.18],[1.3,.38],[1.6,.6],[Infinity,.85]];
function umSeqA(r){ if(r==null||r<=1) return 0; return UM_SEQ.find(([t])=>r<=t)[1]; }
function umBillCell(c,m,i,k,x){
  const f=c.chk&&c.chk[m.meter_id+'@'+k], a=umSeqA(x.ratio);
  return `<span class="c mo${f?.high?' flag':''}" onclick="umBillDetail(${i},'${k}')" title="${utMonthTh(k)} · ${utFmt(x.units)} ${utU(m)}${x.ratio!=null?' · '+umPct(x)+' จากค่ากลาง '+utFmt(x.med):''}"
    style="background:${a?sc(`rgba(240,122,53,${a})`):'var(--surface2)'}">${umPct(x)||'—'}${x.med?`<small>${utFmt(x.med)}</small>`:''}</span>`;
}

// ข้อความเตือนจากเลขจด (เดิมอยู่บนการ์ดเก่า): จดขาดเกิน N วัน · ช่วงตลาดปิดเกินเกณฑ์ · เลขถอยหลัง/เปลี่ยนมิเตอร์
function umWarns(m){
  const r=m._res, out=[];
  if(r.stale&&r.last&&utilTrue(m.active)) out.push(`⚠️ ไม่มีการจดเกิน ${r.staleDays} วัน (ล่าสุด ${utAgo(r.last)})`);
  const cl=r.closed.filter(x=>x.level).pop();
  if(cl&&cl.level==='red') out.push(`🔴 ช่วงตลาดปิด ${utFmt(cl.rate,2)} ${utU(m)}/ชม. เกินเกณฑ์`);
  if(m._anoms?.length) out.push(`⚠️ เลขจด ${m._anoms.length} รายการต้องเช็ค`);
  return out;
}

// ── การ์ด (บน) ──
function umTilesHtml(c){
  const money=canSeeUtilMoney()&&!c.billsErr, hi=umBillHi();
  return `<div class="um-tiles">${umOrder(c).map(({m,i})=>{
    const p=m._full, lv=p?.level||'nodata', L=UT_LEVEL[lv]||UT_LEVEL.nodata, dp=m._weeks?0:1;
    let head, big='';
    if(!m._res.last) head=utilTrue(m.active)?'ยังไม่มีการจด':'ปิดใช้แล้ว';
    else if(!p) head='จดยังไม่ครบ';
    else{
      head=umWhen(m,p);
      const d=p.base?Math.round((p.units/p.base-1)*100):null;
      big=`<div class="um-big um-link" onclick="event.stopPropagation();umPointDetail(${i},'${p.date}')" title="ดูวิธีคิด">${utFmt(p.units,dp)}<small>${utU(m)}</small>${d==null?'':`<span class="um-delta" style="color:${umHot(lv)?`rgb(${umRgb(lv)})`:'var(--ink2)'}">${d>0?'+':''}${d}% จากค่ากลาง ${utFmt(p.base,dp)}</span>`}</div>`;
    }
    let bill='';
    if(money){
      const R=umBillRatios(c,m.meter_id), k=Object.keys(R).sort().pop();
      if(k){ const x=R[k], f=c.chk&&c.chk[m.meter_id+'@'+k], pc=x.ratio==null?'':` · ${umPct(x)} จากค่ากลาง ${utFmt(x.med)}`;
        bill=`<div class="um-bill um-link" onclick="event.stopPropagation();umBillDetail(${i},'${k}')" title="ดูวิธีคิด">บิลล่าสุด ${utMonthTh(k)} · ${utFmt(x.units)} ${utU(m)}${f?.high?` <b>⚠${pc}</b>`:pc}</div>`; }
    }
    const w=umWarns(m);
    return `<div class="um-tile lv-${lv}" onclick="umMeterDetail(${i})" role="button" tabindex="0" onkeydown="if(event.key==='Enter')umMeterDetail(${i})">
      <div class="um-tile-h"><span>${umName(m)}${hi.has(m.meter_id)?UM_HI_TAG:''}</span><span>${L.icon} ${L.txt}</span></div>
      <div class="um-head">${head}${m._weeks&&utilTrue(m.active)?' · จดทุกวันจันทร์':''}</div>${big}
      ${p&&p.base!=null?`<div class="um-tbul">${umBullet(m,p)}</div>`:''}
      ${w.length?`<div class="um-warn">${w.join('<br>')}</div>`:''}${bill}</div>`;
  }).join('')}</div>
  <div class="um-key">${umBulKey()}</div>`;
}

// ── ตารางความร้อน (ล่าง) ──
function umHeatHtml(c){
  const ord=umOrder(c), money=canSeeUtilMoney()&&!c.billsErr;
  let h='';
  if(money){
    const withB=ord.filter(({m})=>c.bills.some(b=>b.meter_id===m.meter_id));
    const all=[...new Set(c.bills.map(b=>b.bill_month))].sort().slice(-12);
    if(withB.length&&all.length){
      h+=`<h4>บิลรายเดือน · % จากค่ากลาง ${UTIL_DEFAULTS.billCheck.lookback} บิลก่อน</h4>
        <div class="um-hg" style="grid-template-columns:max-content repeat(${all.length},minmax(52px,1fr))"><span></span>${all.map(mo=>`<span class="ch">${utMonthTh(mo)}</span>`).join('')}
        ${withB.map(({m,i})=>{ const R=umBillRatios(c,m.meter_id);
          return `<span class="rl" onclick="umMeterDetail(${i})">${umName(m)}</span>${all.map(mo=>R[mo]?umBillCell(c,m,i,mo,R[mo]):'<span class="c mo na"></span>').join('')}`; }).join('')}</div>
        <div class="um-key">${UM_SEQ.slice(1).map(([,a],k)=>`<span><i style="background:${sc(`rgba(240,122,53,${a})`)}"></i>${['ไม่เกิน +15%','+15–30%','+30–60%','เกิน +60%'][k]}</span>`).join('')}
          <span><i style="background:var(--surface2)"></i>ไม่สูงกว่าค่ากลาง</span><span>เลขบน = % จากค่ากลาง · เลขล่าง = ค่ากลาง</span>
          <span><i style="outline:2px solid var(--red);outline-offset:-2px"></i>⚠ บิลสูงผิดปกติ</span></div>`;
    }
  }
  const lvCell=(m,i,d)=>!d?'<span class="c na"></span>'
    :`<span class="c" onclick="umPointDetail(${i},'${d.date}')" title="${umWhen(m,d)} · ใช้ ${utFmt(d.units,1)} ${utU(m)}${d.base!=null?' · ค่ากลาง '+utFmt(d.base,1):''} · ${(UT_LEVEL[d.level]||UT_LEVEL.nodata).txt}"
       style="background:rgba(${umRgb(d.level)},${d.level==='partial'||d.level==='nodata'?.3:d.est?.55:.9})"></span>`;
  umGroups(c).forEach(([t,ms])=>{
    const wk=!!ms[0].m._weeks, dates=[...new Set(ms.flatMap(({m})=>umPts(m).map(d=>d.date)))].sort().slice(wk?-12:-28);
    h+=`<h4>${t} · ${dates.length} ${wk?'สัปดาห์':'วัน'}ล่าสุด</h4>
      <div class="um-hg" style="grid-template-columns:max-content repeat(${dates.length},minmax(22px,1fr))"><span></span>
      ${dates.map((d,k)=>{ const [,mo,dd]=d.split('-'); return `<span class="ch">${k===0||dd==='01'||wk?`${+dd}/${+mo}`:+dd}</span>`; }).join('')}
      ${ms.map(({m,i})=>{ const by=new Map(umPts(m).map(d=>[d.date,d]));
        return `<span class="rl" onclick="umMeterDetail(${i})">${umName(m)}</span>${dates.map(d=>lvCell(m,i,by.get(d))).join('')}`; }).join('')}</div>`;
  });
  if(!h) return '';
  return `<div class="um-heat">${h}<div class="um-key">${['green','yellow','red','leak'].map(k=>`<span><i style="background:rgba(${umRgb(k)},.9)"></i>${UT_LEVEL[k].icon} ${UT_LEVEL[k].txt}</span>`).join('')}
    <span><i style="background:rgba(${umRgb('green')},.55)"></i>สีจาง = วันที่ไม่ได้จด (เฉลี่ย)</span><span><i style="background:rgba(${umRgb('partial')},.3)"></i>จดยังไม่ครบ</span>
    <span><i style="border:1px dashed var(--border)"></i>ไม่มีข้อมูล</span></div></div>`;
}

// ── กล่องรายละเอียด (ใช้กล่อง #utModal ร่วมกับทั้งแท็บ) ──
function umModal(title,sub,body,cls){
  dChart('cUmFull');   // เปลี่ยนเนื้อหาในกล่อง = กราฟหน้ามิเตอร์เต็มเดิมต้องทิ้ง
  let box=document.getElementById('utModal');
  if(!box){
    box=document.createElement('div'); box.id='utModal'; box.className='ut-modal';
    box.addEventListener('click',e=>{ if(e.target===box) utClose(); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&box.style.display==='flex') utClose(); });
    document.body.appendChild(box);
  }
  box.innerHTML=`<div class="ut-mcard ${cls||'um-dcard'}" role="dialog" aria-modal="true" aria-label="${utEsc(title.replace(/<[^>]+>/g,''))}">
    <div class="ut-top"><div style="flex:1;min-width:0"><div class="ut-name">${title}</div><div class="ut-sub">${sub}</div></div>
      <button type="button" class="day-x" onclick="utClose()" aria-label="ปิด">✕</button></div>${body}</div>`;
  box.style.display='flex'; document.body.style.overflow='hidden';
}
// ค่าที่ใช้หาค่ากลาง เรียงน้อย→มาก · ตัวกลางมีกรอบ (จำนวนคู่ = 2 ตัวกลาง)
function umMedList(items,fmt){
  const s=[...items].sort((a,b)=>a.v-b.v), n=s.length, mid=n%2?[n>>1]:[n/2-1,n/2];
  return `<ol class="um-med">${s.map((x,k)=>`<li${mid.includes(k)?' class="mid"':''}><span>${x.t}</span><b>${fmt(x.v)}</b></li>`).join('')}</ol>`;
}

// บิลใบเดียว: หน่วย ยอดเงิน · ค่ากลาง 6 บิลก่อน · 2 ข้อของตัวตรวจบิล (ตรงกับ utilBillCheck)
function umBillDetail(i,mo){
  const c=UT.cache[UT.br], m=c&&c.meters[i]; if(!m) return;
  const B=UTIL_DEFAULTS.billCheck, by={}, amt={};
  c.bills.filter(b=>b.meter_id===m.meter_id).forEach(b=>{ const u=utNum(b.units); if(u>0){ by[b.bill_month]=(by[b.bill_month]||0)+u; amt[b.bill_month]=(amt[b.bill_month]||0)+(utNum(b.amount_incl_vat)||0); } });
  const ks=Object.keys(by).sort(), j=ks.indexOf(mo); if(j<0) return;
  const u=by[mo], prev=ks.slice(Math.max(0,j-B.lookback),j), unit=utU(m), min=B.minDiff[m.type]??0;
  const f=c.chk&&c.chk[m.meter_id+'@'+mo], use=utilBillUsageMonth(mo);
  // ไม่ตรวจ warmup เดือนแรกนับจากบิลใบแรกของ "สาขา"
  const mi=ym=>{ const [y,mm]=ym.split('-').map(Number); return y*12+mm-1; };
  const first=c.bills.map(b=>b.bill_month).filter(Boolean).sort()[0], warm=first&&mi(mo)-mi(first)<B.warmup;
  let calc;
  if(prev.length<B.minPrev) calc=`<p>บิลก่อนหน้ามี ${prev.length} ใบ ต้องมีอย่างน้อย ${B.minPrev} ใบถึงจะเทียบได้</p>`;
  else if(warm) calc=`<p>ไม่ตรวจ: อยู่ใน ${B.warmup} เดือนแรกของสาขา</p>`;
  else{
    const med=utilMedian(prev.map(k=>by[k])), line=med*B.ratio, over1=u>line, over2=u-med>=min;
    calc=`<div class="um-dh">ค่ากลาง ${prev.length} บิลก่อน = <b>${umFb(med,0)}</b> ${unit}</div>${umMedList(prev.map(k=>({t:utMonthTh(k),v:by[k]})),v=>utFmt(v))}
      <div class="um-dh">เทียบกับเกณฑ์</div>
      <table class="um-dt"><tr><td>ค่ากลาง × ${B.ratio}</td><td>${umFb(med,0)} × ${B.ratio} = ${utFmt(line,1)}</td><td>${over1?'✔ เกิน':'— ไม่เกิน'}</td></tr>
        <tr><td>เพิ่มจากค่ากลาง</td><td>${utFmt(u)} − ${umFb(med,0)} = ${umFb(u-med,0)} (ขั้นต่ำ ${utFmt(min)})</td><td>${over2?'✔ ถึง':'— ไม่ถึง'}</td></tr></table>
      <p class="um-res">${over1&&over2?'⚠ เกินทั้ง 2 ข้อ = บิลสูงผิดปกติ':'✅ ไม่เกินครบ 2 ข้อ = ไม่ขึ้นธง'} · ${u>=med?'+':''}${utFmt((u/med-1)*100)}% จากค่ากลาง</p>`;
  }
  const q=f&&(f.dup||f.round)?`<p class="um-sub2">? ${utFlagText(UT.br||activeBranch,f).filter(x=>x.k==='q').map(x=>x.t.replace(/<[^>]+>/g,'')).join(' · ')}</p>`:'';
  const got=m._res?.days.filter(d=>d.date.startsWith(use))||[], gu=got.reduce((s,d)=>s+d.units,0), gc=got.reduce((s,d)=>s+d.cover,0);
  umModal(`${umName(m)} · บิล ${utMonthTh(mo)}`,`ใช้จริงเดือน ${utMonthTh(use)} (บิลออกเดือนถัดไป)`,
    `<div class="um-dbig">${utFmt(u)} <small>${unit}</small>${amt[mo]?`<span>${utFmt(amt[mo],2)} บาท · ${utFmt(amt[mo]/u,2)} บาท/${unit}</span>`:''}</div>
     ${calc}${q}${got.length?`<p class="um-sub2">จากเลขที่จดเดือน ${utMonthTh(use)}: ${utFmt(gu)} ${unit} (${Math.round(gc)} วัน)</p>`:''}
     <button class="mc-pill" onclick="umMeterDetail(${i})">ดูมิเตอร์นี้ทั้งหมด</button>`);
}

// วัน/สัปดาห์เดียว: ใช้เท่าไหร่ · ค่ากลางจากวันเดียวกัน 4 สัปดาห์ก่อน · สูตรเส้นเหลือง/แดง (ตรงกับ utilFlags/utilWeekly)
function umPointDetail(i,iso){
  const c=UT.cache[UT.br], m=c&&c.meters[i]; if(!m||!m._res) return;
  const S=utilSettings({},m.branch_code||UT.br), wk=!!m._weeks, unit=utU(m), th=m._th;
  const all=wk?utilWeekly(m._res.days,{meter_id:m.meter_id,type:m.type,branch_code:m.branch_code},S):m._res.days;
  const by=new Map(all.map(d=>[d.date,d])), p=by.get(iso); if(!p) return;
  const dp=wk?0:1, fmt=v=>utFmt(v,dp), fb=v=>umFb(v,dp), full=wk?6.999:0.999, minD=wk?th.minDiff*7:th.minDiff;
  const hist=[]; for(let k=1;k<=S.baseWeeks;k++){ const iso2=utilIso(utilIdx(iso)-7*k); hist.push({t:wk?`สัปดาห์ ${utDM(iso2)}`:utDM(iso2),d:by.get(iso2)}); }
  const used=hist.filter(h=>h.d&&h.d.cover>=full&&!['red','leak'].includes(h.d.level)), skip=hist.filter(h=>!used.includes(h));
  const L=UT_LEVEL[p.level]||UT_LEVEL.nodata, Bd=umBands(m,p);
  let calc='';
  if(p.level==='partial') calc=`<p>${wk?`สัปดาห์นี้จดยังไม่ครบ (${utFmt(p.cover,1)}/7 วัน)`:`วันนี้จดยังไม่ครบ (มีข้อมูล ${utFmt(p.cover*100)}% ของวัน)`} ยังไม่ตัดสิน</p>`;
  else if(p.base==null) calc=`<p>ข้อมูลยังไม่พอเทียบ: ต้องมี${wk?'สัปดาห์':'วันเดียวกัน'}ก่อนหน้าที่จดครบอย่างน้อย ${S.baseMinDays} ${wk?'สัปดาห์':'วัน'} (มี ${used.length})</p>`;
  else{
    calc=`<div class="um-dh">ค่ากลาง = <b>${fb(p.base)}</b> ${unit} ${p.baseFrom==='setting'?'(ค่าที่ตั้งไว้)':`จาก ${used.length} ${wk?'สัปดาห์':'วัน'}ก่อน`}</div>
      ${p.baseFrom==='setting'?'':umMedList(used.map(h=>({t:h.t,v:h.d.units})),fmt)}
      ${skip.length?`<p class="um-sub2">ไม่นับ: ${skip.map(h=>`${h.t} (${!h.d?'ไม่มีข้อมูล':h.d.cover<full?'จดไม่ครบ':'แดงไปแล้ว'})`).join(' · ')}</p>`:''}
      <div class="um-dh">เส้นเหลือง / เส้นแดง</div>
      <table class="um-dt"><tr><td>เส้นเหลือง</td><td>มากกว่าระหว่าง ${fb(p.base)} × ${th.yellow} = ${fmt(p.base*th.yellow)} กับ ${fb(p.base)} + ${utFmt(minD)} = ${fmt(p.base+minD)}</td><td><b>${fmt(Bd.yellow)}</b></td></tr>
        <tr><td>เส้นแดง</td><td>มากกว่าระหว่าง ${fb(p.base)} × ${th.red} = ${fmt(p.base*th.red)} กับ ${fb(p.base)} + ${utFmt(minD)} = ${fmt(p.base+minD)}</td><td><b>${fmt(Bd.red)}</b></td></tr></table>
      <p class="um-res">${L.icon} ใช้ ${fmt(p.units)} ${p.units>Bd.red?'เกินเส้นแดง':p.units>Bd.yellow?'เกินเส้นเหลือง':'ไม่เกินเส้นเหลือง'} = ${L.txt}${p.level==='leak'?` (สูงกว่าปกติติดกัน ${th.streak} วัน)`:''}</p>`;
  }
  umModal(`${umName(m)} · ${umWhen(m,p)}`,`${wk?'จันทร์ 14:00 ถึงจันทร์ถัดไป':`นับ ${S.hours.default.open} วันที่ ${utDM(iso)} ถึง ${S.hours.default.open} วันถัดไป`}${p.est?' · มีช่วงไม่ได้จด (ยอดเฉลี่ย)':''}`,
    `<div class="um-dbig">${fmt(p.units)} <small>${unit}</small><span>${L.icon} ${L.txt}</span></div>${calc}
     <button class="mc-pill" onclick="umMeterDetail(${i})">ดูมิเตอร์นี้ทั้งหมด</button>`);
}

// ── หน้ามิเตอร์เต็ม: สรุป + แถบโซน · กราฟพื้นโซน · แถวบิล 12 เดือน · ตารางบิล (มีค่ากลาง) ──
// กราฟ: พื้นโซนเหลือง (เส้นเหลือง→เส้นแดง) / แดง (เส้นแดง→บน) ต่อจุด · แท่งเทา ติดสีเมื่อเกิน · เส้นประ = ค่ากลาง · กดแท่ง = วิธีคิดของจุดนั้น
const umZonePlugin={id:'umZone',beforeDatasetsDraw(ch){
  const z=ch.options.plugins.umZone; if(!z) return;
  const {ctx,chartArea:a,scales:{y}}=ch, n=z.bands.length, w=n?(a.right-a.left)/n:0;
  ctx.save();
  z.bands.forEach((b,k)=>{
    if(b.yellow==null) return;
    const x0=a.left+k*w, yy=Math.max(a.top,y.getPixelForValue(b.yellow)), yr=Math.max(a.top,y.getPixelForValue(b.red));
    ctx.fillStyle=`rgba(${umRgb('yellow')},.2)`; ctx.fillRect(x0,yr,w,yy-yr);
    ctx.fillStyle=`rgba(${umRgb('red')},.16)`; ctx.fillRect(x0,a.top,w,yr-a.top);
  });
  ctx.restore();
}};
function umFullCfg(m,i){
  const pts=umPts(m), bands=pts.map(d=>umBands(m,d)), dp=m._weeks?0:1;
  const o=cOpts(); o.plugins.legend={display:false}; o.plugins.umZone={bands};
  o.plugins.tooltip={callbacks:{title:it=>umWhen(m,pts[it[0].dataIndex]),
    label:it=>{ const d=pts[it.dataIndex]; return it.datasetIndex?`ค่ากลาง ${utFmt(d.base,dp)}`:`ใช้ ${utFmt(d.units,dp)} ${utU(m)} · ${(UT_LEVEL[d.level]||UT_LEVEL.nodata).txt}${d.est?' · ไม่ได้จด (ยอดเฉลี่ย)':''}`; },
    footer:()=>'กดเพื่อดูวิธีคิด'}};
  o.scales.y.beginAtZero=true; o.scales.x.grid={display:false};
  o.scales.y.suggestedMax=Math.max(0,...pts.map((d,k)=>Math.max(d.units*1.15,(bands[k].yellow||0)*1.1)));
  o.onClick=(e,els)=>{ if(els.length) umPointDetail(i,pts[els[0].index].date); };
  o.onHover=(e,els)=>{ e.native.target.style.cursor=els.length?'pointer':''; };
  return {type:'bar',plugins:[umZonePlugin],data:{labels:pts.map(d=>utDM(d.date)),datasets:[
    {type:'bar',label:'ใช้',data:pts.map(d=>+d.units.toFixed(2)),borderRadius:2,order:2,
     backgroundColor:pts.map(d=>umHot(d.level)?`rgba(${umRgb(d.level)},.95)`:`rgba(${umRgb('nodata')},${d.est||d.level==='partial'?.35:.75})`)},
    {type:'line',label:'ค่ากลาง',data:pts.map(d=>d.base??null),borderColor:chartClr().lbl,borderDash:[4,4],borderWidth:1.4,
     pointRadius:0,stepped:'middle',spanGaps:false,order:1}]},options:o};
}
function umMeterDetail(i){
  const c=UT.cache[UT.br], m=c&&c.meters[i]; if(!m||!m._res) return;
  dChart('cUmFull');
  const r=m._res, p=m._full, lv=p?.level||'nodata', L=UT_LEVEL[lv]||UT_LEVEL.nodata, dp=m._weeks?0:1, unit=utU(m);
  const hi=umBillHi(), money=canSeeUtilMoney()&&!c.billsErr, pts=umPts(m);
  const d=p?.base?Math.round((p.units/p.base-1)*100):null;
  const sum=p&&p.base!=null?`<div class="um-fsum"><div class="um-big um-link" onclick="umPointDetail(${i},'${p.date}')"><small>${umWhen(m,p)}</small><br>${utFmt(p.units,dp)}<small>${unit}</small>
      <span class="um-delta" style="color:${umHot(lv)?`rgb(${umRgb(lv)})`:'var(--ink2)'}">${d>0?'+':''}${d}% จากค่ากลาง ${utFmt(p.base,dp)}</span></div>
      <div class="um-tbul">${umBullet(m,p)}</div><div class="um-key" style="margin-top:4px">${umBulKey()}</div></div>`
    :`<p class="um-sub2">${!r.last?(utilTrue(m.active)?'ยังไม่มีการจด':'ปิดใช้แล้ว'):'ข้อมูลยังไม่พอเทียบ'}</p>`;
  // เตือน + ช่วงตลาดปิดล่าสุด + เลขจดที่ต้องเช็ค (เดิมอยู่บนการ์ดเก่า)
  const cl=r.closed.filter(x=>x.level).pop(), w=umWarns(m).filter(x=>!x.startsWith('🔴')&&!x.includes('รายการต้องเช็ค'));
  const info=[...w, cl?`ช่วงตลาดปิดล่าสุด ${utFmt(cl.rate,2)} ${unit}/ชม. ${cl.level==='red'?'🔴 เกินเกณฑ์':'✅'}`:'']
    .concat((m._anoms||[]).map(a=>'⚠️ '+utEsc(a))).filter(Boolean);
  const cnt=k=>pts.filter(x=>x.level===k).length, flags=[['leak','สงสัยรั่ว'],['red','แดง'],['yellow','เหลือง']].filter(([k])=>cnt(k))
    .map(([k,t])=>`<span class="ut-chip ${k}">${t} ${cnt(k)} ${m._weeks?'สัปดาห์':'วัน'}</span>`).join('');
  const chart=pts.length?`<div class="um-dh">${m._weeks?'ใช้ต่อสัปดาห์':'ใช้ต่อวัน'} · ${pts.length} ${m._weeks?'สัปดาห์':'วัน'}${flags?` · ${flags}`:''}</div>
    <div class="um-fchart"><canvas id="cUmFull"></canvas></div>
    <div class="um-key"><span><i style="background:rgba(${umRgb('yellow')},.35)"></i>โซนเหลือง</span><span><i style="background:rgba(${umRgb('red')},.3)"></i>โซนแดง</span>
      <span><i style="background:rgba(${umRgb('nodata')},.75)"></i>ใช้</span><span><i style="background:rgba(${umRgb('nodata')},.35)"></i>ไม่ได้จด (เฉลี่ย)</span>
      <span>เส้นประ = ค่ากลาง</span><span>แท่งสี = เกินเส้น · กดแท่งดูวิธีคิด</span></div>`
    :r.last?`<p class="um-sub2">ไม่มีการจดในช่วงเวลาที่เลือก <button class="mc-pill" onclick="utClose();setPeriod(0,document.getElementById('p0'))">ดูทั้งหมด</button></p>`:'';
  let bills='';
  if(money){
    const R=umBillRatios(c,m.meter_id), ks=Object.keys(R).sort();
    if(ks.length){
      const amt={}; c.bills.filter(b=>b.meter_id===m.meter_id).forEach(b=>{ amt[b.bill_month]=(amt[b.bill_month]||0)+(utNum(b.amount_incl_vat)||0); });
      const last12=ks.slice(-12);
      const row=`<div class="um-hg" style="grid-template-columns:repeat(${last12.length},minmax(52px,1fr))">${last12.map(k=>`<span class="ch">${utMonthTh(k)}</span>`).join('')}
        ${last12.map(k=>umBillCell(c,m,i,k,R[k])).join('')}</div>`;
      const tr=[...ks].reverse().map(k=>{ const x=R[k], f=c.chk&&c.chk[m.meter_id+'@'+k], use=utilBillUsageMonth(k);
        const md=r.days.filter(d=>d.date.startsWith(use)), got=md.reduce((s,d)=>s+d.units,0);
        const mk=!f?'':f.high?' <span class="ut-mk hi">⚠</span>':' <span class="ut-mk q">?</span>';
        return `<tr class="um-link" onclick="umBillDetail(${i},'${k}')"><td>${utMonthTh(k)}${mk}</td><td class="n">${utFmt(x.units)}</td><td class="n">${x.med?umFb(x.med,0):'—'}</td>
          <td class="n">${umPct(x)||'—'}</td><td class="n">${amt[k]?utFmt(amt[k],2):'—'}</td><td class="n">${amt[k]?utFmt(amt[k]/x.units,2):'—'}</td><td class="n">${md.length?utFmt(got):'—'}</td></tr>`; }).join('');
      bills=`<div class="um-dh">บิลรายเดือน · % จากค่ากลาง ${UTIL_DEFAULTS.billCheck.lookback} บิลก่อน</div>${row}
        <div class="um-key"><span>เลขบน = % จากค่ากลาง · เลขล่าง = ค่ากลาง · กรอบแดง = ⚠ บิลสูงผิดปกติ · กดช่องหรือแถวดูวิธีคิด</span></div>
        <div class="ut-bills ut-bills-all"><table><thead><tr><th>เดือนในบิล</th><th class="n">${unit} ตามบิล</th><th class="n">ค่ากลาง</th><th class="n">%</th><th class="n">ยอดเงิน (รวม VAT)</th><th class="n">บาท/${unit}</th><th class="n">จากเลขที่จด</th></tr></thead><tbody>${tr}</tbody></table></div>`;
    }
  }
  umModal(`${umName(m)}${hi.has(m.meter_id)?UM_HI_TAG:''}${m.location?` <span class="ut-sub">${utEsc(m.meter_id)}</span>`:''}`,
    `${L.icon} ${L.txt}${r.last?` · จดล่าสุด ${utWhen(r.last)} (${utAgo(r.last)})`:''}${utilTrue(m.active)?'':' · ปิดใช้แล้ว'}`,
    sum+(info.length?`<div class="um-warn">${info.join('<br>')}</div>`:'')+chart+bills, 'um-full');
  if(pts.length) makeChart('cUmFull',umFullCfg(m,i));   // ไม่เข้า UT.chartIds — แท็บวาดใหม่ (รีเฟรช 5 นาที) ต้องไม่ลบกราฟในกล่อง
}

// ── จุดเชื่อมกับ utDraw(): การ์ด (บน) + ตารางความร้อน (ล่าง) ──
function utMeterHtml(c){
  const heat=umHeatHtml(c);
  return umTilesHtml(c)+(heat?`<div class="um-gap"></div>${heat}`:'');
}

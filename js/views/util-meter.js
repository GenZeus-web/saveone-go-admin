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
// UTIL-26: หัวการ์ดเขียนช่วงเป็นวันที่เต็ม (เจ้าของ 20 ต.ค.: "วันที่ 16/10" งง ว่าทำไมไม่ใช่วันจดล่าสุด)
//   รายวัน = 14:00 วันนั้น → 14:00 วันถัดไป · รายสัปดาห์ = p.date–p.end · เดือนเดียวกันเขียนเดือนครั้งเดียว
function umThD(iso){ const [,m,d]=iso.split('-').map(Number); return [d,UT_TH_MON[m-1]]; }
function umRange(m,p){
  let e=p.end;
  if(!m._weeks){ const t=new Date(p.date+'T00:00:00Z'); t.setUTCDate(t.getUTCDate()+1); e=t.toISOString().slice(0,10); }
  const [d1,m1]=umThD(p.date), [d2,m2]=umThD(e);
  return m1===m2?`${d1}–${d2} ${m2}`:`${d1} ${m1} – ${d2} ${m2}`;
}
function umName(m){ return `${(UT_TYPE[m.type]||'').split(' ')[0]} ${utEsc(m.location||m.meter_id)}`; }
// UTIL-23: ธงบิลสูงดูจากหน่วย ไม่ต้องมีสิทธิ์เงิน (บิลหน่วยมาจาก data/ แล้ว)
function umBillHi(){ const h=new Map(); utRecentHigh(UT.br||activeBranch).forEach(x=>h.set(x.meter_id,[...(h.get(x.meter_id)||[]),x.bill_month])); return h; }
// ป้ายบอกเดือนด้วย (เจ้าของ 20 ต.ค.: การ์ดขึ้น "บิลสูง" แต่บรรทัดบิลล่าสุด +0% ชวนงง — ธงมาจากบิลเดือนก่อน)
const umHiTag=(hi,id)=>hi.has(id)?`<span class="um-tag">⚠ บิลสูง ${hi.get(id).sort().map(utMonthTh).join(', ')}</span>`:'';
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
//   warmup เดือนแรกของสาขา = ตัวตรวจไม่ตรวจ → ไม่คิด % ไม่ระบายสี (เจ้าของ 14 ต.ค.: บิล มิ.ย. 69 บางนา +41% สีเข้มแต่ไม่มี ⚠ ชวนงง)
function umBillWarm(c,mo){
  const B=utilBillCfg(utSet()), mi=ym=>{ const [y,m]=ym.split('-').map(Number); return y*12+m-1; };
  const first=c.bills.map(b=>b.bill_month).filter(Boolean).sort()[0];
  return !!first&&mi(mo)-mi(first)<B.warmup;
}
function umBillRatios(c,id){
  const B=utilBillCfg(utSet()), by={};
  c.bills.filter(b=>b.meter_id===id).forEach(b=>{ const u=utNum(b.units); if(u>0) by[b.bill_month]=(by[b.bill_month]||0)+u; });
  const ks=Object.keys(by).sort(), out={};
  ks.forEach((k,j)=>{ const prev=ks.slice(Math.max(0,j-B.lookback),j).map(x=>by[x]), warm=umBillWarm(c,k);
    const med=!warm&&prev.length>=B.minPrev?utilMedian(prev):null;
    out[k]={units:by[k],med,ratio:med?by[k]/med:null,warm}; });
  return out;
}
const umPct=x=>x.ratio==null?'':(x.ratio>=1?'+':'')+Math.round((x.ratio-1)*100)+'%';
// สีช่องบิล: สีเดียว อ่อน→เข้ม ตามสูงกว่าค่ากลางกี่ % (ไม่สูงกว่า = พื้นเรียบ)
const UM_SEQ=[[1,.0],[1.15,.18],[1.3,.38],[1.6,.6],[Infinity,.75]];   // ขั้นบนสุด .75: .85 เป็นส้มกลางที่ตัวขาว/ดำได้ไม่ถึง 4.5
// โหมดมืด: ส้มจางบนพื้นเกือบดำกลายเป็นน้ำตาลหม่น แยกจากช่อง "ไม่สูงกว่า" ไม่ออก → ขั้นต่ำเข้มขึ้น
const UM_SEQ_DARK={.18:.32,.38:.5,.6:.68,.75:.85};
const umAlpha=a=>document.body.classList.contains('light-mode')?a:(UM_SEQ_DARK[a]??a);
function umSeqA(r){ if(r==null||r<=1) return 0; return umAlpha(UM_SEQ.find(([t])=>r<=t)[1]); }
// สีตัวหนังสือบนช่องสี: ผสมสีช่องกับพื้นการ์ดจริง แล้วเลือกขาว/เข้มตัวที่ contrast สูงกว่า
//   (เดิมใช้สีเดียวทุกช่อง — วัด 14 ต.ค. เลขค่ากลางบนช่องส้มเข้ม contrast 1.6 โหมดมืด / 2.4 โหมดสว่าง)
function umOnColor(rgb,a){
  const hex=getComputedStyle(document.body).getPropertyValue('--surface').trim().replace('#','');
  const bg=hex.length===6?[0,2,4].map(j=>parseInt(hex.slice(j,j+2),16)):[255,255,255];
  const fg=(rgb.match(/\d+/g)||[]).slice(0,3).map(Number), mix=fg.map((v,j)=>v*a+bg[j]*(1-a));
  const L=c=>{ const [r,g,b]=c.map(v=>{ v/=255; return v<=.03928?v/12.92:((v+.055)/1.055)**2.4; }); return .2126*r+.7152*g+.0722*b; };
  const l=L(mix), dark=[27,23,20];
  return (1.05/(l+.05))>=((l+.05)/(L(dark)+.05))?'#fff':'#1b1714';
}
function umBillCell(c,m,i,k,x){
  const f=c.chk&&c.chk[m.meter_id+'@'+k], a=umSeqA(x.ratio), col=sc('rgb(240,122,53)');
  return `<span class="c mo${f?.high?' flag':''}" onclick="umBillDetail(${i},'${k}')" data-tip="${umName(m)}|บิล ${utMonthTh(k)} · ${utFmt(x.units)} ${utU(m)}${x.ratio!=null?'|'+umPct(x)+' จากค่ากลาง '+utFmt(x.med):x.warm?'|ยังไม่ตรวจ: '+utilBillCfg(utSet()).warmup+' เดือนแรกของสาขา':''}${f?.high?'|⚠ บิลสูงผิดปกติ':''}"
    style="background:${a?col.replace('rgb(','rgba(').replace(')',`,${a})`):'var(--surface2)'}${a?`;color:${umOnColor(col,a)}`:''}">${umPct(x)||'—'}${x.med?`<small>${utFmt(x.med)}</small>`:''}</span>`;
}

// ใช้ 0 ในช่วงล่าสุดที่จดครบ (น้ำ 7 วัน · ไฟ 2 สัปดาห์) = มิเตอร์ไม่ขยับ: ค้าง หรือลอกเลขเดิม
//   ตลาดไม่มีวันหยุด (เจ้าของยืนยัน 14 ต.ค.) → วันไหนก็ไม่ควรเป็น 0 · ตัวตรวจเหลือง/แดงดูแค่ "สูงกว่า" จับเคสนี้ไม่ได้
function umZero(m){
  if(!m._res||!utilTrue(m.active)) return [];
  const full=m._weeks?m._weeks.filter(w=>w.cover>=6.999).slice(-2):m._res.days.filter(d=>d.cover>=0.999).slice(-7);
  return full.filter(p=>p.units<1e-9);
}
// ข้อความเตือนจากเลขจด (เดิมอยู่บนการ์ดเก่า): จดขาดเกิน N วัน · ใช้ 0 · ช่วงตลาดปิดเกินเกณฑ์ · เลขถอยหลัง/เปลี่ยนมิเตอร์
function umWarns(m){
  const r=m._res, out=[], z=umZero(m);
  if(r.stale&&r.last&&utilTrue(m.active)) out.push(`⚠️ ไม่มีการจดเกิน ${r.staleDays} วัน (ล่าสุด ${utAgo(r.last)})`);
  if(z.length) out.push(`⚠️ ใช้ 0 ${utU(m)} ${z.map(p=>umWhen(m,p)).join(' · ')} · เช็คมิเตอร์`);
  const cl=r.closed.filter(x=>x.level).pop();
  if(cl&&cl.level==='red') out.push(`🔴 ช่วงตลาดปิด ${utFmt(cl.rate,2)} ${utU(m)}/ชม. เกินเกณฑ์`);
  if(m._anoms?.length) out.push(`⚠️ เลขจด ${m._anoms.length} รายการต้องเช็ค`);
  return out;
}

// ── การ์ด (บน) ──
// UTIL-24: ค่าปกติจากค่าเฉลี่ยบิล ณ วันนี้ (ตัวเดียวกับ utilPickBase ช่วงแรก) · รายสัปดาห์ × 7 · ไม่มีบิลใน maxAge เดือน = null
function umBillRef(c,m){
  if(!c.bills.length) return null;
  const S=utilSettings(utSet(),m.branch_code||UT.br), d=new Date(), iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const fb=utilBillDaily(c.bills,m.meter_id,iso,S);
  return fb?{v:fb.perDay*(m.type==='elec'?7:1),months:fb.months}:null;
}
function umTilesHtml(c){
  const money=c.bills.length>0, hi=umBillHi();   // UTIL-23: money = มีบิล (หน่วย) ให้โชว์ · ยอดเงินคุมที่ amount_incl_vat
  return `<div class="um-tiles">${umOrder(c).map(({m,i})=>{
    const p=m._full, lv=p?.level||'nodata', L=UT_LEVEL[lv]||UT_LEVEL.nodata, dp=m._weeks?0:1;
    let head, big='', tag=`${L.icon} ${L.txt}`, ref;
    if(!m._res.last&&utilTrue(m.active)&&(ref=umBillRef(c,m))){
      // UTIL-24: ยังไม่เคยจด แต่มีบิล → โชว์ค่าปกติจากค่าเฉลี่ยบิล (ตัวที่จะใช้เทียบเมื่อเริ่มจด) แทนการ์ดว่าง · ไม่ระบายสี (ยังไม่มียอดใช้)
      head=`ค่าปกติ (ค่าเฉลี่ยบิล ${ref.months.length} เดือน) · ยังไม่เริ่มจด`; tag='⏳ รอเริ่มจด';
      big=`<div class="um-big">${utFmt(ref.v,dp)}<small>${utU(m)}/${m.type==='elec'?'สัปดาห์':'วัน'}</small><span class="um-delta" style="color:var(--ink2)">เริ่มจดแล้วจะเทียบกับเลขนี้</span></div>`;
    }
    else if(!m._res.last) head=utilTrue(m.active)?'ยังไม่มีการจด':'ปิดใช้แล้ว';
    else if(!p) head='จดยังไม่ครบ';
    else{
      head=`ใช้ ${umRange(m,p)} · จดล่าสุด ${utWhen(m._res.last)}`;   // UTIL-26
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
      <div class="um-tile-h"><span>${umName(m)}${umHiTag(hi,m.meter_id)}</span><span>${tag}</span></div>
      <div class="um-head">${head}${m._weeks&&utilTrue(m.active)?' · จดทุกวันจันทร์':''}</div>${big}
      ${p&&p.base!=null?`<div class="um-tbul">${umBullet(m,p)}</div>`:''}
      ${w.length?`<div class="um-warn">${w.join('<br>')}</div>`:''}${bill}</div>`;
  }).join('')}</div>
  <div class="um-key">${umBulKey()}</div>`;
}

// ── ตารางความร้อน (ล่าง) ──
function umHeatHtml(c){
  const ord=umOrder(c), money=c.bills.length>0;   // UTIL-23
  let h='';
  if(money){
    const withB=ord.filter(({m})=>c.bills.some(b=>b.meter_id===m.meter_id));
    const all=[...new Set(c.bills.map(b=>b.bill_month))].sort().slice(-12);
    if(withB.length&&all.length){
      h+=`<h4>บิลรายเดือน · % จากค่ากลาง ${utilBillCfg(utSet()).lookback} บิลก่อน</h4>
        <div class="um-hg" style="grid-template-columns:max-content repeat(${all.length},minmax(52px,1fr))"><span></span>${all.map(mo=>`<span class="ch">${utMonthTh(mo)}</span>`).join('')}
        ${withB.map(({m,i})=>{ const R=umBillRatios(c,m.meter_id);
          return `<span class="rl" onclick="umMeterDetail(${i})">${umName(m)}</span>${all.map(mo=>R[mo]?umBillCell(c,m,i,mo,R[mo]):'<span class="c mo na"></span>').join('')}`; }).join('')}</div>
        <div class="um-key">${UM_SEQ.slice(1).map(([,a],k)=>`<span><i style="background:${sc(`rgba(240,122,53,${umAlpha(a)})`)}"></i>${['ไม่เกิน +15%','+15–30%','+30–60%','เกิน +60%'][k]}</span>`).join('')}
          <span><i style="background:var(--surface2)"></i>ไม่สูงกว่าค่ากลาง · ยังไม่ตรวจ</span><span>เลขบน = % จากค่ากลาง · เลขล่าง = ค่ากลาง</span>
          <span><i style="outline:2px solid var(--red);outline-offset:-2px"></i>⚠ บิลสูงผิดปกติ</span></div>`;
    }
  }
  const lvCell=(m,i,d)=>!d?'<span class="c na"></span>'
    :`<span class="c" onclick="umPointDetail(${i},'${d.date}')" data-tip="${umName(m)}|${umWhen(m,d)}|ใช้ ${utFmt(d.units,1)} ${utU(m)}${d.base!=null?' · ค่ากลาง '+utFmt(d.base,1):''}|${(UT_LEVEL[d.level]||UT_LEVEL.nodata).icon} ${(UT_LEVEL[d.level]||UT_LEVEL.nodata).txt}${d.est?'|ไม่ได้จด (ยอดเฉลี่ย)':''}"
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

// ── กล่องชี้ช่องในตาราง (data-tip) — แทน title ของเบราว์เซอร์ที่ตัวเล็กมาก (เจ้าของ 14 ต.ค.) ──
//   บรรทัดแรก = ชื่อมิเตอร์ (ตัวหนา) · ที่เหลือแยกบรรทัดตาม "|" (ป้ายสถานะมี " · " อยู่ในตัว) · จอสัมผัสไม่มี hover → กดช่องได้กล่องวิธีคิดเหมือนเดิม
function umTipEl(){ let t=document.getElementById('umTip'); if(!t){ t=document.createElement('div'); t.id='umTip'; t.className='um-tip'; document.body.appendChild(t); } return t; }
document.addEventListener('mouseover',e=>{
  const c=e.target.closest&&e.target.closest('.um-hg [data-tip]'), t=umTipEl();
  if(!c){ t.style.display='none'; return; }
  const [h,...rest]=c.dataset.tip.split('|');
  t.innerHTML=`<b>${utEsc(h)}</b>${rest.map(x=>`<div>${utEsc(x)}</div>`).join('')}<small>กดดูวิธีคิด</small>`;   // dataset ถอด &amp; กลับแล้ว → escape ซ้ำ
  t.style.display='block';
  const r=c.getBoundingClientRect(), w=t.offsetWidth, ht=t.offsetHeight;
  t.style.left=Math.max(8,Math.min(window.innerWidth-w-8,r.left+r.width/2-w/2))+'px';
  t.style.top=(r.top-ht-8>8?r.top-ht-8:r.bottom+8)+'px';
});
document.addEventListener('scroll',()=>{ const t=document.getElementById('umTip'); if(t) t.style.display='none'; },true);

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
  box.style.display='flex'; syncModalLock();   // MOB-01: ล็อกข้างหลังแบบป๊อปอัปอื่น (ui.js)
}
// ค่าที่ใช้หาค่ากลาง เรียงน้อย→มาก · ตัวกลางมีกรอบ (จำนวนคู่ = 2 ตัวกลาง)
function umMedList(items,fmt){
  const s=[...items].sort((a,b)=>a.v-b.v), n=s.length, mid=n%2?[n>>1]:[n/2-1,n/2];
  return `<ol class="um-med">${s.map((x,k)=>`<li${mid.includes(k)?' class="mid"':''}><span>${x.t}</span><b>${fmt(x.v)}</b></li>`).join('')}</ol>`;
}

// บิลใบเดียว: หน่วย ยอดเงิน · ค่ากลาง 6 บิลก่อน · 2 ข้อของตัวตรวจบิล (ตรงกับ utilBillCheck)
function umBillDetail(i,mo){
  const c=UT.cache[UT.br], m=c&&c.meters[i]; if(!m) return;
  const B=utilBillCfg(utSet()), by={}, amt={};
  c.bills.filter(b=>b.meter_id===m.meter_id).forEach(b=>{ const u=utNum(b.units); if(u>0){ by[b.bill_month]=(by[b.bill_month]||0)+u; amt[b.bill_month]=(amt[b.bill_month]||0)+(utNum(b.amount_incl_vat)||0); } });
  const ks=Object.keys(by).sort(), j=ks.indexOf(mo); if(j<0) return;
  const u=by[mo], prev=ks.slice(Math.max(0,j-B.lookback),j), unit=utU(m), min=B.minDiff[m.type]??0;
  const f=c.chk&&c.chk[m.meter_id+'@'+mo], use=utilBillUsageMonth(mo);
  const warm=umBillWarm(c,mo);   // ไม่ตรวจ warmup เดือนแรกนับจากบิลใบแรกของ "สาขา"
  let calc;
  if(prev.length<B.minPrev) calc=`<p>บิลก่อนหน้ามี ${prev.length} ใบ ต้องมีอย่างน้อย ${B.minPrev} ใบถึงจะเทียบได้</p>`;
  else if(warm) calc=`<p>ไม่ตรวจ: อยู่ใน ${B.warmup} เดือนแรกของสาขา</p>`;
  else{
    const med=utilMedian(prev.map(k=>by[k])), line=med*B.ratio, over1=u>line, over2=u-med>=min;
    calc=`<div class="um-dh">ค่ากลาง ${prev.length} บิลก่อน = <b>${umFb(med,0)}</b> ${unit}</div>${umMedList(prev.map(k=>({t:utMonthTh(k),v:by[k]})),v=>utFmt(v))}
      <div class="um-dh">เทียบกับเกณฑ์</div>
      <table class="um-dt"><tr><td>ค่ากลาง × ${B.ratio} &lt; บิลนี้</td><td>${umFb(med,0)} × ${B.ratio} = ${utFmt(line,1)} &lt; ${utFmt(u)}</td><td>${over1?'✔ ผ่าน':'— ไม่ผ่าน'}</td></tr>
        <tr><td>ค่ากลาง + ${utFmt(min)} ≤ บิลนี้</td><td>${umFb(med,0)} + ${utFmt(min)} = ${umFb(med+min,0)} ≤ ${utFmt(u)}</td><td>${over2?'✔ ผ่าน':'— ไม่ผ่าน'}</td></tr></table>
      <p class="um-res">${over1&&over2?'⚠ ผ่านทั้ง 2 ข้อ = บิลสูงผิดปกติ':'✅ ไม่ผ่านครบ 2 ข้อ = ไม่ขึ้นธง'} · ${u>=med?'+':''}${utFmt((u/med-1)*100)}% จากค่ากลาง</p>`;
  }
  const q=f&&(f.dup||f.round)?`<p class="um-sub2">? ${utFlagText(UT.br||activeBranch,f).filter(x=>x.k==='q').map(x=>x.t.replace(/<[^>]+>/g,'')).join(' · ')}</p>`:'';
  const got=m._res?.days.filter(d=>d.date.startsWith(use))||[], gu=got.reduce((s,d)=>s+d.units,0), gc=got.reduce((s,d)=>s+d.cover,0);
  umModal(`${umName(m)} · บิล ${utMonthTh(mo)}`,`ใช้จริงเดือน ${utMonthTh(use)} (บิลออกเดือนถัดไป)`,
    `<div class="um-dbig">${utFmt(u)} <small>${unit}</small>${amt[mo]?`<span>${utFmt(amt[mo],2)} บาท · ${utFmt(amt[mo]/u,2)} บาท/${unit}</span>`:''}</div>
     ${calc}${q}${got.length?`<p class="um-sub2">จากเลขที่จดเดือน ${utMonthTh(use)}: ${utFmt(gu)} ${unit} (${Math.round(gc)} วัน)</p>`:''}
     <button class="mc-pill" onclick="umMeterDetail(${i})">ดูมิเตอร์นี้ทั้งหมด</button>`);
}

// ค่าต่อวัน (× mult) ของแต่ละเดือนที่ใช้หาค่าเฉลี่ยบิล — ตรงกับ utilBillDaily
function umBillAvgRows(c,m,months,mult){
  const S=utilSettings(utSet(),m.branch_code||UT.br), per={};
  c.bills.filter(b=>b.meter_id===m.meter_id).forEach(b=>{ const u=utNum(b.units); if(u>0){ const k=utilBillUsageMonth(b.bill_month,S.billMonthOffset); per[k]=(per[k]||0)+u; } });
  return (months||[]).map(k=>{ const [y,mo]=k.split('-').map(Number); return {t:utMonthTh(k),v:per[k]/new Date(Date.UTC(y,mo,0)).getUTCDate()*mult}; });
}

// วัน/สัปดาห์เดียว: ใช้เท่าไหร่ · ค่ากลางจากวันเดียวกัน 4 สัปดาห์ก่อน · สูตรเส้นเหลือง/แดง (ตรงกับ utilFlags/utilWeekly)
function umPointDetail(i,iso){
  const c=UT.cache[UT.br], m=c&&c.meters[i]; if(!m||!m._res) return;
  const S=utilSettings(utSet(),m.branch_code||UT.br), wk=!!m._weeks, unit=utU(m), th=m._th;
  const all=wk?utilWeekly(m._res.days,{meter_id:m.meter_id,type:m.type,branch_code:m.branch_code},S,c.bills):m._res.days;
  const by=new Map(all.map(d=>[d.date,d])), p=by.get(iso); if(!p) return;
  const dp=wk?0:1, fmt=v=>utFmt(v,dp), fb=v=>umFb(v,dp), full=wk?6.999:0.999, minD=wk?th.minDiff*7:th.minDiff;
  const hist=[]; for(let k=1;k<=S.baseWeeks;k++){ const iso2=utilIso(utilIdx(iso)-7*k); hist.push({t:wk?`สัปดาห์ ${utDM(iso2)}`:utDM(iso2),d:by.get(iso2)}); }
  const used=hist.filter(h=>h.d&&h.d.cover>=full&&!['red','leak'].includes(h.d.level)), skip=hist.filter(h=>!used.includes(h));
  const L=UT_LEVEL[p.level]||UT_LEVEL.nodata, Bd=umBands(m,p);
  let calc='';
  if(p.level==='partial') calc=`<p>${wk?`สัปดาห์นี้จดยังไม่ครบ (${utFmt(p.cover,1)}/7 วัน)`:`วันนี้จดยังไม่ครบ (มีข้อมูล ${utFmt(p.cover*100)}% ของวัน)`} ยังไม่ตัดสิน</p>`;
  else if(p.base==null) calc=`<p>ข้อมูลยังไม่พอเทียบ: ต้องมี${wk?'สัปดาห์':'วันเดียวกัน'}ก่อนหน้าที่จดครบอย่างน้อย ${S.baseMinDays} ${wk?'สัปดาห์':'วัน'} (มี ${used.length})</p>`;
  else{
    // UTIL-21 ช่วงแรกค่ากลางยังไม่พอ → ค่าเฉลี่ยบิล: เดือนละแถว = หน่วยในบิล ÷ วันในเดือน (× 7 รายสัปดาห์)
    const bm=p.baseFrom==='bill'?umBillAvgRows(c,m,p.billMonths,wk?7:1):null;
    calc=`<div class="um-dh">ค่ากลาง = <b>${fb(p.base)}</b> ${unit} ${bm?`· ค่าเฉลี่ยบิล ${bm.length} เดือน`:`จาก ${used.length} ${wk?'สัปดาห์':'วัน'}ก่อน`}</div>
      ${bm?`<ol class="um-med">${bm.map(x=>`<li><span>ใช้เดือน ${x.t}</span><b>${fmt(x.v)}</b></li>`).join('')}</ol>
        <p class="um-sub2">ช่วงแรก ${wk?'จดยังไม่ถึง':'จดวันเดียวกันยังไม่ถึง'} ${S.baseMinDays} ${wk?'สัปดาห์':'ครั้ง'} · ครบแล้วใช้ค่ากลางจากเลขที่จด</p>`
      :umMedList(used.map(h=>({t:h.t,v:h.d.units})),fmt)}
      ${skip.length?`<p class="um-sub2">ไม่นับ: ${skip.map(h=>`${h.t} (${!h.d?'ไม่มีข้อมูล':h.d.cover<full?'จดไม่ครบ':'แดงไปแล้ว'})`).join(' · ')}</p>`:''}
      <div class="um-dh">เทียบกับเกณฑ์ (ต้องผ่านทั้ง 2 ข้อ)</div>
      <table class="um-dt">${[['🟡 เหลือง',th.yellow],['🔴 แดง',th.red]].map(([t,x])=>{ const a=p.base*x<p.units, b=p.base+minD<=p.units;
        return `<tr><td rowspan="2">${t}</td><td>ค่ากลาง × ${x} &lt; ที่ใช้ · ${fb(p.base)} × ${x} = ${fmt(p.base*x)} &lt; ${fmt(p.units)}</td><td>${a?'✔ ผ่าน':'— ไม่ผ่าน'}</td></tr>
          <tr><td>ค่ากลาง + ${utFmt(minD)} ≤ ที่ใช้ · ${fb(p.base)} + ${utFmt(minD)} = ${fmt(p.base+minD)} ≤ ${fmt(p.units)}</td><td>${b?'✔ ผ่าน':'— ไม่ผ่าน'}</td></tr>`; }).join('')}</table>
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
  utAxis(o);
  o.onClick=(e,els)=>{ if(els.length) umPointDetail(i,pts[els[0].index].date); };
  o.onHover=(e,els)=>{ e.native.target.style.cursor=els.length?'pointer':''; };
  return {type:'bar',plugins:[umZonePlugin],data:{labels:pts.map(d=>utDM(d.date)),datasets:[
    {type:'bar',label:'ใช้',data:pts.map(d=>+d.units.toFixed(2)),borderRadius:2,order:2,
     backgroundColor:pts.map(d=>umHot(d.level)?`rgba(${umRgb(d.level)},.95)`:`rgba(${umRgb('nodata')},${d.est||d.level==='partial'?.35:.75})`)},
    {type:'line',label:'ค่ากลาง',data:pts.map(d=>d.base??null),borderColor:utInk().ink2,borderDash:[4,4],borderWidth:1.4,
     pointRadius:0,stepped:'middle',spanGaps:false,order:1}]},options:o};
}
function umMeterDetail(i){
  const c=UT.cache[UT.br], m=c&&c.meters[i]; if(!m||!m._res) return;
  dChart('cUmFull');
  const r=m._res, p=m._full, lv=p?.level||'nodata', L=UT_LEVEL[lv]||UT_LEVEL.nodata, dp=m._weeks?0:1, unit=utU(m);
  const hi=umBillHi(), money=c.bills.length>0, cash=canSeeUtilMoney()&&!c.billsErr, pts=umPts(m);   // UTIL-23: cash = คอลัมน์เงิน
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
      // MOB-02: 12 เดือน × 52px กว้างกว่าจอมือถือ → เลื่อนในกรอบตัวเอง (เดิมทั้งกล่องเลื่อนซ้ายขวา) · เปิดมาเห็นเดือนล่าสุด (ท้ายฟังก์ชัน)
      const row=`<div class="um-hscroll"><div class="um-hg" style="grid-template-columns:repeat(${last12.length},minmax(52px,1fr))">${last12.map(k=>`<span class="ch">${utMonthTh(k)}</span>`).join('')}
        ${last12.map(k=>umBillCell(c,m,i,k,R[k])).join('')}</div></div>`;
      const tr=[...ks].reverse().map(k=>{ const x=R[k], f=c.chk&&c.chk[m.meter_id+'@'+k], use=utilBillUsageMonth(k);
        const md=r.days.filter(d=>d.date.startsWith(use)), got=md.reduce((s,d)=>s+d.units,0);
        const mk=!f?'':f.high?' <span class="ut-mk hi">⚠</span>':' <span class="ut-mk q">?</span>';
        return `<tr class="um-link" onclick="umBillDetail(${i},'${k}')"><td>${utMonthTh(k)}${mk}</td><td class="n">${utFmt(x.units)}</td><td class="n">${x.med?umFb(x.med,0):'—'}</td>
          <td class="n">${umPct(x)||'—'}</td>${cash?`<td class="n">${amt[k]?utFmt(amt[k],2):'—'}</td><td class="n">${amt[k]?utFmt(amt[k]/x.units,2):'—'}</td>`:''}<td class="n">${md.length?utFmt(got):'—'}</td></tr>`; }).join('');
      bills=`<div class="um-dh">บิลรายเดือน · % จากค่ากลาง ${utilBillCfg(utSet()).lookback} บิลก่อน</div>${row}
        <div class="um-key"><span>เลขบน = % จากค่ากลาง · เลขล่าง = ค่ากลาง · กรอบแดง = ⚠ บิลสูงผิดปกติ · กดช่องหรือแถวดูวิธีคิด</span></div>
        <div class="ut-bills ut-bills-all"><table><thead><tr><th>เดือนในบิล</th><th class="n">${unit} ตามบิล</th><th class="n">ค่ากลาง</th><th class="n">%</th>${cash?`<th class="n">ยอดเงิน (รวม VAT)</th><th class="n">บาท/${unit}</th>`:''}<th class="n">จากเลขที่จด</th></tr></thead><tbody>${tr}</tbody></table></div>`;
    }
  }
  umModal(`${umName(m)}${umHiTag(hi,m.meter_id)}${m.location?` <span class="ut-sub">${utEsc(m.meter_id)}</span>`:''}`,
    `${L.icon} ${L.txt}${r.last?` · จดล่าสุด ${utWhen(r.last)} (${utAgo(r.last)})`:''}${utilTrue(m.active)?'':' · ปิดใช้แล้ว'}`,
    sum+(info.length?`<div class="um-warn">${info.join('<br>')}</div>`:'')+chart+bills, 'um-full');
  document.querySelectorAll('#utModal .um-hscroll').forEach(e=>{ e.scrollLeft=e.scrollWidth; });   // MOB-02: เดือนล่าสุดอยู่ขวาสุด
  if(pts.length) makeChart('cUmFull',umFullCfg(m,i));   // ไม่เข้า UT.chartIds — แท็บวาดใหม่ (รีเฟรช 5 นาที) ต้องไม่ลบกราฟในกล่อง
}

// ── จุดเชื่อมกับ utDraw(): การ์ด (บน) + ตารางความร้อน (ล่าง) ──
function utMeterHtml(c){
  const heat=umHeatHtml(c);
  return umTilesHtml(c)+(heat?`<div class="um-gap"></div>${heat}`:'');
}

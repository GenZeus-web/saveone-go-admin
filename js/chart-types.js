// ============================================================
// chart-types.js — CHT-04 ผู้ใช้เลือกประเภทกราฟเองได้ (ปุ่มไอคอนมุมการ์ด + เมนู)
// ============================================================
// หลักการ: view สร้าง config แบบเดิมทุกครั้ง → makeChart() เรียก ctResolve() แปลงเป็นแบบที่เลือกก่อนวาด
//   ไฟล์ views จึงไม่ต้องรู้ว่ามีหลายแบบ · ข้อมูลที่ config เดิมไม่มี view ส่งมาทาง config._ct (ตัดทิ้งก่อนถึง Chart.js)
// ทุกกราฟเปิดมาเป็นแบบเดิมเสมอ · ค่าที่เลือกจำใน localStorage ของเครื่องนั้น ไม่ผูกบัญชี ไม่แตะ Firestore
// กราฟที่ไม่อยู่ใน CT_SPEC = ไม่มีตัวเลือก โดยตั้งใจ:
//   cFC พยากรณ์ (เส้นต่อจากของจริง) · cMonthRev เงินรายเดือน · cFDMonth/cFDCount วันฝน (ตัวเลขเดียวต่อเดือน แท่งดีอยู่แล้ว)
// ต้นแบบที่ใช้ตัดสินใจ: branch prototype/chart-picker (เจ้าของเลือกแบบ B · 6 ต.ค. 2569)

/* ── ตัวเลือกต่อกราฟ: ตัวแรก = แบบเดิม ──
   need(cfg,ctx) คืนเหตุผลที่ยังใช้แบบนั้นไม่ได้ ('' = ใช้ได้) · h = ความสูงกล่องกราฟตอนใช้แบบนั้น */
const CT_NEED_2BR=cfg=>(cfg.data?.datasets?.length||0)<2?'เลือกอย่างน้อย 2 สาขาด้านบนก่อน':'';
const CT_NEED_ALL=()=>group!=='all'?'เลือกกลุ่มข้อมูล "ทั้งหมด" ก่อน — เป้าตั้งไว้กับยอดรวม':'';
const CT_ROWS_H=(per,min)=>cfg=>Math.max(min,(cfg.data?.labels?.length||0)*per+70);
const CT_SPEC={
  cMain:      {icon:'combo',   opts:[['orig','แท่ง+เส้น','ขึ้นลงตามวัน'],['scatter','จุดกระจาย','ราย × ล็อก · หาวันแปลก']]},
  cMonthly:   {icon:'stack',   opts:[['orig','แท่งซ้อน','ส่วนประกอบรายเดือน'],['waterfall','Waterfall','ขายได้จากไหน · มาขายจริงเท่าไหร่']], h:{waterfall:300}},
  cWeekday:   {icon:'bar',     opts:[['orig','แท่ง','ค่าเฉลี่ย'],['dot','จุดทุกวัน','เห็นทุกวัน · วันฝน'],['box','Box plot','ช่วงปกติ ต่ำ–กลาง–สูง']], h:{dot:260,box:260}},
  cPie:       {icon:'doughnut',opts:[['orig','โดนัท','ภาพรวมสัดส่วน'],['hbar','แท่งเรียง','เทียบขนาดได้แม่นกว่า']]},
  cMonthTotal:{icon:'bar',     opts:[['orig','แท่ง','ยอดรวม'],['dot','จุด vs เป้า','ห่างเป้าแค่ไหน'],['bullet','Bullet','แท่งจริงบนแถบเป้า']],
               need:{bullet:CT_NEED_ALL}, h:{dot:CT_ROWS_H(40,240),bullet:CT_ROWS_H(44,260)}},
  cCompare:   {icon:'line',    opts:[['orig','รายวัน','ล็อกแต่ละวัน'],['cum','สะสม','เดือนนี้วิ่งเร็วกว่าเดือนก่อนไหม']]},
  cAvg:       {icon:'bar',     opts:[['orig','แท่ง','เฉลี่ย/วัน'],['bullet','Bullet','เทียบเป้า/วัน']], h:{bullet:CT_ROWS_H(30,240)}},
  cBmAvg:     {icon:'line',    opts:[['orig','เส้น','แนวโน้ม'],['dot','จุดเทียบสาขา','ห่างกันแค่ไหน']], need:{dot:CT_NEED_2BR}, h:{dot:CT_ROWS_H(24,220)}},
  cBmMonth:   {icon:'line',    opts:[['orig','เส้น','แนวโน้ม'],['dot','จุดเทียบสาขา','ห่างกันแค่ไหน']], need:{dot:CT_NEED_2BR}, h:{dot:CT_ROWS_H(24,220)}},
  cBmDaily:   {icon:'line',    opts:[['orig','ล็อก','จำนวนจริง'],['index','ดัชนี','เฉลี่ยสาขา = 100 · ขึ้นลงพร้อมกันไหม']], need:{index:CT_NEED_2BR}},
};
const CT_ICONS={
  combo:'<rect x="2" y="9" width="2.6" height="5" rx=".8"/><rect x="6.7" y="7" width="2.6" height="7" rx=".8"/><rect x="11.4" y="10" width="2.6" height="4" rx=".8"/><path d="M2.5 6 8 3 13.5 5" fill="none" stroke-width="1.6" stroke-linecap="round"/>',
  bar:'<rect x="2" y="7" width="3" height="7" rx="1"/><rect x="6.5" y="3" width="3" height="11" rx="1"/><rect x="11" y="9" width="3" height="5" rx="1"/>',
  stack:'<rect x="2" y="8" width="3" height="6" rx=".8"/><rect x="2" y="4" width="3" height="3.2" rx=".8" opacity=".5"/><rect x="6.5" y="6" width="3" height="8" rx=".8"/><rect x="6.5" y="2" width="3" height="3.2" rx=".8" opacity=".5"/><rect x="11" y="9" width="3" height="5" rx=".8"/><rect x="11" y="5" width="3" height="3.2" rx=".8" opacity=".5"/>',
  line:'<path d="M2 12 6 7 9.5 9.5 14 3" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  doughnut:'<circle cx="8" cy="8" r="5.2" fill="none" stroke-width="2.8"/>',
  scatter:'<circle cx="4" cy="11" r="1.6"/><circle cx="8" cy="7" r="1.6"/><circle cx="11" cy="9" r="1.6"/><circle cx="13" cy="3.5" r="1.6"/>',
  dot:'<path d="M2 4H14M2 8H14M2 12H14" stroke-width="1" opacity=".35"/><circle cx="6" cy="4" r="1.8"/><circle cx="11" cy="4" r="1.8"/><circle cx="4" cy="8" r="1.8"/><circle cx="9" cy="8" r="1.8"/><circle cx="7" cy="12" r="1.8"/><circle cx="13" cy="12" r="1.8"/>',
  hbar:'<rect x="2" y="2.5" width="12" height="2.6" rx="1"/><rect x="2" y="6.7" width="8" height="2.6" rx="1"/><rect x="2" y="10.9" width="4.5" height="2.6" rx="1"/>',
  box:'<path d="M4.5 1.5v3M4.5 11v3.5M11.5 3v2.5M11.5 12v2.5" stroke-width="1.2"/><rect x="2.5" y="4.5" width="4" height="6.5" rx=".8" fill="none" stroke-width="1.4"/><rect x="9.5" y="5.5" width="4" height="6.5" rx=".8" fill="none" stroke-width="1.4"/><path d="M2.5 7.5h4M9.5 9h4" stroke-width="1.4"/>',
  bullet:'<rect x="2" y="2.5" width="12" height="4.5" rx="1" opacity=".35"/><rect x="2" y="3.8" width="8.5" height="2" rx=".6"/><rect x="2" y="9" width="12" height="4.5" rx="1" opacity=".35"/><rect x="2" y="10.3" width="11" height="2" rx=".6"/><path d="M12 2v5.5M12 8.5V14" stroke-width="1.4"/>',
  waterfall:'<rect x="1.5" y="3" width="2.8" height="11" rx=".6"/><rect x="5" y="3" width="2.8" height="3" rx=".6" opacity=".5"/><rect x="8.5" y="1.5" width="2.8" height="4.5" rx=".6"/><rect x="12" y="1.5" width="2.8" height="12.5" rx=".6"/>',
  cum:'<path d="M2 14 5 12 8 9 11 6 14 2" fill="none" stroke-width="1.8" stroke-linecap="round"/><path d="M2 14H14" stroke-width="1" opacity=".4"/>',
  index:'<path d="M2 8H14" stroke-width="1" stroke-dasharray="2 1.5" opacity=".6"/><path d="M2 10 5 6 8 9 11 5 14 7" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
};
function ctIcon(id,k){
  const name=k==='orig'?CT_SPEC[id].icon:k;
  return `<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" stroke="currentColor" aria-hidden="true">${CT_ICONS[name]||CT_ICONS.bar}</svg>`;
}

/* ── ค่าที่เลือก (จำในเครื่อง) ── */
const CT_KEY='chartTypes_v1';
let ctPref={};
try{ ctPref=JSON.parse(localStorage.getItem(CT_KEY)||'{}')||{}; }catch(e){ ctPref={}; }
function ctSave(){ try{ localStorage.setItem(CT_KEY,JSON.stringify(ctPref)); }catch(e){} }
const ctLast={}; // id → config ล่าสุดที่ view ส่งมา (ไว้วาดใหม่ตอนสลับแบบ โดยไม่ต้อง render ทั้งหน้า)

function ctBlocked(id,k){
  const f=CT_SPEC[id]?.need?.[k];
  return f&&ctLast[id] ? f(ctLast[id]) : '';
}
// แบบที่จะวาดจริง: ค่าที่จำไว้ ถ้ายังมีตัวเลือกนี้และใช้ได้ตอนนี้ — ไม่งั้นแบบเดิม (แต่ไม่ลบค่าที่จำไว้)
function ctMode(id){
  const k=ctPref[id];
  if(!k||!CT_SPEC[id].opts.some(o=>o[0]===k)) return 'orig';
  return ctBlocked(id,k)?'orig':k;
}

/* ── เรียกจาก makeChart() ── */
function ctResolve(id,config){
  const spec=CT_SPEC[id];
  if(!spec) return config;
  ctLast[id]=config;
  const {_ct,...cfg}=config;
  const m=ctMode(id);
  ctSetHeight(id,m,cfg);
  if(m==='orig') return cfg;
  try{
    const alt=CT_ALT[id][m](cfg,_ct||{});
    if(alt) return alt;
  }catch(e){ console.warn('chart-types: แปลง #'+id+' เป็น '+m+' ไม่ได้ — ใช้แบบเดิม',e.message); }
  ctSetHeight(id,'orig',cfg);
  return cfg;
}
function ctSetHeight(id,m,cfg){
  const box=document.getElementById(id)?.parentElement;
  if(!box) return;
  if(box.dataset.ctH===undefined) box.dataset.ctH=box.style.height||'';
  const h=CT_SPEC[id].h?.[m];
  const px=typeof h==='function'?h(cfg):h;
  box.style.height=px?px+'px':box.dataset.ctH;
}

/* ── ปุ่มไอคอนมุมการ์ด + เมนู ── */
function ctMount(id){
  if(!CT_SPEC[id]) return;
  const canvas=document.getElementById(id);
  const card=canvas?.closest('.sc,.main-chart-card');
  if(!card) return;
  let btn=card.querySelector(`.ct-btn[data-ct="${id}"]`);
  if(!btn){
    btn=document.createElement('button');
    btn.type='button';btn.className='ct-btn';btn.dataset.ct=id;
    btn.setAttribute('aria-haspopup','menu');btn.setAttribute('aria-expanded','false');
    btn.addEventListener('click',e=>{e.stopPropagation();ctToggleMenu(id,btn);});
    const head=card.querySelector('.mc-header');
    if(head){ btn.classList.add('ct-btn--inline'); head.appendChild(btn); }
    else { card.classList.add('ct-card'); card.appendChild(btn); }
  }
  const m=ctMode(id),opt=CT_SPEC[id].opts.find(o=>o[0]===m);
  btn.innerHTML=ctIcon(id,m);
  btn.title=`แบบกราฟ: ${opt[1]} — กดเพื่อเปลี่ยน`;
  btn.setAttribute('aria-label',btn.title);
}
function ctCloseMenu(focusBtn){
  const m=document.querySelector('.ct-menu');
  if(!m) return;
  const btn=document.querySelector(`.ct-btn[data-ct="${m.dataset.ct}"]`);
  m.remove();
  if(btn){ btn.setAttribute('aria-expanded','false'); if(focusBtn) btn.focus(); }
}
function ctToggleMenu(id,btn){
  const open=document.querySelector('.ct-menu');
  ctCloseMenu(false);
  if(open&&open.dataset.ct===id) return;
  const cur=ctMode(id);
  const menu=document.createElement('div');
  menu.className='ct-menu';menu.dataset.ct=id;menu.setAttribute('role','menu');
  menu.innerHTML=CT_SPEC[id].opts.map(([k,l,d])=>{
    const why=ctBlocked(id,k);
    return `<button type="button" role="menuitemradio" data-k="${k}" aria-checked="${cur===k}"${why?' disabled':''}>
      ${ctIcon(id,k)}<span>${l}${k==='orig'?' <em>(เดิม)</em>':''}<small>${why||d}</small></span><span class="ct-ck">${cur===k?'✓':''}</span></button>`;
  }).join('');
  menu.addEventListener('click',e=>{
    e.stopPropagation();
    const b=e.target.closest('button');
    if(!b||b.disabled) return;
    ctCloseMenu(true);
    ctPick(id,b.dataset.k);
  });
  menu.addEventListener('keydown',e=>{
    if(e.key!=='ArrowDown'&&e.key!=='ArrowUp') return;
    e.preventDefault();
    const items=[...menu.querySelectorAll('button:not(:disabled)')];
    const i=items.indexOf(document.activeElement);
    items[(i+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();
  });
  btn.after(menu);
  btn.setAttribute('aria-expanded','true');
  (menu.querySelector('[aria-checked="true"]')||menu.querySelector('button:not(:disabled)'))?.focus();
}
function ctPick(id,k){
  if(k==='orig') delete ctPref[id]; else ctPref[id]=k;
  ctSave();
  if(ctLast[id]) charts[id]=makeChart(id,ctLast[id]);
}
document.addEventListener('click',()=>ctCloseMenu(false));
document.addEventListener('keydown',e=>{ if(e.key==='Escape') ctCloseMenu(true); });

/* ── ตัวช่วยวาด ── */
const ctLight=()=>document.body.classList.contains('light-mode');
const ctSurf=()=>ctLight()?'#ffffff':'#242938';  // วงขอบจุด = สีพื้นการ์ด แยกจุดที่ทับกัน
const ctInk=()=>ctLight()?'#1a1f2e':'#e8ecf5';   // ขีดค่าเฉลี่ย/มัธยฐาน
const ctBase=()=>({responsive:true,maintainAspectRatio:false,animation:{duration:350}});
const ctAxis=(title,extra={})=>({grid:{color:chartClr().grid},ticks:{color:chartClr().tick,font:{family:'JetBrains Mono',size:10}},
  title:{display:!!title,text:title,color:chartClr().lbl,font:{family:'Noto Sans Thai',size:10}},...extra});
// แกนหมวดแนวตั้งแบบตัวเลข (ใช้กับ scatter ที่แต่ละแถวเป็นหมวด) — แถวแรกอยู่บน
const ctRowAxis=labels=>({type:'linear',min:-0.6,max:labels.length-0.4,reverse:true,border:{display:false},
  grid:{color:c=>Number.isInteger(c.tick.value)?chartClr().grid:'transparent'},
  afterBuildTicks:a=>{a.ticks=labels.map((_,i)=>({value:i}));},
  ticks:{autoSkip:false,color:chartClr().lbl,font:{family:'Noto Sans Thai',size:11},callback:v=>labels[v]??''}});
const ctLegend=()=>({labels:{color:chartClr().lbl,usePointStyle:true,boxWidth:8,font:{family:'Noto Sans Thai',size:11}}});
const ctJit=i=>(((i*2654435761)>>>0)%1000/1000-0.5); // สุ่มแบบคงที่ จุดไม่กระโดดทุกครั้งที่วาดใหม่
const ctQ=(a,p)=>{const i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo);};
const ctPct=(v,t)=>t?Math.round(v/t*100)+'%':'';

// Bullet แนวนอน — แถบจาง = เป้า · แท่งทึบ = จริง · ขีดม่วง = จุดเป้า (ใช้ทั้งยอดรวมรายเดือนและเฉลี่ย/วัน)
function ctBullet({labels,vals,colors,tgts,unit,note}){
  const sets=[];
  if(tgts) sets.push({type:'bar',label:`เป้า (${fmtN(targetLock)} ล็อก/วัน${unit==='รวม'?' × วันที่มีข้อมูล':''})`,data:tgts,backgroundColor:'rgba(154,163,188,.22)',
    barPercentage:.9,categoryPercentage:.85,grouped:false,order:2,borderRadius:3,ctTgt:true});
  sets.push({type:'bar',label:unit==='รวม'?'ล็อกรวม':'ล็อกเฉลี่ย/วัน',data:vals,backgroundColor:colors,barPercentage:.42,categoryPercentage:.85,grouped:false,order:1,borderRadius:3});
  const marks={id:'ctBullet',afterDatasetsDraw(ch){
    const{ctx}=ch,xs=ch.scales.x;ctx.save();ctx.textBaseline='middle';ctx.textAlign='left';
    ch.getDatasetMeta(sets.length-1).data.forEach((b,i)=>{
      if(tgts){const tx=xs.getPixelForValue(tgts[i]);ctx.strokeStyle='rgba(167,139,250,1)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(tx,b.y-b.height);ctx.lineTo(tx,b.y+b.height);ctx.stroke();}
      const x=Math.max(b.x,tgts?xs.getPixelForValue(tgts[i]):0)+10;
      ctx.font='600 12px JetBrains Mono';ctx.fillStyle=chartClr().lbl;
      ctx.fillText(fmtN(vals[i],unit==='รวม'?0:1)+(tgts?'  '+ctPct(vals[i],tgts[i]):''),x,b.y);
      if(note?.[i]){ctx.font='400 10px Noto Sans Thai';ctx.fillStyle=chartClr().tick;ctx.fillText(note[i],x,b.y+14);}
    });ctx.restore();}};
  const xMax=Math.max(...vals,...(tgts||[]));
  return {data:{labels,datasets:sets},options:{...ctBase(),indexAxis:'y',
    plugins:{legend:{display:!!tgts,labels:{color:chartClr().lbl,font:{family:'Noto Sans Thai',size:11}}},
      tooltip:{callbacks:{label:t=>t.dataset.ctTgt?` เป้า ${fmtN(t.raw)} ล็อก`:` จริง ${fmtN(t.raw,unit==='รวม'?0:1)} ล็อก${tgts?` (${ctPct(t.raw,tgts[t.dataIndex])} ของเป้า)`:''}`}}},
    scales:{x:ctAxis(unit==='รวม'?'ล็อกรวม':'ล็อก / วัน',{beginAtZero:true,suggestedMax:xMax*1.25}),
      y:{grid:{display:false},ticks:{color:chartClr().lbl,font:{family:'Noto Sans Thai',size:11}}}}},
    plugins:[marks]};
}

// เส้นหลายสาขา → แถว = เดือน · จุด = สาขา · แถบเชื่อม = ช่วงห่างของเดือนนั้น
function ctDotFromLines(cfg,xTitle){
  const labels=cfg.data.labels,src=cfg.data.datasets;
  if(!labels?.length) return null;
  const sets=src.map((d,si)=>{
    const keep=d.data.map((v,i)=>v==null?null:i).filter(i=>i!==null);
    return {label:d.label,data:keep.map(i=>({x:d.data[i],y:i})),borderColor:d.borderColor,borderWidth:2,
      // เดือนไม่ครบ (จุดกลวงในกราฟเดิม) ยังกลวงเหมือนเดิม
      backgroundColor:Array.isArray(d.pointBackgroundColor)?keep.map(i=>d.pointBackgroundColor[i]):d.borderColor,
      pointStyle:['circle','rect','triangle'][si%3],pointRadius:6,pointHoverRadius:8};
  });
  const range={id:'ctRange',beforeDatasetsDraw(ch){
    const{ctx}=ch,ys=ch.scales.y,xs=ch.scales.x;ctx.save();ctx.strokeStyle=ctLight()?'rgba(20,30,60,.18)':'rgba(255,255,255,.16)';ctx.lineWidth=4;ctx.lineCap='round';
    labels.forEach((_,i)=>{const v=src.map(d=>d.data[i]).filter(v=>v!=null);if(v.length<2)return;const y=ys.getPixelForValue(i);
      ctx.beginPath();ctx.moveTo(xs.getPixelForValue(Math.min(...v)),y);ctx.lineTo(xs.getPixelForValue(Math.max(...v)),y);ctx.stroke();});
    ctx.restore();}};
  return {type:'scatter',data:{datasets:sets},options:{...ctBase(),
    plugins:{legend:ctLegend(),tooltip:{callbacks:{title:t=>labels[t[0].raw.y],label:t=>` ${t.dataset.label} ${fmtN(t.raw.x,1)}`}}},
    scales:{x:ctAxis(xTitle,{type:'linear'}),y:ctRowAxis(labels)}},plugins:[range]};
}

/* ── ตัวแปลงแต่ละกราฟ: (config เดิม, ข้อมูลเพิ่มจาก view) → config ใหม่ · คืน null = ใช้แบบเดิม ── */
const CT_ALT={
  // ราย × ล็อก — 1 จุด = 1 วัน · กดจุดเปิดกล่องรายละเอียดวันเหมือนกราฟเดิม
  cMain:{scatter(cfg,{rows=[]}){
    const ds=cfg.data.datasets,rai=ds[0].data,lock=ds[1].data,lbl=cfg.data.labels;
    const pts=rai.map((x,i)=>({x,y:lock[i],i})).filter(p=>p.x>0||p.y>0);
    if(pts.length<2) return null;
    const n=pts.length,mx=pts.reduce((a,p)=>a+p.x,0)/n,my=pts.reduce((a,p)=>a+p.y,0)/n;
    let sxy=0,sxx=0;pts.forEach(p=>{sxy+=(p.x-mx)*(p.y-my);sxx+=(p.x-mx)**2;});
    const b=sxx?sxy/sxx:0,a=my-b*mx,x0=Math.min(...pts.map(p=>p.x)),x1=Math.max(...pts.map(p=>p.x));
    const rain=p=>!!rows[p.i]?.freeDay;
    const sets=[
      {label:'วันปกติ',data:pts.filter(p=>!rain(p)),backgroundColor:'rgba(61,214,140,.75)',borderColor:ctSurf(),borderWidth:1,pointRadius:4.5,pointHoverRadius:7},
      {label:'วันฝน',data:pts.filter(rain),backgroundColor:'rgba(240,165,0,.85)',borderColor:ctSurf(),borderWidth:1,pointRadius:5.5,pointHoverRadius:8,pointStyle:'triangle'},
      {label:`แนวโน้ม ≈ ${b.toFixed(2)} ล็อก/ราย`,data:[{x:x0,y:a+b*x0},{x:x1,y:a+b*x1}],showLine:true,borderColor:'rgba(154,163,188,.8)',borderDash:[6,4],borderWidth:1.5,pointRadius:0,pointHoverRadius:0,pointStyle:'line',ctRef:true},
    ];
    if(ds[2]) sets.push({label:ds[2].label,data:[{x:x0,y:ds[2].data[0]},{x:x1,y:ds[2].data[0]}],showLine:true,borderColor:ds[2].borderColor,borderDash:[6,3],borderWidth:1.5,pointRadius:0,pointHoverRadius:0,pointStyle:'line',ctRef:true});
    return {type:'scatter',data:{datasets:sets},options:{...ctBase(),
      onClick:(ev,els,chart)=>{
        const e=els.find(e=>!chart.data.datasets[e.datasetIndex].ctRef);
        const p=e&&chart.data.datasets[e.datasetIndex].data[e.index];
        if(p) openDayModal(p.i);
      },
      plugins:{legend:ctLegend(),tooltip:{filter:t=>!t.dataset.ctRef,callbacks:{
        title:t=>{const i=t[0].raw.i,r=rows[i];return `${lbl[i]}${r?` (${DAYS[new Date(r.date).getDay()]})`:''}`;},
        label:t=>` ${fmtN(t.raw.x)} ราย · ${fmtN(t.raw.y)} ล็อก (${t.raw.x?(t.raw.y/t.raw.x).toFixed(2):'—'} ล็อก/ราย)`,
        footer:()=>'กดเพื่อดูรายละเอียดวัน'}}},
      scales:{x:ctAxis('จำนวนราย / วัน',{type:'linear'}),y:ctAxis('จำนวนล็อก / วัน')}}};
  }},

  // ขายได้จากไหน แล้วมาขายจริงเท่าไหร่ — รวมทั้งช่วงที่เลือก
  // ไม่มา/ลา จ่ายเงินแล้ว (วันปกติไม่คืนเงิน) จึงไม่ใช่ขั้น "หัก": ป้ายไม่มีเครื่องหมายลบ + แท่งจางเส้นประ
  // แท่ง "ล็อกที่ขายได้" = การ์ด จำนวนล็อก (getLock('all') ไม่หักยกเลิก/ลา)
  cMonthly:{waterfall(cfg){
    const sum=lbl=>{const d=cfg.data.datasets.find(x=>x.label===lbl);return d?d.data.reduce((a,b)=>a+(b||0),0):0;};
    const o=sum('ออนไลน์สุทธิ'),w=sum('วอคอิน ST'),n=sum('Non'),e=sum('เสริม'),c=sum('ยกเลิก/ลา');
    const sold=o+c+w+n+e,present=o+w+n+e;
    if(!sold) return null;
    // [ป้าย, ค่า, สี, ชนิด] add = บวกต่อ · total = แท่งเต็มจาก 0 · noshow = ช่วงจากมาขายจริงถึงขายได้
    const steps=[['ออนไลน์ที่จอง',o+c,'rgba(74,158,255,.85)','add'],['วอคอิน ST',w,'rgba(240,165,0,.85)','add'],['Non',n,'rgba(167,139,250,.85)','add'],
      ['เสริม',e,'rgba(61,214,140,.8)','add'],['ล็อกที่ขายได้',sold,'rgba(154,163,188,.8)','total'],['ไม่มา/ลา',c,'rgba(154,163,188,.22)','noshow'],['มาขายจริง',present,'rgba(154,163,188,.8)','total']];
    let run=0;
    const bars=steps.map(([,v,,k])=>{if(k==='total')return [0,v];if(k==='noshow')return [present,sold];const a=run;run+=v;return [a,run];});
    const joinY=i=>steps[i][3]==='noshow'?present:bars[i][1];
    const lab={id:'ctWaterfall',afterDatasetsDraw(ch){
      const{ctx}=ch,m=ch.getDatasetMeta(0).data,ys=ch.scales.y;ctx.save();
      ctx.strokeStyle=chartClr().tick;ctx.lineWidth=1;ctx.setLineDash([3,3]);
      for(let i=0;i<m.length-1;i++){const y=ys.getPixelForValue(joinY(i));ctx.beginPath();ctx.moveTo(m[i].x+m[i].width/2,y);ctx.lineTo(m[i+1].x-m[i+1].width/2,y);ctx.stroke();}
      ctx.setLineDash([]);ctx.textAlign='center';ctx.font='600 11px JetBrains Mono';ctx.fillStyle=chartClr().lbl;
      m.forEach((b,i)=>ctx.fillText((steps[i][3]==='add'&&i>0?'+':'')+fmtN(steps[i][1]),b.x,ys.getPixelForValue(Math.max(...bars[i]))-8));
      ctx.restore();}};
    return {data:{labels:steps.map(s=>s[0]),datasets:[{type:'bar',label:'ล็อก',data:bars,backgroundColor:steps.map(s=>s[2]),
        borderColor:steps.map(s=>s[3]==='noshow'?'rgba(154,163,188,.9)':'transparent'),borderWidth:steps.map(s=>s[3]==='noshow'?1.5:0),
        borderRadius:3,borderSkipped:false,barPercentage:.7}]},
      options:{...ctBase(),layout:{padding:{top:22}},plugins:{legend:{display:false},tooltip:{callbacks:{label:t=>{
          const [,v,,k]=steps[t.dataIndex];
          if(k==='noshow') return [` ไม่มา/ลา ${fmtN(c)} ล็อก (${(c/sold*100).toFixed(1)}% ของที่ขายได้)`,' จ่ายเงินแล้ว — ยังเป็นรายได้'];
          if(t.dataIndex===4) return ` ขายได้ ${fmtN(sold)} ล็อก (ตรงกับการ์ด จำนวนล็อก)`;
          if(k==='total') return ` มีคนมาขายจริง ${fmtN(present)} ล็อก`;
          return ` ${t.dataIndex?'+':''}${fmtN(v)} ล็อก`+(t.dataIndex===0?` (รวมไม่มา/ลา ${fmtN(c)})`:'');}}}},
        scales:{x:{grid:{display:false},ticks:{color:chartClr().lbl,font:{family:'Noto Sans Thai',size:10},maxRotation:0,autoSkip:false}},
          y:ctAxis('ล็อก (รวมทั้งช่วง)',{beginAtZero:true,suggestedMax:sold*1.08})}},
      plugins:[lab]};
  }},

  cWeekday:{
    // จุดทุกวัน — แถว = วันในสัปดาห์ · ขีดตั้ง = ค่าเฉลี่ย (ตัวเลขเดียวกับแท่งเดิม)
    dot(cfg,{rows=[]}){
      if(!rows.length) return null;
      const labels=cfg.data.labels,avg=cfg.data.datasets[0].data,wk=i=>[0,5,6].includes(i);
      const pts=rain=>rows.map((r,k)=>({r,k})).filter(o=>o.r.rain===rain).map(({r,k})=>({x:r.v,y:r.dow+ctJit(k)*0.5,r}));
      const norm=pts(false);
      const sets=[
        {label:'วันปกติ',data:norm,backgroundColor:norm.map(p=>wk(p.r.dow)?'rgba(240,165,0,.6)':'rgba(74,158,255,.6)'),borderWidth:0,pointRadius:3.2,pointHoverRadius:6},
        {label:'วันฝน',data:pts(true),backgroundColor:'rgba(224,92,92,.85)',pointStyle:'triangle',borderWidth:0,pointRadius:4.2,pointHoverRadius:7},
        {label:'ค่าเฉลี่ย',data:avg.map((v,i)=>({x:v,y:i})),pointStyle:'line',rotation:90,pointRadius:11,pointHoverRadius:13,borderWidth:3,borderColor:ctInk(),ctAvg:true},
      ];
      return {type:'scatter',data:{datasets:sets},options:{...ctBase(),
        plugins:{legend:ctLegend(),tooltip:{callbacks:{
          title:t=>t[0].dataset.ctAvg?labels[t[0].raw.y]:`${labels[t[0].raw.r.dow]} ${fmtD(t[0].raw.r.date)}`,
          label:t=>t.dataset.ctAvg?` เฉลี่ย ${fmtN(t.raw.x,1)} ล็อก`:` ${fmtN(t.raw.x)} ล็อก${t.raw.r.rain?' · วันฝน':''}`}}},
        scales:{x:ctAxis('ล็อก / วัน',{type:'linear'}),y:ctRowAxis(labels)}}};
    },
    // Box plot — กล่อง = ครึ่งกลางของวัน (Q1–Q3) · ขีดในกล่อง = มัธยฐาน · หนวด = ช่วงปกติ (1.5×IQR) · จุด = วันหลุดช่วง (แดง = วันฝน)
    box(cfg,{rows=[]}){
      const labels=cfg.data.labels,wk=i=>[0,5,6].includes(i);
      const st=labels.map((_,dow)=>{
        const v=rows.filter(r=>r.dow===dow).map(r=>r.v).sort((a,b)=>a-b);
        if(!v.length) return null;
        const q1=ctQ(v,.25),q3=ctQ(v,.75),lo=q1-1.5*(q3-q1),hi=q3+1.5*(q3-q1),inR=v.filter(x=>x>=lo&&x<=hi);
        return {n:v.length,min:v[0],max:v[v.length-1],q1,q3,med:ctQ(v,.5),mean:v.reduce((a,b)=>a+b,0)/v.length,
          wLo:Math.min(...inR),wHi:Math.max(...inR),out:rows.filter(r=>r.dow===dow&&(r.v<lo||r.v>hi))};
      });
      const all=st.filter(Boolean);
      if(!all.length) return null;
      const whisk={id:'ctBox',afterDatasetsDraw(ch){
        const{ctx}=ch,Y=v=>ch.scales.y.getPixelForValue(v);ctx.save();
        ch.getDatasetMeta(0).data.forEach((b,i)=>{
          const s=st[i];if(!s)return;const w=b.width,x=b.x;
          ctx.strokeStyle=chartClr().lbl;ctx.lineWidth=1.5;ctx.beginPath();
          ctx.moveTo(x,Y(s.q3));ctx.lineTo(x,Y(s.wHi));ctx.moveTo(x-w*.25,Y(s.wHi));ctx.lineTo(x+w*.25,Y(s.wHi));
          ctx.moveTo(x,Y(s.q1));ctx.lineTo(x,Y(s.wLo));ctx.moveTo(x-w*.25,Y(s.wLo));ctx.lineTo(x+w*.25,Y(s.wLo));ctx.stroke();
          ctx.strokeStyle=ctInk();ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(x-w/2,Y(s.med));ctx.lineTo(x+w/2,Y(s.med));ctx.stroke();
          s.out.forEach(r=>{ctx.beginPath();ctx.fillStyle=r.rain?'rgba(224,92,92,.9)':chartClr().lbl;ctx.arc(x,Y(r.v),3,0,Math.PI*2);ctx.fill();});
        });ctx.restore();}};
      const yMin=Math.min(...all.map(s=>s.min)),yMax=Math.max(...all.map(s=>s.max)),pad=Math.max(10,(yMax-yMin)*.08);
      const step=yMax>500?100:10; // ปัดขอบแกนเป็นเลขกลม (เดิมขึ้น 2,144 / 398)
      return {data:{labels,datasets:[{type:'bar',label:'ครึ่งกลางของวัน (Q1–Q3)',data:st.map(s=>s?[s.q1,s.q3]:null),
          backgroundColor:labels.map((_,i)=>wk(i)?'rgba(240,165,0,.35)':'rgba(74,158,255,.35)'),
          borderColor:labels.map((_,i)=>wk(i)?'rgba(240,165,0,1)':'rgba(74,158,255,1)'),borderWidth:1.5,borderSkipped:false,borderRadius:3,barPercentage:.55}]},
        options:{...ctBase(),plugins:{legend:{display:false},tooltip:{callbacks:{
            title:t=>`${labels[t[0].dataIndex]} · ${st[t[0].dataIndex].n} วัน`,
            label:t=>{const s=st[t.dataIndex];return [` สูงสุด ${fmtN(s.max)}`,` ช่วงบน (Q3) ${fmtN(Math.round(s.q3))}`,` มัธยฐาน ${fmtN(Math.round(s.med))}`,
              ` ช่วงล่าง (Q1) ${fmtN(Math.round(s.q1))}`,` ต่ำสุด ${fmtN(s.min)}`,` เฉลี่ย ${fmtN(s.mean,1)}`,
              ...(s.out.length?[` หลุดช่วงปกติ ${s.out.length} วัน${s.out.some(r=>r.rain)?' (จุดแดง = วันฝน)':''}`]:[])];}}}},
          scales:{x:{grid:{display:false},ticks:{color:chartClr().lbl,font:{family:'Noto Sans Thai',size:11}}},
            y:ctAxis('ล็อก / วัน',{min:Math.max(0,Math.floor((yMin-pad)/step)*step),max:Math.ceil((yMax+pad)/step)*step})}},
        plugins:[whisk]};
    },
  },

  // แท่งแนวนอนเรียงมากไปน้อย + % ท้ายแท่ง
  // ไม่ใส่ type ระดับบน → makeChart ไม่ใส่ animation แท่งโตจากล่าง (ผิดทิศกับแท่งแนวนอน)
  cPie:{hbar(cfg){
    const ds=cfg.data.datasets[0],tot=ds.data.reduce((a,b)=>a+b,0);
    if(!tot) return null;
    const o=cfg.data.labels.map((l,i)=>({l,v:ds.data[i],c:ds.backgroundColor[i]})).sort((a,b)=>b.v-a.v);
    const pct={id:'ctPct',afterDatasetsDraw(ch){const{ctx}=ch;ctx.save();ctx.font='600 11px JetBrains Mono';ctx.fillStyle=chartClr().lbl;ctx.textBaseline='middle';ctx.textAlign='left';
      ch.getDatasetMeta(0).data.forEach((b,i)=>ctx.fillText(`${(o[i].v/tot*100).toFixed(1)}%`,b.x+6,b.y));ctx.restore();}};
    return {data:{labels:o.map(x=>x.l),datasets:[{type:'bar',data:o.map(x=>x.v),backgroundColor:o.map(x=>x.c),borderRadius:4,barPercentage:.7}]},
      options:{...ctBase(),indexAxis:'y',layout:{padding:{right:48}},
        plugins:{legend:{display:false},tooltip:{callbacks:{label:t=>` ${fmtN(t.raw)} ล็อก (${(t.raw/tot*100).toFixed(1)}%)`}}},
        scales:{x:ctAxis('',{beginAtZero:true}),y:{grid:{display:false},ticks:{color:chartClr().lbl,font:{family:'Noto Sans Thai',size:10}}}}},
      plugins:[pct]};
  }},

  // เป้ารายเดือน = เป้า/วัน × จำนวนวันที่มีข้อมูล (นับแบบเดียวกับการ์ด Month-over-Month)
  // เดือนที่ยังไม่จบจึงไม่ดูเหมือนพลาดเป้า · ไม่มีเป้าเมื่อเลือกกลุ่มย่อย (เป้าตั้งไว้กับยอดรวม)
  cMonthTotal:{
    dot(cfg,ctx){
      const labels=cfg.data.labels,val=cfg.data.datasets[0].data,col=cfg.data.datasets[0].backgroundColor;
      const {tgts,note}=ctMonthTargets(labels.length,ctx);
      const sets=[{label:'ล็อกรวม',data:val.map((v,i)=>({x:v,y:i})),backgroundColor:col,borderColor:ctSurf(),borderWidth:1.5,pointRadius:8,pointHoverRadius:10}];
      if(tgts) sets.push({label:`เป้า (${fmtN(targetLock)} ล็อก/วัน × วันที่มีข้อมูล)`,data:tgts.map((v,i)=>({x:v,y:i})),pointStyle:'line',rotation:90,pointRadius:12,borderWidth:3,
        borderColor:'rgba(167,139,250,.95)',backgroundColor:'rgba(167,139,250,.95)',ctTgt:true});
      const link={id:'ctLink',
        beforeDatasetsDraw(ch){if(!tgts)return;const{ctx:c}=ch,a=ch.getDatasetMeta(0).data,t=ch.getDatasetMeta(1).data;c.save();c.lineWidth=3;c.lineCap='round';
          a.forEach((p,i)=>{c.strokeStyle=val[i]>=tgts[i]?'rgba(61,214,140,.55)':'rgba(224,92,92,.55)';c.beginPath();c.moveTo(p.x,p.y);c.lineTo(t[i].x,t[i].y);c.stroke();});c.restore();},
        afterDatasetsDraw(ch){const{ctx:c}=ch,a=ch.getDatasetMeta(0).data;c.save();c.textBaseline='middle';c.textAlign='left';
          a.forEach((p,i)=>{const x=Math.max(p.x,tgts?ch.getDatasetMeta(1).data[i].x:0)+14;
            c.font='600 12px JetBrains Mono';c.fillStyle=chartClr().lbl;c.fillText(fmtN(val[i])+(tgts?'  '+ctPct(val[i],tgts[i]):''),x,p.y);
            if(note[i]){c.font='400 10px Noto Sans Thai';c.fillStyle=chartClr().tick;c.fillText(note[i],x,p.y+14);}});c.restore();}};
      const xs=[...val,...(tgts||[])];
      return {type:'scatter',data:{datasets:sets},options:{...ctBase(),
        plugins:{legend:ctLegend(),tooltip:{callbacks:{title:t=>labels[t[0].raw.y],
          label:t=>t.dataset.ctTgt?` เป้า ${fmtN(t.raw.x)} ล็อก`:` จริง ${fmtN(t.raw.x)} ล็อก${tgts?` (${ctPct(t.raw.x,tgts[t.raw.y])} ของเป้า)`:''}`}}},
        scales:{x:ctAxis('ล็อกรวม',{type:'linear',min:Math.floor(Math.min(...xs)*.85/100)*100,max:Math.ceil(Math.max(...xs)*1.22/100)*100}),y:ctRowAxis(labels)}},plugins:[link]};
    },
    bullet(cfg,ctx){
      const labels=cfg.data.labels,{tgts,note}=ctMonthTargets(labels.length,ctx);
      return ctBullet({labels,vals:cfg.data.datasets[0].data,colors:cfg.data.datasets[0].backgroundColor,tgts,unit:'รวม',note});
    },
  },

  // สะสมตั้งแต่วันที่ 1 — เดือนที่ยังไม่จบหยุดที่วันล่าสุดที่มีข้อมูล วันที่ไม่มีข้อมูลกลางเดือนนับเป็น 0
  cCompare:{cum(cfg){
    const cum=arr=>{let last=-1;arr.forEach((v,i)=>{if(v!=null)last=i;});let s=0;return arr.map((v,i)=>i>last?null:(s+=v||0));};
    const o=cfg.options||{};
    return {...cfg,data:{...cfg.data,datasets:cfg.data.datasets.map(d=>({...d,data:cum(d.data)}))},
      options:{...o,plugins:{...o.plugins,tooltip:{callbacks:{label:t=>` ${t.dataset.label}: สะสม ${fmtN(t.raw)} ล็อก`}}},
        scales:{...o.scales,y:{...o.scales?.y,beginAtZero:true,title:{display:true,text:'ล็อกสะสม',color:chartClr().lbl,font:{size:10}}}}}};
  }},

  // เฉลี่ย/วัน เทียบเป้า/วัน — เป้าเป็นของ สาขา × โซน ที่เลือกอยู่ (กราฟนี้ใช้ยอดรวมเสมอ)
  cAvg:{bullet(cfg){
    const vals=cfg.data.datasets[0].data;
    return ctBullet({labels:cfg.data.labels,vals,colors:'rgba(61,214,140,.75)',tgts:vals.map(()=>targetLock),unit:'วัน'});
  }},

  cBmAvg:{dot:cfg=>ctDotFromLines(cfg,'ล็อกเฉลี่ย / วัน')},
  cBmMonth:{dot:cfg=>ctDotFromLines(cfg,'ล็อกรวม / เดือน')},

  // ดัชนี — แต่ละสาขาหารด้วยค่าเฉลี่ยของตัวเองในช่วงนี้ × 100 · สาขาเล็กกับใหญ่จึงเทียบ "จังหวะ" ขึ้นลงกันได้
  cBmDaily:{index(cfg){
    const raw=cfg.data.datasets.map(d=>d.data);
    const sets=cfg.data.datasets.map((d,i)=>{
      const v=raw[i].filter(x=>x!=null&&x>0),avg=v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
      return {...d,data:raw[i].map(x=>x==null||!avg?null:+(x/avg*100).toFixed(1)),ctAvg:avg};
    });
    const ref={id:'ctRef100',beforeDatasetsDraw(ch){const{ctx}=ch,y=ch.scales.y.getPixelForValue(100),{left,right}=ch.chartArea;
      ctx.save();ctx.strokeStyle=chartClr().lbl;ctx.globalAlpha=.6;ctx.setLineDash([5,4]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.restore();}};
    const o=cfg.options||{};
    return {...cfg,data:{...cfg.data,datasets:sets},
      options:{...o,plugins:{...o.plugins,tooltip:{callbacks:{label:t=>{const r=raw[t.datasetIndex][t.dataIndex];
          return ` ${t.dataset.label}: ${t.raw} (${fmtN(r)} ล็อก · เฉลี่ย ${fmtN(t.dataset.ctAvg,0)})`;}}}},
        scales:{...o.scales,y:{...o.scales?.y,title:{display:true,text:'ดัชนี (เฉลี่ยของสาขา = 100)',color:chartClr().lbl,font:{size:10}}}}},
      plugins:[...(cfg.plugins||[]),ref]};
  }},
};

// เป้าต่อเดือนของหน้าเปรียบเทียบ — view ส่ง mks/days มาทาง config._ct
function ctMonthTargets(n,{mks=[],days=[]}){
  const cur=mKey(new Date());
  const note=mks.map(k=>k===cur?'(ยังไม่จบเดือน)':'');
  const ok=group==='all'&&mks.length===n&&days.length===n;
  return {tgts:ok?days.map(d=>Math.round(targetLock*(d||1))):null,note};
}

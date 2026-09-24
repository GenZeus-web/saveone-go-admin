// ============================================================
// charts.js — แกนกลางกราฟ: plugin วาดเส้น, สีตามธีม, options, สร้าง/ทำลายกราฟ     [เดิม 3419-3516]
// ============================================================
// Plugin วาดเส้นจากซ้ายไปขวา เหมือน progress bar
// CHT-04: ตัดขอบ (clip) เฉพาะตอนวาด "ข้อมูล" เท่านั้น — เดิมใช้ beforeDraw/afterDraw ซึ่งตัดทั้งกราฟ
//   แกน X/Y + legend อยู่นอก chartArea เลยถูกตัดทิ้ง และเฟรมสุดท้ายไม่ได้วาดใหม่
//   → แกนหายค้าง จนกว่าจะเอาเมาส์ไปชี้ (tooltip สั่งวาดใหม่ให้พอดี)
const revealPlugin={
  id:'reveal',
  beforeDatasetsDraw(chart){
    if(chart._revealProgress===undefined) return;
    const{ctx,chartArea:{left,top,right,bottom}}=chart;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left,top,(right-left)*chart._revealProgress,bottom-top+2);
    ctx.clip();
  },
  afterDatasetsDraw(chart){
    if(chart._revealProgress!==undefined) chart.ctx.restore();
  }
};
Chart.register(revealPlugin);

function animateChartReveal(chart,duration=1200){
  if(!chart) return;
  chart._revealProgress=0;
  const start=performance.now();
  function step(now){
    // กราฟถูก destroy ไปแล้ว (Chart.js เคลียร์ ctx/canvas เป็น null) หรือ canvas หลุด DOM
    // เช่นโดน innerHTML เขียนทับ → หยุดเงียบๆ ไม่ต้องวาดต่อ
    if(!chart.ctx||!chart.canvas||!chart.canvas.isConnected){chart._revealRAF=null;return;}
    const t=Math.min((now-start)/duration,1);
    const ease=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2; // easeInOutQuad
    chart._revealProgress=ease;
    chart.draw();
    if(t<1) chart._revealRAF=requestAnimationFrame(step);
    else{chart._revealProgress=undefined;chart._revealRAF=null;chart.draw();} // CHT-04: วาดเฟรมสุดท้ายแบบไม่ตัดขอบ
  }
  chart._revealRAF=requestAnimationFrame(step);
}

// สีของกราฟ (tick/legend/เส้นกริด) ปรับตามธีม — โหมดสว่างจะไม่จมหาย
function chartClr(){
  return document.body.classList.contains('light-mode')
    ? {tick:'#5a6486', lbl:'#3a4260', grid:'rgba(20,30,60,.12)'}
    : {tick:'#5c6480', lbl:'#9aa3bc', grid:'rgba(255,255,255,.04)'};
}

/* ── v2.11.3 CHT-03: สี "เส้นข้อมูล" ปรับตามธีมด้วย ──
   v2.5.4 แก้ tick/กริด/legend ให้ตามธีมแล้ว แต่ลืมสีเส้นข้อมูล
   ผลคือโหมดสว่าง เส้นทั้ง 3 สาขาคอนทราสต์กับพื้น #f5f6fa แค่ 1.74–2.55
   (เกณฑ์อ่านออกคือ >= 3.0) → เส้นจมหายไปกับพื้น

   ตารางล่างจับคู่ "สีโหมดมืด → สีโหมดสว่าง" ที่เฉดเดียวกันแต่เข้มพอ
   ทุกค่าผ่านเครื่องตรวจ palette แล้ว: ความสว่างอยู่ในแถบ · อิ่มสีพอ ·
   คอนทราสต์ >= 3:1 ทุกสี · แยกออกด้วยตาปกติทุกคู่ที่อยู่ติดกัน
   (255,200,60 เหลือง ไม่มีคู่เข้มที่แยกจากทองได้ จึงย้ายไปโทนบานเย็นแทน) */
const SERIES_LIGHT={
  '240,165,0'  :'161,98,7',    // ทอง   → อำพันเข้ม
  '74,158,255' :'29,78,216',   // ฟ้า   → น้ำเงิน
  '61,214,140' :'21,128,61',   // เขียว → เขียวเข้ม
  '224,92,92'  :'185,28,28',   // แดง
  '167,139,250':'126,34,206',  // ม่วง
  '240,122,53' :'194,65,12',   // ส้ม
  '255,200,60' :'190,24,93',   // เหลือง → บานเย็น (เหลืองเข้มแยกจากทองไม่ออก)
  '100,200,180':'8,145,178',   // เขียวอมฟ้าเดิม (อิ่มสีต่ำ อ่านเป็นเทา — เลิกใช้แล้ว)
  '45,212,191' :'8,145,178'    // เขียวอมฟ้าตัวใหม่ที่ใช้แทน
};
// แปลงสตริงสีเดียว — ใช้ได้ทั้งกับ config กราฟและสีใน HTML ที่ประกอบเอง
function sc(color){
  if(typeof color!=='string'||!document.body.classList.contains('light-mode')) return color;
  return color.replace(/(rgba?\()(\d+),\s*(\d+),\s*(\d+)/g,(m,head,r,g,b)=>{
    const hit=SERIES_LIGHT[`${r},${g},${b}`];
    return hit ? head+hit : m;
  });
}
// เดินทั้ง config กราฟแล้วแปลงทุกสตริงสี — ทำที่นี่จุดเดียว ไฟล์ views ไม่ต้องแก้
// ข้ามฟังก์ชันไว้ (เช่น animation.y.from เป็น callback ห้ามแตะ)
function scDeep(v){
  if(typeof v==='string') return sc(v);
  if(Array.isArray(v)) return v.map(scDeep);
  if(v&&typeof v==='object'&&!(v instanceof Date)){
    const o={}; for(const k in v) o[k]=scDeep(v[k]); return o;
  }
  return v;
}
function cOpts(){
  return{responsive:true,maintainAspectRatio:false,
    animation:false, // ปิด animation ของ Chart.js ใช้ plugin แทน
    plugins:{legend:{labels:{color:chartClr().lbl,font:{family:'Noto Sans Thai',size:11}}}},
    scales:{x:{ticks:{color:chartClr().tick,font:{family:'Noto Sans Thai',size:10},maxTicksLimit:12,maxRotation:0},grid:{color:chartClr().grid}},y:{ticks:{color:chartClr().tick,font:{family:'JetBrains Mono',size:10}},grid:{color:chartClr().grid}}}
  };
}
// v2.6.2 CHT-01: destroy อาจ throw ถ้า canvas หลุด DOM ไปแล้ว → ห่อ try/catch ไม่ให้ล้มทั้งการ render
function dChart(id){
  if(charts[id]){
    // v2.11.2 CHT-02: ยกเลิก rAF ของ reveal ก่อน destroy
    // ไม่งั้น callback ที่จองคิวไว้จะตื่นมาเรียก chart.draw() กับกราฟที่ถูกทำลายแล้ว
    // → โยน error ทุกครั้งที่เปลี่ยนตัวกรองระหว่างกราฟยัง animate ไม่จบ (1.2 วิ)
    if(charts[id]._revealRAF) cancelAnimationFrame(charts[id]._revealRAF);
    try{charts[id].destroy();}catch(e){console.warn('dChart: destroy #'+id+' ไม่ได้',e.message);}
    delete charts[id];
  }
}
function makeChart(id,config){
  dChart(id);
  // กัน crash: ถ้าหา canvas ไม่เจอ (tab/section ยังไม่ขึ้น DOM) ให้ข้ามการวาด ไม่ไป new Chart กับ null
  const el=document.getElementById(id);
  if(!el){console.warn('makeChart: ไม่พบ canvas #'+id+' — ข้ามการวาด');return null;}
  // v2.6.2 CHT-01: guard เดิมเช็คแค่ "มี element ไหม" ยังไม่พอ — ตอนข้อมูลว่าง 0 แถว
  // element อาจไม่ใช่ <canvas> หรือหลุด DOM แล้ว → Chart.js เรียก getContext กับ null
  if(typeof el.getContext!=='function'||!el.isConnected){
    console.warn('makeChart: #'+id+' ไม่ใช่ canvas ที่ใช้ได้ (หลุด DOM?) — ข้ามการวาด');return null;
  }
  // ตรวจว่าเป็น bar หรือ line
  const hasLine=config.data?.datasets?.some(d=>d.type==='line'||config.type==='line');
  const hasBar=config.data?.datasets?.some(d=>d.type==='bar'||config.type==='bar');
  const isLineOnly=config.type==='line'||(hasLine&&!hasBar);
  const isBarOnly=config.type==='bar';
  const isMixed=hasLine&&hasBar;

  if(isBarOnly){
    // กราฟแท่ง — โตจากล่างขึ้นบน
    config.options=config.options||{};
    config.options.animation={duration:900,easing:'easeOutQuart',
      y:{from:(ctx)=>ctx.chart.chartArea?.bottom||0}
    };
  } else if(isLineOnly){
    // กราฟเส้น — reveal จากซ้ายไปขวา
    config.options=config.options||{};
    config.options.animation=false;
  }
  // Mixed (แท่ง+เส้น) — ใช้ reveal

  // v2.11.3 CHT-03: แปลงสีตามธีมก่อนวาด — โหมดมืดคืนค่าเดิมทุกตัว ไม่มีอะไรเปลี่ยน
  // toggleTheme() เรียก applyAll() อยู่แล้ว กราฟจึงถูกสร้างใหม่และเปลี่ยนสีเองตอนสลับธีม
  config=scDeep(config);

  // v2.6.2 CHT-01: ถ้ากราฟตัวใดตัวหนึ่งพัง ต้องไม่ทำให้ทั้งหน้าหยุด render
  try{
    charts[id]=new Chart(el,config);
  }catch(e){
    console.error('makeChart: วาด #'+id+' ไม่สำเร็จ —',e.message);
    delete charts[id];
    return null;
  }

  // กราฟเส้นหรือ mixed ใช้ reveal plugin
  if(isLineOnly||isMixed) animateChartReveal(charts[id],1200);
  return charts[id];
}

// loadAll() ถูกเรียกจาก onAuthStateChanged หลัง login สำเร็จแล้ว


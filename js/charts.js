// ============================================================
// charts.js — แกนกลางกราฟ: plugin วาดเส้น, สีตามธีม, options, สร้าง/ทำลายกราฟ     [เดิม 3419-3516]
// ============================================================
// Plugin วาดเส้นจากซ้ายไปขวา เหมือน progress bar
const revealPlugin={
  id:'reveal',
  beforeDraw(chart){
    if(chart._revealProgress===undefined) return;
    const{ctx,chartArea:{left,top,right,bottom}}=chart;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left,top,(right-left)*chart._revealProgress,bottom-top+2);
    ctx.clip();
  },
  afterDraw(chart){
    if(chart._revealProgress!==undefined) chart.ctx.restore();
  }
};
Chart.register(revealPlugin);

function animateChartReveal(chart,duration=1200){
  if(!chart) return;
  chart._revealProgress=0;
  const start=performance.now();
  function step(now){
    const t=Math.min((now-start)/duration,1);
    const ease=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2; // easeInOutQuad
    chart._revealProgress=ease;
    chart.draw();
    if(t<1) requestAnimationFrame(step);
    else chart._revealProgress=undefined;
  }
  requestAnimationFrame(step);
}

// สีของกราฟ (tick/legend/เส้นกริด) ปรับตามธีม — โหมดสว่างจะไม่จมหาย
function chartClr(){
  return document.body.classList.contains('light-mode')
    ? {tick:'#5a6486', lbl:'#3a4260', grid:'rgba(20,30,60,.12)'}
    : {tick:'#5c6480', lbl:'#9aa3bc', grid:'rgba(255,255,255,.04)'};
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


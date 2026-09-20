// ============================================================
// views/heatmap.js — ปฏิทินล็อก (heatmap)                                          [เดิม 3629-3709]
// ============================================================
// ── HEATMAP ──
function renderHeatmap(){
  const wrap=document.getElementById('hmWrap');
  if(!wrap) return;
  
  // ใช้ข้อมูลทั้งหมดของสาขาที่เลือก ไม่ filter ช่วงเวลา
  const allData=getActiveMerged();
  if(!allData||!allData.length){
    wrap.innerHTML='<div style="color:var(--ink3);padding:20px;text-align:center">ไม่มีข้อมูล</div>';
    return;
  }
  
  let allMks=[...new Set(allData.map(r=>mKey(r.date)))].sort();
  const nMonths=parseInt(document.getElementById('hmMonths')?.value??'3');
  if(nMonths>0) allMks=allMks.slice(-nMonths);
  // v2.10.3 ENH-07: สีเทียบกับ "เป้า" (currentTarget) แทนการไล่ตาม max ของชุดข้อมูลเอง
  //   ของเดิม: วันที่ล็อกเยอะสุดในชุดข้อมูลได้สีเข้มสุดเสมอ ต่อให้ทั้งเดือนต่ำกว่าเป้าหมดก็ไม่รู้จากสี
  //   ใหม่: ถึงเป้า/เกินเป้า = โทนเขียว (ไล่เข้มตามที่เกิน) · ต่ำกว่าเป้า = โทนส้ม/แดง (ไล่ตามที่ขาด)
  //   ไม่มีเป้าตั้งไว้ (tgt<=0) → ตกกลับพฤติกรรมเดิม (เทียบ maxLock) กันจอว่าง/สีจืดทั้งกระดาน
  const hmTgt=currentTarget();
  const maxLock=Math.max(...allData.map(r=>getLock(r,group)),1);

  let html='';
  allMks.forEach(mk=>{
    const[y,m]=mk.split('-');
    const yr=parseInt(y), mo=parseInt(m);
    const label=mLbl(new Date(yr,mo-1,1));
    const daysInMonth=new Date(yr,mo,0).getDate();
    const firstDay=new Date(yr,mo-1,1).getDay();
    
    const dayMap={};
    allData.filter(r=>mKey(r.date)===mk).forEach(r=>{
      dayMap[r.date.getDate()]={lock:getLock(r,group),free:r.freeDay};
    });
    
    html+=`<div class="hm-month"><div class="hm-month-lbl">${label}</div><div class="hm-grid">`;
    ['อา','จ','อ','พ','พฤ','ศ','ส'].forEach(d=>html+=`<div class="hm-day-lbl">${d}</div>`);
    for(let i=0;i<firstDay;i++) html+='<div class="hm-empty"></div>';
    for(let d=1;d<=daysInMonth;d++){
      const info=dayMap[d];
      let bg,title;
      if(!info){
        bg='background:var(--surface3)';
        title='ไม่มีข้อมูล';
      } else if(info.free){
        bg='background:rgba(61,214,140,.7)';
        title=`วันฝน | ล็อก: ${info.lock}`;
      } else if(hmTgt>0){
        // ENH-07: เทียบเป้า — เขียว = ถึง/เกินเป้า (ไล่เข้มตามส่วนเกิน) · ส้ม→แดง = ต่ำกว่าเป้า (ไล่ตามส่วนที่ขาด)
        const ratio=info.lock/hmTgt;
        if(ratio>=1){
          const over=Math.min(ratio-1,1); // เกินเป้า 100% ขึ้นไป = เขียวเข้มสุด
          const a=(0.35+over*0.55).toFixed(2);
          bg=`background:rgba(61,214,140,${a})`;
        } else {
          const under=1-ratio; // ขาดเป้ากี่ % (0 = พอดีเป้า, 1 = ได้ 0 ล็อก)
          if(under<=0.4){
            const a=(0.15+under*1.2).toFixed(2); // ขาดไม่เกิน 40% = โทนส้ม
            bg=`background:rgba(240,165,0,${a})`;
          } else {
            const a=(0.35+Math.min(under-0.4,0.6)*1.0).toFixed(2); // ขาดเกิน 40% = โทนแดง
            bg=`background:rgba(224,92,92,${a})`;
          }
        }
        title=`วันที่ ${d} | ล็อก: ${info.lock} / เป้า ${hmTgt} (${(ratio*100).toFixed(0)}%)`;
      } else {
        const intensity=Math.min(info.lock/maxLock,1);
        const a=(0.1+intensity*0.9).toFixed(2);
        bg=`background:rgba(240,165,0,${a})`;
        title=`วันที่ ${d} | ล็อก: ${info.lock}`;
      }
      html+=`<div class="hm-cell" style="${bg};position:relative" title="${title}">
        <span style="font-size:8px;color:rgba(255,255,255,.6);position:absolute;top:1px;left:2px;line-height:1">${d}</span>
      </div>`;
    }
    html+='</div></div>';
  });
  wrap.innerHTML=html;
}



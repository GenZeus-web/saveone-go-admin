// ============================================================
// views/overview.js — สถานะเทียบเป้า (ENH-05), หน้าภาพรวม, หน้าวันฝน             [เดิม 3015-3300]
// ============================================================
// ── ENH-05: แบนเนอร์เตือนหลุดเป้า + เป้าเดือนนี้ (pace) ──
function renderTargetStatus(d){
  // v2.6.4 UI-04: แบนเนอร์เดิม (#targetAlert) ถูกยุบเป็นแถบ summary ของ <details id="targetPanel">
  const panelEl=document.getElementById('targetPanel');
  const sumEl=document.getElementById('targetSummary');
  const txtEl=document.getElementById('targetSummaryText');
  const boxEl=document.getElementById('targetMonthBox');
  if(!panelEl||!sumEl||!txtEl||!boxEl) return;
  const tgt=currentTarget();
  // เป้าเทียบได้เฉพาะตอนดู "ทุกกลุ่ม" และต้องตั้งเป้าไว้ก่อน
  if(group!=='all'||tgt<=0||!d.length){panelEl.style.display='none';boxEl.style.display='none';return;}
  panelEl.style.display='block';

  // 1) หลุดเป้ากี่วันติด (นับจากวันล่าสุดถอยหลัง)
  const asc=[...d].sort((a,b)=>a.date-b.date);
  let streak=0,streakSum=0;
  for(let i=asc.length-1;i>=0;i--){
    const lk=getLock(asc[i],group);
    if(lk<tgt){streak++;streakSum+=lk;} else break;
  }
  const zn=zone==='st'?'ST':zone==='non'?(activeBranch==='SS'?'Non':'Car'):'ทุกโซน';
  const names={SS:'ศรีสมาน',BG:'ประตูกรุงเทพ',BN:'บางนา'};
  // v2.6.4 UI-04: เกณฑ์สี/ข้อความเดิม แต่บีบเหลือบรรทัดเดียวไว้บนแถบพับ
  // v2.10.3 UX polish (TARGET-BANNER): แยกเป็นหัวข้อตัวหนา (สั้น จับใจความ) + รายละเอียดสีอ่อนกว่า
  //   ไม่เปลี่ยนเกณฑ์สี/เงื่อนไข/ตัวเลขใดๆ — แค่จัดลำดับสายตาให้เห็น "หลุดเป้ากี่วัน" ก่อน
  let sumHead='',sumDetail='',sumTxt='',sumCol='var(--ink)';
  if(streak>=TGT_MISS_STREAK){
    const avg=streakSum/streak;
    const diff=((tgt-avg)/tgt*100).toFixed(1);
    sumCol='var(--red)';
    sumEl.style.background='rgba(239,68,68,.12)';
    sumEl.style.borderLeft='3px solid var(--red)';
    sumHead=`⚠️ หลุดเป้า ${streak} วันติด`;
    sumDetail=`${names[activeBranch]||activeBranch} (${zn}) · เฉลี่ย ${fmtN(avg,1)}/${fmtN(tgt)} ล็อก/วัน ต่ำกว่าเป้า ${diff}%`;
  } else if(streak===0){
    const last=asc[asc.length-1];
    sumCol='var(--green)';
    sumEl.style.background='rgba(34,197,94,.12)';
    sumEl.style.borderLeft='3px solid var(--green)';
    sumHead=`✅ วันล่าสุดถึงเป้า`;
    sumDetail=`(${fmtD(last.date)}) · ทำได้ ${fmtN(getLock(last,group))}/${fmtN(tgt)} ล็อก`;
  } else {
    sumCol='var(--ink)';
    sumEl.style.background='rgba(251,146,60,.12)';
    sumEl.style.borderLeft='3px solid var(--orange,#fb923c)';
    sumHead=`⚡ หลุดเป้า ${streak} วันติด`;
    sumDetail=`${names[activeBranch]||activeBranch} (${zn}) · เตือนเมื่อครบ ${TGT_MISS_STREAK} วันติด`;
  }
  sumTxt=sumHead+' · '+sumDetail; // เก็บไว้เผื่อโค้ดอื่นอ้าง (ไม่มีจุดอื่นอ้างจริง — เป็น safety net)
  sumEl.style.borderRadius='0';
  txtEl.style.color=sumCol;
  txtEl.innerHTML=`<strong style="font-weight:700">${sumHead}</strong> <span style="opacity:.8;font-weight:400">${sumDetail}</span>`;

  // 2) เป้าเดือนนี้ — ใช้เดือนล่าสุดที่มีข้อมูล (ไม่สนช่วงเวลาที่ filter)
  const all=applyZone(getActiveMerged());
  if(!all.length){boxEl.style.display='none';return;}
  const latest=all.reduce((a,b)=>a.date>b.date?a:b).date;
  const mk=mKey(latest);
  const rows=all.filter(r=>mKey(r.date)===mk);
  const daysInMonth=new Date(latest.getFullYear(),latest.getMonth()+1,0).getDate();
  const dataDays=rows.length;
  const sum=rows.reduce((s,r)=>s+getLock(r,group),0);
  const goal=tgt*daysInMonth;
  const pct=goal>0?sum/goal*100:0;
  const pacePct=daysInMonth>0?dataDays/daysInMonth*100:0;
  const projected=dataDays>0?sum/dataDays*daysInMonth:0;
  const gap=projected-goal;
  // v2.6.4 UI-04: ต่อ % เป้าเดือนเข้าท้ายแถบพับ ให้เห็นสถานะครบโดยไม่ต้องกาง
  // v2.10.3: ต่อเข้า detail span (ยังหัวข้อตัวหนาเหมือนเดิม ไม่ใช่ raw text ทับ)
  txtEl.innerHTML=`<strong style="font-weight:700">${sumHead}</strong> <span style="opacity:.8;font-weight:400">${sumDetail} · เป้าเดือนนี้ ${pct.toFixed(1)}%</span>`;
  boxEl.style.display='block';
  document.getElementById('tmMonth').textContent=mLbl(latest);
  document.getElementById('tmActual').textContent=fmtN(sum);
  document.getElementById('tmGoal').textContent=fmtN(goal);
  document.getElementById('tmPct').textContent=pct.toFixed(1)+'%';
  document.getElementById('tmPacePct').textContent=pacePct.toFixed(1)+'%';
  document.getElementById('tmDay').textContent=`${dataDays}/${daysInMonth}`;
  const bar=document.getElementById('tmBar');
  bar.style.width=Math.min(100,pct)+'%';
  bar.style.background=pct>=pacePct?'var(--green)':'var(--red)';
  document.getElementById('tmPace').style.left=Math.min(100,pacePct)+'%';
  const note=document.getElementById('tmNote');
  if(gap>=0){
    note.style.color='var(--green)';
    note.textContent=`📈 ตามเพซนี้จะจบเดือนที่ ${fmtN(projected)} ล็อก — เกินเป้า ${fmtN(gap)} ล็อก`;
  } else {
    note.style.color='var(--red)';
    const need=dataDays<daysInMonth?(goal-sum)/(daysInMonth-dataDays):0;
    note.textContent=`📉 ตามเพซนี้จะจบเดือนที่ ${fmtN(projected)} ล็อก — ต่ำกว่าเป้า ${fmtN(-gap)} ล็อก`+
      (need>0?` · ต้องทำ ${fmtN(need,1)} ล็อก/วัน ใน ${daysInMonth-dataDays} วันที่เหลือ`:'');
  }

  // 3) รายการ 5 วันล่าสุดเทียบเป้า
  const listEl=document.getElementById('tmDayList');
  if(listEl){
    listEl.innerHTML=asc.slice(-5).reverse().map(r=>{
      const lk=getLock(r,group);
      const diff=tgt?((lk-tgt)/tgt*100):0;
      const hit=lk>=tgt;
      return `<div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px solid var(--border)">`+
        `<span style="color:var(--ink2)">${fmtD(r.date)} (${DAYS[r.date.getDay()]})</span>`+
        `<span style="color:${hit?'var(--green)':'var(--red)'};font-weight:700">${fmtN(lk)} / ${fmtN(tgt)} · ${diff>=0?'+':''}${diff.toFixed(0)}%</span></div>`;
    }).join('');
  }
}

// ── OVERVIEW ──
function renderOverview(d){
  // คำนวณ KPI
  let revSTsum=0,revNonSum=0,revNormal=0,disc=0,l1=0,l2=0;
  let fdays=0,rai=0,lock=0;
  d.forEach(r=>{
    revSTsum+=revST(r,group);revNonSum+=revNon(r,group);
    revNormal+=revSTNormal(r,group)+revNonNormal(r,group);
    disc+=calcDiscount(r);l1+=r.l1+(r.l1n||0);l2+=r.l2+(r.l2n||0);
    if(r.freeDay)fdays++;
    rai+=getRai(r,group);lock+=getLock(r,group);
  });
  const days=d.length||1;
  animateNumber(document.getElementById('k-revbefore'),revNormal);
  animateNumber(document.getElementById('k-disc'),disc);
  document.getElementById('k-disc-sub').textContent=`${fdays} วัน FreeDay`;
  /* v2.11.3 KPI-02: การ์ดรายรับสุทธิใบเดียว ใช้ร่วมกันทั้ง 3 โซน
     ค่าที่แสดงไม่ต้องแยกเคส — applyZone() ล้างยอดโซนที่ไม่ได้เลือกเป็น 0 แล้ว
     revSTsum+revNonSum จึงถูกต้องทั้ง 3 กรณี เปลี่ยนแค่ป้ายชื่อ
     ชื่อโซนต่างกันตามสาขา: SS เรียก Non · BG/BN เรียก Car (ตาม updateZoneLabel) */
  const _nonName=activeBranch==='SS'?'Non':'Car';
  const _revLbl=document.getElementById('k-revtotal-lbl');
  if(_revLbl) _revLbl.textContent=
      zone==='st'  ? 'รายรับสุทธิ ST'
    : zone==='non' ? `รายรับสุทธิ ${_nonName}`
    :                `รายรับสุทธิรวม (ST+${_nonName})`;
  animateNumber(document.getElementById('k-revtotal'),revSTsum+revNonSum);
  animateNumber(document.getElementById('k-elec'),l1+l2);
  document.getElementById('k-elec-sub').textContent=`L1: ${fmtN(l1)} | L2: ${fmtN(l2)} ฿`;
  // ลา/ไม่มา/เสริม แยกตาม zone
  const stAbsent=d.reduce((s,r)=>s+(r.absentLock||0),0);
  const stCancel=d.reduce((s,r)=>s+(r.cancelLock||0),0);
  const stExtra=d.reduce((s,r)=>s+(r.extraLock||0),0);
  const nonAbsent=d.reduce((s,r)=>s+(r.nonAbsentLock||0),0);
  const nonCancel=d.reduce((s,r)=>s+(r.nonCancelLock||0),0);
  const nonExtra=d.reduce((s,r)=>s+(r.nonExtraLock||0),0);
  const totalAbsent=zone==='st'?stAbsent:zone==='non'?nonAbsent:stAbsent+nonAbsent;
  const totalCancel=zone==='st'?stCancel:zone==='non'?nonCancel:stCancel+nonCancel;
  const totalExtra=zone==='st'?stExtra:zone==='non'?nonExtra:stExtra+nonExtra;
  document.getElementById('k-fdays').textContent=fmtN(fdays);
  document.getElementById('k-absent').textContent=fmtN(totalAbsent);
  document.getElementById('k-cancel').textContent=fmtN(totalCancel);
  document.getElementById('k-extra').textContent=fmtN(totalExtra);
  animateNumber(document.getElementById('k-rai'),rai);
  document.getElementById('k-rai-sub').textContent=fmtN(rai/days,1);
  animateNumber(document.getElementById('k-lock'),lock);
  document.getElementById('k-lock-sub').textContent=fmtN(lock/days,1);
  
  // Target summary
  const avgActual=lock/days;
  const hitDays=d.filter(r=>getLock(r,group)>=targetLock).length;
  const missDays=d.length-hitDays;
  const hitPct=d.length>0?(hitDays/d.length*100).toFixed(1)+'%':'—';
  const td=document.getElementById('targetDisplay');if(td)td.textContent=fmtN(targetLock);
  const ta=document.getElementById('targetActual');if(ta)ta.textContent=fmtN(avgActual,1);
  const th=document.getElementById('targetHit');if(th)th.textContent=fmtN(hitDays);
  const tm=document.getElementById('targetMiss');if(tm)tm.textContent=fmtN(missDays);
  const tp=document.getElementById('targetPct');if(tp)tp.textContent=hitPct;
  renderTargetStatus(d);

  // MAIN CHART — แท่ง=ราย เส้น=ล็อก รายวัน (60 วันล่าสุด)
  const sorted=[...d].sort((a,b)=>a.date-b.date);
  const daily=sorted.slice(-90);
    dChart('cMain');
  // คำนวณ max ของ ราย และ ล็อก เพื่อปรับ scale
  const isAllGroup=(group==='all');
  const maxRai=Math.max(...daily.map(r=>getRai(r,group)),1);
  // เป้าหมายมีไว้สำหรับ "ทั้งหมด" เท่านั้น — ตอน filter กลุ่มย่อย (online/walkin/extra)
  // ไม่เอา targetLock มา clamp แกน Y เพราะค่ากลุ่มย่อยมักน้อยกว่าเป้ามาก ทำให้แท่งเตี้ยมองไม่เห็น
  const maxLock=isAllGroup
    ? Math.max(...daily.map(r=>getLock(r,group)),targetLock,1)
    : Math.max(...daily.map(r=>getLock(r,group)),1);
  // ทำให้เส้นล็อกอยู่สูงกว่าแท่งราย โดยปรับ max ของแต่ละแกน
  const raiMax=maxRai*3.5; // เพิ่ม max ทำให้แท่งเขียวดูเล็กลง มีช่องว่างด้านบน
  const lockMax=maxLock*1.05;

  // v2.11.4 DAY-01: จำแถวที่กราฟรอบนี้ใช้ ไว้ให้ openDayModal() หยิบตาม index
  _dayRows=daily;

  charts.cMain=makeChart('cMain',{
    data:{
      labels:daily.map(r=>fmtD(r.date)),
      datasets:[
        {type:'bar',label:'จำนวนราย',data:daily.map(r=>getRai(r,group)),backgroundColor:daily.map(r=>r.freeDay?'rgba(240,165,0,.7)':'rgba(61,214,140,.6)'),yAxisID:'y',order:3},
        {type:'line',label:'จำนวนล็อก',data:daily.map(r=>getLock(r,group)),borderColor:'rgba(240,122,53,1)',backgroundColor:'rgba(240,122,53,.05)',borderWidth:2,pointRadius:1.5,fill:false,tension:.3,yAxisID:'y',order:1},
        ...(isAllGroup?[{type:'line',label:`เป้าหมาย (${fmtN(targetLock)} ล็อก)`,data:daily.map(()=>targetLock),borderColor:'rgba(167,139,250,.9)',borderWidth:2,borderDash:[6,3],pointRadius:0,fill:false,yAxisID:'y',order:2}]:[]),
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      animation:false,
      interaction:{mode:'index',intersect:false},
      /* v2.11.4 DAY-01: กดที่ไหนก็ได้ในคอลัมน์ของวันนั้น → เปิดกล่องรายละเอียด
         ใช้ intersect:false ที่ตั้งไว้อยู่แล้ว เลยไม่ต้องกดโดนจุดเป๊ะๆ
         สำคัญกับมือถือ เพราะจุดเล็กเกินกว่าจะแตะให้โดน */
      onClick:(ev,els,chart)=>{
        let i = els.length ? els[0].index : null;
        if(i===null){
          const p=chart.getElementsAtEventForMode(ev,'index',{intersect:false},false);
          if(p.length) i=p[0].index;
        }
        if(i!==null && i!==undefined) openDayModal(i);
      },
      plugins:{
        legend:{labels:{color:chartClr().lbl,font:{family:'Noto Sans Thai',size:11}}},
        tooltip:{callbacks:{title:items=>`${items[0].label} (${DAYS[new Date(daily[items[0].dataIndex]?.date).getDay()]})`}}
      },
      scales:{
        x:{ticks:{color:chartClr().tick,font:{family:'Noto Sans Thai',size:9},maxTicksLimit:15,maxRotation:0},grid:{color:chartClr().grid}},
        y:{position:'left',min:0,max:lockMax,title:{display:true,text:'ราย / ล็อก',color:chartClr().lbl,font:{size:10}},ticks:{color:chartClr().lbl,font:{family:'JetBrains Mono',size:9}},grid:{color:chartClr().grid}},
      }
    }
  });

  // Monthly stacked bar
  const mon={};
  sorted.forEach(r=>{
    const k=mLbl(r.date);if(!mon[k])mon[k]={o:0,w:0,e:0,n:0,c:0};
    mon[k].o+=Math.max(0,(r.onlineLock||0)-(r.absentLock||0)-(r.cancelLock||0));
    mon[k].w+=r.walkInLock||0;mon[k].e+=r.extraLock||0;
    mon[k].n+=(r.nonOnlineLock||0)+(r.nonWalkInLock||0)+(r.nonExtraLock||0);
    mon[k].c+=(r.cancelLock||0)+(r.absentLock||0);
  });
  const mks=Object.keys(mon);
  dChart('cMonthly');
  charts.cMonthly=makeChart('cMonthly',{type:'bar',data:{labels:mks,datasets:[
    {label:'ออนไลน์สุทธิ',data:mks.map(k=>mon[k].o),backgroundColor:'rgba(74,158,255,.8)',borderRadius:2,stack:'s'},
    {label:'วอคอิน ST',data:mks.map(k=>mon[k].w),backgroundColor:'rgba(240,165,0,.75)',borderRadius:2,stack:'s'},
    {label:'Non',data:mks.map(k=>mon[k].n),backgroundColor:'rgba(167,139,250,.7)',borderRadius:2,stack:'s'},
    {label:'เสริม',data:mks.map(k=>mon[k].e),backgroundColor:'rgba(61,214,140,.65)',borderRadius:2,stack:'s'},
    {label:'ยกเลิก/ลา',data:mks.map(k=>mon[k].c),backgroundColor:'rgba(224,92,92,.55)',borderRadius:2,stack:'s'},
  ]},options:cOpts()});

  // Weekday avg
  const ws=[0,0,0,0,0,0,0],wc=[0,0,0,0,0,0,0];
  d.forEach(r=>{const wd=r.date.getDay();ws[wd]+=getLock(r,group);wc[wd]++;});
  const wa=ws.map((s,i)=>wc[i]?+(s/wc[i]).toFixed(1):0);
  dChart('cWeekday');
  charts.cWeekday=makeChart('cWeekday',{type:'bar',data:{labels:DAYS,datasets:[{data:wa,backgroundColor:wa.map((_,i)=>[0,5,6].includes(i)?'rgba(240,165,0,.8)':'rgba(74,158,255,.7)'),borderRadius:4}]},options:{...cOpts(),plugins:{legend:{display:false}}}});

  // Pie
  const totO=d.reduce((s,r)=>s+Math.max(0,(r.onlineLock||0)-(r.absentLock||0)-(r.cancelLock||0)),0);
  const totW=d.reduce((s,r)=>s+(r.walkInLock||0),0);
  const totN=d.reduce((s,r)=>s+(r.nonOnlineLock||0)+(r.nonWalkInLock||0)+(r.nonExtraLock||0),0);
  const totE=d.reduce((s,r)=>s+(r.extraLock||0),0);
  const totC=d.reduce((s,r)=>s+(r.cancelLock||0)+(r.absentLock||0),0);
  dChart('cPie');
  charts.cPie=makeChart('cPie',{type:'doughnut',data:{labels:['ออนไลน์สุทธิ','วอคอิน ST','Non','เสริม','ยกเลิก/ลา'],datasets:[{data:[totO,totW,totN,totE,totC],backgroundColor:['rgba(74,158,255,.85)','rgba(240,165,0,.85)','rgba(167,139,250,.8)','rgba(61,214,140,.75)','rgba(224,92,92,.65)'],borderWidth:0,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'bottom',labels:{color:chartClr().lbl,font:{family:'Noto Sans Thai',size:10},padding:8}}}}});

  // Top/Bottom
  const s2=[...d].filter(r=>getLock(r,group)>0).sort((a,b)=>getLock(b,group)-getLock(a,group));
  const top5=s2.slice(0,5),bot5=[...s2].reverse().slice(0,5);
  document.getElementById('topbot').innerHTML=`
    <div class="tb-card">
      <div class="tb-title" style="color:var(--green)">🏆 5 วันที่ล็อกมากสุด</div>
      ${top5.map((r,i)=>`<div class="tb-row top"><div class="tb-num">${i+1}</div><div class="tb-date">${fmtD(r.date)} <span style="color:var(--ink3);font-size:10px">${DAYS[r.date.getDay()]}</span></div><div class="tb-val">${fmtN(getLock(r,group))}</div></div>`).join('')}
    </div>
    <div class="tb-card">
      <div class="tb-title" style="color:var(--red)">📉 5 วันที่ล็อกน้อยสุด</div>
      ${bot5.map((r,i)=>`<div class="tb-row bot"><div class="tb-num">${i+1}</div><div class="tb-date">${fmtD(r.date)} <span style="color:var(--ink3);font-size:10px">${DAYS[r.date.getDay()]}</span></div><div class="tb-val">${fmtN(getLock(r,group))}</div></div>`).join('')}
    </div>`;
}

// ── FREEDAY ──
function renderFreeday(d){
  const fds=d.filter(r=>r.freeDay);
  const g=group; // FD-03: ใช้ตัวกรอง "กลุ่มข้อมูล" (all/online/walkin/extra/cancel) ปัจจุบัน — เดิมค้างที่ online เสมอ
  const grpLbl={all:'ล็อก',online:'ออนไลน์ล็อก',walkin:'วอคอินล็อก',extra:'ล็อกเสริม',cancel:'ยกเลิก/ลา'};
  let td=0,tn=0,ta=0;
  fds.forEach(r=>{td+=calcDiscount(r,g);tn+=revSTNormal(r,g)+revNonNormal(r,g);ta+=revST(r,g)+revNon(r,g);});
  document.getElementById('fdKpi').innerHTML=`
    <div class="fd-kpi"><div class="fd-kpi-val">${fds.length}</div><div class="fd-kpi-lbl">จำนวนวันฝน</div></div>
    <div class="fd-kpi"><div class="fd-kpi-val">${fmtN(fds.reduce((s,r)=>s+getLock(r,g),0))}</div><div class="fd-kpi-lbl">รวม${grpLbl[g]||'ล็อก'}</div></div>
    <div class="fd-kpi col-rev"><div class="fd-kpi-val">${fmtN(td)}</div><div class="fd-kpi-lbl">รายได้ที่เสียไป (฿)</div></div>
    <div class="fd-kpi col-rev"><div class="fd-kpi-val">${fmtN(tn)}</div><div class="fd-kpi-lbl">รายได้ถ้าไม่มีวันฝน (฿)</div></div>
    <div class="fd-kpi col-rev"><div class="fd-kpi-val">${fmtN(ta)}</div><div class="fd-kpi-lbl">รายได้จริง (฿)</div></div>
    <div class="fd-kpi col-rev"><div class="fd-kpi-val">${tn>0?(td/tn*100).toFixed(1)+'%':'—'}</div><div class="fd-kpi-lbl">% ที่หายไป</div></div>
  `;
  const fdColLock=document.getElementById('fdColLock');
  if(fdColLock) fdColLock.textContent=grpLbl[g]||'ล็อก';
  const fdm={};
  [...d].sort((a,b)=>a.date-b.date).forEach(r=>{const k=mLbl(r.date);if(!fdm[k])fdm[k]={d:0,c:0};if(r.freeDay){fdm[k].d+=calcDiscount(r,g);fdm[k].c++;}});
  const fmks=Object.keys(fdm);
  dChart('cFDMonth');charts.cFDMonth=makeChart('cFDMonth',{type:'bar',data:{labels:fmks,datasets:[{label:'ส่วนลดวันฝน (฿)',data:fmks.map(k=>fdm[k].d),backgroundColor:'rgba(240,165,0,.7)',borderRadius:3}]},options:cOpts()});
  dChart('cFDCount');charts.cFDCount=makeChart('cFDCount',{type:'bar',data:{labels:fmks,datasets:[{label:'จำนวนวันฝน',data:fmks.map(k=>fdm[k].c),backgroundColor:'rgba(61,214,140,.7)',borderRadius:3}]},options:cOpts()});
  document.getElementById('fdTbl').innerHTML=fds.sort((a,b)=>b.date-a.date).map(r=>{
    // FD-02/FD-03: ล็อค/ลา/ไม่มา/ราคา ต้องตามทั้งโซน (ST/Non) และกลุ่ม (online/walkin/extra) ที่เลือกจริง
    const lockTot=getLock(r,g),absentTot=(r.absentLock||0)+(r.nonAbsentLock||0),cancelTot=(r.cancelLock||0)+(r.nonCancelLock||0);
    const wk=isWknd(r.date);
    let po=wk?130:100, pw=wk?160:130; // ST default
    if(zone==='non'){
      const base=getNonPrice(r.date);
      po=base; pw=(activeBranch==='SS')?base:base+50; // Car: WalkIn/เสริม +50 (SS Non=ราคาเดียว ไม่บวก)
    }
    const isWalkGroup=(g==='walkin'||g==='extra');
    const walkDiscounted=activeBranch!=='SS'; // SS ไม่ลดราคาวันฝนให้ WalkIn/ล็อกเสริม
    const priceFrom=isWalkGroup?pw:po;
    const priceTo=isWalkGroup?(walkDiscounted?pw/2:pw):po/2;
    const dc=calcDiscount(r,g),ac=revST(r,g)+revNon(r,g),nm=revSTNormal(r,g)+revNonNormal(r,g);
    return`<tr><td style="color:var(--gold)">${fmtD(r.date)}</td><td>${DAYS[r.date.getDay()]}</td><td class="num">${fmtN(lockTot)}</td><td class="num">${fmtN(absentTot)}</td><td class="num">${fmtN(cancelTot)}</td><td class="num col-rev">${priceFrom} → ${priceTo} ฿${(isWalkGroup&&!walkDiscounted)?' (ไม่ลด)':''}</td><td class="num col-rev">${fmtN(nm)}</td><td class="num col-rev">${fmtN(ac)}</td><td class="num col-rev" style="color:var(--red);font-weight:700">−${fmtN(dc)}</td></tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   v2.11.4 DAY-01: กดจุด/แท่งบนกราฟหลัก → กล่องรายละเอียดของวันนั้น
   ══════════════════════════════════════════════════════════════
   ทำไมถึงมี: เห็นกราฟพุ่ง/ดิ่ง คำถามถัดไปคือ "วันนั้นเกิดอะไร"
   เดิมต้องจำวันที่ไปไล่หาในแท็บข้อมูลดิบ · กดตรงจุดเลยตรงกว่า
   และบนมือถือไม่มี hover — tooltip เดิมจึงใช้ไม่ได้เลย

   ⚠️ ทุกสูตรในนี้ copy มาจาก renderRaw() ตรงๆ ห้ามคิดใหม่
      ไม่งั้นเลขในกล่องกับในตารางข้อมูลดิบจะไม่ตรงกัน
   ⚠️ เงิน/ค่าไฟ ใส่คลาส col-rev / col-elec — CSS ซ่อนตามสิทธิ์ให้เอง
      อย่าเช็ค userPerms ซ้ำ จะกลายเป็นสองแหล่งความจริง

   สี: ยืมภาษาเดิมของแอป ทอง=ล็อก เขียว=ราย/รายรับ ม่วง=Car/Non
       แดง=ไม่มา/ลา ส้ม=ค่าไฟ — ผู้ใช้ไม่ต้องเรียนรู้ชุดสีใหม่ */
let _dayRows=[];                       // แถวที่กราฟหลักใช้อยู่รอบล่าสุด

function openDayModal(i){
  const r=_dayRows[i];
  if(!r) return;
  const wk=isWknd(r.date), fd=r.freeDay;

  // ── สูตรเดียวกับ renderRaw() ──
  const net=Math.max(0,r.onlineLock-r.absentLock-r.cancelLock);
  let po=wk?130:100, pw=wk?160:130;
  if(zone==='non'){
    const base=getNonPrice(r.date);
    po=base; pw=(activeBranch==='SS')?base:base+50;
  }
  const rv=revST(r)+revNon(r);
  const cancelShow = zone==='st' ? r.cancelLock : zone==='non' ? (r.nonCancelLock||0) : (r.cancelLock||0)+(r.nonCancelLock||0);
  const absentShow = zone==='st' ? r.absentLock : zone==='non' ? (r.nonAbsentLock||0) : (r.absentLock||0)+(r.nonAbsentLock||0);
  const l1=(r.l1||0)+(r.l1n||0), l2=(r.l2||0)+(r.l2n||0);
  const nonName=activeBranch==='SS'?'Non':'Car';

  // ── หัวกล่อง ──
  document.getElementById('dayTitle').textContent=fmtD(r.date);
  const chip = fd ? '<span class="day-chip fd">🌧 วันฝน</span>'
             : wk ? '<span class="day-chip wk">วันหยุด ศ–อา</span>'
                  : '<span class="day-chip nm">วันธรรมดา</span>';
  document.getElementById('daySub').innerHTML=`<span>${DAYS[r.date.getDay()]}</span>${chip}`;

  document.getElementById('dayBig').innerHTML=`
    <div><div class="v" style="color:var(--gold)">${fmtN(getLock(r,group))}</div><div class="k">🔒 ล็อก</div></div>
    <div><div class="v" style="color:var(--green)">${fmtN(getRai(r,group))}</div><div class="k">👥 ราย</div></div>`;

  // ── รายการย่อย ──
  const sec=(icon,txt,color)=>`<div class="day-sec" style="color:${color}">${icon} ${txt}</div>`;
  const row=(k,v,u='',cls='')=>`<div class="day-r ${cls}"><span>${k}</span><span>${v}${u?`<span class="u">${u}</span>`:''}</span></div>`;
  let h='';

  if(zone!=='non'){
    h+=sec('🍜','ST · Street Food','var(--gold)')+'<div class="day-grp st">';
    h+=row('ออนไลน์สุทธิ',fmtN(net),'ล็อก');
    h+=row('วอล์กอิน',fmtN(r.walkInLock),'ล็อก');
    if(r.extraLock) h+=row('ล็อกเสริม',fmtN(r.extraLock),'ล็อก');
    h+='</div>';
  }
  if(zone!=='st'&&r.nonLock){
    h+=sec(activeBranch==='SS'?'🧺':'🚗',`${nonName} · Boot Sale`,'var(--purple)')+'<div class="day-grp non">';
    h+=row('ล็อก',fmtN(r.nonLock),'ล็อก');
    if(r.nonExtraLock) h+=row('ล็อกเสริม',fmtN(r.nonExtraLock),'ล็อก');
    h+='</div>';
  }
  if(cancelShow||absentShow){
    h+=sec('⚠️','ไม่ได้ขาย','var(--red)')+'<div class="day-grp bad">';
    if(cancelShow) h+=row('ไม่มา (ยกเลิก)',fmtN(cancelShow),'ล็อก');
    if(absentShow) h+=row('ลา',fmtN(absentShow),'ล็อก');
    h+='</div>';
  }
  h+=`<div class="col-rev">${sec('💰','รายรับ','var(--green)')}<div class="day-grp rev">`
    +row('ราคา/ล็อก', fd?`${po/2} / ${activeBranch==='SS'?pw:pw/2}`:`${po} / ${pw}`,'฿ ออนไลน์/วอล์กอิน')
    +row('รายรับรวม',fmtN(rv),'฿','hi')
    +'</div></div>';
  if(l1+l2>0){
    h+=`<div class="col-elec">${sec('⚡','ค่าไฟ','var(--orange)')}<div class="day-grp elec">`
      +row('L1',fmtN(l1),'฿')+row('L2',fmtN(l2),'฿')
      +'</div></div>';
  }
  document.getElementById('dayRows').innerHTML=h;
  document.getElementById('dayModal').style.display='flex';
}

function closeDayModal(){
  const m=document.getElementById('dayModal');
  if(m) m.style.display='none';
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDayModal(); });

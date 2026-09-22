// ============================================================
// views/compare.js — หน้าเปรียบเทียบเดือน                                          [เดิม 3517-3628]
// ============================================================
// ── COMPARE ──
/* v2.11.3 CHT-03: สลับลำดับ + เปลี่ยนสีที่ 7
   - แดงกับเขียวเคยอยู่ติดกัน (ลำดับ 3-4) คนตาบอดสีแยกไม่ออก → คั่นด้วยม่วง
   - 'rgba(100,200,180)' อิ่มสีต่ำกว่าเกณฑ์ อ่านเป็นสีเทา → เปลี่ยนเป็น 45,212,191
   ค่าที่เขียนไว้คือสีโหมดมืด · โหมดสว่าง sc() ใน charts.js แปลงให้เอง */
const MONTH_COLORS=['rgba(240,165,0,.85)','rgba(74,158,255,.85)','rgba(224,92,92,.8)','rgba(167,139,250,.8)','rgba(61,214,140,.8)','rgba(240,122,53,.8)','rgba(45,212,191,.8)','rgba(255,200,60,.8)'];

function renderCompare(){
  const mks=[...selMonths].sort();
  if(!mks.length){
    document.getElementById('momGrid').innerHTML='<div style="color:var(--ink3);font-size:12px;padding:10px">เลือกเดือนด้านบนก่อนครับ</div>';
    return;
  }
  // สร้างข้อมูลแต่ละเดือน
  const monData={};
  mks.forEach(k=>{
    const[y,m]=k.split('-');
    const days=new Date(y,m,0).getDate();
    monData[k]=Array(days).fill(null);
  });
  applyZone(getActiveMerged()).forEach(r=>{
    const k=mKey(r.date);
    if(monData[k]){
      const day=r.date.getDate()-1;
      monData[k][day]=getLock(r,group);
    }
  });

  // กราฟรายวัน overlay
  const maxDays=Math.max(...mks.map(k=>monData[k].length));
  const labels=Array.from({length:maxDays},(_,i)=>`วันที่ ${i+1}`);
  dChart('cCompare');
  charts.cCompare=makeChart('cCompare',{
    type:'line',
    data:{
      labels,
      datasets:mks.map((k,i)=>{
        const[y,m]=k.split('-');
        return{label:mLbl(new Date(y,m-1,1)),data:monData[k],borderColor:MONTH_COLORS[i%MONTH_COLORS.length],backgroundColor:'transparent',borderWidth:2,pointRadius:2,tension:.3,spanGaps:true};
      })
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:chartClr().lbl,font:{family:'Noto Sans Thai',size:11}}}},
      scales:{x:{ticks:{color:chartClr().tick,font:{size:9},maxTicksLimit:16},grid:{color:chartClr().grid}},y:{ticks:{color:chartClr().tick,font:{family:'JetBrains Mono',size:10}},grid:{color:chartClr().grid}}}
    }
  });

  // รวมต่อเดือน + รายรับ
  const totals={},revs={};
  mks.forEach(k=>{totals[k]=0;revs[k]=0;});
  applyZone(getActiveMerged()).forEach(r=>{
    const k=mKey(r.date);
    if(totals[k]!==undefined){totals[k]+=getLock(r,group);revs[k]+=revST(r)+revNon(r);}
  });
  const mkLabels=mks.map(k=>{const[y,m]=k.split('-');return mLbl(new Date(y,m-1,1));});
  dChart('cMonthTotal');
  const _curMK=mKey(new Date());
  const _totLabels={id:'totLabels',afterDatasetsDraw(chart){const{ctx}=chart;const meta=chart.getDatasetMeta(0);if(!meta)return;ctx.save();ctx.textAlign='center';meta.data.forEach((bar,i)=>{const v=totals[mks[i]]||0;ctx.fillStyle=chartClr().lbl;ctx.font='600 12px JetBrains Mono';ctx.fillText(fmtN(v),bar.x,bar.y-6);if(mks[i]===_curMK){ctx.fillStyle=chartClr().tick;ctx.font='400 10px Noto Sans Thai';ctx.fillText('(ยังไม่จบเดือน)',bar.x,bar.y-22);}});ctx.restore();}};
  charts.cMonthTotal=makeChart('cMonthTotal',{type:'bar',data:{labels:mkLabels,datasets:[{label:'ล็อกรวม',data:mks.map(k=>totals[k]),backgroundColor:mks.map((_,i)=>MONTH_COLORS[i%MONTH_COLORS.length]),borderRadius:6,maxBarThickness:90}]},options:{...cOpts(),layout:{padding:{top:30}}},plugins:[_totLabels]});
  dChart('cMonthRev');
  const _canRev=window.userPerms?window.userPerms.showRevenue:true;
  const _revCard=document.getElementById('cMonthRevCard');
  if(_canRev){
    if(_revCard) _revCard.style.display='';
    charts.cMonthRev=makeChart('cMonthRev',{type:'bar',data:{labels:mkLabels,datasets:[{label:'รายรับ (บาท)',data:mks.map(k=>revs[k]),backgroundColor:mks.map((_,i)=>MONTH_COLORS[i%MONTH_COLORS.length]),borderRadius:4}]},options:cOpts()});
  } else {
    if(_revCard) _revCard.style.display='none';
  }

  // MoM cards
  const momData=applyZone(getActiveMerged());
  const allMks=[...new Set(momData.map(r=>mKey(r.date)))].sort();
  const allTotals={};
  allMks.forEach(k=>{allTotals[k]=0;});
  momData.forEach(r=>{const k=mKey(r.date);if(allTotals[k]!==undefined)allTotals[k]+=getLock(r,group);});
  const days_in={};
  allMks.forEach(k=>{const[y,m]=k.split('-');days_in[k]=momData.filter(r=>mKey(r.date)===k).length||1;});

  document.getElementById('momGrid').innerHTML=mks.map((k,i)=>{
    const[y,m]=k.split('-');const lbl=mLbl(new Date(y,m-1,1));
    const total=allTotals[k]||0;const avg=(total/days_in[k]).toFixed(1);
    const prevIdx=allMks.indexOf(k)-1;
    let chgHtml='';
    if(prevIdx>=0){
      const pk=allMks[prevIdx];const pt=allTotals[pk]||0;const pa=(pt/days_in[pk]);
      const pct=pa>0?((avg-pa)/pa*100).toFixed(1):0;
      const cls=pct>0?'chg-up':pct<0?'chg-dn':'chg-eq';
      const arrow=pct>0?'▲':pct<0?'▼':'—';
      chgHtml=`<div class="mom-chg"><span class="${cls}">${arrow} ${Math.abs(pct)}%</span><span style="color:var(--ink3)">vs เดือนก่อน</span></div>`;
    }
    return`<div class="mom-card">
      <div class="mom-month" style="color:${sc(MONTH_COLORS[i%MONTH_COLORS.length])}">${lbl}</div>
      <div class="mom-val">${fmtN(total)}</div>
      <div style="font-size:12px;color:var(--ink3)">เฉลี่ย ${avg} ล็อก/วัน</div>
      ${chgHtml}
    </div>`;
  }).join('');

  // สรุปตัวเลขสำคัญ (ครบวงจร)
  const _sumEl=document.getElementById('cmpSummary');
  if(_sumEl){
    let _daysSum=0,_lockSum=0,_revSum=0;
    mks.forEach(k=>{_daysSum+=(days_in[k]||0);_lockSum+=(allTotals[k]||0);_revSum+=(revs[k]||0);});
    const _avg=_daysSum?_lockSum/_daysSum:0;
    let _best=null,_worst=null;
    mks.forEach(k=>{const a=(allTotals[k]||0)/((days_in[k]||1));if(_best===null||a>_best.a)_best={k,a};if(_worst===null||a<_worst.a)_worst={k,a};});
    const _tgt=currentTarget()||1;
    const _pct=_tgt?(_avg/_tgt*100):0;
    const _canRev=window.userPerms?window.userPerms.showRevenue:true;
    const _bl=(x)=>{if(!x)return '-';const p=x.split('-');return mLbl(new Date(p[0],p[1]-1,1));};
    let _rows=[['รวมล็อก ('+mks.length+' เดือน)',fmtN(_lockSum)+' ล็อก'],['เฉลี่ยรวม',_avg.toFixed(1)+' ล็อก/วัน'],['% เทียบเป้า ('+_tgt+'/วัน)',_pct.toFixed(0)+'%'],['เดือนสูงสุด',_bl(_best&&_best.k)+' · '+(_best?_best.a.toFixed(0):0)+'/วัน'],['เดือนต่ำสุด',_bl(_worst&&_worst.k)+' · '+(_worst?_worst.a.toFixed(0):0)+'/วัน']];
    if(_canRev){_rows.push(['รวมรายรับ',fmtN(_revSum)+' ฿']);_rows.push(['เฉลี่ยรายรับ',fmtN(_daysSum?(_revSum/_daysSum):0)+' ฿/วัน']);}
    _sumEl.innerHTML=_rows.map(r=>'<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--ink3)">'+r[0]+'</span><span style="font-weight:700">'+r[1]+'</span></div>').join('');
  }
}


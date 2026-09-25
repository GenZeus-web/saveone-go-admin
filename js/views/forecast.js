// ============================================================
// views/forecast.js — หน้าพยากรณ์ (เดือนนี้ / เดือนหน้า)                          [เดิม 3301-3386]
// ============================================================
// ── FORECAST ──
function renderForecast(){
  const sorted=[...getFiltered()].sort((a,b)=>a.date-b.date);
  const mon={};
  sorted.forEach(r=>{const k=mKey(r.date);if(!mon[k])mon[k]={lock:0,rev:0,days:0};mon[k].lock+=getLock(r,'all');mon[k].rev+=revST(r)+revNon(r);mon[k].days++;});
  const mks=Object.keys(mon).sort();
  // v2.5.6: แยกเดือนปัจจุบันที่ยังไม่จบออกจากฐานค่าเฉลี่ย + การ์ด Month-to-Date
  const _now=new Date();
  const _curMK=mKey(_now);
  const _daysInCur=new Date(_now.getFullYear(),_now.getMonth()+1,0).getDate();
  const _daysElapsed=_now.getDate();
  const _curIncomplete=!!mon[_curMK] && _daysElapsed<_daysInCur;
  const _baseMks=(function(){const c=mks.filter(k=>!(k===_curMK&&_curIncomplete));return c.length?c:mks;})();
  const last3=_baseMks.slice(-3);
  const avgLock=last3.reduce((s,k)=>s+mon[k].lock/mon[k].days,0)/last3.length;
  const avgRev=last3.reduce((s,k)=>s+mon[k].rev/mon[k].days,0)/last3.length;
  // v2.5.7 FCST-02: พยากรณ์เดือนหน้าอิง "เดือนปฏิทินเต็ม" แทน 30 วัน rolling
  // -> เทียบกับยอดจริงรายเดือนได้ตรง ไม่คร่อม 2 เดือน
  const _nextY=_now.getMonth()===11?_now.getFullYear()+1:_now.getFullYear();
  const _nextM=(_now.getMonth()+1)%12;
  const _daysInNext=new Date(_nextY,_nextM+1,0).getDate();
  const _nextLbl=mLbl(new Date(_nextY,_nextM,1));
  const fcLock=Math.round(avgLock*_daysInNext),fcRev=Math.round(avgRev*_daysInNext);
  const _fcRev=canSeeRev(); // PERM-06: ด่านกลาง (เดิม ยังไม่รู้สิทธิ์ = ให้เห็น)
  // pace เทียบค่าเฉลี่ยฐาน (แสดงว่าเร็ว/ช้ากว่าปกติ)
  const _pace=(cur)=>{if(!avgLock)return '';const p=Math.round((cur-avgLock)/avgLock*100);const up=p>=0;return `<div style="font-size:10px;margin-top:3px;color:${up?'var(--green)':'var(--red)'}">${up?'▲':'▼'} ${Math.abs(p)}% เทียบเฉลี่ย 3 ด.</div>`;};
  // v2.5.7 FCST-03: บล็อก "เดือนนี้" แสดงตลอดถ้ามีข้อมูลเดือนปัจจุบัน
  //   - เดือนยังไม่จบ -> ป้ายเตือน + แถบความคืบหน้า + การ์ด "คาดทั้งเดือน"
  //   - เดือนจบแล้ว   -> ยอดจริงทั้งเดือน (ไม่มีป้ายเตือน/แถบ/การ์ดคาด)
  // v2.5.7 FCST-04: เติมการ์ดรายรับฝั่ง "เดือนนี้" ให้สมมาตรกับ "เดือนหน้า" (gate ตาม role)
  const _hasCur=!!mon[_curMK];
  let _thisMonthSec='';
  if(_hasCur){
    const _mtdLock=mon[_curMK].lock,_mtdDays=mon[_curMK].days,_mtdRev=mon[_curMK].rev;
    const _mtdAvg=_mtdDays?_mtdLock/_mtdDays:0;
    const _mtdRevAvg=_mtdDays?_mtdRev/_mtdDays:0;
    const _projLock=Math.round(_mtdAvg*_daysInCur);
    const _projRev=Math.round(_mtdRevAvg*_daysInCur);
    const _pct=Math.round(_daysElapsed/_daysInCur*100);
    const _curLbl=(function(){const p=_curMK.split('-');return mLbl(new Date(p[0],p[1]-1,1));})();
    const _warnBar=_curIncomplete?`
    <div style="grid-column:1/-1;background:rgba(240,165,0,.12);border:1px solid rgba(240,165,0,.35);border-radius:7px;padding:8px 12px;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--gold);margin-bottom:2px">⚠️ เดือน ${_curLbl} ยังไม่จบ — ผ่านไป ${_daysElapsed}/${_daysInCur} วัน (${_pct}%) · ตัวเลขด้านล่างยังไม่ครบเดือน</div>`:'';
    const _progBar=_curIncomplete?`
    <div style="grid-column:1/-1;margin:8px 0 2px"><div style="display:flex;justify-content:space-between;font-size:10px;color:var(--ink3);margin-bottom:4px"><span>ความคืบหน้าเดือน ${_curLbl}</span><span>${_daysElapsed}/${_daysInCur} วัน</span></div><div style="height:8px;background:var(--surface2);border-radius:4px;overflow:hidden"><div style="width:${_pct}%;height:100%;background:var(--gold)"></div></div></div>`:'';
    const _projCard=_curIncomplete?`
      <div class="fc-card" style="background:rgba(74,158,255,.08);border-color:rgba(74,158,255,.28)"><div class="fc-val" style="color:var(--blue)">${fmtN(_projLock)}</div><div class="fc-lbl">ล็อกคาดทั้งเดือน (ถ้าคงเพซนี้)</div></div>`:'';
    const _curRevCards=_fcRev?`
      <div class="fc-card"><div class="fc-val">${fmtN(_mtdRevAvg)}</div><div class="fc-lbl">รายรับเฉลี่ย/วัน ${_curIncomplete?'ตอนนี้':''} (฿)</div></div>
      ${_curIncomplete?`<div class="fc-card" style="background:rgba(74,158,255,.08);border-color:rgba(74,158,255,.28)"><div class="fc-val" style="color:var(--blue)">${fmtN(_projRev)}</div><div class="fc-lbl">รายรับคาดทั้งเดือน (฿)</div></div>`:`<div class="fc-card"><div class="fc-val">${fmtN(_mtdRev)}</div><div class="fc-lbl">รายรับรวมทั้งเดือน (฿)</div></div>`}`:'';
    _thisMonthSec=`
    ${_warnBar}
    <div style="grid-column:1/-1;font-size:12px;font-weight:700;color:var(--ink2);margin:4px 0 0">📅 เดือนนี้ — ${_curLbl} ${_curIncomplete?'(คาดทั้งเดือน)':'(จบแล้ว · ยอดจริง)'}</div>
    <div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
      <div class="fc-card"><div class="fc-val">${fmtN(_mtdLock)}</div><div class="fc-lbl">${_curIncomplete?`ล็อกสะสม (ถึงวันที่ ${_daysElapsed})`:'ล็อกรวมทั้งเดือน'}</div></div>
      <div class="fc-card"><div class="fc-val">${fmtN(_mtdAvg,1)}</div><div class="fc-lbl">ล็อกเฉลี่ย/วัน ${_curIncomplete?'ตอนนี้':''}</div>${_pace(_mtdAvg)}</div>
      ${_projCard}
      ${_curRevCards}
    </div>
    ${_progBar}`;
  }
  const _revCards=_fcRev?`
      <div class="fc-card"><div class="fc-val">${fmtN(avgRev)}</div><div class="fc-lbl">รายรับเฉลี่ย/วัน (฿)</div></div>
      <div class="fc-card"><div class="fc-val">${fmtN(fcRev)}</div><div class="fc-lbl">รายรับคาดทั้งเดือน ${_nextLbl} (฿)</div></div>`:'';
  document.getElementById('fcCards').innerHTML=`
    ${_thisMonthSec}
    <div style="grid-column:1/-1;font-size:12px;font-weight:700;color:var(--ink2);margin:10px 0 0">🔮 เดือนหน้า — ${_nextLbl} (เต็มเดือนปฏิทิน ${_daysInNext} วัน)</div>
    <div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
      <div class="fc-card"><div class="fc-val">${fmtN(avgLock,1)}</div><div class="fc-lbl">ล็อกเฉลี่ย/วัน (${last3.length} เดือนเต็ม)</div></div>
      <div class="fc-card" style="background:rgba(61,214,140,.08);border-color:rgba(61,214,140,.28)"><div class="fc-val" style="color:var(--green)">${fmtN(fcLock)}</div><div class="fc-lbl">ล็อกคาดทั้งเดือน ${_nextLbl}</div></div>
      ${_revCards}
    </div>
  `;
  document.getElementById('fcNote').innerHTML=`ฐานพยากรณ์: ค่าเฉลี่ยต่อวันของ <strong>${last3.map(k=>{const[y,m]=k.split('-');return mLbl(new Date(y,m-1,1));}).join(', ')}</strong>${_curIncomplete?' (ไม่รวมเดือนปัจจุบันที่ยังไม่จบ)':''} → คูณจำนวนวันของเดือน ${_nextLbl} (${_daysInNext} วัน) | ทั้ง 2 การ์ดอิงเดือนปฏิทิน เทียบกับยอดจริงรายเดือนได้ตรง | เป็นการพยากรณ์จากสถิติย้อนหลังเท่านั้น`;
  // ตั้งค่า default ล็อก/วัน จากพยากรณ์
  const wiInput=document.getElementById('wiLock');
  if(wiInput&&!wiInput.value) wiInput.value=Math.round(avgLock);
  calcWhatIf();
  dChart('cFC');
  charts.cFC=makeChart('cFC',{type:'line',data:{labels:[...mks.map(k=>{const[y,m]=k.split('-');return mLbl(new Date(y,m-1,1));}),_nextLbl+' (คาด)'],datasets:[
    {label:'ล็อกจริง',data:[...mks.map(k=>mon[k].lock)],borderColor:'rgba(74,158,255,.9)',backgroundColor:'rgba(74,158,255,.05)',borderWidth:2,pointRadius:2.5,fill:true,tension:.3},
    {label:'ล็อกพยากรณ์',data:[...mks.map(()=>null),fcLock],borderColor:'rgba(240,165,0,.9)',borderWidth:2,borderDash:[5,3],pointRadius:5,pointStyle:'star',fill:false},
  ]},options:cOpts()});
  dChart('cAvg');
  charts.cAvg=makeChart('cAvg',{type:'bar',data:{labels:mks.map(k=>{const[y,m]=k.split('-');return mLbl(new Date(y,m-1,1));}),datasets:[{label:'ล็อกเฉลี่ย/วัน',data:mks.map(k=>+(mon[k].lock/mon[k].days).toFixed(1)),backgroundColor:'rgba(61,214,140,.7)',borderRadius:3}]},options:cOpts()});
}


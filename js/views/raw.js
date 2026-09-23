// ============================================================
// views/raw.js — ตารางข้อมูลดิบ                                                   [เดิม 3387-3418]
// ============================================================
// ── RAW ──
function renderRaw(d){
  document.getElementById('rawCount').textContent=`แสดง ${Math.min(d.length,200)} จาก ${d.length} แถว`;
  document.getElementById('rawTbl').innerHTML=d.slice(0,200).map(r=>{
    const wk=isWknd(r.date),fd=r.freeDay;
    const net=Math.max(0,r.onlineLock-r.absentLock-r.cancelLock);
    const{po,pw}=lockPrices(r.date,zone); // ST (และ zone=all) หรือ Car/Non ตามโซน
    const rv=revST(r)+revNon(r);
    const cancelShow = zone==='st' ? r.cancelLock : zone==='non' ? (r.nonCancelLock||0) : (r.cancelLock||0)+(r.nonCancelLock||0);
    const absentShow = zone==='st' ? r.absentLock : zone==='non' ? (r.nonAbsentLock||0) : (r.absentLock||0)+(r.nonAbsentLock||0);
    return`<tr>
      <td style="color:${fd?'var(--gold)':wk?'var(--green)':'var(--ink)'}">${fmtD(r.date)}</td>
      <td style="color:${wk?'var(--gold)':'var(--ink2)'}">${DAYS[r.date.getDay()]}</td>
      <td class="num">${fmtN(net)}</td>
      <td class="num">${fmtN(r.walkInLock)}</td>
      <td class="num">${r.extraLock||'—'}</td>
      <td class="num" style="color:var(--purple)">${r.nonLock||'—'}</td>
      <td class="num" style="color:var(--red)">${cancelShow||'—'}</td>
      <td class="num" style="color:var(--red)">${absentShow||'—'}</td>
      <td class="num col-rev" style="color:var(--ink3);font-size:10px">${fd?`${po/2}/${rainHalvesWalkIn()?pw/2:pw}`:`${po}/${pw}`}</td>
      <td class="num col-rev" style="font-weight:700;color:var(--green)">${fmtN(rv)}</td>
      <td class="num col-elec">${r.l1+r.l1n>0?fmtN(r.l1+r.l1n):'—'}</td>
      <td class="num col-elec">${r.l2+r.l2n>0?fmtN(r.l2+r.l2n):'—'}</td>
      <td>${fd?'<span class="tag tag-free">วันฝน</span>':wk?'<span class="tag tag-wknd">ศ–อา</span>':'<span class="tag tag-ok">ปกติ</span>'}</td>
    </tr>`;
  }).join('');
}


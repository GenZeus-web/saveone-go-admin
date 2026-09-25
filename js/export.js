// ============================================================
// export.js — ส่งออก CSV                                                           [เดิม 3914-3944]
// ============================================================
// ── EXPORT CSV ──
function exportCSV(){
  const d=getFiltered();
  const branchNames={SS:'ศรีสมาน',BG:'ประตูกรุงเทพ',BN:'บางนา'};
  const header=['วันที่','วัน','สาขา','ออนไลน์สุทธิ','วอคอิน ST','ล็อกเสริม','Non/Car ล็อก','ยกเลิก','ลา','ล็อกรวม','รายรวม','รายรับรวม','ค่าไฟ L1','ค่าไฟ L2','วันฝน','เป้าหมาย','ถึงเป้า'];
  const rows=d.map(r=>{
    const net=Math.max(0,r.onlineLock-r.absentLock-r.cancelLock);
    const totalLock=getLock(r,group);
    const totalRai=getRai(r,group);
    const rev=!canSeeRev()?'':Math.round(revST(r)+revNon(r)); // SET-01 + PERM-06: ไม่รู้ราคาจริง / ไม่มีสิทธิ์รายรับ = เว้นว่าง
    const hitTarget=totalLock>=targetLock?'ใช่':'ไม่';
    return[
      fmtD(r.date),DAYS[r.date.getDay()],branchNames[activeBranch]||activeBranch,
      net,r.walkInLock,r.extraLock,r.nonLock,
      r.cancelLock,r.absentLock,totalLock,totalRai,rev,
      ...(canSeeElec()?[r.l1+(r.l1n||0),r.l2+(r.l2n||0)]:['','']),   // PERM-07: ไม่มีสิทธิ์ค่าไฟ = เว้นว่าง
      r.freeDay?'ใช่':'ไม่',targetLock,hitTarget
    ];
  });
  const csvContent='﻿'+[header,...rows].map(row=>row.map(v=>`"${v}"`).join(',')).join('\n');
  const blob=new Blob([csvContent],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const brName=branchNames[activeBranch]||activeBranch;
  a.href=url;a.download=`SaveOneGo_${brName}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();URL.revokeObjectURL(url);
}




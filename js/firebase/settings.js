// ============================================================
// firebase/settings.js — หน้าตั้งค่า: ราคา · ฤดูกาล · เป้ายอด · ประวัติการแก้ (SET-01)
// ============================================================
//
// เอกสารใน Firestore
//   settings/pricing   { versions:[ชุดราคา…] }  ชุดราคา = วันเริ่มใช้ + ฤดูกาล + ราคาทุกช่อง
//   settings/targets   { SS:{st,non}, BG:{…}, BN:{…} }
//   settingsLog/{id}   ประวัติการแก้ — เพิ่มได้อย่างเดียว อ่านได้เฉพาะ OWNER_EMAIL
//
// กติกา (ตกลงกับเจ้าของ 23 ก.ย. 2569 · ADR 0001)
//   - ราคาวันที่ผ่านไปแล้วไม่เปลี่ยน: บันทึก = เพิ่มชุดใหม่ที่มีวันเริ่มใช้ เร็วสุดพรุ่งนี้
//   - บันทึก/ยกเลิกราคา ต้องใส่รหัสผ่านทุกครั้ง (reauthenticate กับ Firebase)
//   - ชุดที่รอมีผล ยกเลิกได้จนถึงเที่ยงคืนก่อนวันเริ่มใช้ · ที่มีผลแล้วแก้ย้อนหลังจากเว็บไม่ได้
//   - เป้ายอด แชร์ทุกคน มีผลทันที ไม่ต้องใส่รหัส แต่เก็บประวัติ
//   - โหลดราคาไม่ได้ + ไม่เคยมี cache = ซ่อนรายรับ (ไม่โชว์เลขที่อาจผิด)
//
// ⚠️ ทุกฟังก์ชันที่เขียนข้อมูลเช็ค admin ซ้ำ แต่ด่านจริงคือ Firestore Rules
//    (กฎที่ต้องเพิ่มอยู่ใน docs/firestore-rules-settings.md)
//
// ใช้ฟังก์ชัน/ค่าคงที่จาก classic script ผ่าน global: setPricing, pricingDoc, seasonHas,
//   DEFAULT_PRICING, PRICE_BRANCHES, MONTHS, applySharedTargets, TARGETS, applyAll ฯลฯ

import { auth, db } from "./init.js";
import { EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { doc, getDoc, runTransaction, collection, query, orderBy, limit, getDocs, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const OWNER_EMAIL = 'anansit@saveone.go';
const PRICE_CACHE = 'saveone_pricing_v1';
const WARN_PCT = 30;                       // เปลี่ยนเกินนี้ขึ้นเตือนแดงในหน้ายืนยัน (ไม่เกี่ยวกับรหัสผ่าน)
const BR_NAME = {SS:'ศรีสมาน', BG:'ประตูกรุงเทพ', BN:'บางนา'};
const zoneName = (br,z) => z==='st' ? 'ST' : (br==='SS' ? 'Non' : 'Car');
const KIND = {on:'ออนไลน์', wi:'วอล์กอิน/เสริม'};
const DAYK = ['ธรรมดา','ศ–อา'];

const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const isAdmin = () => window.userRole === 'admin';
const isOwner = () => (auth.currentUser?.email||'').toLowerCase() === OWNER_EMAIL;

// ── วันที่ ──
const todayIso = () => isoDate(new Date());
function addDaysIso(iso, n){ const [y,m,d]=iso.split('-').map(Number); return isoDate(new Date(y,m-1,d+n)); }
function thDate(iso){ const [y,m,d]=iso.split('-').map(Number); return `${d} ${MONTHS[m-1]} ${String(y+543).slice(-2)}`; }
const thMD = ([m,d]) => `${d} ${MONTHS[m-1]}`;

// ── ชุดราคา ──
const versionsSorted = () => [...(pricingDoc().versions||[])].sort((a,b)=>a.effective<b.effective?-1:1);
const latestVersion = () => versionsSorted().slice(-1)[0];
const pendingVersions = () => versionsSorted().filter(v => v.effective > todayIso());
function minEffective(){
  const p = pendingVersions();
  const t = addDaysIso(todayIso(), 1);
  if(!p.length) return t;
  const afterLast = addDaysIso(p[p.length-1].effective, 1);
  return afterLast > t ? afterLast : t;
}

// ── อุปกรณ์ (เก็บในประวัติ "แก้จากที่ไหน") ──
function deviceLabel(){
  const ua = navigator.userAgent || '';
  const os = /iPhone/.test(ua)?'iPhone' : /iPad/.test(ua)?'iPad' : /Android/.test(ua)?'Android'
          : /Windows/.test(ua)?'Windows' : /Mac OS X/.test(ua)?'Mac' : /Linux/.test(ua)?'Linux' : 'ไม่ทราบระบบ';
  const br = /Edg\//.test(ua)?'Edge' : /SamsungBrowser/.test(ua)?'Samsung Internet' : /Firefox\//.test(ua)?'Firefox'
          : /Chrome\//.test(ua)?'Chrome' : /Safari\//.test(ua)?'Safari' : 'เบราว์เซอร์อื่น';
  return `${os} · ${br}`;
}

// ═══════════════════════════════════════════════════════════════
//  โหลดค่าตั้งค่า (เรียกจาก auth.js ก่อน loadAll)
// ═══════════════════════════════════════════════════════════════
let hadCache = false;   // เครื่องนี้เคยได้ชุดราคาจริงมาแล้ว (หรือรู้แน่ว่ายังไม่มีเอกสาร = ใช้ค่าตั้งต้นได้)
export async function loadSettings(){
  hadCache = false;
  try{
    const c = JSON.parse(localStorage.getItem(PRICE_CACHE) || 'null');
    if(c && c.doc){ setPricing(c.doc, 'cache'); hadCache = true; }
    else if(c && c.none){ setPricing(null, 'default'); hadCache = true; }
  }catch(e){ console.warn('settings: cache อ่านไม่ได้', e); }

  lockTargetInputs();
  const job = fetchSettings();
  // มี cache = เปิดเว็บต่อได้เลย ของใหม่มาแล้วค่อยวาดใหม่ · ไม่มี = รอ (อ่าน Firestore < 1 วิ)
  if(hadCache) job.then(changed => { if(changed) rerender(); });
  else await job;
}

async function fetchSettings(){
  try{
    const [p, t] = await Promise.all([getDoc(doc(db,'settings','pricing')), getDoc(doc(db,'settings','targets'))]);
    const before = JSON.stringify(PRICING);
    const pd = p.exists() ? p.data() : null;
    setPricing(pd, pd ? 'fresh' : 'default');
    try{ localStorage.setItem(PRICE_CACHE, JSON.stringify(pd ? {doc:pd} : {none:true})); }catch(e){}
    let changed = before !== JSON.stringify(PRICING);
    if(t.exists()){
      const b2 = JSON.stringify(TARGETS);
      applySharedTargets(t.data());
      if(JSON.stringify(TARGETS) !== b2) changed = true;
    }
    setPriceUnavailable(false);
    return changed;
  }catch(e){
    console.error('settings: โหลดราคาไม่ได้', e);
    // มี cache = ใช้ชุดราคารอบก่อนต่อไป · ไม่เคยมีเลย = ไม่รู้ราคาจริง → ซ่อนรายรับ (Q13)
    if(!hadCache){ setPricing(null, 'failed'); setPriceUnavailable(true); return true; }
    return false;
  }
}

// โหลดราคาไม่ได้เลย → ซ่อนรายรับทุกจุด (CSS body.no-price) + แถบเตือน
function setPriceUnavailable(on){
  document.body.classList.toggle('no-price', on);
  const b = document.getElementById('priceFailBanner');
  if(b) b.style.display = on ? '' : 'none';
}

function rerender(){
  try{
    const mc = document.getElementById('mainContent');
    if(mc && mc.style.display === 'block' && typeof applyAll === 'function') applyAll();
  }catch(e){ console.warn('settings: วาดใหม่ไม่สำเร็จ', e); }
}

// ช่องเป้าในไซด์บาร์: admin แก้ได้ · คนอื่นดูอย่างเดียว
function lockTargetInputs(){
  const admin = isAdmin();
  ['targetInputST','targetInputNon'].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.disabled = !admin; el.style.opacity = admin ? '' : '.6'; }
  });
  const n = document.getElementById('tgtShareNote');
  if(n) n.textContent = admin ? 'เป้าใช้ร่วมกันทุกคน · แก้แล้วมีผลทันที' : 'เป้าใช้ร่วมกันทุกคน · แก้ได้เฉพาะ admin';
}

// ═══════════════════════════════════════════════════════════════
//  เป้ายอด — บันทึกทันที ไม่ต้องใส่รหัส แต่เก็บประวัติ
// ═══════════════════════════════════════════════════════════════
window.saveSharedTargets = async function(T, before){
  if(!isAdmin()) return;
  const email = auth.currentUser?.email || '';
  const changes = [];
  PRICE_BRANCHES.forEach(b => ['st','non'].forEach(z => {
    const a = before?.[b]?.[z], n = T[b]?.[z];
    if(a !== n) changes.push({label:`เป้า ${b} · ${zoneName(b,z)}`, from:a ?? null, to:n});
  }));
  if(!changes.length) return;
  try{
    await runTransaction(db, async tx => {
      tx.set(doc(db,'settings','targets'), {...clone(T), updatedAt:serverTimestamp(), updatedBy:email});
      tx.set(doc(collection(db,'settingsLog')), {at:serverTimestamp(), by:email, device:deviceLabel(),
        action:'target_save', effective:null, changes});
    });
    toast('บันทึกเป้ายอดแล้ว · ทุกคนเห็นค่านี้');
  }catch(e){
    console.error('บันทึกเป้าไม่สำเร็จ', e);
    toast('❌ บันทึกเป้าไม่สำเร็จ: ' + errText(e), true);
  }
};

// ═══════════════════════════════════════════════════════════════
//  หน้าตั้งค่า
// ═══════════════════════════════════════════════════════════════
const S = { tab:'price', br:'SS', draft:null, baseId:null, effective:'' };

window.openSettings = function(){
  if(!isAdmin()) return;
  if(typeof window.closeProfMenu === 'function') window.closeProfMenu();
  resetDraft();
  S.tab = 'price';
  S.br = (window.userBranches||['SS'])[0] || 'SS';
  const m = document.getElementById('settingsModal');
  if(m) m.style.display = 'flex';
  render();
};
window.closeSettings = function(){
  const m = document.getElementById('settingsModal');
  if(m) m.style.display = 'none';
  closeConfirm();
};
function resetDraft(){
  const lv = latestVersion();
  S.draft = clone({seasons:lv.seasons, prices:lv.prices});
  S.baseId = lv.id;
  S.effective = minEffective();
}
window.setTab = function(t){ S.tab = t; render(); if(t==='history') loadHistory(); };
window.setBr = function(b){ S.br = b; render(); };

function render(){
  const body = document.getElementById('setBody');
  if(!body) return;
  const tabs = [['price','💰 ราคา'],['season','📅 ฤดูกาล'],['target','🎯 เป้ายอด']];
  if(isOwner()) tabs.push(['history','🗂 ประวัติการแก้']);
  let h = `<div class="vtabs set-tabs">${tabs.map(([k,l]) =>
    `<button class="vtab${S.tab===k?' active':''}" onclick="setTab('${k}')">${l}</button>`).join('')}</div>`;
  if(S.tab==='price' || S.tab==='season'){
    h += pendingHtml() + branchPills();
    h += S.tab==='price' ? priceHtml() : seasonHtml();
    h += saveBarHtml();
  }else if(S.tab==='target'){
    h += targetHtml();
  }else{
    h += `<div id="setHistory" class="set-muted">กำลังโหลดประวัติ…</div>`;
  }
  body.innerHTML = h;
}

function branchPills(){
  return `<div class="set-pills">${PRICE_BRANCHES.map(b =>
    `<button class="set-pill${S.br===b?' on':''}" onclick="setBr('${b}')">${b} · ${BR_NAME[b]}</button>`).join('')}</div>`;
}

// ── การเปลี่ยนที่รอมีผล ──
function pendingHtml(){
  const p = pendingVersions();
  if(!p.length) return '';
  return `<div class="set-pending"><div class="set-h">⏳ การเปลี่ยนราคาที่รอมีผล</div>${p.map(v => `
    <div class="set-prow">
      <div><b>ตั้งแต่ ${thDate(v.effective)}</b>
        <span class="set-muted"> · ยกเลิกได้ถึง 23:59 ของ ${thDate(addDaysIso(v.effective,-1))} · บันทึกโดย ${esc(v.savedBy||'—')}</span>
        <div class="set-muted">${(v.summary||[]).slice(0,4).map(esc).join('<br>')}${(v.summary||[]).length>4?`<br>…และอีก ${v.summary.length-4} รายการ`:''}</div>
      </div>
      <button class="set-btn danger" onclick="askCancel('${esc(v.id)}')">ยกเลิก</button>
    </div>`).join('')}</div>`;
}

// ── แท็บราคา ──
function priceHtml(){
  const br = S.br, lv = latestVersion();
  const seasons = S.draft.seasons[br] || [];
  const inp = (sk,z,k,i) => {
    const v = S.draft.prices[br]?.[sk]?.[z]?.[k]?.[i];
    const old = lv.prices?.[br]?.[sk]?.[z]?.[k]?.[i];
    const ch = old !== undefined && v !== old;
    return `<input type="number" min="0" max="99999" class="set-num${ch?' changed':''}" value="${v ?? ''}"
      title="${old!==undefined?'เดิม '+old:'ใหม่'}" onchange="setPrice('${br}','${esc(sk)}','${z}','${k}',${i},this.value)">`;
  };
  return seasons.map(s => `
    <div class="set-card">
      <div class="set-h">${esc(s.name)} <span class="set-muted">· ${thMD(s.from)} – ${thMD(s.to)}</span></div>
      <div class="set-tblwrap"><table class="set-tbl">
        <thead><tr><th>โซน</th><th>ออนไลน์ ธรรมดา</th><th>ออนไลน์ ศ–อา</th><th>วอล์กอิน/เสริม ธรรมดา</th><th>วอล์กอิน/เสริม ศ–อา</th></tr></thead>
        <tbody>${['st','non'].map(z => `<tr><td>${zoneName(br,z)}</td>
          <td>${inp(s.key,z,'on',0)}</td><td>${inp(s.key,z,'on',1)}</td>
          <td>${inp(s.key,z,'wi',0)}</td><td>${inp(s.key,z,'wi',1)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`).join('') +
    `<div class="set-muted">บาท/ล็อก/วัน · ช่องสีทอง = แก้จากราคาชุดล่าสุด · กติกาวันฝนยังเหมือนเดิม (SS ลดครึ่งเฉพาะออนไลน์ · BG/BN ลดครึ่งทุกประเภท)</div>`;
}
window.setPrice = function(br,sk,z,k,i,v){
  const n = Math.max(0, Math.min(99999, parseInt(v)||0));
  const p = S.draft.prices;
  p[br] ??= {}; p[br][sk] ??= {}; p[br][sk][z] ??= {on:[0,0],wi:[0,0]};
  p[br][sk][z][k][i] = n;
  render();
};

// ── แท็บฤดูกาล ──
function seasonHtml(){
  const br = S.br, list = S.draft.seasons[br] || [];
  const mSel = (idx,end,part,val) => `<select class="set-sel" onchange="setSeason(${idx},'${end}',${part},this.value)">${
    part===0 ? MONTHS.map((t,i)=>`<option value="${i+1}"${val===i+1?' selected':''}>${t}</option>`).join('')
             : Array.from({length:31},(_,i)=>`<option value="${i+1}"${val===i+1?' selected':''}>${i+1}</option>`).join('')}</select>`;
  const gaps = coverageGaps(list);
  return list.map((s,idx) => `
    <div class="set-card set-season">
      <input class="set-name" value="${esc(s.name)}" onchange="setSeasonName(${idx},this.value)" maxlength="40">
      <span class="set-muted">ตั้งแต่</span> ${mSel(idx,'from',1,s.from[1])}${mSel(idx,'from',0,s.from[0])}
      <span class="set-muted">ถึง</span> ${mSel(idx,'to',1,s.to[1])}${mSel(idx,'to',0,s.to[0])}
      <span class="set-muted">(${seasonLength(s)} วัน)</span>
      ${list.length>1?`<button class="set-btn danger sm" onclick="removeSeason(${idx})">ลบ</button>`:''}
    </div>`).join('') + `
    <button class="set-btn" onclick="addSeason()">+ เพิ่มฤดูกาล</button>
    <div class="${gaps.length?'set-warn':'set-ok'}">${gaps.length
      ? '⚠️ วันที่ยังไม่อยู่ในฤดูกาลไหนเลย: ' + gaps.map(esc).join(', ') + ' — ต้องครอบให้ครบทั้งปีก่อนบันทึก'
      : '✅ ครอบคลุมทุกวันในปี'}</div>
    <div class="set-muted">วนซ้ำทุกปี · ช่วงทับกัน → ช่วงที่สั้นกว่าชนะ (เช่น เทศกาลที่อยู่ใน Low Season) · ฤดูกาลใหม่ตั้งราคาต่อในแท็บราคา</div>`;
}
window.setSeason = function(idx,end,part,v){ const s=S.draft.seasons[S.br][idx]; s[end][part]=parseInt(v); render(); };
window.setSeasonName = function(idx,v){ S.draft.seasons[S.br][idx].name = String(v).trim() || 'ฤดูกาล'; render(); };
window.addSeason = function(){
  const list = S.draft.seasons[S.br];
  const key = 's' + Date.now().toString(36);
  list.push({key, name:'ฤดูกาลใหม่', from:[4,10], to:[4,16]});
  const src = S.draft.prices[S.br]?.[list[0].key];           // ราคาตั้งต้นคัดจากฤดูกาลแรก
  S.draft.prices[S.br][key] = clone(src || {st:{on:[0,0],wi:[0,0]},non:{on:[0,0],wi:[0,0]}});
  render();
};
window.removeSeason = function(idx){
  const list = S.draft.seasons[S.br];
  const [s] = list.splice(idx,1);
  if(S.draft.prices[S.br]) delete S.draft.prices[S.br][s.key];
  render();
};
function coverageGaps(list){
  const gaps = []; let start = null, prev = null;
  for(let t=new Date(2024,0,1); t.getFullYear()===2024; t.setDate(t.getDate()+1)){
    const md = [t.getMonth()+1, t.getDate()];
    const hit = list.some(s => seasonHas(s, md[0], md[1]));
    if(!hit){ if(!start) start = md; prev = md; }
    else if(start){ gaps.push(start+''===prev+'' ? thMD(start) : `${thMD(start)}–${thMD(prev)}`); start = null; }
  }
  if(start) gaps.push(start+''===prev+'' ? thMD(start) : `${thMD(start)}–${thMD(prev)}`);
  return gaps;
}

// ── แถบบันทึก ──
function saveBarHtml(){
  const lv = latestVersion();
  const basedOnPending = lv.effective > todayIso();
  return `<div class="set-savebar">
    <label>มีผลตั้งแต่ <input type="date" class="set-date" min="${minEffective()}" value="${S.effective}" onchange="setEff(this.value)"></label>
    <span class="set-muted">${S.effective?thDate(S.effective):''} · วันก่อนหน้านั้นคิดราคาเดิมเสมอ</span>
    ${basedOnPending?`<span class="set-muted">· แก้ต่อจากชุดที่รอมีผล ${thDate(lv.effective)}</span>`:''}
    <span style="flex:1"></span>
    <button class="set-btn" onclick="discardDraft()">ล้างที่แก้</button>
    <button class="set-btn primary" onclick="reviewSave()">ตรวจและบันทึก…</button>
  </div><div id="setErr" class="set-warn" style="display:none"></div>`;
}
window.setEff = function(v){ S.effective = v; render(); };
window.discardDraft = function(){ resetDraft(); render(); };

// ── เทียบของที่แก้กับชุดล่าสุด → รายการเปลี่ยนแปลง ──
function diffDraft(){
  const lv = latestVersion(), out = [];
  PRICE_BRANCHES.forEach(br => {
    const A = lv.seasons?.[br] || [], B = S.draft.seasons[br] || [];
    B.forEach(s => {
      const o = A.find(x => x.key === s.key);
      if(!o) out.push({label:`${br} · เพิ่มฤดูกาล "${s.name}" ${thMD(s.from)} – ${thMD(s.to)}`, from:null, to:null});
      else{
        if(o.name !== s.name) out.push({label:`${br} · เปลี่ยนชื่อฤดูกาล "${o.name}" → "${s.name}"`, from:null, to:null});
        if(o.from+''!==s.from+'' || o.to+''!==s.to+'')
          out.push({label:`${br} · ช่วง ${s.name}: ${thMD(o.from)}–${thMD(o.to)} → ${thMD(s.from)}–${thMD(s.to)}`, from:null, to:null});
      }
    });
    A.forEach(o => { if(!B.find(x => x.key === o.key)) out.push({label:`${br} · ลบฤดูกาล "${o.name}"`, from:null, to:null}); });
    B.forEach(s => ['st','non'].forEach(z => ['on','wi'].forEach(k => [0,1].forEach(i => {
      const was = lv.prices?.[br]?.[s.key]?.[z]?.[k]?.[i];
      const now = S.draft.prices?.[br]?.[s.key]?.[z]?.[k]?.[i];
      if(was !== undefined && was !== now)
        out.push({label:`${br} · ${zoneName(br,z)} · ${s.name} · ${KIND[k]} ${DAYK[i]}`, from:was, to:now});
    }))));
  });
  return out;
}
const pct = c => (c.from ? Math.round((c.to - c.from) / c.from * 100) : (c.to ? 100 : 0));
const changeLine = c => c.from===null ? c.label : `${c.label}: ${c.from} → ${c.to} (${pct(c)>0?'+':''}${pct(c)}%)`;

function validate(){
  const errs = [];
  if(!S.effective || S.effective < minEffective()) errs.push(`วันเริ่มใช้ต้องตั้งแต่ ${thDate(minEffective())} เป็นต้นไป`);
  PRICE_BRANCHES.forEach(br => {
    const list = S.draft.seasons[br] || [];
    if(!list.length) errs.push(`${br}: ต้องมีอย่างน้อย 1 ฤดูกาล`);
    const g = coverageGaps(list);
    if(g.length) errs.push(`${br}: ฤดูกาลยังไม่ครบทั้งปี (${g.join(', ')})`);
    list.forEach(s => ['st','non'].forEach(z => ['on','wi'].forEach(k => [0,1].forEach(i => {
      const v = S.draft.prices?.[br]?.[s.key]?.[z]?.[k]?.[i];
      if(!Number.isInteger(v) || v < 0) errs.push(`${br} · ${s.name}: ราคา ${zoneName(br,z)} ${KIND[k]} ${DAYK[i]} ยังไม่ได้ใส่`);
    }))));
  });
  return errs;
}

// ═══════════════════════════════════════════════════════════════
//  ยืนยันด้วยรหัสผ่าน (ใช้ทั้งบันทึกและยกเลิก)
// ═══════════════════════════════════════════════════════════════
let pendingAction = null;
window.reviewSave = function(){
  const err = document.getElementById('setErr');
  const errs = validate();
  const changes = diffDraft();
  if(!errs.length && !changes.length) errs.push('ยังไม่ได้แก้อะไร');
  if(errs.length){ err.style.display=''; err.innerHTML = errs.slice(0,8).map(esc).join('<br>'); return; }
  const big = changes.filter(c => c.from!==null && Math.abs(pct(c)) > WARN_PCT);
  openConfirm({
    title: 'ยืนยันการเปลี่ยนราคา',
    html: `<div class="set-muted">เปลี่ยน ${changes.length} รายการ</div>
      <ul class="set-diff">${changes.map(c => `<li class="${big.includes(c)?'big':''}">${esc(changeLine(c))}</li>`).join('')}</ul>
      ${big.length?`<div class="set-warn">⚠️ มี ${big.length} รายการที่เปลี่ยนเกิน ${WARN_PCT}% — เช็คอีกรอบว่าพิมพ์ถูก</div>`:''}
      <div class="set-note">📅 <b>มีผลตั้งแต่ ${thDate(S.effective)}</b> · ทุกคนเห็นราคาใหม่ตอนเปิดเว็บ/รีเฟรชครั้งถัดไป<br>
        ↩️ วันก่อน ${thDate(S.effective)} ยังคิดราคาเดิมทุกบาท — ยอดที่รายงานไปแล้วไม่เปลี่ยน<br>
        ⏳ เปลี่ยนใจได้: กดยกเลิกได้ถึง 23:59 ของ ${thDate(addDaysIso(S.effective,-1))}<br>
        🗂 เก็บประวัติ: ${esc(auth.currentUser?.email)} · ${esc(deviceLabel())} · เวลาที่กดบันทึก</div>`,
    okText: 'ยืนยันบันทึก',
    run: () => doSave(changes),
  });
};
window.askCancel = function(id){
  const v = versionsSorted().find(x => x.id === id);
  if(!v) return;
  openConfirm({
    title: 'ยกเลิกการเปลี่ยนราคาที่รอมีผล',
    html: `<div>ยกเลิกชุดที่จะมีผล <b>${thDate(v.effective)}</b></div>
      <ul class="set-diff">${(v.summary||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ul>
      <div class="set-note">ยกเลิกแล้ว วันที่ ${thDate(v.effective)} เป็นต้นไปจะใช้ราคาชุดก่อนหน้าแทน · เก็บประวัติการยกเลิกด้วย</div>`,
    okText: 'ยืนยันยกเลิก',
    danger: true,
    run: () => doCancel(v),
  });
};
function openConfirm(o){
  pendingAction = o;
  const c = document.getElementById('setConfirm');
  c.innerHTML = `<div class="set-dialog">
    <div class="set-h" style="font-size:14px">${esc(o.title)}</div>${o.html}
    <label class="set-pw">🔒 ใส่รหัสผ่านของคุณเพื่อยืนยัน
      <input type="password" id="setPw" autocomplete="current-password" onkeydown="if(event.key==='Enter')runConfirm()"></label>
    <div id="setPwErr" class="set-warn" style="display:none"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="set-btn" onclick="closeConfirm()">กลับไปแก้</button>
      <button class="set-btn ${o.danger?'danger':'primary'}" id="setOk" onclick="runConfirm()">${esc(o.okText)}</button>
    </div></div>`;
  c.style.display = 'flex';
  setTimeout(() => document.getElementById('setPw')?.focus(), 50);
}
window.closeConfirm = closeConfirm;
function closeConfirm(){ const c=document.getElementById('setConfirm'); if(c){ c.style.display='none'; c.innerHTML=''; } pendingAction=null; }
window.runConfirm = async function(){
  if(!pendingAction) return;
  const pw = document.getElementById('setPw').value;
  const errEl = document.getElementById('setPwErr');
  const ok = document.getElementById('setOk');
  if(!pw){ errEl.style.display=''; errEl.textContent='กรุณาใส่รหัสผ่าน'; return; }
  ok.disabled = true; ok.textContent = 'กำลังตรวจรหัสผ่าน…';
  try{
    const u = auth.currentUser;
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pw));
    ok.textContent = 'กำลังบันทึก…';
    await pendingAction.run();
    closeConfirm();
  }catch(e){
    console.error('settings:', e);
    errEl.style.display=''; errEl.textContent = errText(e);
    ok.disabled = false; ok.textContent = pendingAction?.okText || 'ยืนยัน';
  }
};
function errText(e){
  const c = e?.code || '';
  if(c==='auth/wrong-password' || c==='auth/invalid-credential' || c==='auth/invalid-login-credentials') return 'รหัสผ่านไม่ถูกต้อง';
  if(c==='auth/too-many-requests') return 'ใส่รหัสผิดหลายครั้ง ระบบพักไว้ชั่วคราว ลองใหม่ภายหลัง';
  if(c==='permission-denied') return 'ไม่มีสิทธิ์บันทึก (เช็ค Firestore Rules — ดู docs/firestore-rules-settings.md)';
  if(c==='auth/network-request-failed' || c==='unavailable') return 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง';
  return e?.message || String(e);
}

// ── บันทึกชุดราคาใหม่ (transaction: กันสอง admin บันทึกทับกัน) ──
async function doSave(changes){
  const email = auth.currentUser.email;
  const summary = changes.map(changeLine);
  const v = {
    id: 'v' + Date.now().toString(36),
    effective: S.effective,
    seasons: clone(S.draft.seasons),
    prices: clone(S.draft.prices),
    summary, savedBy: email, savedAt: new Date().toISOString(),
  };
  const ref = doc(db,'settings','pricing');
  const saved = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const cur = snap.exists() ? snap.data() : clone(DEFAULT_PRICING);   // บันทึกครั้งแรก = วางราคาเดิมเป็นชุดฐานด้วย
    const vs = cur.versions || [];
    const last = [...vs].sort((a,b)=>a.effective<b.effective?-1:1).slice(-1)[0];
    if(last && last.id !== S.baseId) throw new Error('มีคนบันทึกราคาระหว่างที่คุณแก้อยู่ — ปิดหน้าตั้งค่าแล้วเปิดใหม่เพื่อดูค่าล่าสุด');
    if(vs.some(x => x.effective >= v.effective)) throw new Error('วันเริ่มใช้ต้องหลังชุดที่รอมีผลอยู่แล้ว');
    const next = {versions:[...vs, v], updatedAt:serverTimestamp(), updatedBy:email};
    tx.set(ref, next);
    tx.set(doc(collection(db,'settingsLog')), {at:serverTimestamp(), by:email, device:deviceLabel(),
      action:'price_save', effective:v.effective, versionId:v.id, changes});
    return {versions:[...vs, v]};
  });
  applyLocal(saved);
  resetDraft(); render();
  toast(`บันทึกแล้ว · ราคาใหม่มีผล ${thDate(v.effective)}`);
}

async function doCancel(v){
  const email = auth.currentUser.email;
  const ref = doc(db,'settings','pricing');
  const saved = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if(!snap.exists()) throw new Error('ไม่พบชุดราคา');
    const vs = snap.data().versions || [];
    const t = vs.find(x => x.id === v.id);
    if(!t) throw new Error('ชุดนี้ถูกยกเลิกไปแล้ว');
    if(t.effective <= todayIso()) throw new Error('ชุดนี้มีผลแล้ว ยกเลิกย้อนหลังจากหน้าเว็บไม่ได้');
    const rest = vs.filter(x => x.id !== v.id);
    tx.set(ref, {versions:rest, updatedAt:serverTimestamp(), updatedBy:email});
    tx.set(doc(collection(db,'settingsLog')), {at:serverTimestamp(), by:email, device:deviceLabel(),
      action:'price_cancel', effective:t.effective, versionId:t.id,
      changes:(t.summary||[]).map(s => ({label:s, from:null, to:null}))});
    return {versions:rest};
  });
  applyLocal(saved);
  resetDraft(); render();
  toast(`ยกเลิกชุดราคาที่จะมีผล ${thDate(v.effective)} แล้ว`);
}

function applyLocal(docData){
  setPricing(docData, 'fresh');
  try{ localStorage.setItem(PRICE_CACHE, JSON.stringify({doc:docData})); }catch(e){}
  setPriceUnavailable(false);
  rerender();
}

// ── แท็บเป้ายอด ──
function targetHtml(){
  return `<div class="set-card"><div class="set-tblwrap"><table class="set-tbl">
    <thead><tr><th>สาขา</th><th>ST (ล็อก/วัน)</th><th>Car / Non (ล็อก/วัน)</th></tr></thead>
    <tbody>${PRICE_BRANCHES.map(b => `<tr><td>${b} · ${BR_NAME[b]}</td>
      <td><input type="number" min="0" max="99999" class="set-num" id="tg_${b}_st" value="${TARGETS[b]?.st ?? 0}"></td>
      <td><input type="number" min="0" max="99999" class="set-num" id="tg_${b}_non" value="${TARGETS[b]?.non ?? 0}"></td></tr>`).join('')}</tbody>
  </table></div>
  <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="set-btn primary" onclick="saveTargetsTab()">บันทึกเป้ายอด</button></div></div>
  <div class="set-muted">ทุกคนเห็นเป้าเดียวกัน · มีผลทันที ไม่ต้องใส่รหัสผ่าน · เก็บประวัติการแก้</div>`;
}
window.saveTargetsTab = async function(){
  const before = clone(TARGETS);
  const next = clone(TARGETS);
  PRICE_BRANCHES.forEach(b => ['st','non'].forEach(z => {
    const el = document.getElementById(`tg_${b}_${z}`);
    next[b][z] = Math.max(0, Math.min(99999, parseInt(el?.value)||0));
  }));
  applySharedTargets(next);
  rerender();
  await window.saveSharedTargets(TARGETS, before);
};

// ── แท็บประวัติ (เฉพาะเจ้าของระบบ) ──
async function loadHistory(){
  const box = document.getElementById('setHistory');
  if(!box) return;
  if(!isOwner()){ box.textContent = 'ไม่มีสิทธิ์ดูประวัติ'; return; }
  try{
    const snap = await getDocs(query(collection(db,'settingsLog'), orderBy('at','desc'), limit(300)));
    if(snap.empty){ box.textContent = 'ยังไม่มีประวัติการแก้'; return; }
    const act = {price_save:'💰 บันทึกราคา', price_cancel:'↩️ ยกเลิกราคาที่รอมีผล', target_save:'🎯 แก้เป้ายอด'};
    box.innerHTML = snap.docs.map(d => {
      const x = d.data();
      const at = x.at?.toDate ? x.at.toDate().toLocaleString('th-TH') : '—';
      return `<div class="set-log">
        <div><b>${act[x.action]||esc(x.action)}</b>${x.effective?` · มีผล ${thDate(x.effective)}`:''}</div>
        <div class="set-muted">${esc(at)} · ${esc(x.by)} · ${esc(x.device)}</div>
        <ul class="set-diff">${(x.changes||[]).map(c => `<li>${esc(changeLine(c))}</li>`).join('')}</ul>
      </div>`;
    }).join('');
  }catch(e){
    box.textContent = 'โหลดประวัติไม่ได้: ' + errText(e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  หน้า "หมายเหตุราคา" — สร้างจากชุดราคาจริง (ไม่เขียนตัวเลขไว้ใน HTML อีก)
// ═══════════════════════════════════════════════════════════════
window.renderPriceNote = function(){
  const box = document.getElementById('pnDynamic');
  if(!box) return;
  if(PRICING_STATE === 'failed'){ box.innerHTML = '<div class="set-warn">โหลดราคาไม่ได้ — ลองรีเฟรชหน้าเว็บ</div>'; return; }
  const today = new Date();
  const cur = pricingVersionAt(today);
  const brs = (typeof myBranches === 'function' ? myBranches() : PRICE_BRANCHES);
  const pend = pendingVersions();
  const table = (ver, br) => (ver.seasons?.[br]||[]).map(s => {
    const P = ver.prices?.[br]?.[s.key] || {};
    const row = (z,k) => `<tr><td>${zoneName(br,z)} · ${KIND[k]}</td><td class="price-num">${P[z]?.[k]?.[0] ?? '—'} ฿</td><td class="price-num">${P[z]?.[k]?.[1] ?? '—'} ฿</td></tr>`;
    return `<div style="font-size:10px;color:var(--ink3);margin:8px 0 6px;font-weight:600">${esc(s.name)} (${thMD(s.from)} – ${thMD(s.to)})</div>
      <table class="pn-tbl"><thead><tr><th>ประเภท</th><th>จ–พฤ</th><th>ศ–อา</th></tr></thead>
      <tbody>${row('st','on')}${row('st','wi')}${row('non','on')}${row('non','wi')}</tbody></table>`;
  }).join('');
  box.innerHTML = brs.map(br => {
    const pb = pend.filter(v => (v.summary||[]).some(s => s.startsWith(br+' ')));
    return `<div style="margin-bottom:20px;padding:12px;border-radius:8px;border:1px solid var(--border)">
      <div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:6px">${br} · ${BR_NAME[br]} — ราคาที่ใช้วันนี้</div>
      ${table(cur, br)}
      <div class="fd-mark" style="margin-top:8px;font-size:11px">วันฝน: ${br==='SS'
        ? 'ลด 50% เฉพาะออนไลน์ (ลา/ไม่มา รวมอยู่ในออนไลน์) · วอล์กอิน/ล็อกเสริมราคาเต็ม'
        : 'ลด 50% ทุกประเภท รวมวอล์กอิน/ล็อกเสริม'}</div>
      ${pb.map(v => `<div class="set-pending" style="margin-top:10px"><b>⏳ ตั้งแต่ ${thDate(v.effective)} ราคาจะเปลี่ยน</b>
        <div class="set-muted">${v.summary.filter(s=>s.startsWith(br+' ')).map(esc).join('<br>')}</div></div>`).join('')}
    </div>`;
  }).join('');
};

// ── แจ้งเตือนมุมจอ ──
function toast(msg, bad){
  let t = document.getElementById('setToast');
  if(!t){ t = document.createElement('div'); t.id = 'setToast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'set-toast show' + (bad ? ' bad' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.className = 'set-toast', 4000);
}

document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  const c = document.getElementById('setConfirm');
  if(c && c.style.display === 'flex'){ closeConfirm(); return; }
  const m = document.getElementById('settingsModal');
  if(m && m.style.display === 'flex') window.closeSettings();
});

// ============================================================
// UTIL-02: แอปกรอกเลขไมล์ น้ำ-ไฟ — Apps Script Web App (ผูกกับชีตกลาง UTIL)
// หน้าที่: ลงข้อมูล + เก็บรูปหลักฐานเท่านั้น · ไม่คำนวณ (การคำนวณอยู่เว็บ js/util-calc.js)
// สัญญาข้อมูล: docs/util-data-contract.md · วิธีติดตั้ง: README.md ในโฟลเดอร์นี้
// ============================================================
// ไม่มีความลับในไฟล์นี้: ชีตคือไฟล์ที่สคริปต์ผูกอยู่ · รหัสพนักงานอยู่ในแท็บ staff · โฟลเดอร์รูปหาจากชื่อ
// เข้าแอป = รหัสสาขา + รหัสพนักงาน 6 หลัก (ต้องเป็นคนของสาขานั้น) · รหัสพนักงานไม่ออกนอกชีต (บันทึกเป็น staff_id)
// FS_PROJECT = ชื่อโปรเจกต์ Firebase (สาธารณะ เหมือนใน js/firebase/init.js) · เขียนด้วยสิทธิ์เจ้าของสคริปต์ ไม่มี service account

const TZ = 'Asia/Bangkok';               // ไทย UTC+7 ไม่มีเวลาออมแสง
const FS_PROJECT = 'saveone-go-5fe9d';
const LOG_ROWS = 10;                     // log ในแอป: จดล่าสุดของสาขากี่รายการ
const DEFAULT_ROUNDS = '14:00';          // เวลารอบจด ถ้าแท็บ branches ช่อง rounds ว่าง (เจ้าของเลือก 14 ต.ค.: น้ำวันละรอบ)
const ELEC_WEEKDAY = 1;                  // ไฟจดสัปดาห์ละครั้ง วันนี้ (0 = อาทิตย์ · 1 = จันทร์) เวลา = รอบแรกของสาขา
const ROUND_EARLY_MIN = 60, ROUND_LATE_MIN = 60;   // จดได้ก่อน/หลังเวลารอบกี่นาที (±1 ชม.)
const JUMP_X = 3;                        // เลขเพิ่มเกินกี่เท่าของปกติ → หน้าแอปถามยืนยันก่อนบันทึก (พิมพ์เกิน เช่น 1,211 แทน 1,121)
const RATE_PAIRS = 7, RATE_MIN_PAIRS = 3; // ปกติ = ค่ากลางของช่วงจดล่าสุดกี่ช่วง · ต้องมีอย่างน้อยกี่ช่วง
const BILL_ROWS = 12;                  // หน้าบัญชี: บิลล่าสุดกี่รายการ
const PHOTO_FOLDER_NAME = 'UTIL รูปมิเตอร์'; // อยู่โฟลเดอร์เดียวกับชีต · ไม่มี = สร้างให้
const MONEY_FMT = '#,##0.00';            // รูปแบบช่องยอดเงินในแท็บ bills (ตรงกับแถวเก่าจาก Excel)
const HEAD_ROW = 2, DATA_ROW = 3;        // แถว 1 = ชื่อไทย · แถว 2 = ชื่อคอลัมน์ที่ระบบใช้ · ข้อมูลเริ่มแถว 3
const PIN_MAX_FAIL = 5;                  // รหัสผิดกี่ครั้ง (ต่อสาขา) → ล็อกสาขานั้น
const PIN_LOCK_SEC = 15 * 60;
const SESSION_SEC = 6 * 3600;            // เข้าแอปครั้งเดียว ใช้ได้ 6 ชม.
const PHOTO_MAX_BYTES = 4 * 1024 * 1024; // หน้าเว็บย่อรูปให้แล้ว (~300 KB) · กันคนส่งไฟล์ใหญ่ตรงๆ
// รูปหน้ามิเตอร์: ค่าตั้งต้น = ไม่บังคับ (รอ ผอ. ตัดสิน) · บังคับ = Project Settings → Script properties
//   เพิ่ม PHOTO_REQUIRED = TRUE · มีผลทันที ไม่ต้อง deploy ใหม่

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('จดมิเตอร์ น้ำ-ไฟ')
    // UTIL-20: ไอคอนแท็บ/Android · iPhone ไม่ใช้ตัวนี้ตอนเพิ่มลงหน้าจอโฮม (หน้า meter/ ที่ช่วยได้ เจ้าของไม่เอา — ขั้นตอนเยอะ)
    .setFaviconUrl('https://genzeus-web.github.io/saveone-go-admin/assets/util-app-192.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ── รันจากหน้า editor (▶ setup) หลังวาง/อัปเดตโค้ด · รันซ้ำได้ ไม่สร้างของซ้ำ ──
// เพิ่มคอลัมน์ photo_id + staff_id ในแท็บ readings · สร้างแท็บ staff · หา/สร้างโฟลเดอร์รูป · บอกสิ่งที่ยังขาด
function setup() {
  ensureCol_('readings', 'photo_id', 'รูปหน้ามิเตอร์', 'ไฟล์รูปใน Drive (โฟลเดอร์ ' + PHOTO_FOLDER_NAME + '/สาขา/เดือน) · แอปใส่ให้เอง');
  ensureCol_('readings', 'staff_id', 'รหัสคนจด', 'staff_id ของคนจด (แท็บ staff) · แอปใส่ให้เอง');
  ensureStaff_();
  ensureCol_('staff', 'role', 'บทบาท', 'ว่าง/meter = จดมิเตอร์ · acct = บัญชีกรอกบิล · admin = ทั้งสองอย่าง');
  ensureCol_('branches', 'rounds', 'เวลารอบจด', 'เช่น 14:00,01:00 · ว่าง = ' + DEFAULT_ROUNDS + ' · จดได้ก่อน/หลังรอบ 1 ชม.');
  ensureCol_('bills', 'entered_by', 'กรอกโดย', 'แอปใส่ให้เอง (หน้าบัญชี) · แถวเก่าจาก Excel เว้นว่าง');
  ensureCol_('bills', 'entered_at', 'เวลากรอก', 'แอปใส่ให้เอง');
  ensureCol_('bills', 'status', 'สถานะ', 'ว่าง = ใช้ · void = ยกเลิก (ไม่นับ ไม่ส่งขึ้นเว็บ)');
  const bt = table_('bills');                                        // แถวที่แอปเคยบันทึกก่อนมีรูปแบบเงิน (ขึ้น 7954)
  if (bt.rows.length) bt.sh.getRange(DATA_ROW, bt.idx.amount_incl_vat + 1, bt.rows.length, 1).setNumberFormat(MONEY_FMT);
  Logger.log('โฟลเดอร์รูป: ' + photoRoot_().getUrl());
  Logger.log('บังคับถ่ายรูป: ' + (photoRequired_() ? 'ใช่' : 'ไม่ (ตั้ง PHOTO_REQUIRED = TRUE เพื่อบังคับ)'));
  const staff = table_('staff').rows.filter(s => truthy_(s.active) && code_(s.emp_code));
  Logger.log('คนที่เข้าแอปได้: ' + (staff.map(s => s.staff_id + ' ' + s.name + ' (' + (isAll_(s) ? 'ทุกสาขา' : s.branch_code) + ')').join(', ')
    || 'ยังไม่มี · เพิ่มในแท็บ staff'));
  staff.filter(s => !String(s.staff_id || '').trim())
    .forEach(s => Logger.log('⚠️ ' + s.name + ' (' + s.branch_code + ') ไม่มี staff_id · ใส่ก่อน (เช่น ' + s.branch_code + '01)'));
  // รหัสซ้ำในสาขาเดียวกัน (คน * นับว่าอยู่ทุกสาขา) = เข้าไม่ได้ทั้งคู่
  const brs = table_('branches').rows.map(b => String(b.branch_code)).filter(Boolean);
  brs.forEach(br => {
    const seen = {};
    staff.filter(s => inBranch_(s, br)).forEach(s => { const k = code_(s.emp_code); (seen[k] = seen[k] || []).push(s.staff_id); });
    Object.keys(seen).filter(k => seen[k].length > 1)
      .forEach(k => Logger.log('⚠️ รหัสพนักงานซ้ำในสาขา ' + br + ': ' + seen[k].join(', ')));
  });
}

// เพิ่มคอลัมน์ท้ายแท็บ (แถว 1 ชื่อไทย · แถว 2 คีย์) ถ้ายังไม่มี
function ensureCol_(tab, key, thai, note) {
  const sh = sheet_(tab);
  const cols = sh.getLastColumn();
  if (sh.getRange(HEAD_ROW, 1, 1, cols).getValues()[0].indexOf(key) >= 0) return;
  sh.getRange(1, cols + 1).setValue(thai);
  sh.getRange(HEAD_ROW, cols + 1).setValue(key);
  sh.getRange(1, cols, 2, 1).copyFormatToRange(sh, cols + 1, cols + 1, 1, 2);
  sh.getRange(1, cols + 1).setNote(note);
}

// แท็บ staff: 1 แถว = 1 คนต่อ 1 สาขา (รู้ว่าใครจด · ปิดเฉพาะคนที่ลาออกได้)
//   emp_code = รหัสพนักงาน 6 หลัก ใช้เข้าแอป → อยู่ในชีตนี้ที่เดียว · staff_id = รหัสสั้นที่บันทึกลง readings/เว็บ
function ensureStaff_() {
  const ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName('staff')) return;
  const sh = ss.insertSheet('staff');
  sh.getRange(1, 1, 2, 5).setValues([
    ['รหัสคนจด (ขึ้นเว็บ)', 'ชื่อ', 'สาขา', 'รหัสพนักงาน 6 หลัก (ใช้เข้าแอป)', 'ใช้งาน'],
    ['staff_id', 'name', 'branch_code', 'emp_code', 'active']]);
  sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#DDEFE9').setFontColor('#1F6F5C');
  sh.getRange(2, 1, 1, 5).setFontWeight('bold').setBackground('#1F6F5C').setFontColor('#FFFFFF');
  sh.getRange('D:D').setNumberFormat('@');   // รหัสพนักงานเป็นข้อความ เลข 0 หน้าไม่หาย
  sh.setFrozenRows(2);
  sh.getRange(1, 1).setNote('1 แถว = 1 คนต่อ 1 สาขา · staff_id เช่น BN01 (ไม่ใช่รหัสพนักงาน)\n' +
    'ลาออก = ใช้งาน FALSE (ห้ามลบแถว · รายการเก่ายังอ้างรหัสนี้)\nคนเดียวดูหลายสาขา = แถวละสาขา · ทุกสาขา = ใส่ * ในช่องสาขา');
  sh.getRange(1, 4).setNote('รหัสพนักงาน 6 หลัก = รหัสเข้าแอป · อยู่ในชีตนี้ที่เดียว ไม่ส่งขึ้นเว็บ\nซ่อนแท็บนี้ + Protect range');
}

// ── เรียกจากหน้าเว็บ (google.script.run) ──

// รหัสสาขา + รหัสพนักงาน 6 หลัก → ต้องเป็นคนของสาขานั้น (ใช้รหัสตัวเองเข้าสาขาอื่นไม่ได้)
//   ผิด 5 ครั้งใน 15 นาที → ล็อกเฉพาะสาขานั้น 15 นาที · 6 หลัก = 1,000,000 แบบ ÷ 5 ครั้ง/15 นาที = เดาไม่ทัน
//   สาขาปิด (branches.active = FALSE) → ทุกคนในสาขานั้นเข้าไม่ได้
//   branch_code = * → เข้าได้ทุกสาขาที่เปิดอยู่ (admin/เจ้าของ) · รหัสห้ามซ้ำกับคนในสาขาใดๆ
function login(branch, code) {
  const cache = CacheService.getScriptCache();
  branch = String(branch || '').trim().toUpperCase();
  code = String(code || '').trim();
  const open = {};
  table_('branches').rows.forEach(b => { if (truthy_(b.active)) open[String(b.branch_code)] = String(b.name_th || b.branch_code); });
  if (!open[branch]) throw new Error('ไม่พบรหัสสาขา ' + (branch || '(ว่าง)') + ' หรือสาขายังไม่เปิดใช้');
  const lockKey = 'lock_' + branch, failKey = 'fail_' + branch;
  if (cache.get(lockKey)) throw new Error('ใส่รหัสผิดหลายครั้ง · สาขานี้ลองใหม่อีก 15 นาที');
  const hits = /^\d{6}$/.test(code) ? table_('staff').rows.filter(s =>
    truthy_(s.active) && inBranch_(s, branch) && code_(s.emp_code) === code && String(s.staff_id || '').trim()) : [];
  if (hits.length > 1) throw new Error('รหัสพนักงานนี้ซ้ำกันในสาขา · แจ้ง admin');
  if (!hits.length) {
    const n = Number(cache.get(failKey) || 0) + 1;
    if (n >= PIN_MAX_FAIL) { cache.put(lockKey, '1', PIN_LOCK_SEC); cache.remove(failKey); }
    else cache.put(failKey, String(n), PIN_LOCK_SEC);
    throw new Error('รหัสพนักงานไม่ถูกต้อง หรือไม่ได้อยู่สาขานี้');
  }
  cache.remove(failKey);
  const s = hits[0];
  const me = { id: String(s.staff_id), name: String(s.name || s.staff_id), branch: branch,   // สาขาที่เลือก (คน * เข้าได้หลายสาขา)
               role: role_(s) };
  const token = Utilities.getUuid();
  cache.put('s_' + token, JSON.stringify(me), SESSION_SEC);
  const out = { token: token, branch: me.branch, branchName: open[me.branch], staff: me.name,
                photoRequired: photoRequired_(), canMeter: canMeter_(me), canBill: canBill_(me) };
  if (out.canMeter) Object.assign(out, state_(me));
  if (out.canBill) out.bill = billState_(me);
  return out;
}

function refresh(token) {
  return state_(meterUser_(token));
}

// ── หน้าบัญชี (role acct / admin) ──
// บิลบันทึกต่อท้ายแท็บ bills (ห้ามแก้แถวเก่าจากแอป · ผิด = admin แก้ในชีต)
// กัน: บิลเดือนเดียวกันของมิเตอร์เดียวกันซ้ำ · หน่วย+เงินเท่าเดือนก่อนทุกหลัก (เคยเจอใน Excel เดิม) ต้องกดยืนยัน
function submitBill(token, f) {
  const me = session_(token);
  if (!canBill_(me)) throw new Error('ไม่มีสิทธิ์กรอกบิล');
  f = f || {};
  const month = String(f.bill_month || '').trim();
  const num = v => Number(String(v == null ? '' : v).replace(/[,\s]/g, ''));
  const units = num(f.units), amount = num(f.amount);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('เดือนในบิลไม่ถูกต้อง (เช่น 2026-10)');
  if (String(f.units || '').trim() === '' || !isFinite(units) || units < 0) throw new Error('หน่วยไม่ถูกต้อง');
  if (String(f.amount || '').trim() === '' || !isFinite(amount) || amount < 0) throw new Error('ยอดเงินไม่ถูกต้อง');
  const note = String(f.note || '').trim().slice(0, 200);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const m = billState_().meters.find(x => x.meter_id === f.meter_id);
    if (!m) throw new Error('ไม่พบมิเตอร์นี้');
    const t = table_('bills');
    if (!('status' in t.idx)) throw new Error('ยังไม่ได้รัน setup (ไม่มีคอลัมน์ status ในแท็บ bills)');
    const same = t.rows.filter(r => String(r.meter_id) === m.meter_id && !isVoid_(r));
    if (same.some(r => month_(r.bill_month) === month))
      throw new Error('มีบิล ' + month + ' ของ ' + m.meter_id + ' แล้ว · ผิดให้กด "ยกเลิก" ที่บิลเดิมก่อน แล้วกรอกใหม่');
    const prev = same.filter(r => month_(r.bill_month) < month).sort((a, b) => month_(a.bill_month) < month_(b.bill_month) ? -1 : 1).pop();
    if (prev && Number(prev.units) === units && Number(prev.amount_incl_vat) === amount && f.confirm !== true)
      return { needConfirm: 'หน่วยและยอดเงินเท่ากับบิล ' + month_(prev.bill_month) + ' ทุกหลัก · ตรวจบิลอีกครั้ง ถ้าถูกแล้วกดยืนยัน' };
    const rec = {
      bill_month: "'" + month, branch_code: m.branch_code, type: m.type, meter_id: m.meter_id,
      account_no: m.account_no ? "'" + m.account_no : '', units: units, amount_incl_vat: amount, note: note,
      entered_by: me.name, entered_at: "'" + iso_(new Date())
    };
    const row = t.head.map(h => (h in rec ? rec[h] : ''));
    const at = t.sh.getLastRow() + 1;
    t.sh.getRange(at, 1, 1, row.length).setValues([row]);
    t.sh.getRange(at, t.idx.amount_incl_vat + 1).setNumberFormat(MONEY_FMT);   // ให้ขึ้นแบบ 1,234.50 เหมือนแถวเก่าจาก Excel
  } finally {
    lock.releaseLock();
  }
  return Object.assign({ saved: true }, billState_(me));
}

// ยกเลิกบิล → status = void + หมายเหตุ (ไม่ลบแถว) · ได้เฉพาะบิลที่กรอกผ่านแอป ตามกติกา canCancelBill_
function cancelBill(token, key) {
  const me = session_(token);
  if (!canBill_(me)) throw new Error('ไม่มีสิทธิ์กรอกบิล');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const t = table_('bills');
    if (!('status' in t.idx)) throw new Error('ยังไม่ได้รัน setup (ไม่มีคอลัมน์ status ในแท็บ bills)');
    const r = t.rows.find(x => String(x.entered_at) === String(key) && !isVoid_(x));
    if (!r || !canCancelBill_(me, r)) throw new Error('ยกเลิกไม่ได้ · ไม่ใช่บิลที่คุณกรอก หรือยกเลิกไปแล้ว (ให้ admin แก้ในชีต)');
    t.sh.getRange(r._row, t.idx.status + 1).setValue('void');
    t.sh.getRange(r._row, t.idx.note + 1).setValue(
      (r.note ? r.note + ' · ' : '') + 'ยกเลิกโดย ' + me.name + ' ' + fmt_(new Date(), 'd/M HH:mm'));
  } finally {
    lock.releaseLock();
  }
  return billState_(me);
}

// กติกา: บิลที่กรอกผ่านแอป (มี entered_at) · ของตัวเอง หรือ admin ยกเลิกของใครก็ได้ · แถวเก่าจาก Excel = แก้ในชีต
function canCancelBill_(me, r) {
  if (isVoid_(r) || !String(r.entered_at || '').trim()) return false;
  return me.role === 'admin' || String(r.entered_by) === me.name;
}

// มิเตอร์ของสาขาที่เปิดอยู่ (ให้เลือกตอนกรอกบิล) + บิลล่าสุด
function billState_(me) {
  const open = {};
  table_('branches').rows.forEach(b => { if (truthy_(b.active)) open[String(b.branch_code)] = String(b.name_th || b.branch_code); });
  const meters = table_('meters').rows.filter(m => open[String(m.branch_code)] && truthy_(m.active)).map(m => ({
    meter_id: String(m.meter_id), branch_code: String(m.branch_code), branch_name: open[String(m.branch_code)],
    type: String(m.type), location: String(m.location || ''), account_no: String(m.account_no || '')
  }));
  const recent = table_('bills').rows.slice(-BILL_ROWS).reverse().map(r => ({
    bill_month: month_(r.bill_month), meter_id: String(r.meter_id), units: Number(r.units) || 0,
    amount: Number(r.amount_incl_vat) || 0, by: String(r.entered_by || ''),
    key: String(r.entered_at || ''), void: isVoid_(r), canCancel: !!me && canCancelBill_(me, r)
  }));
  return { meters: meters, recent: recent };
}

// ── รอบจด: ป้าย ✅ จดแล้ว / ⏰ ถึงรอบ / ⚠️ เลยรอบ ──
// รอบปัจจุบัน = รอบที่ช่วงจดได้ (เวลารอบ − 1 ชม.) เริ่มล่าสุด · จดหลังจุดเริ่มนั้น = จดแล้ว
// ยังไม่จด: ภายในเวลารอบ + 1 ชม. = ถึงรอบ · เลยจากนั้นจนถึงรอบถัดไป = เลยรอบ
function rounds_(branch) {
  const b = table_('branches').rows.find(x => String(x.branch_code) === branch) || {};
  return (String(b.rounds || '').trim() || DEFAULT_ROUNDS).split(/[,\s]+/)
    .map(s => /^(\d{1,2})[:.](\d{2})$/.exec(s)).filter(Boolean)
    .map(m => ({ label: ('0' + (+m[1] % 24)).slice(-2) + ':' + m[2], min: (+m[1] % 24) * 60 + (+m[2]) }));
}
function round_(rounds, nowMs) {
  if (!rounds.length) return null;
  const hm = fmt_(new Date(nowMs), 'HH:mm').split(':'), nowMin = (+hm[0]) * 60 + (+hm[1]);
  let best = null;
  rounds.forEach(r => {
    const d = ((nowMin - (r.min - ROUND_EARLY_MIN)) % 1440 + 1440) % 1440;   // นาทีที่ผ่านมาตั้งแต่ช่วงจดเริ่ม
    if (!best || d < best.d) best = { r: r, d: d };
  });
  return { label: best.r.label, start: nowMs - (nowMs % 60000) - best.d * 60000,
           open: best.d <= ROUND_EARLY_MIN + ROUND_LATE_MIN };
}
// ไฟ: รอบเดียวต่อสัปดาห์ (วัน ELEC_WEEKDAY เวลารอบแรก) · จดหลังจุดเริ่มรอบล่าสุด = จดแล้ว ทั้งสัปดาห์
// ยังไม่จด: ภายในเวลารอบ + 1 ชม. ของวันนั้น = ถึงรอบ · หลังจากนั้นจนถึงสัปดาห์ถัดไป = เลยรอบ
function weekRound_(rounds, nowMs) {
  if (!rounds.length) return null;
  const r = rounds[0], p = fmt_(new Date(nowMs), 'u HH:mm').split(/[ :]/);   // u = 1 จันทร์ … 7 อาทิตย์
  const nowMin = ((+p[0]) % 7) * 1440 + (+p[1]) * 60 + (+p[2]);
  const d = ((nowMin - (ELEC_WEEKDAY * 1440 + r.min - ROUND_EARLY_MIN)) % 10080 + 10080) % 10080;
  return { label: 'จันทร์ ' + r.label, start: nowMs - (nowMs % 60000) - d * 60000,
           open: d <= ROUND_EARLY_MIN + ROUND_LATE_MIN };
}

// บันทึก 1 การจด · f = {meter_id, reading, meter_reset, note, photo (data URL · ไม่บังคับ เว้นตั้ง PHOTO_REQUIRED)}
// คนจด = คนที่เข้าแอป (ไม่รับชื่อจากหน้าเว็บ)
function submit(token, f) {
  const me = meterUser_(token);
  f = f || {};
  const reading = Number(String(f.reading == null ? '' : f.reading).replace(/[,\s]/g, ''));
  const reset = f.meter_reset === true;
  const note = String(f.note || '').trim().slice(0, 200);
  if (String(f.reading || '').trim() === '' || !isFinite(reading) || reading < 0) throw new Error('เลขไมล์ไม่ถูกต้อง');
  if (reset && !note) throw new Error('เปลี่ยนมิเตอร์ใหม่ ต้องใส่หมายเหตุ');
  if (!f.photo && photoRequired_()) throw new Error('ต้องถ่ายรูปหน้ามิเตอร์');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // ตรวจกับเลขครั้งก่อน "ในล็อก" — สองคนกดมิเตอร์เดียวกันพร้อมกัน จะไม่ผ่านทั้งคู่
    const m = state_(me).meters.find(x => x.meter_id === f.meter_id);
    if (!m) throw new Error('ไม่พบมิเตอร์นี้ในสาขา');
    if (m.last && reading < m.last.reading && !reset)
      throw new Error('เลขไมล์น้อยกว่าครั้งก่อน (' + m.last.reading + ') · ถ้าเปลี่ยนมิเตอร์ใหม่ ให้ติ๊กช่อง + ใส่หมายเหตุ');
    const t = table_('readings');
    if (!('photo_id' in t.idx) || !('staff_id' in t.idx)) throw new Error('ยังไม่ได้รัน setup (ไม่มีคอลัมน์ photo_id / staff_id)');
    const now = new Date();
    const photoId = f.photo ? savePhoto_(me.branch, m.meter_id, now, f.photo) : '';   // ตรวจครบแล้วค่อยเซฟรูป — ไม่มีรูปค้างที่ไม่มีแถว
    const rec = {
      ts: "'" + iso_(now),                         // ' = เก็บเป็นข้อความ ไม่ให้ชีตแปลงเป็นวันที่
      read_date: "'" + fmt_(now, 'yyyy-MM-dd'),
      branch_code: me.branch, meter_id: m.meter_id, reading: reading, meter_reset: reset,
      recorder: me.name, staff_id: me.id, source: 'app', status: 'ok', note: note, photo_id: photoId
    };
    const row = t.head.map(h => (h in rec ? rec[h] : ''));
    t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  } finally {
    lock.releaseLock();
  }
  return state_(me);
}

// ยกเลิกรายการของตัวเอง → status = void + หมายเหตุว่าใครยกเลิกเมื่อไหร่ (ไม่ลบแถว)
// ได้เฉพาะ: จดผ่านแอป · คนจด = คนที่เข้าแอปอยู่ · ยังเป็นเลขล่าสุดของมิเตอร์ (ยังไม่มีการจดครั้งถัดไป)
//   เลยจากนั้น = admin แก้ในชีต — กันย้อนไปลบเลขที่ทำให้ขึ้นธงรั่วทีหลัง
function cancel(token, meterId, key) {
  const me = meterUser_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const e = state_(me).log.find(x => x.meter_id === meterId && x.key === String(key) && x.canCancel);
    if (!e) throw new Error('ยกเลิกไม่ได้ · มีการจดครั้งถัดไปแล้ว หรือไม่ใช่รายการของคุณ (ให้ admin แก้ในชีต)');
    const t = table_('readings');
    const r = t.rows.find(x => String(x.ts) === e.key && String(x.meter_id) === meterId &&
                               String(x.staff_id) === me.id && String(x.status) !== 'void');
    if (!r) throw new Error('ไม่พบรายการนี้ในชีต');
    t.sh.getRange(r._row, t.idx.status + 1).setValue('void');
    t.sh.getRange(r._row, t.idx.note + 1).setValue(
      (r.note ? r.note + ' · ' : '') + 'ยกเลิกโดย ' + me.name + ' ' + fmt_(new Date(), 'd/M HH:mm'));
  } finally {
    lock.releaseLock();
  }
  return state_(me);
}

// ── ส่งขึ้น Firestore (ทริกเกอร์ทุก 10 นาที · กด ▶ pushToFirestore ทดสอบได้) ──
// data/{สาขา}_UTIL  = เลขไมล์ดิบ + รายการมิเตอร์ (ไม่มีเงิน) · Rules เดิมของ data/ ครอบแล้ว
// utilbill/{สาขา}   = บิล + ยอดเงิน · Rules เปิดให้เฉพาะผู้มีสิทธิ์ยอดเงิน (showUtilMoney · docs/firestore-rules/)
// เขียนด้วย OAuth ของเจ้าของสคริปต์ = ข้าม Rules (แบบเดียวกับ pushToFirestore ของยอดจอง)
function pushToFirestore() {
  const R_COLS = ['ts', 'read_date', 'meter_id', 'reading', 'meter_reset', 'recorder', 'staff_id', 'source', 'status', 'note', 'photo_id'];
  const M_COLS = ['meter_id', 'branch_code', 'type', 'location', 'active'];
  const B_COLS = ['bill_month', 'meter_id', 'type', 'units', 'amount_incl_vat', 'note'];
  const BU_COLS = ['bill_month', 'meter_id', 'type', 'units'];   // UTIL-23: ไม่มีเงิน ไม่มีหมายเหตุ (หมายเหตุบิลอาจมียอดเงิน)
  const readings = table_('readings').rows, meters = table_('meters').rows, bills = table_('bills').rows;
  let ok = 0, fail = 0;
  table_('branches').rows.map(b => String(b.branch_code)).filter(Boolean).forEach(br => {
    try {
      const rs = readings.filter(r => String(r.branch_code) === br);
      const bs = bills.filter(b => String(b.branch_code) === br);
      const bsLive = bs.filter(b => !isVoid_(b));   // บิลที่ยกเลิกไม่ส่ง (csv ไม่มีคอลัมน์ status) · ยกเลิกหมดก็ยังเขียนทับ ไม่ค้างของเก่า
      // ทั้งแท็บว่าง = ชีตน่าจะพัง → ไม่เขียน (กันเอาของว่างทับของดี)
      // สาขาอื่นมีแถว แต่สาขานี้ 0 = ลบจริง → เขียนว่างทับ (15 ต.ค. 69: ลบข้อมูลตัวอย่าง BG หมด แต่เว็บยังโชว์ของเก่า)
      if (rs.length || readings.length) {
        // UTIL-23: หน่วยในบิล (ไม่มียอดเงิน/หมายเหตุ) ไว้ใน data/ ด้วย → ผจก. ที่ไม่มี showUtilMoney เห็นบิลเทียบเดือน + ค่าเฉลี่ยบิลเป็นค่ากลางช่วงแรก
        writeDoc_('data', br + '_UTIL', { csv: csv_(R_COLS, rs),
          metersCsv: csv_(M_COLS, meters.filter(m => String(m.branch_code) === br)),
          billUnitsCsv: csv_(BU_COLS, bsLive), rows: rs.length, branch: br });
        ok++;
      }
      if (bs.length || bills.length) { writeDoc_('utilbill', br, { csv: csv_(B_COLS, bsLive), rows: bsLive.length, branch: br }); ok++; }
      Logger.log(br + ': เลขไมล์ ' + rs.length + ' แถว · บิล ' + bsLive.length + ' แถว (ยกเลิก ' + (bs.length - bsLive.length) + ')');
    } catch (err) {
      Logger.log('FAIL ' + br + ': ' + err);
      fail++;
    }
  });
  Logger.log('-- สรุป: เขียน ' + ok + ' เอกสาร · พลาด ' + fail);
}

function csv_(cols, rows) {
  const cell = v => {
    if (Object.prototype.toString.call(v) === '[object Date]') v = fmt_(v, 'yyyy-MM-dd');
    else if (v === true || v === false) v = v ? 'TRUE' : 'FALSE';
    return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  };
  return [cols.join(',')].concat(rows.map(r => cols.map(c => cell(r[c])).join(','))).join('\n');
}

function writeDoc_(collection, docId, data) {
  const fields = { ts: { integerValue: String(Date.now()) } };
  Object.keys(data).forEach(k => {
    fields[k] = typeof data[k] === 'number' ? { integerValue: String(data[k]) } : { stringValue: String(data[k]) };
  });
  const size = (data.csv || '').length + (data.metersCsv || '').length;
  if (size > 900000) Logger.log('WARN ' + collection + '/' + docId + ' ใหญ่ ' + size + ' ตัวอักษร ใกล้ลิมิต 1 MB · ถึงเวลาแยกปี');
  const url = 'https://firestore.googleapis.com/v1/projects/' + FS_PROJECT +
              '/databases/(default)/documents/' + collection + '/' + encodeURIComponent(docId);
  const res = UrlFetchApp.fetch(url, {
    method: 'patch',              // PATCH ไม่มี updateMask = แทนที่ทั้งเอกสาร
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ fields: fields }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200)
    throw new Error('Firestore ตอบ ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
}

// ── ภายใน ──

function meterUser_(token) {
  const me = session_(token);
  if (!canMeter_(me)) throw new Error('บัญชีนี้ใช้กรอกบิลเท่านั้น');
  return me;
}

function session_(token) {
  const raw = token && CacheService.getScriptCache().get('s_' + token);
  if (!raw) throw new Error('SESSION: หมดเวลา · เข้าแอปใหม่');
  return JSON.parse(raw);
}

// มิเตอร์ของสาขา + เลขครั้งก่อน + log จดล่าสุดของสาขา (อ่านแท็บ readings รอบเดียว)
function state_(me) {
  const ms = table_('meters').rows.filter(m => String(m.branch_code) === me.branch && truthy_(m.active));
  const loc = {};
  ms.forEach(m => { loc[String(m.meter_id)] = String(m.location || m.meter_id); });
  const rows = table_('readings').rows
    .filter(r => String(r.meter_id) in loc && r.reading !== '' && r.reading != null)
    .map(r => ({ r: r, t: when_(r) })).filter(x => x.t != null)
    .sort((a, b) => a.t - b.t);
  const last = {}, hist = {};   // แถว ok ล่าสุด / แถว ok ทั้งหมด (เรียงเวลา) ของแต่ละมิเตอร์
  rows.forEach(x => { if (String(x.r.status) !== 'void') { const id = String(x.r.meter_id); last[id] = x; (hist[id] = hist[id] || []).push(x); } });
  const log = rows.slice(-LOG_ROWS).reverse().map(x => {
    const id = String(x.r.meter_id), isVoid = String(x.r.status) === 'void';
    return {
      meter_id: id, location: loc[id], reading: Number(x.r.reading), at: fmt_(new Date(x.t), 'd/M HH:mm'),
      by: String(x.r.recorder || (x.r.source === 'paper' ? 'ใบจดกระดาษ' : '')), void: isVoid, key: String(x.r.ts || ''),
      canCancel: !isVoid && String(x.r.source) === 'app' && String(x.r.staff_id) === me.id && last[id] === x
    };
  });
  const rs = rounds_(me.branch), rd = round_(rs, Date.now()), wk = weekRound_(rs, Date.now());
  const meters = ms.map(m => {
    const l = last[String(m.meter_id)], r = String(m.type) === 'elec' ? wk : rd;
    return {
      meter_id: String(m.meter_id), type: String(m.type), location: String(m.location || ''),
      last: l ? { reading: Number(l.r.reading), at: fmt_(new Date(l.t), 'd/M HH:mm'), t: l.t } : null,
      rate: rate_(hist[String(m.meter_id)] || []),
      status: !r ? null : (l && l.t >= r.start) ? 'done' : r.open ? 'due' : 'late'
    };
  });
  return { meters: meters, log: log, jumpX: JUMP_X, round: rd && { label: rd.label, open: rd.open },
           week: wk && ms.some(m => String(m.type) === 'elec') ? { label: wk.label } : null };
}

// ใช้ปกติต่อวัน = ค่ากลางของช่วงจดล่าสุด RATE_PAIRS ช่วง (ข้ามเปลี่ยนมิเตอร์ · เลขถอยหลัง · ช่วงสั้นกว่าครึ่งวัน)
// มีไม่ถึง RATE_MIN_PAIRS ช่วง = null → หน้าแอปไม่ถามยืนยัน (มิเตอร์ใหม่)
function rate_(xs) {
  const r = [];
  for (let i = xs.length - 1; i > 0 && r.length < RATE_PAIRS; i--) {
    const d = Number(xs[i].r.reading) - Number(xs[i - 1].r.reading), days = (xs[i].t - xs[i - 1].t) / 864e5;
    if (truthy_(xs[i].r.meter_reset) || d < 0 || days < 0.5) continue;
    r.push(d / days);
  }
  if (r.length < RATE_MIN_PAIRS) return null;
  r.sort((a, b) => a - b);
  const k = r.length >> 1;
  return r.length % 2 ? r[k] : (r[k - 1] + r[k]) / 2;
}

// เวลาของแถว: ts (แอป) หรือ read_date 14:00 (ใบจดกระดาษ — ตรงกับ js/util-calc.js)
function when_(r) {
  if (r.ts) { const t = Date.parse(String(r.ts)); if (!isNaN(t)) return t; }
  const isDate = Object.prototype.toString.call(r.read_date) === '[object Date]';
  const d = isDate ? fmt_(r.read_date, 'yyyy-MM-dd') : String(r.read_date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return Date.parse(d + 'T14:00:00+07:00');
}

function savePhoto_(branch, meterId, now, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(dataUrl));
  if (!m) throw new Error('รูปไม่ถูกต้อง');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > PHOTO_MAX_BYTES) throw new Error('รูปใหญ่เกิน 4 MB');
  const folder = sub_(sub_(photoRoot_(), branch), fmt_(now, 'yyyy-MM'));
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = meterId + '_' + fmt_(now, 'yyyyMMdd-HHmmss') + '.' + ext;
  return folder.createFile(Utilities.newBlob(bytes, 'image/' + m[1], name)).getId();
}

function photoRoot_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* ถูกลบ/ย้าย → หาใหม่ */ } }
  const parents = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents();
  const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const f = sub_(parent, PHOTO_FOLDER_NAME);
  props.setProperty('PHOTO_FOLDER_ID', f.getId());
  return f;
}

function sub_(folder, name) {
  const it = folder.getFoldersByName(name);
  return it.hasNext() ? it.next() : folder.createFolder(name);
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบแท็บ ' + name);
  return sh;
}

// อ่านแท็บเป็น object ตามชื่อคอลัมน์แถว 2 — ย้าย/เพิ่มคอลัมน์ได้ไม่พัง
function table_(name) {
  const sh = sheet_(name);
  const cols = sh.getLastColumn(), last = sh.getLastRow();
  const head = sh.getRange(HEAD_ROW, 1, 1, cols).getValues()[0].map(String);
  const idx = {};
  head.forEach((h, i) => { if (h) idx[h] = i; });
  const vals = last >= DATA_ROW ? sh.getRange(DATA_ROW, 1, last - DATA_ROW + 1, cols).getValues() : [];
  const rows = vals.map((r, n) => {                 // _row = เลขแถวในชีต (ใช้ตอนยกเลิก)
    const o = { _row: DATA_ROW + n };
    head.forEach((h, i) => { if (h) o[h] = r[i]; });
    return o;
  });
  return { sh: sh, head: head, idx: idx, rows: rows };
}

function photoRequired_() { return truthy_(PropertiesService.getScriptProperties().getProperty('PHOTO_REQUIRED')); }
function role_(s) { const r = String(s.role || '').trim().toLowerCase(); return r === 'acct' || r === 'admin' ? r : 'meter'; }
function canMeter_(me) { return me.role !== 'acct'; }
function canBill_(me) { return me.role === 'acct' || me.role === 'admin'; }
function month_(v) { return Object.prototype.toString.call(v) === '[object Date]' ? fmt_(v, 'yyyy-MM') : String(v || '').trim(); }
function isAll_(s) { return String(s.branch_code).trim() === '*'; }
function inBranch_(s, br) { return isAll_(s) || String(s.branch_code).trim() === br; }
function isVoid_(r) { return String(r.status || '').trim().toLowerCase() === 'void'; }
function truthy_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }
function code_(v) { const s = String(v == null ? '' : v).trim(); return /^\d{1,6}$/.test(s) ? ('00000' + s).slice(-6) : ''; } // 012345 ที่ชีตแปลงเป็น 12345
function fmt_(d, p) { return Utilities.formatDate(d, TZ, p); }
function iso_(d) { return fmt_(d, "yyyy-MM-dd'T'HH:mm:ss") + '+07:00'; }

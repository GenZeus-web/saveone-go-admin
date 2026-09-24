/**
 * ══════════════════════════════════════════════════════════════
 *  ดึงรายงานคืนค่าล็อกจาก services.saveone.co.th → เขียนลง Google Sheet
 * ══════════════════════════════════════════════════════════════
 *  login → ค้นหาวันนี้ → Export (เรียงเลขล็อค) → แกะ xlsx ในหน่วยความจำ
 *  → แยกโซนอาหาร/รถ → นับออนไลน์/วอล์กอิน/ไม่มา/ลา → เขียนแถวของวันนั้น
 *  ไม่แตะช่องที่กรอกมือ · รอบหลังเขียนทับแถวเดิม ไม่เพิ่มแถวใหม่
 *
 *  ── สถานะ (23 ก.ย. 2569) ──
 *  BG  เขียนจริง · ตั้งเวลา 15/18/22 น. · อยู่ใน Apps Script "ประตูกรุงเทพ"
 *      (โปรเจกต์เดียวกับ pushToFirestore — ดู removeTriggers)
 *  BN  เขียนจริง (เปิด 23 ก.ย.) · ตั้งเวลาผ่านหน้า "ทริกเกอร์" · อยู่ใน Apps Script "บางนา"
 *      manifest ของ BN ไม่มีสิทธิ์ scriptapp → setupTriggers/listTriggers/removeTriggers ใช้ไม่ได้ที่นั่น
 *  ⚠️ Apps Script ไม่ sync กับ git — แก้ไฟล์นี้แล้วต้องวางทับในทั้งสองโปรเจกต์เอง
 *
 *  ── ติดตั้งสาขาใหม่ ──
 *  1) Script Properties: SG_USER_<สาขา> · SG_PASS_<สาขา> · SG_SHEET_<สาขา> (id ไฟล์ชีต)
 *     SG_SHEET_* เว้นได้ถ้าสคริปต์ผูกกับชีตปลายทางอยู่แล้ว
 *  2) showSheetHeaders<สาขา>  ดูชื่อแท็บ/หัวคอลัมน์ (ไม่ยิงเว็บ)
 *  3) approvePage<สาขา>       อนุมัติหน้าตาหน้าเว็บ — อ่าน log ก่อนเชื่อ
 *  4) fetch<สาขา>             ซ้อม เทียบตัวเลขกับหน้าเว็บ → ตรงแล้วลบ dryRun
 *  5) setupTriggers<สาขา>     หรือตั้งผ่านหน้า "ทริกเกอร์" ก็ได้ (ไม่ต้องใช้สิทธิ์ scriptapp)
 *     แล้วแก้ทริกเกอร์ทุกตัว: "การแจ้งเตือนความล้มเหลว" → "แจ้งฉันทันที"
 *     (ค่าตั้งต้นคือสรุปวันละครั้ง — ทุกจุดที่ระบบหยุดเองจะ throw ผ่าน fail_ เพื่อให้อีเมลนี้เด้ง)
 *
 *  ════════ ⚠️ อ่านก่อนแก้โค้ดนี้ ════════
 *  หน้ารายงานของทั้งสองสาขา (BG Zone6 · BN Zone9) มีปุ่ม "คืนเงินจริง" อยู่ด้วย:
 *      RefundButton · Type0Button · Type1Button · Type2Button
 *      OnlyLogeAmountButton
 *  ASP.NET ดูว่า "กดปุ่มไหน" จากชื่อปุ่มที่อยู่ใน POST body
 *  ส่งชื่อผิดไปตัวเดียว = คืนเงินผู้ค้าจริงทั้งตลาด ไม่มี undo
 *  ปุ่มมี confirm() ในเบราว์เซอร์ แต่สคริปต์ POST ตรง = ไม่มีกล่องยืนยัน อย่านับเป็นด่าน
 *
 *  โค้ดนี้จึงส่งได้เฉพาะ ExportTable1Button และมีด่าน assertSafe_()
 *  ตรวจ payload ก่อนยิงทุกครั้ง — ห้ามถอดด่านนี้ออกไม่ว่ากรณีใด
 *
 *  ด่านทั้งหมด (ผิดข้อเดียว = throw ไม่ยิงต่อ):
 *    1) blacklist ชื่อปุ่มคืนเงิน (FORBIDDEN)
 *    2) whitelist ช่องที่ส่งได้ต่อขั้นตอน (ALLOW) + ตรวจค่า + __EVENTTARGET ต้องว่าง
 *    3) ลายนิ้วมือหน้าเว็บ — หน้าเปลี่ยนจากที่อนุมัติ = หยุด (checkPage_)
 *  ติดตั้งครั้งแรก / หลังเว็บเปลี่ยน: ตรวจหน้าเว็บด้วยตา แล้วรัน approvePageBG (หรือ BN)
 *  ══════════════════════════════════════
 */

/* ที่อยู่เว็บแยกต่อสาขา — BG กับ BN เป็นคนละระบบ (คนละ path) ดู SHEETS.*.base */

var F = {                              // ชื่อช่องบนหน้ารายงาน (สำรวจมาแล้ว)
  start  : 'ctl00$CONTENTContentPlaceHolder$StartDateTextBox',
  effect : 'ctl00$CONTENTContentPlaceHolder$EffectiveDateText',
  subzone: 'ctl00$CONTENTContentPlaceHolder$SubZoneDropDownList',
  search : 'ctl00$CONTENTContentPlaceHolder$SearchButton',
  export1: 'ctl00$CONTENTContentPlaceHolder$ExportTable1Button'   // "Export (เรียงเลขล็อค)"
};

/** ชื่อปุ่มที่ห้ามปรากฏใน payload เด็ดขาด — ทุกตัวสั่งคืนเงินจริง */
var FORBIDDEN = ['RefundButton', 'Type0Button', 'Type1Button', 'Type2Button', 'OnlyLogeAmountButton'];

/* ── ด่านที่ 2: whitelist ──
   FORBIDDEN ข้างบนคือ blacklist — กันได้แค่ชื่อที่รู้จัก ถ้าโปรแกรมเมอร์เปลี่ยนชื่อปุ่มคืนเงิน
   blacklist จะไม่รู้ตัว ด่านนี้กลับด้าน: payload ส่งได้ "เฉพาะช่องในรายการนี้" อย่างอื่นหยุดหมด */
var HIDDEN = ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION', '__EVENTTARGET', '__EVENTARGUMENT'];
var ALLOW = {
  signin: HIDDEN.concat(['UsernameTextBox', 'PasswordTextBox', 'SignInButton']),
  search: HIDDEN.concat([F.start, F.effect, F.search]),
  export: HIDDEN.concat([F.start, F.effect, F.export1])
};
/** ปุ่มที่ต้องเจอบนหน้า พร้อมข้อความบนปุ่มตรงเป๊ะ — ถ้าข้อความเปลี่ยน = ปุ่มอาจถูกสลับหน้าที่ */
var REQUIRED_BUTTONS = {};
REQUIRED_BUTTONS[F.search]  = 'ค้นหา';
REQUIRED_BUTTONS[F.export1] = 'Export (เรียงเลขล็อค)';

/* ── ด่านที่ 3: ลายนิ้วมือหน้าเว็บ ──
   ก่อนยิงทุกครั้ง อ่านทุกช่อง/ปุ่มบนหน้า (ชื่อ · id · ชนิด · ข้อความบนปุ่ม · ปลายทาง postback)
   แล้วเทียบกับชุดที่เจ้าของอนุมัติไว้ (approvePageBG) — ต่างกันแม้ตัวเดียว = throw หยุดทันที
   ไม่ยิงอะไรต่อ · Apps Script จะนับเป็น "ล้มเหลว" และส่งอีเมลแจ้งเจ้าของทริกเกอร์เอง */

/* ── โหมดซ้อม ──
   true  = แสดงว่า "จะ" เขียนอะไรลงชีต แต่ยังไม่เขียนจริง
   false = เขียนจริง  ← ตอนนี้อยู่โหมดนี้ (สวิตช์รวม — ซ้อมรายสาขาใช้ SHEETS.*.dryRun)

   เปิดเขียนจริงเมื่อ 22 ก.ย. 2569 หลังตรวจตัวเลขตรงกับของจริงแล้ว
   (วอล์กอิน 6+11=17 · ไม่มา 7+2=9 · ลา 1+0=1 ตรงกับยอดสถานะทุกตัว)

   ถ้าจะแก้โค้ดส่วนคำนวณ ให้กลับมาตั้ง true ทดสอบก่อนเสมอ
   กันเขียนเลขผิดทับของจริง — Google Sheets มีประวัติเวอร์ชันกู้ได้
   แต่ถ้าไม่มีใครสังเกต เลขผิดจะไหลเข้าเว็บไปเรื่อยๆ */
var DRY_RUN = false;

/** ซ้อมรายสาขา — สาขาใหม่ตั้ง dryRun: true ใน SHEETS จนกว่าจะตรวจตัวเลขกับของจริงแล้ว */
function isDry_(branch) { return DRY_RUN || !!(SHEETS[branch] && SHEETS[branch].dryRun); }

/* ── ตั้งค่าต่อสาขา ──
   โค้ดไฟล์นี้ใช้ได้ทั้ง 2 สาขา วางไว้ใน Apps Script ของแต่ละชีตได้เลย
   ต่างกันที่ Script Properties (SG_USER_* / SG_PASS_* / SG_SHEET_*) กับค่าใน SHEETS ด้านล่าง
   (ที่อยู่เว็บ · หน้ารายงาน · กติกาโซน · แท็บปลายทาง · dryRun)
   ทำแบบนี้แทนการเขียนโค้ดแยก 2 เวอร์ชัน เพราะแยกแล้วแก้บั๊กทีหลังจะลืมแก้อีกฝั่ง

   ⚠️ กติกาแยกโซนไม่เหมือนกัน (ยืนยันจาก 5_revenue-calculator.md + หน้าเว็บ)
      BG ใช้ 2 ตัวอักษร: GA-GT อาหาร · GW-GZ เปิดท้าย
      BN ใช้ตัวเดียว:    A-J  อาหาร · U-Z  เปิดท้าย
      ถ้าเอา regex ของ BG ไปใช้กับ BN จะไม่เข้าทั้งคู่ = ได้ 0 ทุกโซน

   id ของไฟล์ชีตอ่านจาก Script Properties ไม่เขียนลงโค้ด (repo นี้ public) */
var SHEETS = {
  BG: {
    name: 'ประตูกรุงเทพ',
    base: 'https://services.saveone.co.th/SaveoneGoAdmin/',
    report: 'ReportRefundZone6_1.aspx',      // ยืนยันแล้ว
    food: /^G[A-T]$/, car: /^G[W-Z]$/,
    sheetFood: 'Report SaveOne Go', sheetCar: 'Report-Car Boot'
  },
  BN: {
    name: 'บางนา',
    /* BN เป็นระบบแยก (SGAdminBangna) ไม่ใช่ SaveoneGoAdmin — เจ้าของให้ลิงก์มา 23 ก.ย. 2569
       เว็บให้มาสองแบบ SGAdminBangna / SGAdminBangNa · IIS ไม่สนตัวพิมพ์ ใช้ตัวเดียวทั้ง login และรายงาน
       ปุ่ม ExportTable1Button ชื่อเดียวกับ BG (ยืนยันจาก element ที่เจ้าของส่งมา) */
    base: 'https://services.saveone.co.th/SGAdminBangna/',
    report: 'ReportRefundZone9_1.aspx',      // Zone9 — ของ BG เป็น Zone6
    food: /^[A-J]$/, car: /^[U-Z]$/,
    sheetFood: 'Report Bangna', sheetCar: 'Bangna - Car Boot',   // ชื่อเดา ใช้สำรองเท่านั้น
    gidFood: 1594662584, gidCar: 299461870    // จากลิงก์ที่เจ้าของส่งมา — เปลี่ยนชื่อแท็บก็ยังเจอ
    /* เปิดเขียนจริง 23 ก.ย. 2569 หลังซ้อม: 201 แถว = มาขาย 193 + เคาท์เตอร์ 3 + ลา 5
       อาหาร 155 + รถ 46 = 201 ไม่มีแถวหลุดโซน · เจ้าของยืนยันกติกาเหมือน BG
       (Online = รวม − วอล์กอิน) — แถวกรอกมือก่อนหน้านี้ใส่ยอดรวมไว้ใน Online ทั้งหมด */
  }
};

// ── จุดเริ่ม (กดรันเอง) ──
function fetchBG() { fetchBranch_('BG', null); }
function fetchBN() { fetchBranch_('BN', null); }

/* ══════════ ตั้งเวลาทำงานอัตโนมัติ 3 รอบ/วัน ══════════
   15:00  รอบแรก — ให้ฝ่ายบริหารเห็นความเคลื่อนไหวก่อน (ตัวเลขยังไม่นิ่ง)
   18:00  รอบสอง — วอล์กอินเข้าครบแล้วตามที่เจ้าของบอก
   22:00  รอบสุดท้าย — ปิดยอดของวัน

   รอบหลังจะ "อัปเดตทับ" แถวเดิมของวันนั้น ไม่ใช่เพิ่มแถวใหม่
   และไม่แตะช่องที่กรอกมือ (ดู upsert_)

   ⚠️ Apps Script ตั้งเวลาได้แค่ "ช่วงชั่วโมง" ไม่ใช่นาทีเป๊ะ
      atHour(15) = รันสักช่วงระหว่าง 15:00-16:00 ไม่ใช่ 15:00:00 ตรง
      เป็นข้อจำกัดของ Google เอง ไม่ใช่โค้ด

   วิธีใช้: รัน setupTriggersBG ครั้งเดียว (หรือ BN) แล้วมันทำงานเองทุกวัน
            ยกเลิกด้วย removeTriggers · ดูว่ามีอะไรอยู่ด้วย listTriggers  */
var RUN_HOURS = [15, 18, 22];

function setupTriggersBG() { setupTriggers_('BG'); }
function setupTriggersBN() { setupTriggers_('BN'); }

/** ฟังก์ชันที่ตัวตั้งเวลาเรียก — ต้องไม่รับพารามิเตอร์ */
function scheduledBG() { fetchBranch_('BG', null); }
function scheduledBN() { fetchBranch_('BN', null); }

/* ══════════ ดึงย้อน "เมื่อวาน" — รอบเช้า / กดรันเองก็ได้ ══════════
   รอบ 22:00 ของเมื่อคืนติดด่าน (เช่น BN 23 ก.ย. 22:35 หน้าเว็บขั้น 2 เปลี่ยน) = ยอดปิดวันไม่ถูกเขียน
   ฟังก์ชันนี้ดึงวันที่ของเมื่อวานซ้ำ แล้ว "เขียนทับ" แถวของวันนั้น (upsert_ — ไม่แตะช่องกรอกมือ)
   เมื่อคืนผ่านอยู่แล้วก็ไม่เสียหาย แค่เขียนเลขเดิมซ้ำ · ติดด่านอีก = throw → อีเมลแจ้งเหมือนรอบปกติ
   ตั้งทริกเกอร์ผ่านหน้า "ทริกเกอร์": yesterdayBN · ตามเวลา · ตัวจับเวลาตามวัน · 07.00–08.00 */
function yesterdayBG() { fetchBranch_('BG', yesterday_()); }
function yesterdayBN() { fetchBranch_('BN', yesterday_()); }

function yesterday_() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(23, 0, 0, 0);       // วันที่ของเมื่อวาน — ชั่วโมงไม่มีผลกับการค้นหา
  return d;
}

function setupTriggers_(branch) {
  var handler = 'scheduled' + branch;
  if (isDry_(branch)) {
    Logger.log('⚠️ ตอนนี้สาขา ' + branch + ' อยู่โหมดซ้อม — ตั้งเวลาไปก็จะไม่เขียนอะไรลงชีต');
    Logger.log('   ตั้งได้ แต่อย่าลืมลบ dryRun: true ออกจาก SHEETS.' + branch + ' ตอนพร้อมใช้จริง\n');
  }
  var existing = projectTriggers_(handler);
  if (!existing) return;                 // ไม่มีสิทธิ์ — บอกวิธีตั้งผ่านหน้าทริกเกอร์แล้ว
  // ลบของเดิมก่อน กันตั้งซ้ำแล้วรันวันละ 6 รอบโดยไม่รู้ตัว
  var removed = 0;
  existing.forEach(function (t) {
    if (t.getHandlerFunction() === handler) { ScriptApp.deleteTrigger(t); removed++; }
  });
  if (removed) Logger.log('ลบตัวตั้งเวลาเดิมของ ' + handler + ' ออก ' + removed + ' ตัว');

  RUN_HOURS.forEach(function (h) {
    ScriptApp.newTrigger(handler).timeBased().atHour(h).nearMinute(0).everyDays(1).create();
    Logger.log('✅ ตั้งเวลา ' + handler + ' รอบ ' + h + ':00 แล้ว');
  });
  Logger.log('\nเสร็จ — จะทำงานเองทุกวัน ' + RUN_HOURS.join(':00 · ') + ':00');
  Logger.log('เวลาที่รันจริงอาจคลาดจากนี้ได้ถึง 1 ชม. (ข้อจำกัดของ Apps Script)');
}

/** อ่านรายการทริกเกอร์ · ถ้า manifest ไม่มีสิทธิ์ script.scriptapp (เช่นโปรเจกต์ "บางนา")
 *  ไม่ปล่อย error ดิบ — บอกวิธีตั้งผ่านหน้า "ทริกเกอร์" แทน แล้วคืน null */
function projectTriggers_(handler) {
  try {
    return ScriptApp.getProjectTriggers();
  } catch (e) {
    if (!/script\.scriptapp/.test(String(e))) throw e;
    var h = handler || 'scheduledBG / scheduledBN';
    Logger.log('⚠️ โปรเจกต์นี้ไม่มีสิทธิ์จัดการทริกเกอร์จากโค้ด (script.scriptapp) — ไม่ได้แตะทริกเกอร์ใดๆ');
    Logger.log('   ตั้งเองได้เลย ไม่ต้องแก้ manifest: แถบซ้าย ⏰ ทริกเกอร์ → + เพิ่มทริกเกอร์ ทำ ' + RUN_HOURS.length + ' รอบ');
    Logger.log('   ฟังก์ชัน ' + h + ' · Head · ตามเวลา · ตัวจับเวลาตามวัน · ช่วง ' +
               RUN_HOURS.map(function (x) { return x + '.00–' + (x + 1) + '.00'; }).join(' / '));
    return null;
  }
}

function listTriggers() {
  var ts = projectTriggers_();
  if (!ts) return;
  if (!ts.length) { Logger.log('ยังไม่มีตัวตั้งเวลา'); return; }
  Logger.log('ตัวตั้งเวลาที่มีอยู่ ' + ts.length + ' ตัว:');
  ts.forEach(function (t) { Logger.log('  • ' + t.getHandlerFunction() + ' (' + t.getEventType() + ')'); });
}

/* ลบเฉพาะตัวตั้งเวลาของไฟล์นี้ (scheduledBG / scheduledBN)
   ⚠️ ห้ามลบทุกตัว — โปรเจกต์ "ประตูกรุงเทพ" มี pushToFirestore (ซิงก์ขึ้นเว็บทุก 10 นาที)
      อยู่ด้วย ถ้าหายไป เว็บจะค้างข้อมูลเก่าเงียบๆ จนกว่าจะมีคนสังเกต */
function removeTriggers() {
  var mine = { scheduledBG: 1, scheduledBN: 1 }, n = 0, kept = [];
  var ts = projectTriggers_();
  if (!ts) return;
  ts.forEach(function (t) {
    var h = t.getHandlerFunction();
    if (mine[h]) { ScriptApp.deleteTrigger(t); n++; } else kept.push(h);
  });
  Logger.log('ลบตัวตั้งเวลาของตัวดึงข้อมูลออก ' + n + ' ตัว');
  if (kept.length) Logger.log('ไม่แตะตัวอื่น: ' + kept.join(', '));
}

/**
 * อ่านหัวคอลัมน์ของชีตปลายทาง — รันก่อนเปิดโหมดเขียนจริง
 * เว็บอ่านชีตด้วย "ชื่อหัวคอลัมน์" (Online_Lock, Cancel_Lock, …) ไม่ใช่ตำแหน่ง
 * ต้องเห็นของจริงก่อนถึงจะแมปได้ถูก ไม่งั้นเขียนผิดช่องแล้วยอดเพี้ยนเงียบๆ
 * ใช้ SG_SHEET_<สาขา> ถ้าตั้งไว้ ไม่งั้นใช้ชีตที่สคริปต์ผูกอยู่ · หาแท็บจาก gid ก่อนชื่อ
 */
function showSheetHeadersBG() { showHeaders_('BG'); }
function showSheetHeadersBN() { showHeaders_('BN'); }

function showHeaders_(branch) {
  var cfg = SHEETS[branch];
  var ss = openBook_(branch);
  if (!ss) {
    Logger.log('❌ ไม่ได้ตั้ง SG_SHEET_' + branch + ' และสคริปต์นี้ก็ไม่ได้ผูกกับชีตไหน');
    Logger.log('   ค่าคือ id ของไฟล์ชีต — ดูจาก URL: docs.google.com/spreadsheets/d/<ตรงนี้>/edit');
    return;
  }
  Logger.log('ไฟล์ชีต: ' + ss.getName());
  Logger.log('ชีตที่มีทั้งหมด: ' + ss.getSheets().map(function (s) { return s.getName() + ' (gid ' + s.getSheetId() + ')'; }).join(' · '));
  [[cfg.sheetFood, cfg.gidFood], [cfg.sheetCar, cfg.gidCar]].forEach(function (t) {
    var sh = sheetOf_(ss, t[0], t[1]);
    Logger.log('\n──── ' + (sh ? sh.getName() : t[0]) + ' ────');
    if (!sh) { Logger.log('❌ ไม่เจอชีตนี้'); return; }
    var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
    var head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    head.forEach(function (h, i) { Logger.log('  ' + colName_(i) + ' = ' + (h || '(ว่าง)')); });
    if (lastRow > 1) {
      var last = sh.getRange(lastRow, 1, 1, lastCol).getDisplayValues()[0];
      Logger.log('  แถวล่าสุด (แถว ' + lastRow + '): ' + JSON.stringify(last));
    }
  });
}
function colName_(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; }

/**
 * @param {string} branch  'BG' | 'BN'
 * @param {Date=}  when    วันขายที่ต้องการ (null = วันนี้)
 */
/* ── หยุดแล้วต้องมีคนรู้ ──
   Apps Script ส่งอีเมลให้เจ้าของทริกเกอร์ "เฉพาะตอน throw" เท่านั้น
   ถ้าหยุดด้วย return เฉยๆ รอบนั้นขึ้น "เสร็จสมบูรณ์" แล้วชีตค้างเลขเก่าไปเรื่อยๆ ไม่มีใครรู้
   ทุกจุดที่ตัวดึงข้อมูลหยุดเองจึงผ่าน fail_ — ข้อความใน throw คือสิ่งที่ขึ้นในอีเมล ต้องอ่านรู้เรื่องในตัว */
function fail_(branch, msg) {
  Logger.log('🔴 ' + msg);
  throw new Error('🔴 สาขา ' + branch + ': ' + msg);
}

function fetchBranch_(branch, when) {
  var cfg = SHEETS[branch];
  if (!cfg) fail_(branch, 'ไม่รู้จักสาขานี้ใน SHEETS');
  if (!cfg.report) fail_(branch, 'ยังไม่รู้ URL หน้ารายงาน — เติมที่ SHEETS.' + branch + '.base / .report');
  var d = when || new Date();
  var ceStr = fmtCE_(d);                       // 22/09/2026 — ใช้ตรวจไฟล์ที่ได้
  var beStr = fmtBE_(d);                       // 22/09/2569 — เว็บรับแบบนี้
  Logger.log('=== ดึงข้อมูลสาขา ' + branch + ' · วันขาย ' + ceStr + ' (พ.ศ. ' + beStr + ') ===');

  if (d.getHours() < 18 && sameDay_(d, new Date())) {
    Logger.log('⚠️ ตอนนี้ยังไม่ถึง 18:00 — วอล์กอินอาจยังเข้าไม่ครบ ตัวเลขจะต่ำกว่าจริง');
  }

  var P = PropertiesService.getScriptProperties();
  var user = P.getProperty('SG_USER_' + branch), pass = P.getProperty('SG_PASS_' + branch);
  if (!user || !pass) fail_(branch, 'ยังไม่ได้ตั้ง SG_USER_' + branch + ' / SG_PASS_' + branch + ' ใน Script Properties');

  var cookie = login_(cfg, user, pass);
  if (!cookie) fail_(branch, 'login เว็บบริษัทไม่ผ่าน — รหัสผ่านถูกเปลี่ยนหรือบัญชีถูกล็อคหรือเปล่า (SG_USER_' + branch + ' / SG_PASS_' + branch + ')');
  Logger.log('✅ login ผ่าน');

  // 1) เปิดหน้ารายงาน เก็บ VIEWSTATE
  var REPORT = cfg.base + cfg.report;
  var r1 = UrlFetchApp.fetch(REPORT, { headers: { Cookie: cookie }, muteHttpExceptions: true });
  if (r1.getResponseCode() !== 200) fail_(branch, 'เปิดหน้ารายงานไม่ได้ HTTP ' + r1.getResponseCode() + ' — เว็บบริษัทล่มหรือย้าย URL');
  Logger.log('✅ เปิดหน้ารายงานแล้ว');
  checkPage_(branch, 1, r1.getContentText());      // หน้าเปลี่ยน = throw ก่อนยิงอะไร

  // 2) กด "ค้นหา" ด้วยวันที่ที่ต้องการ (เลียนแบบคนกดจริง)
  var p2 = readHidden_(r1.getContentText());
  p2[F.start] = beStr;
  p2[F.effect] = beStr;
  p2[F.search] = 'ค้นหา';
  assertSafe_(p2, 'search');
  var r2 = UrlFetchApp.fetch(REPORT, {
    method: 'post', payload: p2, headers: { Cookie: cookie },
    followRedirects: true, muteHttpExceptions: true
  });
  if (r2.getResponseCode() !== 200) fail_(branch, 'กดค้นหาวันที่ ' + beStr + ' ไม่สำเร็จ HTTP ' + r2.getResponseCode());
  Logger.log('✅ ค้นหาวันที่ ' + beStr + ' แล้ว');

  // 3) กด "Export (เรียงเลขล็อค)" — ปุ่มเดียวที่อนุญาต
  checkPage_(branch, 2, r2.getContentText());      // หน้าหลังค้นหามีตารางด้วย จึงแยกลายนิ้วมือ
  var p3 = readHidden_(r2.getContentText());
  p3[F.start] = beStr;
  p3[F.effect] = beStr;
  p3[F.export1] = 'Export (เรียงเลขล็อค)';
  assertSafe_(p3, 'export');
  var r3 = UrlFetchApp.fetch(REPORT, {
    method: 'post', payload: p3, headers: { Cookie: cookie },
    followRedirects: true, muteHttpExceptions: true
  });
  var code = r3.getResponseCode();
  var ct = String(r3.getAllHeaders()['Content-Type'] || r3.getAllHeaders()['content-type'] || '');
  var blob = r3.getBlob();
  var size = blob.getBytes().length;
  Logger.log('→ Export ตอบกลับ HTTP ' + code + ' · ชนิด ' + ct + ' · ขนาด ' + size + ' ไบต์');

  if (code !== 200 || size < 5000) {
    Logger.log('   ตัวอย่างเนื้อหา: ' + r3.getContentText().slice(0, 300).replace(/\s+/g, ' '));
    fail_(branch, 'กด Export แล้วไม่ได้ไฟล์ (HTTP ' + code + ' · ' + size + ' ไบต์) — น่าจะได้หน้า HTML กลับมาแทน');
  }

  // 4) แกะไฟล์อ่านในหน่วยความจำแล้วตรวจ — ไม่ต้องใช้สิทธิ์ Drive
  var rows = parseXlsx_(blob);
  if (!rows.length) fail_(branch, 'แกะไฟล์ Export แล้วไม่เจอข้อมูล');
  Logger.log('✅ แกะไฟล์ได้ ' + (rows.length - 1) + ' แถวข้อมูล');

  var z = verify_(rows, ceStr, cfg);
  if (typeof z === 'string') fail_(branch, z);     // ไฟล์ไม่ผ่านด่าน — ยังไม่เขียนอะไร
  var problems = writeSheet_(branch, ceStr, z);

  /* ด่านล็อคหลุดโซน — เช่นเพิ่มแถวใหม่ที่ตัวอักษรไม่อยู่ในกติกา (BN แถว K–T · BG GU/GV)
     เขียนชีตก่อนแล้วค่อย throw: ยอดโซนที่รู้จักยังอัปเดตตามปกติ ไม่ค้างตัวเลขรอบก่อน
     แต่รอบนี้ขึ้น "ล้มเหลว" → Apps Script ส่งอีเมลแจ้ง ไม่ใช่จบเงียบๆ แค่ใน Logger
     แก้: เพิ่มตัวอักษรนั้นเข้า SHEETS.<สาขา>.food / .car ตามที่อนุมัติโซนจริง */
  if (z.other) {
    problems.push('🟠 วันที่ ' + ceStr + ' มีล็อค ' + z.other +
                  ' ตัวที่ไม่เข้าโซนอาหาร/รถ (' + otherText_(z) + ') — ยอดในชีตขาดล็อคพวกนี้ ' +
                  'ต้องเพิ่มตัวอักษรเข้า SHEETS.' + branch + '.food หรือ .car');
  }
  // รวมทุกปัญหาไว้ในอีเมลฉบับเดียว — แท็บหนึ่งพังไม่ทำให้อีกแท็บไม่ถูกเขียน
  if (problems.length) fail_(branch, problems.join(' · '));
}

function otherText_(z) {
  return Object.keys(z.otherBy).sort().map(function (k) { return k + ' ' + z.otherBy[k]; }).join(' · ');
}

/** เขียนลงชีต ฟอร์แมตเดียวกับ saveDataByBranch ของสคริปต์คำนวณเดิมเป๊ะ
 *  [วันที่, ราย, ล็อก, 0×11, ค่าไฟ, อุปกรณ์, สาขา]  ← 17 ช่อง
 *  11 ช่องกลางเว้นไว้ให้กรอกมือทีหลัง (วอล์กอิน/ไม่มา/ลา/ล็อกเสริม/วันฝน)
 *  คืนรายการปัญหา (ว่าง = เขียนครบทั้ง 2 แท็บ) — แท็บหนึ่งพังยังเขียนอีกแท็บต่อ แล้วค่อยแจ้งรวม */
function writeSheet_(branch, dateStr, z) {
  var cfg = SHEETS[branch];
  var id = PropertiesService.getScriptProperties().getProperty('SG_SHEET_' + branch);
  Logger.log('\n──────── บันทึกลงชีต ────────');
  if (!cfg) return ['ไม่รู้จักสาขา ' + branch];

  if (isDry_(branch)) {
    ['st', 'car'].forEach(function (k) {
      var b = z[k], nm = (k === 'st' ? cfg.sheetFood : cfg.sheetCar);
      Logger.log(nm + ' ←');
      Logger.log('   Online  ' + b.online.rai + ' / ' + b.online.lock +
                 '   WalkIn ' + b.walkin.rai + ' / ' + b.walkin.lock +
                 '   Cancel ' + b.cancel.rai + ' / ' + b.cancel.lock +
                 '   Absent ' + b.absent.rai + ' / ' + b.absent.lock +
                 '   L1 ' + b.elec + '  L2 ' + b.tool);
    });
    Logger.log('\n🟡 โหมดซ้อม — ยังไม่ได้เขียนจริง');
    Logger.log('   ถ้าตัวเลขถูกต้องแล้ว ลบ dryRun: true ออกจาก SHEETS.' + branch + ' (หรือ DRY_RUN เป็น false)');
    return [];                        // ซ้อมอยู่ = ตั้งใจไม่เขียน ไม่ใช่ปัญหา
  }
  /* ถ้าไม่ได้ตั้ง SG_SHEET_* ให้ใช้ชีตที่สคริปต์นี้ผูกอยู่แทน
     (เปิด Apps Script จากในชีตไหน ก็ผูกกับชีตนั้น)
     ลดขั้นตอนตั้งค่าไป 1 อย่าง แต่ยังตั้งเองได้ถ้าอยากเขียนข้ามไฟล์ */
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      Logger.log('❌ ไม่ได้ตั้ง SG_SHEET_' + branch + ' และสคริปต์นี้ก็ไม่ได้ผูกกับชีตไหน');
      Logger.log('   → ใส่ id ของไฟล์ชีตใน Script Properties (ดูจาก URL ของชีต)');
      return ['ไม่ได้ตั้ง SG_SHEET_' + branch + ' และสคริปต์ไม่ได้ผูกกับชีตไหน — ไม่ได้เขียนชีต'];
    }
    Logger.log('ℹ️ ไม่ได้ตั้ง SG_SHEET_' + branch + ' — ใช้ชีตที่สคริปต์ผูกอยู่: ' + ss.getName());
  }
  var problems = [];
  [[cfg.sheetFood, cfg.gidFood, z.st], [cfg.sheetCar, cfg.gidCar, z.car]].forEach(function (t) {
    var sh = sheetOf_(ss, t[0], t[1]);
    if (!sh) {
      var msg = 'ไม่เจอแท็บ "' + t[0] + '"' + (t[1] ? ' (gid ' + t[1] + ')' : '') + ' — แท็บถูกลบหรือเปลี่ยนชื่อ ไม่ได้เขียนแท็บนี้';
      Logger.log('❌ ' + msg); problems.push(msg); return;
    }
    var err = upsert_(sh, dateStr, t[2], cfg.name, sh.getName());
    if (err) problems.push(err);
  });
  return problems;
}

/** หาแท็บจาก gid ก่อน (ไม่พังเมื่อมีคนเปลี่ยนชื่อแท็บ) ไม่มี gid ค่อยหาจากชื่อ */
function sheetOf_(ss, name, gid) {
  if (gid) {
    var hit = ss.getSheets().filter(function (s) { return s.getSheetId() === gid; })[0];
    if (hit) return hit;
  }
  return ss.getSheetByName(name);
}

/** ไฟล์ชีตของสาขา: SG_SHEET_* ถ้าตั้งไว้ ไม่งั้นใช้ชีตที่สคริปต์ผูกอยู่ */
function openBook_(branch) {
  var id = PropertiesService.getScriptProperties().getProperty('SG_SHEET_' + branch);
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

/* ── เขียน/อัปเดตแถวของวันนั้น ──────────────────────────────
   รัน 3 รอบต่อวัน (15:00 · 18:00 · 22:00) แถวเดิมจึงต้อง "อัปเดตทับ"
   ไม่ใช่ "ข้าม" ไม่งั้นผู้บริหารจะเห็นตัวเลขรอบ 15:00 ค้างทั้งวัน

   ── ช่องที่สคริปต์เป็นเจ้าของ (เขียน/อัปเดตทุกรอบ) ──
     Online_Rai · Online_Lock     = ทั้งหมด − วอล์กอิน
     WalkIn_Rai · WalkIn_Lock     = สถานะ "จองหน้าเคาท์เตอร์"
     Cancel_Rai · Cancel_Lock     = สถานะ "ไม่มาขาย"   (ไม่คืนเงิน)
     Absent_Rai · Absent_Lock     = สถานะ "ลาคืนล็อค"  (ไม่คืนเงิน)
     L1_* = ค่าไฟ · L2_* = ค่าอุปกรณ์

   ── ช่องที่ยังต้องกรอกมือ (ห้ามแตะ) ──
     ล็อกเสริม_Rai · ล็อกเสริม-Lock
     ตัดไม่มาทำการค้า_Rai · ตัดไม่มาทำการค้า_Lock   (เว็บไม่ได้อ่านช่องนี้)
     FreeDay
   เขียนทับเมื่อไหร่ข้อมูลที่กรอกหายทันที

   อ้างด้วย "ชื่อหัวคอลัมน์" ไม่ใช่ตำแหน่ง — ถ้าวันหน้ามีคนแทรกคอลัมน์
   จะได้ไม่เขียนผิดช่องแบบเงียบๆ  */
function upsert_(sh, dateStr, c, branchName, label) {
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var col = {};
  head.forEach(function (h, i) { col[String(h).trim()] = i + 1; });

  // ช่องที่สคริปต์เขียน → ค่าที่จะใส่
  var owned = [
    ['Online_Rai',  c.online.rai],  ['Online_Lock', c.online.lock],
    ['WalkIn_Rai',  c.walkin.rai],  ['WalkIn_Lock', c.walkin.lock],
    ['Cancel_Rai',  c.cancel.rai],  ['Cancel_Lock', c.cancel.lock],
    ['Absent_Rai',  c.absent.rai],  ['Absent_Lock', c.absent.lock]
  ];
  var cDate = col['วันที่'];
  var cL1 = findCol_(col, /^L1_/), cL2 = findCol_(col, /^L2_/);
  var missing = owned.filter(function (o) { return !col[o[0]]; }).map(function (o) { return o[0]; });
  if (!cDate || !cL1 || !cL2 || missing.length) {
    Logger.log('❌ "' + label + '" หาหัวคอลัมน์ไม่ครบ: ' + (missing.join(',') || '') +
               (!cDate ? ' วันที่' : '') + (!cL1 ? ' L1_*' : '') + (!cL2 ? ' L2_*' : ''));
    Logger.log('   หัวที่เจอจริง: ' + head.join(','));
    return 'แท็บ "' + label + '" หาหัวคอลัมน์ไม่ครบ (' + (missing.join(',') || '') +
           (!cDate ? ' วันที่' : '') + (!cL1 ? ' L1_*' : '') + (!cL2 ? ' L2_*' : '') + ') — ไม่ได้เขียนแท็บนี้';
  }
  owned.push(['__L1', c.elec]); owned.push(['__L2', c.tool]);
  var colOf = function (key) { return key === '__L1' ? cL1 : key === '__L2' ? cL2 : col[key]; };

  // หาแถวของวันนี้
  var found = 0;
  if (lastRow > 1) {
    var dv = sh.getRange(1, cDate, lastRow, 1).getDisplayValues();
    for (var i = 1; i < dv.length; i++) {
      if (String(dv[i][0]).trim() === dateStr) { found = i + 1; break; }
    }
  }

  if (!found) {
    var row = [];
    for (var k = 0; k < lastCol; k++) row.push(0);
    row[cDate - 1] = dateStr;
    owned.forEach(function (o) { row[colOf(o[0]) - 1] = o[1]; });
    if (col['Branch']) row[col['Branch'] - 1] = branchName;
    sh.appendRow(row);
    Logger.log('✅ "' + label + '" เพิ่มแถวใหม่ ' + dateStr +
               ' — Online ' + c.online.rai + '/' + c.online.lock +
               ' · WalkIn ' + c.walkin.rai + '/' + c.walkin.lock);
    return;
  }

  var before = sh.getRange(found, 1, 1, lastCol).getDisplayValues()[0];
  owned.forEach(function (o) { sh.getRange(found, colOf(o[0])).setValue(o[1]); });
  Logger.log('🔄 "' + label + '" อัปเดตแถว ' + found + ' (' + dateStr + ')');
  Logger.log('     Online ล็อก ' + before[col['Online_Lock'] - 1] + ' → ' + c.online.lock +
             ' · WalkIn ' + before[col['WalkIn_Lock'] - 1] + ' → ' + c.walkin.lock +
             ' · ไม่มา ' + before[col['Cancel_Lock'] - 1] + ' → ' + c.cancel.lock);
  Logger.log('     ไม่แตะ: ล็อกเสริม · ตัดไม่มาทำการค้า · FreeDay');
}

function findCol_(col, re) {
  for (var k in col) if (re.test(k)) return col[k];
  return 0;
}

/** ตรวจว่าไฟล์ที่ได้ถูกวัน ถูกโซน แล้วสรุปตัวเลขที่ชีตต้องใช้
 *  ผ่าน = object ตัวเลข · ไม่ผ่าน = string เหตุผล (fetchBranch_ เอาไปใส่อีเมล) */
function verify_(rows, wantDate, cfg) {
  var H = rows[0], data = rows.slice(1);
  var iDate = H.indexOf('วันที่ขาย'), iLock = H.indexOf('ล็อค');
  var iElec = H.indexOf('ค่าไฟฟ้า'), iTool = H.indexOf('ค่าอุปกรณ์');
  var iStat = H.indexOf('มาขาย/ลา/ไม่มาขาย');
  Logger.log('\n──────── ตรวจไฟล์ ────────');

  /* ด่านหัวคอลัมน์ — ถ้าบริษัทเปลี่ยนชื่อคอลัมน์ indexOf ได้ -1 แล้วโค้ดไม่ error
     แต่เขียนเลขผิดเงียบๆ: ไม่มี "ล็อค" = 0 ทุกช่อง · ไม่มีสถานะ = Online เท่ากับยอดรวม
     ไม่แน่ใจ = หยุด เหมือนด่านอื่น */
  var need = { 'วันที่ขาย': iDate, 'ล็อค': iLock, 'ค่าไฟฟ้า': iElec, 'ค่าอุปกรณ์': iTool, 'มาขาย/ลา/ไม่มาขาย': iStat };
  var lost = Object.keys(need).filter(function (k) { return need[k] < 0; });
  if (lost.length) {
    Logger.log('🔴 หยุด — ไฟล์ Export ไม่มีคอลัมน์: ' + lost.join(' · '));
    Logger.log('   หัวคอลัมน์ที่เจอจริง: ' + H.join(' | '));
    Logger.log('   ไม่เขียนชีต — ต้องแก้ชื่อคอลัมน์ใน verify_ ก่อน');
    return 'ไฟล์ Export ไม่มีคอลัมน์ ' + lost.join(' · ') + ' — บริษัทเปลี่ยนชื่อคอลัมน์ ไม่ได้เขียนชีต';
  }

  // ด่านวันที่ — สำคัญที่สุด กัน VIEWSTATE เพี้ยนแล้วได้ข้อมูลผิดวันเงียบๆ
  var dates = {};
  data.forEach(function (r) { var d = String(r[iDate] || '').slice(0, 10); if (d) dates[d] = (dates[d] || 0) + 1; });
  var keys = Object.keys(dates);
  Logger.log('วันที่ขายในไฟล์: ' + keys.map(function (k) { return k + ' (' + dates[k] + ' แถว)'; }).join(' · '));
  if (keys.length !== 1 || keys[0] !== wantDate) {
    Logger.log('🔴 หยุด — ขอวันที่ ' + wantDate + ' แต่ไฟล์เป็น ' + keys.join(','));
    Logger.log('   อย่าเอาข้อมูลนี้ไปใช้ ต้องแก้ก่อน');
    return 'ขอวันที่ ' + wantDate + ' แต่ไฟล์ได้ ' + (keys.join(', ') || 'ไม่มีข้อมูลเลย') + ' — ไม่ได้เขียนชีต';
  }
  Logger.log('✅ วันที่ตรงกับที่ขอ (' + wantDate + ')');

  /* แยกโซนจากตัวอักษรนำหน้ารหัสล็อค แล้วแยกสถานะในแต่ละโซนอีกชั้น

     กติกาที่เจ้าของยืนยัน (22 ก.ย. 2569):
       จองหน้าเคาท์เตอร์  = วอล์กอิน  (นับล็อกจากคอลัมน์ ล็อค เหมือนกัน)
       Online            = ยอดรวมทั้งหมด − วอล์กอิน   ไม่ใช่นับสถานะ "มาขาย" ตรงๆ
                           เพราะคนไม่มา/ลา ก็จองออนไลน์มาเหมือนกัน แค่ไม่มาขาย
       ไม่มาขาย          → Cancel  (ไม่คืนเงิน เงินเข้าเราแล้ว)
       ลาคืนล็อค         → Absent  (ไม่คืนเงินเหมือนกัน)
     Cancel/Absent เป็น "ส่วนหนึ่งของ Online" ไม่ได้แยกออกมา
     เว็บเอาไปลบเองทีหลัง: net = Online_Lock − Cancel_Lock − Absent_Lock

     ทุกตัวต้องแยก Food / Car เพราะเจ้าของต้องรู้ว่าคนไม่มาอยู่โซนไหน */
  var mkz = function () {
    return { total: { rai: 0, lock: 0 }, walkin: { rai: 0, lock: 0 },
             cancel: { rai: 0, lock: 0 }, absent: { rai: 0, lock: 0 }, elec: 0, tool: 0 };
  };
  var z = { st: mkz(), car: mkz(), other: 0, otherBy: {} };
  var stat = {};
  data.forEach(function (r) {
    var st = String(r[iStat] || '(ว่าง)'); stat[st] = (stat[st] || 0) + 1;
    var codes = String(r[iLock] || '').split(':').filter(function (x) { return x.trim(); });
    if (!codes.length) return;
    var p = (codes[0].match(/^[A-Za-z]+/) || [''])[0].toUpperCase();
    // กติกาแยกโซนต่างกันต่อสาขา — BG ใช้ 2 ตัวอักษร · BN ใช้ตัวเดียว
    var bucket = cfg.food.test(p) ? 'st' : cfg.car.test(p) ? 'car' : null;
    if (!bucket) { z.other += codes.length; z.otherBy[p || '(ไม่มีตัวอักษร)'] = (z.otherBy[p || '(ไม่มีตัวอักษร)'] || 0) + codes.length; return; }
    var b = z[bucket], n = codes.length;
    b.total.rai += 1; b.total.lock += n;
    b.elec += num_(r[iElec]); b.tool += num_(r[iTool]);
    if (st === 'จองหน้าเคาท์เตอร์') { b.walkin.rai += 1; b.walkin.lock += n; }
    else if (st === 'ไม่มาขาย')      { b.cancel.rai += 1; b.cancel.lock += n; }
    else if (st === 'ลาคืนล็อค')     { b.absent.rai += 1; b.absent.lock += n; }
  });
  // Online = ทั้งหมด − วอล์กอิน
  ['st', 'car'].forEach(function (k) {
    z[k].online = { rai: z[k].total.rai - z[k].walkin.rai,
                    lock: z[k].total.lock - z[k].walkin.lock };
  });

  Logger.log('\nสถานะ: ' + Object.keys(stat).map(function (k) { return k + ' ' + stat[k]; }).join(' · '));
  Logger.log('\n──────── ตัวเลขที่ชีตต้องใช้ ────────');
  ['st', 'car'].forEach(function (k) {
    var b = z[k];
    Logger.log('\n── ' + (k === 'st' ? 'Food' : 'Car') + ' ──');
    Logger.log('  ทั้งหมด    ราย ' + b.total.rai + ' · ล็อก ' + b.total.lock);
    Logger.log('  − วอล์กอิน ราย ' + b.walkin.rai + ' · ล็อก ' + b.walkin.lock);
    Logger.log('  = Online   ราย ' + b.online.rai + ' · ล็อก ' + b.online.lock);
    Logger.log('  ไม่มา      ราย ' + b.cancel.rai + ' · ล็อก ' + b.cancel.lock);
    Logger.log('  ลา         ราย ' + b.absent.rai + ' · ล็อก ' + b.absent.lock);
    Logger.log('  ค่าไฟ ' + b.elec + ' · อุปกรณ์ ' + b.tool);
  });
  if (z.other) Logger.log('⚠️ มีล็อค ' + z.other + ' ตัวที่รหัสไม่เข้าทั้ง 2 โซน: ' + otherText_(z));
  /* ไม่มีล็อคเข้าโซนไหนเลย = รหัสล็อคเปลี่ยนรูปแบบ หรือกติกาโซนผิดสาขา
     เขียนไปจะได้ 0 ทับของจริงทั้งแถว — หยุดดีกว่า */
  if (!z.st.total.rai && !z.car.total.rai) {
    Logger.log('🔴 หยุด — ไฟล์มี ' + data.length + ' แถว แต่ไม่มีล็อคเข้าโซนอาหาร/รถเลย');
    Logger.log('   ไม่เขียนชีต — ตรวจรูปแบบรหัสล็อคกับ SHEETS.*.food / .car');
    return 'ไฟล์มี ' + data.length + ' แถว แต่ไม่มีล็อคเข้าโซนอาหาร/รถเลย' +
           (z.other ? ' (' + otherText_(z) + ')' : '') + ' — รหัสล็อคเปลี่ยนรูปแบบ ไม่ได้เขียนชีต';
  }
  return z;
}

/** แกะ .xlsx (เป็น zip) อ่าน sheet แรกออกมาเป็นตาราง — ไม่ต้องใช้สิทธิ์ Drive */
function parseXlsx_(blob) {
  var parts = Utilities.unzip(blob.setContentType('application/zip'));
  var shared = '', sheet = '';
  parts.forEach(function (f) {
    var n = f.getName();
    if (n.indexOf('sharedStrings.xml') !== -1) shared = f.getDataAsString();
    else if (n.indexOf('worksheets/sheet1.xml') !== -1) sheet = f.getDataAsString();
  });
  if (!sheet) return [];

  // ตารางคำที่ Excel เก็บแยกไว้ (cell ที่ t="s" อ้างด้วยเลขลำดับ)
  var SS = [];
  String(shared).split('<si>').slice(1).forEach(function (chunk) {
    var txt = '', m, re = /<t[^>]*>([\s\S]*?)<\/t>/g;
    while ((m = re.exec(chunk)) !== null) txt += m[1];
    SS.push(unesc_(txt));
  });

  var out = [], rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g, rm;
  while ((rm = rowRe.exec(sheet)) !== null) {
    /* ⚠️ ลำดับใน regex นี้สำคัญ: ต้องลอง <c .../> (เซลล์ว่างปิดในตัว) ก่อน
       ถ้าเขียนเป็น /<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/ แบบตรงๆ
       ตัว [^>]* จะกิน "/" ของ /> เข้าไปด้วย แล้ว <\/c> ไปเจอของเซลล์ถัดไป
       = กลืนเซลล์ที่อยู่หลังเซลล์ว่างหายไป
       ไฟล์จริงมีเซลล์ว่างแบบนี้ 555 จุด ใน 190 จาก 628 แถว
       บั๊กนี้ทำให้ล็อกหายไป 421 จาก 1,562 (27%) โดยไม่มี error ให้เห็น */
    var cells = [], cm, cRe = /<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    while ((cm = cRe.exec(rm[1])) !== null) {
      var attr = cm[1] || '', body = cm[2] || '';
      var ref = (attr.match(/r="([A-Z]+)/) || [])[1] || '';
      var idx = colIdx_(ref);
      var isStr = /t="s"/.test(attr);
      var v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      var val = v === undefined ? '' : (isStr ? (SS[parseInt(v, 10)] || '') : v);
      if (val === '' && /t="inlineStr"/.test(attr)) val = unesc_((body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '');
      while (cells.length < idx) cells.push('');
      cells[idx] = val;
    }
    out.push(cells);
  }
  return out;
}
function colIdx_(ref) { var n = 0; for (var i = 0; i < ref.length; i++) n = n * 26 + (ref.charCodeAt(i) - 64); return n - 1; }
function unesc_(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/_x000D_/g, '');
}
function num_(x) { var n = parseFloat(String(x || '').replace(/,/g, '')); return isNaN(n) ? 0 : n; }

/** ด่านกันพลาด — ตรวจ payload ก่อนยิงทุกครั้ง ผิดข้อเดียว = throw ไม่ส่ง
 *  step = 'signin' | 'search' | 'export' (ดู ALLOW) */
function assertSafe_(payload, step) {
  var allow = ALLOW[step];
  if (!allow) throw new Error('🔴 หยุด: ไม่รู้จักขั้นตอน "' + step + '"');
  var stop = function (why) { throw new Error('🔴 หยุด [' + step + ']: ' + why + ' — ไม่ส่งคำขอนี้'); };

  Object.keys(payload).forEach(function (k) {
    // 1) blacklist เดิม — ชื่อปุ่มคืนเงินที่รู้จัก
    FORBIDDEN.forEach(function (f) { if (k.indexOf(f) !== -1) stop('มีปุ่มคืนเงิน "' + k + '"'); });
    // 2) whitelist — ช่องที่ไม่อยู่ในรายการ ห้ามส่ง ต่อให้ชื่อดูไม่อันตราย
    if (allow.indexOf(k) === -1) stop('มีช่องนอกรายการที่อนุญาต "' + k + '"');
    // 3) ตรวจ "ค่า" ด้วย ไม่ใช่แค่ชื่อ — ข้าม VIEWSTATE (base64 ยาว) กับรหัสผ่าน
    if (/^(__VIEWSTATE|__EVENTVALIDATION|PasswordTextBox)$/.test(k)) return;
    var v = String(payload[k]);
    FORBIDDEN.forEach(function (f) { if (v.indexOf(f) !== -1) stop('ค่าของ "' + k + '" อ้างถึง ' + f); });
    if (/refund|คืนเงิน/i.test(v)) stop('ค่าของ "' + k + '" มีคำว่าคืนเงิน');
  });

  /* 4) __EVENTTARGET ต้องว่าง — ASP.NET ถือว่าช่องนี้ = "กดปุ่มชื่อนี้"
        ถ้ามีชื่อปุ่มคืนเงินอยู่ในนี้ จะคืนเงินทั้งที่ payload ไม่มีชื่อปุ่มเลย
        ค่านี้ก๊อปมาจากหน้าเว็บ ปกติว่างเสมอ ถ้าไม่ว่าง = หน้าเว็บผิดปกติ หยุดเลยไม่ล้างให้ */
  ['__EVENTTARGET', '__EVENTARGUMENT'].forEach(function (k) {
    if (payload[k]) stop(k + ' ไม่ว่าง ("' + payload[k] + '")');
  });

  // 5) ต้องมีปุ่มกด "ตัวเดียว" และต้องเป็นตัวที่ขั้นตอนนี้ตั้งใจกด
  var btn = allow.filter(function (k) { return k.indexOf('Button') !== -1 && k in payload; });
  if (btn.length !== 1) stop('ต้องกดปุ่มเดียวพอดี แต่เจอ ' + btn.length + ' ปุ่ม');
}

/* ══════════ ลายนิ้วมือหน้าเว็บ ══════════ */

/** อ่านทุกช่อง/ปุ่มบนหน้า คืนเป็นบรรทัดเรียงแล้ว ไม่ซ้ำ
 *  ไม่เก็บ "ค่า" ของช่องกรอก/ช่องซ่อน เพราะเปลี่ยนทุกวัน (วันที่ · VIEWSTATE)
 *  เก็บข้อความบนปุ่ม เพราะนั่นคือสิ่งที่บอกว่าปุ่มทำอะไร
 *  ไม่เก็บ class — class เปลี่ยนแค่หน้าตา ไม่เปลี่ยนสิ่งที่ส่งไปเซิร์ฟเวอร์ เก็บไว้จะหยุดบ่อยโดยไม่จำเป็น */
function pageControls_(html) {
  var lines = {}, m;
  /* ตัดเลขแถวออก ให้ลายนิ้วมือไม่ขึ้นกับจำนวนล็อควันนั้น
     name: ...ListItemsRepeater$ctl12$RefundTypeRowRadioButtonList
     id  : ...RefundTypeRowRadioButtonList_100_2_100  (แถว_ตัวเลือก_แถว) → เก็บเลขตัวเลือกไว้ */
  var norm = function (s) {
    return String(s || '').replace(/\$ctl\d+\$/g, '$ctl#$').replace(/_ctl\d+_/g, '_ctl#_')
                          .replace(/_(\d+)_(\d+)_\1$/, '_#_$2_#');
  };
  var re = /<(input|select|textarea|button)\b[^>]*>/gi;
  while ((m = re.exec(html)) !== null) {
    var tag = m[0], kind = m[1].toLowerCase();
    var type = (tagAttr_(tag, 'type') || (kind === 'input' ? 'text' : kind)).toLowerCase();
    var isBtn = /^(submit|button|image|reset)$/.test(type);
    lines[[kind, type, norm(tagAttr_(tag, 'name')), norm(tagAttr_(tag, 'id')),
           isBtn ? tagAttr_(tag, 'value') : ''].join(' | ')] = 1;
  }
  // ปลายทาง postback จากลิงก์/ปุ่มที่ใช้ JavaScript — ทางลัดไปกดปุ่มได้โดยไม่ผ่าน submit
  var pb = /(?:__doPostBack\(|WebForm_PostBackOptions\()\s*(?:&#39;|&quot;|['"])([^'"&]+)/g;
  while ((m = pb.exec(html)) !== null) lines['postback | ' + norm(m[1])] = 1;
  var fa = html.match(/<form\b[^>]*>/i);
  if (fa) lines['form | ' + tagAttr_(fa[0], 'action')] = 1;
  return Object.keys(lines).sort();
}

/** อ่าน attribute แล้วถอด entity ให้ด้วย — ASP.NET บางทีส่งภาษาไทยมาเป็น &#3588; */
function tagAttr_(tag, name) {
  var m = String(tag).match(new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"', 'i'));
  if (!m) return '';
  return unesc_(m[1].replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
                    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); }));
}

/** ปุ่มที่ต้องใช้ ต้องมีตัวเดียว และข้อความบนปุ่มต้องตรงเป๊ะ · ไม่ตรง = throw */
function requireButtons_(controls, where) {
  Object.keys(REQUIRED_BUTTONS).forEach(function (name) {
    var want = REQUIRED_BUTTONS[name];
    var hit = controls.filter(function (l) { return l.split(' | ')[2] === name; });
    if (hit.length !== 1 || hit[0].split(' | ')[4] !== want) {
      throw new Error('🔴 หยุด: ' + where + ' — ปุ่ม ' + name + ' หายหรือข้อความเปลี่ยน (ต้องเป็น "' + want + '")');
    }
  });
}

/** เทียบหน้าเว็บกับชุดที่อนุมัติไว้ · ไม่ตรง = throw (ไม่ใช่ return เงียบๆ) */
function checkPage_(branch, stage, html) {
  var now = pageControls_(html);
  var where = 'หน้ารายงาน ' + branch + ' ขั้น ' + stage;
  requireButtons_(now, where);           // เช็คทุกครั้ง แม้ยังไม่เคยอนุมัติ

  var key = 'SG_PAGE_' + branch + '_' + stage;
  var saved = PropertiesService.getScriptProperties().getProperty(key);
  if (!saved) {
    throw new Error('🔴 หยุด: ยังไม่เคยอนุมัติหน้าตาของ' + where + ' — รัน approvePage' + branch + ' ก่อน');
  }
  saved = JSON.parse(saved);
  var added = now.filter(function (l) { return saved.indexOf(l) === -1; });
  var gone  = saved.filter(function (l) { return now.indexOf(l) === -1; });
  if (added.length || gone.length) {
    /* ขั้น 2 มีหน้าตาที่ถูกต้อง 2 แบบ (BN):
         ปกติ              — มีตัวเลือกรายคน ไม่คืนเงิน/ส่วนลดฝนตก/คืนเฉพาะค่าล็อก/100%
         วันฝนคืนเงินแล้ว   — เจ้าหน้าที่กดคืนเงินฝนแล้ว ตัวเลือกพวกนั้นหายไป (ยืนยันโดยเจ้าของ 24 ก.ย. 2569)
       แบบที่ 2 ต้อง "ตรงเป๊ะ" กับชุดที่คนอนุมัติผ่าน approvePageRain<สาขา> — ไม่ใช่ยอมให้อะไรหายก็ได้
       ไม่ตรงทั้งสองแบบ = หยุดเหมือนเดิม */
    var rain = stage === 2 && PropertiesService.getScriptProperties().getProperty(key + 'R');
    if (rain) {
      rain = JSON.parse(rain);
      if (rain.length === now.length && rain.every(function (l) { return now.indexOf(l) !== -1; })) {
        Logger.log('✅ ' + where + ' ตรงกับหน้าแบบ "วันฝนคืนเงินแล้ว" ที่อนุมัติ (' + now.length + ' รายการ)');
        return;
      }
    }
    Logger.log('🔴 ' + where + ' เปลี่ยนไปจากที่อนุมัติไว้:');
    added.forEach(function (l) { Logger.log('   + ' + l); });
    gone.forEach(function (l) { Logger.log('   − ' + l); });
    throw new Error('🔴 หยุด: ' + where + ' ไม่ตรงกับที่อนุมัติ (+' + added.length + ' −' + gone.length +
                    ') — ให้คนตรวจหน้าเว็บก่อน แล้วค่อยรัน approvePage' + branch + ' ใหม่');
  }
  Logger.log('✅ ' + where + ' ตรงกับที่อนุมัติ (' + now.length + ' รายการ)');
}

/* ══════════ อนุมัติหน้าตาหน้าเว็บ (กดรันเอง) ══════════
   เปิดหน้ารายงาน + กดค้นหาวันนี้ (ไม่กด Export) แล้วพิมพ์ทุกปุ่ม/ช่องที่เจอลง log
   และจำไว้เป็น "ชุดที่อนุมัติ" — หลังจากนี้ตัวดึงข้อมูลจะรันได้เฉพาะเมื่อหน้าตาตรงกับชุดนี้

   ⚠️ อ่าน log ก่อนเชื่อ: ปุ่ม Export ต้องมีข้อความ "Export (เรียงเลขล็อค)"
      ถ้าเจอปุ่มแปลกหรือชื่อไม่คุ้น อย่าเพิ่งใช้ ให้เปิดหน้าเว็บดูด้วยตาก่อน */
function approvePageBG() { approvePage_('BG'); }
function approvePageBN() { approvePage_('BN'); }

/* อนุมัติหน้าแบบ "วันฝนคืนเงินแล้ว" — รันเช้าวันถัดจากวันฝนที่เจ้าหน้าที่กดคืนเงินแล้ว
   กดแค่ "ค้นหา" วันที่ของเมื่อวาน (ไม่กด Export) · บันทึกเฉพาะขั้น 2 เป็นชุดที่ 2
   ⚠️ รับได้เฉพาะหน้าที่ "มีของหายไป" จากหน้าปกติ — มีอะไรเพิ่มแม้ตัวเดียว = ไม่บันทึก */
function approvePageRainBG() { approvePage_('BG', yesterday_()); }
function approvePageRainBN() { approvePage_('BN', yesterday_()); }

function approvePage_(branch, rainDay) {
  var cfg = SHEETS[branch];
  if (!cfg || !cfg.report) { Logger.log('❌ ยังไม่รู้ URL หน้ารายงานของสาขา ' + branch); return; }
  var P = PropertiesService.getScriptProperties();
  var user = P.getProperty('SG_USER_' + branch), pass = P.getProperty('SG_PASS_' + branch);
  if (!user || !pass) { Logger.log('❌ ยังไม่ได้ตั้ง SG_USER_' + branch + ' / SG_PASS_' + branch); return; }
  var cookie = login_(cfg, user, pass);
  if (!cookie) return;
  var REPORT = cfg.base + cfg.report, beStr = fmtBE_(rainDay || new Date());

  var r1 = UrlFetchApp.fetch(REPORT, { headers: { Cookie: cookie }, muteHttpExceptions: true });
  if (r1.getResponseCode() !== 200) { Logger.log('❌ เปิดหน้ารายงานไม่ได้ HTTP ' + r1.getResponseCode()); return; }
  // หน้าที่ยังไม่เคยเห็น (เช่น BN ครั้งแรก) — ต้องเจอปุ่มค้นหา/Export ชื่อและข้อความตรงก่อน ถึงจะกดค้นหา
  requireButtons_(pageControls_(r1.getContentText()), 'หน้ารายงาน ' + branch + ' ก่อนอนุมัติ');
  var p2 = readHidden_(r1.getContentText());
  p2[F.start] = beStr; p2[F.effect] = beStr; p2[F.search] = 'ค้นหา';
  assertSafe_(p2, 'search');                        // กดแค่ "ค้นหา" — ไม่กด Export ไม่กดอย่างอื่น
  var r2 = UrlFetchApp.fetch(REPORT, {
    method: 'post', payload: p2, headers: { Cookie: cookie }, followRedirects: true, muteHttpExceptions: true
  });
  if (r2.getResponseCode() !== 200) { Logger.log('❌ ค้นหาไม่สำเร็จ HTTP ' + r2.getResponseCode()); return; }

  if (rainDay) {
    var normal = JSON.parse(P.getProperty('SG_PAGE_' + branch + '_2') || '[]');
    var list = pageControls_(r2.getContentText());
    var extra = list.filter(function (l) { return normal.indexOf(l) === -1; });
    var gone  = normal.filter(function (l) { return list.indexOf(l) === -1; });
    Logger.log('\n════════ ' + branch + ' ขั้น 2 วันฝน ' + beStr + ' · ' + list.length + ' รายการ ════════');
    gone.forEach(function (l) { Logger.log('  − ' + l); });
    extra.forEach(function (l) { Logger.log('  + ' + l); });
    if (!normal.length) { Logger.log('❌ ยังไม่มีหน้าแบบปกติ — รัน approvePage' + branch + ' ก่อน'); return; }
    if (extra.length) { Logger.log('🔴 ไม่บันทึก — หน้าวันฝนมีของที่หน้าปกติไม่มี ' + extra.length + ' รายการ ต้องให้คนตรวจ'); return; }
    if (!gone.length) { Logger.log('ℹ️ หน้าวันที่ ' + beStr + ' เหมือนหน้าปกติทุกอย่าง — วันนั้นยังไม่ได้คืนเงินฝน ไม่ต้องบันทึก'); return; }
    P.setProperty('SG_PAGE_' + branch + '_2R', JSON.stringify(list));
    Logger.log('\n✅ อนุมัติหน้าแบบ "วันฝนคืนเงินแล้ว" ของ ' + branch + ' (ต่างจากหน้าปกติ −' + gone.length + ') — ตรวจรายการ − ข้างบนว่าเป็นตัวเลือกคืนเงินรายคน');
    return;
  }

  [r1, r2].forEach(function (res, i) {
    var stage = i + 1, list = pageControls_(res.getContentText());
    Logger.log('\n════════ ' + branch + ' ขั้น ' + stage + (stage === 1 ? ' (เปิดหน้า)' : ' (หลังกดค้นหา)') +
               ' · ' + list.length + ' รายการ ════════');
    list.forEach(function (l) { Logger.log('  ' + l); });
    P.setProperty('SG_PAGE_' + branch + '_' + stage, JSON.stringify(list));   // เกิน 9KB = throw เอง ไม่บันทึกครึ่งๆ
  });
  Logger.log('\n✅ อนุมัติหน้าตาหน้าเว็บ ' + branch + ' แล้ว — ตัวดึงข้อมูลจะหยุดเองถ้าหน้าตาเปลี่ยนจากนี้');
}

function login_(cfg, user, pass) {
  var SIGNIN = cfg.base + 'Signin.aspx';
  var r1 = UrlFetchApp.fetch(SIGNIN, { muteHttpExceptions: true, followRedirects: false });
  var cookie = pickCookie_(r1);
  var form = readHidden_(r1.getContentText());
  form['UsernameTextBox'] = user;
  form['PasswordTextBox'] = pass;
  form['SignInButton'] = 'Sign In';
  assertSafe_(form, 'signin');
  var r2 = UrlFetchApp.fetch(SIGNIN, {
    method: 'post', payload: form, headers: cookie ? { Cookie: cookie } : {},
    followRedirects: false, muteHttpExceptions: true
  });
  if (r2.getResponseCode() !== 302 && r2.getResponseCode() !== 301) {
    Logger.log('❌ login ไม่ผ่าน (HTTP ' + r2.getResponseCode() + ') — เช็ค user/pass ใน Script Properties');
    return '';
  }
  var c2 = pickCookie_(r2);
  return c2 ? mergeCookie_(cookie, c2) : cookie;
}

/* ── วันที่ ── เว็บใช้ พ.ศ. · ไฟล์ที่ได้กลับมาเป็น ค.ศ. */
function two_(n) { return (n < 10 ? '0' : '') + n; }
function fmtBE_(d) { return two_(d.getDate()) + '/' + two_(d.getMonth() + 1) + '/' + (d.getFullYear() + 543); }
function fmtCE_(d) { return two_(d.getDate()) + '/' + two_(d.getMonth() + 1) + '/' + d.getFullYear(); }
function sameDay_(a, b) { return a.toDateString() === b.toDateString(); }

/* ── ตัวช่วย ── */
function readHidden_(html) {
  var out = {};
  ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION', '__EVENTTARGET', '__EVENTARGUMENT'].forEach(function (n) {
    var m = html.match(new RegExp('name="' + n + '"[^>]*value="([^"]*)"', 'i'))
         || html.match(new RegExp('id="' + n + '"[^>]*value="([^"]*)"', 'i'));
    out[n] = m ? m[1] : '';
  });
  return out;
}
function pickCookie_(res) {
  var h = res.getAllHeaders(); var sc = h['Set-Cookie'] || h['set-cookie'];
  if (!sc) return '';
  if (!Array.isArray(sc)) sc = [sc];
  return sc.map(function (s) { return String(s).split(';')[0]; }).join('; ');
}
function mergeCookie_(a, b) {
  var map = {};
  ((a || '') + '; ' + (b || '')).split(';').forEach(function (p) {
    p = p.trim(); if (!p) return;
    var i = p.indexOf('='); if (i < 0) return;
    map[p.slice(0, i)] = p.slice(i + 1);
  });
  return Object.keys(map).map(function (k) { return k + '=' + map[k]; }).join('; ');
}

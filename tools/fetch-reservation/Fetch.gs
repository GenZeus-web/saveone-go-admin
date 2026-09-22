/**
 * ══════════════════════════════════════════════════════════════
 *  ดึงรายงานคืนค่าล็อกจาก services.saveone.co.th  (ขั้นที่ 2)
 * ══════════════════════════════════════════════════════════════
 *  รอบนี้ทำแค่ "ดาวน์โหลดไฟล์มาเก็บใน Google Drive" — ยังไม่เขียนลงชีต
 *  ตั้งใจแยกเป็น 2 รอบ เพื่อให้ตรวจไฟล์ที่ได้ก่อนว่าถูกวัน/ถูกโซน
 *  แล้วค่อยต่อส่วนเขียนชีตทีหลัง
 *
 *  ── วิธีใช้ ──
 *  ตั้ง Script Properties: SG_USER_BG / SG_PASS_BG  (และ _BN ถ้ามี)
 *  เลือกฟังก์ชัน fetchBG → Run → ดู log
 *  เว้นวันที่ = ใช้วันนี้ · อยากระบุเองแก้ที่ fetchBG_ วันที่เป็น ค.ศ.
 *
 *  ════════ ⚠️ อ่านก่อนแก้โค้ดนี้ ════════
 *  หน้า ReportRefundZone6_1.aspx มีปุ่ม "คืนเงินจริง" อยู่ด้วย:
 *      RefundButton · Type0Button · Type1Button · Type2Button
 *      OnlyLogeAmountButton
 *  ASP.NET ดูว่า "กดปุ่มไหน" จากชื่อปุ่มที่อยู่ใน POST body
 *  ส่งชื่อผิดไปตัวเดียว = คืนเงินผู้ค้าจริงทั้งตลาด ไม่มี undo
 *
 *  โค้ดนี้จึงส่งได้เฉพาะ ExportTable1Button และมีด่าน assertSafe_()
 *  ตรวจ payload ก่อนยิงทุกครั้ง — ห้ามถอดด่านนี้ออกไม่ว่ากรณีใด
 *  ══════════════════════════════════════
 */

var BASE   = 'https://services.saveone.co.th/SaveoneGoAdmin/';
var SIGNIN = BASE + 'Signin.aspx';

var F = {                              // ชื่อช่องบนหน้ารายงาน (สำรวจมาแล้ว)
  start  : 'ctl00$CONTENTContentPlaceHolder$StartDateTextBox',
  effect : 'ctl00$CONTENTContentPlaceHolder$EffectiveDateText',
  subzone: 'ctl00$CONTENTContentPlaceHolder$SubZoneDropDownList',
  search : 'ctl00$CONTENTContentPlaceHolder$SearchButton',
  export1: 'ctl00$CONTENTContentPlaceHolder$ExportTable1Button'   // "Export (เรียงเลขล็อค)"
};

/** ชื่อปุ่มที่ห้ามปรากฏใน payload เด็ดขาด — ทุกตัวสั่งคืนเงินจริง */
var FORBIDDEN = ['RefundButton', 'Type0Button', 'Type1Button', 'Type2Button', 'OnlyLogeAmountButton'];

/* ── โหมดซ้อม ──
   true  = แสดงว่า "จะ" เขียนอะไรลงชีต แต่ยังไม่เขียนจริง
   false = เขียนจริง  ← ตอนนี้อยู่โหมดนี้

   เปิดเขียนจริงเมื่อ 22 ก.ย. 2569 หลังตรวจตัวเลขตรงกับของจริงแล้ว
   (วอล์กอิน 6+11=17 · ไม่มา 7+2=9 · ลา 1+0=1 ตรงกับยอดสถานะทุกตัว)

   ถ้าจะแก้โค้ดส่วนคำนวณ ให้กลับมาตั้ง true ทดสอบก่อนเสมอ
   กันเขียนเลขผิดทับของจริง — Google Sheets มีประวัติเวอร์ชันกู้ได้
   แต่ถ้าไม่มีใครสังเกต เลขผิดจะไหลเข้าเว็บไปเรื่อยๆ */
var DRY_RUN = false;

/* ── ตั้งค่าต่อสาขา ──
   โค้ดไฟล์นี้ใช้ได้ทั้ง 2 สาขา วางไว้ใน Apps Script ของแต่ละชีตได้เลย
   ต่างกันแค่ Script Properties (SG_USER_* / SG_PASS_* / SG_SHEET_*)
   ทำแบบนี้แทนการเขียนโค้ดแยก 2 เวอร์ชัน เพราะแยกแล้วแก้บั๊กทีหลังจะลืมแก้อีกฝั่ง

   ⚠️ กติกาแยกโซนไม่เหมือนกัน (ยืนยันจาก 5_revenue-calculator.md + หน้าเว็บ)
      BG ใช้ 2 ตัวอักษร: GA-GT อาหาร · GW-GZ เปิดท้าย
      BN ใช้ตัวเดียว:    A-J  อาหาร · U-Z  เปิดท้าย
      ถ้าเอา regex ของ BG ไปใช้กับ BN จะไม่เข้าทั้งคู่ = ได้ 0 ทุกโซน

   id ของไฟล์ชีตอ่านจาก Script Properties ไม่เขียนลงโค้ด (repo นี้ public) */
var SHEETS = {
  BG: {
    name: 'ประตูกรุงเทพ',
    report: 'ReportRefundZone6_1.aspx',      // ยืนยันแล้ว
    food: /^G[A-T]$/, car: /^G[W-Z]$/,
    sheetFood: 'Report SaveOne Go', sheetCar: 'Report-Car Boot'
  },
  BN: {
    name: 'บางนา',
    report: '',                              // ⬅ ยังไม่รู้ — BN อาจเป็นโซนอื่น ไม่ใช่ Zone6
                                             //    รัน exploreBN ด้วยบัญชี BN เพื่อหา
    food: /^[A-J]$/, car: /^[U-Z]$/,
    sheetFood: 'Report Bangna', sheetCar: 'Bangna - Car Boot'
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

function setupTriggers_(branch) {
  var handler = 'scheduled' + branch;
  if (DRY_RUN) {
    Logger.log('⚠️ ตอนนี้ DRY_RUN = true — ตั้งเวลาไปก็จะไม่เขียนอะไรลงชีต');
    Logger.log('   ตั้งได้ แต่อย่าลืมเปลี่ยนเป็น false ตอนพร้อมใช้จริง\n');
  }
  // ลบของเดิมก่อน กันตั้งซ้ำแล้วรันวันละ 6 รอบโดยไม่รู้ตัว
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
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

function listTriggers() {
  var ts = ScriptApp.getProjectTriggers();
  if (!ts.length) { Logger.log('ยังไม่มีตัวตั้งเวลา'); return; }
  Logger.log('ตัวตั้งเวลาที่มีอยู่ ' + ts.length + ' ตัว:');
  ts.forEach(function (t) { Logger.log('  • ' + t.getHandlerFunction() + ' (' + t.getEventType() + ')'); });
}

function removeTriggers() {
  var ts = ScriptApp.getProjectTriggers(), n = 0;
  ts.forEach(function (t) { ScriptApp.deleteTrigger(t); n++; });
  Logger.log('ลบตัวตั้งเวลาออกทั้งหมด ' + n + ' ตัว');
}

/**
 * อ่านหัวคอลัมน์ของชีตปลายทาง — รันก่อนเปิดโหมดเขียนจริง
 * เว็บอ่านชีตด้วย "ชื่อหัวคอลัมน์" (Online_Lock, Cancel_Lock, …) ไม่ใช่ตำแหน่ง
 * ต้องเห็นของจริงก่อนถึงจะแมปได้ถูก ไม่งั้นเขียนผิดช่องแล้วยอดเพี้ยนเงียบๆ
 * ต้องตั้ง SG_SHEET_BG (id ของไฟล์ชีต) ใน Script Properties ก่อน
 */
function showSheetHeadersBG() { showHeaders_('BG'); }
function showSheetHeadersBN() { showHeaders_('BN'); }

function showHeaders_(branch) {
  var cfg = SHEETS[branch];
  var id = PropertiesService.getScriptProperties().getProperty('SG_SHEET_' + branch);
  if (!id) {
    Logger.log('❌ ยังไม่ได้ตั้ง SG_SHEET_' + branch + ' ใน Script Properties');
    Logger.log('   ค่าคือ id ของไฟล์ชีต — ดูจาก URL: docs.google.com/spreadsheets/d/<ตรงนี้>/edit');
    return;
  }
  var ss = SpreadsheetApp.openById(id);
  Logger.log('ไฟล์ชีต: ' + ss.getName());
  Logger.log('ชีตที่มีทั้งหมด: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(' · '));
  [cfg.sheetFood, cfg.sheetCar].forEach(function (nm) {
    var sh = ss.getSheetByName(nm);
    Logger.log('\n──── ' + nm + ' ────');
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
function fetchBranch_(branch, when) {
  var cfg = SHEETS[branch];
  if (!cfg) { Logger.log('❌ ไม่รู้จักสาขา ' + branch); return; }
  if (!cfg.report) {
    Logger.log('❌ ยังไม่รู้ URL หน้ารายงานของสาขา ' + branch);
    Logger.log('   หน้าของ BG ชื่อ ReportRefundZone6_1.aspx (Zone6) — BN น่าจะเป็นโซนอื่น');
    Logger.log('   → รัน exploreBN (ใน Explore.gs) ด้วยบัญชี BN เพื่อหา แล้วเติมที่ SHEETS.BN.report');
    return;
  }
  var d = when || new Date();
  var ceStr = fmtCE_(d);                       // 22/09/2026 — ใช้ตรวจไฟล์ที่ได้
  var beStr = fmtBE_(d);                       // 22/09/2569 — เว็บรับแบบนี้
  Logger.log('=== ดึงข้อมูลสาขา ' + branch + ' · วันขาย ' + ceStr + ' (พ.ศ. ' + beStr + ') ===');

  if (d.getHours() < 18 && sameDay_(d, new Date())) {
    Logger.log('⚠️ ตอนนี้ยังไม่ถึง 18:00 — วอล์กอินอาจยังเข้าไม่ครบ ตัวเลขจะต่ำกว่าจริง');
  }

  var P = PropertiesService.getScriptProperties();
  var user = P.getProperty('SG_USER_' + branch), pass = P.getProperty('SG_PASS_' + branch);
  if (!user || !pass) { Logger.log('❌ ยังไม่ได้ตั้ง SG_USER_' + branch + ' / SG_PASS_' + branch); return; }

  var cookie = login_(user, pass);
  if (!cookie) return;
  Logger.log('✅ login ผ่าน');

  // 1) เปิดหน้ารายงาน เก็บ VIEWSTATE
  var REPORT = BASE + cfg.report;
  var r1 = UrlFetchApp.fetch(REPORT, { headers: { Cookie: cookie }, muteHttpExceptions: true });
  if (r1.getResponseCode() !== 200) { Logger.log('❌ เปิดหน้ารายงานไม่ได้ HTTP ' + r1.getResponseCode()); return; }
  Logger.log('✅ เปิดหน้ารายงานแล้ว');

  // 2) กด "ค้นหา" ด้วยวันที่ที่ต้องการ (เลียนแบบคนกดจริง)
  var p2 = readHidden_(r1.getContentText());
  p2[F.start] = beStr;
  p2[F.effect] = beStr;
  p2[F.search] = 'ค้นหา';
  assertSafe_(p2);
  var r2 = UrlFetchApp.fetch(REPORT, {
    method: 'post', payload: p2, headers: { Cookie: cookie },
    followRedirects: true, muteHttpExceptions: true
  });
  if (r2.getResponseCode() !== 200) { Logger.log('❌ ค้นหาไม่สำเร็จ HTTP ' + r2.getResponseCode()); return; }
  Logger.log('✅ ค้นหาวันที่ ' + beStr + ' แล้ว');

  // 3) กด "Export (เรียงเลขล็อค)" — ปุ่มเดียวที่อนุญาต
  var p3 = readHidden_(r2.getContentText());
  p3[F.start] = beStr;
  p3[F.effect] = beStr;
  p3[F.export1] = 'Export (เรียงเลขล็อค)';
  assertSafe_(p3);
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
    Logger.log('❌ ไม่ได้ไฟล์ที่คาดไว้ (เล็กเกินไป — น่าจะได้หน้า HTML กลับมาแทนไฟล์)');
    Logger.log('   ตัวอย่างเนื้อหา: ' + r3.getContentText().slice(0, 300).replace(/\s+/g, ' '));
    return;
  }

  // 4) แกะไฟล์อ่านในหน่วยความจำแล้วตรวจ — ไม่ต้องใช้สิทธิ์ Drive
  var rows = parseXlsx_(blob);
  if (!rows.length) { Logger.log('❌ แกะไฟล์แล้วไม่เจอข้อมูล'); return; }
  Logger.log('✅ แกะไฟล์ได้ ' + (rows.length - 1) + ' แถวข้อมูล');

  var z = verify_(rows, ceStr, cfg);
  if (!z) return;                       // วันที่ไม่ตรง — verify_ แจ้งแล้ว
  writeSheet_(branch, ceStr, z);
}

/** เขียนลงชีต ฟอร์แมตเดียวกับ saveDataByBranch ของสคริปต์คำนวณเดิมเป๊ะ
 *  [วันที่, ราย, ล็อก, 0×11, ค่าไฟ, อุปกรณ์, สาขา]  ← 17 ช่อง
 *  11 ช่องกลางเว้นไว้ให้กรอกมือทีหลัง (วอล์กอิน/ไม่มา/ลา/ล็อกเสริม/วันฝน) */
function writeSheet_(branch, dateStr, z) {
  var cfg = SHEETS[branch];
  var id = PropertiesService.getScriptProperties().getProperty('SG_SHEET_' + branch);
  Logger.log('\n──────── บันทึกลงชีต ────────');
  if (!cfg) { Logger.log('❌ ไม่รู้จักสาขา ' + branch); return; }

  if (DRY_RUN) {
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
    Logger.log('   ถ้าตัวเลขถูกต้องแล้ว แก้บรรทัด  var DRY_RUN = true;  เป็น false');
    return;
  }
  if (!id) {
    Logger.log('❌ ยังไม่ได้ตั้ง SG_SHEET_' + branch + ' (id ของไฟล์ชีต) ใน Script Properties');
    return;
  }

  var ss = SpreadsheetApp.openById(id);
  [[cfg.sheetFood, z.st], [cfg.sheetCar, z.car]].forEach(function (pair) {
    var sh = ss.getSheetByName(pair[0]);
    if (!sh) { Logger.log('❌ ไม่เจอชีตชื่อ "' + pair[0] + '"'); return; }
    upsert_(sh, dateStr, pair[1], cfg.name, pair[0]);
  });
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
    return;
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

/** ตรวจว่าไฟล์ที่ได้ถูกวัน ถูกโซน แล้วสรุปตัวเลขที่ชีตต้องใช้ */
function verify_(rows, wantDate, cfg) {
  var H = rows[0], data = rows.slice(1);
  var iDate = H.indexOf('วันที่ขาย'), iLock = H.indexOf('ล็อค');
  var iElec = H.indexOf('ค่าไฟฟ้า'), iTool = H.indexOf('ค่าอุปกรณ์');
  var iStat = H.indexOf('มาขาย/ลา/ไม่มาขาย');
  Logger.log('\n──────── ตรวจไฟล์ ────────');

  // ด่านวันที่ — สำคัญที่สุด กัน VIEWSTATE เพี้ยนแล้วได้ข้อมูลผิดวันเงียบๆ
  var dates = {};
  data.forEach(function (r) { var d = String(r[iDate] || '').slice(0, 10); if (d) dates[d] = (dates[d] || 0) + 1; });
  var keys = Object.keys(dates);
  Logger.log('วันที่ขายในไฟล์: ' + keys.map(function (k) { return k + ' (' + dates[k] + ' แถว)'; }).join(' · '));
  if (keys.length !== 1 || keys[0] !== wantDate) {
    Logger.log('🔴 หยุด — ขอวันที่ ' + wantDate + ' แต่ไฟล์เป็น ' + keys.join(','));
    Logger.log('   อย่าเอาข้อมูลนี้ไปใช้ ต้องแก้ก่อน');
    return null;
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
  var z = { st: mkz(), car: mkz(), other: 0 };
  var stat = {};
  data.forEach(function (r) {
    var st = String(r[iStat] || '(ว่าง)'); stat[st] = (stat[st] || 0) + 1;
    var codes = String(r[iLock] || '').split(':').filter(function (x) { return x.trim(); });
    if (!codes.length) return;
    var p = (codes[0].match(/^[A-Za-z]+/) || [''])[0].toUpperCase();
    // กติกาแยกโซนต่างกันต่อสาขา — BG ใช้ 2 ตัวอักษร · BN ใช้ตัวเดียว
    var bucket = cfg.food.test(p) ? 'st' : cfg.car.test(p) ? 'car' : null;
    if (!bucket) { z.other += codes.length; return; }
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
  if (z.other) Logger.log('⚠️ มีล็อค ' + z.other + ' ตัวที่รหัสไม่เข้าทั้ง 2 โซน — ต้องดูว่าเป็นอะไร');
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

/** ด่านกันพลาด — ห้ามมีชื่อปุ่มคืนเงินใน payload เด็ดขาด */
function assertSafe_(payload) {
  var keys = Object.keys(payload);
  for (var i = 0; i < keys.length; i++) {
    for (var j = 0; j < FORBIDDEN.length; j++) {
      if (keys[i].indexOf(FORBIDDEN[j]) !== -1) {
        throw new Error('🔴 หยุด: payload มีปุ่มคืนเงิน "' + keys[i] + '" — ห้ามส่งเด็ดขาด');
      }
    }
  }
}

function login_(user, pass) {
  var r1 = UrlFetchApp.fetch(SIGNIN, { muteHttpExceptions: true, followRedirects: false });
  var cookie = pickCookie_(r1);
  var form = readHidden_(r1.getContentText());
  form['UsernameTextBox'] = user;
  form['PasswordTextBox'] = pass;
  form['SignInButton'] = 'Sign In';
  assertSafe_(form);
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

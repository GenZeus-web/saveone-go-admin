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
var REPORT = BASE + 'ReportRefundZone6_1.aspx';

var F = {                              // ชื่อช่องบนหน้ารายงาน (สำรวจมาแล้ว)
  start  : 'ctl00$CONTENTContentPlaceHolder$StartDateTextBox',
  effect : 'ctl00$CONTENTContentPlaceHolder$EffectiveDateText',
  subzone: 'ctl00$CONTENTContentPlaceHolder$SubZoneDropDownList',
  search : 'ctl00$CONTENTContentPlaceHolder$SearchButton',
  export1: 'ctl00$CONTENTContentPlaceHolder$ExportTable1Button'   // "Export (เรียงเลขล็อค)"
};

/** ชื่อปุ่มที่ห้ามปรากฏใน payload เด็ดขาด — ทุกตัวสั่งคืนเงินจริง */
var FORBIDDEN = ['RefundButton', 'Type0Button', 'Type1Button', 'Type2Button', 'OnlyLogeAmountButton'];

// ── จุดเริ่ม ──
function fetchBG() { fetchBranch_('BG', null); }
function fetchBN() { fetchBranch_('BN', null); }

/**
 * @param {string} branch  'BG' | 'BN'
 * @param {Date=}  when    วันขายที่ต้องการ (null = วันนี้)
 */
function fetchBranch_(branch, when) {
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

  // 4) เก็บลง Drive แล้วให้คนตรวจ — ยังไม่เขียนลงชีตในรอบนี้
  var name = 'SaveoneGo_' + branch + '_' + ceStr.replace(/\//g, '-') + '.xlsx';
  var file = DriveApp.createFile(blob.setName(name));
  Logger.log('✅ บันทึกไฟล์แล้ว: ' + name);
  Logger.log('   ลิงก์: ' + file.getUrl());
  Logger.log('');
  Logger.log('👉 เปิดไฟล์ตรวจ 3 อย่าง:');
  Logger.log('   1. คอลัมน์ "วันที่ขาย" เป็น ' + ceStr + ' ทุกแถวไหม');
  Logger.log('   2. มีทั้งล็อค GA-GT (อาหาร) และ GW-GZ (เปิดท้าย) ไหม');
  Logger.log('   3. จำนวนแถวใกล้เคียงกับที่เห็นบนเว็บไหม');
  Logger.log('   ถ้าครบ 3 ข้อ บอกได้เลย เดี๋ยวต่อส่วนเขียนลงชีตให้');
}

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

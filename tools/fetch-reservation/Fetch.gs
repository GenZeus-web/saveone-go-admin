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

  // 4) แกะไฟล์อ่านในหน่วยความจำแล้วตรวจ — ไม่ต้องใช้สิทธิ์ Drive
  var rows = parseXlsx_(blob);
  if (!rows.length) { Logger.log('❌ แกะไฟล์แล้วไม่เจอข้อมูล'); return; }
  Logger.log('✅ แกะไฟล์ได้ ' + (rows.length - 1) + ' แถวข้อมูล');
  verify_(rows, ceStr);
}

/** ตรวจว่าไฟล์ที่ได้ถูกวัน ถูกโซน แล้วสรุปตัวเลขที่ชีตต้องใช้ */
function verify_(rows, wantDate) {
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
    return false;
  }
  Logger.log('✅ วันที่ตรงกับที่ขอ (' + wantDate + ')');

  // แยกโซนจากตัวอักษรนำหน้ารหัสล็อค — GA-GT อาหาร · GW-GZ เปิดท้าย
  var z = { st: { rai: 0, lock: 0, elec: 0, tool: 0 }, car: { rai: 0, lock: 0, elec: 0, tool: 0 }, other: 0 };
  var stat = {};
  data.forEach(function (r) {
    var s = String(r[iStat] || '(ว่าง)'); stat[s] = (stat[s] || 0) + 1;
    var codes = String(r[iLock] || '').split(':').filter(function (x) { return x.trim(); });
    if (!codes.length) return;
    var p = (codes[0].match(/^[A-Za-z]+/) || [''])[0].toUpperCase();
    var bucket = /^G[A-T]$/.test(p) ? 'st' : /^G[W-Z]$/.test(p) ? 'car' : null;
    if (!bucket) { z.other += codes.length; return; }
    z[bucket].rai += 1;
    z[bucket].lock += codes.length;
    z[bucket].elec += num_(r[iElec]);
    z[bucket].tool += num_(r[iTool]);
  });

  Logger.log('\nสถานะ: ' + Object.keys(stat).map(function (k) { return k + ' ' + stat[k]; }).join(' · '));
  Logger.log('\n──────── ตัวเลขที่ชีตต้องใช้ ────────');
  Logger.log('ST อาหาร (GA-GT)   ราย ' + z.st.rai + ' · ล็อก ' + z.st.lock + ' · ค่าไฟ ' + z.st.elec + ' · อุปกรณ์ ' + z.st.tool);
  Logger.log('Car เปิดท้าย (GW-GZ) ราย ' + z.car.rai + ' · ล็อก ' + z.car.lock + ' · ค่าไฟ ' + z.car.elec + ' · อุปกรณ์ ' + z.car.tool);
  if (z.other) Logger.log('⚠️ มีล็อค ' + z.other + ' ตัวที่รหัสไม่เข้าทั้ง 2 โซน — ต้องดูว่าเป็นอะไร');
  Logger.log('รวม ราย ' + (z.st.rai + z.car.rai) + ' · ล็อก ' + (z.st.lock + z.car.lock));
  Logger.log('\n👉 เทียบตัวเลขนี้กับที่เห็นบนเว็บ ถ้าตรง บอกได้เลย เดี๋ยวต่อส่วนเขียนลงชีต');
  return true;
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

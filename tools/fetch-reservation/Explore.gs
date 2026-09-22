/**
 * ══════════════════════════════════════════════════════════════
 *  ตัวสำรวจหน้าเว็บ services.saveone.co.th  (ขั้นที่ 1 จาก 2)
 * ══════════════════════════════════════════════════════════════
 *  อ่านอย่างเดียว — ไม่เขียนอะไรลงชีต ไม่กด export จริง
 *  หน้าที่: login แล้วไล่เช็คว่า "หน้ารายงานไหน" คือหน้าที่ใช้ดึงข้อมูล
 *  แล้วรายงานชื่อช่องทั้งหมดในหน้านั้น
 *
 *  ── วิธีใช้ ──
 *  1) ⚙️ การตั้งค่าโปรเจกต์ → คุณสมบัติสคริปต์ → ใส่ 2 ค่า:
 *        SG_USER_BG  =  ชื่อผู้ใช้
 *        SG_PASS_BG  =  รหัสผ่าน
 *     (ใส่ที่นั่นเท่านั้น ห้ามพิมพ์ลงในโค้ด — repo นี้เป็น public)
 *  2) เลือกฟังก์ชัน exploreBG → Run
 *  3) ก๊อป log ทั้งก้อนมาให้ดู
 *
 *  v2 (22 ก.ย. 2569) แก้จาก v1:
 *   - Logger.log ของ Apps Script รับแค่ %s เปล่าๆ ไม่รับ %-55s
 *     v1 ใช้ %-55s เลยยัดค่าผิดช่อง มองไม่ออกว่าอันไหนปุ่มอันไหนช่องกรอก
 *     → เปลี่ยนมาต่อสตริงเองทั้งหมด ไม่พึ่ง format
 *   - ไล่เช็คหลายหน้าแทนที่จะเดาหน้าเดียว แล้วให้คะแนนว่าหน้าไหนน่าใช่
 *   - อ่านตัวเลือกใน dropdown ด้วย (น่าจะเป็นตัวแยกโซน ST/Car)
 */

var BASE = 'https://services.saveone.co.th/SaveoneGoAdmin/';
var SIGNIN = BASE + 'Signin.aspx';

/** หน้ารายงานที่ใช้จริง — เจ้าของยืนยันแล้ว 22 ก.ย. 2569
 *  ปุ่มที่ต้องกดคือ ctl00$CONTENTContentPlaceHolder$ExportTable1Button
 *  ค่าบนปุ่ม "Export (เรียงเลขล็อค)" · เป็น input submit ธรรมดา
 *  (onclick เป็น WebForm_DoPostBackWithOptions แต่ไม่ต้องสนใจ
 *   เพราะ submit ปกติก็ส่งชื่อปุ่มไปใน body อยู่แล้ว) */
var CANDIDATES = ['ReportRefundZone6_1.aspx'];

function exploreBG() { explore_('BG'); }
function exploreBN() { explore_('BN'); }

function explore_(branch) {
  var P = PropertiesService.getScriptProperties();
  var user = P.getProperty('SG_USER_' + branch);
  var pass = P.getProperty('SG_PASS_' + branch);
  if (!user || !pass) {
    Logger.log('❌ ยังไม่ได้ตั้ง SG_USER_' + branch + ' / SG_PASS_' + branch + ' ใน Script Properties');
    return;
  }
  Logger.log('=== สำรวจสาขา ' + branch + ' · ผู้ใช้ ' + user + ' ===');

  var cookie = login_(user, pass);
  if (!cookie) return;
  Logger.log('✅ login ผ่าน');

  // ไล่เช็คทีละหน้า ให้คะแนนว่าน่าใช่แค่ไหน
  Logger.log('\n════════ ไล่เช็คหน้ารายงาน ════════');
  var best = null;
  for (var i = 0; i < CANDIDATES.length; i++) {
    var page = CANDIDATES[i];
    var res = UrlFetchApp.fetch(absUrl_(page), {
      headers: { Cookie: cookie }, followRedirects: true, muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code !== 200) { Logger.log('\n— ' + page + ' → HTTP ' + code + ' (ข้าม)'); continue; }
    var html = res.getContentText();

    var names = fieldNames_(html);
    var hasDate = names.filter(function (n) { return /effectivedate|startdate|วันที่/i.test(n); });
    var hasExport = names.filter(function (n) { return /export/i.test(n); });
    var score = (hasDate.length ? 2 : 0) + (hasExport.length ? 2 : 0);

    Logger.log('\n— ' + page + ' → HTTP 200 · ช่องทั้งหมด ' + names.length +
               ' · ช่องวันที่ ' + hasDate.length + ' · ปุ่ม export ' + hasExport.length +
               (score >= 4 ? '   ⭐ น่าใช่' : ''));
    if (score >= 4 && !best) best = { page: page, html: html };
  }

  if (!best) {
    Logger.log('\n⚠️ ไม่เจอหน้าที่มีทั้งช่องวันที่และปุ่ม export');
    Logger.log('   → เปิดเว็บในเบราว์เซอร์ กดเข้าหน้าที่ใช้จริง แล้วส่ง URL มาให้ดู');
    return;
  }

  Logger.log('\n════════ รายละเอียดหน้า ' + best.page + ' ════════');
  dumpFields_(best.html);
  Logger.log('\n=== จบ ===');
}

/** login แล้วคืน cookie · คืน '' ถ้าไม่ผ่าน */
function login_(user, pass) {
  var r1 = UrlFetchApp.fetch(SIGNIN, { muteHttpExceptions: true, followRedirects: false });
  var cookie = pickCookie_(r1);
  var form = readHidden_(r1.getContentText());
  form['UsernameTextBox'] = user;
  form['PasswordTextBox'] = pass;
  form['SignInButton'] = 'Sign In';

  var r2 = UrlFetchApp.fetch(SIGNIN, {
    method: 'post', payload: form,
    headers: cookie ? { Cookie: cookie } : {},
    followRedirects: false, muteHttpExceptions: true
  });
  var code = r2.getResponseCode();
  if (code !== 302 && code !== 301) {
    Logger.log('❌ login ไม่ผ่าน — ได้ HTTP ' + code + ' (ปกติต้องเป็น 302)');
    return '';
  }
  var c2 = pickCookie_(r2);
  return c2 ? mergeCookie_(cookie, c2) : cookie;
}

/** พิมพ์ช่องทั้งหมด — ต่อสตริงเอง ไม่พึ่ง format ของ Logger */
function dumpFields_(html) {
  Logger.log('--- ช่องกรอก / ปุ่ม ---');
  allTags_(html, /<input[^>]*>/gi).forEach(function (tag) {
    var n = attr_(tag, 'name'); if (!n) return;
    var t = attr_(tag, 'type') || 'text';
    var v = attr_(tag, 'value') || '';
    if (n.indexOf('__') === 0) { Logger.log('  [hidden] ' + n + '  (ยาว ' + v.length + ' ตัว)'); return; }
    var line = '  ' + pad_(t, 9) + n;
    if (v) line += '\n             └ ข้อความบนปุ่ม/ค่า: "' + (v.length > 60 ? v.slice(0, 60) + '…' : v) + '"';
    Logger.log(line);
  });

  Logger.log('\n--- dropdown และตัวเลือกข้างใน ---');
  var sels = html.split(/<select/i).slice(1);
  if (!sels.length) Logger.log('  (ไม่มี)');
  sels.forEach(function (chunk) {
    var head = chunk.slice(0, chunk.indexOf('>') + 1);
    var n = attr_('<select' + head, 'name'); if (!n) return;
    Logger.log('  ' + n);
    var body = chunk.slice(0, chunk.toLowerCase().indexOf('</select>'));
    var opts = allTags_(body, /<option[^>]*>([^<]*)</gi);
    opts.slice(0, 15).forEach(function (o) {
      var txt = o.replace(/<[^>]*>/g, '').trim();
      if (txt) Logger.log('      • ' + txt);
    });
    if (opts.length > 15) Logger.log('      … อีก ' + (opts.length - 15) + ' ตัวเลือก');
  });

  Logger.log('\n--- ลิงก์ที่เป็นปุ่มกด (__doPostBack) ---');
  var pb = allTags_(html, /__doPostBack\('([^']+)'/gi);
  if (!pb.length) Logger.log('  (ไม่มี — ปุ่ม export เป็น input submit ธรรมดา ซึ่งง่ายกว่า)');
  else uniq_(pb).forEach(function (t) { Logger.log('  __EVENTTARGET = ' + t); });
}

/* ── ตัวช่วย ── */
function fieldNames_(html) {
  var out = [];
  allTags_(html, /<input[^>]*>/gi).forEach(function (t) { var n = attr_(t, 'name'); if (n && n.indexOf('__') !== 0) out.push(n); });
  allTags_(html, /<select[^>]*>/gi).forEach(function (t) { var n = attr_(t, 'name'); if (n) out.push(n); });
  return out;
}
function readHidden_(html) {
  var out = {};
  ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION', '__EVENTTARGET', '__EVENTARGUMENT'].forEach(function (n) {
    var m = html.match(new RegExp('name="' + n + '"[^>]*value="([^"]*)"', 'i'))
         || html.match(new RegExp('id="' + n + '"[^>]*value="([^"]*)"', 'i'));
    out[n] = m ? m[1] : '';
  });
  return out;
}
function attr_(tag, name) { var m = String(tag).match(new RegExp(name + '="([^"]*)"', 'i')); return m ? m[1] : ''; }
function allTags_(s, re) { var o = [], m; while ((m = re.exec(s)) !== null) o.push(m[1] !== undefined ? m[1] : m[0]); return o; }
function uniq_(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }
function pad_(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
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
function absUrl_(u) {
  if (!u) return BASE;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.charAt(0) === '/') return 'https://services.saveone.co.th' + u;
  return BASE + u.replace(/^\.\//, '');
}

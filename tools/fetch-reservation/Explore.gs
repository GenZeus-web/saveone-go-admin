/**
 * ══════════════════════════════════════════════════════════════
 *  ตัวสำรวจหน้าเว็บ services.saveone.co.th  (ขั้นที่ 1 จาก 2)
 * ══════════════════════════════════════════════════════════════
 *  ตัวนี้ "อ่านอย่างเดียว" — ไม่เขียนอะไรลงชีต ไม่ดึงข้อมูลจริง
 *  หน้าที่เดียวคือ login แล้วบอกว่าหน้ารายงานมีช่องอะไรบ้าง
 *  เพราะ ASP.NET ตั้งชื่อช่องแปลกๆ เช่น ctl00$ContentPlaceHolder1$txtDate
 *  เดาไม่ได้ ต้องดูของจริง
 *
 *  ── วิธีใช้ ──
 *  1) เปิด Google Sheet ที่จะใช้ → ส่วนขยาย → Apps Script
 *  2) วางไฟล์นี้ทั้งไฟล์
 *  3) ⚙️ Project Settings → Script Properties → เพิ่ม 2 ค่า:
 *        SG_USER_BG  =  ชื่อผู้ใช้ของสาขาประตูกรุงเทพ
 *        SG_PASS_BG  =  รหัสผ่าน
 *     (ใส่ตรงนี้เท่านั้น ห้ามพิมพ์ลงในโค้ด — โค้ดขึ้น git ได้ รหัสจะหลุด)
 *  4) เลือกฟังก์ชัน exploreBG แล้วกด Run
 *  5) ดูผลที่ View → Logs  แล้วก๊อปมาให้ผมทั้งก้อน
 *
 *  ⚠️ log ตัวนี้ไม่พิมพ์รหัสผ่านออกมา แต่ก่อนส่งให้ใคร
 *     ควรกวาดตาดูสักรอบว่าไม่มีอะไรที่ไม่อยากให้เห็นติดไป
 */

var BASE = 'https://services.saveone.co.th/SaveoneGoAdmin/';
var SIGNIN = BASE + 'Signin.aspx';

function exploreBG() { explore_('BG'); }
function exploreBN() { explore_('BN'); }

function explore_(branch) {
  var P = PropertiesService.getScriptProperties();
  var user = P.getProperty('SG_USER_' + branch);
  var pass = P.getProperty('SG_PASS_' + branch);
  if (!user || !pass) {
    Logger.log('❌ ยังไม่ได้ตั้งค่า SG_USER_%s / SG_PASS_%s ใน Script Properties', branch, branch);
    Logger.log('   ไปที่ ⚙️ Project Settings → Script Properties → Add script property');
    return;
  }
  Logger.log('=== สำรวจสาขา %s ===', branch);
  Logger.log('ผู้ใช้ที่จะใช้: %s (ความยาวรหัสผ่าน %s ตัว — ไม่พิมพ์ค่าจริง)', user, String(pass.length));

  // ── 1) เปิดหน้า login เพื่อเก็บ VIEWSTATE + cookie ──
  var r1 = UrlFetchApp.fetch(SIGNIN, { muteHttpExceptions: true, followRedirects: false });
  Logger.log('\n[1] GET Signin.aspx → HTTP %s', r1.getResponseCode());
  var html1 = r1.getContentText();
  var cookie = pickCookie_(r1);
  Logger.log('    cookie ที่ได้: %s', cookie ? cookie.replace(/=[^;]+/g, '=***') : '(ไม่มี)');

  var hidden = readHidden_(html1);
  Logger.log('    hidden fields: %s', Object.keys(hidden).join(', ') || '(ไม่เจอ)');

  // ── 2) ส่ง user/pass ──
  var form = {};
  for (var k in hidden) form[k] = hidden[k];
  form['UsernameTextBox'] = user;
  form['PasswordTextBox'] = pass;
  form['SignInButton'] = 'Sign In';

  var r2 = UrlFetchApp.fetch(SIGNIN, {
    method: 'post',
    payload: form,                       // Apps Script encode ให้เอง
    headers: cookie ? { Cookie: cookie } : {},
    followRedirects: false,
    muteHttpExceptions: true
  });
  var code2 = r2.getResponseCode();
  var loc = r2.getAllHeaders()['Location'] || r2.getAllHeaders()['location'] || '';
  Logger.log('\n[2] POST login → HTTP %s%s', code2, loc ? ('  → redirect ไป: ' + loc) : '');

  var c2 = pickCookie_(r2);
  if (c2) cookie = mergeCookie_(cookie, c2);

  if (code2 === 200) {
    // ยังอยู่หน้า login = รหัสไม่ผ่าน หรือมีอะไรขวางอยู่
    var err = pickText_(r2.getContentText(), /id="[^"]*(Error|Message|Label)[^"]*"[^>]*>([^<]{3,200})</i);
    Logger.log('    ⚠️ ยังอยู่หน้าเดิม (ปกติ login สำเร็จจะ redirect 302)');
    Logger.log('    ข้อความบนหน้า: %s', err || '(ไม่พบข้อความ error ที่อ่านได้)');
    Logger.log('    → เช็คว่า user/pass ใน Script Properties ถูกไหม');
    return;
  }
  if (code2 !== 302 && code2 !== 301) {
    Logger.log('    ⚠️ ได้ HTTP %s ซึ่งไม่คาดคิด หยุดก่อน', code2);
    return;
  }

  // ── 3) ตามไปหน้าแรกหลัง login ──
  var home = absUrl_(loc);
  var r3 = UrlFetchApp.fetch(home, { headers: { Cookie: cookie }, followRedirects: true, muteHttpExceptions: true });
  Logger.log('\n[3] เปิดหน้าแรกหลัง login: %s → HTTP %s', home, r3.getResponseCode());
  var html3 = r3.getContentText();

  // ── 4) หาลิงก์ที่น่าจะเป็นหน้ารายงาน ──
  Logger.log('\n[4] ลิงก์ทั้งหมดที่เจอบนหน้าแรก (กรองเอาที่น่าสนใจ):');
  var links = allMatches_(html3, /href="([^"]+\.aspx[^"]*)"/gi);
  var seen = {}, shown = 0;
  links.forEach(function (h) {
    if (seen[h]) return; seen[h] = 1;
    if (/signin|logout|signout/i.test(h)) return;
    Logger.log('    %s', h);
    shown++;
  });
  if (!shown) Logger.log('    (ไม่เจอลิงก์ .aspx — เมนูอาจสร้างด้วย JavaScript)');

  var gomonny = links.filter(function (h) { return /gomonny|report|lock|ล็อ/i.test(h); });
  Logger.log('\n    ลิงก์ที่น่าจะเป็นรายงานคืนค่าล็อก: %s', gomonny.join(' , ') || '(ไม่เจอ — ส่ง URL มาให้ผมได้)');

  // ── 5) ถ้าเจอ เปิดแล้วดูว่ามีช่องอะไรบ้าง ──
  if (gomonny.length) {
    var rep = absUrl_(gomonny[0]);
    var r4 = UrlFetchApp.fetch(rep, { headers: { Cookie: cookie }, followRedirects: true, muteHttpExceptions: true });
    Logger.log('\n[5] เปิดหน้ารายงาน: %s → HTTP %s', rep, r4.getResponseCode());
    dumpFields_(r4.getContentText());
  } else {
    Logger.log('\n[5] ข้ามไปก่อน — ยังไม่รู้ URL หน้ารายงาน');
  }
  Logger.log('\n=== จบ ===');
}

/** พิมพ์ช่องกรอกทั้งหมดในหน้า เพื่อให้รู้ว่าต้องส่งอะไรตอน export */
function dumpFields_(html) {
  Logger.log('    --- input ---');
  allMatches_(html, /<input[^>]*>/gi).forEach(function (tag) {
    var n = pickText_(tag, /name="([^"]+)"/i);
    var t = pickText_(tag, /type="([^"]+)"/i) || 'text';
    var v = pickText_(tag, /value="([^"]*)"/i) || '';
    if (!n) return;
    if (/^__/.test(n)) { Logger.log('      %s  (hidden ยาว %s ตัว)', n, String(v.length)); return; }
    Logger.log('      %-55s type=%-8s value=%s', n, t, v.length > 40 ? v.slice(0, 40) + '…' : v);
  });
  Logger.log('    --- select (ตัวเลือก เช่น สาขา/ประเภทรายงาน) ---');
  allMatches_(html, /<select[^>]*name="([^"]+)"/gi).forEach(function (m) { Logger.log('      %s', m); });
  Logger.log('    --- ปุ่มที่กดได้ ---');
  allMatches_(html, /<a[^>]*href="javascript:__doPostBack\('([^']+)'/gi).forEach(function (m) { Logger.log('      __EVENTTARGET = %s', m); });
}

/* ── ตัวช่วยเล็กๆ ── */
function readHidden_(html) {
  var out = {};
  ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION', '__EVENTTARGET', '__EVENTARGUMENT'].forEach(function (n) {
    var re = new RegExp('name="' + n + '"[^>]*value="([^"]*)"', 'i');
    var m = html.match(re);
    if (m) out[n] = m[1];
    else {
      var re2 = new RegExp('id="' + n + '"[^>]*value="([^"]*)"', 'i');
      var m2 = html.match(re2);
      if (m2) out[n] = m2[1];
    }
  });
  return out;
}
function pickCookie_(res) {
  var h = res.getAllHeaders();
  var sc = h['Set-Cookie'] || h['set-cookie'];
  if (!sc) return '';
  if (!Array.isArray(sc)) sc = [sc];
  return sc.map(function (s) { return String(s).split(';')[0]; }).join('; ');
}
function mergeCookie_(a, b) {
  var map = {};
  (a + '; ' + b).split(';').forEach(function (p) {
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
function pickText_(s, re) { var m = String(s).match(re); return m ? (m[2] || m[1]) : ''; }
function allMatches_(s, re) {
  var out = [], m;
  while ((m = re.exec(s)) !== null) out.push(m[1] || m[0]);
  return out;
}

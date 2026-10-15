// ============================================================
// tests/version.test.js — เลข ?v= / ป้ายหัวเว็บ / CHANGELOG ตรงกัน (CACHE-03) · รัน: node --test tests/
// ============================================================
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const {checkVersion,firstToken}=require('../tools/check-version.js');

const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const page=(ver,tags)=>`<div class="brand-name">เซฟวันโก<span class="brand-ver">v${ver}</span></div>\n${tags.join('\n')}`;
const log=ver=>`# CHANGELOG\n\n---\n\n## v${ver} (6 ต.ค. 2569) — ทดสอบ\n\n## v1.0.0 (เก่า)\n`;

test('ไฟล์จริงใน repo: ?v= ทุกตัว + CHANGELOG ตรงป้ายหัวเว็บ',()=>{
  const r=checkVersion(read('index.html'),read('CHANGELOG.md'));
  assert.deepEqual(r.problems,[]);
  assert.equal(r.count,31); // 29 js/css (v3.2.0 +util-calc.js +views/util.js · v3.3.0 +views/util-meter.js · v3.3.3 −data-fetch.js) + ไอคอนแอป 2 ตัว — เพิ่ม/ลบไฟล์ให้แก้เลขนี้ด้วย
});

test('ตรงกันหมด = ผ่าน · ข้าม CDN กับ manifest',()=>{
  const html=page('3.1.0',['<link rel="manifest" href="manifest.webmanifest">',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>',
    '<link rel="stylesheet" href="css/base.css?v=3.1.0">','<script src="js/utils.js?v=3.1.0"></script>',
    '<script type="module" src="js/firebase/auth.js?v=3.1.0"></script>']);
  assert.deepEqual(checkVersion(html,log('3.1.0')).problems,[]);
});

test('ไฟล์หนึ่งลืมเปลี่ยนเลข = ไม่ผ่าน และบอกชื่อไฟล์',()=>{
  const html=page('3.1.0',['<script src="js/utils.js?v=3.1.0"></script>','<script src="js/charts.js?v=3.0.4"></script>']);
  const p=checkVersion(html,log('3.1.0')).problems;
  assert.equal(p.length,1);
  assert.match(p[0],/js\/charts\.js \?v=3\.0\.4/);
});

test('แก้ซ้ำวันเดียวกัน: ?v=เลขป้าย.2 ผ่าน · ปนกับเลขป้ายเฉยๆ = ไม่ผ่าน',()=>{
  const ok=page('3.3.3',['<script src="js/utils.js?v=3.3.3.2"></script>','<link rel="stylesheet" href="css/base.css?v=3.3.3.2">']);
  const r=checkVersion(ok,log('3.3.3'));
  assert.deepEqual(r.problems,[]); assert.equal(r.token,'3.3.3.2');
  const mix=page('3.3.3',['<script src="js/utils.js?v=3.3.3.2"></script>','<script src="js/charts.js?v=3.3.3"></script>']);
  assert.match(checkVersion(mix,log('3.3.3')).problems.join(),/js\/charts\.js \?v=3\.3\.3 ไม่ตรงกับไฟล์อื่น/);
  assert.match(checkVersion(page('3.3.3',['<script src="js/a.js?v=3.3.30"></script>']),log('3.3.3')).problems.join(),/ไม่ตรงป้ายหัวเว็บ/);
});

test('?v= ตัวแรกของหน้า (เทียบเว็บจริง)',()=>{
  assert.equal(firstToken(page('3.3.3',['<script src="https://cdn/x.js"></script>','<link rel="stylesheet" href="css/base.css?v=3.3.3.2">'])),'3.3.3.2');
  assert.equal(firstToken('<p>ไม่มี</p>'),null);
});

test('ไฟล์ใหม่ไม่มี ?v= = ไม่ผ่าน',()=>{
  const html=page('3.1.0',['<script src="js/utils.js?v=3.1.0"></script>','<script src="js/new.js"></script>']);
  assert.match(checkVersion(html,log('3.1.0')).problems.join(),/js\/new\.js ไม่มี \?v=/);
});

test('CHANGELOG หัวข้อบนสุดคนละเลข = ไม่ผ่าน',()=>{
  const html=page('3.1.0',['<script src="js/utils.js?v=3.1.0"></script>']);
  assert.match(checkVersion(html,log('3.0.4')).problems.join(),/CHANGELOG\.md หัวข้อบนสุด v3\.0\.4/);
});

test('ไม่มีป้ายหัวเว็บ = ไม่ผ่าน',()=>{
  assert.match(checkVersion('<script src="js/a.js?v=1.0.0"></script>',log('1.0.0')).problems.join(),/ไม่เจอป้ายเวอร์ชัน/);
});

# เซฟวันโก | รายงานการจองตลาด

แดชบอร์ดรายงานการจองตลาด 3 สาขา (ศรีสมาน / ประตูกรุงเทพ / บางนา)
เว็บ **static ล้วน — ไม่มี build step** เปิดด้วยเว็บเซิร์ฟเวอร์ธรรมดาได้เลย

---

## โครงสร้างไฟล์

```
saveone-go-admin/
├── index.html                  โครง HTML อย่างเดียว (~850 บรรทัด)
├── manifest.webmanifest        PWA — เพิ่มลงหน้าจอโฮม
├── CHANGELOG.md                ประวัติการแก้ไข v2.5.x – ปัจจุบัน
├── README.md
├── CLAUDE.md                   คู่มือทำงานสำหรับ Claude Code (อ่านอัตโนมัติ)
├── CONTEXT.md                  ศัพท์และกติกาธุรกิจ (โซน, วันฝน, Cancel/Absent ฯลฯ)
├── skills-lock.json            รายการ skill ของ agent ใน .agents/
├── .gitignore
├── .gitattributes
│
├── assets/
│   ├── logo.png                โลโก้รถ — splash, การ์ด login, หัวเว็บ
│   ├── logo-wordmark.svg       โลโก้ตัวอักษรบริษัท (เวกเตอร์) — login, หัวรายงาน
│   ├── LoGosaveonego.png       ต้นฉบับที่ใช้ลากเส้นเป็น wordmark (หน้าเว็บไม่ได้โหลด)
│   ├── apple-touch-icon.png    180×180 ไอคอน iPhone
│   ├── icon-192.png            ไอคอน Android
│   └── icon-512.png            ไอคอน Android (ใหญ่)
│
├── css/                        ⚠ ลำดับการโหลดสำคัญ (ดูหัวข้อถัดไป)
│   ├── base.css                design tokens, โหมดสว่าง/มืด, reset
│   ├── layout.css              header, เมนูโปรไฟล์, sidebar, content
│   ├── components.css          แท็บ, KPI, กราฟ, ตาราง, พาเนล
│   ├── screens.css             หน้า login, splash, ปุ่มพับ sidebar
│   ├── night.css               โทน "ตลาดกลางคืน" ทับค่าเดิม — หลัง screens ก่อน responsive
│   └── responsive.css          media query มือถือ/PWA — ต้องท้ายสุด
│
└── js/
    ├── firebase/               ES module (type="module")
    │   ├── init.js             ตั้งต้น Firebase ครั้งเดียว แล้ว export
    │   ├── auth.js             login/logout + กระจายสิทธิ์ตาม role (import settings.js)
    │   ├── settings.js         หน้าตั้งค่า ราคา · ฤดูกาล · เป้ายอด · ประวัติการแก้ (admin)
    │   └── user-admin.js       เมนูโปรไฟล์ + จัดการผู้ใช้ (admin)
    │
    ├── config.js               ค่าคงที่, state, เป้ารายวัน
    ├── utils.js                ตัวแปลงรูปแบบ, ชุดราคา/ฤดูกาล/รายรับ, แปลงแถว CSV
    ├── data-fetch.js           token, fetch + timeout/retry, คุมท่อขนาน
    ├── data-cache.js           เก็บ CSV ใน localStorage + สิทธิ์สาขา
    ├── data-load.js            loadAll, สถานะข้อมูล, refresh, รวม ST+Non
    ├── filters.js              ตัวกรอง + applyAll (ตัวกระจายงานไปแต่ละหน้า)
    ├── trend.js                ทิศทาง 7 วันล่าสุด vs 7 วันก่อน (ฟังก์ชันล้วน ไม่แตะ DOM)
    ├── charts.js               แกนกลางกราฟ: plugin, สีตามธีม, สร้าง/ทำลาย
    ├── export.js               ส่งออก CSV
    ├── ui.js                   splash, drawer มือถือ, ธีม, ล็อกข้างหลังป๊อปอัป, auto refresh
    ├── login-fx.js             ฉากหลังหน้า login (WebGL shader ไม่มีไลบรารี)
    ├── today.js                ป๊อปอัป "ยอดวันนี้" — เด้งครั้งแรกของวัน + ปุ่ม 📅
    │
    └── views/                  หนึ่งไฟล์ต่อหนึ่งแท็บรายงาน
        ├── overview.js         ภาพรวม + สถานะเทียบเป้า + วันฝน
        ├── forecast.js         พยากรณ์
        ├── raw.js              ข้อมูลดิบ
        ├── compare.js          เปรียบเทียบเดือน
        ├── heatmap.js          ปฏิทินล็อก
        └── benchmark.js        เทียบสาขา + เทรนด์รายเดือน
```

นอกหน้าเว็บ (ไม่ถูกโหลดโดย `index.html`):

```
├── tests/                      node --test tests/
│   ├── pricing.test.js         ชุดราคาตามวันเริ่มใช้ (ADR 0001)
│   └── trend.test.js           js/trend.js
├── tools/fetch-reservation/    Apps Script ดึงยอดจองจากเว็บบริษัทเข้า Sheet (วางเองใน Apps Script)
├── docs/                       กติกาธุรกิจ, Firestore Rules ฉบับเต็ม, ADR
└── .agents/                    skill ของ agent (ไม่เกี่ยวกับเว็บ)
```

ผังตลาด 3D อยู่ repo แยก `3D-Market-SR` — เว็บนี้แค่ลิงก์ไป `/3D-Market-SR/?branch=...`

---

## ⚠ ลำดับการโหลด — ห้ามสลับ

เดิมโค้ดทั้งหมดอยู่ใน `index.html` ไฟล์เดียว การแยกไฟล์จึง **คงลำดับเดิมไว้เป๊ะๆ**
เพราะมีโค้ดที่ทำงานทันทีตอนโหลด และ hoisting ของ JavaScript
ใช้ได้เฉพาะ "ภายในไฟล์เดียวกัน" เท่านั้น

| ไฟล์ | บรรทัดที่รันทันทีตอนโหลด |
|---|---|
| `js/config.js` | `let TARGETS = loadTargets()` |
| `js/charts.js` | `Chart.register(revealPlugin)` |
| `js/ui.js` | `startAutoRefresh(5)` · โหลดธีมจาก localStorage |

- **CSS** — เป็น cascade เดียวกันทั้งหมด สลับลำดับ = สไตล์ถูกทับผิดตัว
  `responsive.css` ต้องอยู่ท้ายสุดเสมอ
- **JS** — `js/charts.js` อยู่ "ตรงกลาง" รายการ views ตามลำดับเดิมของ index.html
  ไม่ใช่ความผิดพลาด **อย่าย้ายขึ้นไปข้างบน**

### ทำไม js/*.js ถึงไม่เป็น ES module

`index.html` เรียกฟังก์ชันผ่าน `onclick="setBranch(...)"` กว่า 60 จุด
ซึ่งต้องการให้ฟังก์ชันอยู่บน **global scope** — โค้ดใน ES module ไม่อยู่บน global
จึงคงไว้เป็น classic script ทั้งหมด ส่วน Firebase เป็น module อยู่แล้วตั้งแต่ต้น
(`type="module"` ถูก `defer` อัตโนมัติ → ทำงานหลัง `js/*.js` เสมอ
`js/firebase/auth.js` จึงเรียก `showSplash()` / `loadAll()` ได้อย่างปลอดภัย)

---

## รันในเครื่อง

ต้องเปิดผ่าน HTTP เท่านั้น — เปิดไฟล์ตรงๆ (`file://`) จะไม่ทำงาน
เพราะ ES module และ Firebase ติด CORS

```bash
python -m http.server 8781
# แล้วเปิด http://localhost:8781
```

⚠ ต้องพอร์ต **8781** — API key ของ Firebase จำกัดที่อยู่ไว้แค่ `genzeus-web.github.io` กับ `localhost:8781`
เปิดจากพอร์ต/ที่อยู่อื่น (เช่น Live Server `127.0.0.1:5500`) = ล็อกอินไม่ได้

---

## Deploy

GitHub Pages เสิร์ฟจาก branch `main` — **push ขึ้น `main` = ขึ้นเว็บจริงทันที** ไม่มีขั้นตอน deploy แยก

ทุกเวอร์ชันต้องเปลี่ยน `?v=` ท้าย `<script>`/`<link>` ใน `index.html`
(Pages แคชไฟล์ 10 นาที ถ้าไม่เปลี่ยน เบราว์เซอร์จะได้ไฟล์เก่าปนใหม่) — ขั้นตอนเต็มดู `CLAUDE.md`

ไฟล์ที่หน้าเว็บโหลดเป็น **ตัวพิมพ์เล็ก** — เซิร์ฟเวอร์ Linux แยกตัวพิมพ์ใหญ่-เล็ก
(`LoGosaveonego.png` เป็นข้อยกเว้นเพราะไม่มีหน้าไหนโหลด)

---

## หมายเหตุความปลอดภัย

`apiKey` ของ Firebase ใน `js/firebase/init.js` เป็นค่าสาธารณะตามปกติของ Firebase
**ไม่ใช่ความลับ** ด่านป้องกันจริงคือ Firebase Auth + Firestore Security Rules
ห้ามเอา service account / private key ฝั่ง server มาไว้ในโปรเจกต์นี้
(`.gitignore` กันไว้แล้วชั้นหนึ่ง)

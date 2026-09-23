# เซฟวันโก | รายงานการจองตลาด

แดชบอร์ดรายงานการจองตลาด 3 สาขา (ศรีสมาน / ประตูกรุงเทพ / บางนา)
เว็บ **static ล้วน — ไม่มี build step** เปิดด้วยเว็บเซิร์ฟเวอร์ธรรมดาได้เลย

---

## โครงสร้างไฟล์

```
saveone-go-admin/
├── index.html                  โครง HTML อย่างเดียว (878 บรรทัด)
├── manifest.webmanifest        PWA — เพิ่มลงหน้าจอโฮม
├── CHANGELOG.md                ประวัติการแก้ไข v2.5.x – v2.11.x
├── README.md
├── .gitignore
├── .gitattributes
│
├── assets/
│   ├── logo.png                โลโก้หน้า splash
│   └── apple-touch-icon.png    180×180 ไอคอน PWA
│
├── css/                        ⚠ ลำดับการโหลดสำคัญ (ดูหัวข้อถัดไป)
│   ├── base.css                design tokens, โหมดสว่าง/มืด, reset
│   ├── layout.css              header, เมนูโปรไฟล์, sidebar, content
│   ├── components.css          แท็บ, KPI, กราฟ, ตาราง, พาเนล
│   ├── screens.css             หน้า login, splash, ปุ่มพับ sidebar
│   └── responsive.css          media query มือถือ/PWA — ต้องท้ายสุด
│
└── js/
    ├── firebase/               ES module (type="module")
    │   ├── init.js             ตั้งต้น Firebase ครั้งเดียว แล้ว export
    │   ├── auth.js             login/logout + กระจายสิทธิ์ตาม role (import settings.js)
    │   ├── settings.js         หน้าตั้งค่า ราคา · ฤดูกาล · เป้ายอด · ประวัติการแก้ (admin)
    │   └── user-admin.js       เมนูโปรไฟล์ + จัดการผู้ใช้ (admin)
    │
    ├── utils.js                ตัวแปลงรูปแบบ, ชุดราคา/ฤดูกาล/รายรับ, แปลงแถว CSV
    ├── data-fetch.js           token, fetch + timeout/retry, คุมท่อขนาน
    ├── data-cache.js           เก็บ CSV ใน localStorage + สิทธิ์สาขา
    ├── data-load.js            loadAll, สถานะข้อมูล, refresh, รวม ST+Non
    ├── filters.js              ตัวกรอง + applyAll (ตัวกระจายงานไปแต่ละหน้า)
    ├── charts.js               แกนกลางกราฟ: plugin, สีตามธีม, สร้าง/ทำลาย
    ├── export.js               ส่งออก CSV
    ├── ui.js                   splash, drawer มือถือ, ธีม, auto refresh
    │
    └── views/                  หนึ่งไฟล์ต่อหนึ่งแท็บรายงาน
        ├── overview.js         ภาพรวม + สถานะเทียบเป้า + วันฝน
        ├── forecast.js         พยากรณ์
        ├── raw.js              ข้อมูลดิบ
        ├── compare.js          เปรียบเทียบเดือน
        ├── heatmap.js          ปฏิทินล็อก
        └── benchmark.js        เทียบสาขา + เทรนด์รายเดือน
```

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
python -m http.server 8000
# แล้วเปิด http://localhost:8000
```

---

## Deploy

อัปทั้งโฟลเดอร์ ยกเว้นสิ่งที่อยู่ใน `.gitignore`
ต้องมีครบทุกอันนี้ ไม่งั้นจะ 404 เงียบๆ:

```
index.html · manifest.webmanifest · css/ · js/ · assets/
```

ชื่อไฟล์ใน `assets/` เป็น **ตัวพิมพ์เล็ก** — เซิร์ฟเวอร์ Linux แยกตัวพิมพ์ใหญ่-เล็ก

---

## หมายเหตุความปลอดภัย

`apiKey` ของ Firebase ใน `js/firebase/init.js` เป็นค่าสาธารณะตามปกติของ Firebase
**ไม่ใช่ความลับ** ด่านป้องกันจริงคือ Firebase Auth + Firestore Security Rules
ห้ามเอา service account / private key ฝั่ง server มาไว้ในโปรเจกต์นี้
(`.gitignore` กันไว้แล้วชั้นหนึ่ง)

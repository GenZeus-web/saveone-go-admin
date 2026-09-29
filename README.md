# เซฟวันโก | รายงานการจองตลาด

แดชบอร์ดรายงานการจองตลาด 3 สาขา (ศรีสมาน / ประตูกรุงเทพ / บางนา)
เว็บ **static ล้วน — ไม่มี build step** เปิดด้วยเว็บเซิร์ฟเวอร์ธรรมดาได้เลย

---

## โครงสร้างไฟล์

```
saveone-go-admin/
├── index.html              โครงหน้าเว็บ
├── manifest.webmanifest    PWA
├── CHANGELOG.md            ประวัติเวอร์ชัน
├── assets/                 โลโก้ · ไอคอน
├── css/                    base · layout · components · screens · night · responsive
├── js/
│   ├── firebase/           ล็อกอิน · สิทธิ์ · ตั้งค่า · จัดการผู้ใช้
│   ├── config.js           ค่าคงที่ · state
│   ├── utils.js            ตัวช่วยทั่วไป · ราคา
│   ├── data-*.js           โหลด · แคชข้อมูล
│   ├── filters.js          ตัวกรอง
│   ├── trend.js            ทิศทางยอด 7 วัน
│   ├── charts.js           กราฟ
│   ├── export.js           ส่งออก CSV
│   ├── ui.js               splash · เมนูมือถือ · ธีม
│   ├── login-fx.js         ฉากหลังหน้า login
│   ├── today.js            ป๊อปอัปยอดวันนี้
│   └── views/              หนึ่งไฟล์ต่อหนึ่งแท็บรายงาน
├── tests/                  node --test tests/
├── tools/                  สคริปต์ Apps Script (ไม่ใช่ส่วนของหน้าเว็บ)
└── docs/                   เอกสารประกอบ
```

---

## รันในเครื่อง

```bash
python -m http.server 8781
# เปิด http://localhost:8781
```

ต้องใช้พอร์ต 8781 · เปิดไฟล์ตรงๆ (`file://`) ไม่ได้

---

## Deploy

push ขึ้น `main` = ขึ้น GitHub Pages ทันที · ขั้นตอนก่อน push ดู `CLAUDE.md`

# Firestore Rules สำหรับหน้าตั้งค่า (SET-01)

หน้าตั้งค่าเขียนข้อมูล 3 ที่ ถ้าไม่เพิ่มกฎ ปุ่มบันทึกจะขึ้น "ไม่มีสิทธิ์บันทึก"
กฎจริงอยู่ใน Firebase Console ไม่ได้อยู่ใน repo — **คัดส่วนข้างล่างไปวางเพิ่ม ห้ามลบกฎเดิม**

Firebase Console → Firestore Database → แท็บ **Rules** → วางไว้ใน `match /databases/{database}/documents { … }`
ถัดจากกฎ `users` / `data` เดิม → กด **Publish**

```
    // ── SET-01: หน้าตั้งค่า ──
    function signedIn() { return request.auth != null; }
    function isAdminUser() {
      return signedIn()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    // ใส่รหัสผ่านยืนยันมาไม่เกิน 5 นาที (หน้าเว็บ reauthenticate ทุกครั้งก่อนบันทึก/ยกเลิกราคา)
    function recentlyConfirmed() {
      return request.auth.token.auth_time > request.time.toMillis() / 1000 - 300;
    }

    // ราคา + ฤดูกาล: ทุกคนที่ล็อกอินอ่านได้ (ต้องใช้คำนวณรายรับ) · เขียนได้เฉพาะ admin ที่เพิ่งใส่รหัส
    match /settings/pricing {
      allow read: if signedIn();
      allow write: if isAdminUser() && recentlyConfirmed();
    }
    // เป้ายอด: ทุกคนอ่านได้ · admin เขียนได้ (ไม่ต้องใส่รหัส — ตกลงกันไว้ Q12)
    match /settings/targets {
      allow read: if signedIn();
      allow write: if isAdminUser();
    }
    // ประวัติการแก้: admin เพิ่มได้อย่างเดียว (ต้องลงชื่อตัวเอง) · แก้/ลบไม่ได้ทุกคน
    // อ่านได้เฉพาะบัญชีเจ้าของระบบ
    match /settingsLog/{id} {
      allow create: if isAdminUser() && request.resource.data.by == request.auth.token.email;
      allow read: if signedIn() && request.auth.token.email == 'anansit@saveone.go';
      allow update, delete: if false;
    }
```

## ข้อจำกัดที่ควรรู้

- กฎนี้ **ไม่ได้** ตรวจว่าชุดราคาที่มีผลไปแล้วถูกแก้ไหม (Rules เทียบ list ซ้อนกันได้ยาก)
  ด่านนี้อยู่ที่หน้าเว็บ (บันทึกได้แค่ชุดใหม่ที่วันเริ่มใช้ ≥ พรุ่งนี้ · ยกเลิกได้แค่ชุดที่ยังไม่มีผล)
  admin ที่เข้า Firebase Console ตรงๆ ยังแก้ได้ — แต่จะไม่มีประวัติใน `settingsLog`
- ถ้าเปลี่ยนอีเมลเจ้าของระบบ ต้องแก้ 2 ที่: กฎนี้ + `OWNER_EMAIL` ใน `js/firebase/settings.js`

## ทดสอบหลังวางกฎ

1. บัญชี admin → เมนูโปรไฟล์ → ⚙️ ตั้งค่า → แท็บเป้ายอด → เปลี่ยน 1 ช่อง → บันทึก ต้องขึ้น "บันทึกเป้ายอดแล้ว"
2. แท็บราคา → แก้ 1 ช่อง → ตรวจและบันทึก → ใส่รหัส → ต้องขึ้นชุด "⏳ รอมีผล" → กดยกเลิก → ใส่รหัส → หายไป
3. บัญชี anansit@saveone.go → แท็บประวัติการแก้ ต้องเห็น 3 รายการข้างบน
4. บัญชี manager → ไม่มีเมนูตั้งค่า · ช่องเป้าในไซด์บาร์กดแก้ไม่ได้

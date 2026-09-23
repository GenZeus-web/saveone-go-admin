# Firestore Rules สำหรับหน้าตั้งค่า (SET-01)

หน้าตั้งค่าเขียนข้อมูล 3 ที่ ถ้าไม่เพิ่มกฎ ปุ่มบันทึกจะขึ้น "ไม่มีสิทธิ์บันทึก"
กฎจริงอยู่ใน Firebase Console ไม่ได้อยู่ใน repo — **คัดส่วนข้างล่างไปวางเพิ่ม ห้ามลบกฎเดิม**

Firebase Console → Firestore Database → แท็บ **Rules** → วางไว้ใน `match /databases/{database}/documents { … }`
วาง **ก่อนบรรทัด** `match /{document=**} {` (กฎปฏิเสธทุกอย่างท้ายไฟล์) → กด **Publish**
ใช้ฟังก์ชัน `isSignedIn` · `hasProfile` · `isAdmin` ที่กฎเดิมมีอยู่แล้ว (ตรวจกับ Console 23 ก.ย. 2569) — ไม่ต้องประกาศซ้ำ

```
    // SET-01 (v2.12.0): หน้าตั้งค่า ราคา · ฤดูกาล · เป้ายอด — ดู docs/firestore-rules-settings.md
    // ใส่รหัสผ่านยืนยันมาไม่เกิน 5 นาที (เว็บ reauthenticate ทุกครั้งก่อนบันทึก/ยกเลิกราคา)
    function recentlyConfirmed() {
      return request.auth.token.auth_time > request.time.toMillis() / 1000 - 300;
    }
    // ราคา + ฤดูกาล: ทุกคนที่มีโปรไฟล์อ่านได้ (ใช้คำนวณรายรับ) · เขียนได้เฉพาะ admin ที่เพิ่งใส่รหัส
    match /settings/pricing {
      allow get: if hasProfile();
      allow list: if false;
      allow write: if isAdmin() && recentlyConfirmed();
    }
    // เป้ายอด: ทุกคนที่มีโปรไฟล์อ่านได้ · admin เขียนได้ (ไม่ต้องใส่รหัส)
    match /settings/targets {
      allow get: if hasProfile();
      allow list: if false;
      allow write: if isAdmin();
    }
    // ประวัติการแก้: admin เพิ่มได้อย่างเดียว (ลงชื่อตัวเอง) · แก้/ลบไม่ได้ · อ่านได้เฉพาะเจ้าของระบบ
    match /settingsLog/{id} {
      allow create: if isAdmin() && request.resource.data.by == request.auth.token.email;
      allow get, list: if isSignedIn() && request.auth.token.email == 'anansit@saveone.go';
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

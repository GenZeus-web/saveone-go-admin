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
    // PERM-08 (v3.0.1): ราคาอ่านได้เฉพาะคนที่เห็นรายรับ (admin หรือ users/{uid}.showRevenue == true)
    //   ผู้ใช้แก้โปรไฟล์ตัวเองไม่ได้ (กฎ users: update เฉพาะ admin ที่ไม่ใช่ตัวเอง) → ค่า showRevenue เชื่อได้
    function canSeeRevenue() {
      return isAdmin() || (hasProfile() && myDoc().showRevenue == true);
    }
    // ราคา + ฤดูกาล: อ่านได้เฉพาะคนที่มีสิทธิ์รายรับ · เขียนได้เฉพาะ admin ที่เพิ่งใส่รหัส
    match /settings/pricing {
      allow get: if canSeeRevenue();
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

## PERM-08 — ปิดราคาจากคนที่ไม่มีสิทธิ์รายรับ (v3.0.1 · 25 ก.ย. 2569)

เดิม `settings/pricing` ใช้ `allow get: if hasProfile();` = ทุกคนที่ล็อกอินได้อ่านราคาทุกช่อง
(เว็บซ่อนเงินแล้ว แต่คนที่เปิด Console ของเบราว์เซอร์เรียก Firestore เองยังอ่านได้)

**ลำดับสำคัญ — push เว็บก่อน แล้วค่อย Publish กฎ** (กลับกับปกติ เพราะรอบนี้ "ปิด" ไม่ใช่ "เปิด")
1. push เว็บ v3.0.1 → เว็บใหม่ไม่อ่านราคาถ้าไม่มีสิทธิ์รายรับ
2. Console → Firestore → Rules → **แทนที่** บล็อก `match /settings/pricing { … }` เดิม
   ด้วยบล็อกข้างบน (ใส่ `function canSeeRevenue()` ไว้เหนือ match) → Publish
   ถ้า Publish ก่อน push: manager ที่ยังใช้เว็บเก่าจะขึ้นแถบ "โหลดราคาไม่ได้" (ไม่พัง แต่ตกใจ)
3. ทดสอบตามข้อ 5–6 ข้างล่าง

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
5. (PERM-08) บัญชี manager ที่ปิดรายรับ (เช่น TestSG) → เปิดเว็บ ไม่มีแถบ "โหลดราคาไม่ได้" · ยอดล็อก/เป้าปกติ
   F12 → Console ต้องไม่มี error `permission-denied` ของ settings/pricing
6. (PERM-08) บัญชี admin → รายรับ/หน้าตั้งค่าราคาปกติ

# SaveOne Go — แผนงาน & Framework
เอกสารวางแผน วิเคราะห์ เครื่องมือ และประวัติการแก้ | v2.6.5 (4 ส.ค. 2569)

---

## 1. ภาพรวมโปรเจกต์
- **บริษัท:** เซฟวันโก จำกัด
- **ระบบ:** Dashboard รายงานการจองตลาด 3 สาขา (SS/BG/BN)
- **กลุ่มผู้ใช้หลัก:** ผู้บริหาร (admin) + manager
- **เป้าหมาย:** ให้ผู้บริหารเอาข้อมูลไปวิเคราะห์ตัดสินใจ
- **ไม่มี deadline ตายตัว** → เน้นถูกต้อง > เร็ว ตรวจก่อนปล่อย เก็บ log ทุกขั้น

---

## 2. Framework การทำงาน

### โครงหลัก: SDLC 8 ขั้น
1. วางแผน → 2. เก็บความต้องการ → 3. ออกแบบ → 4. พัฒนา → 5. ทดสอบ → 6. แก้บั๊ก/ปรับปรุง → 7. ปล่อยใช้ → 8. ดูแลต่อเนื่อง

### Small Framework (mini-cycle ต่อ 1 งาน)
```
ออกแบบ → ลงมือ (str_replace) → ทดสอบ (syntax+logic+ทุก role×สาขา) → จด log → bump version
```
**กฎ version:** แก้ bug = patch (2.x) | feature/UX ใหญ่ = major (3.0)

### 🔍 5W1H (ใช้ขั้นวางแผน)
| | |
|---|---|
| What | Dashboard จองตลาด 3 สาขา รวมรายรับ/ล็อก/ส่วนลดวันฝน |
| Why | ผู้บริหารเห็นข้อมูลจริงรายวัน เอาไปวิเคราะห์ แทนรวมมือ |
| Who | admin (เห็นเงิน) + manager (เห็นแค่ล็อก) |
| Where | เว็บ GitHub Pages เปิดผ่าน browser มือถือ/คอม |
| When | ดูได้ตลอด อัปจาก Sheet / ไม่มี deadline |
| How | HTML หน้าเดียว + PapaParse ดึง Sheet + Firebase คุมสิทธิ์ + Chart.js |

### 📊 SWOT (ทบทวนสถานะ ณ v2.3)
**Strengths:** ค่าคำนวณถูกต้องทุกสาขา / แยกสิทธิ์ชัด ปิดเงินรั่วครบ / หน้าเดียวเบาเปิดมือถือได้ / มี log+test ทุกการแก้

**Weaknesses:** ผูกกับ Sheet (เปลี่ยนโครงสร้างแล้วพัง) / ยังไม่มี alert **ส่งออกนอกเว็บ** (LINE/อีเมล) ต้องเปิดเว็บถึงเห็น / เป้าเก็บ localStorage แยกตามเครื่อง ไม่ sync ข้ามผู้ใช้ / hardcode 3 สาขา (ดูข้อ 8)
~~เลือกช่วงวันเองไม่ได้~~ ✅ v2.4 · ~~heatmap ปรับ layout ไม่ได้~~ ✅ v2.4 · ~~ไม่มีเตือนในเว็บเลย~~ ✅ v2.5.8 (Benchmark) + v2.6.0 (หลุดเป้า)

**Opportunities:** date picker + heatmap ✅ เสร็จ v2.4 / พยากรณ์อิงเดือนปฏิทิน ✅ เสร็จ v2.5.7 / Benchmark เทรนด์+ป้ายเตือน ✅ เสร็จ v2.5.8 / เทียบเป้า vs ยอดจริง + เตือนหลุดเป้า ✅ เสร็จ v2.6.0 / ต่อยอด: เป้าแยกวันธรรมดา-วันหยุด (ENH-06) · heatmap ระบายสีตามถึงเป้า (ENH-07) · ส่งสรุปเข้า LINE (ENH-03/08) / ขยายสาขาได้ / ทำเป็น template ขายธุรกิจตลาดอื่น

**Threats:** Sheet ผิด→Dashboard ผิด (garbage in/out) / คนกรอกลืม freeday→ส่วนลดเพี้ยน / ตั้งสิทธิ์ Firebase/Firestore rules ผิด→เงินรั่ว / พึ่งบริการฟรี GitHub/Google

> **✅ อุดแล้ว (Security Hardening):** เดิม Apps Script เปิดให้ดึงข้อมูลตรงโดยไม่ต้อง login
> (login เป็นแค่ฉากบังตา) ตอนนี้ทุกสาขาตรวจ Firebase token ก่อนส่งข้อมูล + เลิกใช้ pub URL
> รายละเอียดในไฟล์ 2_SaveOne_Knowledge ข้อ 5
> **✅ เสร็จ v2.5.2 (SEC-06):** Firestore Security Rules อุดแล้ว — `users/{userId}` อ่านได้เฉพาะเจ้าของ (`request.auth.uid == userId`) + `allow write: if false` ห้าม client เขียนทุกกรณี (แก้ role/branches/perms ผ่าน Console เท่านั้น) · collection อื่นปิดหมด · ทดสอบ pentest 🔴 เขียนได้ → 🟢 permission-denied

---

## 2.5 Firestore Security Rules — ตัวที่ใช้จริงตอนนี้

**publish แล้ว 9 ส.ค. 2569 (v2.10.0)** (Console → Firestore → Rules → เวอร์ชันติดดาว)
แก้ที่ Console เท่านั้น · ถ้าแก้ ให้อัปเดตบล็อกนี้ **และไฟล์ `firestore-rules-v2.10.0.txt`** ด้วย ไม่งั้นเอกสารกับของจริงจะไม่ตรงกัน
> ✅ ตรวจแล้ว 9 ส.ค.: เนื้อในบล็อกนี้ = ไฟล์ `firestore-rules-v2.10.0.txt` = ที่ publish อยู่จริง (diff ตรงเป๊ะทุกตัวอักษร)
> ตัว v2.9.0 ยังอยู่ในประวัติ Console กดย้อนได้ · สำเนาอยู่ที่ `firestore-rules-v2.9.0.txt`

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function myDoc() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    function isSignedIn() {
      return request.auth != null;
    }
    function hasProfile() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/users/$(request.auth.uid));
    }
    function isAdmin() {
      return hasProfile() && myDoc().role == 'admin';
    }
    function myBranches() {
      return hasProfile() && myDoc().branches is list ? myDoc().branches : [];
    }
    // BM-04 (v2.10.0): สาขาที่ผู้ใช้ "เทียบได้ใน Benchmark" — แยกคนละแกนกับ branches
    // ไม่มี field / ผิดชนิด = ว่าง = พฤติกรรมเดิมก่อน v2.10.0 เป๊ะ (fail-safe)
    function myBmBranches() {
      return hasProfile() && myDoc().bmBranches is list ? myDoc().bmBranches : [];
    }

    match /users/{userId} {
      allow get: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow list: if isAdmin();
      allow create, update, delete: if isAdmin() && request.auth.uid != userId;
    }

    // ARCH-01: ข้อมูลที่ Apps Script ดันขึ้นทุก 10 นาที
    // docId = SS_ST · SS_NON · BG_ST · BG_CAR · BN_ST · BN_CAR
    //
    // v2.10.0 BM-04: เปิดให้อ่านข้ามสาขาได้ ถ้าสาขานั้นอยู่ใน bmBranches ของผู้ใช้
    //   จำเป็นเพราะ renderBenchmark() อ่านจาก `data/` โดยตรง (getBranchMerged)
    //   ⚠️ นี่คือ CSV ดิบรายวัน ไม่ใช่แค่ค่าเฉลี่ยที่หน้าจอแสดง — ดู SEC-08 ใน WORKFLOW.md
    //      ทางแก้ที่รากคือให้ Apps Script เขียนเอกสารสรุป `benchmark/{branch}` แล้ว
    //      ถอดเงื่อนไข myBmBranches() บรรทัดล่างนี้ออกทั้งหมด กลับไปเป็น ARCH-01 เดิม
    match /data/{docId} {
      allow get: if hasProfile() && (docId.split('_')[0] in myBranches()
                                  || docId.split('_')[0] in myBmBranches());
      allow list: if false;
      allow write: if false;
    }

    // LAY-01 (v2.9.0) / LAY-03 (v2.10.0): ผังกลางของผัง 3D — docId = ชื่อสาขา (SS · BG · BN)
    //
    // ⚠️ LAY-03 ผ่อนกฎที่ LAY-02 ตั้งไว้ — เดิม `create, update: if isAdmin()`
    //   เหตุผลที่ผ่อน: ผังเป็นข้อมูลโครงสร้างตลาด ไม่ใช่ยอดขาย · ผู้จัดการสาขาคือคน
    //   ที่รู้ผังจริงที่สุด แต่เดิมต้องรอ admin กดบันทึกให้ทุกครั้ง = คอขวด
    //   สิ่งที่ยังกันอยู่: เขียนได้เฉพาะสาขาที่ตัวเองดูแล (แก้ผังสาขาอื่นไม่ได้) · ลบไม่ได้
    //   get เปิดให้ทุกคนที่มีโปรไฟล์ — ดูผังข้ามสาขาได้ แต่ deploy ไม่ได้
    match /layouts/{branch} {
      allow get: if hasProfile();
      allow list: if false;
      allow create, update: if hasProfile() && branch in myBranches();
      allow delete: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

> **v2.10.0 แก้ 3 จุด — ไม่แตะ `users/` เลย**
> 1. เพิ่ม `myBmBranches()` + `data/{docId}` อ่านข้ามสาขาได้ถ้าอยู่ใน `bmBranches` (BM-04)
> 2. `layouts/` `get` เปิดให้ทุกคนที่มีโปรไฟล์ — ดูผังข้ามสาขาได้ (LAY-03)
> 3. `layouts/` `create, update` จาก `isAdmin()` → `branch in myBranches()` — **ผ่อนกฎที่ LAY-02 ตั้งไว้** ผู้จัดการสาขาบันทึกผังกลางของสาขาตัวเองได้ ไม่ต้องรอ admin
>
> `delete` **ยังปิดสนิท** — ปุ่ม 🗑 ลบผังกลาง (LAY-05) เป็น `update` ที่เขียน `base = null` ไม่ใช่ `deleteDoc` เจตนาเดิมของ Rules จึงไม่ถูกละเมิด และ `history` รอด กดย้อนคืนได้
> `list` ปิด (ไม่ให้ไล่ดูว่ามีสาขาอะไรบ้าง) · `data/` `write` ปิดทุกกรณี (Apps Script เขียนผ่าน OAuth ไม่ผ่าน Rules อยู่แล้ว)
> `isAdmin()`/`myDoc()` เรียก `get()` = คิดเป็น read 1 ครั้งต่อการเขียน 1 ครั้ง — เขียนวันละไม่กี่ครั้ง ไม่กระทบโควตา
> ⚠️ **ยังไม่ได้ pentest ซ้ำแบบ SEC-06 กับ Rules ชุดนี้:** login เป็น manager BN แล้วลองเขียน `layouts/SS` ต้องได้ `permission-denied`
> 🔴 **บทเรียนลำดับการ publish (v2.10.0):** Rules ชุดนี้ **เปิด**สิทธิ์เขียน แต่ถูก publish ก่อนที่โค้ดด่านล็อก LAY-05 จะขึ้นเว็บ → มีช่วงที่กด ☁ รวดเดียวทับผังกลางได้ **ผังกลาง 6 ส.ค. หายไปเพราะเหตุนี้**
> **กฎ: Rules ที่เปิดสิทธิ์ ต้อง publish ทีหลังโค้ดที่คุมการกดเสมอ · Rules ที่ปิดสิทธิ์ publish ก่อนโค้ด**

**กฎนี้กันอะไร**
- manager เขียน `users` ไม่ได้เลย (ยกระดับสิทธิ์ตัวเองไม่ได้) · อ่านรายชื่อคนอื่นไม่ได้ (`list` เฉพาะ admin)
- **admin แก้เอกสารตัวเองไม่ได้** (`request.auth.uid != userId`) — กันถอด role ตัวเองจนไม่เหลือ admin และกันบัญชีที่ถูกยึดใช้ยกระดับต่อ
- อ่าน `data` ได้เฉพาะสาขาที่มีสิทธิ์ — **บังคับที่ระดับฐานข้อมูล ไม่ใช่แค่ซ่อน UI**
- ไม่มี client ตัวไหนเขียน `data` ได้ (Apps Script เขียนผ่าน OAuth ของ Google ซึ่งข้าม Rules อยู่แล้ว)

**ผลข้างเคียงที่ตั้งใจ:** แก้สิทธิ์ของ admin (รวมตัวเอง) ต้องทำใน Console เท่านั้น

---

## 3. เครื่องมือที่ใช้ (Tech Stack)
| ส่วน | เครื่องมือ |
|---|---|
| Frontend | HTML + CSS + JavaScript (ไฟล์เดียว index.html) |
| ผังตลาด 3D | Three.js r128 + โมเดล `.glb` — **ไฟล์แยก คนละ repo** (`3D-Market-SR`) เข้าจากลิงก์ใน sidebar · เอกสาร `7_market3d-logic.md` |
| กราฟ | Chart.js |
| อ่าน CSV | PapaParse |
| ข้อมูลการจอง | Google Sheets + Google Apps Script (ตรวจ Firebase token ก่อนส่ง) |
| Auth + สิทธิ์ | Firebase Authentication + Firestore |
| Host | GitHub Pages (หลัก) / Netlify (สำรอง) |

**Deploy — มี 2 repo แยกกัน (v2.6.5)**

| repo | ได้เป็น URL | ไฟล์ที่ต้องอัป |
|---|---|---|
| `genzeus-web/saveone-go-admin` | genzeus-web.github.io/saveone-go-admin | `index.html` (+ `logo.png` คู่กัน) + **`apple-touch-icon.png` + `manifest.webmanifest`** (v2.11.0 · PWA) |
| `genzeus-web/3D-Market-SR` | genzeus-web.github.io/3D-Market-SR | `index.html` + โฟลเดอร์ `model/` (.glb 24 ไฟล์) + โฟลเดอร์ **`model-bn/`** (.obj/.mtl 2 ไฟล์ — v0.14.0) |

> 🔴 **กฎที่ได้จาก v2.10.4:** *"ทับเฉพาะ index.html"* **ใช้ไม่ได้เมื่อรอบนั้นเพิ่มโฟลเดอร์ asset ใหม่**
> `model/` กับ `model-bn/` เป็นไฟล์ที่อัปครั้งเดียวจบ (ไม่ถูกแก้ทุกรอบ) จึงลืมง่าย — ลืมแล้ว**หน้าไม่พัง แต่โมเดลไม่ขึ้น** (404 เงียบๆ เห็นแต่พื้นตาราง)
> **รอบไหนเพิ่ม asset ใหม่ ต้องจดลงตารางนี้ทันที** ไม่งั้นรอบถัดไปอ่านคู่มือแล้ว deploy ไม่ครบ
>
> 🆕 **v2.11.0 เพิ่ม 2 ไฟล์แบบเดียวกัน:** `apple-touch-icon.png` (180×180) + `manifest.webmanifest`
> อาการเวลาลืมอัปเหมือน `model-bn/` เป๊ะ — **เว็บไม่พัง** แต่กด "เพิ่มลงหน้าจอโฮม" แล้วไอคอนจะกลายเป็น**ภาพหน้าจอเว็บ**แทนโลโก้
> ทั้ง 2 ไฟล์ต้องอยู่**โฟลเดอร์เดียวกับ `index.html`** (path ในโค้ดเป็นแบบสัมพัทธ์)

- **โดเมนเดียวกัน = same origin** → Firebase session แชร์กันได้ ไม่ต้องย้าย repo ไม่ต้องส่ง token
- **ลำดับตอนอัปพร้อมกัน: ผัง 3D ก่อน แล้วค่อยเว็บหลัก** — ถ้าอัปเว็บหลักก่อน ปุ่มจะพาไปหน้าผังตัวเก่าที่ยังไม่มีด่านตรวจสิทธิ์
- Netlify: saveonego-rp.netlify.app (ลากไฟล์วาง Drop zone) — **เว็บหลักเท่านั้น** · ผัง 3D ใช้ไม่ได้เพราะเป็นคนละ origin (ลิงก์จะ 404)
- อัปเดต: ดาวน์โหลด index.html ใหม่ → อัปขึ้น GitHub หรือ Netlify
- GitHub Pages ต้อง rebuild + กระจาย CDN ~1–10 นาที ไม่เห็นผลทันทีเป็นเรื่องปกติ

---

## 4. การตั้งค่า Firebase

### Config
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD37irb272WHjyIxj3KE5hUZB4dXMe6Pvs",
  authDomain: "saveone-go-5fe9d.firebaseapp.com",
  projectId: "saveone-go-5fe9d",
  storageBucket: "saveone-go-5fe9d.firebasestorage.app",
  messagingSenderId: "868815689407",
  appId: "1:868815689407:web:a828e97b081da19908180a",
  measurementId: "G-3377NJYQFG"
};
```

### Users (Firebase Auth)
| บัญชี | Role |
|---|---|
| เจ้าของระบบ | admin |
| ผอ. | admin |
| บัญชีทดสอบ manager | manager |

> รายชื่อจริง + UID ดูใน Firebase Console → Authentication (ไม่เก็บใน repo เพราะ repo เป็น public)

### Firestore: collection `users` (Document ID = UID)
```json
{
  "email": "...", "role": "admin|manager",
  "branches": ["SS","BG","BN"],
  "bmBranches": ["SS","BG","BN"],

  "showRevenue": true, "showElec": true, "showExport": true,
  "showPriceNote": true, "showFreeday": true, "showWhatIf": true,

  "showCompare": true, "showForecast": true, "showRawData": true,
  "showHeatmap": true, "showBenchmark": true, "showMap3D": true
}
```
> **v2.9.0 เพิ่ม 6 คีย์ล่าง** · **v2.10.0 เพิ่ม `bmBranches`** — รายละเอียดว่าคุมอะไรดู `2_web-logic.md` ข้อ 5
>
> | กลุ่ม | อ่านยังไง | ไม่มี field = ? |
> |---|---|---|
> | 6 คีย์บน (ของเดิม) | `d.x === true` | **ปิด** — fail closed สำหรับข้อมูลเงิน |
> | 6 คีย์ล่าง (v2.9.0) | `d.x !== false` | **เปิด** — ของเดิมทุกคนเห็นอยู่แล้ว ไม่ให้หายเงียบตอน deploy |
> | `bmBranches` (v2.10.0) | `Array.isArray(d.bmBranches) ? … : []` | **ว่าง** — เห็นแค่สาขาตัวเองใน Benchmark = พฤติกรรมเดิมเป๊ะ |
>
> 🔑 **`branches` กับ `bmBranches` เป็นคนละแกน อย่าสับสน**
> `branches` = สาขาที่**ดูแล** → เห็นข้อมูลเต็ม ทุกแท็บ ทุกตัวเลข + เป็นตัวคุมว่า deploy ผังกลางสาขาไหนได้
> `bmBranches` = สาขาที่**เทียบได้** → เอาข้อมูลมาใช้ในหน้า Benchmark เท่านั้น (ยังต้องมี `showRevenue` ถึงจะเห็นตัวเลขเงิน)
>
> **admin ไม่ต้องใส่ field เลยก็ได้** — โค้ดบังคับ `true` ทั้ง 12 ตัว + `bmBranches` ครบ 3 สาขาให้อัตโนมัติ

### วิธีจัดการ
- **⭐ ทางหลัก (v2.7.0 ขึ้นไป):** ในเว็บ → เมนูโปรไฟล์ → **👥 จัดการผู้ใช้** (admin เท่านั้น)
  เพิ่ม/แก้ role/สาขา/สิทธิ์ 12 ตัว/ลบ ได้ครบ ไม่ต้องเข้า Console
- **ทางสำรอง (Console):** Firestore → users → doc(uid) → แก้ field → user login ใหม่
- **แก้สิทธิ์ของ admin (รวมตัวเอง):** ต้องทำใน Console เท่านั้น — Rules ห้ามแก้เอกสารตัวเอง
  (`request.auth.uid != userId`) กันถอด role ตัวเองจนไม่มี admin เหลือ
- **แก้ข้อมูลจอง:** แก้ที่ Google Sheets (ไม่ใช่ Firebase)
- ⚠️ **เพิ่ม field show* ใหม่ ต้องแก้ 4 จุดใน index.html:** `PERM_KEYS` · `PERM_LABEL` ·
  `perms` default + การอ่านค่าใน `onAuthStateChanged` · checkbox `nu<Key>` ในกล่องเพิ่มผู้ใช้
  (ตารางแก้ไขรายแถววน `PERM_KEYS` เอง ไม่ต้องแตะ) · ถ้าตั้งต้นเป็น "เปิด" ใส่ใน `PERM_DEFAULT_ON` ด้วย

### Firestore: collection `layouts` (Document ID = ชื่อสาขา) — v2.9.0 · แก้สิทธิ์ v2.10.0
```json
{ "v":1, "branch":"SS", "base":{ /* snapshotState() ของผัง 3D · null = ถูกลบแล้ว */ },
  "savedAt":"2026-08-06T14:11:00.000Z", "savedBy":"anansit@saveone.go",
  "history":[ {"base":{}, "savedAt":"", "savedBy":""} ]   // ย้อนหลังสูงสุด 3
}
```
> เขียนจากปุ่ม **☁ บันทึกเป็นผังกลาง** ในผัง 3D — ห้ามแก้มือใน Console
> **v2.10.0 (LAY-03):** เขียนได้ = **ผู้จัดการสาขานั้น** (`branch in myBranches()`) ไม่ใช่ admin อย่างเดียวแล้ว
> **v2.10.0 (LAY-05):** ต้อง **ปลดล็อกก่อน** ถึงจะกด ☁ / 🗑 / ↩ ได้ (ปลดแล้วล็อกกลับเองใน 20 วิ)
> `"base": null` = ถูกกด **🗑 ลบผังกลาง** — `history` ยังอยู่ครบ กด ↩ ย้อนคืนได้ · ฝั่งอ่านเจอ `base` ไม่ใช่ object = ตกไปใช้ `BASE_LAYOUT` ในไฟล์
> ⚠️ **ไม่มีการ `deleteDoc` เลย** Rules ปิด `delete` ไว้ — "ลบ" คือ `update` ที่เขียน `base = null` เท่านั้น
> guard 700 KB ก่อนเขียน (Firestore จำกัด 1 MB/เอกสาร) · รายละเอียดดู `7_market3d-logic.md` ข้อ 10.1.1

---

## 5–7. ประวัติการแก้ / งานอนาคต / กฎการทำงาน

> ย้ายไปรวมไว้ที่ **WORKFLOW.md** แล้ว (Fix Log ทุกเวอร์ชัน + งานค้าง + กฎการทำงาน + สถานะล่าสุด)

---

## 8. วิธีเพิ่มสาขาใหม่ (เช่น RS รังสิต)

ตอนนี้ hardcode 3 สาขา — เพิ่มสาขาที่ 4 ต้องแก้ ~6 จุดใน index.html:

1. ~~**PROXIES**~~ — ลบแล้ว v3.0.1 (ARCH-01 อ่าน Firestore แทน) · สาขาใหม่ = เพิ่มเอกสาร `data/{สาขา}_*` ใน Apps Script
   ```js
   RS:'https://script.google.com/macros/s/.../exec'
   // sheets: ?sheet=RS_ST, ?sheet=RS_CAR (หรือ NON)
   ```
   > **🔒 สำคัญ:** Apps Script ตัวใหม่ต้องมี `verifyToken` + `doPost` + อ่านด้วย `SpreadsheetApp.openById`
   > + แปลงวันที่ dd/MM/yyyy เหมือน 3 สาขาเดิม (ก็อปโครงจากตัวเดิม เปลี่ยนแค่ SHEET_ID + ชื่อแท็บ)
   > ไม่งั้นสาขาใหม่จะเปิดข้อมูลให้ดึงตรงโดยไม่ต้อง login
2. **คอลัมน์ค่าไฟ** — เพิ่ม L1_RS_Street/L2_RS_Street ใน mapST + L1_RS_Car ใน mapNon
3. **ราคา Car/Non** — เพิ่ม case ราคาสาขาใหม่ใน getNonPrice (ถ้าราคาต่างจากเดิม) + ระบุ Season
4. **ตัวแปร data + merge** — เพิ่ม rsStData/rsCarData + ฟังก์ชัน mergeRS() + dataLoaded.RS
5. **loadAll()** — เพิ่มบล็อกโหลด RS (fetchCSV 2 sheet → map → merge)
6. **Sidebar** — เพิ่มปุ่มสาขา + branch-item RS + zone label (ST/Car หรือ Non)
7. **Firestore** — เพิ่ม "RS" ใน array `branches` ของ user ที่จะให้ดู
8. **ผังตลาด 3D (ถ้าจะมีผังสาขานั้นด้วย)** — คนละ repo: ถอดพิกัดจาก CAD → `BRANCH.RS = {...}`
   → เพิ่ม `'RS'` ใน `BRANCH_READY` → เพิ่มลิงก์อีก 1 บรรทัดใน sidebar เว็บหลัก
   (`data-branch="RS"` href `/3D-Market-SR/?branch=RS`) · ถ้ายังไม่มีผัง ไม่ต้องทำอะไร
   ผังจะขึ้นข้อความ "สาขานี้ยังไม่มีผัง 3D" ให้เองถ้ามีคนเปิด URL ตรง

> **เงื่อนไขข้อมูล:** Sheet สาขาใหม่ต้องมีคอลัมน์เหมือนเดิม (Online_Lock, WalkIn_Lock, FreeDay ฯลฯ) ถ้าโครงสร้างต่าง ต้องปรับ mapST/mapNon

### 💡 ข้อเสนอ v3.0 — ทำให้เพิ่มสาขาง่ายขึ้น (config-driven)
แทนที่จะ hardcode ให้ย้ายข้อมูลสาขาทั้งหมดเป็น object เดียว:
```js
const BRANCHES = {
  SS: {name:'ศรีสมาน', proxy:'...', zone2:'Non', price:{...}},
  BG: {name:'ประตูกรุงเทพ', proxy:'...', zone2:'Car', price:{low:[250,300],high:[300,350]}},
  // เพิ่มสาขา = เพิ่ม 1 block ตรงนี้ ไม่ต้องไล่แก้ 6 จุด
};
```
แล้ว loop สร้างปุ่ม/โหลดข้อมูล/ราคา จาก object นี้ → เพิ่มสาขาเหลือแก้ที่เดียว

### นำ logic ไปทำ project ใหม่
- **logic reusable:** สูตรราคา/วันฝน/สิทธิ์/filter เอาไปใช้ซ้ำได้เลย (เป็นแกนที่ดี)
- **แต่ไม่ copy-paste แล้วใช้ได้เลย:** ต้องปรับ mapping (Sheet คนละโครงสร้าง), ราคา/นโยบายธุรกิจ, ฟีเจอร์ UI

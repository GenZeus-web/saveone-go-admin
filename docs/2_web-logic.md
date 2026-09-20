# SaveOne Go — Knowledge (Logic เนื้อๆ)
ข้อมูลสำคัญสำหรับทำเว็บให้สมบูรณ์ | v2.6.5 (4 ส.ค. 2569)

---

## 1. โครงสร้างสาขา & ข้อมูล

| รหัส | สาขา | โซน |
|---|---|---|
| SS | ศรีสมาน | ST (Street Food) + Non (Boot Seller) |
| BG | ประตูกรุงเทพ | ST + Car (Boot Sale) |
| BN | บางนา | ST + Car (Boot Sale) |

**แหล่งข้อมูล:** Google Sheets ดึงผ่าน Apps Script ด้วย PapaParse
**โหลดทุกสาขาตอนเปิด** ไม่โหลดซ้ำตอนเปลี่ยนสาขา

### 🔄 เส้นทางการโหลดข้อมูล (v2.6.3 — สำคัญ อ่านก่อนแก้ `loadAll`)

```
เปิดเว็บ
 ├─ 1. loadCache()  มี cache ในเครื่อง?
 │     มี  → applyCsvBundle() → render → hideSplash()  ← เห็นข้อมูลทันที 0 วิ
 │            ป้าย: "ข้อมูล HH:MM · กำลังอัปเดต…"
 │     ไม่มี → โชว์หน้าโหลดตามปกติ (เฉพาะครั้งแรกสุดเท่านั้น)
 └─ 2. fetchPool() ดึงของใหม่  ← ถ้าโชว์ cache อยู่ ทำเบื้องหลัง ไม่บังหน้าจอ
        สำเร็จครบ 6 ท่อ → saveCache() + ป้าย "อัปเดต HH:MM"
        มีท่อพลาด      → ใช้ของเก่าต่อ + ป้าย "· อัปเดตไม่สำเร็จ" (แดง) + แบนเนอร์ #dataHealth
```

**ค่าที่ปรับได้ (อยู่หัวฟังก์ชัน ปรับที่เดียว)**

| ตัวแปร | ค่า | ความหมาย |
|---|---|---|
| `FETCH_CONCURRENCY` | **2** | ยิงพร้อมกันกี่ท่อ — 6 ท่อพร้อมกันเกินลิมิต Google (เคยทำให้โหลด 71.7 วิ) |
| `FETCH_TIMEOUT` | **12000** | ท่อที่สำเร็จใช้ 2-7 วิ เกิน 12 วิแทบไม่มีทางสำเร็จ ตัดแล้ว retry คุ้มกว่ารอ |
| `FETCH_RETRY` / `FETCH_BACKOFF` | **2** / **1000** | ลองซ้ำ 2 ครั้ง หน่วง 1 → 2 วิ |
| `CACHE_MAX_AGE` | **7 วัน** | cache เก่ากว่านี้ไม่ใช้ |

> **⚠️ กฎที่ห้ามพลาด**
> 1. **`saveCache()` ต้องบันทึกเฉพาะตอนได้ครบทั้ง 6 ท่อ** — ถ้า cache ข้อมูลไม่ครบไว้ รอบหน้าจะโชว์เลขผิดโดยไม่มีอะไรเตือน
> 2. **`applyRowsBundle()` เป็นทางเดียวที่ใช้ทั้ง "โหลดสด" และ "อ่าน cache"** — อย่าแยกโค้ด 2 ทาง เดี๋ยวมันเพี้ยนกันคนละแบบ
> 3. **ถ้ากำลังโชว์ cache อยู่ ห้ามเอาหน้า "โหลดไม่ได้" ไปทับ** (`shownFromCache` ใน `catch`)
> 4. **ต้องมีป้ายบอกอายุข้อมูลเสมอ** (`setDataAge`) — ผู้ใช้ต้องรู้ว่ากำลังดูข้อมูลของเมื่อไหร่
> 5. เคยลอง "ยิงทีละท่อในสาขาเดียวกัน" (NET-02) เพราะคิดว่า ST+NON ชนกัน — **พิสูจน์แล้วว่าไม่ใช่** และทำให้ช้าเป็นเท่าตัว **อย่ากลับไปทำอีก** (บันทึกเต็มใน `WORKFLOW.md`)

> **🎯 งานถัดไปที่แก้ที่ราก (ARCH-01):** ย้ายไป Firestore — ให้ Apps Script ทำงานตาม time trigger แล้วหน้าเว็บอ่าน Firestore ตรงๆ · ตอนนี้ cache แค่ทำให้ "ไม่มีใครต้องรอ Apps Script" แต่ตัว Apps Script ยังสุ่มค้างอยู่

> **🔒 อัปเดต (Security Hardening):** Apps Script ทุกตัวตรวจ Firebase ID token
> ก่อนส่งข้อมูลแล้ว — เปิด URL ตรงๆ จะได้ "Unauthorized" หน้าเว็บต้อง login
> มี token จริงเท่านั้นถึงดึงได้ (รายละเอียดในข้อ 5)

### Apps Script URLs
| สาขา | URL (script.google.com/macros/s/.../exec) | sheets |
|---|---|---|
| SS | AKfycbwi_fXqPttjmkiNdjdN46Gqx1cM3-9_k2r4AAjR3b6rBTPPGtVLjUHiidad5mx7pieR | ?sheet=ST, ?sheet=NON |
| BG | AKfycbzgZx9slbAw95GBMHAJFRURU-Zlh-5coW9_aIg1lae0TS1pG8qeNfrGxBMy7chZpFNP | ?sheet=BG_ST, ?sheet=BG_CAR |
| BN | AKfycbwQPzzxpQsWY8fqiS1AZ1V0eYTU7xB1wKEMEb4N19lwnADguiPuzAbOjKb3eHc7cj7DAg | ?sheet=BN_ST, ?sheet=BN_CAR |

**วิธีเรียก:** ส่งแบบ **POST** แนบ `token` (Firebase ID token) ใน body + `?sheet=...` ใน URL
Apps Script อ่านข้อมูลด้วย `SpreadsheetApp.openById()` อ่าน sheet ตรง (ไม่ใช้ pub URL แล้ว)

### คอลัมน์ Sheet (ทุก sheet เหมือนกัน)
```
วันที่ | Online_Rai | Online_Lock | WalkIn_Rai | WalkIn_Lock
ล็อกเสริม_Rai | ล็อกเสริม-Lock | Cancel_Rai | Cancel_Lock
ตัดไม่มาทำการค้า_Rai | ตัดไม่มาทำการค้า_Lock | Absent_Rai | Absent_Lock
FreeDay | L1_xxx | L2_xxx | Branch
```
ชื่อค่าไฟ: L1_SS_Street/L2_SS_Street, L1_SS_Non, L1_BG_Street, L1_BG_Car, L1_BN_Street, L1_BN_Car (L2 เช่นกัน)

**FreeDay (วันฝน):** `1`/`true` = วันฝน | `n`/`0`/`false` = ปกติ

---

## 2. ลอจิกราคา (หัวใจของระบบ)

### ST — เหมือนกันทุกสาขา
| ประเภท | จ–พฤ | ศ–อา | วันฝน |
|---|---|---|---|
| Online / ลา / ไม่มา / ตัดไม่มา | 100 | 130 | × 0.5 |
| WalkIn / ล็อกเสริม (SS) | 130 | 160 | **ไม่ลด** |
| WalkIn / ล็อกเสริม (BG/BN) | 130 | 160 | × 0.5 |

### Non/Car — แยกสาขา + Season
**SS Non:** ทุกประเภท 30฿ | Online ลดวันฝน 0.5 | **WalkIn ไม่ลด** (มีแต่ WalkIn ไม่ต้องลด)

**BG Car:** Low(มี.ค.–ต.ค.) 250/300 | High(พ.ย.–ก.พ.) 300/350 | วันฝน × 0.5 ทุกประเภท
**BN Car:** Low 200/250 | High 250/300 | วันฝน × 0.5 ทุกประเภท
> ราคา Car ด้านบน = ราคา **Online**. **WalkIn + ล็อกเสริม Car = ราคา Online + 50** (ทุก season ทุกวัน) แล้วค่อยคูณวันฝน × 0.5 — *SS Non ไม่บวก (คงที่ 30฿ ทุกประเภท)*

> **กฎสำคัญ:** BG/BN WalkIn เข้าระบบแล้ว → ลดวันฝนทุกประเภท | SS WalkIn ยังไม่เข้าระบบ → ไม่ลด

### นโยบาย cancel/absent (สำคัญ — เคยเข้าใจผิด)
Cancel/Absent = คนจอง **Online** แล้วไม่มา → อยู่ในกลุ่ม Online → **ได้ลดวันฝน 0.5 ด้วย** (ไม่เก็บเต็ม)
อยู่ใน onlineLock อยู่แล้ว ไม่นับซ้ำ

---

## 3. สูตรคำนวณ

```
ล็อกรวม = Online_Lock + WalkIn_Lock + ล็อกเสริม_Lock
         (ลา/ไม่มา/ตัดไม่มา อยู่ใน Online แล้ว ไม่นับซ้ำ)

revST (SS)    = online×po×(fd?0.5:1) + walkin×pw + extra×pw
revST (BG/BN) = online×po×(fd?0.5:1) + walkin×pw×(fd?0.5:1) + extra×pw×(fd?0.5:1)
   po = ราคา Online (100/130), pw = ราคาวอค (130/160)

revNon (SS)    = online×30×(fd?0.5:1) + walkin×30   (walkin ไม่ลด)
revNon (BG/BN) = (online×priceCar + (walkin+extra)×(priceCar+50))×(fd?0.5:1)
   priceCar = ราคา Online | WalkIn/ล็อกเสริม = priceCar + 50

revNormal (ไม่มีฝน) = revSTNormal + revNonNormal  (ไม่คูณ fd — ใช้คำนวณ "รายได้ปกติ")

calcDiscount (ส่วนลดวันฝน):
  SS ST:     online×po×0.5
  SS Non:    online×30×0.5
  BG/BN ST:  online×po×0.5 + (walkin+extra)×pw×0.5
  BG/BN Car: (online×priceCar + (walkin+extra)×(priceCar+50))×0.5

ค่าไฟ = 200W แรก 30฿ + ส่วนเกินทุก 100W อีก 10฿ (บันทึกมิเตอร์จริง L1/L2)
```

> **ยืนยันแล้ว:** ตรวจ SS/BG/BN เทียบ Sheet จริง — ค่าคำนวณถูกต้องทุกสาขา

---

## 4. Filter Logic

### Zone filter (getFiltered)
- `st` → zero-out non fields | `non` → zero-out ST fields | `all` → ไม่แตะ
- ไม่ swap fields — rev คำนวณจาก non fields โดยตรงในราคา Non ที่ถูก

### Group filter
- online → ST onlineLock + nonOnlineLock
- walkin → ST walkInLock + nonWalkInLock
- extra → ST extraLock + nonExtraLock
- cancel → ST(cancel+absent) + Non(cancel+absent)
- all → ทุกประเภทรวม

### KPI ลา/ไม่มา/เสริม
แยกตาม zone (st/non/all) แต่ **ไม่** filter ตาม group (แสดงเต็มเสมอ)

### Merged data fields
```
date, dateStr, onlineLock, onlineRai, walkInLock, walkInRai,
extraLock, extraRai, cancelLock, cancelRai, absentLock, absentRai, freeDay, l1, l2,
nonLock, nonRai, nonOnlineLock, nonWalkInLock, nonExtraLock,
nonCancelLock, nonAbsentLock, nonOnlineRai, nonWalkInRai,
nonExtraRai, nonCancelRai, nonAbsentRai, nonFree, l1n, l2n
```

---

## 4.1 ผังตลาด 3D — โมดูลแยกไฟล์ (v2.6.5)

ผังตลาด 3D อยู่**คนละ repo** แต่โดเมนเดียวกัน จึงแชร์ session ของ Firebase กันได้

```
genzeus-web.github.io/saveone-go-admin/   ← เว็บหลัก (repo saveone-go-admin)
genzeus-web.github.io/3D-Market-SR/       ← ผัง 3D  (repo 3D-Market-SR)
```

**เว็บหลักแตะแค่จุดเดียว** — ลิงก์ `<a class="branch-item">` ต่อท้ายรายการสาขาใน sidebar
เปิดแท็บใหม่ (`target="_blank" rel="noopener"`) · **v2.10.4 มี 2 ตัว:**

| id | ไปไหน | ป้ายที่แสดง |
|---|---|---|
| `link-map3d` | `/3D-Market-SR/?branch=SS` | ศรีสมาน · เปิดแท็บใหม่ |
| `link-map3d-bn` | `/3D-Market-SR/?branch=BN` | **บางนา · พรีวิว (รอ CAD)** |

> **ทั้งคู่ไม่มี `data-branch`** (ถอดออกตั้งแต่ v2.10.0 LAY-03b) — ไม่งั้นลูป "ซ่อนสาขาที่ไม่มีสิทธิ์" จะซ่อนทิ้ง ทั้งที่ผัง 3D เปิดให้ดูข้ามสาขาได้แล้ว
> **PERM-05 คุมด้วย `showMap3D` ตัวเดียว** ผ่าน `querySelectorAll('[id^="link-map3d"]')` — เพิ่มสาขาใหม่ตั้ง id ขึ้นต้น `link-map3d` แล้วไม่ต้องกลับมาแก้โค้ดตรงนี้อีก

| ทำไมทำแบบนี้ | |
|---|---|
| ไม่ฝังเป็นแท็บ / ไม่ใช้ iframe | `index.html` หลักไม่ต้องบวมอีก ~400 KB · คนมาดูแค่ยอดไม่ต้องโหลด Three.js |
| ~~ใช้ `data-branch="SS"`~~ | **เลิกใช้แล้ว (v2.10.0 LAY-03b)** — เคยให้ลูปซ่อนสาขาซ่อนปุ่มให้เอง แต่พอผัง 3D เปิดข้ามสาขา กลายเป็นซ่อนผิดคน · เปลี่ยนมาคุมด้วย `showMap3D` ผ่าน id แทน |
| วางไว้ **หลัง** สาขาทั้ง 3 | บรรทัดตั้ง activeBranch ใช้ `querySelector` เอาตัวแรก ถ้าวางก่อนจะแย่งตัวจริง |
| path เต็มจากราก | relative จะวิ่งไปหาไฟล์ใน `saveone-go-admin/` แล้ว 404 (คนละ repo) |

> **⚠️ ไม่ส่ง ID token ทาง URL เด็ดขาด** — ผัง 3D อ่าน session เองจาก Firebase
> (โดเมนเดียวกัน) · token ใน query string เคยพังมาแล้ว (SEC-03) และรั่วทาง history/log
> **⚠️ Netlify สำรองใช้ผัง 3D ไม่ได้** — คนละ origin ลิงก์จะ 404
> **⚠️ localStorage ใช้ถังเดียวกัน** — คีย์ผังขึ้นต้น `market3d-` ทั้งหมด ไม่ชนกับ
> `saveone_data_v1` / `saveone_targets_v1` ของเว็บหลัก · เพิ่มคีย์ใหม่ต้องคง prefix นี้
>
> สิทธิ์แอดมินของผัง (แผง "ปรับผัง") ใช้ `role === 'admin'` ตัวเดียวกับข้อ 5
> รายละเอียดทั้งหมดอยู่ที่ `7_market3d-logic.md` §0 (repo `3D-Market-SR`)

---

## 5. สิทธิ์ตาม Role (สำคัญ — Security)

**v2.9.0 (PERM-03): สิทธิ์เพิ่มจาก 6 → 12 คีย์** — คุมได้รายคนจากหน้าจัดการผู้ใช้

| คีย์ | คุมอะไร | ค่าตั้งต้นถ้าไม่มี field ใน Firestore |
|---|---|---|
| `showRevenue` | รายรับทุกที่ (KPI · กราฟเปรียบเทียบ · ข้อมูลดิบ · พยากรณ์ · **ตัวเลขเงินในวันฝน**) | ❌ ปิด (`=== true`) |
| `showElec` | ค่าไฟ | ❌ ปิด |
| `showExport` | Export CSV | ❌ ปิด |
| `showPriceNote` | แท็บหมายเหตุราคา | ❌ ปิด |
| `showFreeday` | **เข้าแท็บวันฝนได้** (ไม่รวมตัวเลขเงิน) | ❌ ปิด |
| `showWhatIf` | บล็อก What If | ❌ ปิด |
| `showCompare` 🆕 | แท็บเปรียบเทียบเดือน | ✅ **เปิด** (`!== false`) |
| `showForecast` 🆕 | แท็บพยากรณ์ | ✅ เปิด |
| `showRawData` 🆕 | แท็บข้อมูลดิบ | ✅ เปิด |
| `showHeatmap` 🆕 | แท็บปฏิทินล็อก | ✅ เปิด |
| `showBenchmark` 🆕 | แท็บ Benchmark | ✅ เปิด |
| `showMap3D` 🆕 | ลิงก์ผังตลาด 3D | ✅ เปิด |

> **⚠️ คีย์ใหม่ 6 ตัวใช้ `!== false` ไม่ใช่ `=== true`** — ตั้งใจ เพราะของเดิมทุกคนเห็นอยู่แล้ว
> ถ้าใช้ `=== true` ผู้ใช้เดิมที่ยังไม่มี field นี้จะโดนถอดสิทธิ์เงียบๆ ทันทีที่ deploy
> **คีย์เดิม 6 ตัวยังเป็น `=== true` เหมือนเดิม ห้ามเปลี่ยน** (fail closed สำหรับข้อมูลเงิน)

**ของที่ทุกคนเห็นเสมอ:** หน้าภาพรวม · กราฟล็อก · สถิติการจอง (รายรับแสดง —)

**ด่านพิเศษที่ไม่ใช่แค่ perm**

| ฟีเจอร์ | เงื่อนไขเพิ่ม |
|---|---|
| **Benchmark — เข้าแท็บ** | `showBenchmark` **ตัวเดียว** (v2.10.0 BM-04 ถอดด่าน `branches.length > 1` ของ PERM-01/02 ออก) |
| **Benchmark — เห็นข้อมูลสาขาไหน** | `branches ∪ bmBranches` — ไม่ใส่ `bmBranches` = เห็นแค่สาขาตัวเอง (พฤติกรรมเดิม) |
| **Benchmark — ตัวเลขเงิน** | `showRevenue` — ปิดแล้วการ์ด "รายรับรวม" ขึ้น `—` (จุดแสดงเงินมีจุดเดียวทั้งหน้า) |
| ผัง 3D — เข้าดู | **ทุกคนที่ login + มีโปรไฟล์** (v2.10.0 LAY-03) + สาขาต้องอยู่ใน `BRANCH_READY` **หรือ** `BRANCH_PREVIEW` |
| ผัง 3D — สาขาไหนเข้าได้บ้าง (v2.10.4) | `BRANCH_READY = ['SS']` = ผังจริงเต็มรูปแบบ · `BRANCH_PREVIEW = ['BN']` = **โหมดพรีวิว** เห็นโมเดล + วาดโซนอีเวนต์/วางของได้ แต่เครื่องมือที่ต้องใช้พิกัดแถว/ล็อกขึ้นป้าย "รอ CAD" · **BG ยังไม่มีทั้งคู่** → ขึ้นข้อความ "สาขานี้ยังไม่มีผัง 3D" ตามเดิม |
| ผัง 3D — โหมดพรีวิว เก็บข้อมูลที่ไหน | **`localStorage` เครื่องตัวเองล้วน** (`market3d-BN-preview-events` / `-props`) — **ไม่แตะ Firestore เลยสักจุด** จึงไม่ต้องแก้ Rules และไม่มีผังกลางให้ deploy |
| ผัง 3D — แผง "ปรับผัง" · ลากทาวเวอร์ · ลากผัง | **ทุกคนที่เข้าดูได้** (`CAN_EDIT`) — แก้แล้วเก็บใน localStorage ตัวเอง ไม่กระทบใคร |
| ผัง 3D — ☁ **บันทึกผังกลาง** · 🗑 ลบ · ↩ ย้อน | `branches.includes(สาขานั้น)` (`CAN_DEPLOY`) **+ ต้องปลดล็อกก่อน** (LAY-05) · Rules บังคับซ้ำที่ฐานข้อมูล |

> **v2.10.0 เพิ่ม field `bmBranches`** (คนละแกนกับ `branches`) — `branches` = สาขาที่ดูแล เห็นเต็ม + deploy ผังได้ · `bmBranches` = สาขาที่เทียบได้ ใช้ในหน้า Benchmark เท่านั้น
> อ่านแบบ fail-safe: ไม่มี field = ว่าง = พฤติกรรมเดิมเป๊ะ ไม่มีใครโดนเปิดสิทธิ์เงียบๆ ตอน deploy
>
> **v2.10.0 (WI-01) `showWhatIf` ผูกกับ `showForecast`** — What If เป็น `.fc-panel` ที่ฝังอยู่ **ในแท็บพยากรณ์** ไม่ใช่แท็บของตัวเอง · หน้าจัดการผู้ใช้ติ๊ก What If แล้วพยากรณ์ติดตามอัตโนมัติ + normalize ซ้ำก่อนเขียน Firestore
>
> **v2.10.0 (PERM-06) ค่าตั้งต้นของ manager ที่สร้างใหม่เปลี่ยน:** `PERM_DEFAULT_ON` = `showFreeday` `showWhatIf` `showCompare` `showForecast` `showHeatmap` `showBenchmark` `showMap3D`
> **เอา `showRawData` ออก** — ข้อมูลดิบให้ล็อกรายวันแยกออนไลน์/วอล์กอิน/โซนครบทุกวัน ถึงซ่อนคอลัมน์เงินก็คูณราคาเองได้ **ซ่อนผลลัพธ์แต่ไม่ซ่อนตัวตั้ง = ไม่ได้ซ่อนจริง**
> ⚠️ มีผลกับ **ผู้ใช้ที่สร้างใหม่เท่านั้น** — คนเดิมยังเห็นอยู่ (`!== false` fail-open) ต้องไปติ๊กออกเอง

**กลไก gate (ฝั่งหน้าจอ):** `window.userPerms.<key>` + `document.body.class no-rev/no-elec` + CSS ซ่อน `.col-rev/.col-elec`

**PERM-04:** ถ้าแท็บที่ `.active` อยู่ถูกซ่อนตามสิทธิ์ → `setView('overview')` อัตโนมัติ (กันค้างอยู่ในแท็บที่เพิ่งโดนถอดสิทธิ์)

**FD-01 — แท็บวันฝนแยก 2 ชั้น:** `showFreeday` = เข้าแท็บได้ · `showRevenue` = เห็นตัวเลขเงิน
manager ที่ได้ `showFreeday` แต่ไม่ได้ `showRevenue` จะเห็น: จำนวนวันฝน · ออนไลน์ล็อกรวม · ตารางวันที่/ล็อก/ลา/ไม่มา · กราฟจำนวนวันฝน
ซ่อน: KPI เงิน 4 ใบ · กราฟส่วนลด(บาท) · คอลัมน์เงิน 4 ช่อง — **ใช้ class `.col-rev` เดิม ไม่มีกลไกใหม่**

**FD-02/FD-03 (v2.10.2) — แท็บวันฝนเคารพ zone + group แล้ว:** เดิม `renderFreeday()` อ่าน field ฝั่ง ST ตรงๆ (`r.onlineLock`/`absentLock`/`cancelLock`/ราคา ST) และไม่ส่ง `group` เข้าไปเลย → โซน Car โชว์ล็อก 0 + ราคา ST + สลับกลุ่มแล้วตัวเลขไม่เปลี่ยน
- ล็อก → `getLock(r,group)` (รวม ST+Non) · ลา/ไม่มา → รวม `nonAbsentLock`/`nonCancelLock` · ราคา → โซน non ใช้ `getNonPrice()` (Car +50 สำหรับ WalkIn/เสริม)
- `calcDiscount(r,g='all')` รับ group ได้แล้ว (default `'all'` — call site อื่นไม่กระทบ) · KPI/ตาราง/กราฟ/หัวคอลัมน์ทั้งหมดส่ง `group` ปัจจุบันเข้าไป
- **% ที่หายไป:** SS + ST + กลุ่มออนไลน์ = 50% เป๊ะ (Online ลด 50% ล้วน) · กลุ่ม "ทั้งหมด" ของ SS < 50% เพราะรวม WalkIn/เสริมที่ SS ไม่ลด — ถูกต้องตามกฎ ไม่ใช่บั๊ก

> **v2.3 ปิดช่องรายรับรั่ว 3 จุด:** กราฟเปรียบเทียบเดือน, คอลัมน์ข้อมูลดิบ, การ์ดพยากรณ์
> **v2.5.7 เพิ่มจุดที่ต้อง gate:** การ์ดรายรับฝั่ง "เดือนนี้" ในหน้าพยากรณ์ (`_curRevCards` → `_fcRev`)

> **🔒 Security Hardening (ฝั่ง server — สำคัญ):**
> เดิม role/permission กันแค่ฝั่งหน้าจอ ส่วนข้อมูลจริงดึงตรงจาก Apps Script ได้
> โดยไม่ต้อง login (login เป็นแค่ฉากบังตา) — แก้แล้วดังนี้:
> - **หน้าเว็บ:** `fetchCSV()` ส่งแบบ POST แนบ Firebase ID token (`window.getIdToken()`) ใน body
> - **Apps Script ทั้ง 3 สาขา:** `verifyToken()` ตรวจ token กับ Firebase ก่อนส่งข้อมูล
>   ไม่ผ่าน → "Unauthorized" | `doGet` ตอบ Unauthorized (กันเปิด URL ตรง) | ใช้ `doPost` รับ token
> - เลิกใช้ publish-to-web /pub URL → อ่าน sheet ตรงด้วย `SpreadsheetApp.openById()`
> - แปลงวันที่เป็น dd/MM/yyyy ก่อนส่ง (`Utilities.formatDate`) ให้ `parseD()` อ่านได้
> - **หมายเหตุ:** Firebase apiKey ในโค้ดเป็นค่าสาธารณะปกติ ไม่ใช่ความลับ
> - **✅ เสร็จ v2.5.2 (SEC-05):** `loadAll()` ยิง 6 ท่อพร้อมกันด้วย `Promise.all` + ดึง token ครั้งเดียวใช้ซ้ำ (`refreshToken()`/`cachedToken`) + `fetchCSV` retry 1 ครั้งกัน SS=0 ตอน cold start + ฝั่ง Apps Script `verifyToken` cache ด้วย `CacheService` 5 นาที
> - **✅ เสร็จ v2.5.2 (SEC-06):** Firestore Rules — `users/{userId}` อ่านได้เฉพาะเจ้าของ + `allow write: if false` (แก้ role/perms ผ่าน Console เท่านั้น) ทดสอบ pentest 🔴→🟢 ผ่าน

---

## 6. การแสดงผลพิเศษ (ที่ต้องระวังตอนแก้)

- **คอลัมน์ราคา/ล็อก (ข้อมูลดิบ):** วันฝนแสดง `po/2 / (SS:pw, BG-BN:pw/2)` — display only ไม่กระทบรายรับ
- **กราฟหลัก:** filter กลุ่มย่อย (ไม่ใช่ all) → ไม่เอา targetLock มา clamp แกน Y + ซ่อนเส้นเป้าหมาย (กันแท่งเตี้ย) — `targetLock` มาจาก `currentTarget()` ดูข้อ 7
- **Benchmark:** ไม่ใส่ filter zone/group (ตามดีไซน์) · กราฟเฉลี่ย/วันรายเดือน **ตัดวันที่ล็อก = 0 ออกก่อนเฉลี่ย** (`bmMonthlyAvg`) · ป้ายเตือนไหลลงใช้ deadband 3% (`BM_DROP_PCT`) ปรับได้ที่หัวฟังก์ชันพร้อม `BM_MIN_DAYS=7` / `BM_ALERT_N=3`
- **พยากรณ์:** อิง **เดือนปฏิทินจริง** ทั้งคู่ (ไม่ใช่ 30 วัน rolling) — `_daysInNext` จัดการข้ามปี + ปีอธิกสุรทินแล้ว
- **Splash:** แสดงหลัง login เท่านั้น | โหมดสว่างต้อง override สี .splash-company | **ทุก exit path ต้องเรียก `hideSplash()`** — splash เป็น `z-index:9999` ถ้าลืมซ่อนตอน error ผู้ใช้จะเห็นเป็นหน้าโหลดค้าง มองไม่เห็นข้อความ error ที่อยู่ข้างหลัง
- **แบนเนอร์ข้อมูลไม่ครบ (`#dataHealth`):** `renderDataHealth()` ต้องถูกเรียกทุกครั้งที่โหลดจบ **รวมเคสที่ `refreshBranch` return ก่อนกำหนด** — ไม่งั้นผู้ใช้เห็นเลข 0 แล้วนึกว่าไม่มีลูกค้าจริง
- **กราฟ:** `makeChart` เช็ค `el.getContext` + `el.isConnected` + ห่อ `new Chart` ด้วย try/catch — กราฟตัวเดียวพังต้องไม่ล้มทั้งหน้า (เจอตอนสาขาว่าง 0 แถว)
- **Heatmap:** cell responsive (aspect-ratio พอดีจอ) + dropdown เลือกจำนวนเดือน 3/6/12/ทั้งหมด
- **Zone label:** SS=Non·Boot Seller, BG/BN=Car·Boot Sale (เปลี่ยนตาม branch)
- **Auto refresh:** ทุก 5 นาที
- **มือถือ ≤768px (v2.11.0 RWD-01):** sidebar กลายเป็น **drawer** `position:fixed` เลื่อนออกจากซ้าย
  - มี **2 โหมดพับที่ต้องไม่ปนกัน** — จอใหญ่ใช้ `.collapsed` (`toggleSidebar()` · ปุ่ม `#sidebarBtn`) · มือถือใช้ `.mopen` (`toggleMobileNav()` · ปุ่ม `#mnavBtn`)
    บนมือถือ `#sidebarBtn` ถูกซ่อน และ media query เขียน `.sidebar.collapsed` ทับ ไม่งั้นถ้าผู้ใช้เคยกดพับบนจอใหญ่ไว้ พอย่อจอ sidebar จะค้างซ่อนเปิดไม่ได้เลย
  - **แก้ CSS แล้วอย่าลืมเช็คจอใหญ่ด้วย** — ทุกอย่างอยู่ใน `@media(max-width:768px)` ถ้าเผลอเขียนนอก block จะไปกระทบ desktop
  - `.content{overflow-x:hidden}` กันทั้งหน้าเลื่อนซ้ายขวา · ตารางเลื่อนในกล่องตัวเองผ่าน `min-width` (min-width ชนะ max-width เสมอ)
  - ช่องกรอกบนมือถือต้อง `font-size:16px` ขึ้นไป — ต่ำกว่านี้ Safari ซูมหน้าเองตอนแตะ แล้วผู้ใช้ต้องถอยจอเอง
- **PWA (v2.11.0 PWA-01):** `apple-mobile-web-app-capable=yes` = เปิดจากไอคอนหน้าจอโฮมแล้วไม่มีแถบ URL
  - safe-area (`env(safe-area-inset-*)`) ใส่ไว้ใน `@media(display-mode:standalone)` → **มีผลเฉพาะโหมดแอป** เปิดใน Safari ปกติหน้าตาไม่เปลี่ยน
  - ต้อง deploy `apple-touch-icon.png` + `manifest.webmanifest` คู่กับ `index.html` เสมอ (ดู `6_project-setup.md`)

---

## 7. ระบบเป้าหมาย (ENH-05 · v2.6.0)

เดิมเป้าเป็นช่องเดียว (`targetLock=400`) ใช้ร่วมทุกสาขา/ทุกโซน + รีทุกครั้งที่เปิดเว็บ
ตอนนี้แยกเป็น **สาขา × โซน** เก็บถาวรในเครื่อง

### โครงข้อมูล
```js
const TGT_KEY='saveone_targets_v1';                              // localStorage key
const TGT_DEF={SS:{st:400,non:0},BG:{st:350,non:120},BN:{st:300,non:90}};  // ค่าเริ่มต้น
const TGT_MISS_STREAK=3;                                          // หลุดกี่วันติด = ธงแดง
let TARGETS=loadTargets();                                        // {SS:{st,non},BG:{...},BN:{...}}
```

### ฟังก์ชันหลัก
| ฟังก์ชัน | ทำอะไร |
|---|---|
| `loadTargets()` | อ่านจาก localStorage · พังหรือไม่มี → คืน `TGT_DEF` (clamp ≥ 0) |
| `saveTargets()` | เขียนกลับ localStorage (try/catch ไม่ให้ล้ม) |
| `currentTarget()` | เป้าของสาขา+โซนที่ดูอยู่ — `st`→st, `non`→non, `all`→ **st + non** |
| `syncTargetUI()` | ตั้ง `targetLock` + อัปเดต input 2 ช่อง + ป้ายสาขา/โซนใน sidebar |
| `setTargetZone(z,v)` | เซ็ตค่า (clamp 0–99999) → save → sync → `applyAll()` |
| `renderTargetStatus(d)` | แถบสรุปพับได้ + กล่องเป้าเดือน + รายการ 5 วันล่าสุด |

### โครงหน้าจอ (v2.6.4 UI-04 — เปลี่ยนจากเดิม)
```
รายรับ (KPI 5 การ์ด)
สถิติการจอง (KPI 6 การ์ด)          ← เดิมบล็อกเป้าคั่นตรงนี้ ทำให้ KPI ขาดกัน
<details id="targetPanel">          ← ย้ายลงมาไว้ตรงนี้ + พับได้ (ค่าเริ่มต้น = พับ)
  <summary id="targetSummary">      ← แถบ 1 บรรทัด ~40px
    #targetSummaryText              ← streak + สาขา(โซน) + เฉลี่ย/เป้า + % ต่ำกว่าเป้า + % เป้าเดือน
  #targetMonthBox (เป้าเดือน/เพซ/โน้ต/5 วันล่าสุด)
  แถบสรุปเป้า (เป้าหมาย/เฉลี่ยจริง/ถึงเป้า/ไม่ถึง/%)
</details>
กราฟรายวัน
```
> **`#targetAlert` ถูกลบแล้ว** — โค้ดใหม่เขียนลง `#targetSummaryText` แทน อย่าไปเรียกของเดิม
> ค่าที่โชว์บนแถบพับใช้ตัวแปรที่ฟังก์ชันคำนวณอยู่แล้ว (`streak` / `streakSum` / `tgt` / `pct`) ไม่มีการคำนวณใหม่

### เกณฑ์แบนเนอร์เตือน (หน้าภาพรวม)
| สถานะ | เงื่อนไข |
|---|---|
| 🔴 แดง | หลุดเป้าติดกัน ≥ `TGT_MISS_STREAK` (3) วัน |
| 🟠 ส้ม | หลุดติดกัน 1–2 วัน |
| 🟢 เขียว | วันล่าสุดถึงเป้า |

### ข้อจำกัดที่ตั้งใจ
1. แบนเนอร์ + กล่องเป้าเดือน **โชว์เฉพาะตอน group = "ทุกกลุ่ม"** — กรอง online/walkin แล้วเทียบเป้าไม่แฟร์ จึงซ่อน
2. เพซคิดจาก "จำนวนวันที่มีข้อมูลในเดือน ÷ วันทั้งเดือน" ไม่ใช่วันปฏิทินจริง — ตลาดปิดบางวันเพซจะดูช้ากว่าจริงนิดหน่อย
3. เป้าเก็บใน localStorage = **แยกตามเครื่อง/เบราว์เซอร์ ไม่ sync ข้ามผู้ใช้** (ถ้าต้องการ sync ต้องย้ายไป Firestore)

> **ระวังตอนแก้:** ทุกที่ที่ต้องใช้เป้า ให้เรียก `currentTarget()` **ห้ามอ่าน `getElementById('targetInput')`** (ช่องเดิมถูกแทนด้วย `targetInputST` / `targetInputNon` แล้ว — บั๊ก CMP-06 มาจากจุดนี้)
> `applyAll()` ตั้ง `targetLock = currentTarget()` ทุกรอบ กราฟ/เส้นเป้า/ข้อมูลดิบ จึงใช้เป้าเดียวกันเสมอ

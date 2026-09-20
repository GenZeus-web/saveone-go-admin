# SaveOne GO — โค้ด Apps Script (Backup/Reference)

**v3 (6 ส.ค. 2569)** — สถาปัตยกรรมใหม่ ARCH-01 · deploy จริงแล้วทั้ง 3 สาขา

> **โค้ดนี้อยู่บน Google (script.google.com) ไม่ได้อยู่ใน `index.html`**
> เก็บที่นี่เป็น backup เผื่อ deployment หาย / เพิ่มสาขาใหม่ / ต้องแก้ทีหลัง

---

## หลักการทำงาน (v3 — เปลี่ยนจากเดิมทั้งหมด)

**เดิม (v2):** ผู้ใช้เปิดเว็บ → เว็บ POST ถาม Apps Script → รอ → อ่านชีต → ตอบ CSV
**ใหม่ (v3):** Apps Script **ทำงานเองทุก 10 นาที** → อ่านชีต → เขียน CSV ลง Firestore
เว็บอ่าน Firestore อย่างเดียว **ไม่ยุ่งกับ Apps Script อีกเลย**

```
[Google Sheet] ──(trigger ทุก 10 นาที)──> [Apps Script] ──> [Firestore: data/{DOC}]
                                                                      │
                                                        [เว็บอ่านตรงนี้ < 1 วิ]
```

**ทำไมต้องเปลี่ยน:** Apps Script Web App สุ่มพัง `404 macros/echo` = request ไปไม่ถึงตัว script
แก้ที่โค้ดไม่ได้ (retry/timeout/concurrency ลองหมดแล้ว) · 28 ก.ค. โหลด 9.3 วิ → 6 ส.ค. **108.7 วิ พลาด 5/6 ท่อ**

**ผลหลังเปลี่ยน (วัดจริง 6 ส.ค.):**

| สาขา | เอกสาร | เวลารัน |
|---|---|---|
| SS | `SS_ST` 494 แถว · `SS_NON` 372 แถว | 4 วิ |
| BN | `BN_ST` 189 แถว · `BN_CAR` 189 แถว | 5 วิ |
| BG | `BG_ST` 493 แถว · `BG_CAR` 493 แถว | 11 วิ |

พลาด 0 ท่อ · เว็บเปิด **< 1 วินาที**

---

## โครงสร้างข้อมูลใน Firestore

collection **`data`** · 6 เอกสาร: `SS_ST` `SS_NON` `BG_ST` `BG_CAR` `BN_ST` `BN_CAR`

```json
{
  "csv":    "…CSV ดิบทั้งแท็บ…",
  "rows":   494,
  "ts":     1786012698762,
  "branch": "SS",
  "sheet":  "SS_ST"
}
```

> ชื่อเอกสารสำคัญ — Rules ตัด 2 ตัวหน้า (`SS_ST` → `SS`) ไปเทียบกับ `branches` ของผู้ใช้
> เปลี่ยนชื่อเมื่อไหร่ สิทธิ์พังทันที

---

## ค่าที่ต่างกันแต่ละสาขา (นอกนั้นโค้ดเหมือนกันเป๊ะ)

| | SS (ศรีสมาน) | BG (ประตูกรุงเทพ) | BN (บางนา) |
|---|---|---|---|
| `BRANCH` | `'SS'` | `'BG'` | `'BN'` |
| `SHEET_ID` | `<SHEET_ID_SS>` | `<SHEET_ID_BG>` | `<SHEET_ID_BN>` |
| `TABS` คีย์ 1 | `'SS_ST'` → `Report Srisaman` | `'BG_ST'` → `Report SaveOne Go` | `'BN_ST'` → `Report Bangna` |
| `TABS` คีย์ 2 | `'SS_NON'` → `Report-Boot Seller` | `'BG_CAR'` → `Report-Car Boot` | `'BN_CAR'` → `Bangna - Car Boot` |
| `buildCSV` fallback | `'NON'` → Boot Seller | `'BG_CAR'` → Car Boot | `'BN_CAR'` → Car Boot |
| `doPost` default | `'ST'` | `'BG_ST'` | `'BN_ST'` |

**/exec URL เดิม (ยังไม่ได้ลบ deployment):**
- SS `AKfycbwi_fXqPttjmkiNdjdN46Gqx1cM3-9_k2r4AAjR3b6rBTPPGtVLjUHiidad5mx7pieR`
- BG `AKfycbzgZx9slbAw95GBMHAJFRURU-Zlh-5coW9_aIg1lae0TS1pG8qeNfrGxBMy7chZpFNP`
- BN `AKfycbwQPzzxpQsWY8fqiS1AZ1V0eYTU7xB1wKEMEb4N19lwnADguiPuzAbOjKb3eHc7cj7DAg`

---

## appsscript.json (เหมือนกันทั้ง 3 สาขา)

⚠️ ต้องเปิดให้เห็นก่อน: ⚙️ การตั้งค่าโครงการ → ☑️ แสดงไฟล์ Manifest

```json
{
  "timeZone": "Asia/Bangkok",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/datastore"
  ]
}
```

> `datastore` = สิทธิ์เขียน Firestore · ไม่ใส่ = `Request had insufficient authentication scopes`

---

## โค้ดเต็ม (ตัวอย่างสาขา SS — สาขาอื่นแก้ตามตารางข้างบน)

```javascript
var FS_PROJECT = 'saveone-go-5fe9d';
var BRANCH     = 'SS';
var SHEET_ID   = '<SHEET_ID_SS>';
var TABS = {
  'SS_ST' : 'Report Srisaman',
  'SS_NON': 'Report-Boot Seller'
};

function pushToFirestore(){
  var ok = 0, fail = 0;
  for(var docId in TABS){
    try{
      var csv  = buildCSVFromTab(TABS[docId]);
      var rows = csv ? csv.split('\n').length : 0;
      // กันเขียนทับข้อมูลดีด้วยข้อมูลว่าง (ชีตพัง/เปลี่ยนชื่อแท็บ)
      if(rows < 2){
        Logger.log('SKIP ' + docId + ' - ได้ ' + rows + ' แถว (ว่างผิดปกติ) ไม่เขียนทับของเดิม');
        fail++; continue;
      }
      if(csv.length > 900000){
        Logger.log('WARN ' + docId + ' ใหญ่ ' + csv.length + ' ตัวอักษร ใกล้ลิมิต 1 MB');
      }
      writeDoc(docId, csv, rows);
      Logger.log('OK เขียน Firestore สำเร็จ: ' + docId + ' (' + rows + ' แถว, ' + csv.length + ' ตัวอักษร)');
      ok++;
    }catch(err){
      Logger.log('FAIL ' + docId + ': ' + err);
      fail++;
    }
  }
  Logger.log('-- สรุป: สำเร็จ ' + ok + ' · พลาด ' + fail);
}

// เขียน 1 เอกสารผ่าน Firestore REST
// ใช้ ScriptApp.getOAuthToken() = สิทธิ์เจ้าของ script (ไม่ต้องมี service account)
// การเรียกด้วย OAuth ของ Google แบบนี้ "ข้าม" Security Rules → ตั้ง write:false ฝั่ง client ได้
function writeDoc(docId, csv, rows){
  var url = 'https://firestore.googleapis.com/v1/projects/' + FS_PROJECT +
            '/databases/(default)/documents/data/' + docId;
  var body = {
    fields: {
      csv:    { stringValue:  csv },
      rows:   { integerValue: String(rows) },
      ts:     { integerValue: String(Date.now()) },
      branch: { stringValue:  BRANCH },
      sheet:  { stringValue:  docId }
    }
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'patch',              // PATCH ไม่มี updateMask = แทนที่ทั้งเอกสาร
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if(code !== 200){
    throw new Error('Firestore ตอบ ' + code + ': ' + res.getContentText().slice(0, 300));
  }
}

function buildCSVFromTab(tabName){
  var tab = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tabName);
  if(!tab) throw new Error('ไม่พบแท็บ: ' + tabName);
  var tz = Session.getScriptTimeZone();
  return tab.getDataRange().getValues().map(function(row){
    return row.map(function(c){
      if(Object.prototype.toString.call(c) === '[object Date]'){
        c = Utilities.formatDate(c, tz, 'dd/MM/yyyy');
      }
      return '"' + String(c).replace(/"/g,'""') + '"';
    }).join(',');
  }).join('\n');
}

/* ===== ด้านล่างคือของเดิม (v2) เก็บไว้เป็นทางถอย — ไม่ได้ใช้แล้ว ===== */

function buildCSV(sheetParam){
  var tabName = (sheetParam === 'NON') ? 'Report-Boot Seller' : 'Report Srisaman';
  return buildCSVFromTab(tabName);
}

function verifyToken(idToken){
  if(!idToken) return null;
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var hit = cache.get(key);
  if(hit) return JSON.parse(hit);
  var API_KEY = 'AIzaSyD37irb272WHjyIxj3KE5hUZB4dXMe6Pvs';
  var url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + API_KEY;
  var res = null;
  for(var i = 0; i < 2; i++){
    try{
      res = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true
      });
      if(res.getResponseCode() === 200) break;
    }catch(err){ res = null; }
    if(i === 0) Utilities.sleep(700);
  }
  if(!res || res.getResponseCode() !== 200) return null;
  var data = JSON.parse(res.getContentText());
  var user = (data.users && data.users[0]) ? data.users[0] : null;
  if(user) cache.put(key, JSON.stringify(user), 3000);
  return user;
}

function out(text){
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e){
  var token = (e && e.parameter) ? e.parameter.token : null;
  if(!verifyToken(token)) return out('Unauthorized');
  var sheet = (e && e.parameter) ? (e.parameter.sheet || 'ST') : 'ST';
  return out(buildCSV(sheet));
}

function doGet(e){
  return out('Unauthorized');
}
```

---

## วิธีติดตั้ง / เพิ่มสาขาใหม่

1. ⚙️ การตั้งค่าโครงการ → ☑️ แสดงไฟล์ Manifest
2. วาง `appsscript.json` (ด้านบน)
3. วางโค้ดใน `รหัส.gs` → แก้ 4 จุดตามตารางสาขา → **บันทึก**
4. เลือกฟังก์ชัน **`pushToFirestore`** → กด **▶ เรียกใช้** → อนุญาตสิทธิ์
   (ขั้นสูง → ไปที่… → อนุญาต) → ดู log ต้องขึ้น `OK เขียน Firestore สำเร็จ` 2 บรรทัด
5. ⏰ ทริกเกอร์ → **+ เพิ่มทริกเกอร์** → `pushToFirestore` / Head / **ตามเวลา** / **นาที** / **ทุก 10 นาที** → บันทึก

> ⚠️ **กด ▶ Run ได้เฉพาะ `pushToFirestore`** — `doGet`/`doPost` กดไม่ได้ (ต้องมี request)
> ⚠️ **ห้ามลบ deployment เดิม** — ถ้าจะย้อนกลับใช้ v2 ต้องใช้ URL เดิม

---

## ถ้าเจอปัญหา

| Log | แปลว่า | แก้ |
|---|---|---|
| `insufficient authentication scopes` | ไม่มี scope `datastore` | แก้ appsscript.json → Run ใหม่ให้ขออนุญาตอีกรอบ |
| `Firestore ตอบ 403` | บัญชีที่รันไม่มีสิทธิ์บนโปรเจกต์ | ต้องเป็นบัญชีเจ้าของ saveone-go |
| `Firestore ตอบ 404` | `FS_PROJECT` ผิด | ต้องเป็น `saveone-go-5fe9d` เป๊ะ |
| `ไม่พบแท็บ: …` | ชื่อแท็บในชีตถูกเปลี่ยน | แก้ `TABS` ให้ตรงชื่อจริง |
| `SKIP … ได้ 0 แถว` | อ่านชีตได้ว่าง | เช็คแท็บมีข้อมูลจริง — **ของเดิมใน Firestore ไม่ถูกทับ** |
| ข้อมูลไม่อัปเดตเกิน 15 นาที | trigger ไม่ทำงาน | ⏰ ทริกเกอร์ → ดู "การดำเนินการ" ว่ามี error ไหม |

---

## โควตา Spark (ฟรี) — ใช้จริงน้อยมาก

| รายการ | ใช้จริง | ลิมิต |
|---|---|---|
| Firestore เขียน | 864/วัน (6 doc × 144 รอบ) | 20,000/วัน |
| Firestore อ่าน | ~2,600/วัน (10 คน × 20 ครั้ง) | 50,000/วัน |
| Apps Script trigger | ~7 นาที/วัน | 90 นาที/วัน |

> อยากประหยัด/สดกว่านี้ ปรับ trigger เป็น 5–30 นาทีได้

---

## 📌 บันทึกการสืบสวนเก่า — เก็บไว้กันไล่ซ้ำ

**ชีตไม่ใช่ปัญหา (วัด 28 ก.ค. ด้วย `timeST()` บน SS):**
`openById` 401ms · `getDataRange` 321ms (**485 × 17** ไม่ใช่ 4,224 — ที่เห็นตอน Ctrl+End เป็น format ค้าง) · `getValues` 285ms · สร้าง CSV 3ms (44,308 ตัวอักษร) · **รวม 1.0 วินาที**
→ **ไม่ต้องล้างชีต ไม่ต้องแก้ `getDataRange()`** · ข้อเสนอ "CSV-01" (ตัดคอลัมน์/แถวว่าง) **ยกเลิกแล้ว** อย่าเอากลับมาโดยไม่มีหลักฐานใหม่

**ทฤษฎีที่พิสูจน์แล้วว่าผิด — อย่าเสียเวลาไล่ซ้ำ:**
❌ ท่อ ST+NON ชนกันในสาขาเดียว · ❌ deployment ของ SS พัง · ❌ ชีตบวม/response ใหญ่ · ❌ token หมดอายุ · ❌ เป็นเฉพาะสาขา SS
**สาเหตุจริง:** ยิงหลายท่อพร้อมกันเกินลิมิต Google + dispatch ฝั่ง Google พังเอง → **แก้ด้วย ARCH-01 (เลิกให้ผู้ใช้รอ Apps Script) จบ**

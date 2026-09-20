// ============================================================
// data-fetch.js — ชั้นเครือข่าย: token, fetch + timeout/retry, คุมจำนวนท่อขนาน     [เดิม 2379-2478]
// ============================================================
// เก็บ token ไว้ใช้ซ้ำทุกท่อ (ดึงครั้งเดียวต่อรอบโหลด แทนการเรียก getIdToken ทุก fetch)
let cachedToken=null;
async function refreshToken(){
  cachedToken = window.getIdToken ? await window.getIdToken() : null;
  return cachedToken;
}

// ── v2.6.2 NET-01: timeout + retry แบบ backoff ──
// เดิม fetch ไม่มี timeout → ถ้า Apps Script ค้าง Promise.all ไม่ settle ตลอดกาล (splash ค้าง)
// เดิม retry 1 ครั้งหน่วง 600ms → เร็วเกิน cache ฝั่ง Apps Script ยังไม่ทัน warm ก็พลาดซ้ำ
// PERF-04: วัดจริงแล้วท่อที่สำเร็จใช้ 2.2-7.5 วิ ไม่มีตัวไหนเกิน 8 วิ
//   -> อะไรที่เกิน ~12 วิ แทบไม่มีทางสำเร็จ รอต่อไปคือรอเปล่า (เคยเจอค้าง 34 วิ แล้วตอบ 404)
//   ตัดที่ 12 วิแล้ว retry เร็วๆ คุ้มกว่ารอ 45 วิ (ท่อค้าง: ~48 วิ -> ~15 วิ)
const FETCH_TIMEOUT=12000;  // ms ต่อ 1 ท่อ (headroom 1.6 เท่าของท่อที่ช้าสุดที่เคยสำเร็จ)
const FETCH_RETRY=2;        // จำนวนครั้งที่ลองซ้ำ (ไม่นับครั้งแรก)
const FETCH_BACKOFF=1000;   // ms ครั้งที่ 1 (ครั้งถัดไปคูณ 2 = 1 วิ -> 2 วิ)
// เก็บว่าท่อไหนพลาดบ้างในรอบล่าสุด — ใช้ทำแบนเนอร์เตือน (NET-03)
let loadErrors=[];
// v2.6.2 PERF-01: เก็บเวลาต่อท่อ ไว้สรุปท้ายรอบ (ดูใน console ว่าช้าที่ไหน)
let fetchTimes=[];

async function fetchCSV(url, _attempt, key){
  const att=_attempt||0;
  const tag=url.slice(-30);
  const _t0=Date.now();
  try {
    // ใช้ token ที่อุ่นไว้แล้ว (loadAll/refreshBranch เรียก refreshToken มาก่อน) — safety net เผื่อยังไม่อุ่น
    if(cachedToken===null && att===0) await refreshToken();
    const ac=new AbortController();
    const tm=setTimeout(()=>ac.abort(),FETCH_TIMEOUT);
    let r;
    try{
      r=await fetch(url,{
        method:'POST',
        redirect:'follow',
        cache:'no-cache',
        signal:ac.signal,
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:'token='+encodeURIComponent(cachedToken||'')
      });
    }finally{ clearTimeout(tm); }
    if(!r.ok) throw new Error('HTTP '+r.status);
    const text=await r.text();
    // Apps Script ตอบ "Unauthorized" เป็น HTTP 200 ตอน token ไม่ผ่าน → ต้องจับเองไม่งั้น parse เป็น CSV ว่าง
    const head=text.trim().slice(0,80).toLowerCase();
    if(head.startsWith('unauthorized')||head.startsWith('sheet not found')){
      throw new Error(text.trim().slice(0,60));
    }
    const parsed=Papa.parse(text,{header:true,skipEmptyLines:true,dynamicTyping:false});
    if(key) rawCSV[key]=text;  // v2.6.3 CACHE-01: เก็บ CSV ดิบไว้ทำ cache (เล็กกว่าเก็บ object ที่ parse แล้วมาก)
    // v2.6.2 PERF-01: บอกเวลาต่อท่อ จะได้รู้ว่าช้าที่ท่อไหน ไม่ต้องเดา
    const _ms=Date.now()-_t0;
    fetchTimes.push({url:tag,ms:_ms,rows:parsed.data.length,tries:att+1});
    console.log(`⏱ ${(_ms/1000).toFixed(1)} วิ  ${tag}  rows: ${parsed.data.length}${att?`  (ลองครั้งที่ ${att+1})`:''}`);
    return parsed.data;
  } catch(e) {
    const msg=e.name==='AbortError'?`timeout ${FETCH_TIMEOUT/1000} วิ`:e.message;
    console.error(`fetchCSV error: ${tag}  ${msg}  (ผ่านไป ${((Date.now()-_t0)/1000).toFixed(1)} วิ)`);
    if(att<FETCH_RETRY){
      const wait=FETCH_BACKOFF*Math.pow(2,att);
      console.warn(`retry ${att+1}/${FETCH_RETRY} ใน ${wait/1000} วิ:`,tag);
      await refreshToken();
      await new Promise(res=>setTimeout(res,wait));
      return fetchCSV(url, att+1, key);
    }
    loadErrors.push({url:tag,msg});
    return [];
  }
}

// ── v2.6.2 PERF-03: จำกัดจำนวนท่อที่ยิงพร้อมกัน ──
// วัดจริงด้วย PERF-01 (28 ก.ค.) พบว่า:
//   - ท่อที่ "สำเร็จ" ใช้เวลาแค่ 2.3-3.0 วิ  (งานจริงเบามาก)
//   - แต่ยิง 6 ท่อพร้อมกัน -> คลื่นแรกพังเกือบหมด หลังรอ 18-25 วิ แล้วค่อย retry ผ่าน
//   - รวมเวลาจริง 71.7 วิ โดยเกือบทั้งหมดเป็น retry + backoff ไม่ใช่งานจริง
//   - "ใครพัง" เป็นเรื่องสุ่ม (รอบนั้น SS ผ่านฉลุย BG/BN พังแทน)
//     -> เป็นลิมิต concurrency รวมฝั่ง Google ไม่ใช่ปัญหาของ script ตัวใดตัวหนึ่ง
// ต้นตอย้อนไปถึง v2.5.2 (SEC-05) ที่เปลี่ยนจากยิงทีละท่อเป็น Promise.all 6 ท่อ
//   ตอนนั้นเร็วขึ้นจริง แต่เริ่มมี SS=0 (มีบันทึกใน Fix Log ว่าใส่ retry "กัน SS=0 ตอน cold start")
//   พอข้อมูลโตขึ้น execution นานขึ้น การทับซ้อนก็หนักขึ้นจนพังบ่อย
const FETCH_CONCURRENCY=2;  // ยิงพร้อมกันกี่ท่อ — ปรับที่นี่ที่เดียว (2 = ปลอดภัย, 3 = เร็วขึ้นแต่เสี่ยงชน)

// คิวงาน: ยิงพร้อมกันไม่เกิน FETCH_CONCURRENCY ท่อ ท่อไหนเสร็จก็ดึงงานถัดไปมาทำต่อ
// tasks = [{key,url}, ...]  คืน {key: rows[]}
async function fetchPool(tasks, limit){
  const out={};
  let next=0;
  async function worker(){
    while(next<tasks.length){
      const t=tasks[next++];
      out[t.key]=await fetchCSV(t.url, 0, t.key);
    }
  }
  const n=Math.min(limit||FETCH_CONCURRENCY, tasks.length);
  await Promise.all(Array.from({length:n}, worker));
  return out;
}

let dataLoaded={SS:false,BG:false,BN:false};


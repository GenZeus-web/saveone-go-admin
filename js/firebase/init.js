// ============================================================
// firebase/init.js — ตั้งต้น Firebase ครั้งเดียว แล้วแจกให้ไฟล์อื่นใช้
// ============================================================
//
// ไฟล์นี้ถูก import จากทั้ง auth.js และ user-admin.js
// เบราว์เซอร์รับประกันว่า ES module ตัวเดียวกันจะถูก "รันครั้งเดียว"
// ต่อให้ถูก import กี่ที่ก็ตาม → app / auth / db จึงเป็นตัวเดียวกันเสมอ
//
// หมายเหตุความปลอดภัย: apiKey ของ Firebase เป็นค่าสาธารณะโดยปกติ ไม่ใช่ความลับ
//   ด่านจริงอยู่ที่ Firebase Auth + Firestore Security Rules
//   (ดู CHANGELOG.md หัวข้อ Security Hardening)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD37irb272WHjyIxj3KE5hUZB4dXMe6Pvs",
  authDomain: "saveone-go-5fe9d.firebaseapp.com",
  projectId: "saveone-go-5fe9d",
  storageBucket: "saveone-go-5fe9d.firebasestorage.app",
  messagingSenderId: "868815689407",
  appId: "1:868815689407:web:a828e97b081da19908180a",
  measurementId: "G-3377NJYQFG"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

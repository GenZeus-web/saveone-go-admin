// ============================================================
// supabase/init.js — ตั้งต้น Supabase ครั้งเดียว แล้วแจกให้ไฟล์อื่นใช้ (แทน firebase/init.js · ย้ายใหญ่ ขั้น 3)
// ============================================================
//
// ที่อยู่ Supabase ของแอปนี้มีที่เดียว = ไฟล์นี้ (กติกา "รวมแต่พร้อมแยก" ข้อ 5)
// โปรเจกต์กลางใช้ร่วมกับระบบสต็อก · ข้อมูลแอปนี้อยู่ schema goadmin เท่านั้น · บัญชี (auth.users) ใช้ชุดเดียวกัน
//
// ความปลอดภัย: publishable key เป็นค่าสาธารณะ (เหมือน apiKey ของ Firebase) ไม่ใช่ความลับ
//   ด่านจริง = กติกาสิทธิ์ (RLS) ใน schema goadmin — saveone-stock-v3/supabase/migrations/*goadmin*

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/+esm';

export const SUPABASE_URL = 'https://xwbbxribzbarwywtadqd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fAYShb0FnVVqVVifQxGNXw_DfNcDGjG';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'goadmin' },
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'goadmin-auth' },
});

// ผู้ใช้ปัจจุบัน — auth.js อัปเดตทุกครั้งที่สถานะล็อกอินเปลี่ยน (แทน auth.currentUser ของ Firebase)
let current = null;
export const setCurrentUser = (u) => { current = u || null; };
export const currentUser = () => current;
export const currentEmail = () => (current && current.email) || '';

// แปลง error ของ Supabase ให้เหลือรหัสที่หน้าเว็บใช้แยกข้อความ (เดิมใช้ e.code ของ Firebase)
//   'permission-denied' = กติกาสิทธิ์ปฏิเสธ · 'conflict' = มีคนบันทึกทับระหว่างแก้ · อื่นๆ = ข้อความเดิม
export function sbErr(error) {
  if (!error) return null;
  const pg = error.code || '';
  const code = (pg === '42501' || error.status === 401 || error.status === 403) ? 'permission-denied'
    : (error.message === 'conflict') ? 'conflict'
    : (error.name === 'AuthApiError' || error.name === 'AuthWeakPasswordError') ? ('auth/' + (error.code || 'error'))
    : (/fetch|network/i.test(error.message || '')) ? 'unavailable'
    : pg;
  return Object.assign(new Error(error.hint || error.message || String(error)), { code, cause: error });
}

// ออกจากระบบเฉพาะเครื่องนี้ — ค่าตั้งต้นของ supabase-js คือ 'global' = หลุดทุกเครื่องทุกแอป (รวมแอปสต็อกในมือถือ)
export const signOutHere = () => sb.auth.signOut({ scope: 'local' });

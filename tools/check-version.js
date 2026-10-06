#!/usr/bin/env node
// ============================================================
// tools/check-version.js — CACHE-03 ตรวจเลขเวอร์ชันก่อน commit (แทนการจำเอง 29 จุด)
// ============================================================
// ทำไมต้องมี ?v=: เว็บแยกเป็น js/css หลายสิบไฟล์ · GitHub Pages แคชไฟล์ละ 10 นาที
//   ไม่เปลี่ยน ?v= = เบราว์เซอร์ได้ไฟล์เก่าปนใหม่ แล้วพังแบบ "canSeeRev is not defined" (เจอจริง v3.0.1 · CACHE-02)
// ตรวจ:
//   1) ป้ายหัวเว็บ (brand-ver) มีเลข vX.Y.Z
//   2) ทุก <script src="js/…"> / <link href="css/…"> / ไอคอน assets/ มี ?v= และเลขตรงกับป้าย
//   3) หัวข้อบนสุดของ CHANGELOG.md เป็นเลขเดียวกับป้าย
//   4) (เฉพาะตอนรันใน git) แก้ไฟล์ใน js/ css/ assets/ เทียบกับเว็บจริง origin/main แล้ว แต่เลขยังเท่าเว็บจริง = ลืม bump
// รัน: node tools/check-version.js · pre-commit เรียกให้เองถ้าตั้ง git config core.hooksPath .githooks
// ตอนรันใน git จะอ่านไฟล์ฉบับที่ stage ไว้ (สิ่งที่กำลังจะ commit จริง) ไม่ใช่ไฟล์ในโฟลเดอร์

const VER_RE=/<span class="brand-ver">v(\d+\.\d+\.\d+)<\/span>/;

// ตรวจข้อ 1–3 จากเนื้อไฟล์ · คืน {version, problems[]}
function checkVersion(html,changelog){
  const problems=[];
  const m=html.match(VER_RE);
  if(!m) return {version:null,problems:['ไม่เจอป้ายเวอร์ชัน <span class="brand-ver">vX.Y.Z</span> ใน index.html']};
  const version=m[1];
  // ไฟล์ของเราเอง = path ที่ขึ้นต้นด้วย js/ css/ assets/ (ไอคอนแอป) · ข้าม CDN และ manifest
  const tagRe=/<(?:script[^>]*\ssrc|link[^>]*\shref)="((?:js|css|assets)\/[^"]+)"/g;
  let t,count=0;
  while((t=tagRe.exec(html))){
    count++;
    const [file,query='']=t[1].split('?');
    const v=(query.match(/(?:^|&)v=([^&]+)/)||[])[1];
    if(!v) problems.push(`${file} ไม่มี ?v= (ต้องเป็น ?v=${version})`);
    else if(v!==version) problems.push(`${file} ?v=${v} ไม่ตรงป้ายหัวเว็บ v${version}`);
  }
  if(!count) problems.push('ไม่เจอ <script src="js/…"> หรือ <link href="css/…"> เลย — รูปแบบ index.html เปลี่ยนไป ตัวเช็คต้องแก้ตาม');
  const top=(changelog.match(/^## v(\d+\.\d+\.\d+)/m)||[])[1];
  if(!top) problems.push('ไม่เจอหัวข้อ "## vX.Y.Z" ใน CHANGELOG.md');
  else if(top!==version) problems.push(`CHANGELOG.md หัวข้อบนสุด v${top} ไม่ตรงป้ายหัวเว็บ v${version}`);
  return {version,problems,count};
}
module.exports={checkVersion,VER_RE};

if(require.main===module){
  const {execSync}=require('child_process');
  const fs=require('fs'),path=require('path');
  const root=path.join(__dirname,'..');
  const git=cmd=>execSync('git '+cmd,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});
  let inGit=true;
  try{ git('rev-parse --git-dir'); }catch(e){ inGit=false; }
  // ใน git: อ่านฉบับที่ stage ไว้ · ไม่มี git: อ่านไฟล์ในโฟลเดอร์
  const read=f=>{ if(inGit){ try{ return git('show :'+f); }catch(e){} } return fs.readFileSync(path.join(root,f),'utf8'); };
  const {version,problems,count}=checkVersion(read('index.html'),read('CHANGELOG.md'));

  if(inGit&&version){
    let live=null;
    try{ live=(git('show origin/main:index.html').match(VER_RE)||[])[1]||null; }catch(e){}
    if(!live) console.log('ℹ️  ข้ามข้อ 4: ไม่เจอ origin/main (ยังไม่เคย fetch?)');
    else{
      const changed=git('diff --cached --name-only origin/main -- js css assets').split('\n').filter(Boolean);
      if(changed.length&&version===live)
        problems.push(`แก้ ${changed.length} ไฟล์ใน js/ css/ assets/ (${changed.slice(0,3).join(', ')}${changed.length>3?' …':''}) `+
          `แต่เวอร์ชันยัง v${version} เท่าเว็บจริง — ต้อง bump ป้ายหัวเว็บ + ?v= + CHANGELOG`);
    }
  }
  if(problems.length){
    console.error('❌ ตรวจเวอร์ชันไม่ผ่าน (tools/check-version.js):\n'+problems.map(p=>'   • '+p).join('\n')+
      `\n   แก้ ?v= ทั้งหมด: sed -i 's/?v=เลขเก่า"/?v=เลขใหม่"/g' index.html`);
    process.exit(1);
  }
  console.log(`✅ เวอร์ชัน v${version} ตรงกันครบ (${count} ไฟล์ js/css/ไอคอน · CHANGELOG)`);
}

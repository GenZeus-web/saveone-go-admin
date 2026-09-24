/* ============================================================
   login-fx.js — UI-3D: ฉากหลังหน้า login ด้วย WebGL shader (ไม่มีไลบรารี)
   1) ฉาก: ไฟตลาดนัดยามค่ำแบบโบเก้ — วาดเต็มจอด้วย fragment shader ตัวเดียว
   2) ความเร็วฉากเป็น "สะสม" (uTime += dt × speed) → เร่ง/ผ่อนได้ลื่น ไม่กระตุก
        loginCharge(true)  = กดปุ่มแล้ว รอเซิร์ฟเวอร์ → ฉากเริ่มเร่ง (ไม่มีจังหวะนิ่งค้าง)
        beginLoginWarp()   = auth ผ่าน → พุ่งทันที ทำคู่ขนานกับการอ่าน Firestore ใน auth.js
        leaveLoginPage()   = auth.js พร้อมแสดง dashboard → รอให้พุ่งจบแล้วซ่อน
   3) การ์ดเอียงตามเมาส์ (ตัวแปร CSS) · ข้ามบนจอสัมผัส / ลดการเคลื่อนไหว
   หยุดวาดทันทีเมื่อหน้า login ถูกซ่อน — ไม่กิน GPU ตอนใช้ dashboard
   ============================================================ */
(function () {
  var WARP_MS = 1500;
  var page = document.getElementById('loginPage');
  var box = document.getElementById('loginBox');
  var canvas = document.getElementById('loginGL');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;

  var st = { charge: 0, chargeTo: 0, warpT0: 0, mx: 0, my: 0, mxTo: 0, myTo: 0 };

  // ── 2) API ให้ auth.js ── (ประกาศก่อน guard: auth.js ต้องเรียกได้เสมอ)
  window.loginCharge = function (on) { st.chargeTo = on ? 1 : 0; };
  window.beginLoginWarp = function () {
    if (st.warpT0 || !page) return;
    st.warpT0 = performance.now();
    page.classList.add('is-entering');        // z-index เหนือ splash ระหว่างพุ่ง
  };
  window.leaveLoginPage = function () {
    var p = document.getElementById('loginPage');
    if (!p) return;
    var zoom = window.__loginZoom === true;   // ตั้งใน doLogin() — เปิดเว็บแล้ว login ค้างอยู่ = ไม่พุ่ง
    window.__loginZoom = false;
    if (!zoom && !st.warpT0) { p.style.display = 'none'; return; }
    window.beginLoginWarp();
    var left = Math.max(0, WARP_MS - (performance.now() - st.warpT0));
    setTimeout(function () {
      p.style.display = 'none';
      p.classList.remove('is-entering');      // คืนสภาพ เผื่อ logout แล้วกลับมาหน้านี้
      st.warpT0 = 0; st.charge = st.chargeTo = 0;
    }, left);
  };

  if (!page || !box) return;

  // ── 3) การ์ดเอียงตามเมาส์ ──
  if (!reduced && !coarse) {
    var MAX_TILT = 6; // องศา — มากกว่านี้ตัวหนังสือเริ่มอ่านยาก
    page.addEventListener('pointermove', function (e) {
      var r = box.getBoundingClientRect();
      var nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2 + 240)));
      var ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2 + 240)));
      box.style.setProperty('--ry', (nx * MAX_TILT).toFixed(2) + 'deg');
      box.style.setProperty('--rx', (-ny * MAX_TILT).toFixed(2) + 'deg');
      box.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      box.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      st.mxTo = e.clientX / innerWidth * 2 - 1;
      st.myTo = 1 - e.clientY / innerHeight * 2;
    });
    page.addEventListener('pointerleave', function () {
      ['--rx', '--ry', '--mx', '--my'].forEach(function (k) { box.style.removeProperty(k); });
      st.mxTo = st.myTo = 0;
    });
  }

  // ── 1) WebGL ──
  if (!canvas) return;
  var gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return;                            // ไม่มี WebGL = เห็น .login-sky (CSS) แทน

  var COMMON = [
    'precision highp float;',
    'uniform vec2 uRes; uniform float uTime, uWarp, uCharge; uniform vec2 uMouse;',
    'float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }',
    'float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }',
    'float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.02+vec2(3.1,1.7); a*=.5; } return v; }',
    'vec3 finish(vec3 c){ c=1.-exp(-c*1.35); c=pow(c,vec3(.9)); return c+(hash(gl_FragCoord.xy+uTime)-.5)/200.; }'
  ].join('\n');

  // ฉาก: ไฟตลาดนัดยามค่ำ มองผ่านเลนส์หลุดโฟกัส (โบเก้)
  //   สายไฟระย้าพาดโค้ง 3 ระยะ ไกล (เล็ก คม) → ใกล้ (ใหญ่ เบลอ) + โบเก้ประปรายเติมพื้นหลัง
  //   ดวงไฟรอบการ์ดหรี่ลง (focus) ให้ฟอร์มเด่น · พุ่ง = ชั้นใกล้ขยายเร็วกว่าชั้นไกล ทะลุเข้าไปในแสง
  var SCENE = [
    // ขอบทรงหกเหลี่ยมจางๆ แบบกลีบรูรับแสงของเลนส์จริง
    'float shape(vec2 d){ vec2 a=abs(d); return mix(length(d),max(a.x*.866+a.y*.5,a.y),.3); }',
    'vec3 bulbCol(float h){ return h>.8?vec3(.3,1.,.6):mix(vec3(1.,.48,.1),vec3(1.,.84,.52),fract(h*7.3)); }',
    // สายไฟหนึ่งเส้น: จุดต่ำสุด y0 ที่กลางจอ โค้งขึ้นตาม sag·x² · sp = ระยะห่างหลอด · r/blur = ขนาด/ความเบลอ
    'vec3 strand(vec2 uv,float y0,float sag,float sp,float r,float blur,float seed,float t,float wire){',
    '  vec3 c=vec3(0.);',
    '  float fi=floor(uv.x/sp+.5);',
    '  for(int k=0;k<3;k++){',
    '    float id=fi+float(k-1);',
    '    float bx=id*sp;',
    '    float h=hash(vec2(id,seed));',
    '    float by=y0+sag*bx*bx+sin(t*.6+bx*2.+seed)*r*.25+(h-.5)*r*.3;',
    '    vec2 d=uv-vec2(bx,by);',
    '    float dd=shape(d);',
    '    float disk=smoothstep(r,r-blur,dd);',
    '    float rim=smoothstep(r-blur*2.2,r,dd)*disk;',
    '    float tw=.72+.28*sin(t*1.1+h*40.);',
    '    float on=step(.07,h);',
    '    vec3 bc=bulbCol(h);',
    '    c+=bc*(disk*.32+rim*.28+exp(-length(d)/(r*1.1))*.07)*tw*on;',
    '  }',
    '  float yc=y0+sag*uv.x*uv.x;',
    '  c+=vec3(1.,.6,.25)*exp(-abs(uv.y-yc)*900.)*wire;',
    '  return c;',
    '}',
    // โบเก้ประปรายเติมพื้นหลัง (ไม่อยู่บนสาย)
    'vec3 scatter(vec2 uv,float sc,float blur,float seed,float t){',
    '  vec2 p=uv*sc; vec2 cell=floor(p); vec2 fc=fract(p)-.5; vec3 c=vec3(0.);',
    '  for(int k=0;k<9;k++){',
    '    vec2 nb=vec2(mod(float(k),3.)-1.,floor(float(k)/3.)-1.);',
    '    vec2 id=cell+nb; float h=hash(id+seed);',
    '    if(h>.62){',
    '      vec2 o=(vec2(hash(id+1.3+seed),hash(id+7.7+seed))-.5)*.8;',
    '      float r=mix(.14,.34,hash(id+3.1+seed));',
    '      float dd=shape(fc-nb-o);',
    '      float disk=smoothstep(r,r-blur,dd);',
    '      float rim=smoothstep(r-blur*2.,r,dd)*disk;',
    '      c+=bulbCol(hash(id+5.+seed))*(disk*.25+rim*.25)*(.7+.3*sin(t*.9+h*40.));',
    '    }',
    '  }',
    '  return c;',
    '}',
    'void main(){',
    '  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;',
    '  float t=uTime;',
    '  float w=uWarp*uWarp;',
    '  vec2 m=uMouse*(1.-uWarp);',
    '  vec2 pan=vec2(sin(t*.05)*.05,cos(t*.04)*.015);',
    // ฟ้ามืดโทนอุ่น + แสงแผงเรืองจากด้านล่าง
    '  vec3 col=mix(vec3(.05,.024,.01),vec3(.008,.006,.01),smoothstep(-.55,.5,uv.y));',
    '  col+=vec3(.28,.13,.03)*exp(-length((uv-vec2(0.,-.55))*vec2(.6,1.))*2.4)*.55;',
    '  vec2 u0=uv/(1.+w*.9)+pan*.3+m*.012;',
    '  vec2 u1=uv/(1.+w*1.8)+pan*.6+m*.035;',
    '  vec2 u2=uv/(1.+w*3.2)+pan+m*.075;',
    '  vec3 b=vec3(0.);',
    '  b+=scatter(u0,10.,.02,1.,t)*.22;',
    '  b+=strand(u0,.20,.32,.052,.011,.006,1.,t,.035)*.95;',
    '  b+=strand(u0,.06,.22,.047,.010,.006,2.,t,.03)*.75;',
    '  b+=strand(u0,-.34,.18,.05,.010,.006,3.,t,.025)*.6;',
    '  b+=strand(u1,.34,.55,.115,.030,.018,4.,t,.0)*1.;',
    '  b+=strand(u1,-.2,.35,.11,.028,.018,5.,t,.0)*.8;',
    '  b+=strand(u2,.50,.95,.27,.085,.06,6.,t,.0)*1.;',
    '  b+=strand(u2,-.52,.45,.3,.09,.065,7.,t,.0)*.9;',
    // หรี่ดวงไฟหลังการ์ด ให้ฟอร์มเด่น (ตอนพุ่งค่อยๆ เลิกหรี่)
    '  float focus=mix(.4,1.,smoothstep(.1,.5,length(uv*vec2(.7,1.))));',
    '  col+=b*mix(focus,1.,uWarp);',
    '  col+=vec3(1.,.78,.45)*(w*1.5+uCharge*.07)*exp(-length(uv)*2.);',
    '  col*=1.-.32*length(uv);',
    '  gl_FragColor=vec4(finish(col),1.);',
    '}'
  ];

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error('login-fx shader:', gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  var vs = compile(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
  var fs = compile(gl.FRAGMENT_SHADER, COMMON + '\n' + SCENE.join('\n'));
  if (!vs || !fs) return;
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // สามเหลี่ยมใหญ่ครอบจอ
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var U = {};
  ['uRes', 'uTime', 'uWarp', 'uCharge', 'uMouse'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });

  // วาดที่ความละเอียดต่ำกว่าจอแล้วขยาย — ฉากนุ่มๆ ดูไม่ต่าง แต่เบากว่า 2–4 เท่า
  var RES = coarse ? 0.5 : 0.75;
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2) * RES;
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }
  window.addEventListener('resize', resize);

  var t = 7.0, last = 0, running = false;   // เริ่มที่ t=7 ให้ฉากไม่ว่างตอนเฟรมแรก
  function draw(now) {
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    st.charge += (st.chargeTo - st.charge) * Math.min(1, dt * 3);
    st.mx += (st.mxTo - st.mx) * Math.min(1, dt * 2.5);
    st.my += (st.myTo - st.my) * Math.min(1, dt * 2.5);
    var warp = st.warpT0 ? Math.min(1, (now - st.warpT0) / WARP_MS) : 0;
    t += dt * (1 + st.charge * 2.5 + warp * warp * 14);   // ความเร็วสะสม = เร่งลื่น
    resize();
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uWarp, warp);
    gl.uniform1f(U.uCharge, st.charge);
    gl.uniform2f(U.uMouse, st.mx, st.my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) {
    if (page.style.display === 'none') { running = false; last = 0; return; }
    if (!document.hidden) draw(now);
    requestAnimationFrame(loop);
  }
  function start() {
    if (running) return;
    if (reduced) { draw(performance.now()); canvas.classList.add('ready'); return; } // ฉากนิ่ง เฟรมเดียว
    running = true;
    requestAnimationFrame(function (now) { draw(now); canvas.classList.add('ready'); requestAnimationFrame(loop); });
  }
  // logout แล้ว auth.js เปิดหน้า login กลับ → วาดต่อ
  new MutationObserver(function () { if (page.style.display !== 'none') start(); })
    .observe(page, { attributes: true, attributeFilter: ['style'] });
  start();
})();

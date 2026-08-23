// МАСТЕР-КОНЦЕПТ «ОДНА ДОЛИНА» — каркас v1
// Прелоадер → гейт → Lenis+ScrollTrigger → Three.js-сцена: камера едет по глубине, свет — навигация, DOM-цвет синхронизирован.
import * as THREE from 'three';

const $ = s => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 820px)').matches;

/* ---------- 0. ПРЕЛОАДЕР: солнце-гравюра разгорается ---------- */
const preSun = $('#preSun'), prePct = $('#prePct');
(function drawSun() {
  const N = 120, cx = 200, cy = 200, frag = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (Math.sin(i * 12.9898) * 0.02);
    const r0 = 26 + Math.sin(i * 3.7) * 4;
    const r1 = 120 + Math.abs(Math.sin(i * 7.3)) * 70 + (i % 7 === 0 ? 30 : 0);
    const w = 0.5 + Math.abs(Math.sin(i * 1.7)) * 0.8;
    frag.push(`<line class="ray" data-i="${i}" x1="${cx + Math.cos(a) * r0}" y1="${cy + Math.sin(a) * r0}" x2="${cx + Math.cos(a) * r1}" y2="${cy + Math.sin(a) * r1}" stroke="currentColor" stroke-width="${w.toFixed(2)}" stroke-linecap="round" opacity="0"/>`);
  }
  preSun.innerHTML = `<circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="currentColor" stroke-width=".8" opacity=".7"/>${frag.join('')}`;
})();
let progress = 0;
function setProgress(p) {
  progress = Math.max(progress, p);
  const rays = preSun.querySelectorAll('.ray'), n = Math.floor(rays.length * progress);
  rays.forEach((r, i) => r.setAttribute('opacity', i < n ? (0.35 + 0.65 * Math.abs(Math.sin(i * 1.3))).toFixed(2) : '0'));
  prePct.textContent = Math.round(progress * 100);
}

/* ---------- 1. ПРЕДЗАГРУЗКА: шрифты + картинки + текстуры ---------- */
const texLoader = new THREE.TextureLoader();
const loadTex = url => new Promise(res => texLoader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null)));
// КРИТИЧЕСКИЙ ПУТЬ = только то, что видно сразу: шрифты + НЕленивые картинки.
// Картинки с loading="lazy" под прелоадером вообще не начинают грузиться (complete:false),
// im.decode() по ним висел до таймаута и держал вход 6.5 с — их не ждём.
const imgs = [...document.images].filter(im => im.loading !== 'lazy' || im.complete);
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
const texP = [loadTex("../assets/img/gen/arhaderesse-c-2560.webp"), loadTex('../assets/img/deg1.jpg'), loadTex('../assets/img/degzal.jpg')];
const critical = [
  withTimeout(document.fonts.ready, 2500),
  ...imgs.map(im => withTimeout(im.decode ? im.decode().catch(() => {}) : Promise.resolve(), 2500)),
];
let done = 0; const total = critical.length;
const tick = () => { done++; setProgress(done / total); };
critical.forEach(t => t.then(tick, tick));
await Promise.all(critical);
setProgress(1);
// Текстуры сцен догружаются фоном и подставляются в материалы по готовности (см. §2).

/* ---------- 2. THREE: сцена-долина, камера по глубине ---------- */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
renderer.setPixelRatio(isMobile ? 1 : Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000);

// Небо — полноэкранная плоскость с шейдером (градиент по «времени суток» t: 0 полдень → 1 ночь)
const skyMat = new THREE.ShaderMaterial({
  depthWrite: false, depthTest: false,
  uniforms: { uT: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uTime: { value: 0 }, uSun: { value: new THREE.Vector2(0.72, 0.78) } },
  vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    precision highp float; uniform float uT, uTime; uniform vec2 uRes, uSun;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
    float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=.5;} return v; }
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      // палитры: полдень (известняк/лазурь) → золотой час → закат бордо → ночь
      vec3 day0 = vec3(0.98,0.96,0.92), day1 = vec3(0.80,0.86,0.92);
      vec3 gold0 = vec3(0.98,0.88,0.70), gold1 = vec3(0.72,0.52,0.36);
      vec3 dusk0 = vec3(0.45,0.16,0.22), dusk1 = vec3(0.12,0.08,0.08);
      vec3 night0 = vec3(0.06,0.05,0.045), night1 = vec3(0.02,0.02,0.02);
      vec3 top, bot;
      if (uT < .33){ float k=uT/.33; top=mix(day1,gold1,k); bot=mix(day0,gold0,k); }
      else if (uT < .66){ float k=(uT-.33)/.33; top=mix(gold1,dusk1,k); bot=mix(gold0,dusk0,k); }
      else { float k=(uT-.66)/.34; top=mix(dusk1,night1,k); bot=mix(dusk0,night0,k); }
      vec3 c = mix(bot, top, pow(uv.y, 0.8));
      // облака/дымка — только днём и в золотой час
      float cl = fbm(vec2(uv.x*3.0 + uTime*0.01, uv.y*6.0)) * smoothstep(0.35,0.9,uv.y) * (1.0 - smoothstep(0.3,0.7,uT));
      c = mix(c, vec3(1.0), cl*0.12);
      // солнечное гало
      float d = distance(uv*vec2(uRes.x/uRes.y,1.0), uSun*vec2(uRes.x/uRes.y,1.0));
      float glow = exp(-d*d*26.0) * (1.0 - smoothstep(0.55,0.8,uT));
      c += vec3(1.0,0.88,0.62) * glow * 0.13;
      // звёзды ночью
      float st = step(0.997, hash(floor(uv*uRes/2.5))) * smoothstep(0.6,0.95,uT) * (0.5+0.5*sin(uTime*2.0+hash(uv)*6.28));
      c += st;
      // виньетка
      c *= 1.0 - 0.35*pow(distance(uv, vec2(.5)), 1.6);
      gl_FragColor = vec4(c, 1.0);
    }`
});
const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat); sky.frustumCulled = false; sky.renderOrder = -10;
scene.add(sky);

// Солнце-гравюра: инстансинг штрихов (Line segments) вокруг точки — вращается, дышит
const RAYS = isMobile ? 600 : 1800;
const rayPos = new Float32Array(RAYS * 6), rayA = new Float32Array(RAYS * 2);
for (let i = 0; i < RAYS; i++) {
  const a = (i / RAYS) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.004;
  const r0 = 0.9 + Math.sin(i * 3.7) * 0.08, r1 = 2.6 + Math.abs(Math.sin(i * 7.3)) * 2.2 + (i % 11 === 0 ? 1.2 : 0);
  rayPos.set([Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0], i * 6);
  const al = 0.25 + Math.abs(Math.sin(i * 1.7)) * 0.75; rayA[i * 2] = al; rayA[i * 2 + 1] = al;
}
const rayGeo = new THREE.BufferGeometry();
rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPos, 3));
rayGeo.setAttribute('aAlpha', new THREE.BufferAttribute(rayA, 1));
const rayMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.NormalBlending,
  uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uMouse: { value: new THREE.Vector2(0, 0) } },
  vertexShader: `attribute float aAlpha; varying float vA; uniform float uTime; uniform vec2 uMouse;
    void main(){ vA = aAlpha; vec3 p = position; float ang = atan(p.y,p.x); float md = dot(normalize(p.xy), normalize(uMouse+vec2(1e-4)));
      // анизотропный блик: штрихи, смотрящие на курсор, ярче; дыхание длины
      float breathe = 1.0 + 0.04*sin(uTime*0.6 + ang*3.0);
      p.xy *= breathe; vA *= 0.55 + 0.45*smoothstep(0.6,1.0,md);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
  fragmentShader: `varying float vA; uniform float uOpacity; void main(){ gl_FragColor = vec4(0.47,0.36,0.17, vA*uOpacity*0.7); }`
});
const sun = new THREE.LineSegments(rayGeo, rayMat); sun.position.set(0, 0, -30); sun.scale.setScalar(1.5); scene.add(sun);

// Долина — панорама на плоскости вдали (материал сцены II), подвал — плоскости (сцены IV–V)
const mkPlane = (p, w, h, z, y, x = 0, tint = 0xffffff) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: null, color: tint, transparent: true, opacity: 0 }));
  m.position.set(x, y, z); m.visible = false; scene.add(m);
  p.then(t => { if (t) { m.material.map = t; m.material.needsUpdate = true; m.visible = true; } });
  return m;
};
const pano = mkPlane(texP[0], 120, 32, -60, -8);
const gate = mkPlane(texP[1], 60, 40, -40, -4);
// «Визит»: зал стоит в правой половине кадра (там пустая колонка .glass) и притушен —
// раньше плоскость 70×46 по центру ложилась поверх текстовой колонки и прятала весь текст.
const hall = mkPlane(texP[2], isMobile ? 60 : 42, isMobile ? 40 : 30, -45, -7, isMobile ? 0 : 21, 0xc9bda6);

// Частицы: пыль в лучах / пыльца над лозой / искры свечей
const PN = isMobile ? 500 : 1400;
const pPos = new Float32Array(PN * 3), pSeed = new Float32Array(PN);
for (let i = 0; i < PN; i++) { pPos.set([(Math.random() - .5) * 80, (Math.random() - .5) * 50, -10 - Math.random() * 40], i * 3); pSeed[i] = Math.random(); }
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('aSeed', new THREE.BufferAttribute(pSeed, 1));
const pMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#d9bd8a') } },
  vertexShader: `attribute float aSeed; uniform float uTime; varying float vS; void main(){ vS=aSeed; vec3 p=position; p.y += sin(uTime*0.3+aSeed*6.28)*1.5; p.x += cos(uTime*0.2+aSeed*9.0)*1.2;
    vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = (0.6+aSeed*1.1) * (140.0/-mv.z); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying float vS; void main(){ float d=distance(gl_PointCoord,vec2(.5)); if(d>.5) discard; float a=smoothstep(.5,.05,d)*uOpacity*(0.4+0.6*vS); gl_FragColor=vec4(uColor,a); }`
});
const dust = new THREE.Points(pGeo, pMat); scene.add(dust);

cam.position.set(0, 0, 10);
const mouse = new THREE.Vector2(0, 0), mouseT = new THREE.Vector2(0, 0);
addEventListener('pointermove', e => { mouseT.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); }, { passive: true });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); skyMat.uniforms.uRes.value.set(innerWidth, innerHeight); });

/* ---------- 3. СЦЕНЫ → состояние (t суток, камера, что видно, цвет DOM) ---------- */
const SCENES = {
  sky:     { t: 0.00, camY: 0,   sunY: 0,    sunOp: 1,   pano: 0,   gate: 0, hall: 0, dust: 0,   bg: '#fbf7f0', fg: '#161210', label: '+400 м · Меганом' },
  valley:  { t: 0.18, camY: -6,  sunY: 6,    sunOp: .55, pano: 1,   gate: 0, hall: 0, dust: .15, bg: '#f6efe2', fg: '#161210', label: '+200 м · долина' },
  vine:    { t: 0.56, camY: -14, sunY: 14,   sunOp: .18, pano: .16, gate: 0, hall: 0, dust: .6,  bg: "#241610", fg: "#fbf7f0", label: "+2 м · у лозы" },
  gate:    { t: 0.62, camY: -20, sunY: 22,   sunOp: .1,  pano: 0,   gate: 1, hall: 0, dust: .3,  bg: '#15100c', fg: '#fbf7f0', label: '0 м · вход в подвал' },
  cellar:  { t: 0.80, camY: -26, sunY: 30,   sunOp: 0,   pano: 0,   gate: 0, hall: 0, dust: .5, bg: '#0d0b09', fg: '#fbf7f0', label: '−20 м · подвал' },
  barrels: { t: 0.86, camY: -30, sunY: 34,   sunOp: 0,   pano: 0,   gate: 0, hall: 0, dust: .7,  bg: '#0b0908', fg: '#fbf7f0', label: '−25 м · выдержка' },
  visit:   { t: 0.30, camY: -8,  sunY: 8,    sunOp: .4,  pano: 0,   gate: 0, hall: 1, dust: .2,  bg: '#f3ead8', fg: '#161210', label: '+5 м · дегустационный зал' },
  night:   { t: 0.96, camY: 0,   sunY: 0,    sunOp: .12, pano: 0,   gate: 0, hall: 0, dust: .4,  bg: '#0a0907', fg: '#fbf7f0', label: '+400 м · ночь над долиной' },
};
const state = { ...SCENES.sky, bgC: new THREE.Color(SCENES.sky.bg), fgC: new THREE.Color(SCENES.sky.fg) };
const root = document.documentElement;
function applyState() {
  skyMat.uniforms.uT.value = state.t;
  sun.position.y = state.sunY - 2; rayMat.uniforms.uOpacity.value = state.sunOp;
  if (pano) pano.material.opacity = state.pano; if (gate) gate.material.opacity = state.gate; if (hall) hall.material.opacity = state.hall;
  pMat.uniforms.uOpacity.value = state.dust;
  cam.position.y += (state.camY - cam.position.y) * 0.08;
  root.style.setProperty('--bg', '#' + state.bgC.getHexString());
  root.style.setProperty('--fg', '#' + state.fgC.getHexString());
  // --fg-dim тоже ведём по глубине: иначе шапка/меню-строка/подвал страницы остаются тёмными на тёмных сценах
  const r8 = Math.round(state.fgC.r * 255), g8 = Math.round(state.fgC.g * 255), b8 = Math.round(state.fgC.b * 255);
  root.style.setProperty('--fg-dim', `rgba(${r8},${g8},${b8},.62)`);
}

/* высота шапки → --hdr-h: под ней стоит строка-меню на мобиле */
const hdrEl = $('#hdr');
const setHdrH = () => root.style.setProperty('--hdr-h', Math.round(hdrEl.getBoundingClientRect().height) + 'px');
setHdrH(); addEventListener('resize', setHdrH);
if (document.fonts) document.fonts.ready.then(setHdrH);

/* ---------- 4. СКРОЛЛ: Lenis + ScrollTrigger ---------- */
const lenis = reduce ? null : new Lenis({ lerp: 0.09, smoothWheel: true });
gsap.registerPlugin(ScrollTrigger);
if (lenis) { lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }

const secs = [...document.querySelectorAll('.sc[data-scene]')];
const depthThumb = $('#depthThumb'), depthNow = $('#depthNow');
secs.forEach((sec, i) => {
  const key = sec.dataset.scene, to = SCENES[key];
  const prevKey = i > 0 ? secs[i - 1].dataset.scene : key, from = SCENES[prevKey];
  ScrollTrigger.create({
    trigger: sec, start: 'top 80%', end: 'top 20%', scrub: reduce ? false : 0.6,
    onUpdate: self => {
      const p = self.progress;
      ['t','sunY','sunOp','pano','gate','hall','dust'].forEach(k => { state[k] = from[k] + (to[k] - from[k]) * p; });
      state.camY = from.camY + (to.camY - from.camY) * p;
      state.bgC.copy(new THREE.Color(from.bg)).lerp(new THREE.Color(to.bg), p);
      state.fgC.copy(new THREE.Color(from.fg)).lerp(new THREE.Color(to.fg), p);
      if (p > 0.5) depthNow.textContent = to.label;
    },
  });
});
// шкала глубины по общему прогрессу
ScrollTrigger.create({ trigger: document.body, start: 'top top', end: 'bottom bottom', onUpdate: s => { depthThumb.style.top = (s.progress * 100) + '%'; } });

// Сорта: 4 остановки внутри sticky-секции
const grapes = [...document.querySelectorAll('.grape')], gnav = [...document.querySelectorAll('.grapes__nav b')];
const setGrape = i => { grapes.forEach((g, k) => g.classList.toggle('is-on', k === i)); gnav.forEach((b, k) => b.classList.toggle('is-on', k === i)); };
ScrollTrigger.create({ trigger: '#vine', start: 'top top', end: 'bottom bottom', onUpdate: s => setGrape(Math.min(3, Math.floor(s.progress * 4))) });
gnav.forEach(b => b.addEventListener('click', () => { const i = +b.dataset.i; const vine = $('#vine'); const y = vine.offsetTop + (vine.offsetHeight - innerHeight) * ((i + 0.5) / 4); lenis ? lenis.scrollTo(y) : scrollTo(0, y); }));
setGrape(0);

/* якоря: доводим с учётом залипшей шапки (+ строки-меню на мобиле), иначе заголовок раздела уезжает под неё */
const mnavEl = $('#mnav');
const chromeH = () => hdrEl.offsetHeight + (mnavEl && getComputedStyle(mnavEl).display !== 'none' ? mnavEl.offsetHeight : 0) + 10;
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    const y = el.getBoundingClientRect().top + scrollY - chromeH();
    lenis ? lenis.scrollTo(y) : scrollTo({ top: y, behavior: 'smooth' });
  });
});
/* вход по прямой ссылке index.html#visit: браузер прыгает сам, без учёта шапки — доводим */
function landHash() {
  const id = location.hash;
  if (id.length < 2) return;
  const el = document.querySelector(id);
  if (!el) return;
  const y = el.getBoundingClientRect().top + scrollY - chromeH();
  lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y);
}
addEventListener('hashchange', landHash);

/* sticky-CTA прячем в разделе «Визит»: там уже стоит настоящая кнопка и телефон */
const mctaEl = $('#mcta');
ScrollTrigger.create({ trigger: '#visit', start: 'top 75%', end: 'bottom 25%', onToggle: s => mctaEl.classList.toggle('off', s.isActive) });

// Текст героя — по строкам из-под маски
gsap.from('.h-hero .ln', { yPercent: 110, duration: 1.4, stagger: 0.12, ease: 'expo.out', delay: 0.2, paused: true, id: 'heroIn' });

/* ---------- 5. ЦИКЛ ---------- */
let last = performance.now(), frames = 0, fpsLow = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const t = now * 0.001;
  skyMat.uniforms.uTime.value = t; rayMat.uniforms.uTime.value = t; pMat.uniforms.uTime.value = t;
  mouse.lerp(mouseT, 0.06); rayMat.uniforms.uMouse.value.copy(mouse);
  sun.rotation.z = t * 0.015;
  cam.position.x += (mouse.x * 1.2 - cam.position.x) * 0.04;
  cam.lookAt(0, cam.position.y, -30);
  applyState();
  renderer.render(scene, cam);
  // адаптивное качество
  frames++; if (now - last > 2000) { const fps = frames * 1000 / (now - last); frames = 0; last = now; if (fps < 40 && ++fpsLow >= 2) { renderer.setPixelRatio(1); } }
}

/* ---------- 6. ПРЕЛОАДЕР → ГЕЙТ → СТАРТ ---------- */
const pre = $('#pre'), gateEl = $('#gate');
let aged = false; try { aged = (function(){var K=['sv_age_ok','sv-age','sv_age','sv-age-ok'];for(var i=0;i<K.length;i++){try{if(localStorage.getItem(K[i])==='1'||sessionStorage.getItem(K[i])==='1')return true;}catch(e){}}return false;})(); } catch {}
await new Promise(r => setTimeout(r, 350));
pre.classList.add('off');
if (aged) gateEl.classList.add('off');
const enter = () => { gateEl.classList.add('off'); try { (function(){var K=['sv_age_ok','sv-age','sv_age','sv-age-ok'];for(var i=0;i<K.length;i++){try{localStorage.setItem(K[i],'1');sessionStorage.setItem(K[i],'1');}catch(e){}}})(); } catch {} gsap.getById('heroIn')?.play(); requestAnimationFrame(landHash); };
$('#gateYes').addEventListener('click', enter);
/* «Нет» — не выбрасываем гостя на сторонний сайт: остаёмся на месте и прощаемся */
$('#gateNo')?.addEventListener('click', () => {
  gateEl.classList.add('is-no');
  gateEl.querySelector('.gate__q').textContent = 'Тогда — до встречи через несколько лет.';
  gateEl.querySelector('.gate__law').textContent = 'Вина «Солнечной Долины» — только для совершеннолетних. Чрезмерное употребление алкоголя вредит вашему здоровью.';
});
if (aged) { gsap.getById('heroIn')?.play(); requestAnimationFrame(landHash); }
requestAnimationFrame(loop);

/* ---------- 7. ЗВУК (генеративный, по клику) ---------- */
const sndBtn = $('#snd'); let ac = null, master = null;
sndBtn.addEventListener('click', async () => {
  const on = sndBtn.getAttribute('aria-pressed') !== 'true';
  sndBtn.setAttribute('aria-pressed', String(on));
  if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    // ветер: розовый шум через lowpass с медленной модуляцией
    const buf = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate), d = buf.getChannelData(0); let b0=0,b1=0,b2=0; for (let i=0;i<d.length;i++){ const w=Math.random()*2-1; b0=0.99765*b0+w*0.099; b1=0.963*b1+w*0.2965; b2=0.57*b2+w*1.0526; d[i]=(b0+b1+b2+w*0.1848)*0.08; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; const lp = ac.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 420; const lfo = ac.createOscillator(); lfo.frequency.value = 0.07; const lg = ac.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); src.connect(lp); lp.connect(master); src.start();
    // капли: редкие синусы
    const drop = () => { if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 1400 + Math.random()*900; g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.06, ac.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+0.6); o.connect(g); g.connect(master); o.start(); o.stop(ac.currentTime+0.7); setTimeout(drop, 2500 + Math.random()*6000); }; setTimeout(drop, 1500);
  }
  if (ac.state === 'suspended') await ac.resume();
  master.gain.linearRampToValueAtTime(on ? 0.9 : 0, ac.currentTime + 1.2);
});

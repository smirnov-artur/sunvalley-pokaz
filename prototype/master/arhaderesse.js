// Архадерессе — оживлённая гравюра на раздельных слоях.
// Постановка по геометрии фона (bg-empty, cover, центр 45%): дорога идёт из левого-нижнего угла по диагонали
// вглубь к воротам подвала под стеной (≈ x 76%, y 78%); виноградники — слева и в центре нижней трети, ряды уходят к горизонту.
// Телега (вид сзади) едет ПО ДОРОГЕ вглубь с уменьшением; виноградари — В МЕЖДУРЯДЬЯХ, каждый в своём ряду.
// Все объекты — только transform (left/top:0), якорь — нижний центр.
(async () => {
  const $ = s => document.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = '../assets/img/gen/layers/';
  const urls = ['bg-empty-2560.webp', 'obj-cart-back.webp', 'obj-worker1.webp', 'obj-worker2.webp', 'obj-worker3.webp', 'obj-worker4.webp', 'swallow-1.webp', 'swallow-2.webp', 'swallow-3.webp'].map(n => L + n);
  const bar = $('#preBar'); let done = 0;
  const wt = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  await Promise.all([wt(document.fonts.ready, 6000), ...urls.map(u => wt(new Promise(r => { const im = new Image(); im.onload = im.onerror = () => { done++; bar.style.width = (done / urls.length * 100) + '%'; r(); }; im.src = u; }), 10000))]);
  $('#pre').classList.add('off');

  let mx = .5, my = .5, tmx = .5, tmy = .5;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth; tmy = e.clientY / innerHeight; }, { passive: true });
  let prog = location.search.includes("edit") ? .3 : 0, night = 0;

  // ---- лучи из-за крыши усадьбы ----
  const rc = $('#rays'), ctx = rc.getContext('2d'); let W, H; const RAYS = 420, rays = []; let rf = 0;
  for (let i = 0; i < RAYS; i++) rays.push({ a: (i / RAYS) * Math.PI * 2, l: .3 + Math.abs(Math.sin(i * 7.3)) * .55 + (i % 13 === 0 ? .25 : 0), w: .35 + Math.abs(Math.sin(i * 1.7)) * .8, o: .12 + Math.abs(Math.sin(i * 2.9)) * .4 });
  const fit = () => { const d = Math.min(devicePixelRatio, 1.5); W = rc.width = innerWidth * d; H = rc.height = innerHeight * d; }; fit(); addEventListener('resize', fit);
  function drawRays(t) {
    if ((rf++ & 1) && Math.abs(tmx - mx) < .002 && Math.abs(tmy - my) < .002 && rf > 30) return;
    ctx.clearRect(0, 0, W, H);
    const cx = W * .72, cy = H * .24, R = Math.max(W, H) * 1.1;
    const ma = Math.atan2(my * H - cy, mx * W - cx); const rot = t * .00003, dim = 1 - night * .8;
    ctx.lineCap = 'round';
    for (const r of rays) {
      const a = r.a + rot; const md = Math.cos(a - ma); const hi = .55 + .45 * Math.max(0, md) ** 3; const br = 1 + .03 * Math.sin(t * .0006 + a * 3);
      ctx.strokeStyle = `rgba(240,200,110,${(r.o * hi * dim).toFixed(3)})`; ctx.lineWidth = r.w * (W / 1600);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * .05, cy + Math.sin(a) * R * .05); ctx.lineTo(cx + Math.cos(a) * R * r.l * br, cy + Math.sin(a) * R * r.l * br); ctx.stroke();
    }
  }

  // ---- окна усадьбы ----
  const WINS = [[60.2, 37.5], [63.6, 37.8], [67.2, 38.2], [73.4, 30.5], [77.4, 33], [81.2, 35.5], [60.4, 44.5], [67.6, 44.8], [73.6, 44.6], [79.8, 45.2], [85.6, 45.4], [66.5, 51.2], [80.4, 51.6]];
  const winsBox = $('#wins');
  const winEls = WINS.map(([x, y]) => { const d = document.createElement('i'); d.className = 'win'; d.style.left = x + '%'; d.style.top = y + '%'; winsBox.appendChild(d); return d; });
  function drawWins(t) { winEls.forEach((w, i) => { w.style.opacity = (.25 + .6 * night + .12 * Math.sin(t * .004 + i * 1.7)).toFixed(2); }); }

  // ---- ласточки: над долиной слева ----
  const birdsBox = $('#birds'); const birds = [];
  const phases = [L + 'swallow-1.webp', L + 'swallow-2.webp', L + 'swallow-3.webp'];
  for (let i = 0; i < 6; i++) {
    const d = document.createElement('div'); d.className = 'bird'; const im = document.createElement('img'); im.alt = ''; im.src = phases[i % 3]; d.appendChild(im); birdsBox.appendChild(d);
    birds.push({ el: d, im, t: Math.random(), sp: .00003 + Math.random() * .00003, y0: 6 + Math.random() * 22, amp: 3 + Math.random() * 6, ph: Math.random() * 6, s: .55 + Math.random() * .7, flapPh: Math.random() * 6, dir: Math.random() < .5 ? 1 : -1, f: -1 });
  }
  function drawBirds(t) {
    for (const b of birds) {
      b.t = (b.t + b.sp * 16) % 1;
      const x = b.dir > 0 ? -8 + b.t * 70 : 62 - b.t * 70;
      const y = b.y0 + Math.sin(b.t * 7 + b.ph) * b.amp;
      const f = Math.floor(((Math.sin(t * .009 + b.flapPh) + 1) / 2) * 2.999);
      if (b.f !== f) { b.im.src = phases[f]; b.f = f; }
      b.el.style.transform = `translate3d(${x}vw, ${y}vh, 0) scale(${b.s}) ${b.dir < 0 ? 'scaleX(-1)' : ''}`;
      b.el.style.opacity = (1 - night * .9).toFixed(2);
    }
  }

  // ---- ТЕЛЕГА по дороге вглубь ----
  // ПОСТАНОВКА ПОЛЬЗОВАТЕЛЯ (horse.json): телега едет из правого низа вглубь к воротам
  const ROAD = [[85.9, 97.4], [37.7, 72.3], [41.3, 68.4]];
  const lerpPath = (pts, k) => { const n = pts.length - 1; const i = Math.min(n - 1, Math.floor(k * n)); const f = k * n - i; const a = pts[i], b = pts[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  const cart = $('#cart'); const wks = [...document.querySelectorAll('.wk')]; const bg = $('#bg');
  // ---- ВИНОГРАДАРИ в междурядьях (ряды идут из левого-нижнего к центру-горизонту) ----
  // ПОСТАНОВКА ПОЛЬЗОВАТЕЛЯ (1human..4human.json): каждый виноградарь ходит по своему междурядью
  const ROWS = [
    { x0: 14.8, y0: 84.2, x1: 20.9, y1: 97.7 },
    { x0: 20.8, y0: 83.2, x1: 31.1, y1: 97.1 },
    { x0: 23.3, y0: 78.0, x1: 44.7, y1: 98.5 },
    { x0: 61.3, y0: 98.8, x1: 38.6, y1: 85.3 },
  ];
  function drawObjs(t) {
    const px = mx - .5, py = my - .5;
    const kc = (t * .000028) % 1;
    const [cx, cy] = lerpPath(ROAD, kc);
    const sc = 1.3 - kc * .9;
    const bob = Math.sin(t * .007) * .4;
    cart.style.opacity = kc > .94 ? String((1 - kc) / .06) : (kc < .04 ? String(kc / .04) : '1');
    cart.style.transform = `translate3d(${cx}vw, ${cy}vh, 0) translate(-50%,-100%) scale(${sc}) translate(${-px * 8}px, ${-py * 5 + bob}px)`;
    wks.forEach((w, i) => {
      const r = ROWS[i % ROWS.length];
      const ph = t * .00004 + i * 1.7;
      const k = (Math.sin(ph) + 1) / 2;
      const x = r.x0 + (r.x1 - r.x0) * k, y = r.y0 + (r.y1 - r.y0) * k;
      const sc2 = .7 + (y - 76) / 24 * .7;   // масштаб по глубине: ближе к низу кадра — крупнее
      const step = Math.abs(Math.sin(t * .005 + i)) * 1.4;
      const dir = Math.cos(ph) >= 0 ? 1 : -1;
      w.style.transform = `translate3d(${x}vw, ${y}vh, 0) translate(-50%,-100%) scale(${sc2}) scaleX(${dir}) translate(${-px * 10}px, ${-py * 6 - step}px)`;
    });
    bg.style.transform = `translate3d(${-px * 22}px, ${-py * 14 - prog * 40}px, 0) scale(1.02)`;
    const hintA = document.querySelector(".hint");
    if (hintA) hintA.style.opacity = String(Math.max(0, .9 - prog * 3));
  }
  const nightEl = $('#night');
  function tone() { nightEl.style.opacity = (night * .78).toFixed(3); }

  gsap.registerPlugin(ScrollTrigger);
  const lenis = reduce ? null : new Lenis({ lerp: .09 });
  if (lenis) { lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
  const thumb = $('#scThumb');
  ScrollTrigger.create({ trigger: '#dio', start: 'top top', end: 'bottom bottom', scrub: true, onUpdate: s => { prog = s.progress; night = Math.min(1, Math.max(0, (prog - .3) / .55)); thumb.style.top = (prog * 100) + '%'; } });

  function loop(t) { requestAnimationFrame(loop); if (window.__STAGE_EDIT__ && window.__STAGE_FIRST__) return; window.__STAGE_FIRST__ = true; mx += (tmx - mx) * .05; my += (tmy - my) * .05; if (reduce) { drawRays(0); return; } drawRays(t); drawWins(t); drawBirds(t); drawObjs(t); tone(); }
  requestAnimationFrame(loop);

  // ---- звук вечера ----
  // Тумблер один на два звука: на нём же висит голос хранителя (world-story.js).
  // Пока идёт речь, амбиент приглушается до .25 и возвращается к .8 в паузах
  // между абзацами — наряд 12, §7.5 п.17. Два ровных звука сразу — каша.
  const sndBtn = $('#snd'); let ac, master, sndOn = false, ducked = false, rel = 0;
  const AMB_FULL = .8, AMB_DUCK = .25;
  const amb = () => (sndOn ? (ducked ? AMB_DUCK : AMB_FULL) : 0);
  const applyAmb = (sec = .45) => { if (master && ac) master.gain.linearRampToValueAtTime(amb(), ac.currentTime + sec); };
  // ЗАМЕР по .json озвучки: пауза между предложениями 0,65 с, между абзацами 0,95 с.
  // Разница 0,3 с — если гнать усиление туда-обратно на каждой точке, амбиент
  // начнёт «дышать» в такт речи. Поэтому: приглушаем сразу (0,3 с), а отпускаем
  // только после 2,2 с непрерывной тишины и медленно (1,6 с).
  document.addEventListener('story:speak', e => {
    const sp = !!(e.detail && e.detail.speaking);
    clearTimeout(rel);
    if (sp) { if (!ducked) { ducked = true; applyAmb(.3); } }
    else rel = setTimeout(() => { ducked = false; applyAmb(1.6); }, 2200);
  });
  sndBtn.addEventListener('click', async () => {
    // состояние держим своё, а не читаем с кнопки: на этом же клике аттрибут
    // уже переставил world-story.js, и чтение дало бы инверсию
    const on = !sndOn; sndOn = on; sndBtn.setAttribute('aria-pressed', String(on));
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
      const buf = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate), d = buf.getChannelData(0); let b0 = 0, b1 = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = .997 * b0 + w * .03; b1 = .96 * b1 + w * .1; d[i] = (b0 + b1) * .4; }
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; src.connect(lp); lp.connect(master); src.start();
      const cb = ac.createBufferSource(); cb.buffer = buf; cb.loop = true; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 8; const cg = ac.createGain(); cg.gain.value = .12;
      const lfo = ac.createOscillator(); lfo.frequency.value = 9; const lg = ac.createGain(); lg.gain.value = .1; lfo.connect(lg); lg.connect(cg.gain); lfo.start(); cb.connect(bp); bp.connect(cg); cg.connect(master); cb.start();
    }
    if (ac.state === 'suspended') await ac.resume();
    applyAmb(1.2);
  });
})();

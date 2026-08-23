// Чёрный Доктор — легенда. Постановка по геометрии фона chd-bg (cover, центр 55%):
// большая арка слева (x 8–48%, y 8–62%) — в неё ворота; площадка над ступенями (y≈60–64%);
// ступени вниз (y 64–88%); тёмный проём справа (x 78–98%) — оттуда выходит доктор и спускается по ступеням влево-вниз;
// бочки — на площадке правее арки (x≈52–70%), солдат — у бочек. Все объекты — только transform (left/top:0).
(async () => {
  const $ = s => document.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = '../assets/img/gen/layers/';
  const urls = ['chd-bg-2560.webp', 'chd-gate.webp', 'chd-barrels.webp', 'chd-soldier.webp', 'chd-ribbons.webp', 'chd-doctor.webp'].map(n => L + n);
  const bar = $('#preBar'); let done = 0;
  const wt = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  await Promise.all([wt(document.fonts.ready, 6000), ...urls.map(u => wt(new Promise(r => { const im = new Image(); im.onload = im.onerror = () => { done++; bar.style.width = (done / urls.length * 100) + '%'; r(); }; im.src = u; }), 10000))]);
  $('#pre').classList.add('off');

  let mx = .5, my = .5, tmx = .5, tmy = .5;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth; tmy = e.clientY / innerHeight; }, { passive: true });
  let prog = location.search.includes("edit") ? .5 : 0;

  const bg = $('#bg'), gate = $('#gate'), barrels = $('#barrels'), soldier = $('#soldier'), ribbons = $('#ribbons'), doctor = $('#doctor'), light = $('#light');
  // якорь объектов — нижний центр (translate(-50%,-100%)); координаты — vw/vh
  const GATE = { x: 28, y: 62, w: 34 };     // ворота стоят на полу площадки, вписаны в арку
  // ПОСТАНОВКА ПОЛЬЗОВАТЕЛЯ (roadfordoctor.json, 1280×665): бочки и солдат — внизу справа на полу
  const BARRELS = { x: 85.2, y: 92.9, w: 16 };
  const BARRELS2 = { x: 96, y: 86, w: 15 };   // у стены справа, дальше
  const BARRELS3 = { x: 93, y: 101, w: 19 };  // крупно у переднего края справа
  const BARRELS4 = { x: 84, y: 80, w: 11 };   // дальняя группа у площадки
  const barrels4 = $("#barrels4");
  const barrels2 = $("#barrels2"), barrels3 = $("#barrels3");
  const SOLDIER = { x: 75.2, y: 94.3, w: 15 };
  // АДАПТИВ: на мобиле фон (cover) обрезан по ширине, поэтому объекты в vw надо укрупнить.
  // Множитель применяется ТОЛЬКО к ширинам — координаты постановки (GATE/BARRELS/SOLDIER/DOC) не трогаем.
  const MOB = innerWidth <= 900, MS = MOB ? 1.9 : 1, MSD = MOB ? 1.75 : 1;
  const DOCW = 9 * MSD, BOTW = 5 * (MOB ? 2.6 : 1), LIGHTW = 22 * MSD;
  // подъём и рост бутылки: на мобиле короче и скромнее — иначе она уходит под верхнюю текстовую шапку и за края экрана
  const BRISE = MOB ? 20 : 34, BSC = MOB ? 1.9 : 2.4;
  doctor.style.width = DOCW + "vw";
  light.style.width = light.style.height = LIGHTW + "vw";
  barrels4.style.width = BARRELS4.w * MS + "vw";
  barrels2.style.width = BARRELS2.w * MS + "vw"; barrels3.style.width = BARRELS3.w * MS + "vw";
  // маршрут доктора: из тёмного проёма (92, 62) → по площадке влево (70, 63) → вниз по ступеням (54, 88)
  // маршрут доктора (15 точек пользователя): от ворот слева вниз по ступеням к солдату справа
  const DOC = [[30.3,68.7],[33,73.1],[34.2,75.9],[36.2,78.6],[37.3,81.4],[39.2,84.7],[41.6,86.5],[43.8,88.1],[47.3,88.6],[51.3,89.8],[54.1,91.1],[58.8,91.3],[60.9,91.4],[64.4,92.2],[66.4,92.2]];
  const lerpPath = (pts, k) => { const n = pts.length - 1; const i = Math.min(n - 1, Math.floor(k * n)); const f = k * n - i; const a = pts[i], b = pts[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  gate.style.width = GATE.w * MS + 'vw'; barrels.style.width = BARRELS.w * MS + 'vw'; soldier.style.width = SOLDIER.w * MS + 'vw';

  const bottle = $("#bottle"), specBottle = document.getElementById("specBottle");
  bottle.style.width = BOTW + "vw";
  function frame(t) {
    requestAnimationFrame(frame);
    if (window.__STAGE_EDIT__ && window.__STAGE_FIRST__) return; window.__STAGE_FIRST__ = true;
    mx += (tmx - mx) * .05; my += (tmy - my) * .05;
    if (reduce) return;
    const px = mx - .5, py = my - .5;
    bg.style.transform = `translate3d(${-px * 14}px, ${-py * 8 - prog * 26}px, 0) scale(1.02)`;
    gate.style.transform = `translate3d(${GATE.x}vw, ${GATE.y}vh, 0) translate(-50%,-100%) translate(${-px * 8}px, ${-py * 5}px)`;
    barrels.style.transform = `translate3d(${BARRELS.x}vw, ${BARRELS.y}vh, 0) translate(-50%,-100%) translate(${-px * 12}px, ${-py * 7}px)`;
    barrels2.style.transform = `translate3d(${BARRELS2.x}vw, ${BARRELS2.y}vh, 0) translate(-50%,-100%) scaleX(-1) translate(${-px * 10}px, ${-py * 6}px)`;
    barrels3.style.transform = `translate3d(${BARRELS3.x}vw, ${BARRELS3.y}vh, 0) translate(-50%,-100%) translate(${-px * 14}px, ${-py * 8}px)`;
    barrels4.style.transform = `translate3d(${BARRELS4.x}vw, ${BARRELS4.y}vh, 0) translate(-50%,-100%) scaleX(-1) translate(${-px * 9}px, ${-py * 5}px)`;
    // солдат: дышит (грудь), голова чуть поворачивается к свету фонаря при приближении доктора
    const breath = 1 + Math.sin(t * .0016) * .008;
    soldier.style.transform = `translate3d(${SOLDIER.x}vw, ${SOLDIER.y}vh, 0) translate(-50%,-100%) scale(1, ${breath}) translate(${-px * 14}px, ${-py * 8}px)`;
    const hint = document.querySelector(".hint");
    if (hint) hint.style.opacity = String(Math.max(0, .9 - prog * 3));
    // ленты: текут по ступеням — дрейф вниз по скроллу, волна
    const rw = 1 + Math.sin(t * .0007) * .012;
    ribbons.style.transform = `translate3d(${Math.sin(t * .0004) * 1.2 - px * 8}px, ${prog * 6 - py * 5}vh, 0) scale(${rw})`;   // ленты опущены по постановке пользователя
    // доктор: появляется из проёма на первых 12% скролла, идёт по площадке, спускается по ступеням
    const k = Math.min(1, Math.max(0, prog / .78));   // доктор доходит до солдата к 78% скролла, дальше — бутылка
    const [dx, dy] = lerpPath(DOC, k);
    const sc = .78 + k * .55;                                  // приближается — крупнее
    const step = Math.abs(Math.sin(t * .004)) * 1.0;
    const swing = Math.sin(t * .0028) * 2.2;
    doctor.style.opacity = "1";
    doctor.style.transform = `translate3d(${dx}vw, ${dy}vh, 0) translate(-50%,-100%) scale(${sc}) rotate(${swing * .25}deg) translate(${-px * 10}px, ${-py * 6 - step}px)`;
    // свет фонаря — в правой руке доктора (фонарь справа от фигуры на уровне пояса)
    const flick = .92 + Math.sin(t * .021) * .05 + Math.sin(t * .037) * .03;
    // фонарь измерен на слое доктора: (68.6%, 35.7%) от его bbox; ширина DOCW*sc, высота DOCW*1028/534 *sc; якорь — нижний центр
    const lantX = dx + (0.686 - 0.5) * DOCW * sc;                        // vw
    const lantY = dy - (1 - 0.451) * DOCW * (1028 / 534) * sc * (innerWidth / innerHeight);   // vh; 0.451 — калибровка по замеру (свет ровно в фонаре)
    light.style.transform = `translate(-50%,-50%) translate3d(${lantX}vw, ${lantY}vh, 0) scale(${flick * (.35 + sc * .25)})`;
    light.style.opacity = doctor.style.opacity;
    // бутылка: в конце спуска доктор ставит её — она вырастает и «уходит» в карточку вина ниже
    const kb = Math.min(1, Math.max(0, (prog - .8) / .18));
    if (kb > 0) {
      // бутылка поднимается из руки доктора к центру экрана, растёт и растворяется — а в карточке ниже проявляется настоящая
      bottle.style.opacity = String(kb < .7 ? Math.min(1, kb * 4) : Math.max(0, 1 - (kb - .7) / .3));
      const bxp = dx + (50 - dx) * kb, byp = dy - 2 - kb * 34;
      const bs = .6 + kb * 2.4;
      bottle.style.transform = `translate3d(${bxp}vw, ${byp}vh, 0) translate(-50%,-100%) scale(${bs})`;
      if (specBottle) specBottle.style.opacity = kb > .85 ? "1" : "0";
    } else { bottle.style.opacity = "0"; if (specBottle) specBottle.style.opacity = "0"; }
  }
  requestAnimationFrame(frame);

  gsap.registerPlugin(ScrollTrigger);
  const lenis = reduce ? null : new Lenis({ lerp: .09 });
  if (lenis) { lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
  ScrollTrigger.create({ trigger: '#dio', start: 'top top', end: 'bottom bottom', scrub: true, onUpdate: s => { prog = s.progress; } });
})();

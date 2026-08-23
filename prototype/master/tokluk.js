// Токлук — зверь ведёт процессию. Постановка по геометрии фона: дорога идёт из правого верха (из-за гор, ≈ x 88%, y 38%)
// вниз-влево к переднему плану (≈ x 38%, y 78%). Процессия спускается СПРАВА НАЛЕВО по дороге, зверь впереди (ниже-левее),
// все фигуры отзеркалены лицом по ходу (исходники смотрят вправо → scaleX(-1)). Объекты — только transform (left/top:0).
(async () => {
  const $ = s => document.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = '../assets/img/gen/layers/';
  const urls = ['tok-bg-2560.webp', 'tok-beast.webp', 'tok-fig1.webp', 'tok-fig2.webp', 'tok-fig3.webp', 'tok-fig4.webp', 'tok-fig5.webp', 'tok-fig6.webp'].map(n => L + n);
  const bar = $('#preBar'); let done = 0;
  const wt = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  await Promise.all([wt(document.fonts.ready, 6000), ...urls.map(u => wt(new Promise(r => { const im = new Image(); im.onload = im.onerror = () => { done++; bar.style.width = (done / urls.length * 100) + '%'; r(); }; im.src = u; }), 10000))]);
  $('#pre').classList.add('off');

  let mx = .5, my = .5, tmx = .5, tmy = .5;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth; tmy = e.clientY / innerHeight; }, { passive: true });
  let prog = location.search.includes("edit") ? .5 : 0;

  const bg = $('#bg'), sun = $('#sun'), beast = $('#beast');
  const figs = [...document.querySelectorAll('.fig')];
  // дорога (vw, vh): от дальнего правого верха к ближнему левому низу; k=0 — далеко, k=1 — близко
  // ПОСТАНОВКА ПОЛЬЗОВАТЕЛЯ (forallteamroad.json): дорога справа-сверху → вниз → влево; 12 точек
  const ROAD = [[98.1, 54], [95.2, 58.6], [88.8, 68.1], [83.5, 72.8], [77, 77.6], [71.2, 80.2], [64, 80.6], [57.8, 82.1], [42.2, 76.4], [38.1, 71.1], [32.3, 65.4], [26.9, 62.4]];
  const lerpPath = (pts, k) => { const n = pts.length - 1; const i = Math.min(n - 1, Math.floor(k * n)); const f = k * n - i; const a = pts[i], b = pts[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  // масштаб по глубине: дорога проходит через низ кадра (ближе) и уходит влево-вверх (дальше) — масштаб по y
  const scaleAt = k => { const y = lerpPath(ROAD, k)[1]; return .55 + Math.max(0, (y - 54)) / 28 * .75; };
  // АДАПТИВ (координаты ROAD не трогаем): на десктопе текстовое поле стоит СЛЕВА, поэтому зверь тормозит на k=.82,
  // чтобы не заехать под него. На мобиле текст уходит НАВЕРХ — левый край свободен, зверь доходит до конца дороги
  // и процессия не сбивается в кучу. Текст на мобиле гаснет раньше — чтобы не висеть над процессией.
  const MOB = innerWidth <= 900, KB_MAX = MOB ? .93 : .82, TXT_FADE = MOB ? .3 : .45;
  function frame(t) {
    requestAnimationFrame(frame);
    if (window.__STAGE_EDIT__ && window.__STAGE_FIRST__) return; window.__STAGE_FIRST__ = true;
    mx += (tmx - mx) * .05; my += (tmy - my) * .05;
    if (reduce) return;
    const px = mx - .5, py = my - .5;
    bg.style.transform = `translate3d(${-px * 18}px, ${-py * 10 - prog * 30}px, 0) scale(1.02)`;
    sun.style.transform = `rotate(${t * .004}deg) translate(${-px * 8}px, ${-py * 6}px)`;
    // зверь впереди: его k больше (он ближе к зрителю), идёт первым
    const kB = Math.min(KB_MAX, prog * .9 + .22);   // зверь не заходит под текстовое поле (десктоп: слева)
    const [bx, by] = lerpPath(ROAD, kB);
    const step = Math.abs(Math.sin(t * .0045)) * 1.2;
    beast.style.transform = `translate3d(${bx}vw, ${by}vh, 0) translate(-50%,-100%) scale(${scaleAt(kB) * .85}) scaleX(-1) rotate(${Math.sin(t * .0045) * 1.2}deg) translate(0, ${-step}px) translate(${-px * 12}px, ${-py * 8}px)`;
    // текст представил сцену — и уходит, когда процессия в центре
    const txt = document.querySelector(".txt"), hint = document.querySelector(".hint");
    if (txt) txt.style.opacity = String(Math.max(0, 1 - Math.max(0, (prog - TXT_FADE) / .2)));
    if (hint) hint.style.opacity = String(Math.max(0, .9 - prog * 3));
    figs.forEach((f, i) => {
      const k = Math.min(1, Math.max(0, prog * .9 + .22 - (i + 1) * .075));   // каждая следующая — дальше по дороге
      const [x, y] = lerpPath(ROAD, k);
      const s = Math.abs(Math.sin(t * .004 + i * .9)) * 1.0;
      const sway = Math.sin(t * .0025 + i) * 1.5;
      f.style.transform = `translate3d(${x}vw, ${y}vh, 0) translate(-50%,-100%) scale(${scaleAt(k)}) scaleX(-1) rotate(${sway}deg) translate(0, ${-s}px) translate(${-px * 10}px, ${-py * 6}px)`;
      f.style.opacity = k <= 0 ? '0' : '1';
    });
  }
  requestAnimationFrame(frame);

  gsap.registerPlugin(ScrollTrigger);
  const lenis = reduce ? null : new Lenis({ lerp: .09 });
  if (lenis) { lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
  ScrollTrigger.create({ trigger: '#dio', start: 'top top', end: 'bottom bottom', scrub: true, onUpdate: s => { prog = s.progress; } });
})();

/* ─────────────────────────────────────────────────────────────────────────────
   bottle3d.js — ДЕМО модуля assets/js/bottle3d-module.js.

   Здесь нет ни одной строчки рендера: вся сцена живёт в модуле, который
   строитель главной подключает как есть. Демо только:
     • создаёт бутылку в контейнере,
     • крутит её скроллом (GSAP ScrollTrigger + Lenis),
     • отдаёт курсор в setLight,
     • переключает виды «фронт / оборот / наезд»,
     • держит window.__b3d для приёмочных прогонов.
   ────────────────────────────────────────────────────────────────────────── */

import { createBottle } from '../assets/js/bottle3d-module.js';

const Q = new URLSearchParams(location.search);
const bottle = createBottle(document.getElementById('stage'), {
  label: 'chd',
  variant: Q.get('label') === 'hi' ? 'hi' : 'photo',
  lite: Q.has('lite') ? true : undefined,
  debug: Q.has('dbg'),
  post: !Q.has('nopost'),
  areaLights: !Q.has('norect'),
  ground: !Q.has('noground'),
  backdrop: !Q.has('nobackdrop'),
  onReady: () => {
    document.getElementById('pre')?.classList.add('off');
    document.documentElement.classList.add('is-ready');
  },
});

/* ── виды ─────────────────────────────────────────────────────────────────
 * front — этикетка в кадр, оборот — свободное вращение по скроллу и авто-
 * доворот, zoom — наезд в бумагу. */
let mode = 'front';
let idle = 0;
const btns = [...document.querySelectorAll('[data-view]')];

function setMode(m, { fromScroll = false } = {}) {
  mode = m;
  btns.forEach((b) => b.classList.toggle('is-on', b.dataset.view === m));
  document.documentElement.classList.toggle('is-zoom', m === 'zoom');
  document.documentElement.classList.toggle('is-turn', m === 'turn');
  if (m === 'front') { bottle.setZoom(0); if (!fromScroll) bottle.setProgress(Math.round(bottle.state.progress)); }
  if (m === 'turn') { bottle.setZoom(0); }
  if (m === 'zoom') { bottle.setProgress(Math.round(bottle.state.progress)); bottle.setZoom(1); }
}
btns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.view)));
setMode('front');

/* ── скролл крутит бутылку ──────────────────────────────────────────────── */
function bindScroll() {
  const gsap = window.gsap, ST = window.ScrollTrigger;
  if (!gsap || !ST) return false;
  gsap.registerPlugin(ST);
  ST.create({
    trigger: '.scroll', start: 'top top', end: 'bottom bottom', scrub: 0.6,
    onUpdate: (self) => {
      if (mode === 'zoom') return;
      idle = 0;
      if (self.progress > 0.004 && mode !== 'turn') setMode('turn', { fromScroll: true });
      bottle.setProgress(self.progress);
    },
  });
  return true;
}

function bindLenis() {
  const L = window.Lenis || (typeof Lenis !== 'undefined' ? Lenis : null);
  if (!L) return null;
  const lenis = new L({ lerp: 0.09, smoothWheel: true });
  if (window.ScrollTrigger) lenis.on('scroll', window.ScrollTrigger.update);
  if (window.gsap) {
    window.gsap.ticker.add((t) => lenis.raf(t * 1000));
    window.gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  return lenis;
}
bindLenis();
bindScroll();

/* ── курсор → свет и наклон ─────────────────────────────────────────────── */
addEventListener('pointermove', (e) => {
  bottle.setLight((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
});

/* ── HUD ────────────────────────────────────────────────────────────────── */
const fpsEl = document.getElementById('fps');
setInterval(() => {
  if (fpsEl) fpsEl.textContent = `${bottle.fps()} fps · ${bottle.state.quality}`;
  // класс вешаем по фактическому наезду, а не только по кнопке: приёмочные
  // прогоны дёргают jumpZoom() напрямую, и подпись не должна лезть на бумагу
  document.documentElement.classList.toggle('is-zoom', bottle.state.zoomTarget > 0.5);
}, 200);

/* ── ручка для прогонов / приёмки ───────────────────────────────────────── */
window.__b3d = {
  api: bottle,
  state: bottle.state,
  setSpin: (t) => bottle.jumpProgress(t),
  setZoom: (v) => bottle.setZoom(v),
  jumpZoom: (v) => bottle.jumpZoom(v),
  setMode,
  isReady: () => bottle.isReady(),
  fps: () => bottle.fps(),
};

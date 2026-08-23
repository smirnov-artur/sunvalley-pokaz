// РЕДАКТОР ПОСТАНОВКИ — подключается к сцене при ?edit в адресе.
// Позволяет: (1) перетащить любой объект мышью; (2) нарисовать маршрут кликами по фону (точки в vw/vh);
// (3) изменить масштаб колёсиком над объектом; (4) Сохранить → скачивается stage-<сцена>.json, который я вшиваю в код.
(() => {
  if (!location.search.includes('edit')) return;
  const scene = location.pathname.split('/').pop().replace('.html', '');
  const stick = document.querySelector('.dio__stick, .stick'); if (!stick) return;
  const objs = [...stick.querySelectorAll('.obj, .bird')].filter(o => !o.classList.contains('bird'));
  // остановить авто-анимацию объектов: ставим флаг, который сцены читают
  window.__STAGE_EDIT__ = true;
  // в режиме редактирования: вуали/текст не перехватывают мышь, объекты — поверх всего
  stick.querySelectorAll('.vign, .night, .dark, .light, .txt, .hint, .scale, .dio__rays, #birds, #wins, .sun').forEach(el => { el.style.pointerEvents = 'none'; });
  const txt = stick.querySelector('.txt'); if (txt) txt.style.opacity = '.25';
  const state = { objects: {}, routes: {} };
  let currentRoute = 'road';
  const pct = (x, y) => [Math.round(x / innerWidth * 1000) / 10, Math.round(y / innerHeight * 1000) / 10];

  // панель
  const ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;left:14px;top:70px;z-index:99999;background:rgba(0,0,0,.85);color:#f1d28a;font:12px/1.5 Arial;padding:12px 14px;border:1px solid #b99b63;max-width:320px;border-radius:4px';
  ui.innerHTML = `<b>РЕДАКТОР ПОСТАНОВКИ · ${scene}</b><br>
  • тащи объект мышью — позиция<br>• колёсико над объектом — масштаб<br>• клик по фону — точка маршрута «<span id="rName">road</span>»<br>• Shift+клик — точка второго маршрута «road2»<br>• Backspace — удалить последнюю точку<br>
  <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
    <button id="stSave" style="background:#b99b63;color:#000;border:0;padding:6px 10px;cursor:pointer">Сохранить JSON</button>
    <button id="stClear" style="background:transparent;color:#f1d28a;border:1px solid #b99b63;padding:6px 10px;cursor:pointer">Очистить маршрут</button>
  </div><pre id="stLog" style="margin-top:8px;max-height:220px;overflow:auto;white-space:pre-wrap;color:#cfc6b8"></pre>`;
  document.body.appendChild(ui);
  const log = () => { document.getElementById('stLog').textContent = JSON.stringify(state, null, 1); };

  // маршрут: SVG поверх сцены
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;z-index:9998;pointer-events:none');
  stick.appendChild(svg);
  const drawRoutes = () => { svg.innerHTML = ''; for (const [name, pts] of Object.entries(state.routes)) { if (!pts.length) continue; const col = name === 'road' ? '#f1d28a' : '#7fd1ff';
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); path.setAttribute('points', pts.map(p => `${p[0] / 100 * innerWidth},${p[1] / 100 * innerHeight}`).join(' ')); path.setAttribute('fill', 'none'); path.setAttribute('stroke', col); path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-dasharray', '6 4'); svg.appendChild(path);
      pts.forEach((p, i) => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', p[0] / 100 * innerWidth); c.setAttribute('cy', p[1] / 100 * innerHeight); c.setAttribute('r', '6'); c.setAttribute('fill', col); svg.appendChild(c); const t = document.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('x', p[0] / 100 * innerWidth + 9); t.setAttribute('y', p[1] / 100 * innerHeight - 6); t.setAttribute('fill', col); t.setAttribute('font-size', '12'); t.textContent = name + ' ' + (i + 1); svg.appendChild(t); }); } };

  // перетаскивание объектов
  objs.forEach(o => {
    o.style.pointerEvents = 'auto'; o.style.cursor = 'move'; o.style.outline = '1px dashed rgba(241,210,138,.6)'; o.style.zIndex = '9000';
    o.querySelectorAll('img').forEach(im => { im.style.pointerEvents = 'none'; im.draggable = false; });
    const id = o.id || o.className.split(' ').find(c => c !== 'obj');
    let drag = null;
    o.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const r = o.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height }; o.setPointerCapture(e.pointerId); });
    o.addEventListener('pointermove', e => { if (!drag) return; const x = e.clientX - drag.dx, y = e.clientY - drag.dy; o.style.transform = `translate3d(${x}px, ${y}px, 0)`; const [px, py] = pct(x + drag.w / 2, y + drag.h); state.objects[id] = { ...(state.objects[id] || {}), x: px, y: py, anchor: 'bottom-center' }; log(); });
    o.addEventListener('pointerup', () => { drag = null; });
    o.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); const cur = (state.objects[id] && state.objects[id].scale) || 1; const ns = Math.max(.2, Math.min(4, cur * (e.deltaY < 0 ? 1.05 : .95))); state.objects[id] = { ...(state.objects[id] || {}), scale: +ns.toFixed(3) }; o.style.width = ''; o.style.transform = (o.style.transform.replace(/ scale\([^)]*\)/, '')) + ` scale(${ns})`; log(); }, { passive: false });
  });

  // точки маршрута кликом по фону
  stick.addEventListener('click', e => { if (e.target.closest('.obj') || e.target.closest('button')) return; const name = e.shiftKey ? 'road2' : 'road'; state.routes[name] = state.routes[name] || []; state.routes[name].push(pct(e.clientX, e.clientY)); document.getElementById('rName').textContent = name; drawRoutes(); log(); });
  addEventListener('keydown', e => { if (e.key === 'Backspace') { const r = state.routes[currentRoute]; if (r && r.length) r.pop(); drawRoutes(); log(); } });
  document.getElementById('stClear').onclick = () => { state.routes = {}; drawRoutes(); log(); };
  document.getElementById('stSave').onclick = () => { const blob = new Blob([JSON.stringify({ scene, viewport: [innerWidth, innerHeight], ...state }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `stage-${scene}.json`; a.click(); };
  log();
})();

/* ══════════════════════════════════════════════════════════════════════
   WORLD-VIDEO — видео-слоты страниц-миров.

   Блок 2 из home.js (строки 129–275) вынесен как есть: контракт уже
   проверен на главной, переписывать нечего. Отличия ровно два:
   1. страницы-миры держат свою сцену в собственном rAF, поэтому здесь
      нет ни Lenis, ни ScrollTrigger — только слоты;
   2. сцена может завести слот сама (data-gate) через window.WorldVideo.

   РАЗМЕТКА называет ЖЕЛАЕМОЕ имя и фолбэк:  data-v="w-chd-ledger|candle-cellar"
   Реальное имя файла называет реестр manifest.json — единственный сетевой
   запрос. Проб через new Image()/HEAD нет, 404 невозможен. Появился новый
   ролик → sync-ai.js допишет реестр → слот сам переключится, вёрстку
   править не нужно. Имени нет в реестре — браузер НЕ делает к видео ни
   одного запроса, слот живёт статичным кадром <img class="vslot__still">.

   Атрибуты слота:
     data-v      цепочка имён для десктопа, через |
     data-v-m    цепочка для мобилы; ПУСТАЯ строка = «на мобиле видео нет»
                 (отсутствие атрибута = «играй десктопную цепочку»)
     data-poster имя постера в video/poster/<имя>.webp
     data-v-once событие, а не петля. Значение — список имён, для которых
                 снимается loop; пустое значение = весь слот событие
     data-gate   слот заводит сцена, а не наблюдатель
     data-eager  монтировать и играть сразу
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOB    = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  var VDIR   = '../assets/img/gen/ai/video/';

  /* Всё тяжёлое — строго ПОСЛЕ события load: ролики, начатые скриптом до
     него, задерживают сам load, и приёмка считает это временем готовности. */
  function afterLoad(fn) {
    if (document.readyState === 'complete') setTimeout(fn, 0);
    else window.addEventListener('load', function () { setTimeout(fn, 0); });
  }

  var VIDEOS = [];
  var paused = false;

  function mountVideo(slot, file) {
    var v = document.createElement('video');
    v.className = 'vslot__v';
    v.muted = true; v.defaultMuted = true; v.setAttribute('muted', '');
    v.playsInline = true; v.setAttribute('playsinline', '');
    /* Ролик-СОБЫТИЕ (data-v-once) — пролёт с началом и концом, а не петля.
       У атрибута ЕСТЬ ЗНАЧЕНИЕ — список имён; событием считается только
       смонтированное из них, остальная цепочка остаётся петлёй. */
    var once = slot.getAttribute('data-v-once');
    var список = once ? once.trim().split(/\s+/) : null;
    v.loop = once === null ? true
           : (список && список.length ? список.indexOf(file.replace(/\.mp4$/, '')) < 0 : false);
    v.controls = false; v.disablePictureInPicture = true;
    v.setAttribute('aria-hidden', 'true'); v.setAttribute('tabindex', '-1');
    v.preload = slot.hasAttribute('data-eager') ? 'auto' : 'metadata';
    var pos = slot.getAttribute('data-poster');
    if (pos) v.poster = VDIR + 'poster/' + pos + '.webp';
    v.src = VDIR + file;
    v.addEventListener('playing',    function () { v.classList.add('is-live'); });
    v.addEventListener('loadeddata', function () { v.classList.add('is-live'); });
    v.addEventListener('error',      function () { v.classList.remove('is-live'); });
    slot.appendChild(v);
    slot._v = v;
    VIDEOS.push(v);
    document.dispatchEvent(new CustomEvent('world:slot-mounted', { detail: slot }));
    return v;
  }

  function playV(v) {
    if (!v || paused) return;
    var p = v.play();
    if (p && p.catch) p.catch(function () {}); /* отказ автоплея — остаётся постер */
  }

  /* Слот со шторкой (data-gate) сам не монтируется: наложенные сцены,
     стартующие одновременно, дают несколько декодеров и провал fps.
     Ролик заводит та сцена, которая сейчас на подмостках. */
  function ensure(slot) {
    if (!slot) return null;
    if (!slot._v && slot._file) mountVideo(slot, slot._file);
    return slot._v;
  }

  /* Сцена вызывает это на каждом кадре или на фронте такта:
     on=true — слот в такте (монтируем и играем), on=false — глушим. */
  function gate(slot, on) {
    if (!slot) return;
    if (on === !!slot._on) return;                 /* только фронт */
    slot._on = !!on;
    if (on) { var v = ensure(slot); if (v) playV(v); }
    else if (slot._v && !slot._v.paused) slot._v.pause();
  }

  /* ПРОГРЕВ. Когда страница простаивает, тихо собираем ролики по одному
     и на 420 мс раскручиваем декодер: иначе первый проход скролла
     спотыкается о создание <video> и о первый декод каждого из них. */
  function warmUp(slots) {
    if (!slots.length) return;
    setTimeout(function step(i) {
      i = i || 0;
      if (i >= slots.length) return;
      var slot = slots[i], v = slot._v || (slot._file ? mountVideo(slot, slot._file) : null);
      if (v && v.paused && !paused) {
        var pr = v.play();
        if (pr && pr.catch) pr.catch(function () {});
        setTimeout(function () {
          if (!v.parentNode || slot._on) return;    /* слот уже на экране — не глушим */
          v.pause(); try { v.currentTime = 0; } catch (e) {}
        }, 420);
      }
      setTimeout(function () { step(i + 1); }, 320);
    }, 1500);
  }

  function initSlots(reg) {
    var ready = (reg && reg.ready) || [];
    var files = (reg && reg.files) || {};
    var lazy  = [];   /* ролики, которыми управляет наблюдатель */
    var gated = [];   /* ролики, которыми управляет сама сцена  */

    $$('.vslot').forEach(function (slot) {
      /* ПУСТОЙ data-v-m — «на мобиле видео нет вовсе», слот живёт стиллом. */
      var mob  = slot.getAttribute('data-v-m');
      var list = (MOB && mob !== null) ? mob : (slot.getAttribute('data-v') || '');
      var file = null;
      list.split('|').forEach(function (name) {
        if (file || !name) return;
        var f = files[name] || files[name + '.mp4'];
        if (!f && ready.indexOf(name) >= 0) f = name;
        if (f && ready.indexOf(f) >= 0) file = f;
      });
      if (!file) return;                     /* имени нет в реестре — живёт статичный кадр */
      slot._file = file;
      slot.setAttribute('data-mounted', file.replace(/\.mp4$/, ''));
      if (slot.hasAttribute('data-eager')) { playV(mountVideo(slot, file)); return; }
      if (slot.hasAttribute('data-gate')) { gated.push(slot); return; }  /* заведёт сцена */
      lazy.push([slot, file]);
    });

    afterLoad(function () { warmUp(lazy.map(function (p) { return p[0]; }).concat(gated)); });

    if (!lazy.length) return;
    if (!window.IntersectionObserver) { lazy.forEach(function (p) { playV(mountVideo(p[0], p[1])); }); return; }

    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var slot = e.target, rec = null;
        for (var i = 0; i < lazy.length; i++) if (lazy[i][0] === slot) rec = lazy[i];
        slot._on = e.isIntersecting;
        if (e.isIntersecting) {
          if (!slot._v && rec) mountVideo(slot, rec[1]);
          if (slot._v) playV(slot._v);
        } else if (slot._v && !slot._v.paused) slot._v.pause();
      });
    }, { rootMargin: '200px 0px' });
    lazy.forEach(function (p) { io.observe(p[0]); });
  }

  /* При reduce видео не монтируется вовсе: реестр даже не запрашивается. */
  if (!REDUCE && window.fetch) {
    fetch(VDIR + 'manifest.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { initSlots(m); document.dispatchEvent(new CustomEvent('world:slots-ready')); })
      .catch(function () { /* реестра нет — вся страница живёт на статичных кадрах */ });
  } else {
    document.dispatchEvent(new CustomEvent('world:slots-ready'));
  }

  /* Медленный наезд фотослотов живёт только пока слот на экране. */
  (function drift() {
    var ds = $$('.vslot--drift');
    if (!ds.length || !window.IntersectionObserver) { ds.forEach(function (d) { d.classList.add('is-drifting'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.target.classList.toggle('is-drifting', e.isIntersecting); });
    }, { rootMargin: '10% 0px' });
    ds.forEach(function (d) { io.observe(d); });
  })();

  /* Ушли со вкладки — глушим всё: и декодер, и лишний расход батареи. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) VIDEOS.forEach(function (v) { if (!v.paused) v.pause(); });
    else VIDEOS.forEach(function (v) { if (v.parentNode && v.parentNode._on) playV(v); });
  });

  window.WorldVideo = {
    ensure: ensure,
    gate: gate,
    play: playV,
    videos: VIDEOS,
    setPaused: function (p) {
      paused = !!p;
      VIDEOS.forEach(function (v) { if (paused) v.pause(); else playV(v); });
    }
  };
})();

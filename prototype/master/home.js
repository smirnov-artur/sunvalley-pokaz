/* ══════════════════════════════════════════════════════════════════════
   HOME — «СПУСК: ОТ НЕБА К БОКАЛУ».

   Одна непрерывная камера: небо → лоза → бутылка → четыре мира →
   подвал → пауза → бокал → визит. Единица страницы — кадр 100svh.

   Паттерны плейбука 20-МЕДИА-ХОРЕОГРАФИЯ раздел 3:
   П1 герой, П2 пин+скраб, П3 смена фона, П4 кроссфейд, П5 маска,
   П6 пословная подсветка, П7 push-слайды, П14 слоёное панно, П15б свечение.

   Своя реализация, без зависимости от assets/js/cinema.js: тот файл
   пишется параллельно, и привязка к живому чужому API — риск на показе.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOB    = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  var HAS    = !!(window.gsap && window.ScrollTrigger);
  var VDIR   = '../assets/img/gen/ai/video/';

  /* Всё тяжёлое — строго ПОСЛЕ события load. Картинки и ролики, начатые
     скриптом до него, задерживают сам load: 96 кадров секвенции плюс семь
     роликов растянули его до 15 с, и приёмка считала это временем готовности. */
  function afterLoad(fn) {
    if (document.readyState === 'complete') setTimeout(fn, 0);
    else window.addEventListener('load', function () { setTimeout(fn, 0); });
  }

  var attrOr = function (n, k, d) { var v = n && n.getAttribute(k); return (v === null || v === '') ? d : v; };
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var lerp    = function (a, b, t) { return a + (b - a) * t; };
  /* smoothstep — движение без линейных участков даже там, где ведёт скролл */
  var ss = function (a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  if (HAS) {
    gsap.registerPlugin(ScrollTrigger);
    gsap.config({ nullTargetWarn: false });
  }

  /* ────────────────────────────────────────────────────────────────────
     0 · ПРЕЛОАДЕР. Ритуал дома длится ровно столько, сколько нужно
     герою: линия добегает, эмблема уходит. Потолок — 1,2 с.
     ──────────────────────────────────────────────────────────────────── */
  var pre = $('#pre');
  var preDone = false;
  function preOff() {
    if (preDone || !pre) return;
    preDone = true;
    pre.classList.add('off');
    document.documentElement.classList.add('is-ready');
    if (HAS) ScrollTrigger.refresh();
    /* сцены, которым нельзя мешать ритуалу, ждут этого события */
    document.dispatchEvent(new CustomEvent('home:pre-off'));
  }
  if (pre) {
    var t0 = performance.now();
    requestAnimationFrame(function () { pre.classList.add('is-full'); });
    setTimeout(preOff, 1200);                               /* потолок ритуала */
    window.addEventListener('load', function () {           /* но не короче 0,55 с */
      setTimeout(preOff, Math.max(0, 550 - (performance.now() - t0)));
    });
  }

  /* ────────────────────────────────────────────────────────────────────
     1 · СКРОЛЛ. Lenis + ScrollTrigger. Обратный ход обязан быть
     зеркальным: все сцены считают чистый прогресс, состояний нет.
     ──────────────────────────────────────────────────────────────────── */
  var lenis = null;
  if (HAS && window.Lenis && !REDUCE) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    window.lenis = lenis;
  }
  /* якоря внутри страницы — через Lenis, иначе инерция дерётся с нативным */
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var t = $(a.getAttribute('href'));
      if (!t) return;
      e.preventDefault();
      var y = t.getBoundingClientRect().top + window.scrollY;
      if (lenis) lenis.scrollTo(y, { duration: 1.25 }); else window.scrollTo({ top: y, behavior: 'smooth' });
    });
  });

  /* трек прогресса секции — единственная точка входа для всех сцен */
  function track(sec, start, end, fn) {
    if (!HAS) { fn(0); return null; }
    return ScrollTrigger.create({
      trigger: sec, start: start, end: end, scrub: true,
      onUpdate:  function (s) { fn(s.progress); },
      onRefresh: function (s) { fn(s.progress); }
    });
  }

  /* ────────────────────────────────────────────────────────────────────
     2 · ВИДЕО-СЛОТЫ. Разметка называет ЖЕЛАЕМОЕ имя и фолбэк:
        data-v="valley-dawn|sun-rise-valley"
     Реальное имя файла называет реестр manifest.json — единственный
     сетевой запрос. Проб через new Image()/HEAD нет, 404 невозможен.
     Появится новый ролик у владельца → sync-ai.js допишет реестр →
     слот сам переключится на него, вёрстку править не нужно.
     ──────────────────────────────────────────────────────────────────── */
  var VIDEOS = [];            /* всё смонтированное — для кнопки паузы  */
  var paused = false;

  function mountVideo(slot, file) {
    var v = document.createElement('video');
    v.className = 'vslot__v';
    v.muted = true; v.defaultMuted = true; v.setAttribute('muted', '');
    v.playsInline = true; v.setAttribute('playsinline', '');
    /* Ролик-СОБЫТИЕ (data-v-once) — пролёт с началом и концом, а не петля.
       Зациклить его значит каждые восемь секунд бить зрителя склейкой
       «море → снова террасы». Доиграл — держит последний кадр (браузер
       оставляет его на экране сам). Когда сцена показывает слайд заново,
       play() по спецификации перематывает на нуль и пролёт идёт сначала. */
    v.loop = !slot.hasAttribute('data-v-once');
    v.controls = false; v.disablePictureInPicture = true;
    v.setAttribute('aria-hidden', 'true'); v.setAttribute('tabindex', '-1');
    v.preload = slot.hasAttribute('data-eager') ? 'auto' : 'metadata';
    var pos = slot.getAttribute('data-poster');
    if (pos) v.poster = VDIR + 'poster/' + pos + '.webp';
    v.src = VDIR + file;
    v.addEventListener('playing', function () { v.classList.add('is-live'); });
    v.addEventListener('loadeddata', function () { v.classList.add('is-live'); });
    v.addEventListener('error', function () { v.classList.remove('is-live'); });
    slot.appendChild(v);
    slot._v = v;
    VIDEOS.push(v);
    /* сцена может держать на детях слота свою анимацию — сообщаем о новом */
    document.dispatchEvent(new CustomEvent('home:slot-mounted', { detail: slot }));
    return v;
  }
  function playV(v) {
    if (!v || paused) return;
    var p = v.play();
    if (p && p.catch) p.catch(function () {}); /* отказ автоплея — остаётся постер */
  }

  /* Слот со шторкой (data-gate) сам не монтируется: четыре наложенных
     сцены, стартующие одновременно, дают четыре декодера и провал fps.
     Ролик заводит та сцена, которая сейчас на подмостках. */
  function ensure(slot) {
    if (!slot._v && slot._file) mountVideo(slot, slot._file);
    return slot._v;
  }

  /* ПРОГРЕВ. Когда герой уже на экране и страница простаивает, тихо
     собираем нижние ролики по одному и на 200 мс раскручиваем декодер.
     Иначе первый проход скролла спотыкается о создание семи <video>
     и о первый декод каждого из них: замерено 45 fps против 58. */
  function warmUp(slots) {
    if (!slots.length) return;
    /* Если сцена «Бутылка» собирает 3D, прогрев роликов ЖДЁТ её. Две тяжёлые
       подготовки одновременно душат друг друга: замерено — сборка сцены
       растягивалась с 5 до 9,6 с, когда параллельно раскручивались семь
       декодеров. Потолок ожидания 9 с, дальше греем в любом случае. */
    if (document.documentElement.dataset.b3d === 'pending') {
      var go = function () { document.documentElement.dataset.b3d = ''; warmUp(slots); };
      document.addEventListener('home:b3d-done', go, { once: true });
      setTimeout(function () { if (document.documentElement.dataset.b3d === 'pending') go(); }, 9000);
      return;
    }
    setTimeout(function step(i) {
      i = i || 0;
      if (i >= slots.length) return;
      var slot = slots[i], v = slot._v || (slot._file ? mountVideo(slot, slot._file) : null);
      if (v && v.paused && !paused) {
        var pr = v.play();
        if (pr && pr.catch) pr.catch(function () {});
        setTimeout(function () {
          if (!v.parentNode || slot._on) return;      /* слот уже на экране — не глушим */
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
      var list = (MOB && slot.getAttribute('data-v-m')) || slot.getAttribute('data-v') || '';
      var file = null;
      list.split('|').forEach(function (name) {
        if (file || !name) return;
        var f = files[name] || files[name + '.mp4'];
        if (!f && ready.indexOf(name) >= 0) f = name;
        if (f && ready.indexOf(f) >= 0) file = f;
      });
      if (!file) return;                       /* имени нет в реестре — живёт статичный кадр */
      slot._file = file;
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

  if (!REDUCE && window.fetch) {
    fetch(VDIR + 'manifest.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { initSlots(m); if (HAS) ScrollTrigger.refresh(); })
      .catch(function () { /* реестра нет — вся страница живёт на статичных кадрах */ });
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

  /* пауза у автоплея — и доступность, и знак «здесь фильм» (признак 14) */
  var pb = $('#pauseBtn');
  if (pb) pb.addEventListener('click', function () {
    paused = !paused;
    pb.setAttribute('aria-pressed', String(paused));
    pb.setAttribute('aria-label', paused ? 'Продолжить видео' : 'Пауза видео');
    VIDEOS.forEach(function (v) { if (paused) v.pause(); else playV(v); });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) VIDEOS.forEach(function (v) { if (!v.paused) v.pause(); });
  });

  /* ────────────────────────────────────────────────────────────────────
     3 · ШАПКА: прозрачная поверх героя, плотная — после первого экрана.
     ──────────────────────────────────────────────────────────────────── */
  var hdr = $('#hdr');
  if (hdr && HAS) {
    ScrollTrigger.create({
      start: function () { return 'top -' + Math.round(window.innerHeight * 0.88); },
      onToggle: function (s) { hdr.classList.toggle('is-solid', s.isActive); }
    });
  }

  /* ────────────────────────────────────────────────────────────────────
     СЦЕНА 1 · НЕБО (П1 + П3 + П4)
     Один кадр во весь экран. Скролл переводит день в вечер: два
     грейд-слоя перекрёстно проявляются по прогрессу. Когда владелец
     положит valley-noon / valley-dusk, в тех же слоях поедут настоящие
     таймлапсы — код не меняется. Видео растёт 1 → 1,06, текст уезжает
     медленнее и уходит раньше: разница скоростей и есть глубина.
     ──────────────────────────────────────────────────────────────────── */
  (function scSky() {
    var sec = $('#sky'); if (!sec) return;
    /* Наезд кадра вешаем на САМ <video>/<img>, а не на контейнер: у них
       собственный слой композитора, и масштаб не стоит ничего. */
    var mediaHost = $('#skyMedia > .vslot'), txt = $('#skyTxt');

    /* Наезд квантуется шагом 0,0015 (40 ступеней на весь ход 1 → 1,06).
       Причина замерена, а не выдумана: КАЖДОЕ новое значение scale у <video>
       заставляет браузер заново растрировать кадр — непрерывный наезд даёт
       18 fps, квантованный — 60 при том же движении. Ступень меняет размер
       кадра на 0,15 % (0,7 px по краю) — глазом не ловится. */
    var CSS_ZOOM = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'scroll()')) && !REDUCE;

    /* Браузер умеет scroll-driven animation — отдаём наезд ему целиком:
       остаётся только сказать, на каком отрезке скролла он длится. */
    function armCssZoom() {
      if (!CSS_ZOOM || !mediaHost) return;
      var len = Math.max(1, sec.offsetHeight - window.innerHeight);
      for (var i = 0; i < mediaHost.children.length; i++) {
        var k = mediaHost.children[i];
        k.classList.add('zoomed');
        k.style.animationRange = '0px ' + Math.round(len) + 'px';
      }
    }
    armCssZoom();
    document.addEventListener('home:slot-mounted', armCssZoom);
    window.addEventListener('resize', armCssZoom);

    /* Фолбэк без scroll-driven animation: тот же наезд из JS, но
       квантованный шагом 0,0015 — каждое НОВОЕ значение scale у <video>
       заставляет заново растрировать кадр, непрерывный наезд стоит 40 fps. */
    var ZQ = 0.0015, lastZ = -1;
    function zoom(s) {
      if (CSS_ZOOM || !mediaHost) return;
      var q = Math.round(s / ZQ) * ZQ;
      if (q === lastZ) return;
      lastZ = q;
      var k = mediaHost.children, v = 'translateZ(0) scale(' + q.toFixed(4) + ')';
      for (var i = 0; i < k.length; i++) k[i].style.transform = v;
    }
    var noon = $('#gradeNoon'), dusk = $('#gradeDusk'), hint = $('#scrollHint');

    /* въезд героя: 0–1,2 с только кадр, затем такты 1,2 / 1,6 / 2,2 с */
    if (HAS && !REDUCE) {
      var lines = $$('.sky__h .ln').map(function (ln) {
        var inner = document.createElement('span');
        while (ln.firstChild) inner.appendChild(ln.firstChild);
        ln.appendChild(inner); return inner;
      });
      gsap.set([$('.sky__eyebrow'), $('.sky__cta'), hint], { autoAlpha: 0, y: 18 });
      gsap.set(lines, { yPercent: 112, y: 0 });   /* y:0 обязателен: GSAP иначе читает % как px */
      var run = function () {
        var tl = gsap.timeline();                 /* такт в такт: 1,2 / 1,6 / 2,2 с от старта */
        tl.to($('.sky__eyebrow'), { autoAlpha: 1, y: 0, duration: .7, ease: 'power2.out' })
          .to(lines, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: .12 }, .35)
          .to($('.sky__cta'), { autoAlpha: 1, y: 0, duration: .8, ease: 'power2.out' }, 1.0)
          .to(hint, { autoAlpha: 1, y: 0, duration: .8, ease: 'power2.out' }, 1.15);
      };
      var wait = 1200 - performance.now();
      /* заголовок не показывается подменным шрифтом: ждём Cormorant */
      var go = function () { setTimeout(run, Math.max(0, 1200 - performance.now())); };
      if (document.fonts && document.fonts.ready) {
        var raced = false;
        document.fonts.ready.then(function () { if (!raced) { raced = true; go(); } });
        setTimeout(function () { if (!raced) { raced = true; go(); } }, 1600);
      } else setTimeout(run, Math.max(0, wait));
    }

    track(sec, 'top top', 'bottom bottom', function (p) {
      /* кадр дышит внутрь: 1 → 1,06 без рывка на границе пина */
      zoom(1 + 0.06 * ss(0, 1, p));
      /* текст едет медленнее кадра и растворяется до конца пина */
      if (txt) {
        txt.style.transform = 'translate3d(0,' + (-16 * ss(0, .82, p)).toFixed(2) + 'svh,0)';
        txt.style.opacity = String(1 - ss(.46, .84, p));
      }
      if (hint) hint.style.opacity = String(1 - ss(0, .14, p));
      /* день → полдень → вечер: перекрёстные грейды, без blur (мобиль тоже) */
      if (noon) noon.style.opacity = String(ss(.10, .48, p) * (1 - ss(.52, .86, p)));
      if (dusk) dusk.style.opacity = String(ss(.48, .86, p));
    });
  })();

  /* ────────────────────────────────────────────────────────────────────
     СЦЕНА 2 · ЛОЗА (П1 + a24)
     Четыре имени автохтонов проступают по одному в тёмной левой трети.
     Активное — светлое, соседи гаснут: список читается как меню фильма.
     ──────────────────────────────────────────────────────────────────── */
  (function scVine() {
    var sec = $('#vine'); if (!sec) return;
    var items = $$('.vine__i', sec);
    if (HAS && !REDUCE) gsap.set(items, { autoAlpha: 0, y: 16 });

    track(sec, 'top top', 'bottom bottom', function (p) {
      items.forEach(function (it, i) {
        var at = 0.10 + i * 0.20;                 /* 0,10 / 0,30 / 0,50 / 0,70 */
        var k  = ss(at - .10, at + .04, p);       /* появление */
        it.style.opacity = String(k);
        it.style.transform = 'translate3d(0,' + (16 * (1 - k)).toFixed(2) + 'px,0)';
        it.style.visibility = k > .01 ? 'visible' : 'hidden';
        var on = p >= at - .02 && (i === items.length - 1 || p < at + .18);
        it.classList.toggle('is-on', on);
      });
    });
  })();

  /* ────────────────────────────────────────────────────────────────────
     СЦЕНА 3 · БУТЫЛКА (П2 турнтейбл + П3 фон + П15б свечение)
     Экран замирает, колесо крутит БУТЫЛКУ. Секвенция кадров грузится
     ДО пина, иначе первый проход рваный. Чёрный фон ролика уходит
     в screen — сквозь него течёт фон страницы из ночи в закат.
     ──────────────────────────────────────────────────────────────────── */
  (function scTurn() {
    var sec = $('#turn'); if (!sec) return;
    var cv = $('#turnCv'), still = $('#turnStill'), warm = $('#turnWarm');
    var edge = $('#turnEdge'), out = $('#turnOut'), cut = $('#turnCut');
    var emb = $('#turnEmb'), pin = $('.turn__pin', sec);
    var caps = $$('.turn__c', sec);
    /* Живая 3D-бутылка. Пока api === null, сцена ведёт себя как раньше. */
    var b3d = null, embOn = false;
    /* alpha:true — на выходе край кадра растушёвывается маской, иначе
       под mix-blend-mode:screen проступает светлый прямоугольник ролика */
    var ctx = cv && cv.getContext ? cv.getContext('2d', { alpha: true }) : null;
    /* Оборот начинается с ЛИЦА этикетки: в исходнике кадр 0 — контрэтикетка
       со штрих-кодом, лицо приходит к 36-му. Сдвиг закольцован. */
    /* Окно кадров, проверенное покадрово: этикетка развёрнута от камеры,
       ни латиницы, ни штрих-кода, ни читаемых букв — в исходном ролике
       снята чужая бутылка, и на показе её текст появиться не должен. */
    var RANGE = [46, 78];
    /* своя нарезка 1600×900 — ровно размер cover при вьюпорте 1440×900:
       drawImage идёт почти 1:1, а не пересчитывает 1920×1080 каждый кадр
       (96 кадров, 1,49 МБ против 2,7 МБ исходной) */

    var frames = [], meta = null, stride = MOB ? 2 : 1, count = 0, cur = -1, curE = -1;
    var DIRF = '../assets/img/gen/home/frames/bottle-turn/';

    function size() {
      if (!cv) return;
      /* исходник секвенции 1920 px в ширину: DPR выше 1 не добавляет ни
         одного реального пикселя при вьюпорте 1440, зато линейно бьёт
         по заливке под screen на каждом кадре скраба */
      var d = Math.min(window.devicePixelRatio || 1, 1);
      cv.width  = Math.round(window.innerWidth  * d);
      cv.height = Math.round(window.innerHeight * d);
      cur = -1; curE = -1;
    }
    function nearest(i) {
      for (var d = 0; d < count; d++) {
        if (frames[i + d]) return frames[i + d];
        if (frames[i - d]) return frames[i - d];
      }
      return null;
    }
    /* Уменьшает и уводит влево САМ КАДР внутри канваса, а не канвас:
       элемент всегда во весь экран, и его чёрное поле под screen остаётся
       невидимым — иначе на выходе проступает светлый прямоугольник. */
    function paint(i, e) {
      if (e === undefined) e = curE < 0 ? 0 : curE;
      if (!ctx || (i === cur && e === curE)) return;
      var im = nearest(i); if (!im) return;
      cur = i; curE = e;
      var cw = cv.width, ch = cv.height;
      /* на узком экране кадр ужимается до 78 % высоты и поднимается:
         внизу освобождается тёмное поле под подпись (текст не ложится
         на этикетку — правило «текст только в тихой зоне») */
      var s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight) * (MOB ? .78 : 1) * (1 - .40 * e);
      var w = im.naturalWidth * s, h = im.naturalHeight * s;
      var dx = (cw - w) / 2 - cw * .26 * e, dy = (ch - h) / 2 - (MOB ? ch * .09 : 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(im, dx, dy, w, h);
      if (e > .002 || MOB) {
        var cx = dx + w / 2, cy = dy + h / 2;
        var g = ctx.createRadialGradient(cx, cy, h * .30, cx, cy, h * .58);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    /* фон П3: ночь подвала → дуб → закат. Цвет ведёт прогресс, не таймер */
    var C = [[11, 9, 6], [42, 27, 16], [122, 74, 30]];
    function warmAt(p) {
      var t = ss(.06, .86, p) * 2, a = t < 1 ? C[0] : C[1], b = t < 1 ? C[1] : C[2], k = t < 1 ? t : t - 1;
      var c = 'rgb(' + Math.round(lerp(a[0], b[0], k)) + ',' + Math.round(lerp(a[1], b[1], k)) + ',' + Math.round(lerp(a[2], b[2], k)) + ')';
      return 'radial-gradient(74% 62% at 50% 58%,' + c + ' 0%,#0B0906 80%)';
    }

    /* Такты 3D-режима. Оборот успевает закончиться ЛИЦОМ этикетки к камере
       (полный круг к 64 %), только после этого начинается наезд — иначе
       зритель влетает в бумагу под углом. Из наезда сцена переходит встык
       в макро тиснения: 3D-этикетка во весь кадр → снятая бумага. */
    var T = { spin: [0, .64], zoom: [.66, .88], emb: [.86, .97] };

    /* Скорость оборота неравномерна нарочно. У этикетки обхват 130°, и со
       спины бутылка показывает изнанку бумаги — смотреть там нечего.
       Кривая держит лицо дольше и проскакивает спину: сектор 135–225°
       занимает 12 % такта вместо 25 %. Монотонна (производная ≥ 0,18),
       поэтому обратный ход зеркален и без рывка. */
    function spinCurve(u) { return u - .13 * Math.sin(2 * Math.PI * u); }

    /* Подписи: окно ±, подобранное так, чтобы две строки НИКОГДА не были
       на экране одновременно — иначе они складываются в кашу (проверено). */
    function capsAt(p) {
      caps.forEach(function (c) {
        var at = parseFloat(c.getAttribute('data-at'));
        c.classList.toggle('is-on', p >= at - .10 && p < at + .10);
      });
    }

    /* Макро тиснения — слот со шторкой: заводит его сама сцена и только
       на выходе, иначе восьмой декодер крутится всю страницу. */
    function embAt(f) {
      if (!emb) return;
      emb.style.opacity = String(f);
      var want = f > .004;
      if (want === embOn) return;
      embOn = want;
      var v = want ? ensure(emb) : emb._v;
      if (v) { if (want) playV(v); else v.pause(); }
    }
    /* Сцена кончилась на прогрессе 1 — значит embAt(1) остаётся последним
       значением, и ролик крутился бы до самого футера. Уводим по выходу
       секции из кадра: восьмой живой декодер стоит 2–3 fps на остальной
       странице (замерено на подвале). */
    if (emb && window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        var on = es[0].isIntersecting;
        if (!emb._v) return;
        if (!on) { if (!emb._v.paused) emb._v.pause(); }
        else if (embOn) playV(emb._v);
      }, { rootMargin: '0px' }).observe(sec);
    }

    function apply(p) {
      /* ── 3D ── */
      if (b3d) {
        var z = ss(T.zoom[0], T.zoom[1], p);
        var sp = spinCurve(ss(T.spin[0], T.spin[1], p));
        b3d.setProgress(sp);
        b3d.setZoom(z);
        /* Спина бутылки: там изнанка бумаги, светлый прямоугольник без
           единой детали — единственный слабый кадр всего оборота. Гасим
           экспозицию: бумага уходит в тень, а блики на грани стекла
           (они на порядок ярче) остаются — бутылка проходит спину
           силуэтом, как в эталонном ролике. */
        var d = Math.abs((sp % 1 + 1) % 1 - .5);
        if (b3d.setExposure) b3d.setExposure(.96 * (1 - .56 * (1 - ss(.13, .30, d))));
        /* На наезде тёплый фон гаснет: под mix-blend-mode:screen закатный
           градиент вымывает бумагу, и мелкий шрифт этикетки перестаёт
           читаться. Замерено на кадрах 88/92/96 %. */
        if (warm) {
          warm.style.background = warmAt(clamp01(p / .70) * .86);
          warm.style.opacity = String(1 - .94 * z);
        }
        embAt(ss(T.emb[0], T.emb[1], p));
        /* 3D-бутылка сама уходит в этикетку — вырезка на выходе не нужна */
        if (cut) cut.style.opacity = '0';
        if (out) {
          var fo = ss(.90, 1, p);
          out.style.opacity = String(fo);
          out.style.transform = 'translate3d(0,' + (18 * (1 - fo)).toFixed(2) + 'px,0)';
        }
        capsAt(p);
        if (edge) edge.style.opacity = String(ss(.44, .62, p) * (1 - ss(.66, .82, p)));
        return;
      }

      /* ── кадры (фолбэк) ── */
      if (warm) warm.style.background = warmAt(p);
      var e = ss(.84, 1, p);
      if (count) paint(Math.round(ss(0, .86, p) * (count - 1)), +e.toFixed(3));
      /* Сцена заканчивается НАШЕЙ бутылкой: последние 12 % чужой кадр
         гаснет, вырезка ×4 проступает на его месте и уезжает вместе с ним. */
      if (cut) {
        var f = ss(.88, .99, p);
        cut.style.opacity = String(f);
        cut.style.transform = 'scale(' + (1 - .34 * e).toFixed(3) + ') translate3d(' + (-4 * e).toFixed(2) + 'vw,0,0)';
      }
      if (cv) cv.style.opacity = String(1 - ss(.90, .99, p));
      /* Тот же макро тиснения, что и в 3D-режиме, только позади вырезки:
         чужой кадр гаснет — под ним уже НАША бумага, а не чёрное поле. */
      embAt(ss(.87, .98, p));
      capsAt(p);
      /* кульминация: золото по краю вьюпорта */
      if (edge) edge.style.opacity = String(ss(.58, .80, p) * (1 - ss(.86, .97, p)));
      /* выход: пока секвенция не пришла, тем же движением уходит постер */
      if (still && !(cv && cv.classList.contains('is-on'))) {
        still.style.transform = 'scale(' + (1 - .40 * e).toFixed(3) + ') translate3d(' + (-26 * e).toFixed(2) + 'vw,0,0)';
      }
      if (out) {
        out.style.opacity = String(ss(.88, .99, p));
        out.style.transform = 'translate3d(0,' + (18 * (1 - ss(.88, .99, p))).toFixed(2) + 'px,0)';
      }
    }

    var st = track(sec, 'top top', 'bottom bottom', apply);

    /* Секвенция: сначала первый кадр (мгновенно), потом очередь по 6.
       Стартуем только после load — 96 картинок, начатых раньше, задерживают
       сам load и портят замер готовности страницы. */
    function startFrames() {
      if (!(ctx && !REDUCE && window.fetch)) return;
      afterLoad(function () {
      fetch(DIRF + 'index.json', { cache: 'force-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || !j.count) return;
          meta = j;
          var lo = Math.max(0, RANGE[0]), hi = Math.min(j.count - 1, RANGE[1]);
          count = Math.floor((hi - lo) / stride) + 1;
          var pad = j.pad || 3, pat = j.pattern || 'f-{i}.webp';
          /* индекс скраба → номер кадра в нарезке, со сдвигом окна */
          var url = function (i) { return DIRF + pat.replace('{i}', String(lo + i * stride).padStart(pad, '0')); };

          /* первым приходит кадр, который встретит зрителя */
          var first = new Image();
          first.decoding = 'async';
          first.onload = function () {
            frames[0] = first;
            size(); cv.classList.add('is-on'); paint(0);
            if (st) apply(st.progress);
          };
          first.src = url(0);

          var q = [], i;
          for (i = 1; i < count; i++) q.push(i);
          var inflight = 0;
          /* Загрузить и раскодировать мало: первая ОТРИСОВКА каждого кадра
             ещё и заливает его текстурой в видеопамять. Если не сделать это
             заранее, все 96 заливок случаются во время первого же скраба.
             Прогоняем их по 8 за кадр в угол канваса — источник при этом
             загружается целиком, а рисование почти ничего не стоит. */
          var primed = false;
          function prime() {
            if (primed) return; primed = true;
            var i = 0;
            (function chunk() {
              var n = 0;
              ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1, 1); ctx.clip();
              while (i < count && n < 8) {
                var im = frames[i++];
                /* рисуем в НАСТОЯЩЕМ размере, но под клипом 1×1: текстура
                   заливается в видеопамять целиком, а растеризуется один пиксель */
                if (im) { ctx.drawImage(im, 0, 0, cv.width, cv.height); n++; }
              }
              ctx.restore();
              if (i < count) requestAnimationFrame(chunk);
              else { cur = -1; curE = -1; if (st) apply(st.progress); }
            })();
          }

          function pump() {
            if (!q.length && !inflight) prime();
            while (inflight < 6 && q.length) {
              (function (k) {
                inflight++;
                var im = new Image();
                im.decoding = 'async';
                /* decode() обязателен: без него кадр раскодируется в момент
                   первой отрисовки — и первый проход скраба идёт на 45 fps */
                var done = function () { frames[k] = im; inflight--; if (k === cur) { cur = -1; paint(k); } pump(); };
                im.onload = function () { if (im.decode) im.decode().then(done, done); else done(); };
                im.onerror = function () { inflight--; pump(); };
                im.src = url(k);
              })(q.shift());
            }
          }
          pump();
        })
        .catch(function () { /* нарезки нет — на пине остаётся постер bottle-turn */ });
      });
    }

    /* ── РЕЖИМ СЦЕНЫ ────────────────────────────────────────────────────
       Разметка объявляет режим атрибутом data-bottle:
         "3d"     — живая модель из assets/js/bottle3d-module.js;
         "frames" — секвенция кадров bottle-turn (чужая бутылка, окно RANGE).
       3D берётся динамическим import(): пока атрибут не «3d», ни three,
       ни текстуры бутылки в сеть не уходят. Любой отказ — нет WebGL,
       нет модуля, сцена не собралась за 15 с — молча роняет сцену обратно
       на кадры, поэтому страница не может остаться с пустым пином. */
    var mode = pin ? attrOr(pin, 'data-bottle', 'frames') : 'frames';
    /* Ручка приёмки: ?bottle=frames показывает фолбэк, ?bottle=3d — модель.
       Нужна, чтобы сравнивать оба режима на одной машине, не правя разметку. */
    var q = /[?&]bottle=(3d|frames)/.exec(location.search);
    if (q) mode = q[1];

    if (mode === '3d' && REDUCE) {
      /* Без движения крутить нечего, а чужой постер показывать нельзя —
         на пине стоит НАША вырезка ×4. */
      if (pin) pin.classList.add('b3d-still');
    } else if (mode === '3d') {
      /* Сборку 3D нельзя начинать сразу после load. Разбор three (750 КБ),
         PMREM и компиляция шейдеров держат главный поток кусками по
         сотни миллисекунд — прелоадер в этот момент ещё уходит, и его
         снятие видно рывком: живой прогон показывал «готовность» 4–8 с
         вместо 0,7 с, хотя событие load приходило на 590 мс.
         Поэтому старт по первому из двух событий:
           · прошло 2 с после load — герой отыграл, прелоадер давно снят,
             и у обычного читателя сборка успевает пройти задолго до бутылки;
           · секция «Бутылка» подошла на 1,2 экрана — для тех, кто улетел
             вниз сразу (тогда их встретит наша вырезка, класс b3d-wait). */
      /* КОГДА СОБИРАТЬ. Замерено на холодном профиле Chrome (свежий
         user-data-dir, ANGLE): сборка сцены даёт ОДИН синхронный кусок
         2,4–2,6 с — это трансляция физического стекла в HLSL, она не
         зависит от опций модуля (проверены post:false, lite, areaLights:
         холодная готовность везде 5,5–6,8 с). Спрятать её нельзя, можно
         только выбрать момент:
           · во время прелоадера — ритуал растягивается до 4 с;
           · сразу после прелоадера — герой выходит рывком: заголовок
             «Солнце сушит камень» опаздывал с 2,5 с до 5 с (кадры
             review/home/final/coldstart/);
           · по приближению секции — рывок приходится ровно на прокрутку.
         Поэтому старт — через 2,4 с после снятия прелоадера, когда выход
         героя (eyebrow → заголовок → кнопка) уже отыграл: зритель читает
         первый экран, а не листает. Тёплый профиль всё это не платит. */
      document.documentElement.dataset.b3d = 'pending';
      var started = false, t3d = 0;
      function begin() {
        if (started) return;
        started = true;
        clearTimeout(t3d);
        build3d();
      }
      document.addEventListener('home:pre-off', function () { t3d = setTimeout(begin, 2400); }, { once: true });
      afterLoad(function () { if (!t3d && !started) t3d = setTimeout(begin, 3600); });

      function build3d() {
        var host = $('#bottle3d');
        var fellBack = false, live = null, timer = 0;
        function fallBack(why) {
          if (fellBack) return;
          fellBack = true;
          clearTimeout(timer);
          if (live) { try { live.dispose(); } catch (e) { /* уже мёртв */ } live = null; }
          b3d = null;
          if (pin) { pin.classList.remove('b3d-on'); pin.classList.remove('b3d-wait'); }
          if (host) host.classList.remove('is-on');
          if (still && poster0) { still.src = poster0; still.alt = ''; }
          if (window.console && console.warn) console.warn('[home] 3D-бутылка не поднялась (' + why + ') — сцена идёт на кадрах');
          document.dispatchEvent(new CustomEvent('home:b3d-done'));
          startFrames();
          if (st) apply(st.progress);
        }
        /* Пока сцена собирается (2–5 с), на пине НЕ чужой постер, а наша
           вырезка: чужая бутылка не должна мелькнуть даже на секунду. */
        var poster0 = still ? still.getAttribute('src') : null;
        if (still) { still.src = '../assets/img/gen/home/bottle-cherniy_doctor2017-1000.webp'; still.alt = 'Чёрный Доктор Солнечной Долины'; }
        if (pin) pin.classList.add('b3d-wait');
        if (!host || !window.WebGL2RenderingContext) { fallBack('нет WebGL2'); return; }
        timer = setTimeout(function () { fallBack("таймаут 25 с"); }, 25000);
        import('../assets/js/bottle3d-module.js').then(function (m) {
          if (fellBack || !m || typeof m.createBottle !== 'function') { fallBack('нет createBottle'); return; }
          live = m.createBottle(host, {
            label: 'chd',
            /* Своего фона у сцены быть не должно: под mix-blend-mode:screen
               серая стенка модуля перекрыла бы закатный градиент страницы. */
            backdrop: false,
            /* Стол и контактная тень оставлены: без них бутылка висит. */
            ground: true,
            /* Кадр 100 svh: при 26° бутылка занимала 79 % высоты, при 21°
               доходит до 92 % и обрезается краем, как в эталонах (признак 11). */
            fov: 21,
            onReady: function () {
              if (fellBack) return;
              clearTimeout(timer);
              b3d = live;
              if (pin) pin.classList.add('b3d-on');
              if (host) host.classList.add('is-on');
              if (st) apply(st.progress);
              if (HAS) ScrollTrigger.refresh();
              document.dispatchEvent(new CustomEvent('home:b3d-done'));
            },
            onError: function (e) { fallBack(String((e && e.message) || e)); }
          });
        }).catch(function (e) { fallBack(String((e && e.message) || e)); });

        /* Курсор доворачивает бутылку и двигает блик — только пока сцена
           в кадре: сам модуль ничего не считает лишний раз, это запись в state. */
        if (!MOB) window.addEventListener('pointermove', function (ev) {
          if (!b3d || !st || st.progress <= 0 || st.progress >= 1) return;
          b3d.setLight((ev.clientX / window.innerWidth) * 2 - 1, (ev.clientY / window.innerHeight) * 2 - 1);
        }, { passive: true });
      }
    } else {
      startFrames();
    }

    window.addEventListener('resize', function () { size(); if (st) { cur = -1; apply(st.progress); } });
  })();

  /* ────────────────────────────────────────────────────────────────────
     СЦЕНА 4 · ЧЕТЫРЕ МИРА (П7 push-переход)
     Предыдущий кадр уезжает вверх, следующий открывается снизу.
     Точки справа обязательны: без индикатора пользователь паникует.
     ──────────────────────────────────────────────────────────────────── */
  (function scWorlds() {
    var sec = $('#worlds'); if (!sec) return;
    var sl = $$('.wsl', sec), dots = $$('#worldDots button');
    var n = sl.length, active = -1;

    sl.forEach(function (s, i) { s.style.zIndex = String(10 + i); });

    function apply(p) {
      var x = clamp01(p) * (n - 1);
      sl.forEach(function (s, i) {
        var d = x - i;                                    /* >0 — слайд уже уехал вверх */
        /* уходящий поднимается, приходящий открывается снизу — оба по smoothstep,
           поэтому на стыке слайдов нет ни рывка, ни линейного участка */
        var y = d > 0 ? -ss(0, 1, d) * 100 : ss(0, 1, -d) * 100;
        s.style.transform = 'translate3d(0,' + y.toFixed(3) + '%,0)';
        s.style.visibility = (y > 99.5 || y < -99.5) ? 'hidden' : 'visible';
      });
      var cur = Math.round(x);
      if (cur !== active) {
        active = cur;
        dots.forEach(function (d, i) { d.classList.toggle('is-on', i === cur); });
        sl.forEach(function (s, i) {
          var slot = $('.vslot', s); if (!slot) return;
          /* Слот на подмостках помечен: иначе ПРОГРЕВ, который заводит
             ролик на 420 мс и глушит обратно, останавливает и тот кадр,
             что сцена уже вывела. Первый слайд как раз попадал под это —
             реестр приходит позже первого apply(0), сцене нечего было
             заводить, а прогрев потом ставил свежесмонтированный ролик
             на паузу в нулевом кадре, и он стоял до смены слайда. */
          slot._on = (i === cur);
          if (i === cur) { var v = ensure(slot); if (v) playV(v); }
          else if (slot._v && !slot._v.paused) slot._v.pause();
        });
      }
    }
    var st = track(sec, 'top top', 'bottom bottom', apply);
    apply(0);

    dots.forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-i');
        var y = sec.offsetTop + (sec.offsetHeight - window.innerHeight) * (i / (n - 1));
        if (lenis) lenis.scrollTo(y, { duration: 1.1 }); else window.scrollTo({ top: y, behavior: 'smooth' });
      });
    });

    /* ── «вход в этикетку» ──────────────────────────────────────────────
       Кросс-документный view transition оживёт, когда страницы миров
       объявят у себя @view-transition{navigation:auto} — тогда на <html>
       достаточно поставить data-vt-live="1", и этот оверлей отключится. */
    if (!REDUCE) $$('.wsl__go', sec).forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (document.documentElement.dataset.vtLive === '1') return;   /* ведёт браузер */
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        var card = a.closest('.wsl'), img = card && $('.wsl__b', card);
        if (!img) return;
        e.preventDefault();
        var r = img.getBoundingClientRect();
        var ov = document.createElement('div');
        ov.className = 'vtover';
        var c = img.cloneNode(true);
        c.removeAttribute('style');
        c.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;transform-origin:50% 50%';
        ov.appendChild(c);
        document.body.appendChild(ov);
        var k = Math.max(window.innerWidth / r.width, window.innerHeight / r.height) * 1.25;
        var dx = (window.innerWidth / 2) - (r.left + r.width / 2);
        var dy = (window.innerHeight / 2) - (r.top + r.height / 2);
        var href = a.getAttribute('href');
        gsap.timeline({ onComplete: function () { window.location.href = href; } })
          .to(ov, { opacity: 1, duration: .18, ease: 'power1.out' })
          .to(c,  { x: dx, y: dy, scale: k, duration: .62, ease: 'expo.in' }, 0)
          .to(c,  { opacity: 0, duration: .26, ease: 'power2.in' }, .40);
      });
    });
  })();

  /* ────────────────────────────────────────────────────────────────────
     СЦЕНА 5 · ПОДВАЛ. Годы бегут в такт скроллу и ОСТАНАВЛИВАЮТСЯ
     на шести датах — остановка и есть подпись. Даты сверены по
     knowledge-base/01-компания-и-история.
     ──────────────────────────────────────────────────────────────────── */
  (function scYears() {
    var sec = $('#cellar'); if (!sec) return;
    var nEl = $('#yearsN'), caps = $$('#yearsCaps p'), drop = $('#yearsDrop');
    var stops = caps.map(function (c) { return +c.getAttribute('data-y'); });
    var m = stops.length;
    var at = stops.map(function (_, i) { return 0.06 + i * (0.88 / (m - 1)); });
    var HOLD = 0.055;

    function yearAt(p) {
      if (p <= at[0]) return stops[0];
      if (p >= at[m - 1]) return stops[m - 1];
      for (var i = 0; i < m - 1; i++) {
        if (p >= at[i] - HOLD && p <= at[i] + HOLD) return stops[i];
        if (p > at[i] + HOLD && p < at[i + 1] - HOLD) {
          var k = ss(at[i] + HOLD, at[i + 1] - HOLD, p);
          return Math.round(lerp(stops[i], stops[i + 1], k));
        }
      }
      return stops[m - 1];
    }

    track(sec, 'top top', 'bottom bottom', function (p) {
      var y = yearAt(p);
      if (nEl && nEl.textContent !== String(y)) nEl.textContent = String(y);
      caps.forEach(function (c, i) {
        c.classList.toggle('is-on', Math.abs(p - at[i]) <= HOLD + .012);
      });
      /* финал сцены — макро капли у бочки */
      if (drop) {
        var k = ss(.90, .99, p);
        drop.style.opacity = String(k);
        if (k > .05) { var dv = ensure(drop); if (dv) playV(dv); }
        else if (drop._v && !drop._v.paused) drop._v.pause();
      }
      /* число слегка растёт — единственное движение на кадре. Масштаб
         квантуется по той же причине, что и наезд героя: каждое новое
         значение scale перерисовывает огромные глифы заново. */
      if (nEl) {
        var z = Math.round((1 + .05 * ss(0, 1, p)) / .0025) * .0025;
        if (z !== nEl._z) { nEl._z = z; nEl.style.transform = 'translateY(-50%) scale(' + z.toFixed(4) + ')'; }
      }
    });
  })();

  /* ────────────────────────────────────────────────────────────────────
     СЦЕНА 5а · ПАУЗА (признак 13 + П6). Плоский камень, один абзац,
     слова загораются слева направо по скроллу.
     ──────────────────────────────────────────────────────────────────── */
  (function scPause() {
    var p = $('#pauseP'); if (!p) return;
    var words = p.textContent.split(/\s+/);
    p.innerHTML = words.map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');
    if (!HAS || REDUCE) { p.style.color = 'rgba(22,18,16,.92)'; return; }
    gsap.to($$('.w', p), {
      color: 'rgba(22,18,16,.94)', stagger: .05, ease: 'none',
      scrollTrigger: { trigger: p, start: 'top 86%', end: 'bottom 58%', scrub: true }
    });
  })();

  /* ────────────────────────────────────────────────────────────────────
     СЦЕНА 6 · БОКАЛ (П5 маска). Видео живёт внутри «1888», маска
     раскрывается на весь экран по скроллу и растворяется.
     ──────────────────────────────────────────────────────────────────── */
  (function scGlass() {
    var sec = $('#glass'); if (!sec) return;
    var t = $('#glassT'), cut = $('#glassCut'), txt = $('#glassTxt');
    var FROM = MOB ? 44 : 26, TO = MOB ? 210 : 148;

    track(sec, 'top top', 'bottom bottom', function (p) {
      var k = ss(.06, .78, p);
      /* SVG-маска перерисовывается на каждое новое значение кегля: шаг
         0,4 vw даёт 300 ступеней — движение читается как непрерывное,
         а перерисовок втрое меньше, чем кадров */
      if (t) {
        var fz = Math.round(lerp(FROM, TO, k) / .4) * .4;
        if (fz !== t._fz) { t._fz = fz; t.style.fontSize = fz.toFixed(1) + 'vw'; }
      }
      /* маска растворяется раньше, чем цифры распадаются на обрывки */
      if (cut) cut.style.opacity = String(1 - ss(.58, .80, p));
      if (txt) {
        var s = ss(.66, .84, p);
        txt.style.opacity = String(s);
        txt.style.transform = 'translate3d(0,' + (16 * (1 - s)).toFixed(2) + 'px,0)';
      }
    });
  })();

  /* ────────────────────────────────────────────────────────────────────
     СЦЕНА 6а · БРЮТ. Полноэкранное СОБЫТИЕ: пробка вылетает один раз,
     ролик замирает на стоп-кадре с паром (эталон — Ferrari).

     Ролик заводит САМА сцена (слот помечен data-gate), а не наблюдатель:
     у наблюдателя rootMargin 200 px, хлопок начался бы ещё до того, как
     кадр занял экран, и зрителю достался бы только висящий пар. Здесь
     старт привязан к моменту, когда пин реально встал на весь экран.

     Заводим ПО ФРОНТУ, а не каждый кадр скролла: play() у доигравшего
     ролика по спецификации перематывает на нуль, и вызов из обработчика
     скролла крутил бы хлопок заново на каждом пикселе обратного хода.
     ──────────────────────────────────────────────────────────────────── */
  (function scPop() {
    var sec = $('#brut'); if (!sec) return;
    var slot = $('#popV'), txt = $('#popTxt'), on = false;

    function set(want) {
      if (want === on || !slot) return;
      on = want; slot._on = want;
      if (want) { var v = ensure(slot); if (v) playV(v); }
      else if (slot._v && !slot._v.paused) slot._v.pause();
    }

    if (!HAS && txt) { txt.style.opacity = '1'; txt.style.setProperty('--rise', '0px'); }

    track(sec, 'top top', 'bottom bottom', function (p) {
      set(p > 0.004);
      if (txt && HAS) {
        var s = ss(.03, .19, p);
        txt.style.opacity = String(s);
        txt.style.setProperty('--rise', (18 * (1 - s)).toFixed(1) + 'px');
      }
    });

    /* Секция ушла из кадра — глушим совсем. Иначе прогресс остаётся на
       единице до самого футера, ролик числится «идущим», а вход обратно
       снизу не даёт фронта и хлопок не повторяется. Та же мера, что у
       ролика выхода сцены «Бутылка». */
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (!e.isIntersecting) set(false); });
      }, { rootMargin: '0px' }).observe(sec);
    }
  })();

  /* ────────────────────────────────────────────────────────────────────
     СЦЕНА 7 · ВИЗИТ (П14). Слои панно дрейфуют своими циклами (CSS),
     а по скроллу расходятся параллаксом. Ни один слой не двигается
     больше чем на 2 % своей ширины — иначе видно аппликацию.
     ──────────────────────────────────────────────────────────────────── */
  (function scVisit() {
    var sec = $('#visit'); if (!sec) return;
    var pls = $$('.pl', sec);
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { sec.classList.toggle('is-drifting', e.isIntersecting); });
      }, { rootMargin: '10% 0px' }).observe(sec);
    } else sec.classList.add('is-drifting');
    if (!HAS || REDUCE) return;
    gsap.to(pls, {
      yPercent: function (i) { return [-7, -5, -3.4, -2, -1][i] || 0; },
      xPercent: function (i) { return [1.6, 1.1, .6, .2, -.6][i] || 0; },
      ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom bottom', scrub: 1 }
    });
    gsap.from($$('.visit__txt > *', sec), {
      autoAlpha: 0, y: 22, duration: 1, ease: 'power3.out', stagger: .08,
      scrollTrigger: { trigger: '.visit__txt', start: 'top 82%' }
    });
  })();

  /* ────────────────────────────────────────────────────────────────────
     ПЕРЕСЧЁТ. Шрифты и лениво пришедшие ролики меняют высоты —
     ScrollTrigger обязан узнать об этом ровно один раз.
     ──────────────────────────────────────────────────────────────────── */
  if (HAS) {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
    var rt = null;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { ScrollTrigger.refresh(); }, 180); });
  }
})();

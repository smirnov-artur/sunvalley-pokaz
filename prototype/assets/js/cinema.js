/* ══════════════════════════════════════════════════════════════════════
   CINEMA — движок кино-хореографии «Солнечной Долины».

   ЗАЧЕМ. Владелец посмотрел концепты и сказал: «не цепляет». Диагноз
   простой: у нас медиа стояло во врезках на 30–50 % ширины среди текста,
   а у эталонов (Apple, Ferrari, A24, Lusion) единица страницы — КАДР
   100vw × 100vh. Ferrari не показывает фотографию машины в колонке: она
   занимает экран, а текст приходит на неё сверху, на своём поле.

   ЧТО ЭТО. Пять примитивов, включаемых одним data-атрибутом. Строитель
   пишет только смысл (заголовок, подпись, какой ролик) — хореографию,
   слои, скрим, автоплей, фолбэки и мобильный берёт на себя движок.

       data-cine="hero"   полноэкранный видео-герой + скрим + параллакс
       data-cine="scrub"  пин + отрисовка кадров на canvas по скроллу
       data-cine="stack"  N полноэкранных сцен, кроссфейд или шторка
       data-cine="mask"   видео внутри букв (SVG-маска)
       data-cine="pan"    панорама с горизонтальным ходом + зерно

   ПОДКЛЮЧЕНИЕ (порядок обязателен):
       <link rel="stylesheet" href="../assets/css/cinema.css">
       <script src="../assets/vendor/gsap.min.js"></script>
       <script src="../assets/vendor/ScrollTrigger.min.js"></script>
       <script src="../assets/vendor/lenis.min.js"></script>
       <script defer src="../assets/js/cinema.js"></script>

   Полная документация разметки — assets/js/CINEMA-README.md.

   ГРАНИЦА С video-slots.js. Тот движок оживляет ВРЕЗКИ внутри статичной
   вёрстки (<template data-video>, реестр manifest.json, слот работает и
   без ролика). Этот — строит СЦЕНЫ на весь экран. Системы не пересекаются
   ни по атрибутам, ни по узлам; на одной странице спокойно живут обе.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────────────────── 0. Среда ─────────────────────────── */

  var HAS_GSAP = !!(window.gsap && window.ScrollTrigger);
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var MOBILE = !!(window.matchMedia && window.matchMedia('(max-width: 767px)').matches);
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* Без gsap хореографии нет — но страница обязана остаться читаемой.
     Считаем это режимом «движение выключено»: постеры, статичный текст. */
  if (!HAS_GSAP) REDUCE = true;

  var sections = document.querySelectorAll('[data-cine]');
  if (!sections.length) return;

  /* ──────────────────── 1. Мелкая утварь ─────────────────────────── */

  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function attr(n, k, d) { var v = n.getAttribute(k); return (v === null || v === '') ? d : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /* мягкая ступень — ею гасим и кроссфейды, и шторки: линейный переход
     виден глазом как «щелчок», сглаженный читается как склейка */
  function smooth(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

  function moveKids(from, to) { while (from.firstChild) to.appendChild(from.firstChild); }

  /* ──────────────────── 2. Общий слой медиа ──────────────────────── */

  var allVideos = [];

  function play(v) {
    if (!v) return;
    v.dataset.cineStop = '0';
    /* Со старта у неглавных роликов стоит preload="metadata" — чтобы
       страница не тянула семь файлов разом. Но как только сцена вышла на
       экран, экономить нечего: просим весь файл. Иначе на сервере с
       поддержкой Range браузер докачивает ролик мелкими кусками ВСЁ
       время воспроизведения, и эта возня идёт ровно поверх прокрутки
       (замер: 36 fps против 50) — а каждая пауза рвёт очередной кусок. */
    if (v.preload !== 'auto') v.preload = 'auto';
    var p = v.play();
    /* Отказ автоплея — политика браузера, а не наша ошибка: на экране
       остаётся постер, то есть тот же самый AI-кадр. Молчим. */
    if (p && p.catch) p.catch(function () {});
  }

  /* ПОЧЕМУ ПАУЗА ОСТОРОЖНАЯ. pause() на ролике, который ещё качается,
     обрывает range-запрос — Chrome записывает его как failed request,
     и живой прогон честно ловит это в отчёт. Пока кадров нет, пауза
     всё равно ничего не экономит: ждём первых данных и глушим тогда.

     Проверенный тупик: гасить ролики на быстром броске по скорости
     скролла. Замер показал 47/52 fps с этим механизмом против 49/54 без
     него — экономия композиции съедалась перезапусками воспроизведения,
     плюс те самые обрывы запросов. Механизм снят. */
  function whole(v) {
    var b = v.buffered;
    if (!v.duration || !isFinite(v.duration) || !b || !b.length) return false;
    return b.start(0) <= 0.05 && b.end(b.length - 1) >= v.duration - 0.15;
  }

  function stop(v) {
    if (!v || v.paused) return;
    if (whole(v)) { v.pause(); return; }
    /* Ролик докачивается — ждём. Пауза сейчас оборвала бы range-запрос
       (в отчёте живого прогона это failed request), и те же байты
       пришлось бы просить заново, когда сцена вернётся. */
    if (v.dataset.cineStop === '1') return;
    v.dataset.cineStop = '1';
    var t = setTimeout(fire, 5000);        /* сеть безнадёжна — глушим как есть */
    function fire() {
      clearTimeout(t);
      v.removeEventListener('progress', tick);
      v.removeEventListener('canplaythrough', tick);
      if (v.dataset.cineStop === '1' && !v.paused) v.pause();
      v.dataset.cineStop = '0';
    }
    function tick() { if (v.dataset.cineStop !== '1') { fire(); return; } if (whole(v)) fire(); }
    v.addEventListener('progress', tick);
    v.addEventListener('canplaythrough', tick);
  }

  /* Один наблюдатель на весь документ: четыре одновременно декодируемых
     ролика роняют fps ниже порога приёмки. Играет только то, что в кадре. */
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { if (v.paused) play(v); }
      else stop(v);
    });
  }, { rootMargin: '15% 0px' }) : null;

  function buildMedia(o) {
    var m = el('div', 'cine__media');

    /* Постер — отдельным <img>, а НЕ background-image слоя: слой всё
       время едет по scale, а фоновая картинка при каждом изменении
       масштаба растрируется заново. <img> composited как текстура и
       масштабируется на GPU бесплатно. */
    if (o.poster) {
      var ip = new Image();
      ip.className = 'cine__poster';
      ip.src = o.poster; ip.alt = ''; ip.decoding = 'async';
      ip.setAttribute('aria-hidden', 'true');
      if (o.eager) ip.fetchPriority = 'high';
      m.appendChild(ip);
    }

    /* Статичная сцена: картинка вместо ролика (data-img). */
    if (o.img) {
      var i = new Image();
      i.src = o.img; i.alt = ''; i.decoding = 'async';
      i.setAttribute('aria-hidden', 'true');
      m.appendChild(i);
      return { node: m, video: null };
    }

    var src = (MOBILE && o.srcMobile) ? o.srcMobile : o.src;
    /* Движение выключено — постер уже лежит фоном, ролик не запрашиваем
       вовсе: ни одного лишнего запроса, ни одного декодера. */
    if (REDUCE || !src) return { node: m, video: null };

    var v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.setAttribute('muted', '');
    v.loop = true; v.playsInline = true; v.setAttribute('playsinline', '');
    /* autoplay-атрибут вешаем ТОЛЬКО герою. Он отменяет preload:
       элемент с autoplay Chrome выкачивает целиком, даже если написано
       preload="metadata". Семь роликов страницы — это 7 МБ на старте и
       заметная просадка fps первые секунды. Остальные заводит
       наблюдатель вызовом play(), когда сцена подходит к экрану. */
    if (o.eager) { v.autoplay = true; v.setAttribute('autoplay', ''); }
    /* Не "metadata", а "none". Отличие видно только в сетевой панели, но
       оно принципиальное: за метаданными Chrome посылает Range bytes=0-,
       выкачивает заголовок файла и ОБРЫВАЕТ остаток — net::ERR_ABORTED
       на каждый ролик страницы, ещё до единого касания скролла. Это не
       наша ошибка, а штатное поведение preload="metadata", но в отчёте
       живого прогона оно неотличимо от настоящей битой ссылки.
       С "none" запрос не уходит вовсе: первым и единственным будет
       честный полный запрос из play(), где preload уже "auto". */
    v.preload = o.eager ? 'auto' : 'none';
    v.controls = false;
    v.disablePictureInPicture = true;
    v.setAttribute('disableremoteplayback', '');
    v.setAttribute('aria-hidden', 'true');
    v.tabIndex = -1;
    /* poster-атрибут не ставим: тот же кадр уже лежит <img>-ом ниже,
       а атрибут заставил бы браузер декодировать его второй раз. */
    /* Источник — прямо в src. <source> на отсутствующий файл НЕ
       откатывается ни к чему: браузер просто оставляет пустой экран. */
    v.src = src;

    /* Как только ролик пошёл — гасим постер под ним (класс на слое, CSS
       уводит постер в visibility:hidden с задержкой на время проявления).
       Иначе в каждом слое лежат ДВЕ полноэкранные текстуры, и композитор
       смешивает обе на каждом кадре: замер дал 45 fps против 54. */
    function live() { v.classList.add('is-live'); m.classList.add('is-live'); }
    /* Не ждём 'playing': достаточно первого декодированного кадра. Он и
       есть постер, так что подмена невидима, а слой освобождается на
       полсекунды раньше — на быстрой прокрутке это единственный шанс
       успеть снять постер до того, как сцена уйдёт с экрана. */
    v.addEventListener('loadeddata', live);
    v.addEventListener('playing', live);
    v.addEventListener('error', function () { v.classList.remove('is-live'); m.classList.remove('is-live'); });

    m.appendChild(v);
    allVideos.push(v);
    if (o.gate) v.dataset.cineGate = '1';      /* сценой управляет stack */
    else if (io) io.observe(v); else play(v);
    return { node: m, video: v };
  }

  function scrim(kind) {
    if (!kind || kind === 'none') return null;
    return el('div', 'cine__scrim cine__scrim--' + kind);
  }
  /* Зерно шевелится только пока сцена в кадре. Анимация, крутящаяся за
     экраном, стоит ровно столько же, сколько видимая, — а платит за неё
     весь документ (замер: 28 fps на герое из-за зерна в пятой секции). */
  var grainIO = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { e.target.classList.toggle('is-on', e.isIntersecting); });
  }, { rootMargin: '5% 0px' }) : null;

  function grain(sec) {
    if (!sec.hasAttribute('data-grain')) return [];
    var g = el('div', 'cine__grain');
    if (grainIO && !REDUCE) grainIO.observe(g); else if (!REDUCE) g.classList.add('is-on');
    var out = [g];
    if (attr(sec, 'data-grain', '') !== 'flat') out.push(el('div', 'cine__vig'));
    return out;
  }

  /* ──────────────────── 3. Прогресс по скроллу ───────────────────── */

  function track(trigger, start, end, fn) {
    if (REDUCE) { fn(0); return null; }
    var st = window.ScrollTrigger.create({
      trigger: trigger, start: start, end: end,
      onUpdate: function (s) { fn(s.progress); },
      onRefresh: function (s) { fn(s.progress); }
    });
    fn(st.progress || 0);
    return st;
  }

  /* Пин — CSS sticky, а не ScrollTrigger.pin. Sticky не переносит узел в
     спейсер и не требует refresh, поэтому на границе секции нет ни шва,
     ни скачка, а обратный скролл зеркален по определению. ScrollTrigger
     здесь занят одним делом — считает прогресс. */
  function mountPin(sec, length) {
    if (length) sec.style.height = length;
    var pin = el('div', 'cine-pin');
    moveKids(sec, pin);
    sec.appendChild(pin);
    return pin;
  }

  /* Строка-подпись, въезжающая снизу из-под маски. Классом, а не GSAP:
     инлайновый transform от GSAP убил бы CSS-переход, а сам GSAP прочёл
     бы CSS translateY(112%) как y в пикселях. */
  function riseOn(node, on) {
    if (!node) return;
    node.classList.toggle('is-on', !!on);
  }
  function wrapRise(node) {
    if (!node || node.dataset.cineRise) return node;
    node.dataset.cineRise = '1';
    var kids = Array.prototype.slice.call(node.children);
    kids.forEach(function (k) {
      if (k.classList.contains('cine-rise')) return;
      var w = el('span', 'cine-rise');
      node.insertBefore(w, k);
      w.appendChild(k);
      /* Отступы переезжают со строки на её маску. Иначе маска выше самой
         строки на величину margin, а прячем мы строку сдвигом на 112 % от
         ЕЁ высоты — и капитель с margin-bottom: 22px уходит вниз всего на
         15px, оставаясь в кадре. Ровно так на склейке стопки под новой
         подписью торчала старая. */
      var cs = window.getComputedStyle(k);
      var mt = cs.marginTop, mb = cs.marginBottom;
      if (mt !== '0px') { w.style.marginTop = mt; k.style.marginTop = '0'; }
      if (mb !== '0px') { w.style.marginBottom = mb; k.style.marginBottom = '0'; }
    });
    return node;
  }
  function riseAll(node, on) {
    if (!node) return;
    var w = node.querySelectorAll('.cine-rise');
    for (var i = 0; i < w.length; i++) {
      var t = w[i];
      /* лёгкий каскад: строки приходят друг за другом, а не пачкой.
         Уходят — все разом и без задержки, чтобы освободить место. */
      t.style.transitionDelay = on ? (i * 90) + 'ms' : '0ms';
      t.classList.toggle('is-on', !!on);
    }
  }

  /* ═══════════════════ ПРИМИТИВ 1 · HERO ═══════════════════════════
     Полноэкранный кадр, текст на своём поле внизу под скримом.
     По скроллу кадр наезжает (1 → 1.08) и чуть отстаёт, текст уходит
     вверх и растворяется — эффект «камера осталась, мы поехали». */

  function initHero(sec) {
    sec.classList.add('cine', 'cine-hero');
    if (attr(sec, 'data-align', 'left') === 'center') sec.classList.add('cine-hero--center');

    var inner = el('div', 'cine-hero__in');
    moveKids(sec, inner);

    var media = buildMedia({
      src: attr(sec, 'data-src', ''),
      srcMobile: attr(sec, 'data-src-mobile', ''),
      poster: attr(sec, 'data-poster', ''),
      img: attr(sec, 'data-img', ''),
      eager: true                       /* герой — первый экран, грузим сразу */
    });

    var stage = el('div', 'cine__stage');
    stage.appendChild(media.node);
    var sc = scrim(attr(sec, 'data-scrim', 'bottom'));
    if (sc) stage.appendChild(sc);
    grain(sec).forEach(function (g) { stage.appendChild(g); });
    stage.appendChild(inner);

    if (sec.hasAttribute('data-hint')) {
      var hint = el('span', 'cine-hero__scroll');
      hint.appendChild(el('i'));
      hint.appendChild(document.createTextNode(attr(sec, 'data-hint', 'Листайте')));
      stage.appendChild(hint);
    }
    sec.appendChild(stage);

    wrapRise(inner);
    requestAnimationFrame(function () { riseAll(inner, true); });

    track(sec, 'top top', 'bottom top', function (p) {
      media.node.style.transform =
        'translate3d(0,' + (p * 4).toFixed(3) + '%,0) scale(' + (1 + p * 0.08).toFixed(4) + ')';
      inner.style.transform = 'translate3d(0,' + (-p * 88).toFixed(2) + 'px,0)';
      inner.style.opacity = String(clamp01(1 - p * 1.25));
    });
  }

  /* ═══════════════════ ПРИМИТИВ 2 · SCRUB ══════════════════════════
     Пин + последовательность WebP-кадров на canvas.

     Почему не <video currentTime>: браузер на каждый сдвиг ищет ключевой
     кадр и декодирует до нужного — на скролле это рывки. Эталоны
     (Apple AirPods, Ferrari) рисуют заранее нарезанные картинки.
     Нарезка: node tools/img/frames.js <in.mp4> <outDir> [count] [height]. */

  function initScrub(sec) {
    sec.classList.add('cine', 'cine-scrub');
    var dir = attr(sec, 'data-frames', '');
    if (dir && dir.slice(-1) !== '/') dir += '/';

    var caps = el('div', 'cine-scrub__caps');
    moveKids(sec, caps);

    var pin = mountPin(sec, attr(sec, 'data-length', '300vh'));

    /* Кадр живёт в своём окне, а не прямо в пине: при выключенном
       движении пин вытягивается под подписи, и постер, будь он фоном
       пина, растёкся бы ковром под текстом. */
    var stage = el('div', 'cine-scrub__stage');
    var poster = attr(sec, 'data-poster', '');
    if (poster) {
      var ip = new Image();
      ip.className = 'cine__poster';
      ip.src = poster; ip.alt = ''; ip.decoding = 'async';
      ip.setAttribute('aria-hidden', 'true');
      stage.appendChild(ip);
    }
    var cv = el('canvas', 'cine-scrub__cv');
    cv.setAttribute('aria-hidden', 'true');
    stage.appendChild(cv);
    pin.appendChild(stage);
    pin.appendChild(caps);

    var rail = null;
    if (!sec.hasAttribute('data-no-rail')) {
      rail = el('div', 'cine-rail'); rail.appendChild(el('i'));
      pin.appendChild(rail);
    }
    var railBar = rail ? rail.firstChild : null;

    /* --- подписи-хотспоты ------------------------------------------ */
    var hots = [];
    Array.prototype.forEach.call(caps.querySelectorAll('[data-at]'), function (c) {
      var m = /([\d.]+)\s*[-–]\s*([\d.]+)/.exec(c.getAttribute('data-at'));
      if (!m) return;
      hots.push({ node: c, a: parseFloat(m[1]), b: parseFloat(m[2]), on: null });
    });
    function hotAt(p) {
      for (var i = 0; i < hots.length; i++) {
        var h = hots[i], on = (p >= h.a && p <= h.b);
        if (h.on !== on) { h.on = on; h.node.classList.toggle('is-on', on); }
      }
    }
    if (REDUCE) { hots.forEach(function (h) { h.node.classList.add('is-on'); }); }

    /* --- canvas ----------------------------------------------------- */
    var ctx = cv.getContext('2d', { alpha: false });
    var frames = [], count = 0, pad = 3, pattern = 'f-{i}.webp';
    var shown = -1, want = 0, ready = false;

    function url(i) { return dir + pattern.replace('{i}', String(i).padStart(pad, '0')); }

    function size() {
      /* меряем сам канвас, а не пин: в режиме reduce канвас перестаёт
         быть absolute-заливкой и живёт своей высотой */
      var r = cv.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width * DPR));
      var h = Math.max(1, Math.round(r.height * DPR));
      if (cv.width === w && cv.height === h) return;
      cv.width = w; cv.height = h;
      shown = -1;
      paint();
    }

    function nearest(i) {
      if (frames[i]) return frames[i];
      for (var d = 1; d < count; d++) {
        if (frames[i - d]) return frames[i - d];
        if (frames[i + d]) return frames[i + d];
      }
      return null;
    }

    function paint() {
      var img = nearest(want);
      if (!img) return;
      /* cover-fit: кадр всегда закрывает пин целиком, без полей */
      var cw = cv.width, ch = cv.height;
      var s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      var w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      /* Канвас лёг — постер под ним больше не нужен, и держать его в
         композиции значит платить за вторую полноэкранную текстуру. */
      if (!ready) { ready = true; cv.classList.add('is-on'); stage.classList.add('is-live'); }
    }

    /* Порядок загрузки — грубым проходом, а не подряд: сначала каждый
       16-й кадр, потом 8-й, 4-й… Через полсекунды вся длина уже
       «покрыта» — куда бы ни прыгнул скролл, ближайший кадр есть. */
    function buildQueue(n, stride) {
      var seen = new Uint8Array(n), q = [];
      q.push(0); seen[0] = 1;
      for (var step = 16; step >= 1; step >>= 1) {
        for (var i = 0; i < n; i += step) {
          if (i % stride) continue;
          if (!seen[i]) { seen[i] = 1; q.push(i); }
        }
      }
      return q;
    }

    function start(meta) {
      count = meta.count; pad = meta.pad || 3; pattern = meta.pattern || pattern;
      if (!count) return;

      /* Движение выключено — вся хореография сводится к одному кадру.
         Качать ради него ещё 95 картинок было бы издевательством. */
      if (REDUCE) {
        size();
        var im0 = new Image();
        im0.onload = function () { frames[0] = im0; paint(); };
        im0.src = url(0);
        if ('ResizeObserver' in window) new ResizeObserver(size).observe(cv);
        return;
      }

      /* Мобильный: берём каждый второй кадр — вдвое меньше трафика,
         разницы на 390 px глазом не видно (ближайший кадр рисуется). */
      var stride = MOBILE ? 2 : 1;
      var q = buildQueue(count, stride);
      var qi = 0, inflight = 0, MAX = 6;

      function pump() {
        while (inflight < MAX && qi < q.length) load(q[qi++]);
      }
      function load(i) {
        inflight++;
        var im = new Image();
        im.decoding = 'async';
        im.onload = function () {
          frames[i] = im; inflight--;
          if (i === want || shown < 0) { shown = want; paint(); }
          pump();
        };
        im.onerror = function () { inflight--; pump(); };
        im.src = url(i);
      }
      size();
      /* Первый кадр — вне очереди и в одиночку: он должен появиться
         мгновенно, до того как начнётся пачечная загрузка. */
      load(0);
      setTimeout(pump, 60);

      if ('ResizeObserver' in window) new ResizeObserver(size).observe(cv);
      else window.addEventListener('resize', size);

      track(sec, 'top top', 'bottom bottom', function (p) {
        hotAt(p);
        if (railBar) railBar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
        var i = Math.round(p * (count - 1));
        if (i === shown) return;
        want = i; shown = i; paint();
      });
    }

    /* Паспорт последовательности — из index.json (его пишет frames.js).
       Можно и без файла: data-count / data-pad прямо в разметке. */
    var inlineCount = parseInt(attr(sec, 'data-count', ''), 10);
    if (inlineCount) {
      start({ count: inlineCount, pad: parseInt(attr(sec, 'data-pad', '3'), 10), pattern: attr(sec, 'data-pattern', pattern) });
    } else if (dir && window.fetch) {
      fetch(dir + 'index.json', { cache: 'force-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j) start(j); })
        .catch(function () { /* нет реестра — на пине остаётся постер */ });
    }
  }

  /* ═══════════════════ ПРИМИТИВ 3 · STACK ══════════════════════════
     N полноэкранных сцен друг на друге. По скроллу сцена сменяется
     кроссфейдом с лёгким наездом или шторкой clip-path.
     Играют только текущая и следующая: остальные на паузе. */

  function initStack(sec) {
    sec.classList.add('cine', 'cine-stack');
    var mode = attr(sec, 'data-transition', 'fade');
    var scenes = Array.prototype.slice.call(sec.querySelectorAll('.cine-scene'));
    if (!scenes.length) return;
    var N = scenes.length;

    var pin = mountPin(sec, attr(sec, 'data-length', (N * 100 + 100) + 'vh'));

    var vids = [];
    scenes.forEach(function (s, i) {
      s.style.zIndex = String(10 + i);
      var media = buildMedia({
        src: attr(s, 'data-src', ''),
        srcMobile: attr(s, 'data-src-mobile', ''),
        poster: attr(s, 'data-poster', ''),
        img: attr(s, 'data-img', ''),
        gate: true                      /* воспроизведением рулит stack */
      });
      vids[i] = media.video;
      s.insertBefore(media.node, s.firstChild);
      var sc = scrim(attr(s, 'data-scrim', attr(sec, 'data-scrim', 'bottom')));
      if (sc) s.insertBefore(sc, media.node.nextSibling);
      grain(sec).forEach(function (g) { s.insertBefore(g, media.node.nextSibling); });
      wrapRise(s.querySelector('.cine-scene__line'));
    });

    var counter = null;
    if (!sec.hasAttribute('data-no-count') && N > 1) {
      counter = el('span', 'cine-count');
      counter.innerHTML = '<b>01</b> / ' + String(N).padStart(2, '0');
      pin.appendChild(counter);
    }

    if (REDUCE) {
      scenes.forEach(function (s) { riseAll(s.querySelector('.cine-scene__line'), true); });
      return;
    }

    var cur = -1, playA = -1, playB = -1;

    function apply(p) {
      var local = clamp01(p) * N;
      var i = Math.min(N - 1, Math.floor(local));
      var f = local - i;                       /* 0…1 внутри сцены */
      /* Склейка занимает последнюю треть сцены: раньше — кадр «дышит»
         наездом, и только потом уступает место следующему. */
      var k = smooth(0.68, 1.0, f);
      var nxt = Math.min(N - 1, i + 1);

      for (var s = 0; s < N; s++) {
        var node = scenes[s], op, sc = 1, clip = '';
        if (s < i) { op = 0; }
        else if (s === i) {
          op = 1;
          sc = lerp(1, 1.07, f);
        } else if (s === nxt && nxt !== i) {
          op = (mode === 'fade') ? k : (k > 0 ? 1 : 0);
          sc = lerp(1.05, 1, k);
          if (mode === 'wipe-up') clip = 'inset(' + ((1 - k) * 100).toFixed(2) + '% 0% 0% 0%)';
          else if (mode === 'wipe-left') clip = 'inset(0% 0% 0% ' + ((1 - k) * 100).toFixed(2) + '%)';
        } else { op = 0; }

        if (node.__op !== op) { node.__op = op; node.style.opacity = String(op); }
        var tr = 'scale(' + sc.toFixed(4) + ')';
        if (node.__tr !== tr) { node.__tr = tr; node.querySelector('.cine__media').style.transform = tr; }
        if (node.__cl !== clip) { node.__cl = clip; node.style.clipPath = clip || 'none'; }
        /* Невидимую сцену выключаем из композиции целиком — иначе
           браузер продолжает её растрировать и fps проседает. */
        node.style.visibility = op > 0.002 ? 'visible' : 'hidden';
      }

      /* Строку передаём в тот же миг, когда началась склейка, а не на её
         середине: иначе подпись уходящей сцены ещё стоит, а подпись
         приходящей уже въехала — две капители друг на друге. Уход при
         этом вдвое быстрее прихода (см. .cine-rise:not(.is-on) в CSS). */
      var active = (k > 0.02) ? nxt : i;
      if (active !== cur) {
        if (cur >= 0) riseAll(scenes[cur].querySelector('.cine-scene__line'), false);
        cur = active;
        riseAll(scenes[cur].querySelector('.cine-scene__line'), true);
        if (counter) counter.innerHTML = '<b>' + String(cur + 1).padStart(2, '0') + '</b> / ' + String(N).padStart(2, '0');
      }

      /* Играет ровно ОДИН ролик — и лишь на время склейки два. Два
         одновременных полноэкранных видео стоят вдвое дороже одного,
         а видно из них всё равно только верхнее. */
      /* Порог 0.3, а не 0: при k = 0.05 приходящая сцена ещё практически
         прозрачна, и второй полноэкранный ролик крутится вхолостую —
         платим за него полной ценой композиции, не показывая ничего. */
      var b = (k > 0.3 && nxt !== i) ? nxt : -1;
      if (i !== playA || b !== playB) {
        playA = i; playB = b;
        for (var v = 0; v < N; v++) {
          if (!vids[v]) continue;
          if (v === playA || v === playB) play(vids[v]); else stop(vids[v]);
        }
      }
    }

    apply(0);
    track(sec, 'top top', 'bottom bottom', apply);

    /* Секция ушла с экрана — глушим все её ролики разом. */
    if (io) {
      var sio = new IntersectionObserver(function (es) {
        var on = es[0].isIntersecting;
        if (!on) { vids.forEach(stop); playA = playB = -1; }
        else if (vids[cur]) play(vids[cur]);
      }, { rootMargin: '30% 0px' });   /* запас на буферизацию до входа */
      sio.observe(sec);
    }
  }

  /* ═══════════════════ ПРИМИТИВ 4 · MASK ═══════════════════════════
     Видео внутри букв. Технически — не маска на видео, а плашка цвета
     сцены поверх него, из которой вырезаны буквы: так надпись остаётся
     настоящим SVG-текстом, а фолбэк сводится к снятию одного класса. */

  function initMask(sec) {
    sec.classList.add('cine', 'cine-mask');
    var text = attr(sec, 'data-text', '1888');
    if (attr(sec, 'data-bg', 'ink') === 'stone') sec.classList.add('cine--stone');

    var note = el('div', 'cine-mask__note');
    moveKids(sec, note);

    var media = buildMedia({
      src: attr(sec, 'data-src', ''),
      srcMobile: attr(sec, 'data-src-mobile', ''),
      poster: attr(sec, 'data-poster', ''),
      img: attr(sec, 'data-img', '')
    });

    var stage = el('div', 'cine-mask__stage');
    stage.appendChild(media.node);

    var uid = 'cine-m-' + Math.random().toString(36).slice(2, 8);
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'cine-mask__cut');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML =
      '<defs><mask id="' + uid + '" maskUnits="userSpaceOnUse">' +
        '<rect x="0" y="0" width="100%" height="100%" fill="#fff"/>' +
        '<text class="cine-mask__t" x="50%" y="50%" text-anchor="middle" ' +
              'dominant-baseline="central" fill="#000">' + text + '</text>' +
      '</mask></defs>' +
      /* Цвет плашки — классом, а НЕ атрибутом fill="var(--c-ink)":
         var() в презентационных атрибутах SVG не работает, и заливка
         молча схлопнулась бы в чистый #000 — запрещённый конституцией. */
      '<rect class="cine-mask__plate" x="0" y="0" width="100%" height="100%" mask="url(#' + uid + ')"/>';

    /* Скрим под плашкой не нужен: плашка И ЕСТЬ поле для текста. */
    stage.appendChild(svg);
    grain(sec).forEach(function (g) { stage.appendChild(g); });

    var fb = el('div', 'cine-mask__fallback');
    fb.textContent = text;
    stage.appendChild(fb);
    stage.appendChild(note);
    sec.appendChild(stage);
    /* Настоящая надпись для читалок и поиска — вырез в SVG для них нем. */
    var sr = el('span'); sr.textContent = text;
    sr.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);';
    sec.appendChild(sr);

    wrapRise(note);
    if (REDUCE) { riseAll(note, true); return; }

    var len = attr(sec, 'data-length', '');
    if (len) sec.style.height = len;
    if (len) {
      var kids = Array.prototype.slice.call(sec.children);
      var pin = el('div', 'cine-pin');
      kids.forEach(function (k) { pin.appendChild(k); });
      sec.appendChild(pin);
    }

    /* Кадр наезжает медленно — буквы стоят, движется только то, что
       видно сквозь них. Это и читается как «вино внутри года». */
    var shownNote = false;
    track(sec, 'top bottom', 'bottom top', function (p) {
      media.node.style.transform = 'scale(' + lerp(1.14, 1.0, clamp01(p * 1.35)).toFixed(4) + ')';
      var on = p > 0.28 && p < 0.92;
      if (on !== shownNote) { shownNote = on; riseAll(note, on); }
    });
  }

  /* ═══════════════════ ПРИМИТИВ 5 · PAN ════════════════════════════
     Панорама: кадр шире экрана, по скроллу едет по горизонтали и
     одновременно чуть отъезжает. Зерно и виньетка — отдельными слоями:
     filter на секцию создал бы новый контекст композиции и убил fps. */

  function initPan(sec) {
    sec.classList.add('cine', 'cine-pan');
    var shift = parseFloat(attr(sec, 'data-shift', '12')) || 12;
    var wide = parseFloat(attr(sec, 'data-wide', '128')) || 128;
    sec.style.setProperty('--c-pan-w', wide + '%');

    var inner = el('div', 'cine-pan__in');
    moveKids(sec, inner);

    var media = buildMedia({
      src: attr(sec, 'data-src', ''),
      srcMobile: attr(sec, 'data-src-mobile', ''),
      poster: attr(sec, 'data-poster', ''),
      img: attr(sec, 'data-img', '')
    });

    var pin = mountPin(sec, REDUCE ? '' : attr(sec, 'data-length', '220vh'));
    pin.appendChild(media.node);
    var sc = scrim(attr(sec, 'data-scrim', 'bottom'));
    if (sc) pin.appendChild(sc);
    if (!sec.hasAttribute('data-grain')) sec.setAttribute('data-grain', '');
    grain(sec).forEach(function (g) { pin.appendChild(g); });
    pin.appendChild(inner);

    wrapRise(inner);
    if (REDUCE) { riseAll(inner, true); return; }

    var shownIn = false;
    track(sec, 'top top', 'bottom bottom', function (p) {
      var x = lerp(shift, -shift, p);
      media.node.style.transform =
        'translate3d(calc(-50% + ' + x.toFixed(3) + 'vw),0,0) scale(' + lerp(1.06, 1.0, p).toFixed(4) + ')';
      var on = p > 0.12;
      if (on !== shownIn) { shownIn = on; riseAll(inner, on); }
    });
  }

  /* ─────────────────────── 4. Запуск ─────────────────────────────── */

  var KIND = { hero: initHero, scrub: initScrub, stack: initStack, mask: initMask, pan: initPan };

  if (HAS_GSAP) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    /* Lenis заводим только если страница не завела свой: два инерционных
       скролла на одном документе дерутся за колесо и дают дребезг. */
    if (!REDUCE && window.Lenis && !window.lenis) {
      var lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
      lenis.on('scroll', window.ScrollTrigger.update);
      window.gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      window.gsap.ticker.lagSmoothing(0);
      window.lenis = lenis;
    }
  }

  Array.prototype.forEach.call(sections, function (sec) {
    var fn = KIND[sec.getAttribute('data-cine')];
    if (!fn) return;
    try { fn(sec); }
    catch (e) { if (window.console) console.warn('[cinema] ' + sec.getAttribute('data-cine') + ': ' + e.message); }
  });

  if (HAS_GSAP) {
    /* Cormorant подменяется после первой отрисовки и двигает высоты —
       без пересчёта пины поехали бы на пол-экрана мимо. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { window.ScrollTrigger.refresh(); });
    }
    window.addEventListener('load', function () { window.ScrollTrigger.refresh(); });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) allVideos.forEach(function (v) { if (!v.paused) v.pause(); });
  });

  window.Cinema = {
    reduce: REDUCE,
    mobile: MOBILE,
    videos: allVideos,
    refresh: function () { if (HAS_GSAP) window.ScrollTrigger.refresh(); }
  };
  document.documentElement.classList.add('cine-ready');

})();

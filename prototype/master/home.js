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

  /* ГЕЙТ «СЕКЦИЯ В КАДРЕ» × «ФРОНТ ТАКТА» — один на все событийные ролики.
     Прогресс от track() сам по себе НЕ доказывает, что зритель у секции:
     ScrollTrigger.refresh() (его зовут приход реестра, готовность шрифтов,
     load и ресайз) прогоняет onRefresh в любой момент, и триггер честно
     отдаёт крайнее значение — 0, если секция ниже зрителя, 1, если выше.
     Отсюда обе дыры: такт 1 «Лозы» заводился фронтом set(0), пока зритель
     ещё наверху (к его приходу ролик доигрывал и стоял на последнем кадре,
     а set(0) не перематывал — cur уже 0); симметрично refresh со дна
     страницы дал бы set(true) «Брюту» и макро тиснения — событие в пустоту.
     Наблюдатель после этого молчит: состояние пересечения не менялось.

     Поэтому наблюдатель здесь СТАРШЕ трека. Пока секция вне кадра, сцене
     отдаётся idle (глушим и сбрасываем состояние в «нет такта»), а
     запрошенное значение только запоминается. Секция вошла в кадр —
     запомненное приходит фронтом, и событие стартует с нуля ровно на входе.
     Внутри секции гейт открыт и ничего не меняет: фронт по-прежнему считает
     сама сцена, поэтому обратный ход не перезапускает ролик на каждом пикселе. */
  function gateVis(sec, idle, apply) {
    if (!window.IntersectionObserver) return apply;
    var vis = false, want = idle;
    new IntersectionObserver(function (es) {
      var on = es[es.length - 1].isIntersecting;
      if (on === vis) return;
      vis = on;
      apply(on ? want : idle);
    }, { rootMargin: '0px' }).observe(sec);
    return function (w) { want = w; apply(vis ? w : idle); };
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

  /* Скрабится ли ИМЕННО ЭТОТ файл в этом слоте. Атрибут — список имён (как у
     data-v-once), потому что скраб осмыслен только для мастера, снятого под
     скраб: у фолбэка barrel-gallery ни плотных ключевых кадров, ни сюжета,
     привязанного к годам, и он обязан остаться обычной петлёй (§ 6.4 наряда —
     пока мастера нет, сцена живёт как сегодня). Пустое значение = весь слот. */
  function scrubbed(slot, file) {
    var a = slot.getAttribute('data-v-scrub');
    if (a === null) return false;
    var сп = a.trim() ? a.trim().split(/\s+/) : null;
    return !сп || сп.indexOf(String(file).replace(/\.mp4$/, '')) >= 0;
  }

  function mountVideo(slot, file) {
    var v = document.createElement('video');
    v.className = 'vslot__v';
    v.muted = true; v.defaultMuted = true; v.setAttribute('muted', '');
    v.playsInline = true; v.setAttribute('playsinline', '');
    /* Ролик-СОБЫТИЕ (data-v-once) — пролёт с началом и концом, а не петля.
       Зациклить его значит каждые восемь секунд бить зрителя склейкой
       «море → снова террасы». Доиграл — держит последний кадр (браузер
       оставляет его на экране сам). Когда сцена показывает слайд заново,
       play() по спецификации перематывает на нуль и пролёт идёт сначала.

       У атрибута ЕСТЬ ЗНАЧЕНИЕ — это список имён, и событием считается
       только смонтированное из них; остальная цепочка остаётся петлёй.
       Понадобилось на слайде «Чёрного Доктора»: там в одной цепочке живут
       и событие (w-chd-keeper, хранитель уходит — назад его не отмотать),
       и петля-фолбэк (cellar-candles). Прежний флаг на весь слот снял бы
       loop и с петли, и фолбэк замер бы на последнем кадре.
       Пустое значение работает как прежде — «весь слот событие». */
    var once = slot.getAttribute('data-v-once');
    var список = once ? once.trim().split(/\s+/) : null;
    /* Ролик-СКРАБ (data-v-scrub) — третий режим рядом с петлёй и событием.
       Ни loop, ни автостарт: ролик монтируется, прогревается и остаётся на
       паузе, а currentTime пишет сцена из прогресса скролла. data-gate тут
       не подходит — гейт ЗАВОДИТ ролик по наблюдателю, а заводить не надо,
       надо только подготовить. Значение читается тем же списком имён, что у
       data-v-once: скрабится только мастер, хвост цепочки остаётся петлёй. */
    v.loop = scrubbed(slot, file) ? false
           : once === null ? true
           : (список && список.length ? список.indexOf(file.replace(/\.mp4$/, '')) < 0 : false);
    v.controls = false; v.disablePictureInPicture = true;
    v.setAttribute('aria-hidden', 'true'); v.setAttribute('tabindex', '-1');
    /* Скрабу нужен не паспорт, а данные: на preload=metadata первая перемотка
       даёт чёрный кадр (§ 6.3 п.8 наряда). */
    v.preload = (slot.hasAttribute('data-eager') || scrubbed(slot, file)) ? 'auto' : 'metadata';
    var pos = slot.getAttribute('data-poster');
    if (pos) v.poster = VDIR + 'poster/' + pos + '.webp';
    v.src = VDIR + file;
    v.addEventListener('playing', function () { v.classList.add('is-live'); });
    v.addEventListener('loadeddata', function () { v.classList.add('is-live'); });
    v.addEventListener('error', function () { v.classList.remove('is-live'); });
    v._scrub = scrubbed(slot, file);
    slot.appendChild(v);
    slot._v = v;
    VIDEOS.push(v);
    /* сцена может держать на детях слота свою анимацию — сообщаем о новом */
    document.dispatchEvent(new CustomEvent('home:slot-mounted', { detail: slot }));
    return v;
  }
  function playV(v) {
    /* Дорожку-скраб не заводит НИКТО — ни прогрев, ни наблюдатель, ни кнопка
       паузы (она снимает паузу вызовом playV по всему списку VIDEOS).
       Предохранитель стоит здесь, а не у каждого вызова: точек входа пять. */
    if (!v || paused || v._scrub) return;
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

  /* ── ПРАВИЛО ОКОНЧАНИЯ СОБЫТИЯ ──────────────────────────────────────
     «Видео резко останавливается на стоп-кадре — выглядит старомодно.»
     Ролик и не останавливается: последнюю секунду он ТОРМОЗИТ по ease-out
     (движение оседает, как оседает настоящая жидкость), и на торможении
     в него ВЪЕЗЖАЕТ кадр-держатель — резкая фотография ровно того же
     кадра. Движение садится в фотографию, а не обрывается о неё.
     Наряды 06-glass.md § 4 и 07-brut.md § 4, числа оттуда же.

     Цикл висит на кадрах ВИДЕО (requestVideoFrameCallback), а не на
     скролле: playbackRate, записанный из обработчика скролла, дрожит на
     каждом пикселе. Ниже 0,25 не опускаемся — при 24 fps это уже кадр
     длиной 0,2–0,4 с, и торможение читается «ступеньками».             */
  var TAIL = 0.9, FADE = 0.4, RATE_MIN = 0.25;

  /* Кадр-держатель годится ТОЛЬКО тому ролику, из которого он вырезан.
     Атрибут — список имён, как у data-v-once: если реестр отдал старый
     фолбэк (pour-crown, cork-pop), держатель молчит и ролик держит свой
     последний кадр сам, ровно как до пересъёмки. */
  function holdOf(slot) {
    var img = slot.querySelector('.vslot__hold');
    if (!img) return null;
    var a = slot.getAttribute('data-v-hold');
    var сп = a && a.trim() ? a.trim().split(/\s+/) : null;
    if (сп && сп.indexOf(String(slot._file || '').replace(/\.mp4$/, '')) < 0) return null;
    return img;
  }

  /* Цикл торможения помечен ТОКЕНОМ, а не флагом «идёт/не идёт». Флаг
     решает первую беду (settle() вызвана дважды — скорость дёргается),
     но заводит вторую: сцена ставит ролик на паузу, кадров больше нет,
     rVFC не приходит — и флаг остаётся поднятым навсегда, а на обратном
     ходе торможение уже не заводится. Токен снимает обе: новый цикл
     обесценивает старый, а зависший обработчик, когда доберётся, увидит
     чужой номер и тихо уйдёт. */
  function settle(v, hold) {
    if (!v) return;
    var id = (v._sid = (v._sid || 0) + 1);
    v._hold = hold || null;
    /* Добить держатель обязан СОБЫТИЕ ended, а не цикл. Кончился ролик —
       кадров больше нет, и последний requestVideoFrameCallback не придёт
       никогда: замерено, держатель застревал на 0,89 и не начинал дышать. */
    if (!v._fin) {
      v._fin = function () {
        var h = v._hold;
        if (h) { h.style.opacity = '1'; h.classList.add('is-breathing'); }
        v.pause();
      };
      v.addEventListener('ended', function () { v._fin(); });
    }
    (function step() {
      if (id !== v._sid || !v.parentNode || paused) return;
      var d = v.duration || 0;
      if (d) {
        var k = (v.currentTime - (d - TAIL)) / TAIL;
        k = k < 0 ? 0 : k > 1 ? 1 : k;
        v.playbackRate = 1 - (1 - RATE_MIN) * (1 - Math.pow(1 - k, 3));
        if (hold) {
          var f = (v.currentTime - (d - FADE)) / FADE;
          hold.style.opacity = String(f < 0 ? 0 : f > 1 ? 1 : f);
          if (f > 0) v.classList.add('is-settling');
        }
      }
      /* Декодер освобождается: по замерам slots3 каждый живой стоит
         1–2 fps на длинной странице. Держатель дальше дышит сам. */
      if (v.ended) { v._fin(); return; }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    })();
  }

  /* Вернулись в сцену сверху или снизу — событие играет ЗАНОВО. Без сброса
     держателя он остался бы висеть поверх заново запущенного ролика, и
     зритель увидел бы стоп-кадр вместо события (кадр slots3/15). */
  function replay(v, hold) {
    if (!v) return;
    if (hold) { hold.style.opacity = ''; hold.classList.remove('is-breathing'); }
    v.classList.remove('is-settling');
    v.playbackRate = 1;
    try { v.currentTime = 0; } catch (e) {}
    playV(v); settle(v, hold);
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

  /* ПРОГРЕВ СКРАБА — «подготовить, но не заводить». Обычный warmUp крутит
     декодер через play() на 420 мс; дорожке-скрабу этого делать нельзя, она
     не должна тронуться с места ни на кадр. Достаточно дождаться readyState
     ≥ 2 (HAVE_CURRENT_DATA), иначе первая перемотка даст чёрный кадр, и
     сказать сцене, что можно писать currentTime. До этого на пине стоит
     .vslot__still, а у самого <video> — постер. */
  function warmScrub(slot) {
    var v = slot._v || ensure(slot);
    if (!v) return;
    function готов() {
      if (slot._ready) return;
      slot._ready = true;
      document.dispatchEvent(new CustomEvent('home:scrub-ready', { detail: slot }));
    }
    if (v.readyState >= 2) { готов(); return; }
    v.addEventListener('loadeddata', готов, { once: true });
    v.addEventListener('canplay', готов, { once: true });
    if (document.documentElement.dataset.b3d === 'pending') {
      document.addEventListener('home:b3d-done', function () { try { v.load(); } catch (e) {} }, { once: true });
    } else { try { v.load(); } catch (e) {} }
  }

  function initSlots(reg) {
    var ready = (reg && reg.ready) || [];
    var files = (reg && reg.files) || {};
    var lazy   = [];  /* ролики, которыми управляет наблюдатель */
    var gated  = [];  /* ролики, которыми управляет сама сцена  */
    var scrubs = [];  /* ролики-дорожки: играть нельзя, только перематывать */

    $$('.vslot').forEach(function (slot) {
      /* ПУСТОЙ data-v-m — «на мобиле видео нет вовсе», слот живёт стиллом.
         Просто не написать атрибут нельзя: его отсутствие означает «играй
         десктопную цепочку», и на телефоне завелись бы все четыре такта
         «Лозы» сразу — четыре декодера на 390 px не окупаются. */
      var mob  = slot.getAttribute('data-v-m');
      var list = (MOB && mob !== null) ? mob : (slot.getAttribute('data-v') || '');
      var file = null;
      list.split('|').forEach(function (name) {
        if (file || !name) return;
        var f = files[name] || files[name + '.mp4'];
        if (!f && ready.indexOf(name) >= 0) f = name;
        if (f && ready.indexOf(f) >= 0) file = f;
      });
      if (!file) return;                       /* имени нет в реестре — живёт статичный кадр */
      slot._file = file;
      /* Решение «скраб или нет» принимается ЗДЕСЬ, когда уже известно, какое
         имя цепочки реально нашлось в реестре: сцена спрашивает slot._scrub,
         а не разбирает атрибут заново. Мастера нет → флаг снят → слот уходит
         в обычный lazy и играет фолбэк петлёй, как до этой правки. */
      slot._scrub = scrubbed(slot, file);
      if (slot.hasAttribute('data-eager')) { playV(mountVideo(slot, file)); return; }
      /* Скраб не отдаётся ни наблюдателю, ни гейту: наблюдатель звал бы play()
         на входе в секцию и ролик поехал бы по своим часам — ровно та болезнь,
         из-за которой сцена лет и переделывается. Монтируем сразу и молча. */
      if (slot._scrub) { scrubs.push(slot); mountVideo(slot, file); return; }
      if (slot.hasAttribute('data-gate')) { gated.push(slot); return; }  /* заведёт сцена */
      lazy.push([slot, file]);
    });

    /* Скраб греется своим тактом — тем же событием home:b3d-done, что и
       остальные ролики (две тяжёлые подготовки одновременно душат друг
       друга), но БЕЗ раскрутки декодера через play(): здесь достаточно
       дождаться readyState ≥ 2 и поставить кадр начала. */
    afterLoad(function () {
      warmUp(lazy.map(function (p) { return p[0]; }).concat(gated));
      scrubs.forEach(warmScrub);
    });

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
    /* Пауза гасит и ТОРМОЖЕНИЕ: цикл settle() проверяет тот же флаг paused
       и уходит, иначе playbackRate продолжал бы падать и нажатие паузы
       посреди торможения оставило бы ролик навсегда на скорости 0,4.
       Сняли паузу — цикл заводится заново с той же точки. */
    VIDEOS.forEach(function (v) {
      if (paused) { v.pause(); return; }
      playV(v);
      if (v._hold !== undefined && !v.ended) settle(v, v._hold);
    });
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
     СЦЕНА 2 · ЛОЗА (П1 + a24 + П4 кроссфейд)
     Список имён СТОИТ, материал под ним меняется — четыре такта по
     шот-листу flow-queue/02-vine.md: гроздь наливается цветом, секатор
     срезает, капля скатывается, солнце уходит за гребень. Активное имя
     светлое, соседи гаснут: список читается как меню фильма.
     ──────────────────────────────────────────────────────────────────── */
  (function scVine() {
    var sec = $('#vine'); if (!sec) return;
    var items = $$('.vine__i', sec);
    var slots = $$('.vine__s', sec);
    var scrim = $('.vine__scrim', sec);
    if (HAS && !REDUCE) gsap.set(items, { autoAlpha: 0, y: 16 });

    /* Границы тактов 0–30 / 30–58 / 58–80 / 80–100 % и точки подписей.
       Перекрытие кроссфейда 4 % прокрутки (≈0,35 с при обычном колесе). */
    var CUT  = [.30, .58, .80], HALF = .02;
    var AT   = [.12, .40, .66, .88];

    /* Ролик заводится ПО ФРОНТУ смены такта, а не на каждом обновлении
       скролла: play() у доигравшего ролика по спецификации перематывает на
       нуль, и вызов из обработчика скролла крутил бы событие заново на
       каждом пикселе обратного хода. Та же мера, что в scPop(). */
    var cur = -1;
    function set(want) {
      if (want === cur) return;
      cur = want;
      slots.forEach(function (s, i) {
        /* Без этой пометки прогрев (warmUp) глушит уже показанный ролик на
           нулевом кадре — ровно тот баг, что чинили на первом слайде
           «Четырёх миров»: у прогрева предохранитель на slot._on. */
        s._on = (i === want);
        /* Перематываем сами. play() по спецификации отматывает на нуль только
           ДОИГРАВШИЙ ролик; такт, который наблюдатель остановил на середине
           (ушли ниже секции), иначе продолжился бы с этой середины — а здесь
           все четыре ролика события, и каждое обязано начинаться сначала. */
        if (i === want) { var v = ensure(s); if (v) { try { v.currentTime = 0; } catch (e) {} playV(v); } }
        else if (s._v && !s._v.paused) s._v.pause();
      });
      /* такт 3 — единственный горячий кадр экрана, левый низ поднимает скрим */
      if (scrim) scrim.classList.toggle('is-hot', want === 2);
    }

    /* Такт наступает только при живой секции. Вне кадра — idle −1: ролики
       глушатся, cur сбрасывается, и возврат обязательно даёт фронт. */
    var tact = gateVis(sec, -1, set);

    track(sec, 'top top', 'bottom bottom', function (p) {
      /* КРОССФЕЙД. Слот проявляется ПОВЕРХ предыдущего и больше не гаснет:
         если разводить их встречно, на стыке два полупрозрачных кадра
         складываются с фоном и картинка на мгновение проваливается в тень. */
      var top = 0, op = slots.map(function (s, i) {
        var k = i === 0 ? 1 : ss(CUT[i - 1] - HALF, CUT[i - 1] + HALF, p);
        if (k > .999) top = i;
        return k;
      });
      slots.forEach(function (s, i) {
        s.style.opacity = op[i].toFixed(3);
        /* всё, что полностью закрыто верхним слотом, не красим вовсе */
        s.style.visibility = (i < top || op[i] < .002) ? 'hidden' : 'visible';
      });

      items.forEach(function (it, i) {
        var at = AT[i];
        /* имя приходит внутри своего кадра, а не на склейке: окно начинается
           после того, как кроссфейд уже кончился */
        var k = ss(at - .06, at + .04, p);
        it.style.opacity = String(k);
        it.style.transform = 'translate3d(0,' + (16 * (1 - k)).toFixed(2) + 'px,0)';
        it.style.visibility = k > .01 ? 'visible' : 'hidden';
        var on = p >= at - .02 && (i === items.length - 1 || p < AT[i + 1] - .02);
        it.classList.toggle('is-on', on);
      });

      tact(p < CUT[0] ? 0 : p < CUT[1] ? 1 : p < CUT[2] ? 2 : 3);
    });

    /* Реестр приходит ПОЗЖЕ первого фронта — заводить было нечего. Как
       только слот смонтирован, а он на подмостках, ролик идёт сразу. */
    document.addEventListener('home:slot-mounted', function (e) {
      var i = slots.indexOf(e.detail);
      if (i >= 0 && i === cur && e.detail._v) playV(e.detail._v);
    });

    /* Наблюдатель за секцией — внутри gateVis(): он же глушит сцену вне кадра
       (иначе прогресс остаётся на единице до футера и вход обратно снизу
       не даёт фронта) и он же не пускает такт, пока секции нет на экране. */
  })();

  /* ────────────────────────────────────────────────────────────────────
     СЦЕНА 3 · БУТЫЛКА (П2 турнтейбл + П3 фон + П15б свечение)
     Экран замирает, колесо крутит БУТЫЛКУ, потом страница забирает
     управление и сама въезжает в этикетку. Четыре такта, монтаж по
     flow-queue/03-bottle.md § 7:

       A  0,04–0,58  ПОВОРОТ — скраб зрителя по нарезке клипа bottle-turn-chd
       —  0,58–0,64  пауза: бутылка анфас, свет замер
       B  0,64–0,92  НАЕЗД  — слот #turnPush, событие, играет один раз
       C  0,90–1,00  ТИСНЕНИЕ — принятый label-emboss, петля

     A отдаётся зрителю: поворот обратим и монотонен, это единственное
     движение сцены, которое честно живёт под рукой. B зрителю НЕ отдаётся:
     у наезда свой разгон и свой доводчик, а под скрабом каждый пиксель
     обратного хода выдёргивал бы камеру назад из этикетки.

     Швов нет ни одного: клип B стартует последним кадром клипа A, а
     кончается кадром 0 принятого label-emboss — по обе стороны обоих
     стыков стоит одно и то же изображение.

     Секвенция кадров грузится ДО пина, иначе первый проход рваный.
     Чёрный фон кадров уходит в screen — сквозь него течёт фон страницы
     из ночи в закат.
     ──────────────────────────────────────────────────────────────────── */
  (function scTurn() {
    var sec = $('#turn'); if (!sec) return;
    var cv = $('#turnCv'), still = $('#turnStill'), warm = $('#turnWarm');
    var edge = $('#turnEdge'), out = $('#turnOut');
    var push = $('#turnPush'), emb = $('#turnEmb'), pin = $('.turn__pin', sec);
    var caps = $$('.turn__c', sec);
    /* Живая 3D-бутылка — только под ручкой ?bottle=3d. Пока api === null,
       сцена идёт по кадрам. */
    var b3d = null;
    /* alpha:true — на мобиле край кадра растушёвывается маской, иначе
       под mix-blend-mode:screen проступает светлый прямоугольник ролика */
    var ctx = cv && cv.getContext ? cv.getContext('2d', { alpha: true }) : null;
    /* ВЕСЬ клип, а не окно. Окно [46,78] существовало ровно для одного:
       спрятать чужую этикетку с латиницей и штрих-кодом в старом ролике
       bottle-turn. Бутылка теперь наша — прятать нечего, и скраб получает
       96 кадров вместо 32. Границы всё равно клипятся по index.json,
       поэтому код работает с нарезкой любой длины. */
    var RANGE = [0, 95];
    /* своя нарезка 1600×900 — ровно размер cover при вьюпорте 1440×900:
       drawImage идёт почти 1:1, а не пересчитывает 1920×1080 каждый кадр
       (96 кадров ≈ 1,5 МБ против 2,7 МБ исходной).
       Клип снят «в обратную сторону» (из анфаса бутылка уходит в ракурс),
       поэтому нарезка РЕВЕРСИРОВАНА при сборке: кадр 0 — этикетка ушла
       вбок, кадр 95 — анфас, тот же кадр, что принятый стилл-герой
       FLOW-SEED/bottle-chd-face.jpg. */

    var frames = [], meta = null, stride = MOB ? 2 : 1, count = 0, cur = -1;
    var DIRF = '../assets/img/gen/home/frames/bottle-turn-chd/';

    /* Постер сцены — кадр 0 самой нарезки. Если папки кадров нет вовсе
       (свежий клон без производных), на пине остался бы пустой градиент,
       поэтому у стилла есть запасной кадр — принятый стилл-герой анфас
       FLOW-SEED/bottle-chd-face.jpg в производных gen/home/. */
    if (still) still.addEventListener('error', function () {
      if (still.dataset.fb) return;
      still.dataset.fb = '1';
      still.removeAttribute('srcset');
      still.src = '../assets/img/gen/home/bottle-chd-face-1280.webp';
    }, { once: true });

    function size() {
      if (!cv) return;
      /* исходник секвенции 1920 px в ширину: DPR выше 1 не добавляет ни
         одного реального пикселя при вьюпорте 1440, зато линейно бьёт
         по заливке под screen на каждом кадре скраба */
      var d = Math.min(window.devicePixelRatio || 1, 1);
      cv.width  = Math.round(window.innerWidth  * d);
      cv.height = Math.round(window.innerHeight * d);
      cur = -1;
    }
    function nearest(i) {
      for (var d = 0; d < count; d++) {
        if (frames[i + d]) return frames[i + d];
        if (frames[i - d]) return frames[i - d];
      }
      return null;
    }
    /* Кадр рисуется ОДНОГО И ТОГО ЖЕ размера на всём такте A: масштаб
       считается только от вьюпорта, от прогресса не зависит. Так и должно
       быть — «камера не движется, кадровка заперта, бутылка одного
       размера» (критерий отбора клипа, п. 4.1). Прежняя вырезка на выходе
       (кадр уезжал влево и ужимался) снята вместе с #turnCut: сцена
       кончается не подменой, а наездом в собственную этикетку. */
    function paint(i) {
      if (!ctx || i === cur) return;
      var im = nearest(i); if (!im) return;
      cur = i;
      var cw = cv.width, ch = cv.height;
      /* на узком экране кадр ужимается до 78 % высоты и поднимается:
         внизу освобождается тёмное поле под подпись (текст не ложится
         на этикетку — правило «текст только в тихой зоне») */
      var s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight) * (MOB ? .78 : 1);
      var w = im.naturalWidth * s, h = im.naturalHeight * s;
      var dx = (cw - w) / 2, dy = (ch - h) / 2 - (MOB ? ch * .09 : 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(im, dx, dy, w, h);
      if (MOB) {
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

    /* ТАКТЫ СЦЕНЫ (03-bottle.md § 7.3). Поворот кончается ЛИЦОМ этикетки к
       камере, дальше шесть процентов паузы — свет замер, зритель успевает
       увидеть, что бутылка встала, — и только потом страница забирает
       управление и въезжает в бумагу. Наезд — 28 % длины секции: при 360 svh
       это 936 px прокрутки, четырёхсекундный ролик успевает доиграть. */
    var T = { spin: [.04, .58], hold: [.58, .64], push: [.64, .92], emb: [.90, 1] };

    /* ДЛИНА ОБОИХ СТЫКОВ, в долях прогресса секции. По обе стороны и A→B,
       и B→C стоит ОДНО И ТО ЖЕ изображение: клип B начинается последним
       кадром клипа A (замерено — PSNR 28,8 дБ, сдвига нет) и кончается
       кадром 0 принятого label-emboss (13,6 дБ встык, но лучший сдвиг
       0,2 % ширины: положение герба и «1888» совпало, вся разница в
       фактуре кожи, которую Veo рисует заново). Длинная растворялка на
       таком стыке читается как «подтормозило», жёсткий встык — как
       микро-рывок кадра; 0,25–0,35 с закрывает и то, и другое.
       Перевод в прогресс: пин 360 svh = 2,6 экрана прокрутки (2 340 px
       при 900), спокойный скраб колесом — три щелчка по 100 px в секунду,
       значит 0,30 с ≈ 90 px ≈ 0,04 длины секции. Прежняя растворялка
       макро шла на 0,11 — втрое дольше. */
    var FADE = .04;

    /* Скорость оборота неравномерна нарочно — но только у 3D-модуля.
       У этикетки обхват 130°, и со спины модель показывает изнанку бумаги;
       кривая держит лицо дольше и проскакивает спину, зато и разброс
       скорости у неё десятикратный (производная 0,18…1,82). У СНЯТОГО
       клипа некрасивых кадров нет вовсе — в ветке кадров кривой нет. */
    function spinCurve(u) { return u - .13 * Math.sin(2 * Math.PI * u); }

    /* Подписи — три строки такта A, окно ±0,08 вокруг data-at (0,16 / 0,38 /
       0,54). Окна не перекрываются: две строки на экране одновременно
       складываются в кашу. Последняя гаснет на 0,62 — на тактах B и C
       текста в кадре нет вообще: кадр заполняется бумагой, тихой зоны в нём
       не остаётся, а класть текст на этикетку значит спорить с ней. */
    function capsAt(p) {
      caps.forEach(function (c) {
        var at = parseFloat(c.getAttribute('data-at'));
        c.classList.toggle('is-on', p >= at - .08 && p < at + .08);
      });
    }

    /* ── ДВА СОБЫТИЯ ОДНОЙ СЦЕНЫ ────────────────────────────────────────
       Наезд и макро — слоты со шторкой (data-gate): заводит их сама сцена,
       иначе наблюдатель раскрутил бы два лишних декодера на всю страницу.
       Гейт у обоих ОДИН: gateVis отдаёт сцене маску «что должно играть»
       (1 — наезд, 2 — макро). Пока секция вне кадра, маска 0: оба ролика
       глушатся и состояние сбрасывается, поэтому возврат в секцию
       обязательно даёт ФРОНТ. Без этого прогресс остаётся на единице до
       самого футера, ролик числится «идущим», и вход обратно снизу не
       заводит событие заново (та же мера, что в scPop() и scVine()). */
    var pushOn = false, embOn = false, mask = -1;
    function pushSet(want) {
      if (!push || want === pushOn) return;
      pushOn = want; push._on = want;
      if (want) {
        /* Перематываем сами. play() по спецификации отматывает на нуль
           только ДОИГРАВШИЙ ролик; наезд, остановленный гейтом на середине
           (ушли из секции), продолжился бы с этой середины. */
        var v = ensure(push);
        if (v) { try { v.currentTime = 0; } catch (e) {} playV(v); }
      } else if (push._v && !push._v.paused) push._v.pause();
    }
    function embSet(want) {
      if (!emb || want === embOn) return;
      embOn = want; emb._on = want;
      var v = want ? ensure(emb) : emb._v;
      if (v) { if (want) playV(v); else v.pause(); }
    }
    var gate = (push || emb) ? gateVis(sec, 0, function (m) {
      pushSet(!!(m & 1)); embSet(!!(m & 2));
    }) : null;
    /* Событие заводится ПО ФРОНТУ маски, а не на каждом обновлении скролла:
       play() у доигравшего ролика перематывает на нуль, и вызов из
       обработчика скролла крутил бы наезд заново на каждом пикселе
       обратного хода. Прозрачность макро при этом ведёт скролл ВСЕГДА —
       гейтится только запуск декодера, иначе слой был бы неверным на входе. */
    function gateAt(wantPush, f) {
      if (!gate) return;
      var m = (wantPush ? 1 : 0) | (f > .004 ? 2 : 0);
      if (m === mask) return;
      mask = m; gate(m);
    }

    function apply(p) {
      /* ── 3D (только под ручкой ?bottle=3d) ── */
      if (b3d) {
        var z = ss(T.push[0], T.push[1], p);
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
        var ze = ss(T.emb[0], T.emb[0] + FADE, p);
        if (emb) emb.style.opacity = ze.toFixed(3);
        gateAt(false, ze);          /* наезд ведёт сама модель, слот молчит */
        if (out) {
          var fo = ss(.93, 1, p);
          out.style.opacity = fo.toFixed(3);
          out.style.transform = 'translate3d(0,' + (18 * (1 - fo)).toFixed(2) + 'px,0)';
        }
        capsAt(p);
        if (edge) edge.style.opacity = (ss(.44, .62, p) * (1 - ss(.66, .82, p))).toFixed(3);
        return;
      }

      /* ── ТАКТ A · ПОВОРОТ (скраб зрителя) ─────────────────────────────
         Индекс кадра — ровно по такту, БЕЗ spinCurve(): всю дугу ведёт
         домашняя ss() страницы, и больше ничего. Замеренный шаг кадров по
         точкам 8/16/24/32/40/48/56 %: 11 · 17 · 21 · 20 · 16 · 9 — плавный
         вход и доводчик к паузе, ни одного скачка; у прежней кривой на том
         же такте скорость гуляла в десять раз. Границы клипятся по
         index.json, поэтому любая длина нарезки работает без правок. */
      if (warm) warm.style.background = warmAt(p);
      if (count) paint(Math.round(ss(T.spin[0], T.spin[1], p) * (count - 1)));

      /* ── ТАКТ B · НАЕЗД ───────────────────────────────────────────────
         Первый кадр клипа B — последний кадр клипа A, и по обе стороны
         стыка стоит одно изображение: слева канвас держит кадр 95 нарезки,
         справа слот показывает постер ролика (а без ролика — тот же постер
         стиллом). Фейд закрывает не подмену, а фактуру.

         Фейд идёт НА ПАУЗЕ (0,60–0,64) и кончается ровно там, где сцена
         заводит ролик. Иначе слой проявлялся бы уже во время наезда: зритель,
         который дошёл до 0,64 и остановился почитать, получил бы четыре
         секунды события за невидимым слоем и по возвращении — сразу
         последний кадр. Пауза для того и есть: подменить кадр, пока ничего
         не движется.

         Кадр поворота под наездом полностью закрыт — не красим его вовсе. */
      var kb = ss(T.push[0] - FADE, T.push[0], p);
      if (push) push.style.opacity = kb.toFixed(3);
      /* Тёплый фон гаснет ВМЕСТЕ с фейдом. Кадр поворота идёт под
         mix-blend-mode:screen и собирает закатный градиент, а ролик наезда
         смешивается обычным способом — если фон оставить, на стыке A→B
         подложка потемнела бы скачком, хотя картинка та же. С нулевым
         фоном обе стороны стыка считаются от одного чёрного. */
      if (warm) warm.style.opacity = (1 - kb).toFixed(3);
      /* Донный скрим мобильного пина держал подписи такта A. Текста на
         тактах B и C нет — уводим его тем же движением, иначе он гасит
         нижнюю треть макро этикетки. */
      if (pin) pin.style.setProperty('--scrim', (1 - kb).toFixed(3));
      var hid = kb > .995 ? 'hidden' : 'visible';
      if (cv) cv.style.visibility = hid;
      if (still) still.style.visibility = hid;

      /* ── ТАКТ C · ТИСНЕНИЕ ────────────────────────────────────────────
         Последний кадр клипа B задан кадром 0 этого ролика, поэтому стык
         кроется тем же коротким фейдом, а не склейкой. */
      var ke = ss(T.emb[0], T.emb[0] + FADE, p);
      if (emb) emb.style.opacity = ke.toFixed(3);

      gateAt(p >= T.push[0] && p < T.emb[1], ke);
      capsAt(p);
      /* кульминация: золото по краю вьюпорта — бутылка встала анфас */
      if (edge) edge.style.opacity = (ss(.44, .62, p) * (1 - ss(.66, .82, p))).toFixed(3);
      if (out) {
        var fk = ss(.93, 1, p);
        out.style.opacity = fk.toFixed(3);
        out.style.transform = 'translate3d(0,' + (18 * (1 - fk)).toFixed(2) + 'px,0)';
      }
    }

    /* Реестр приходит ПОЗЖЕ первого фронта — заводить было нечего. Как
       только слот смонтирован, а его такт уже идёт, ролик стартует сразу. */
    document.addEventListener('home:slot-mounted', function (e) {
      if (e.detail === push && pushOn && push._v) playV(push._v);
      if (e.detail === emb && embOn && emb._v) playV(emb._v);
    });

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
             загружается целиком, а рисование почти ничего не стоит.
             Порция проверена на новом окне (96 кадров вместо прежних 32):
             по 4 за кадр холодный проход даёт 50,5 fps в среднем из четырёх
             прогонов против 51,0 по 8 — разницы нет, оставлено как было. */
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
              else { cur = -1; if (st) apply(st.progress); }
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
        .catch(function () { /* нарезки нет — сцена честно живёт на стилле анфас */ });
      });
    }

    /* ── РЕЖИМ СЦЕНЫ ────────────────────────────────────────────────────
       Разметка объявляет режим атрибутом data-bottle:
         "frames" — НОРМА: скраб по нарезке снятого клипа bottle-turn-chd;
         "3d"     — живая модель из assets/js/bottle3d-module.js.
       3D осталась в файлах, но ушла из пути по умолчанию: у модуля не
       получалось поворота (на 25 и 50 % бутылка становилась пустой светлой
       трубой без единой детали, review/bottle3d/turn-25|50.png), а холодная
       сборка сцены морозила главный поток на 2,4–2,6 с и давала fps вниз
       36–39 против 54 на кадрах (review/home/slots3/). Модуль берётся
       динамическим import(), поэтому по умолчанию ни three, ни текстуры
       бутылки в сеть не уходят. Любой отказ — нет WebGL, нет модуля, сцена
       не собралась за 25 с — молча роняет сцену обратно на кадры, поэтому
       страница не может остаться с пустым пином. */
    var mode = pin ? attrOr(pin, 'data-bottle', 'frames') : 'frames';
    /* Ручка приёмки: ?bottle=frames показывает кадры, ?bottle=3d — модель.
       Нужна, чтобы сравнивать оба режима на одной машине, не правя разметку. */
    var q = /[?&]bottle=(3d|frames)/.exec(location.search);
    if (q) mode = q[1];

    if (mode === '3d' && REDUCE) {
      /* Без движения крутить нечего — на пине стоит наш стилл анфас. */
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
          if (window.console && console.warn) console.warn('[home] 3D-бутылка не поднялась (' + why + ') — сцена идёт на кадрах');
          document.dispatchEvent(new CustomEvent('home:b3d-done'));
          startFrames();
          if (st) apply(st.progress);
        }
        /* Пока сцена собирается (2–5 с), на пине стоит наш же стилл анфас —
           подменять его вырезкой ×4 больше не нужно: чужой бутылки в сцене
           нет ни на одном кадре. */
        if (pin) pin.classList.add('b3d-wait');
        if (!host || !window.WebGL2RenderingContext) { fallBack('нет WebGL2'); return; }
        /* Карта модулей three нужна ТОЛЬКО этой ветке, поэтому из <head> она
           убрана: путь по умолчанию — кадры, и объявлять карту для модуля,
           который никогда не грузится, незачем. Вставляем её здесь — до
           первого разрешения модуля, других модулей на странице нет. */
        try {
          if (!document.querySelector('script[type="importmap"]')) {
            var im = document.createElement('script');
            im.type = 'importmap';
            im.textContent = '{"imports":{"three":"../assets/vendor/three/three.module.min.js","three/addons/":"../assets/vendor/three/addons/"}}';
            document.head.appendChild(im);
          }
        } catch (e) { fallBack('карта модулей не встала'); return; }
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

    /* СТУПЕНЬКА: у каждого слайда своё ПЛАТО, между ними прежний переход.
       Линейный прогресс двигал кадр непрерывно, и слайд стоял на экране
       ровно столько, сколько зритель медлил, — 2–4 с на обычной прокрутке.
       Здесь длина такта делится 40 / 60: сорок процентов слайд стоит
       (по 20 % с каждой стороны целого значения), шестьдесят едет. Прибавка
       высоты секции без этой ступеньки растянула бы и переходы тоже, а
       событию нужен ПОКОЙ, а не медленный проезд.
       Внутри перехода функция ЛИНЕЙНА нарочно: smoothstep уже стоит ниже,
       на самом сдвиге кадра, и второй раз сглаживать значит получить
       почти неподвижную середину перехода. */
    var ПЛАТО = 0.20;
    function step(u) {
      var i = Math.floor(u), f = u - i;
      if (i >= n - 1) return n - 1;
      if (f <= ПЛАТО) return i;
      if (f >= 1 - ПЛАТО) return i + 1;
      return i + (f - ПЛАТО) / (1 - 2 * ПЛАТО);
    }

    /* Кадр всегда ведёт скролл, а вот ЗАПУСК роликов идёт через общий гейт
       (§ 9 state/home.md): пока секция вне кадра, сцене отдаётся -1 — все
       четыре слота на паузе, active сброшен. Иначе ScrollTrigger.refresh()
       (приход реестра, шрифты, load, ресайз) отдал бы крайнее значение
       прогресса, и хранитель успел бы уйти по галерее, пока зритель стоит
       на герое. Возврат в секцию даёт запомненное значение ФРОНТОМ —
       событие стартует с нуля ровно на входе. */
    function setCur(cur) {
      if (cur === active) return;
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
        if (i === cur) {
          var v = ensure(slot);
          if (v) {
            /* СОБЫТИЕ НАЧИНАЕТСЯ СНАЧАЛА. play() по спецификации отматывает
               только ДОИГРАВШИЙ ролик; хранитель, брошенный на середине,
               продолжил бы уход с той же секунды. Признак события здесь —
               v.loop === false: это ровно тот случай, когда смонтированное
               имя попало в список data-v-once. Петлю не трогаем — ей
               перемотка не нужна, а лишний seek стоит декодеру кадра. */
            if (!v.loop && !v.ended) { try { v.currentTime = 0; } catch (e) {} }
            playV(v);
          }
        }
        else if (slot._v && !slot._v.paused) slot._v.pause();
      });
    }
    var гейт = gateVis(sec, -1, setCur);

    function apply(p) {
      var x = step(clamp01(p) * (n - 1));
      sl.forEach(function (s, i) {
        var d = x - i;                                    /* >0 — слайд уже уехал вверх */
        /* уходящий поднимается, приходящий открывается снизу — оба по smoothstep,
           поэтому на стыке слайдов нет ни рывка, ни линейного участка */
        var y = d > 0 ? -ss(0, 1, d) * 100 : ss(0, 1, -d) * 100;
        s.style.transform = 'translate3d(0,' + y.toFixed(3) + '%,0)';
        s.style.visibility = (y > 99.5 || y < -99.5) ? 'hidden' : 'visible';
      });
      гейт(Math.round(x));
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

     С 25.08 сцену ведёт МАСТЕР cellar-timelapse, и ведёт СКРАБОМ: ролик
     стоит на паузе, а currentTime пишется из того же прогресса track(),
     что двигает цифру. Прежде barrel-gallery играл петлёй по собственным
     часам — два независимых времени в одном кадре, и «1936» попадало то
     на третью секунду ролика, то на одиннадцатую. Отсюда и была жалоба
     «годы идут, а на картинке ничего не происходит»: картинка не стояла,
     она шла МИМО. Теперь «1936» — это буквально кадр 5,70 с.

     Обратный ход отдельной обработки не требует: перемотка назад сама
     сходит пылью и втягивает паутину, симметрия получается по построению.
     ──────────────────────────────────────────────────────────────────── */
  (function scYears() {
    var sec = $('#cellar'); if (!sec) return;
    var nEl = $('#yearsN'), caps = $$('#yearsCaps p'), slot = $('#yearsV');
    var stops = caps.map(function (c) { return +c.getAttribute('data-y'); });
    var m = stops.length;
    var at = stops.map(function (_, i) { return 0.06 + i * (0.88 / (m - 1)); });
    var HOLD = 0.055;

    /* ── КАРТА «ПРОЦЕНТ ПРОКРУТКИ → СЕКУНДА МАСТЕРА» ────────────────────
       Кусочно-линейно по четырём узлам; узел = КОНЕЦ соответствующего
       кроссфейда сборки. Числа — из state/home.md («ПОДВАЛ — МАТЕРИАЛ
       ГОТОВ»), пересчитанные под ФАКТИЧЕСКИЕ 14,33 с мастера, а не под
       15,20 с плана в § 6.3 наряда: клип A обрезан по варианту 2, первый
       фейд удлинился до 0,5 с. Держать рядом с at[] и править вместе.

       Проверка сходимости: at[] даёт остановки на 6 / 23,6 / 41,2 / 58,8 /
       76,4 / 94 %, и tAt() переводит их ровно в те секунды, на которых в
       кадре стоит нужное состояние:
         1888 → 0,81 с  свеча, руки кладут первую бутылку
         1899 → 3,20 с  ниша полна, рук нет, зажглась «летучая мышь»
         1936 → 5,70 с  пыль сплошным слоем, первые нити паутины
         1956 → 8,20 с  верхний ряд под паутиной, этикетки бурые
         2001 → 10,70 с исходная фотография ниши, вошёл хранитель
         2026 → 13,41 с чистая бутылка легла среди старых
       Два узла из четырёх (23,6 и 76,4 %) совпадают с остановками счётчика
       нарочно: оба стыка сборки спрятаны в окна, где цифра стоит и зритель
       читает подпись, а не смотрит на кадр. */
    var NODES = [[0, 0], [0.236, 3.20], [0.764, 10.70], [1, 14.33]];
    function tAt(p) {
      if (p <= 0) return NODES[0][1];
      for (var i = 0; i < NODES.length - 1; i++) {
        if (p <= NODES[i + 1][0]) {
          var a = NODES[i], b = NODES[i + 1];
          return lerp(a[1], b[1], (p - a[0]) / (b[0] - a[0]));
        }
      }
      return NODES[NODES.length - 1][1];
    }

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

    /* ── ЗАПИСЬ currentTime: квантованно и НЕ из обработчика скролла ─────
       track() зовётся на каждом кадре прокрутки, а каждая запись
       currentTime — это новый декод. Поэтому: пишем, только если новое
       значение отличается больше чем на полкадра (1/48 с при 24 fps), и
       делаем запись в requestAnimationFrame, а не сразу. Тот же приём, что
       уже квантует масштаб цифры ниже (nEl._z, шаг 0,0025).

       ЗАМЕРЕНО, ПОЧЕМУ ВООБЩЕ СКРАБ ПО <video>, А НЕ КАНВАС-НАРЕЗКА.
       Прогон одной и той же рампы (весь ролик за 2,6 с) на одной машине,
       tools/pw/_cellar_seek.js против _cellar_frames.js:
         видео -1280        2,87 МБ · rAF 49,5 fps · 43,7 новых кадра/с · разрыв 117 мс
         канвас 144×1280×720 16,79 МБ · rAF 26,1 fps · 25,0 кадра/с · разрыв 144 мс
         канвас  96×960×540   6,19 МБ · rAF 24,8 fps · 23,3 кадра/с · разрыв 164 мс
       Канвас проиграл и по кадрам, и по весу: пыль с паутиной — фактура
       высокой энтропии, кадр весит 66…119 КБ вместо 25 КБ у нарезки
       бутылки, а полноэкранный drawImage упирается в заливку. Скраб по
       <video> с сеткой I-кадров 0,5 с оказался быстрее собственного
       фолбэка, поэтому ветки кадров у сцены нет вовсе. */
    var SQ = 1 / 48, want = -1, wrote = -1, raf = 0;
    function write() {
      raf = 0;
      var v = slot && slot._v;
      if (!v || !slot._scrub || want < 0) return;
      if (v.readyState < 2) return;            /* до готовности — постер, иначе чёрный кадр */
      if (!v.paused) v.pause();
      if (Math.abs(want - wrote) < SQ) return;
      wrote = want;
      try { v.currentTime = want; } catch (e) {}
    }
    /* Гейт «секция в кадре» (§ 9): вне кадра сцене отдаётся idle = null —
       ролик глушится, и ни одной перемотки не пишется. Без этого
       ScrollTrigger.refresh() с любого места страницы (приход реестра,
       готовность шрифтов, ресайз) гнал бы декод на крайнее значение
       прогресса, пока зритель ещё у героя. Вход в секцию отдаёт
       запомненное значение фронтом — кадр встаёт под текущий год сразу. */
    function scrub(t) {
      var v = slot && slot._v;
      if (!v || !slot._scrub) return;
      if (t === null) { want = -1; if (!v.paused) v.pause(); return; }
      want = Math.round(t / SQ) * SQ;
      if (!raf) raf = requestAnimationFrame(write);
    }
    var gate = slot ? gateVis(sec, null, scrub) : function () {};
    /* Догон кадра там, где скролла может и не быть. Оба случая проверены,
       а не придуманы:
       · реестр приходит ПОЗЖЕ первого track() — прогресс уже посчитан, и
         кадр надо довести до него, не дожидаясь, пока зритель тронет колесо;
       · в спрятанной вкладке requestAnimationFrame не тикает вовсе (замер в
         панели предпросмотра: 1 тик за 8,2 с при document.hidden), поэтому
         запись, поставленная в очередь перед уходом, там и остаётся. Вернулись
         на вкладку — сбрасываем `wrote` и перезаписываем: иначе зритель
         увидел бы год из одного места ролика и кадр из другого. */
    function догнать() { wrote = -1; if (!raf) raf = requestAnimationFrame(write); }
    document.addEventListener('home:scrub-ready', function (e) { if (e.detail === slot) догнать(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) догнать(); });

    track(sec, 'top top', 'bottom bottom', function (p) {
      var y = yearAt(p);
      if (nEl && nEl.textContent !== String(y)) nEl.textContent = String(y);
      caps.forEach(function (c, i) {
        c.classList.toggle('is-on', Math.abs(p - at[i]) <= HOLD + .012);
      });
      gate(tAt(p));
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

     НАЛИВ ЗАВОДИТ САМА СЦЕНА (слот помечен data-gate), и ровно на p > 0,06
     — там же, где начинается рост кегля. Раньше слот вёл наблюдатель с
     rootMargin 200 px: налив успевал начаться, а на быстрой прокрутке и
     кончиться, ещё до того как «1888» тронулось с места, и внутри штриха
     цифры зритель получал уже пустую сцену (наряд 06-glass.md § 6 п. 1).
     Заводим ПО ФРОНТУ, а не каждый кадр скролла: play() у доигравшего
     ролика перематывает на нуль, и вызов из обработчика скролла крутил
     бы налив заново на каждом пикселе обратного хода.
     ──────────────────────────────────────────────────────────────────── */
  (function scGlass() {
    var sec = $('#glass'); if (!sec) return;
    var t = $('#glassT'), cut = $('#glassCut'), txt = $('#glassTxt');
    var slot = $('#glassV'), on = false;
    var FROM = MOB ? 44 : 26, TO = MOB ? 210 : 148;

    function set(want) {
      if (want === on || !slot) return;
      on = want; slot._on = want;
      if (want) { var v = ensure(slot); if (v) replay(v, holdOf(slot)); }
      else if (slot._v && !slot._v.paused) slot._v.pause();
    }

    /* Гейт «секция в кадре» старше трека: refresh() с прогрессом 1 (зритель
       уже в футере) иначе завёл бы налив в пустоту — § 9 state/home.md. */
    var pour = gateVis(sec, false, set);

    track(sec, 'top top', 'bottom bottom', function (p) {
      pour(p > 0.06);
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
      if (want) { var v = ensure(slot); if (v) replay(v, holdOf(slot)); }
      else if (slot._v && !slot._v.paused) slot._v.pause();
    }

    if (!HAS && txt) { txt.style.opacity = '1'; txt.style.setProperty('--rise', '0px'); }

    /* Хлопок заводится, только когда секция в кадре: refresh с прогрессом 1
       (зритель уже в футере) иначе завёл бы событие в пустоту, а наблюдатель
       после этого молчит — состояние пересечения не менялось. */
    var pop = gateVis(sec, false, set);

    track(sec, 'top top', 'bottom bottom', function (p) {
      pop(p > 0.004);
      if (txt && HAS) {
        var s = ss(.03, .19, p);
        txt.style.opacity = String(s);
        txt.style.setProperty('--rise', (18 * (1 - s)).toFixed(1) + 'px');
      }
    });

    /* Секция ушла из кадра — gateVis() глушит совсем. Иначе прогресс остаётся
       на единице до самого футера, ролик числится «идущим», а вход обратно
       снизу не даёт фронта и хлопок не повторяется. */
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

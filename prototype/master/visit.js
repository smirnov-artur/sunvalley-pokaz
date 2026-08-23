/* ВИЗИТ · ГОЛИЦЫНСКИЕ ПОДВАЛЫ — движение страницы энотуризма.
   Lenis + GSAP ScrollTrigger (локальный vendor), как на wines.html. WebGL не нужен:
   сердце страницы — спуск в темноту, реликвии-числа и лестница программ.

   Правило обратного скролла (SUNVALLEY-DESIGN §5, §6.14): появления играются ОДИН раз
   и не откатываются — назад страница проходится зеркально и без скачков; всё, что
   двигается по scrub, трогает только transform (никаких layout-свойств).
   Кривая дома cubic-bezier(.16,1,.3,1) ≈ 'expo.out'. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'expo.out';
  var hdr = $('#hdr');
  var HH = parseInt(getComputedStyle(document.body).getPropertyValue('--hh'), 10) || 78;

  gsap.registerPlugin(ScrollTrigger);

  /* ── 1. Скролл ── */
  var lenis = null;
  if (!reduce) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* якоря (кнопка брони в шапке → финал) */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    var y = el.getBoundingClientRect().top + window.pageYOffset - HH;
    if (lenis) lenis.scrollTo(y, { duration: 1.25 });
    else window.scrollTo({ top: y, behavior: 'auto' });
  });

  /* ── 1b. Заявка на визит: страница работает без телефонного звонка ──
     Бэкенда у прототипа нет — форма проверяется на месте и отвечает подтверждением,
     повторяя телефон администратора. Никакой оплаты: 171-ФЗ, услуга бронируется, не покупается. */
  (function booking() {
    var f = $('#bkg');
    if (!f) return;
    var ok = $('#bkgOk');
    var date = $('#bkDate');

    /* дата: не раньше сегодняшнего дня, по умолчанию — завтра */
    if (date) {
      var d = new Date(); d.setHours(12, 0, 0, 0);
      var iso = function (x) { return x.toISOString().slice(0, 10); };
      date.min = iso(d);
      d.setDate(d.getDate() + 1);
      date.value = iso(d);
    }

    var MONTHS = ['января','февраля','марта','апреля','мая','июня',
                  'июля','августа','сентября','октября','ноября','декабря'];
    function human(v) {
      var p = String(v || '').split('-');
      if (p.length !== 3) return v;
      return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
    }
    function plural(n, a, b, c) {
      var n10 = n % 10, n100 = n % 100;
      if (n10 === 1 && n100 !== 11) return a;
      if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return b;
      return c;
    }

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!f.checkValidity()) { f.reportValidity(); return; }
      var no = $('#bkProg').value;
      var g = Math.max(1, parseInt($('#bkGuests').value, 10) || 1);
      ok.textContent = 'Заявка принята: программа №' + no + ', ' + human($('#bkDate').value) +
        ', сеанс ' + $('#bkTime').value + ', ' + g + ' ' + plural(g, 'гость', 'гостя', 'гостей') +
        ($('#bkCheese').checked ? ', с ассорти сыров' : '') +
        '. Администратор перезвонит на ' + $('#bkPhone').value.trim() +
        ' и подтвердит сеанс. Если удобнее сразу — +7 978 956-33-22.';
      ok.hidden = false;
      f.classList.add('is-sent');
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      ok.focus && ok.setAttribute('tabindex', '-1');
      ok.focus && ok.focus();
    });
  })();

  if (reduce) { addEventListener('load', function () { ScrollTrigger.refresh(); }); return; }

  /* ── 2. Вход: текст выезжает из-под кромки, кадр подвала проявляется глубиной ── */
  var tl = gsap.timeline({ defaults: { ease: EASE } });
  tl.from('#heroImg', { scale: 1.1, duration: 2.2, ease: 'power2.out' }, 0)
    .from('.vhero__t', { opacity: 0, duration: 0.9 }, 0.1)
    .from('#hero .kick > i', { yPercent: 115, duration: 0.9 }, 0.12)
    .from('#hero .h-hero .ln > i', { yPercent: 115, duration: 1.2, stagger: 0.09 }, 0.18)
    .from('.vhero__sub > i', { yPercent: 115, duration: 1 }, 0.44)
    .from('.vhero__meta > i', { yPercent: 115, duration: 0.95 }, 0.56)
    .from('.vhero__dn', { opacity: 0, duration: 0.9 }, 0.9)
    .from('.vhero__dn i', { scaleY: 0, transformOrigin: '50% 0%', duration: 1.1 }, 0.92);

  /* спуск: кадр уходит вглубь, чернила густеют — только transform + opacity */
  gsap.fromTo('#heroImg', { yPercent: -4 }, {
    yPercent: 4, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 0.5 }
  });
  gsap.to('#deep', {
    opacity: 0.72, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
  });
  gsap.to('.vhero__t', {
    yPercent: -14, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 0.4 }
  });

  /* ── 3. Подвал цифрами: золото проступает 1px-штрихом, числа встают из-под маски ── */
  var tn = gsap.timeline({ defaults: { ease: EASE }, scrollTrigger: { trigger: '.vnum', start: 'top 74%' } });
  tn.from('.vnum .kick > i', { yPercent: 115, duration: 0.85 }, 0)
    .from('.vnum h2 .ln > i', { yPercent: 115, duration: 1.1, stagger: 0.08 }, 0.06)
    .from('.vnum__leg > i', { yPercent: 115, duration: 0.95 }, 0.24)
    .fromTo('#rule', { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: 'power3.inOut' }, 0.34);

  gsap.from('.vn__v > i', {
    yPercent: 118, duration: 1.15, ease: EASE, stagger: 0.09,
    scrollTrigger: { trigger: '.vnum__g', start: 'top 82%' }
  });
  gsap.from('.vn__k, .vn__d', {
    opacity: 0, y: 14, duration: 0.85, ease: EASE, stagger: 0.045,
    scrollTrigger: { trigger: '.vnum__g', start: 'top 78%' }
  });

  /* фотополоса подвала — параллакс внутри своей рамки */
  gsap.fromTo('#bandImg', { yPercent: -7 }, {
    yPercent: 0, ease: 'none',
    scrollTrigger: { trigger: '.vnum__band', start: 'top bottom', end: 'bottom top', scrub: 0.6 }
  });
  gsap.from('.vnum__cap span', {
    yPercent: 130, opacity: 0, duration: 0.8, ease: EASE, stagger: 0.08,
    scrollTrigger: { trigger: '.vnum__band', start: 'top 72%' }
  });

  /* ── 4. Ворота: смена холста ink → stone, шапка светлеет над камнем ── */
  gsap.from('.seam__k, .seam__t > i', {
    yPercent: 115, duration: 1, ease: EASE, stagger: 0.1,
    scrollTrigger: { trigger: '.seam', start: 'top 55%' }
  });

  function lightOver(sel) {
    var el = $(sel);
    if (!el) return;
    ScrollTrigger.create({
      trigger: el, start: 'top ' + HH + 'px', end: 'bottom ' + HH + 'px',
      onToggle: function (s) { hdr.classList.toggle('is-light', s.isActive); }
    });
  }
  lightOver('.progs');
  lightOver('.way');

  /* ── 5. Лестница программ: строки поднимаются регистром, одна за другой ── */
  var tp = gsap.timeline({ defaults: { ease: EASE }, scrollTrigger: { trigger: '.progs', start: 'top 68%' } });
  tp.from('.progs .kick > i', { yPercent: 115, duration: 0.85 }, 0)
    .from('.progs h2 .ln > i', { yPercent: 115, duration: 1.1 }, 0.06)
    .from('.progs__leg > i', { yPercent: 115, duration: 0.95 }, 0.2)
    .from('.progs__hd span', { yPercent: 130, opacity: 0, duration: 0.7, stagger: 0.04 }, 0.34);

  ScrollTrigger.batch($$('.pr__in'), {
    start: 'top 92%',
    onEnter: function (b) {
      gsap.from(b, { yPercent: 108, duration: 0.9, ease: EASE, stagger: 0.07, overwrite: 'auto' });
    }
  });
  gsap.from('.adds', {
    yPercent: 60, opacity: 0, duration: 0.8, ease: EASE,
    scrollTrigger: { trigger: '.adds', start: 'top 94%' }
  });
  gsap.from('.progs__note', {
    opacity: 0, y: 16, duration: 0.9, ease: EASE,
    scrollTrigger: { trigger: '.progs__note', start: 'top 95%' }
  });

  /* ── 6. Дорога: адрес построчно, кадр зала с лёгким ходом ── */
  var tw = gsap.timeline({ defaults: { ease: EASE }, scrollTrigger: { trigger: '.way', start: 'top 70%' } });
  tw.from('.way .kick > i', { yPercent: 115, duration: 0.85 }, 0)
    .from('.way h2 .ln > i', { yPercent: 115, duration: 1.1 }, 0.06)
    .from('.way__l > i', { yPercent: 115, duration: 0.95 }, 0.2)
    .from($$('.adr dt, .adr dd'), { yPercent: 130, duration: 0.8, stagger: 0.035 }, 0.3)
    .from('.brk', { opacity: 0, duration: 0.8 }, 0.72)
    .from('.way__alt', { opacity: 0, duration: 0.8 }, 0.8);

  gsap.from('.way__fig .figm', {
    scaleY: 0.86, transformOrigin: '50% 100%', opacity: 0, duration: 1.2, ease: EASE,
    scrollTrigger: { trigger: '.way__fig', start: 'top 80%' }
  });
  gsap.fromTo('#wayImg', { yPercent: -5 }, {
    yPercent: 5, ease: 'none',
    scrollTrigger: { trigger: '.way__fig', start: 'top bottom', end: 'bottom top', scrub: 0.6 }
  });
  gsap.from('.way__fig figcaption', {
    opacity: 0, duration: 0.8, ease: EASE,
    scrollTrigger: { trigger: '.way__fig', start: 'top 70%' }
  });
  gsap.from($$('.tips li'), {
    yPercent: 115, duration: 0.85, ease: EASE, stagger: 0.07,
    scrollTrigger: { trigger: '.tips', start: 'top 90%' }
  });

  /* ── 7. Финал: единственная золотая кнопка и лента сеансов ── */
  var tf = gsap.timeline({ defaults: { ease: EASE }, scrollTrigger: { trigger: '.vfin', start: 'top 72%' } });
  tf.from('.vfin .kick > i', { yPercent: 115, duration: 0.85 }, 0)
    .from('.vfin h2 .ln > i', { yPercent: 115, duration: 1.1, stagger: 0.08 }, 0.06)
    .from('.vfin__l', { opacity: 0, y: 18, duration: 0.95 }, 0.28)
    .from('.vfin__tel', { opacity: 0, y: 16, duration: 0.9 }, 0.44)
    .from('.vfin__c .mini', { opacity: 0, duration: 0.85 }, 0.52)
    .from($$('#slots span'), { yPercent: 115, duration: 0.8, stagger: 0.05 }, 0.56);

  /* заявка проявляется отдельно — она ниже сеансов */
  if ($('#bkg')) {
    gsap.from('#bkg', {
      opacity: 0, y: 24, duration: 0.95, ease: EASE,
      scrollTrigger: { trigger: '#bkg', start: 'top 94%' }
    });
  }

  addEventListener('load', function () { ScrollTrigger.refresh(); });
})();

/* ВИННАЯ КАРТА ДОМА — движение каталога.
   Lenis + GSAP ScrollTrigger, как на index.html. WebGL здесь не нужен:
   сердце страницы — свет бутылок, регистры и смена холста ink → stone.
   Обратный скролл зеркален: появления играются один раз и не откатываются,
   параллакс — только scrub по transform. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'expo.out';                 // ≈ cubic-bezier(.16,1,.3,1)
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

  /* якоря оглавления */
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

  /* ── 2. Вход: бутылки поднимаются из темноты ── */
  if (!reduce) {
    var tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.from('#hero .kick > i', { yPercent: 115, duration: 0.9 }, 0)
      .from('#hero .h-hero .ln > i', { yPercent: 115, duration: 1.15, stagger: 0.1 }, 0.05)
      .from('#hero .hero__sub > i', { yPercent: 115, duration: 1 }, 0.28)
      .from('.hb__light', { opacity: 0, duration: 1.3, stagger: 0.08 }, 0.3)
      .from('.hb__m img', { yPercent: 115, duration: 1.15, stagger: 0.08 }, 0.34)
      .from('.hb figcaption > i', { yPercent: 115, duration: 0.8, stagger: 0.08 }, 0.6)
      .from('.toc__in', { yPercent: 105, duration: 0.95 }, 0.72);
  }

  /* ── 3. Главы линеек ── */
  $$('.ch').forEach(function (ch) {
    var light = $('.ch__light', ch), m = $('.ch__m', ch);

    if (!reduce) {
      var t = gsap.timeline({ defaults: { ease: EASE }, scrollTrigger: { trigger: ch, start: 'top 72%' } });
      t.from(light, { opacity: 0, duration: 1.3 }, 0)
        .from($$('.ch__m img', ch), { yPercent: 115, duration: 1.15 }, 0.02)
        .from($$('.ch__cap', ch), { opacity: 0, duration: 0.9 }, 0.5)
        .from($$('.kick > i', ch), { yPercent: 115, duration: 0.85 }, 0.05)
        .from($$('.ch__h .ln > i', ch), { yPercent: 115, duration: 1.1 }, 0.12)
        .from($$('.ch__leg > i', ch), { yPercent: 115, duration: 0.95 }, 0.22)
        .from($$('.dos dt, .dos dd', ch), { yPercent: 130, duration: 0.8, stagger: 0.035 }, 0.34)
        .from($$('.go', ch), { opacity: 0, duration: 0.8 }, 0.7);

      /* дыхание света и лёгкий ход бутылки — только transform, зеркально на обратном ходу */
      gsap.fromTo(m, { yPercent: 2.5 }, {
        yPercent: -2.5, ease: 'none',
        scrollTrigger: { trigger: ch, start: 'top bottom', end: 'bottom top', scrub: 0.6 }
      });
      gsap.fromTo(light, { scale: 0.94 }, {
        scale: 1.08, ease: 'none',
        scrollTrigger: { trigger: ch, start: 'top bottom', end: 'bottom top', scrub: 0.8 }
      });
    }

    /* регистры вин — построчно из-под маски */
    $$('.reg__l', ch).forEach(function (list) {
      if (reduce) return;
      gsap.from($$('.reg__in', list), {
        yPercent: 115, duration: 0.85, ease: EASE, stagger: 0.045,
        scrollTrigger: { trigger: list, start: 'top 88%' }
      });
    });
  });

  /* ── 4. Смена холста: шапка светлеет ровно там, где под ней камень ──
       считаем по живой геометрии, а не по кэшу триггера: так состояние
       одинаково на прямом и обратном ходу и переживает любые смены высоты. */
  var carteEl = $('.carte');
  var lightNow = false;
  function syncHdr() {
    var r = carteEl.getBoundingClientRect();
    var on = r.top <= HH && r.bottom > HH + 60;   /* +60: у самого низа страницы под шапкой уже чернила */
    if (on !== lightNow) { lightNow = on; hdr.classList.toggle('is-light', on); }
  }
  if (lenis) lenis.on('scroll', syncHdr);
  addEventListener('scroll', syncHdr, { passive: true });
  addEventListener('resize', syncHdr);
  syncHdr();

  if (!reduce) {
    gsap.from('.carte__hd .kick > i, .carte__hd h2 > i', {
      yPercent: 115, duration: 1, ease: EASE, stagger: 0.08,
      scrollTrigger: { trigger: '.carte', start: 'top 70%' }
    });
    gsap.from('.flt__b', {
      yPercent: 40, opacity: 0, duration: 0.7, ease: EASE, stagger: 0.03,
      scrollTrigger: { trigger: '.flt', start: 'top 92%' }
    });
    gsap.from('.fin .kick > i, .fin h2 .ln > i', {
      yPercent: 115, duration: 1.05, ease: EASE, stagger: 0.08,
      scrollTrigger: { trigger: '.fin', start: 'top 75%' }
    });
  }

  /* ── 5. Полная винная карта: строки, фильтры, миниатюра ── */
  var crt = $('#crt');
  var rows = $$('.crw', crt);

  if (!reduce) {
    ScrollTrigger.batch($$('.crw__in', crt), {
      start: 'top 96%',
      onEnter: function (b) { gsap.from(b, { yPercent: 115, duration: 0.7, ease: EASE, stagger: 0.025, overwrite: 'auto' }); }
    });
  }

  function match(row, f) {
    if (f === 'all') return true;
    if (f === 'orph') return row.hasAttribute('data-orph');
    if (f === 'коллекция') return row.getAttribute('data-cat') === 'коллекция';
    return row.getAttribute('data-col') === f || row.getAttribute('data-sw') === f;
  }

  var current = 'all';
  function filter(f) {
    if (f === current) return;
    current = f;
    var h0 = crt.offsetHeight;
    var shown = [];
    rows.forEach(function (r) {
      var on = match(r, f);
      r.classList.toggle('is-off', !on);
      if (on) shown.push(r.firstElementChild);
    });
    var h1 = crt.offsetHeight;
    if (reduce) { ScrollTrigger.refresh(); return; }
    crt.style.overflow = 'hidden';
    gsap.fromTo(crt, { height: h0 }, {
      height: h1, duration: 0.55, ease: EASE,
      onComplete: function () { crt.style.height = ''; crt.style.overflow = ''; ScrollTrigger.refresh(); }
    });
    gsap.fromTo(shown, { yPercent: 115 }, { yPercent: 0, duration: 0.7, ease: EASE, stagger: 0.012, overwrite: true });
  }

  $$('.flt__b').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.flt__b').forEach(function (o) { o.classList.toggle('is-on', o === b); });
      filter(b.getAttribute('data-f'));
    });
  });

  /* миниатюра бутылки у курсора — transform + лёгкий lag */
  if (!reduce && matchMedia('(hover: hover)').matches) {
    var thb = $('#thb'), thbImg = $('#thbImg');
    var tx = 0, ty = 0, cx = 0, cy = 0, live = false;
    crt.addEventListener('pointermove', function (e) {
      tx = Math.min(e.clientX + 26, innerWidth - 150);
      ty = Math.min(Math.max(e.clientY - 190, 12), innerHeight - 410);
    }, { passive: true });
    rows.forEach(function (r) {
      var cut = r.getAttribute('data-cut');
      if (!cut) return;
      r.addEventListener('pointerenter', function () {
        thbImg.setAttribute('src', '../assets/img/cut/' + cut + '.webp');
        if (!live) { cx = tx; cy = ty; thb.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)'; }
        live = true;
        thb.classList.add('is-on');
      });
      r.addEventListener('pointerleave', function () { live = false; thb.classList.remove('is-on'); });
    });
    gsap.ticker.add(function () {
      if (!live) return;
      cx += (tx - cx) * 0.15; cy += (ty - cy) * 0.15;
      thb.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
    });
  }

  addEventListener('load', function () { ScrollTrigger.refresh(); });
})();

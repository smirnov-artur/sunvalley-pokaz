/* КАРТОЧКА ВИНА — движение. Общий файл для master/wines/*.html.
   Lenis + GSAP ScrollTrigger, как на wines.html. WebGL здесь не нужен:
   действие сцены — свет под бутылкой, штрих, регистры и смена холста ink → stone.
   Обратный скролл зеркален: появления играются один раз и не откатываются,
   параллакс — только scrub по transform (без layout-свойств). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'expo.out';                 // ≈ cubic-bezier(.16,1,.3,1)
  var hdr = $('#hdr');
  var HH = parseInt(getComputedStyle(document.body).getPropertyValue('--hh'), 10) || 74;

  if (typeof gsap === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  /* ── 1. Скролл ── */
  var lenis = null;
  if (!reduce) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    var y = el.getBoundingClientRect().top + window.pageYOffset - HH;
    if (lenis) lenis.scrollTo(y, { duration: 1.2 });
    else window.scrollTo({ top: y, behavior: 'auto' });
  });

  if (reduce) { addEventListener('load', function () { ScrollTrigger.refresh(); }); return; }

  /* ── 2. Герой: имя выходит из-под маски, бутылка поднимается на своём свету ── */
  var hero = $('.wh');
  if (hero) {
    var t = gsap.timeline({ defaults: { ease: EASE } });
    t.from('.wh .bk', { opacity: 0, duration: 0.7 }, 0)
      .from('.wh__kick > i', { yPercent: 115, duration: 0.9 }, 0.04)
      .from('.wh__h .ln > i', { yPercent: 115, duration: 1.15, stagger: 0.09 }, 0.1)
      .from('.wh__ph > i', { yPercent: 115, duration: 1, stagger: 0.07 }, 0.3);

    if ($('.wh__light', hero)) t.from('.wh__light', { opacity: 0, duration: 1.4 }, 0.18);
    if ($('.wh__m img', hero)) t.from('.wh__m img', { yPercent: 112, duration: 1.25 }, 0.24);
    if ($('.wh__glow', hero)) t.from('.wh__glow', { opacity: 0, duration: 1.5 }, 0.1);
    /* типографский герой: единственное действие — золотой штрих прочерчивается */
    if ($('.wh__rule', hero)) t.from('.wh__rule', { scaleX: 0, duration: 1.25 }, 0.42);
    if ($('.wh__seal', hero)) t.from('.wh__seal', { yPercent: 22, opacity: 0, duration: 0.85 }, 0.6);
    t.from('.wh__meta span', { yPercent: 120, opacity: 0, duration: 0.7, stagger: 0.05 }, 0.62)
      .from('.wh__down', { opacity: 0, duration: 0.8 }, 0.9);

    /* дыхание сцены: только transform, на обратном ходу проигрывается зеркально */
    var m = $('.wh__m', hero), lt = $('.wh__light', hero) || $('.wh__glow', hero);
    if (m) gsap.fromTo(m, { yPercent: 0 }, {
      yPercent: -7, ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6 }
    });
    if (lt) gsap.fromTo(lt, { scale: 0.95 }, {
      scale: 1.1, ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.8 }
    });
  }

  /* ── 3. Досье: заголовок и строки регистра — построчно из-под маски ── */
  var ds = $('.ds');
  if (ds) {
    gsap.from($$('.ds__h .ln > i, .ds .kick > i', ds), {
      yPercent: 115, duration: 1, ease: EASE, stagger: 0.08,
      scrollTrigger: { trigger: ds, start: 'top 76%' }
    });
    gsap.from($$('.ds__note', ds), {
      opacity: 0, duration: 0.9, ease: EASE,
      scrollTrigger: { trigger: ds, start: 'top 72%' }
    });
    $$('.dos', ds).forEach(function (dl) {
      gsap.from($$('dt, dd', dl), {
        yPercent: 130, duration: 0.8, ease: EASE, stagger: 0.03,
        scrollTrigger: { trigger: dl, start: 'top 88%' }
      });
    });
  }

  /* ── 4. Смена холста: шапка светлеет над главой-легендой ── */
  var lg = $('.lg');
  if (lg && hdr) {
    ScrollTrigger.create({
      trigger: lg, start: 'top ' + HH + 'px', end: 'bottom ' + HH + 'px',
      onToggle: function (s) { hdr.classList.toggle('is-light', s.isActive); }
    });
  }
  if (lg) {
    gsap.from($$('.lg .kick > i, .lg__h .ln > i', lg), {
      yPercent: 115, duration: 1.05, ease: EASE, stagger: 0.08,
      scrollTrigger: { trigger: lg, start: 'top 74%' }
    });
    gsap.from($$('.lg__p', lg), {
      yPercent: 26, opacity: 0, duration: 0.9, ease: EASE, stagger: 0.07,
      scrollTrigger: { trigger: lg, start: 'top 66%' }
    });
    gsap.from($$('.lg__q', lg), {
      opacity: 0, y: 20, duration: 1, ease: EASE,
      scrollTrigger: { trigger: $('.lg__q', lg) || lg, start: 'top 88%' }
    });
    /* паспарту: рамка проступает, панно подходит снизу под маской */
    var mat = $('.lg__mat', lg);
    if (mat) {
      gsap.from(mat, {
        opacity: 0, duration: 1.2, ease: EASE,
        scrollTrigger: { trigger: mat, start: 'top 90%' }
      });
      gsap.fromTo($('img', mat), { yPercent: 3.5 }, {
        yPercent: -3.5, ease: 'none',
        scrollTrigger: { trigger: lg, start: 'top bottom', end: 'bottom top', scrub: 0.7 }
      });
    }
  }

  /* ── 5. Архив выпусков: годы встают лентой ── */
  var ar = $('.ar');
  if (ar) {
    gsap.from($$('.ar__h .ln > i, .ar .kick > i', ar), {
      yPercent: 115, duration: 1, ease: EASE, stagger: 0.08,
      scrollTrigger: { trigger: ar, start: 'top 76%' }
    });
    gsap.from($$('.ar__i', ar), {
      yPercent: 18, opacity: 0, duration: 0.8, ease: EASE, stagger: 0.055,
      scrollTrigger: { trigger: $('.ar__l', ar) || ar, start: 'top 88%' }
    });
  }

  /* ── 6. Финал ── */
  var wf = $('.wf');
  if (wf) {
    gsap.from($$('.wf .kick > i, .wf h2 .ln > i', wf), {
      yPercent: 115, duration: 1.05, ease: EASE, stagger: 0.08,
      scrollTrigger: { trigger: wf, start: 'top 75%' }
    });
    gsap.from($$('.wf__l, .wf__act', wf), {
      yPercent: 22, opacity: 0, duration: 0.9, ease: EASE, stagger: 0.1,
      scrollTrigger: { trigger: wf, start: 'top 66%' }
    });
  }

  addEventListener('load', function () { ScrollTrigger.refresh(); });
})();

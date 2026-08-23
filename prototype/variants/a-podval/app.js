// Солнечная Долина · вариант А «Подвал»
(function () {
  'use strict';

  // Возрастной гейт
  var gate = document.getElementById('gate');
  var yes = document.getElementById('gateYes');
  // гейт есть только на главной: на внутренних страницах (catalog/wine) элементов нет — не падаем
  try {
    if (gate && (function(){var K=['sv_age_ok','sv-age','sv_age','sv-age-ok'];for(var i=0;i<K.length;i++){try{if(localStorage.getItem(K[i])==='1'||sessionStorage.getItem(K[i])==='1')return true;}catch(e){}}return false;})()) gate.classList.add('off');
  } catch (e) {}
  if (gate && yes) yes.addEventListener('click', function () {
    gate.classList.add('off');
    try { (function(){var K=['sv_age_ok','sv-age','sv_age','sv-age-ok'];for(var i=0;i<K.length;i++){try{localStorage.setItem(K[i],'1');sessionStorage.setItem(K[i],'1');}catch(e){}}})(); } catch (e) {}
  });

  // Шапка при скролле
  var hdr = document.getElementById('hdr');
  var onScroll = function () {
    hdr.classList.toggle('solid', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = window.matchMedia && matchMedia('(max-width: 820px)').matches;
  var hasScrollTimeline = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');

  // Шкала лет 1888→2026: привязана к прокрутке (JS вместо CSS-анимации)
  var scale = document.querySelector('.scale');
  var thumb = scale && scale.querySelector('.scale__thumb');
  var scaleTick = function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    scale.style.setProperty('--pp', p.toFixed(4));
    thumb.setAttribute('data-yr', String(Math.round(1888 + p * (2026 - 1888))));
  };
  if (scale && thumb) {
    var scaleQueued = false;
    var onScale = function () {
      if (scaleQueued) return; scaleQueued = true;
      requestAnimationFrame(function () { scaleQueued = false; scaleTick(); });
    };
    window.addEventListener('scroll', onScale, { passive: true });
    window.addEventListener('resize', onScale);
    scaleTick();
  }

  // Пылинки в подвальной зоне героя: ≤ 20 частиц, только desktop и без reduced-motion
  var dust = document.querySelector('.hero-dust');
  if (dust && !reduce && !mobile) {
    var frag = document.createDocumentFragment();
    for (var d = 0; d < 20; d++) {
      var i = document.createElement('i');
      i.style.setProperty('--x', (4 + Math.random() * 92).toFixed(1) + '%');
      i.style.setProperty('--s', (1 + Math.random() * 1.6).toFixed(1) + 'px');
      i.style.setProperty('--t', (12 + Math.random() * 14).toFixed(1) + 's');
      i.style.setProperty('--d', (-Math.random() * 20).toFixed(1) + 's');
      i.style.setProperty('--dx', ((Math.random() - .5) * 60).toFixed(0) + 'px');
      i.style.setProperty('--o', (.25 + Math.random() * .45).toFixed(2));
      frag.appendChild(i);
    }
    dust.appendChild(frag);
  }

  // Занавес hero → флагманы: clip-path circle на sticky-обёртке.
  // reduced-motion → статичный кадр с fade; нет scroll-timeline → JS-прогресс
  var curtain = document.querySelector('.link-curtain');
  if (curtain) {
    var sticky = curtain.querySelector('.link-curtain__sticky');
    if (reduce) {
      curtain.classList.add('is-static');
    } else if (!hasScrollTimeline) {
      var cQueued = false;
      var curtainTick = function () {
        cQueued = false;
        var r = curtain.getBoundingClientRect();
        var denom = curtain.offsetHeight - window.innerHeight;
        var p = denom > 0 ? Math.min(1, Math.max(0, -r.top / denom)) : 1;
        sticky.style.setProperty('--p', p.toFixed(4));
      };
      var onCurtain = function () { if (!cQueued) { cQueued = true; requestAnimationFrame(curtainTick); } };
      window.addEventListener('scroll', onCurtain, { passive: true });
      window.addEventListener('resize', onCurtain);
      curtainTick();
    }
  }

  // Reveal-анимации: навешиваем класс .rv на смысловые блоки
  var targets = document.querySelectorAll(
    '.flag__main, .flag__item, .valley__head > *, .valley__fig, .valley__nums > div,' +
    '.ranges__h, .range, .visit__panel > *, .trust__row > div, .trust__note, .folio'
  );
  targets.forEach(function (el, i) {
    el.classList.add('rv');
    el.style.transitionDelay = (i % 4) * 90 + 'ms';
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('on'); io.unobserve(en.target); }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  } else {
    targets.forEach(function (el) { el.classList.add('on'); });
  }
})();

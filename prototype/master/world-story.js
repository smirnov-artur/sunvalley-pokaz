/* ══════════════════════════════════════════════════════════════════════
   WORLD-STORY — голос хранителя подвала на страницах-мирах.

   Схема — assets/audio/story/SCRIPTS.md, «Как это подключать»:
   1. Голос стартует ТОЛЬКО по явному действию (клик по тумблеру).
      Автоплей запрещён и браузером, и вкусом: страница-мир не орёт.
   2. Дальше аудио идёт своим ходом, страница подтягивает субтитр по
      sentences[i].t — не по прогрессу скролла.
   3. Прогресс скролла нужен только для страховки: улетел вперёд мира
      быстрее голоса — перематываем к cues[k].t. Обратно — НИКОГДА
      (STORY-BIBLE.md, §4.2 п.3: иначе фраза заикается).
   4. prefers-reduced-motion голос НЕ отключает — это доступность.
      Отключает только тумблер.

   Прогресс диорамы считается здесь сам, по геометрии #dio: ни одна
   сцена (chd.js / arhaderesse.js / tokluk.js / инлайн meganom) этим
   файлом не правится. Формула та же, что у ScrollTrigger
   `start:'top top', end:'bottom bottom'`.

   Подключение (атрибуты на самом теге script):
     data-chapter  имя главы: chd | arhaderesse | tokluk | meganom
     data-fg       цвет штриха и текста тумблера
     data-bg       подложка тумблера и полосы субтитров
     data-sub      цвет текста субтитра
     data-hair     цвет хейрлайна
     data-toggle   селектор УЖЕ существующей кнопки: голос садится на неё
                   и не плодит вторую (Архадерессе, §7.5 наряда 12)
     data-dock     на сколько px поднять от низа (мобильная .mbar)

   Наружу: window.StoryVoice { on, off, toggle, isOn, speaking }
   Событие: 'story:speak' { detail: { speaking: bool } } — на нём висит
   приглушение амбиента вечера в arhaderesse.js.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var S = document.currentScript;
  if (!S) return;
  var CH = S.getAttribute('data-chapter');
  if (!CH) return;

  var FG   = S.getAttribute('data-fg')   || '#d1a95a';
  var BG   = S.getAttribute('data-bg')   || 'rgba(10,7,6,.92)';
  var SUB  = S.getAttribute('data-sub')  || '#fbf7f0';
  var HAIR = S.getAttribute('data-hair') || 'rgba(209,169,90,.4)';
  var DOCK = parseInt(S.getAttribute('data-dock') || '0', 10) || 0;
  var TOGGLE_SEL = S.getAttribute('data-toggle') || '';

  var DIR = '../assets/audio/story/';
  var VOL = 0.72;                 /* умеренная громкость: голос, а не радио */

  /* ── стиль. Радиус 0, теней нет, капитель 0.14em — конституция §2, §3 ── */
  var css = document.createElement('style');
  css.textContent = [
    '.vx{position:fixed;right:var(--pad,22px);bottom:22px;z-index:97;',
    '  display:flex;align-items:center;gap:10px;padding:.72em 1.05em;cursor:pointer;',
    '  border:1px solid ' + HAIR + ';border-radius:0;background:' + BG + ';color:' + FG + ';',
    '  font:500 .62rem/1 var(--sans,\'Golos Text\',Arial,sans-serif);letter-spacing:.14em;',
    '  text-transform:uppercase;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
    '  transition:border-color .35s,color .35s,opacity .35s}',
    '.vx:hover{border-color:' + FG + '}',
    '.vx__i{width:7px;height:7px;background:transparent;border:1px solid currentColor;flex:0 0 auto}',
    '.vx[aria-pressed="true"] .vx__i{background:currentColor}',
    '.vx[aria-pressed="true"] .vx__i.is-speaking{animation:vxp 1.6s ease-in-out infinite}',
    '@keyframes vxp{0%,100%{opacity:1}50%{opacity:.42}}',
    /* Полоса субтитров — своё поле у нижнего края, текста поверх ключевого
       визуала нет (конституция, §4 и запрет №7). Пока полоса на экране,
       тумблер поднимается над ней, а подсказка «листайте» гаснет: голос уже
       ведёт зрителя, и две служебные строки внизу — это шум. */
    '.vxs{position:fixed;left:0;right:0;bottom:0;z-index:96;',
    '  min-height:56px;display:flex;align-items:center;',
    '  padding:12px var(--pad,22px);pointer-events:none;text-align:center;',
    '  background:' + BG + ';border-top:1px solid ' + HAIR + ';',
    '  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
    '  opacity:0;transform:translateY(10px);transition:opacity .5s cubic-bezier(.16,1,.3,1),transform .5s cubic-bezier(.16,1,.3,1)}',
    '.vxs.is-on{opacity:1;transform:none}',
    '.vxs p{margin:0 auto;max-width:60ch;color:' + SUB + ';',
    '  font:400 clamp(.9rem,1.5vw,1.06rem)/1.45 var(--serif,\'Cormorant\',Georgia,serif)}',
    'html.is-voice .hint{opacity:0!important;visibility:hidden}',
    (TOGGLE_SEL ? TOGGLE_SEL + '{transition:bottom .5s cubic-bezier(.16,1,.3,1),border-color .35s,color .35s}'
                + 'html.is-voice ' + TOGGLE_SEL + '{bottom:calc(22px + 86px)}' : ''),
    'html.is-voice .vx{bottom:calc(22px + 86px)}',
    '.vx{transition:bottom .5s cubic-bezier(.16,1,.3,1),border-color .35s,color .35s,opacity .35s}',
    /* мобильная .mbar живёт внизу — тумблер и полоса поднимаются над ней */
    '@media (max-width:900px){.vx{font-size:.56rem;padding:.7em .85em;gap:8px;',
    '    bottom:calc(22px + ' + DOCK + 'px)}',
    '  html.is-voice .vx{bottom:calc(22px + 86px + ' + DOCK + 'px)}',
    (TOGGLE_SEL ? '  html.is-voice ' + TOGGLE_SEL + '{bottom:calc(22px + 86px + ' + DOCK + 'px)}' : ''),
    '  .vxs{bottom:' + DOCK + 'px}',
    '  .vxs p{font-size:.92rem;line-height:1.4}}',
    '@media (prefers-reduced-motion:reduce){.vx,.vxs{transition:none}',
    '  .vx[aria-pressed="true"] .vx__i.is-speaking{animation:none}}'
  ].join('');
  document.head.appendChild(css);

  /* ── тумблер: либо садимся на существующую кнопку, либо ставим свою ── */
  var btn = TOGGLE_SEL ? document.querySelector(TOGGLE_SEL) : null;
  var own = false;
  var dot = null;
  if (!btn) {
    own = true;
    btn = document.createElement('button');
    btn.className = 'vx';
    btn.id = 'voiceBtn';
    btn.type = 'button';
    btn.setAttribute('aria-pressed', 'false');
    dot = document.createElement('i');
    dot.className = 'vx__i';
    var lbl = document.createElement('span');
    lbl.textContent = 'Озвучка';
    btn.appendChild(dot);
    btn.appendChild(lbl);
    document.body.appendChild(btn);
  } else {
    dot = btn.querySelector('i');
  }
  btn.setAttribute('aria-label', 'Включить озвучку главы');
  btn.setAttribute('title', own ? 'Голос хранителя подвала' : 'Звук: голос хранителя и вечер');

  /* ── полоса субтитров ── */
  var band = document.createElement('div');
  band.className = 'vxs';
  band.setAttribute('aria-live', 'polite');
  var bandP = document.createElement('p');
  band.appendChild(bandP);
  document.body.appendChild(band);

  /* ── состояние ── */
  var audio = null, data = null, on = false, speaking = false;
  var curSent = -1, maxCue = -1, rafId = 0;

  /* Событие «идёт фраза» — для приглушения чужого звука на странице.
     Пульс на самом тумблере от него НЕ зависит: паузы между предложениями
     здесь 0,65 с, между абзацами 0,95 с, и мигать точкой каждые полсекунды
     значит нервировать зрителя. Точка живёт, пока живёт голос. */
  function fire(sp) {
    if (sp === speaking) return;
    speaking = sp;
    document.dispatchEvent(new CustomEvent('story:speak', { detail: { speaking: sp } }));
  }
  function pulse(v) { if (dot) dot.classList.toggle('is-speaking', !!v); }

  /* прогресс диорамы — та же арифметика, что у ScrollTrigger top top/bottom bottom */
  function dioProg() {
    var d = document.getElementById('dio');
    if (!d) return 0;
    var r = d.getBoundingClientRect();
    var span = r.height - window.innerHeight;
    if (span <= 0) return 0;
    var p = -r.top / span;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  /* «0.35-0.60 фигура спускается» → [0.35, 0.60] */
  function cueRange(c) {
    var m = /^\s*([\d.]+)\s*-\s*([\d.]+)/.exec(c.cue || '');
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
  }

  function tick() {
    if (!on || !audio) { rafId = 0; return; }
    rafId = requestAnimationFrame(tick);
    var t = audio.currentTime;
    var live = !audio.paused && !audio.ended;
    pulse(live);
    if (!data) { fire(live); return; }

    /* субтитр по sentences[i].t — не по скроллу */
    var s = data.sentences, i = curSent;
    if (i < 0 || t < s[i].t || (i + 1 < s.length && t >= s[i + 1].t)) {
      var lo = 0, hi = s.length - 1, found = -1;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (s[mid].t <= t) { found = mid; lo = mid + 1; } else hi = mid - 1; }
      if (found !== curSent) {
        curSent = found;
        if (found >= 0) { bandP.textContent = s[found].text; band.classList.add('is-on'); }
      }
    }
    /* Полоса держит последнюю фразу и гаснет только на паузе между АБЗАЦАМИ
       (пауза склейки 0,55 с + запас). Гасить её на каждой точке — мигание:
       внутри абзаца между предложениями проходит меньше секунды. */
    if (curSent >= 0 && t > s[curSent].t + s[curSent].dur + 1.4) band.classList.remove('is-on');
    else if (curSent >= 0) band.classList.add('is-on');

    /* «Идёт речь» — не «включён голос»: границы фразы известны точно
       (sentences[i].t + dur). На этом висит приглушение амбиента вечера
       до 0,25 и возврат к 0,8 в паузах между абзацами (наряд 12, §7.5). */
    fire(live && curSent >= 0 && t >= s[curSent].t && t <= s[curSent].t + s[curSent].dur + 0.25);

    /* СТРАХОВКА: зритель улетел вперёд мира — догоняем. Назад никогда. */
    var p = dioProg(), k = -1;
    for (var j = 0; j < data.cues.length; j++) {
      var r = cueRange(data.cues[j]);
      if (r && p >= r[0]) k = j;
    }
    if (k > maxCue) {
      maxCue = k;
      var want = data.cues[k].t;
      if (want > t + 2.5) { try { audio.currentTime = want; curSent = -1; } catch (e) {} }
    }
  }

  function start() {
    if (!audio) {
      audio = new Audio(DIR + CH + '.mp3');
      audio.preload = 'auto';
      audio.volume = VOL;
      audio.addEventListener('ended', function () { setOn(false); });
      audio.addEventListener('error', function () { setOn(false); });
      /* json догоняет: play() обязан уйти синхронно в обработчике клика */
      fetch(DIR + CH + '.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.sentences && j.cues) data = j; })
        .catch(function () {});
    }
    var pr = audio.play();
    if (pr && pr.catch) pr.catch(function () { setOn(false); });
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function setOn(v) {
    on = !!v;
    document.documentElement.classList.toggle('is-voice', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Выключить озвучку главы' : 'Включить озвучку главы');
    if (on) start();
    else {
      if (audio) audio.pause();
      band.classList.remove('is-on');
      pulse(false); fire(false);
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }
  }

  btn.addEventListener('click', function () { setOn(!on); });

  /* ушли со вкладки — голос замолкает; вернулись — продолжает с того же места */
  document.addEventListener('visibilitychange', function () {
    if (!audio) return;
    if (document.hidden) { if (!audio.paused) audio.pause(); pulse(false); fire(false); }
    else if (on && audio.paused && !audio.ended) start();
  });

  window.StoryVoice = {
    on: function () { setOn(true); },
    off: function () { setOn(false); },
    toggle: function () { setOn(!on); },
    isOn: function () { return on; },
    isSpeaking: function () { return speaking; },
    /* для приёмки: реальное состояние элемента, а не флаг из rAF —
       при скрытой вкладке rAF тормозится и флаг обновиться не успевает */
    isPaused: function () { return !audio || audio.paused; },
    time: function () { return audio ? audio.currentTime : 0; },
    chapter: CH
  };
})();

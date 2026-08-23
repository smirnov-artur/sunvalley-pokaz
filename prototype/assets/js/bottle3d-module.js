/* ─────────────────────────────────────────────────────────────────────────────
   bottle3d-module.js — подключаемая 3D-бутылка «Чёрный Доктор».

   Ставится в любой контейнер главной вместо canvas-секвенции кадров:

     import { createBottle } from './assets/js/bottle3d-module.js';
     const b = createBottle(document.querySelector('.hero__bottle'), {
       label: 'chd',
       onReady: () => document.documentElement.classList.add('bottle-ready'),
     });
     b.setProgress(0.25);   // поворот, 0..1 — полный оборот
     b.setZoom(1);          // наезд в этикетку, 0..1
     b.setLight(-0.3, 0.2); // куда «смотрит» свет: -1..1 по x и y
     b.dispose();

   Требует importmap хоста:
     "three"         → assets/vendor/three/three.module.min.js
     "three/addons/" → assets/vendor/three/addons/   (только ради LTC-таблиц
                       RectAreaLightUniformsLib, они тянутся динамически)

   Устройство сцены (круг 2):
     стекло   — LatheGeometry по силуэту фотографии + thicknessMap (толще
                у пунта, пятки и плеча) + BackSide-подкладка внутренней стенки
     вино     — второй лэйт по внутреннему радиусу, НЕПРОЗРАЧНЫЙ, с fake-SSS:
                гранатовый край на просвет
     этикетка — цилиндрическая оболочка + отдельный меш торца бумаги 0.3 мм
     стол     — металлический диск с «лужей» света, мягкая контактная тень
                и отражение, построенное из того же профиля
     свет     — RectAreaLight (софтбоксы), PMREM-студия из широких панелей
     пост     — MSAA-таргет, свой лёгкий блум (3 программы), ACES, зерно
   ────────────────────────────────────────────────────────────────────────── */

import * as THREE from 'three';

const MM = 0.01;                              // 1 мм = 0.01 единицы сцены
const ASSET_BASE = new URL('../img/bottle3d/', import.meta.url).href;

/* Каталог продуктов. Пока один, но всё, что отличается от бутылки к бутылке,
 * живёт здесь, а не в коде сцены. */
const PRODUCTS = {
  chd: {
    profile: 'chd-profile.json',
    tex: (suf) => ({
      color: `chd-label-color${suf}.webp`,
      normal: `chd-label-normal${suf}.webp`,
      orm: `chd-label-orm${suf}.webp`,
      info: `label-info${suf}.json`,
    }),
    // Стекло само по себе БЕСЦВЕТНОЕ: в three material.color домножает
    // пропускание, и тёмно-зелёный color гасил тело бутылки в ноль. Зелень
    // даёт attenuationColor на длине стенки — так же, как в настоящем стекле.
    glassTint: 0xeaf0e6,
    glassAtten: 0x2c4a10,                      // bottle-green, доказан фотографией
    wine: 0x2a0711,
    wineRim: 0x6e1018,                         // гранат на просвет
    capsule: 0x2e3648,
  },
};

/* Запасной профиль: если json не подъехал, форма та же, точек меньше. */
const FALLBACK_PROFILE = {
  bodyRMm: 37.9, neckRMm: 13.1, capsuleBottomMm: 240.5, labelTopMm: 171.7,
  labelBottomMm: 38.1, fillLevelMm: 213, heightMm: 300, puntHMm: 21,
  glass: [[21, 0], [17.9, 21], [13.6, 29.7], [8.4, 34.9], [2.5, 37.2], [0, 37.4],
          [2.2, 37.9], [6, 37.9], [179.8, 37.9], [190, 36.5], [200, 31.2],
          [208, 21.9], [213, 13.4], [216, 14.9], [230, 13.6], [270, 13.2],
          [285, 14.0], [291, 12.4], [294, 0]],
  capsule: [[240, 0], [240, 14.6], [250, 14.7], [275, 14.0], [285, 15.6],
            [295, 14.1], [298.8, 8.4], [300, 0.5]],
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/* ── ПРОЦЕДУРНЫЕ ТЕКСТУРЫ ──────────────────────────────────────────────────
 * Всё, что можно посчитать из профиля, считается в рантайме: ни одного
 * лишнего килобайта в сеть. */

/** Карта толщины стекла вдоль образующей.
 *  LatheGeometry кладёт uv.y = индекс точки / (кол-во точек − 1) — то есть
 *  вертикаль текстуры это ровно порядок обхода профиля: пунт → пятка →
 *  корпус → плечо → горло → венчик. Значит толщину можно расписать построчно. */
function makeThicknessTexture(path) {
  const N = path.length;
  // где кончается пунт: первая точка, у которой высота вышла на минимум
  let puntEnd = 0, minH = Infinity;
  for (let i = 0; i < N; i++) { if (path[i][0] <= minH) { minH = path[i][0]; puntEnd = i; } else if (i > 2) break; }

  const H = 256, W = 4;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: false });
  const img = ctx.createImageData(W, H);

  const at = (i) => {
    const [h, r] = path[i];
    const isPunt = i <= puntEnd;
    let t;
    if (isPunt) {
      // пунт и купол над ним — самая массивная часть отливки
      t = 0.72 + 0.28 * (1 - r / 40);
    } else if (h < 18) {
      t = 0.66 - 0.22 * smoothstep(0, 18, h);   // пятка толстая, к корпусу тоньше
    } else if (h < 172) {
      t = 0.34 + 0.05 * smoothstep(150, 172, h);
    } else if (h < 214) {
      t = 0.39 + 0.30 * smoothstep(172, 210, h); // плечо — стекло собирается
    } else if (h < 288) {
      t = 0.60 - 0.10 * smoothstep(214, 260, h); // горло толстостенное
    } else {
      t = 0.55 + 0.35 * smoothstep(288, 294, h); // венчик
    }
    return clamp(t, 0.05, 1);
  };

  for (let y = 0; y < H; y++) {
    // flipY у CanvasTexture включён: строка 0 холста = v = 1
    const v = 1 - y / (H - 1);
    const f = v * (N - 1);
    const i0 = Math.floor(f), i1 = Math.min(N - 1, i0 + 1), k = f - i0;
    const val = at(i0) * (1 - k) + at(i1) * k;
    const b = Math.round(val * 255);
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      img.data[o] = b; img.data[o + 1] = b; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Мягкая контактная тень: широкое пятно + плотное ядро под пяткой. */
function makeShadowTexture() {
  const S = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / (S - 1) - 0.5) * 2, w = (y / (S - 1) - 0.5) * 2;
    // тень чуть вытянута от источника (ключ слева-спереди) — уходит вправо-назад
    const du = (u - 0.10) / 1.0, dw = (w + 0.06) / 0.62;
    const d = Math.sqrt(du * du + dw * dw);
    const wide = Math.pow(clamp(1 - d, 0, 1), 2.0) * 0.58;
    // ядро тени по следу пятки, а не «на глаз»: бутылка занимает ±0.27 плоскости
    const dc = Math.sqrt((u * u) / 0.085 + (w * w) / 0.055);
    const core = Math.pow(clamp(1 - dc, 0, 1), 1.35) * 0.90;
    const a = clamp(wide + core, 0, 1);
    const o = (y * S + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 0;
    img.data[o + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** «Лужа» света на столе: тёплый тёмный центр, к краю — чистый чёрный.
 *  Работает как base color металлического стола, поэтому заодно гасит
 *  отражение к краям диска и стол не выглядит серым прямоугольником. */
function makePoolTexture() {
  const S = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / (S - 1) - 0.5) * 2, w = (y / (S - 1) - 0.5) * 2;
    const d = Math.sqrt((u + 0.06) * (u + 0.06) * 0.55 + w * w * 0.9);
    const k = Math.pow(clamp(1 - d, 0, 1), 1.9);
    const o = (y * S + x) * 4;
    img.data[o] = Math.round(255 * (0.012 + 0.62 * k));
    img.data[o + 1] = Math.round(255 * (0.010 + 0.52 * k));
    img.data[o + 2] = Math.round(255 * (0.008 + 0.38 * k));
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Отражение бутылки в столе. Бутылка — тело вращения, силуэт при повороте
 *  не меняется, поэтому статичный запечённый спрайт здесь физически честен. */
function makeReflectTexture(P) {
  const W = 192, H = 192;
  const maxR = P.bodyRMm * 1.06;
  const DEPTH = 190;                            // мм бутылки, попадающие в отражение
  const path = P.glass;
  const radiusAt = (h) => {
    // корпусная ветвь профиля (после пунта): линейная выборка по высоте
    let r = 0;
    for (let i = 1; i < path.length; i++) {
      const [h0, r0] = path[i - 1], [h1, r1] = path[i];
      if (h1 < h0) continue;                    // пунт пропускаем
      if (h >= h0 && h <= h1) { const k = h1 === h0 ? 0 : (h - h0) / (h1 - h0); r = r0 + (r1 - r0) * k; break; }
      if (h > h1) r = r1;
    }
    return r;
  };
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const d = 1 - y / (H - 1);                  // 0 у контакта, 1 у дальнего края
    const hMm = d * DEPTH;
    const r = radiusAt(hMm);
    const fade = Math.exp(-d * 3.4) * Math.pow(1 - d, 0.7);
    for (let x = 0; x < W; x++) {
      const uMm = (x / (W - 1) - 0.5) * 2 * maxR;
      const e = 1 - smoothstep(r - 2.5, r + 4.5, Math.abs(uMm));
      // блик стекла даёт в отражении яркую вертикальную нитку
      const hot = Math.exp(-Math.pow((uMm + r * 0.62) / 3.2, 2)) * 0.9
                + Math.exp(-Math.pow((uMm - r * 0.78) / 4.4, 2)) * 0.45;
      const base = e * fade;
      const a = clamp(base * 0.42 + hot * fade * 0.85, 0, 1);
      const warm = 0.55 + 0.45 * hot;
      const o = (y * W + x) * 4;
      img.data[o] = Math.round(255 * clamp(0.42 * base + 0.95 * hot * fade, 0, 1) * warm);
      img.data[o + 1] = Math.round(255 * clamp(0.30 * base + 0.80 * hot * fade, 0, 1) * warm);
      img.data[o + 2] = Math.round(255 * clamp(0.24 * base + 0.62 * hot * fade, 0, 1) * warm);
      img.data[o + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Фон-задник: не чистый чёрный, а очень тёмный тёплый градиент.
 *  Через него стекло смотрит наружу — на чистом чёрном корпус проваливается
 *  в дыру, и именно поэтому в круге 1 бутылка «распадалась» при повороте. */
function makeBackdropTexture() {
  const W = 64, H = 128;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x / (W - 1) - 0.5) * 2, v = y / (H - 1);
    const rad = Math.pow(clamp(1 - Math.sqrt(u * u * 0.8 + Math.pow(v - 0.66, 2) * 1.5), 0, 1), 1.6);
    // Ниже v≈0.42 проходит кромка стола. Если задник там такой же светлый,
    // горизонт режет кадр прямой линией: гасим его к низу почти в ноль.
    const floorFade = 0.16 + 0.84 * smoothstep(0.44, 0.62, v);
    const g = (0.0042 + 0.0165 * rad) * floorFade;
    const o = (y * W + x) * 4;
    img.data[o] = Math.round(255 * Math.pow(g * 1.10, 1 / 2.2));
    img.data[o + 1] = Math.round(255 * Math.pow(g * 0.98, 1 / 2.2));
    img.data[o + 2] = Math.round(255 * Math.pow(g * 0.88, 1 / 2.2));
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* ── ГЕОМЕТРИЯ ─────────────────────────────────────────────────────────────── */

function latheFromPath(path, segs) {
  const pts = path.map(([h, r]) => new THREE.Vector2(Math.max(r * MM, 1e-5), h * MM));
  // Собственные нормали LatheGeometry непрерывны на шве; computeVertexNormals()
  // их ломает и даёт вертикальную складку ровно там, где по стеклу течёт блик.
  return new THREE.LatheGeometry(pts, segs);
}

/** Торец бумаги: два радиальных «реза» по краям обхвата + верхняя и нижняя
 *  кромки. Без него этикетка сбоку — лист нулевой толщины, «карточка». */
function paperEdgeGeometry(rIn, rOut, h, a0, a1, seg) {
  const pos = [], nor = [], idx = [];
  const push = (x, y, z, nx, ny, nz) => { pos.push(x, y, z); nor.push(nx, ny, nz); return pos.length / 3 - 1; };
  const quad = (a, b, c, d) => { idx.push(a, b, c, a, c, d); };
  const y0 = -h / 2, y1 = h / 2;

  // вертикальные резы
  for (const [ang, sgn] of [[a0, -1], [a1, 1]]) {
    const s = Math.sin(ang), c = Math.cos(ang);
    // нормаль — по касательной к окружности
    const nx = Math.cos(ang) * sgn, nz = -Math.sin(ang) * sgn;
    const A = push(rIn * s, y0, rIn * c, nx, 0, nz);
    const B = push(rOut * s, y0, rOut * c, nx, 0, nz);
    const C = push(rOut * s, y1, rOut * c, nx, 0, nz);
    const D = push(rIn * s, y1, rIn * c, nx, 0, nz);
    if (sgn > 0) quad(A, B, C, D); else quad(D, C, B, A);
  }
  // верхняя и нижняя кромки
  for (const [yy, ny] of [[y1, 1], [y0, -1]]) {
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const ang = a0 + (a1 - a0) * i / seg;
      const s = Math.sin(ang), c = Math.cos(ang);
      push(rIn * s, yy, rIn * c, 0, ny, 0);
      push(rOut * s, yy, rOut * c, 0, ny, 0);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2, b = a + 1, cc = a + 2, d = a + 3;
      if (ny > 0) idx.push(a, b, d, a, d, cc); else idx.push(a, d, b, a, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/* ── ФЕЙКОВЫЙ SSS ──────────────────────────────────────────────────────────
 * Вино обязано быть непрозрачным: прозрачные объекты не попадают в буфер,
 * который стекло сэмплирует через transmission, — прозрачное вино просто
 * исчезает из бутылки. Глубину даём френелевским подмешиванием граната
 * в эмиссию: край массы светится на просвет, как настоящее вино. */
function applyFakeSSS(mat, hex, power, strength) {
  const col = new THREE.Color(hex);
  mat.userData.sss = { color: { value: col }, power: { value: power }, strength: { value: strength } };
  mat.onBeforeCompile = (sh) => {
    if (!sh.fragmentShader.includes('#include <emissivemap_fragment>')) return;
    sh.uniforms.uSSSColor = mat.userData.sss.color;
    sh.uniforms.uSSSPower = mat.userData.sss.power;
    sh.uniforms.uSSSStrength = mat.userData.sss.strength;
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uSSSColor;\nuniform float uSSSPower;\nuniform float uSSSStrength;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 sssN = normalize( vNormal );
          vec3 sssV = normalize( vViewPosition );
          float sssF = 1.0 - clamp( abs( dot( sssN, sssV ) ), 0.0, 1.0 );
          totalEmissiveRadiance += uSSSColor * pow( sssF, uSSSPower ) * uSSSStrength;
        }`);
  };
  mat.customProgramCacheKey = () => 'sss';
}

/* ── СТУДИЯ ────────────────────────────────────────────────────────────────
 * RoomEnvironment.js в комплекте three нет — студия собрана вручную.
 * Круг 1: панели были узкие (0.2–0.55) и давали на стекле графичную нитку.
 * Круг 2: каждый софтбокс это ШИРОКАЯ мягкая панель + узкое горячее ядро
 * внутри неё, плюс две большие тусклые заливки, чтобы корпус нигде не падал
 * в ноль. Именно так выглядит замер видео: тёмное тело 18/255 и плавный
 * разгон до 100/255 к освещённой кромке — а не чёрное с белой линией. */
function buildStudio() {
  const s = new THREE.Scene();
  const panel = (w, h, hex, power, pos, look) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(hex).multiplyScalar(power), side: THREE.DoubleSide,
      })
    );
    m.position.set(...pos);
    m.lookAt(...(look || [0, 0, 0]));
    s.add(m);
    return m;
  };
  s.add(new THREE.Mesh(
    new THREE.BoxGeometry(26, 26, 26),
    new THREE.MeshBasicMaterial({ color: 0x030406, side: THREE.BackSide })
  ));

  // КЛЮЧ слева-спереди: мягкая широкая шторка + горячее ядро внутри
  panel(1.85, 6.2, 0xffe6c8, 2.10, [-2.95, 0.25, 1.75]);
  panel(0.62, 4.9, 0xfff0d8, 7.5, [-2.86, 0.35, 1.92]);
  // КОНТРОВОЙ справа-сзади: разбивает силуэт, «мокрая» кромка
  panel(1.15, 6.6, 0xffd6a8, 2.60, [2.85, 0.20, -1.55]);
  panel(0.55, 5.2, 0xffe0b8, 7.0, [2.78, 0.20, -1.42]);
  // вторая, холодная кромка слева-сзади
  panel(0.70, 5.0, 0xd6dcea, 2.20, [-2.70, 0.15, -2.20]);
  // верхний мазок по плечу и капсуле
  panel(3.0, 0.60, 0xfff2dd, 1.55, [0, 3.25, 0.55]);
  // тёплый отскок от стола
  panel(4.4, 1.5, 0x6a4b2a, 0.32, [0, -2.35, 2.30]);
  // ЗАЛИВКИ: тело стекла нигде не должно падать в чистый ноль
  panel(9.0, 7.5, 0x4a3520, 0.115, [0, 0.2, 5.6]);
  panel(7.0, 6.0, 0x33241a, 0.085, [0, 0.1, -5.2]);
  return s;
}

/* ── ПОСТ ───────────────────────────────────────────────────────────────────
 * Своя цепочка вместо EffectComposer + UnrealBloomPass.
 *
 * Причина не эстетическая, а замеренная: UnrealBloomPass поднимает восемь
 * отдельных программ (высокочастотный фильтр + пять ядер размытия + композит
 * + копия), и на ANGLE/HLSL слабой встройки каждая обходится в полсекунды —
 * почти четыре секунды к первому кадру. Здесь всего три программы:
 *   1) яркостная выборка с даунсэмплом в 1/4,
 *   2) одно ядро размытия, которое гоняется горизонтально и вертикально,
 *   3) финал: композит блума + ACES + sRGB + зерно + виньетка одним проходом.
 * Заодно основной кадр рисуется в MSAA-таргет — сглаживание бесплатно.  */
const FS_VERT = `varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BrightShader = {
  uniforms: { tSrc: { value: null }, uThresh: { value: 1.35 }, uTexel: { value: new THREE.Vector2() } },
  vertexShader: FS_VERT,
  fragmentShader: `
    uniform sampler2D tSrc; uniform float uThresh; uniform vec2 uTexel; varying vec2 vUv;
    void main(){
      // 4 отсчёта: даунсэмпл и лёгкое сглаживание одним движением
      vec3 c = texture2D(tSrc, vUv + uTexel * vec2( 0.5,  0.5)).rgb
             + texture2D(tSrc, vUv + uTexel * vec2(-0.5,  0.5)).rgb
             + texture2D(tSrc, vUv + uTexel * vec2( 0.5, -0.5)).rgb
             + texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb;
      c *= 0.25;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(c * smoothstep(uThresh, uThresh * 1.6, l), 1.0);
    }`,
};

const BlurShader = {
  uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
  vertexShader: FS_VERT,
  fragmentShader: `
    uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){
      // девятиточечный гаусс на линейных отсчётах
      vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
      c += (texture2D(tSrc, vUv + uDir * 1.3846).rgb + texture2D(tSrc, vUv - uDir * 1.3846).rgb) * 0.316216;
      c += (texture2D(tSrc, vUv + uDir * 3.2308).rgb + texture2D(tSrc, vUv - uDir * 3.2308).rgb) * 0.070270;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const FinalShader = {
  uniforms: {
    tSrc: { value: null }, tBloom: { value: null },
    uBloom: { value: 0.10 }, uExposure: { value: 0.96 },
    uTime: { value: 0 }, uGrain: { value: 0.040 }, uVig: { value: 0.44 },
  },
  vertexShader: FS_VERT,
  fragmentShader: `
    uniform sampler2D tSrc, tBloom;
    uniform float uBloom, uExposure, uTime, uGrain, uVig;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
    vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537;
                      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 IN  = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 OUT = mat3(1.60475,-0.10208,-0.00327,-0.53108, 1.10813,-0.07276,-0.07367,-0.00605, 1.07602);
      c *= 1.0 / 0.6;
      return clamp(OUT * rrt(IN * c), 0.0, 1.0);
    }
    vec3 srgb(vec3 c){
      return mix(pow(c, vec3(0.4166667)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308)));
    }
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
      c = srgb(aces(c * uExposure));
      float n = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c += n * uGrain * (0.35 + 0.9 * (1.0 - l));       // зерно в тенях сильнее
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVig * dot(d, d) * 1.15;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** Экранный треугольник/квад со своей камерой: одна пара на все проходы. */
function makeScreenQuad() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const cam = new THREE.Camera();
  const mesh = new THREE.Mesh(geo, null);
  mesh.frustumCulled = false;
  const sc = new THREE.Scene();
  sc.add(mesh);
  return { geo, cam, mesh, scene: sc };
}

/* ═══════════════════════════════════════════════════════════════════════════
   createBottle
   ═════════════════════════════════════════════════════════════════════════ */
export function createBottle(container, options = {}) {
  if (!container) throw new Error('createBottle: нужен контейнер');

  const auto = matchMedia('(max-width: 820px), (pointer: coarse)').matches;
  const o = Object.assign({
    label: 'chd',
    variant: 'photo',            // 'photo' — развёртка настоящей вырезки, 'hi' — резче, но не документ
    assets: ASSET_BASE,
    lite: undefined,             // мобильный режим: transmission off, дешёвое стекло
    dprCap: null,
    post: true,
    ground: true,                // стол, контактная тень, отражение
    backdrop: true,
    areaLights: true,
    adaptive: true,              // сама сбрасывает качество, если не держит fps
    fov: 26,
    onReady: null,
    onError: null,
    debug: false,
  }, options);

  const T0 = performance.now();
  const mark = (s) => { if (o.debug) console.log(`[b3d] ${s}: ${(performance.now() - T0).toFixed(0)} ms`); };

  const P0 = PRODUCTS[o.label] || PRODUCTS.chd;
  const SUF = o.variant === 'hi' ? '-hi' : '';
  // ВАЖНО: Object.assign копирует и явный undefined, поэтому проверяем именно
  // «не задано», иначе хост, передавший lite: undefined, ломает авто-определение.
  const lite = (o.lite === undefined || o.lite === null) ? auto : !!o.lite;

  /* ── DOM ── */
  const canvas = document.createElement('canvas');
  canvas.className = 'bottle3d__canvas';
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(canvas);

  let W = container.clientWidth || innerWidth;
  let H = container.clientHeight || innerHeight;

  /* ── рендерер ── */
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
  });
  const dprCap = o.dprCap != null ? o.dprCap : (lite ? 1.5 : 1.55);
  let DPR = Math.min(devicePixelRatio || 1, dprCap);
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.setClearColor(0x000000, 1);
  if ('transmissionResolutionScale' in renderer) {
    renderer.transmissionResolutionScale = lite ? 0.4 : 0.55;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(o.fov, W / H, 0.1, 100);
  camera.position.set(0, 0, 8.35);

  /* ── окружение ── */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const studio = buildStudio();
  const envRT = pmrem.fromScene(studio, 0.030);
  scene.environment = envRT.texture;
  mark("PMREM");
  studio.traverse((n) => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });

  /* ── свет ──
   * Круг 1 жёг спотами: точечный источник по стеклу roughness 0.04 даёт
   * дельта-блик, то есть «звезду», а после bloom — крест. Круг 2 работает
   * площадными источниками: RectAreaLight кладёт на стекло прямоугольную
   * полосу, которая при повороте течёт по корпусу, как в bottle-turn.mp4.
   *
   * Источники СОЗДАЮТСЯ в build(), уже зная, доехала ли библиотека LTC:
   * каждый лишний ТИП источника — это ветка в шейдере физического материала,
   * а на ANGLE/HLSL один такой материал компилируется секундами. Держим
   * ровно один набор: либо три площадных, либо (запасной путь) три спота. */
  const lights = { rect: [], spot: [] };
  let rectReady = false;
  const KEY_I = 9.5, RIM_I = 11, TOP_I = 3.0;

  const keyRect = new THREE.RectAreaLight(0xffe2bc, KEY_I, 1.10, 3.30);
  keyRect.position.set(-2.35, 0.55, 2.55);
  // Нижняя кромка контрового должна быть ВЫШЕ стола: при высоте 3.9 и центре
  // 0.35 она уходила под плоскость и заливала столешницу светлым пятном
  // в пустом углу кадра — это читалось как утечка света, а не как отражение.
  const rimRect = new THREE.RectAreaLight(0xffcf9a, RIM_I, 0.80, 3.10);
  rimRect.position.set(2.55, 0.80, -2.05);
  const topRect = new THREE.RectAreaLight(0xfff0d6, TOP_I, 2.10, 0.42);
  topRect.position.set(-0.35, 2.55, 1.30);
  lights.rect.push(keyRect, rimRect, topRect);

  // запасной путь: если LTC не доехал, площадные источники рисуют мусор
  const paperKey = new THREE.SpotLight(0xffe3bd, 34, 13, 0.68, 0.95, 2);
  paperKey.position.set(-2.05, 0.75, 3.55);
  const rimSpot = new THREE.SpotLight(0xffc98a, 26, 16, 0.62, 1.0, 2);
  rimSpot.position.set(3.2, 1.3, -3.2);
  lights.spot.push(paperKey, rimSpot);

  /* ── задник ── */
  let backdrop = null, backdropTex = null;
  if (o.backdrop) {
    backdropTex = makeBackdropTexture();
    backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 26),
      new THREE.MeshBasicMaterial({ map: backdropTex, toneMapped: true })
    );
    backdrop.position.set(0, 0.6, -7.2);
    backdrop.renderOrder = -10;
    scene.add(backdrop);
  }

  /* ── состояние ── */
  const state = {
    ready: false, progress: 0, spin: 0, spinTarget: 0,
    zoom: 0, zoomTarget: 0, lx: 0, ly: 0, mx: 0, my: 0,
    fps: 0, quality: lite ? 'lite' : 'high', visible: true, running: false,
    disposed: false, error: null,
  };

  const bottle = new THREE.Group();
  scene.add(bottle);
  const ground = new THREE.Group();
  scene.add(ground);

  const FRAME = { labelY: -0.45, labelR: 0.379, labelH: 1.34, floorY: -1.5 };
  const disposables = [];
  const track = (x) => { if (x) disposables.push(x); return x; };

  // На вертикальном экране бутылка во всю высоту наезжает на текст: отодвигаем
  // камеру и смотрим ниже центра — бутылка уходит в верхние две трети кадра.
  const WIDE = { z: 8.35, y: 0, fov: o.fov };
  // Дистанция общего плана задана для горизонтального кадра; хост может
  // прислать свой fov (главная берёт 21°, чтобы бутылка шла в обрез), поэтому
  // вертикальный экран отодвигаем ОТНОСИТЕЛЬНО базовой, а не абсолютным числом.
  const WIDE_Z = 8.35;
  function frameForAspect() {
    const portrait = (W / H) < 0.82;
    WIDE.z = portrait ? WIDE_Z * 1.27 : WIDE_Z;
    WIDE.y = portrait ? -0.62 : 0;
  }

  /* ── пост-цепочка ──────────────────────────────────────────────────────── */
  let hdrRT = null, bloomA = null, bloomB = null, quad = null;
  let matBright = null, matBlur = null, matFinal = null;
  const BLOOM_DIV = 4;

  function makeMat(def) {
    const u = {};
    for (const k in def.uniforms) {
      const v = def.uniforms[k].value;
      u[k] = { value: (v && v.isVector2) ? v.clone() : v };
    }
    return new THREE.ShaderMaterial({
      uniforms: u, vertexShader: def.vertexShader, fragmentShader: def.fragmentShader,
      depthTest: false, depthWrite: false,
    });
  }

  if (o.post) {
    // Кадр идёт в HDR-таргет: тонмаппинг и sRGB делает финальный проход,
    // поэтому у рендерера тонмаппинг выключен — иначе цвет обработается дважды.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const samples = lite ? 0 : 2;                      // MSAA вместо запаса по DPR
    hdrRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: true, stencilBuffer: false, samples,
    });
    const rtOpt = {
      type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false,
    };
    bloomA = new THREE.WebGLRenderTarget(1, 1, rtOpt);
    bloomB = new THREE.WebGLRenderTarget(1, 1, rtOpt);
    quad = makeScreenQuad();
    matBright = makeMat(BrightShader);
    matBlur = makeMat(BlurShader);
    matFinal = makeMat(FinalShader);
    matFinal.uniforms.uBloom.value = lite ? 0.075 : 0.11;
    matFinal.uniforms.uExposure.value = 0.96;
    // Круг 1: порог 1.15 + сила 0.19 превращали дельта-блик в крест на пол-экрана.
    // Круг 2: светятся только настоящие пересветы, и мягко.
    matBright.uniforms.uThresh.value = 1.35;
    resize();                                        // развернуть таргеты под контейнер
  }

  function renderFrame() {
    if (!o.post) { renderer.render(scene, camera); return; }
    renderer.setRenderTarget(hdrRT);
    renderer.render(scene, camera);

    quad.mesh.material = matBright;
    matBright.uniforms.tSrc.value = hdrRT.texture;
    matBright.uniforms.uTexel.value.set(1 / hdrRT.width, 1 / hdrRT.height);
    renderer.setRenderTarget(bloomA);
    renderer.render(quad.scene, quad.cam);

    quad.mesh.material = matBlur;
    matBlur.uniforms.tSrc.value = bloomA.texture;
    matBlur.uniforms.uDir.value.set(1 / bloomA.width, 0);
    renderer.setRenderTarget(bloomB);
    renderer.render(quad.scene, quad.cam);

    matBlur.uniforms.tSrc.value = bloomB.texture;
    matBlur.uniforms.uDir.value.set(0, 1 / bloomA.height);
    renderer.setRenderTarget(bloomA);
    renderer.render(quad.scene, quad.cam);

    quad.mesh.material = matFinal;
    matFinal.uniforms.tSrc.value = hdrRT.texture;
    matFinal.uniforms.tBloom.value = bloomA.texture;
    renderer.setRenderTarget(null);
    renderer.render(quad.scene, quad.cam);
  }

  /* ── загрузка текстур ── */
  const texLoader = new THREE.TextureLoader();
  const loadTex = (name, srgb) => new Promise((res) => {
    texLoader.load(o.assets + name, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      track(t);
      res(t);
    }, undefined, () => res(null));
  });

  const parts = {};

  async function build() {
    let P = FALLBACK_PROFILE, LI = { label: { wrapDeg: 130 } };
    try { const r = await fetch(o.assets + P0.profile); if (r.ok) P = await r.json(); } catch (e) { /* запасной профиль */ }
    const T = P0.tex(SUF);
    try { const r = await fetch(o.assets + T.info); if (r.ok) LI = await r.json(); } catch (e) { /* обхват по умолчанию */ }

    mark("json");
    const [labelColor, labelNormal, labelORM] = await Promise.all([
      loadTex(T.color, true), loadTex(T.normal, false), loadTex(T.orm, false),
    ]);

    mark("текстуры");
    // площадные источники: библиотека LTC тянется отдельно и только если нужна
    if (o.areaLights) {
      try {
        const m = await import('three/addons/lights/RectAreaLightUniformsLib.js');
        m.RectAreaLightUniformsLib.init();
        rectReady = true;
      } catch (e) { rectReady = false; /* без LTC площадные источники рисуют мусор */ }
    }
    if (rectReady) {
      scene.add(keyRect, rimRect, topRect);
    } else {
      scene.add(paperKey, paperKey.target, rimSpot, rimSpot.target);
    }

    mark("LTC");
    const SEG = lite ? 112 : 200;
    const yOff = -P.heightMm * MM / 2;
    FRAME.floorY = yOff;

    /* ── СТЕКЛО ────────────────────────────────────────────────────────────
     * thicknessMap: у пунта и плеча стекло собирается в массу, в корпусе
     * стенка тонкая. Постоянная толщина круга 1 давала «пустое стекло между
     * двумя кромками» — тело не набирало плотности нигде. */
    const glassGeo = track(latheFromPath(P.glass, SEG));
    const thickTex = track(makeThicknessTexture(P.glass));

    const glassMat = track(new THREE.MeshPhysicalMaterial({
      color: P0.glassTint,
      metalness: 0, roughness: 0.105,
      ior: 1.5, reflectivity: 0.5,
      transmission: lite ? 0 : 1,
      // thickness — это путь луча В СТЕКЛЕ, то есть стенка, а не диаметр
      // корпуса: 9.5 мм в самом толстом месте, карта режет до ~3 мм на корпусе.
      thickness: 0.095,
      thicknessMap: lite ? null : thickTex,
      attenuationColor: new THREE.Color(P0.glassAtten),
      attenuationDistance: 0.135,
      clearcoat: 1, clearcoatRoughness: 0.09,
      envMapIntensity: 1.0,
      side: THREE.FrontSide,
    }));
    if (lite) {
      glassMat.transparent = true;
      glassMat.opacity = 0.90;
      glassMat.color = new THREE.Color(0x0b1206);
      glassMat.envMapIntensity = 2.1;
      glassMat.roughness = 0.10;
    }
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.y = yOff;
    glass.renderOrder = 6;
    bottle.add(glass);
    parts.glass = glass;

    /* Внутренняя стенка: BackSide-подкладка. Без неё выше уровня вина видно
     * «наружу», горло пустое; с ней в горле появляется тёмное второе стекло
     * со своим френелем — ровно то, что видно в видео. */
    let glassInner = null;
    if (!lite) {
      // Намеренно MeshBasicMaterial: PBR-материал здесь стоил бы ещё одной
      // компиляции физического шейдера (на ANGLE это секунды), а видно
      // от подкладки только тёмный контур внутренней стенки в горле.
      const innerMat = track(new THREE.MeshBasicMaterial({
        color: 0x0a1207, transparent: true, opacity: 0.26, depthWrite: false,
        side: THREE.BackSide, toneMapped: true,
      }));
      glassInner = new THREE.Mesh(glassGeo, innerMat);
      glassInner.position.y = yOff;
      glassInner.renderOrder = 4;
      bottle.add(glassInner);
      parts.glassInner = glassInner;
    }

    /* ── ВИНО ──────────────────────────────────────────────────────────────
     * Непрозрачная тёмно-гранатовая масса + fake-SSS по френелю. */
    const WALL = 2.4;
    const winePath = [];
    for (const [h, r] of P.glass) {
      if (h > P.fillLevelMm) continue;
      winePath.push([h + 0.7, Math.max(0.2, r - WALL)]);
    }
    const last = winePath[winePath.length - 1];
    winePath.push([P.fillLevelMm, Math.max(0.2, last[1])]);
    winePath.push([P.fillLevelMm, 0]);

    const wineMat = track(new THREE.MeshStandardMaterial({
      color: P0.wine,
      roughness: 0.31, metalness: 0.05,
      emissive: new THREE.Color(0x3d0a14), emissiveIntensity: 0.95,
      envMapIntensity: 1.85,
    }));
    applyFakeSSS(wineMat, P0.wineRim, 2.4, 0.85);
    const wine = new THREE.Mesh(track(latheFromPath(winePath, SEG)), wineMat);
    wine.position.y = yOff;
    wine.renderOrder = 1;
    bottle.add(wine);
    parts.wine = wine;

    /* ── КАПСУЛА ── */
    const capsuleMat = track(new THREE.MeshStandardMaterial({
      color: P0.capsule, metalness: 0.88, roughness: 0.46,
      envMapIntensity: 0.95,
    }));
    const capsule = new THREE.Mesh(track(latheFromPath(P.capsule, SEG)), capsuleMat);
    capsule.position.y = yOff;
    bottle.add(capsule);
    parts.capsule = capsule;

    /* ── ЭТИКЕТКА ──────────────────────────────────────────────────────────
     * Бумага 0.3 мм: печатная поверхность + отдельный меш торца. */
    const WRAP = THREE.MathUtils.degToRad(LI.label?.wrapDeg || 130);
    const labH = (P.labelTopMm - P.labelBottomMm) * MM;
    const PAPER = 0.3 * MM;
    const rIn = P.bodyRMm * MM + 0.02 * MM;
    const rOut = rIn + PAPER;
    const labSeg = lite ? 72 : 144;

    const labGeo = track(new THREE.CylinderGeometry(rOut, rOut, labH, labSeg, 1, true, -WRAP / 2, WRAP));
    const labelMat = track(new THREE.MeshStandardMaterial({
      map: labelColor,
      normalMap: labelNormal,
      normalScale: new THREE.Vector2(0.62, 0.62),
      roughnessMap: labelORM, metalnessMap: labelORM,
      roughness: 1, metalness: 1,               // множители — реальные значения в карте
      color: 0xffffff,
      envMapIntensity: 0.55,
      side: THREE.FrontSide,
    }));
    const label = new THREE.Mesh(labGeo, labelMat);
    label.position.y = yOff + (P.labelBottomMm + P.labelTopMm) / 2 * MM;
    label.renderOrder = 2;
    bottle.add(label);
    parts.label = label;

    const edgeMat = track(new THREE.MeshStandardMaterial({
      color: 0x6d5a41, roughness: 0.82, metalness: 0,
      envMapIntensity: 0.5, side: THREE.DoubleSide,
    }));
    const edge = new THREE.Mesh(
      track(paperEdgeGeometry(rIn, rOut, labH, -WRAP / 2, WRAP / 2, labSeg)), edgeMat);
    edge.position.y = label.position.y;
    edge.renderOrder = 2;
    bottle.add(edge);
    parts.labelEdge = edge;

    /* ── КОНТРЭТИКЕТКА ── */
    const bWrap = WRAP * 0.84, bH = labH * 0.92;
    const backMat = track(new THREE.MeshStandardMaterial({
      color: 0x120e0e, roughness: 0.92, metalness: 0,
      side: THREE.FrontSide, envMapIntensity: 0.35,
    }));
    const back = new THREE.Mesh(
      track(new THREE.CylinderGeometry(rOut, rOut, bH, lite ? 56 : 112, 1, true, Math.PI - bWrap / 2, bWrap)),
      backMat);
    back.position.y = label.position.y;
    bottle.add(back);
    const backEdge = new THREE.Mesh(
      track(paperEdgeGeometry(rIn, rOut, bH, Math.PI - bWrap / 2, Math.PI + bWrap / 2, lite ? 56 : 112)), edgeMat);
    backEdge.position.y = label.position.y;
    bottle.add(backEdge);
    parts.back = back;

    /* ── СТОЛ, ТЕНЬ, ОТРАЖЕНИЕ ────────────────────────────────────────────
     * Без них бутылка висит. Стол — тёмный металл с «лужей» света в base
     * color: к краю диска отражение гаснет само, без прозрачности, поэтому
     * стол попадает в буфер transmission и стекло его честно преломляет. */
    if (o.ground) {
      const poolTex = track(makePoolTexture());
      // Гладкий металл отражал софтбокс студии буквальным светлым
      // прямоугольником на пустом месте. Шероховатости 0.6+ хватает, чтобы
      // это стало мягкой лужей, а не «утечкой света».
      // Диск стола радиусом 9, а «лужа» должна лежать вокруг бутылки, а не
      // растекаться на все 18 единиц: сжимаем текстуру втрое и центрируем.
      // За её краем ClampToEdge отдаёт почти чёрный — стол уходит в темноту.
      poolTex.repeat.set(3, 3);
      poolTex.offset.set(-1, -1);
      const floorMat = track(new THREE.MeshStandardMaterial({
        map: poolTex, color: 0xffffff,
        metalness: 0.82, roughness: lite ? 0.78 : 0.70,
        envMapIntensity: 0.55,
      }));
      const floor = new THREE.Mesh(track(new THREE.CircleGeometry(9.0, 64)), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = yOff - 0.002;
      ground.add(floor);
      parts.floor = floor;

      const refTex = track(makeReflectTexture(P));
      const refMat = track(new THREE.MeshBasicMaterial({
        map: refTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: lite ? 0.30 : 0.38, toneMapped: true,
      }));
      const RW = P.bodyRMm * 2.12 * MM, RD = 1.55;
      const reflect = new THREE.Mesh(track(new THREE.PlaneGeometry(RW, RD)), refMat);
      reflect.rotation.set(-Math.PI / 2, 0, Math.PI);
      reflect.position.set(0, yOff + 0.004, RD / 2);
      reflect.renderOrder = 8;   // отражение кладём ПОД тень
      ground.add(reflect);
      parts.reflect = reflect;

      const shTex = track(makeShadowTexture());
      const shMat = track(new THREE.MeshBasicMaterial({
        map: shTex, transparent: true, depthWrite: false, opacity: 0.90, toneMapped: false,
      }));
      // Тень рисуется ПОСЛЕ отражения: иначе аддитивный блик отражения
      // засвечивал контакт и бутылка снова висела.
      const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(2.40, 1.55)), shMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0.04, yOff + 0.006, 0.22);
      shadow.renderOrder = 9;
      ground.add(shadow);
      parts.shadow = shadow;
    }

    /* цели света */
    paperKey.target.position.set(0, label.position.y, 0.9);
    paperKey.target.updateMatrixWorld();
    rimSpot.target.position.set(0, yOff + 1.5, 0);
    rimSpot.target.updateMatrixWorld();
    keyRect.lookAt(0, label.position.y + 0.35, 0);
    rimRect.lookAt(0, yOff + 1.55, 0);
    topRect.lookAt(0, yOff + 2.35, 0);

    FRAME.labelY = label.position.y;
    FRAME.labelR = rOut;
    FRAME.labelH = labH;

    mark("сцена собрана");

    /* ── ПРОГРЕВ ───────────────────────────────────────────────────────────
     * Физический материал со стеклом на ANGLE компилируется в HLSL секундами,
     * и если не прогреть, первый кадр встаёт колом ПОСЛЕ того, как хост уже
     * убрал прелоадер. compileAsync использует KHR_parallel_shader_compile —
     * программы собираются параллельно, а не по очереди. Один прогонный кадр
     * добирает шейдеры пост-обработки, которые compileAsync не видит. */
    try {
      if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
      mark("шейдеры");
    } catch (e) { /* прогрев не обязателен */ }
    renderFrame();
    mark("первый кадр");

    state.ready = true;
    try { o.onReady && o.onReady(api); } catch (e) { /* колбэк хоста не должен ронять сцену */ }
  }

  /* ── адаптивное качество ───────────────────────────────────────────────── */
  let qStep = 0, qWindow = 0, qFrames = 0;
  function adapt(dt) {
    if (!o.adaptive || qStep >= 2) return;
    qWindow += dt; qFrames++;
    if (qWindow < 2.0) return;
    const f = qFrames / qWindow;
    qWindow = 0; qFrames = 0;
    if (f >= 48) return;
    qStep++;
    if (qStep === 1 && 'transmissionResolutionScale' in renderer) {
      renderer.transmissionResolutionScale = 0.35;
      state.quality = 'medium';
    } else {
      DPR = Math.max(1, DPR * 0.8);
      renderer.setPixelRatio(DPR);
      if (matFinal) matFinal.uniforms.uBloom.value = 0;   // блум — первое, чем жертвуем
      state.quality = 'low';
      resize();
    }
  }

  /* ── цикл ──────────────────────────────────────────────────────────────── */
  let raf = 0, frames = 0, fpsT = performance.now(), prevT = performance.now();

  function tick() {
    if (state.disposed) return;
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - prevT) / 1000, 0.05); prevT = now;
    if (!state.visible) return;

    state.mx += (state.lx - state.mx) * Math.min(1, dt * 3.2);
    state.my += (state.ly - state.my) * Math.min(1, dt * 3.2);
    state.spin += (state.spinTarget - state.spin) * Math.min(1, dt * 4.5);
    state.zoom += (state.zoomTarget - state.zoom) * Math.min(1, dt * 3.0);

    const z = state.zoom * state.zoom * (3 - 2 * state.zoom);
    bottle.rotation.y = state.spin + state.mx * 0.26 * (1 - z * 0.8);
    bottle.rotation.x = state.my * 0.040 * (1 - z);
    bottle.rotation.z = state.mx * 0.010 * (1 - z);
    if (parts.shadow) parts.shadow.material.opacity = 0.90 * (1 - z * 0.85);
    if (parts.reflect) parts.reflect.material.opacity = (lite ? 0.30 : 0.38) * (1 - z * 0.9);

    const dNear = FRAME.labelR
      + (FRAME.labelH * 0.5) / Math.tan(THREE.MathUtils.degToRad(WIDE.fov / 2)) * 1.04;
    const aimY = WIDE.y + (FRAME.labelY - WIDE.y) * z;
    camera.position.z = WIDE.z + (dNear - WIDE.z) * z;
    camera.position.y = aimY + state.my * -0.05 * (1 - z);
    camera.position.x = state.mx * 0.10 * (1 - z);
    camera.lookAt(0, aimY, 0);

    // На крупном плане свет ОТОДВИГАЕТСЯ и расширяется: близкий узкий
    // источник кладёт на бумагу горячее пятно и съедает буквы.
    keyRect.position.set(-2.35 + state.mx * 0.55 + z * 0.5, 0.55 - state.my * 0.45 - z * 0.9, 2.55 + z * 1.1);
    keyRect.lookAt(0, FRAME.labelY * z + (1 - z) * (FRAME.labelY + 0.35), 0);
    keyRect.intensity = (rectReady ? KEY_I : 0) * (1 + z * 0.75);
    paperKey.position.set(-2.05 - z * 0.8 + state.mx * 0.5, 0.75 - z * 0.55, 3.55 + z * 1.5);
    paperKey.angle = 0.62 + z * 0.22;

    if (matFinal) {
      matFinal.uniforms.uTime.value = now * 0.001;
      matFinal.uniforms.uVig.value = 0.44 - z * 0.18;
    }

    renderFrame();

    frames++;
    if (now - fpsT > 500) { state.fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
    adapt(dt);
  }

  /* ── ресайз / видимость ────────────────────────────────────────────────── */
  function resize() {
    W = container.clientWidth || innerWidth;
    H = container.clientHeight || innerHeight;
    if (!W || !H) return;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    frameForAspect();
    renderer.setSize(W, H, false);
    if (hdrRT) {
      const pw = Math.max(2, Math.round(W * DPR)), ph = Math.max(2, Math.round(H * DPR));
      hdrRT.setSize(pw, ph);
      bloomA.setSize(Math.max(2, Math.round(pw / BLOOM_DIV)), Math.max(2, Math.round(ph / BLOOM_DIV)));
      bloomB.setSize(bloomA.width, bloomA.height);
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const io = new IntersectionObserver((es) => {
    state.visible = es.some((e) => e.isIntersecting) && !document.hidden;
  }, { threshold: 0 });
  io.observe(container);
  const onVis = () => { state.visible = !document.hidden; };
  document.addEventListener('visibilitychange', onVis);

  /* ── API ───────────────────────────────────────────────────────────────── */
  const api = {
    /** Поворот по скроллу: 0..1 — полный оборот. */
    setProgress(p) { state.progress = p; state.spinTarget = p * Math.PI * 2; return api; },
    /** То же, но без инерции — для скриншотов и мгновенных переходов. */
    jumpProgress(p) { state.progress = p; state.spinTarget = p * Math.PI * 2; state.spin = state.spinTarget; return api; },
    /** Наезд в этикетку: 0 — общий план, 1 — бумага во весь кадр. */
    setZoom(v) { state.zoomTarget = clamp(v, 0, 1); return api; },
    jumpZoom(v) { state.zoomTarget = clamp(v, 0, 1); state.zoom = state.zoomTarget; return api; },
    /** Куда «смотрит» свет и наклон: -1..1. Хост обычно шлёт сюда курсор. */
    setLight(x, y) { state.lx = clamp(x, -1, 1); state.ly = clamp(y, -1, 1); return api; },
    /** Экспозиция — если герой должен уйти в тень под контент. */
    setExposure(v) {
      if (matFinal) matFinal.uniforms.uExposure.value = v; else renderer.toneMappingExposure = v;
      return api;
    },
    start() { if (!state.running) { state.running = true; prevT = performance.now(); tick(); } return api; },
    stop() { state.running = false; cancelAnimationFrame(raf); return api; },
    resize,
    isReady: () => state.ready,
    fps: () => state.fps,
    state,
    parts,
    /** ручки для приёмки и настройки */
    debug: {
      THREE, scene, camera, renderer, lights, parts, FRAME,
      keyRect, rimRect, topRect, paperKey, rimSpot,
      post: () => ({ matBright, matBlur, matFinal, hdrRT, bloomA }),
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      for (const d of disposables) { try { d.dispose && d.dispose(); } catch (e) { /* уже освобождён */ } }
      if (backdrop) { backdrop.geometry.dispose(); backdrop.material.dispose(); backdropTex && backdropTex.dispose(); }
      envRT.dispose(); pmrem.dispose();
      for (const rt of [hdrRT, bloomA, bloomB]) rt && rt.dispose();
      for (const m of [matBright, matBlur, matFinal]) m && m.dispose();
      quad && quad.geo.dispose();
      renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
      canvas.remove();
    },
  };

  build()
    .then(() => api.start())
    .catch((e) => {
      state.error = e;
      console.error('[bottle3d] сборка сцены не удалась:', e);
      try { o.onError && o.onError(e); } catch (_) { /* ignore */ }
    });

  return api;
}

export default createBottle;

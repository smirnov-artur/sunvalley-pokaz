/* «ТЕЧЕНИЕ ДОЛИНЫ» — приём Petros Vrellis на трёх полотнах долины в письме Ван Гога (закат над морем → ночь → закат над дорогой).
   Картина собрана целиком из мазков (Hertzmann, три кисти), каждый мазок — вечная частица со своим цветом. Мазки текут по
   авторскому полю (вихри неба, ореолы солнца и луны, море, пламя кипариса), корабли и повозка идут своим ходом, дома и люди
   стоят. Касание отклоняет поток, и картина возвращается: у каждого мазка есть «дом», который сам течёт по полю.
   Полотна сменяются морфингом мазок→мазок: всё закручивается, перекрашивается и собирается в следующую картину.
   Данные: prototype/assets/img/gen/painting/vrellis/ (meta.json, vg{k}.bin, vg{k}-obj.bin, vg{k}-field.bin, vg{k}-orient.bin, vg{k}.jpg,
   пекарни tools/paint/bake-strokes-vg.js и bake-fields.js). Параметры: ?live=24 (с на полотно) · ?morph=7 · ?speed=1 · ?touch=1
   · ?start=0 · ?hold=1 (не переключать) · ?dab=1 · ?field=1 (показать поле) */
const Q = new URLSearchParams(location.search);
const num = (k, d) => Q.has(k) ? parseFloat(Q.get(k)) : d;
const OPT = { live: num('live', 24), morph: num('morph', 7), speed: num('speed', 1), touch: num('touch', 1), start: Math.round(num('start', 0)), hold: num('hold', 0), dab: num('dab', 1), field: num('field', 0), spring: num('spring', 1.5), swirl: num('swirl', 1), breathe: num('breathe', 1) };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DIR = '../assets/img/gen/painting/vrellis/';
const SUN = [[0.435, 0.38], [0.5, 0.42], [0.24, 0.44]];

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
if (!gl) throw new Error('WebGL2 недоступен');
if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float недоступен');
const FLOAT_LINEAR = !!gl.getExtension('OES_texture_float_linear');

// ───────────── шейдеры ─────────────
const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;`;
const NOISE = `
float h11(float x){ return fract(sin(x * 12.9898) * 43758.5453); }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = h21(i), b = h21(i+vec2(1,0)), c = h21(i+vec2(0,1)), d = h21(i+vec2(1,1)); return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float fbm(vec2 p){ return vnoise(p) * 0.6 + vnoise(p * 2.1 + 5.3) * 0.4; }
vec2 dirOf(vec4 F){ float th = atan(F.g * 2.0 - 1.0, F.r * 2.0 - 1.0) * 0.5; return vec2(cos(th), sin(th)); }
vec2 velAt(sampler2D fieldT, sampler2D orientT, vec2 p, float asp, float mixK){
  vec4 F = texture(fieldT, p); vec2 V = F.xy; float sp = length(V); if (sp < 1e-6) return vec2(0.0);
  vec4 O = texture(orientT, p); vec2 o = dirOf(O); float coh = O.b;
  vec2 Vp = V * vec2(asp, 1.0); vec2 vd = Vp / length(Vp);
  float sg = dot(o, vd) < 0.0 ? -1.0 : 1.0; vec2 d = normalize(mix(vd, o * sg, coh * mixK));
  return d * vec2(1.0 / asp, 1.0) * sp; }
vec2 curlN(vec2 p, float t, float asp){ vec2 q = vec2(p.x * asp, p.y) * 2.2 + vec2(t * 0.05, -t * 0.03); float e = 0.02;
  float nx = fbm(q + vec2(e, 0.0)) - fbm(q - vec2(e, 0.0)); float ny = fbm(q + vec2(0.0, e)) - fbm(q - vec2(0.0, e));
  vec2 g = vec2(ny, -nx) / (2.0 * e); return vec2(g.x / asp, g.y); }`;
const VS_QUAD = `${HEAD}
layout(location=0) in vec2 aCorner; out vec2 vUv;
void main(){ vUv = aCorner * 0.5 + 0.5; gl_Position = vec4(aCorner, 0.0, 1.0); }`;
// состояние частиц: S0 = (px, py, hx, hy); S1 = (ang, len, wid, fade); S2 = (r, g, b, glow)
const FS_UPDATE = `${HEAD}
in vec2 vUv;
uniform sampler2D uS0, uS1, uS2, uPA, uPB, uCA, uCB, uOA, uOB, uFieldA, uFieldB, uOrientA, uOrientB, uFluid, uBaseA;
uniform float uDt, uTime, uSpeed, uTouch, uSpring, uMorph, uSnap, uSwirl, uAspA, uAspB, uInit;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1; layout(location=2) out vec4 o2;
${NOISE}
void main(){
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 PA = texelFetch(uPA, ij, 0), PB = texelFetch(uPB, ij, 0), CA = texelFetch(uCA, ij, 0), CB = texelFetch(uCB, ij, 0), OA = texelFetch(uOA, ij, 0), OB = texelFetch(uOB, ij, 0);
  if (uInit > 0.5) { o0 = vec4(PA.xy, PA.xy); o1 = vec4(PA.z, PA.w, CA.x, OA.z > 2.5 ? 0.0 : 1.0); o2 = vec4(CA.yzw, 0.0); return; }
  vec4 S0 = texture(uS0, vUv), S1 = texture(uS1, vUv), S2 = texture(uS2, vUv);
  vec2 p = S0.xy, h = S0.zw; float m = uMorph;
  bool morph = m >= 0.0;
  // ток: поле полотна A (и B во время смены), объекты идут своим ходом, статика стоит
  // ток для движения — чисто бездивергентное поле (мазки не сгущаются и не редеют); направление мазка по картине — при отрисовке
  vec2 vA = OA.z > 0.5 ? (OA.z < 1.5 ? OA.xy : vec2(0.0)) : velAt(uFieldA, uOrientA, h, uAspA, 0.25);
  vec2 v = vA;
  if (morph) { vec2 vB = OB.z > 0.5 ? (OB.z < 1.5 ? OB.xy : vec2(0.0)) : velAt(uFieldB, uOrientB, h, uAspB, 0.25); v = mix(vA, vB, m); }
  else if (OA.z < 0.5) {
    // правило живописца: мазок течёт, пока вокруг него краска его цвета; в чужом цвете он почти останавливается
    vec3 bc = textureLod(uBaseA, h, 3.0).rgb; float dc = distance(bc, S2.rgb);
    v *= mix(0.25, 1.0, 1.0 - smoothstep(0.3, 0.55, dc));
  }
  h += v * uSpeed * uDt;
  vec4 nS1 = S1; vec3 col = S2.rgb;
  if (morph) {
    // смена полотна — хореография: каждый мазок отрывается в своё время (картина растворяется мазками, а не лоскутами),
    // всё медленно поворачивается вокруг центра и завихряется, на середине пути мазок перекрашивается, к концу приходит
    // на своё место в следующей картине
    float seed = h21(vUv * 731.0); float start = seed * 0.45; float mm = clamp((m - start) / (1.0 - start), 0.0, 1.0);
    float sw = sin(m * 3.14159);
    vec2 rel = (h - vec2(0.5)) * vec2(uAspA, 1.0); vec2 rot = vec2(-rel.y, rel.x) * vec2(1.0 / uAspA, 1.0);
    h += rot * (0.22 * uSwirl * sw) * uDt;
    h += curlN(h + seed * 0.13, uTime, uAspA) * (0.05 * uSwirl * sin(mm * 3.14159)) * uDt;
    float rate = uSnap > 0.5 ? 1000.0 : (0.1 + 3.6 * smoothstep(0.35, 1.0, mm));
    float k = min(1.0, rate * uDt);
    h += (PB.xy - h) * k;
    float kc = uSnap > 0.5 ? 1.0 : min(1.0, (0.05 + 5.0 * smoothstep(0.4, 0.75, mm)) * uDt);
    // угол — по кратчайшей дуге; длина, ширина — плавно; цвет — быстро на середине смены
    float a0 = S1.x, a1 = PB.z; float da = atan(sin(a1 - a0), cos(a1 - a0)); nS1.x = a0 + da * k;
    nS1.y += (PB.w - S1.y) * k; nS1.z += (CB.x - S1.z) * k;
    col += (CB.yzw - col) * kc;
    float fadeB = OB.z > 2.5 ? 0.0 : 1.0; nS1.w += (fadeB - S1.w) * k;
  }
  // сам мазок: идёт с током, отклоняется рукой и пружиной возвращается к дому
  vec2 fl = texture(uFluid, p).xy * uTouch;
  p += (v * uSpeed + fl) * uDt; p += (h - p) * min(1.0, uSpring * uDt);
  if (uSnap > 0.5) p = h;
  o0 = vec4(p, h); o1 = nS1; o2 = vec4(col, S2.a);
}`;
const VS_DAB = `${HEAD}
layout(location=0) in vec2 aCorner;
uniform sampler2D uS0, uS1, uS2, uOrientA, uOrientB; uniform int uTex; uniform vec2 uC, uF, uSun; uniform float uZ, uDab, uAsp, uPxW, uMorph, uTime;
out vec2 vLoc; out vec3 vCol; out float vFade; out vec2 vAxes; out float vSeed;
${NOISE}
void main(){
  int id = gl_InstanceID; ivec2 ij = ivec2(id % uTex, id / uTex);
  vec4 S0 = texelFetch(uS0, ij, 0), S1 = texelFetch(uS1, ij, 0), S2 = texelFetch(uS2, ij, 0);
  vec2 p = S0.xy; float ang = S1.x;
  // в покое мазок ложится по направлению мазков картины в том месте, где он сейчас; в смене — по своему углу
  vec4 O = uMorph >= 0.0 && uMorph > 0.5 ? textureLod(uOrientB, p, 0.0) : textureLod(uOrientA, p, 0.0);
  vec2 d = dirOf(O); float coh = O.b; vec2 sd = vec2(cos(ang), sin(ang)); if (dot(d, sd) < 0.0) d = -d;
  float wOr = coh * (uMorph >= 0.0 ? 0.25 : 0.8); vec2 dir = normalize(mix(sd, d, wOr)); float a = atan(dir.y, dir.x);
  float len = S1.y * uDab, wid = S1.z * uDab; vec2 axes = vec2(len * 0.5, wid * 0.5);
  vec2 loc = aCorner * axes * 1.12;
  vec2 off = vec2(loc.x * cos(a) - loc.y * sin(a), loc.x * sin(a) + loc.y * cos(a));
  vec2 q = p + off / vec2(uPxW, uPxW / uAsp);
  vec2 s = (q - uC) * uZ / uF + 0.5;
  // солнце дышит: мазки у солнца чуть светлеют и гаснут
  float sd2 = distance(vec2(p.x * uAsp, p.y), vec2(uSun.x * uAsp, uSun.y)); float breath = 1.0 + 0.06 * sin(uTime * 0.5) * smoothstep(0.35, 0.0, sd2);
  vLoc = loc; vCol = S2.rgb * breath; vFade = S1.w; vAxes = axes; vSeed = float(id) * 0.618;
  gl_Position = (S1.w < 0.02) ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(s.x * 2.0 - 1.0, 1.0 - s.y * 2.0, 0.0, 1.0);
}`;
const FS_DAB = `${HEAD}
in vec2 vLoc; in vec3 vCol; in float vFade; in vec2 vAxes; in float vSeed; out vec4 o;
${NOISE}
void main(){
  vec2 n = vLoc / vAxes;
  // мазок: скруглённая лента с сужением к концам, чуть рваные края, щетина вдоль
  float taper = 1.0 - 0.25 * smoothstep(0.6, 1.0, abs(n.x));
  float rag = (vnoise(vec2(n.x * 4.0 + vSeed * 13.0, vSeed * 7.0)) - 0.5) * 0.18;
  float ay = 1.0 - smoothstep(taper - 0.22 + rag, taper + rag, abs(n.y));
  float ax = 1.0 - smoothstep(0.86, 1.0, abs(n.x));
  float a = ay * ax; if (a < 0.03) discard;
  float bris = 0.94 + 0.06 * sin(n.y * 9.0 + vSeed * 6.0);
  float relief = 1.0 + 0.07 * (-n.y) * smoothstep(0.3, 1.0, abs(n.y));
  o = vec4(vCol * bris * relief, a * vFade);
}`;
const FS_BASE = `${HEAD}
in vec2 vUv; out vec4 o; uniform sampler2D uBaseA, uBaseB, uFieldA; uniform vec2 uC, uF; uniform float uZ, uMorph, uShowField, uDark;
void main(){ vec2 suv = vec2(vUv.x, 1.0 - vUv.y); vec2 puv = uC + (suv - 0.5) * uF / uZ;
  vec3 a = textureLod(uBaseA, puv, 2.5).rgb; vec3 c = a; if (uMorph >= 0.0) c = mix(a, textureLod(uBaseB, puv, 2.5).rgb, uMorph);
  c *= uDark;
  if (uShowField > 0.5) { vec4 Fd = texture(uFieldA, puv); float sp = length(Fd.xy); c = mix(c, vec3(0.5 + 0.5 * Fd.x / max(sp, 1e-6), 0.5 + 0.5 * Fd.y / max(sp, 1e-6), Fd.w), min(1.0, sp * 40.0) * 0.8 + Fd.w * 0.5); }
  o = vec4(c, 1.0); }`;
const FS_VIG = `${HEAD}
in vec2 vUv; out vec4 o; void main(){ float v = smoothstep(1.6, 0.45, length((vUv - 0.5) * vec2(1.0, 1.15)) * 1.3); o = vec4(0.0, 0.0, 0.0, 0.22 * (1.0 - v)); }`;
const FS_ADV = `${HEAD}
in vec2 vUv; uniform sampler2D uVel; uniform float uDt, uDis; out vec4 o;
void main(){ vec2 c = vUv - uDt * texture(uVel, vUv).xy; o = vec4(texture(uVel, c).xy * uDis, 0.0, 1.0); }`;
const FS_SPLAT = `${HEAD}
in vec2 vUv; uniform sampler2D uVel; uniform vec2 uPoint, uForce; uniform float uRadius, uAsp, uMixK; out vec4 o;
void main(){ vec2 p = vUv - uPoint; p.x *= uAsp; float g = exp(-dot(p, p) / uRadius); vec2 vel = texture(uVel, vUv).xy; o = vec4(mix(vel, uForce, g * uMixK), 0.0, 1.0); }`;
const FS_CURL = `${HEAD}
in vec2 vUv; uniform sampler2D uVel; uniform vec2 uTexel; out vec4 o;
void main(){ float L = texture(uVel, vUv - vec2(uTexel.x, 0.0)).y, R = texture(uVel, vUv + vec2(uTexel.x, 0.0)).y;
  float B = texture(uVel, vUv - vec2(0.0, uTexel.y)).x, T = texture(uVel, vUv + vec2(0.0, uTexel.y)).x; o = vec4(0.5 * ((R - L) - (T - B)), 0.0, 0.0, 1.0); }`;
const FS_VORT = `${HEAD}
in vec2 vUv; uniform sampler2D uVel, uCurl; uniform vec2 uTexel; uniform float uDt, uStr; out vec4 o;
void main(){ float L = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x, T = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x, C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L)); force /= length(force) + 1e-4; force *= uStr * C; force.y *= -1.0;
  o = vec4(clamp(texture(uVel, vUv).xy + force * uDt, -10.0, 10.0), 0.0, 1.0); }`;
const FS_DIV = `${HEAD}
in vec2 vUv; uniform sampler2D uVel; uniform vec2 uTexel; out vec4 o;
void main(){ float L = texture(uVel, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uVel, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uVel, vUv - vec2(0.0, uTexel.y)).y, T = texture(uVel, vUv + vec2(0.0, uTexel.y)).y; o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0); }`;
const FS_CLR = `${HEAD}
in vec2 vUv; uniform sampler2D uPrs; out vec4 o; void main(){ o = vec4(texture(uPrs, vUv).x * 0.8, 0.0, 0.0, 1.0); }`;
const FS_PRS = `${HEAD}
in vec2 vUv; uniform sampler2D uPrs, uDiv; uniform vec2 uTexel; out vec4 o;
void main(){ float L = texture(uPrs, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uPrs, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uPrs, vUv - vec2(0.0, uTexel.y)).x, T = texture(uPrs, vUv + vec2(0.0, uTexel.y)).x; o = vec4((L + R + B + T - texture(uDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0); }`;
const FS_GRAD = `${HEAD}
in vec2 vUv; uniform sampler2D uPrs, uVel; uniform vec2 uTexel; out vec4 o;
void main(){ float L = texture(uPrs, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uPrs, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uPrs, vUv - vec2(0.0, uTexel.y)).x, T = texture(uPrs, vUv + vec2(0.0, uTexel.y)).x; o = vec4(texture(uVel, vUv).xy - vec2(R - L, T - B), 0.0, 1.0); }`;
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function prog(vs, fs) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
const P = { upd: prog(VS_QUAD, FS_UPDATE), dab: prog(VS_DAB, FS_DAB), base: prog(VS_QUAD, FS_BASE), vig: prog(VS_QUAD, FS_VIG), adv: prog(VS_QUAD, FS_ADV), splat: prog(VS_QUAD, FS_SPLAT),
  curl: prog(VS_QUAD, FS_CURL), vort: prog(VS_QUAD, FS_VORT), div: prog(VS_QUAD, FS_DIV), clr: prog(VS_QUAD, FS_CLR), prs: prog(VS_QUAD, FS_PRS), grad: prog(VS_QUAD, FS_GRAD) };
const U = (p, n) => gl.getUniformLocation(p, n);
const bind = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); };

// ───────────── текстуры ─────────────
function mkTex(w, h, ifmt, fmt, type, data, filter) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data || null);
  const f = filter === undefined ? gl.LINEAR : filter; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
function mkFbo(texs) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  if (texs.length > 1) gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i)); const s = gl.checkFramebufferStatus(gl.FRAMEBUFFER); if (s !== gl.FRAMEBUFFER_COMPLETE) throw new Error('FBO ' + s); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return f; }
function mkRT(w, h, ifmt, fmt, type, filter) { const t = mkTex(w, h, ifmt, fmt, type, null, filter); return { t, f: mkFbo([t]) }; }
function pingpong(mk) { let a = mk(), b = mk(); return { get r() { return a; }, get w() { return b; }, swap() { const t = a; a = b; b = t; } }; }
function imageTexture(img) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
const loadImage = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(url)); im.src = url; });
const loadBin = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); });

// ───────────── состояние ─────────────
let META, TEX = 1, N = 0, PAINT = [], state, vel, prs, divT, curlT, vaoQuad, vaoPart, W = 0, H = 0, FLW = 256, FLH = 180;
const st = { time: 0, a: 0, b: 1, morph: -1, tLive: 0, snap: 0, init: 1, count: 0, fpsN: 0, fpsT: 0, adapted: false }; const pending = []; let cam = { z: 1, c: [0.5, 0.5], f: [1, 1], asp: 1.4 };
function resize() { W = innerWidth; H = innerHeight; const dpr = Math.min(devicePixelRatio, 1.5); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; }
addEventListener('resize', resize); resize();
function setup() {
  TEX = META.tex; N = META.N; st.count = Math.min(N, Math.round(num('n', N)));   // мазки идут от крупных к мелким: лимит отрезает самые мелкие
  FLW = 256; FLH = Math.round(256 / META.paintings[0].asp);
  vel = pingpong(() => mkRT(FLW, FLH, gl.RG16F, gl.RG, gl.HALF_FLOAT)); prs = pingpong(() => mkRT(FLW, FLH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST));
  divT = mkRT(FLW, FLH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST); curlT = mkRT(FLW, FLH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST);
  state = pingpong(() => { const s0 = mkTex(TEX, TEX, gl.RGBA32F, gl.RGBA, gl.FLOAT, null, gl.NEAREST), s1 = mkTex(TEX, TEX, gl.RGBA32F, gl.RGBA, gl.FLOAT, null, gl.NEAREST), s2 = mkTex(TEX, TEX, gl.RGBA32F, gl.RGBA, gl.FLOAT, null, gl.NEAREST); return { s0, s1, s2, f: mkFbo([s0, s1, s2]) }; });
  const q = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, q); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  vaoQuad = gl.createVertexArray(); gl.bindVertexArray(vaoQuad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const s = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, s); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  vaoPart = gl.createVertexArray(); gl.bindVertexArray(vaoPart); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
}
const drawQuad = () => { gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLES, 0, 6); };
function updateCamera() {
  const A = st.morph >= 0 ? PAINT[st.a].asp * (1 - st.morph) + PAINT[st.b].asp * st.morph : PAINT[st.a].asp;
  const Av = W / H; let fx, fy; if (Av >= A) { fx = 1; fy = A / Av; } else { fy = 1; fx = Av / A; }
  const z = 1.02 + (REDUCED ? 0 : OPT.breathe) * 0.01 * Math.sin(st.time * 0.09); const hx = 0.5 * fx / z, hy = 0.5 * fy / z;
  cam = { z, c: [Math.min(1 - hx, Math.max(hx, 0.5)), Math.min(1 - hy, Math.max(hy, 0.5))], f: [fx, fy], asp: A };
}
const toPaint = (sx, sy) => [cam.c[0] + (sx - 0.5) * cam.f[0] / cam.z, cam.c[1] + (sy - 0.5) * cam.f[1] / cam.z];

// ───────────── шаги ─────────────
function fluidStep(dt) {
  gl.disable(gl.BLEND); gl.viewport(0, 0, FLW, FLH); const tx = 1 / FLW, ty = 1 / FLH; const n = pending.length;
  for (const s of pending) { gl.useProgram(P.splat); gl.bindFramebuffer(gl.FRAMEBUFFER, vel.w.f); bind(0, vel.r.t); gl.uniform1i(U(P.splat, 'uVel'), 0);
    gl.uniform2f(U(P.splat, 'uPoint'), s.p[0], s.p[1]); gl.uniform2f(U(P.splat, 'uForce'), s.f[0], s.f[1]); gl.uniform1f(U(P.splat, 'uRadius'), 0.004); gl.uniform1f(U(P.splat, 'uAsp'), cam.asp);
    gl.uniform1f(U(P.splat, 'uMixK'), (1 - Math.exp(-dt * 12)) / n); drawQuad(); vel.swap(); }
  pending.length = 0;
  gl.useProgram(P.curl); gl.bindFramebuffer(gl.FRAMEBUFFER, curlT.f); bind(0, vel.r.t); gl.uniform1i(U(P.curl, 'uVel'), 0); gl.uniform2f(U(P.curl, 'uTexel'), tx, ty); drawQuad();
  gl.useProgram(P.vort); gl.bindFramebuffer(gl.FRAMEBUFFER, vel.w.f); bind(0, vel.r.t); bind(1, curlT.t); gl.uniform1i(U(P.vort, 'uVel'), 0); gl.uniform1i(U(P.vort, 'uCurl'), 1);
  gl.uniform2f(U(P.vort, 'uTexel'), tx, ty); gl.uniform1f(U(P.vort, 'uDt'), dt); gl.uniform1f(U(P.vort, 'uStr'), 20); drawQuad(); vel.swap();
  gl.useProgram(P.div); gl.bindFramebuffer(gl.FRAMEBUFFER, divT.f); bind(0, vel.r.t); gl.uniform1i(U(P.div, 'uVel'), 0); gl.uniform2f(U(P.div, 'uTexel'), tx, ty); drawQuad();
  gl.useProgram(P.clr); gl.bindFramebuffer(gl.FRAMEBUFFER, prs.w.f); bind(0, prs.r.t); gl.uniform1i(U(P.clr, 'uPrs'), 0); drawQuad(); prs.swap();
  gl.useProgram(P.prs); gl.uniform1i(U(P.prs, 'uPrs'), 0); gl.uniform1i(U(P.prs, 'uDiv'), 1); gl.uniform2f(U(P.prs, 'uTexel'), tx, ty); bind(1, divT.t);
  for (let i = 0; i < 10; i++) { gl.bindFramebuffer(gl.FRAMEBUFFER, prs.w.f); bind(0, prs.r.t); drawQuad(); prs.swap(); }
  gl.useProgram(P.grad); gl.bindFramebuffer(gl.FRAMEBUFFER, vel.w.f); bind(0, prs.r.t); bind(1, vel.r.t); gl.uniform1i(U(P.grad, 'uPrs'), 0); gl.uniform1i(U(P.grad, 'uVel'), 1); gl.uniform2f(U(P.grad, 'uTexel'), tx, ty); drawQuad(); vel.swap();
  gl.useProgram(P.adv); gl.bindFramebuffer(gl.FRAMEBUFFER, vel.w.f); bind(0, vel.r.t); gl.uniform1i(U(P.adv, 'uVel'), 0); gl.uniform1f(U(P.adv, 'uDt'), dt); gl.uniform1f(U(P.adv, 'uDis'), 1 / (1 + 1.0 * dt)); drawQuad(); vel.swap();
}
function particlesStep(dt) {
  const A = PAINT[st.a], B = PAINT[st.b];
  gl.disable(gl.BLEND); gl.viewport(0, 0, TEX, TEX); gl.useProgram(P.upd); gl.bindFramebuffer(gl.FRAMEBUFFER, state.w.f);
  const tex = [state.r.s0, state.r.s1, state.r.s2, A.P, B.P, A.C, B.C, A.O, B.O, A.field, B.field, A.orient, B.orient, vel.r.t, A.base];
  const names = ['uS0', 'uS1', 'uS2', 'uPA', 'uPB', 'uCA', 'uCB', 'uOA', 'uOB', 'uFieldA', 'uFieldB', 'uOrientA', 'uOrientB', 'uFluid', 'uBaseA'];
  tex.forEach((t, i) => { bind(i, t); gl.uniform1i(U(P.upd, names[i]), i); });
  gl.uniform1f(U(P.upd, 'uDt'), dt); gl.uniform1f(U(P.upd, 'uTime'), st.time); gl.uniform1f(U(P.upd, 'uSpeed'), REDUCED ? 0 : OPT.speed); gl.uniform1f(U(P.upd, 'uTouch'), OPT.touch);
  gl.uniform1f(U(P.upd, 'uSpring'), OPT.spring); gl.uniform1f(U(P.upd, 'uMorph'), st.morph); gl.uniform1f(U(P.upd, 'uSnap'), st.snap); gl.uniform1f(U(P.upd, 'uSwirl'), OPT.swirl);
  gl.uniform1f(U(P.upd, 'uAspA'), A.asp); gl.uniform1f(U(P.upd, 'uAspB'), B.asp); gl.uniform1f(U(P.upd, 'uInit'), st.init);
  drawQuad(); state.swap(); st.init = 0; st.snap = 0;
}
function present() {
  const A = PAINT[st.a], B = PAINT[st.b];
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.disable(gl.BLEND);
  gl.useProgram(P.base); bind(0, A.base); bind(1, B.base); bind(2, A.field); gl.uniform1i(U(P.base, 'uBaseA'), 0); gl.uniform1i(U(P.base, 'uBaseB'), 1); gl.uniform1i(U(P.base, 'uFieldA'), 2);
  gl.uniform2f(U(P.base, 'uC'), cam.c[0], cam.c[1]); gl.uniform2f(U(P.base, 'uF'), cam.f[0], cam.f[1]); gl.uniform1f(U(P.base, 'uZ'), cam.z); gl.uniform1f(U(P.base, 'uMorph'), st.morph); gl.uniform1f(U(P.base, 'uShowField'), OPT.field); gl.uniform1f(U(P.base, 'uDark'), 0.9 - (st.morph >= 0 ? 0.62 * Math.sin(Math.PI * st.morph) : 0)); drawQuad();
  if (OPT.field < 0.5) {
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(P.dab); gl.bindVertexArray(vaoPart);
    bind(0, state.r.s0); bind(1, state.r.s1); bind(2, state.r.s2); bind(3, A.orient); bind(4, B.orient);
    ['uS0', 'uS1', 'uS2', 'uOrientA', 'uOrientB'].forEach((n, i) => gl.uniform1i(U(P.dab, n), i));
    const sun = st.morph >= 0 ? [SUN[st.a][0] * (1 - st.morph) + SUN[st.b][0] * st.morph, SUN[st.a][1] * (1 - st.morph) + SUN[st.b][1] * st.morph] : SUN[st.a];
    gl.uniform1i(U(P.dab, 'uTex'), TEX); gl.uniform2f(U(P.dab, 'uC'), cam.c[0], cam.c[1]); gl.uniform2f(U(P.dab, 'uF'), cam.f[0], cam.f[1]); gl.uniform2f(U(P.dab, 'uSun'), sun[0], sun[1]);
    gl.uniform1f(U(P.dab, 'uZ'), cam.z); gl.uniform1f(U(P.dab, 'uDab'), OPT.dab); gl.uniform1f(U(P.dab, 'uAsp'), cam.asp); gl.uniform1f(U(P.dab, 'uPxW'), A.w); gl.uniform1f(U(P.dab, 'uMorph'), st.morph); gl.uniform1f(U(P.dab, 'uTime'), st.time);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, st.count); gl.bindVertexArray(null);
  }
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(P.vig); drawQuad(); gl.disable(gl.BLEND);
}

// ───────────── смена полотен ─────────────
const cap = document.getElementById('cap'), pre = document.getElementById('pre'), titles = [...document.querySelectorAll('[data-title]')];
function showTitle(k) { titles.forEach((el, i) => el.classList.toggle('on', i === k)); }
function startMorph() { if (st.morph >= 0) return; st.b = (st.a + 1) % PAINT.length; st.morph = 0; titles.forEach(el => el.classList.remove('on')); }
function timeline(dt) {
  if (st.morph >= 0) { st.morph += dt / OPT.morph; if (st.morph >= 1) { st.snap = 1; st.morph = -1; st.a = st.b; st.b = (st.a + 1) % PAINT.length; st.tLive = 0; setTimeout(() => showTitle(st.a), 800); } }
  else { st.tLive += dt; if (!OPT.hold && st.tLive > OPT.live) startMorph(); }
}
addEventListener('click', () => startMorph()); addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'ArrowRight') startMorph(); });
let lastPtr = null;
addEventListener('pointermove', (e) => { const now = performance.now(); const p = toPaint(e.clientX / W, e.clientY / H);
  if (lastPtr && !REDUCED) { const dtp = Math.max(0.004, (now - lastPtr.t) / 1000); let vx = (p[0] - lastPtr.p[0]) / dtp, vy = (p[1] - lastPtr.p[1]) / dtp; const sp = Math.hypot(vx, vy), mx = 1.5; if (sp > mx) { vx *= mx / sp; vy *= mx / sp; }
    pending.push({ p, f: [vx * 0.45, vy * 0.45] }); if (pending.length > 4) pending.splice(0, pending.length - 4); }
  lastPtr = { p, t: now }; }, { passive: true });
document.documentElement.addEventListener('mouseleave', () => { lastPtr = null; });

// ───────────── кадр ─────────────
let lastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!lastT) lastT = now; const dt = Math.min((now - lastT) / 1000, 1 / 30) || 1 / 60; lastT = now; st.time += dt;
  timeline(dt); updateCamera(); fluidStep(dt); particlesStep(dt); present();
  if (!st.adapted) { st.fpsN++; st.fpsT += dt; if (st.fpsT > 3) { st.adapted = true; const fps = st.fpsN / st.fpsT; if (fps < 40) st.count = Math.round(st.count * 0.6); } }
}
(async () => {
  META = await fetch(DIR + 'meta.json').then(r => r.json());
  const ids = META.paintings.map(p => p.id);
  // компактные данные: <id>.q (16 байт на мазок), <id>-orient.png, <id>-field.bin (Float32), <id>.jpg
  const all = await Promise.all(ids.map(async (id, k) => { const [q, fld, ori, img] = await Promise.all([loadBin(DIR + id + '.q'), loadBin(DIR + id + '-field.bin'), loadImage(DIR + id + '-orient.png'), loadImage(DIR + id + '.jpg')]); return { id, k, q, fld, ori, img }; }));
  setup();
  for (const a of all) { const m = META.paintings[a.k], f = META.fields[a.id]; const NP = TEX * TEX; const U16 = new Uint16Array(a.q, 0, NP * 4), U8 = new Uint8Array(a.q, NP * 8, NP * 8);
    const PA = new Float32Array(NP * 4), CA = new Float32Array(NP * 4), OB = new Float32Array(NP * 4);
    for (let i = 0; i < NP; i++) { const flag = U8[i * 8 + 6]; PA[i * 4] = flag > 2.5 ? -1 : U16[i * 4] / 65535; PA[i * 4 + 1] = flag > 2.5 ? -1 : U16[i * 4 + 1] / 65535; PA[i * 4 + 2] = U16[i * 4 + 2] / 65535 * 2 * Math.PI - Math.PI; PA[i * 4 + 3] = U16[i * 4 + 3] / 100;
      CA[i * 4] = U8[i * 8] / 8; CA[i * 4 + 1] = U8[i * 8 + 1] / 255; CA[i * 4 + 2] = U8[i * 8 + 2] / 255; CA[i * 4 + 3] = U8[i * 8 + 3] / 255;
      OB[i * 4] = (U8[i * 8 + 4] - 128) / 127 * 0.004; OB[i * 4 + 1] = (U8[i * 8 + 5] - 128) / 127 * 0.004; OB[i * 4 + 2] = flag; OB[i * 4 + 3] = U8[i * 8 + 7]; }
    const ot = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, ot); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.ori);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    PAINT[a.k] = { id: a.id, w: m.w, h: m.h, asp: m.asp, P: mkTex(TEX, TEX, gl.RGBA32F, gl.RGBA, gl.FLOAT, PA, gl.NEAREST), C: mkTex(TEX, TEX, gl.RGBA32F, gl.RGBA, gl.FLOAT, CA, gl.NEAREST), O: mkTex(TEX, TEX, gl.RGBA32F, gl.RGBA, gl.FLOAT, OB, gl.NEAREST),
      field: mkTex(f.gw, f.gh, gl.RGBA32F, gl.RGBA, gl.FLOAT, new Float32Array(a.fld), FLOAT_LINEAR ? gl.LINEAR : gl.NEAREST), orient: ot, base: imageTexture(a.img) }; }
  st.a = OPT.start % PAINT.length; st.b = (st.a + 1) % PAINT.length; updateCamera();
  pre.classList.add('off'); requestAnimationFrame(frame); setTimeout(() => { showTitle(st.a); cap && cap.classList.add('on'); }, 1200);
})().catch(e => { console.error(e); pre.classList.add('off'); });

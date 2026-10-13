// Any CSS colour a browser can hand back, as numbers — so no instrument skips a colour because of how it is written.
//
// A capture reads computed styles, and a modern product authors colours in oklch (Tailwind v4), hsl channels
// (shadcn on Tailwind v3), color-mix() (computed by the browser to color(srgb …) or oklab(…)) or plain rgb().
// An instrument that parses only rgb() and hex reports "no off-system colour" on such a product while it saw
// none of them. parseColor() returns null for what it cannot read, and the callers count the nulls.
//
//   parseColor('oklch(0.21 0.006 285.885)') -> { r, g, b, a, lab: [L, a, b], space: 'oklch', clipped }
//   r/g/b are sRGB 0–255 (clipped into gamut, `clipped` says so); lab is OKLab, computed from the source space
//   directly, so the distance between two oklch colours is not distorted by the sRGB clip.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const mul = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

const XYZ65_TO_LIN_SRGB = [[3.2409699419045226, -1.537383177570094, -0.4986107602930034], [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559], [0.05563007969699366, -0.20397695888897652, 1.0569715142428786]];
const D50_TO_D65 = [[0.9554734527042182, -0.023098536874261423, 0.0632593086610217], [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008], [0.012314001688319899, -0.020507696433477912, 1.3303659366080753]];
const LIN_P3_TO_XYZ65 = [[0.4865709486482162, 0.26566769316909306, 0.19821728523436247], [0.2289745640697488, 0.6917385218365064, 0.079286914093745], [0, 0.04511338185890264, 1.043944368900976]];

export function linSrgbToOklab([R, G, B]) {
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklabToLinSrgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
function cieLabToLinSrgb([L, a, b]) {
  const k = 24389 / 27, e = 216 / 24389;
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const xyz50 = [fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k, L > k * e ? ((L + 16) / 116) ** 3 : L / k, fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k];
  const white = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
  return mul(XYZ65_TO_LIN_SRGB, mul(D50_TO_D65, xyz50.map((v, i) => v * white[i])));
}

// A number, a percentage (of `full`), or `none` (0).
const num = (t, full = 1) => { if (t == null || t === 'none') return 0; return t.endsWith('%') ? (parseFloat(t) / 100) * full : parseFloat(t); };
const hue = (t) => { if (!t || t === 'none') return 0; const v = parseFloat(t); return t.endsWith('turn') ? v * 360 : t.endsWith('rad') ? (v * 180) / Math.PI : t.endsWith('grad') ? v * 0.9 : v; };
const alphaOf = (t) => (t == null ? 1 : clamp(num(t, 1), 0, 1));

function fromLinSrgb(lin, a, space, lab) {
  const clipped = lin.some((c) => c < -1e-4 || c > 1 + 1e-4);
  const [r, g, b] = lin.map((c) => clamp(linToSrgb(clamp(c, 0, 1)), 0, 1) * 255);
  return { r, g, b, a, space, clipped, lab: lab ?? linSrgbToOklab(lin.map((c) => clamp(c, 0, 1))) };
}

const NAMED = { transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1] };

/** Parse one CSS colour. Returns null when it is not a colour this function can read (the caller counts it). */
export function parseColor(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (NAMED[s]) { const [r, g, b, a] = NAMED[s]; return fromLinSrgb([r, g, b].map((c) => srgbToLin(c / 255)), a, 'named'); }
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1];
    if (![3, 4, 6, 8].includes(h.length)) return null;
    const full = h.length <= 4 ? h.split('').map((c) => c + c).join('') : h;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return fromLinSrgb([r, g, b].map((c) => srgbToLin(c / 255)), a, 'hex');
  }
  m = /^([a-z-]+)\((.*)\)$/.exec(s);
  if (!m) return null;
  const fn = m[1];
  // Both syntaxes: "r, g, b, a" and "r g b / a".
  const body = m[2].replace(/,/g, ' ').replace(/\s*\/\s*/, ' / ').trim();
  const [main, alphaPart] = body.split(' / ');
  const parts = main.split(/\s+/);
  // The legacy comma syntax carries alpha as a fourth argument: rgba(0, 0, 0, 0.1). color() never does.
  const legacyAlpha = m[2].includes(',') && parts.length === 4 && !alphaPart ? parts.pop() : undefined;
  const a = alphaOf(alphaPart ?? legacyAlpha);
  if (fn === 'rgb' || fn === 'rgba') {
    if (parts.length !== 3) return null;
    return fromLinSrgb(parts.map((t) => srgbToLin(clamp(num(t, 255), 0, 255) / 255)), a, 'rgb');
  }
  if (fn === 'hsl' || fn === 'hsla') {
    if (parts.length !== 3) return null;
    const H = hue(parts[0]), S = num(parts[1].endsWith('%') ? parts[1] : parts[1] + '%', 1), L = num(parts[2].endsWith('%') ? parts[2] : parts[2] + '%', 1);
    const f = (n) => { const k = (n + H / 30) % 12; return L - S * Math.min(L, 1 - L) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return fromLinSrgb([f(0), f(8), f(4)].map(srgbToLin), a, 'hsl');
  }
  if (fn === 'oklab' || fn === 'oklch') {
    if (parts.length !== 3) return null;
    const L = num(parts[0], 1);
    const lab = fn === 'oklab' ? [L, num(parts[1], 0.4), num(parts[2], 0.4)] : (() => { const C = num(parts[1], 0.4), h = (hue(parts[2]) * Math.PI) / 180; return [L, C * Math.cos(h), C * Math.sin(h)]; })();
    return fromLinSrgb(oklabToLinSrgb(lab), a, fn, lab);
  }
  if (fn === 'lab' || fn === 'lch') {
    if (parts.length !== 3) return null;
    const L = num(parts[0], 100);
    const lab = fn === 'lab' ? [L, num(parts[1], 125), num(parts[2], 125)] : (() => { const C = num(parts[1], 150), h = (hue(parts[2]) * Math.PI) / 180; return [L, C * Math.cos(h), C * Math.sin(h)]; })();
    return fromLinSrgb(cieLabToLinSrgb(lab), a, fn);
  }
  if (fn === 'color') {
    const [space, ...ch] = parts;
    if (ch.length !== 3) return null;
    const v = ch.map((t) => num(t, 1));
    if (space === 'srgb') return fromLinSrgb(v.map(srgbToLin), a, 'color(srgb)');
    if (space === 'srgb-linear') return fromLinSrgb(v, a, 'color(srgb-linear)');
    if (space === 'display-p3') return fromLinSrgb(mul(XYZ65_TO_LIN_SRGB, mul(LIN_P3_TO_XYZ65, v.map(srgbToLin))), a, 'color(display-p3)');
    return null;
  }
  return null;
}

/** '#rrggbb', or '#rrggbbaa' when the colour is not opaque. */
export function toHex(c) {
  const h = (x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${c.a < 1 ? h(c.a * 255) : ''}`.toUpperCase();
}

/** Distance in OKLab. */
export const oklabDistance = (x, y) => Math.hypot(x.lab[0] - y.lab[0], x.lab[1] - y.lab[1], x.lab[2] - y.lab[2]);

// The small value languages inside an SVG: colours, lengths and transforms. Pure.

// ---------------------------------------------------------------- colours

const NAMES =
  'aliceblue f0f8ff,antiquewhite faebd7,aqua 00ffff,aquamarine 7fffd4,azure f0ffff,beige f5f5dc,bisque ffe4c4,black 000000,blanchedalmond ffebcd,blue 0000ff,blueviolet 8a2be2,brown a52a2a,burlywood deb887,cadetblue 5f9ea0,chartreuse 7fff00,chocolate d2691e,coral ff7f50,cornflowerblue 6495ed,cornsilk fff8dc,crimson dc143c,cyan 00ffff,darkblue 00008b,darkcyan 008b8b,darkgoldenrod b8860b,darkgray a9a9a9,darkgreen 006400,darkgrey a9a9a9,darkkhaki bdb76b,darkmagenta 8b008b,darkolivegreen 556b2f,darkorange ff8c00,darkorchid 9932cc,darkred 8b0000,darksalmon e9967a,darkseagreen 8fbc8f,darkslateblue 483d8b,darkslategray 2f4f4f,darkslategrey 2f4f4f,darkturquoise 00ced1,darkviolet 9400d3,deeppink ff1493,deepskyblue 00bfff,dimgray 696969,dimgrey 696969,dodgerblue 1e90ff,firebrick b22222,floralwhite fffaf0,forestgreen 228b22,fuchsia ff00ff,gainsboro dcdcdc,ghostwhite f8f8ff,gold ffd700,goldenrod daa520,gray 808080,green 008000,greenyellow adff2f,grey 808080,honeydew f0fff0,hotpink ff69b4,indianred cd5c5c,indigo 4b0082,ivory fffff0,khaki f0e68c,lavender e6e6fa,lavenderblush fff0f5,lawngreen 7cfc00,lemonchiffon fffacd,lightblue add8e6,lightcoral f08080,lightcyan e0ffff,lightgoldenrodyellow fafad2,lightgray d3d3d3,lightgreen 90ee90,lightgrey d3d3d3,lightpink ffb6c1,lightsalmon ffa07a,lightseagreen 20b2aa,lightskyblue 87cefa,lightslategray 778899,lightslategrey 778899,lightsteelblue b0c4de,lightyellow ffffe0,lime 00ff00,limegreen 32cd32,linen faf0e6,magenta ff00ff,maroon 800000,mediumaquamarine 66cdaa,mediumblue 0000cd,mediumorchid ba55d3,mediumpurple 9370db,mediumseagreen 3cb371,mediumslateblue 7b68ee,mediumspringgreen 00fa9a,mediumturquoise 48d1cc,mediumvioletred c71585,midnightblue 191970,mintcream f5fffa,mistyrose ffe4e1,moccasin ffe4b5,navajowhite ffdead,navy 000080,oldlace fdf5e6,olive 808000,olivedrab 6b8e23,orange ffa500,orangered ff4500,orchid da70d6,palegoldenrod eee8aa,palegreen 98fb98,paleturquoise afeeee,palevioletred db7093,papayawhip ffefd5,peachpuff ffdab9,peru cd853f,pink ffc0cb,plum dda0dd,powderblue b0e0e6,purple 800080,rebeccapurple 663399,red ff0000,rosybrown bc8f8f,royalblue 4169e1,saddlebrown 8b4513,salmon fa8072,sandybrown f4a460,seagreen 2e8b57,seashell fff5ee,sienna a0522d,silver c0c0c0,skyblue 87ceeb,slateblue 6a5acd,slategray 708090,slategrey 708090,snow fffafa,springgreen 00ff7f,steelblue 4682b4,tan d2b48c,teal 008080,thistle d8bfd8,tomato ff6347,turquoise 40e0d0,violet ee82ee,wheat f5deb3,white ffffff,whitesmoke f5f5f5,yellow ffff00,yellowgreen 9acd32';
const NAME_MAP = new Map(NAMES.split(',').map((p) => p.split(' ') as [string, string]));

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

/** `#rrggbb`, or `#rrggbbaa` when it is not fully opaque. */
export function toHex(c: Rgba): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${c.a < 1 ? hex2(c.a * 255) : ''}`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** A CSS colour as red, green, blue and alpha, or null when it isn't one this reader knows (including "none"). */
export function parseColor(input: string): Rgba | null {
  const v = input.trim().toLowerCase();
  if (!v || v === 'none') return null;
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (v[0] === '#') {
    let h = v.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  const fn = /^(rgba?|hsla?)\(\s*([^)]*)\)$/.exec(v);
  if (fn) {
    const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const pct = (p: string, full: number) => (p.endsWith('%') ? (parseFloat(p) / 100) * full : parseFloat(p));
    const alpha = parts[3] === undefined ? 1 : clamp(pct(parts[3], 1), 0, 1);
    if (fn[1].startsWith('rgb')) {
      const rgb = parts.slice(0, 3).map((p) => clamp(pct(p, 255), 0, 255));
      if (rgb.some((x) => Number.isNaN(x))) return null;
      return { r: rgb[0], g: rgb[1], b: rgb[2], a: Number.isNaN(alpha) ? 1 : alpha };
    }
    const h = parseFloat(parts[0]);
    const s = clamp(parseFloat(parts[1]) / 100, 0, 1);
    const l = clamp(parseFloat(parts[2]) / 100, 0, 1);
    if ([h, s, l].some((x) => Number.isNaN(x))) return null;
    const [r, g, b] = hslToRgb(h, s, l);
    return { r, g, b, a: Number.isNaN(alpha) ? 1 : alpha };
  }
  const named = NAME_MAP.get(v);
  if (named) return { r: parseInt(named.slice(0, 2), 16), g: parseInt(named.slice(2, 4), 16), b: parseInt(named.slice(4, 6), 16), a: 1 };
  return null;
}

// ---------------------------------------------------------------- numbers and lengths

const UNITS: Record<string, number> = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, q: 96 / 101.6 };

/**
 * A length in user units. Plain numbers and px as they are, print units at 96 to the inch; `em` and `ex` against the
 * font size, and percentages against `of`. Null when there is nothing to read.
 */
export function parseLength(v: string | undefined, of = 0, fontSize = 16): number | null {
  if (v === undefined) return null;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(v);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (!u) return n;
  if (u === '%') return (n / 100) * of;
  if (u === 'em') return n * fontSize;
  if (u === 'ex') return n * fontSize * 0.5;
  if (u === 'rem') return n * 16;
  return u in UNITS ? n * UNITS[u] : null;
}

/** A list of plain numbers separated by spaces and commas. */
export function parseNumbers(v: string | undefined): number[] {
  if (!v) return [];
  const out: number[] = [];
  for (const m of v.matchAll(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi)) out.push(parseFloat(m[0]));
  return out;
}

// ---------------------------------------------------------------- transforms

/** [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f (the same as SVG's matrix()). */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m1` applied after `m2` (m1 * m2). */
export function mul(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export const apply = (m: Matrix, x: number, y: number): { x: number; y: number } => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/** How much the matrix scales lengths on average (the square root of its area change). */
export const meanScale = (m: Matrix): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

export function invert(m: Matrix): Matrix | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det || !Number.isFinite(det)) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

/** A transform attribute ("translate(10 20) rotate(45)"). Null when it can't be read; `bad` says which part was not understood. */
export function parseTransform(v: string | undefined): Matrix | null {
  if (v === undefined || !v.trim()) return IDENTITY;
  let m: Matrix = IDENTITY;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let seen = 0;
  let last = 0;
  for (let t = re.exec(v); t; t = re.exec(v)) {
    if (v.slice(last, t.index).replace(/[\s,]/g, '')) return null;
    last = re.lastIndex;
    seen++;
    const a = parseNumbers(t[2]);
    let n: Matrix;
    switch (t[1]) {
      case 'matrix':
        if (a.length !== 6) return null;
        n = [a[0], a[1], a[2], a[3], a[4], a[5]];
        break;
      case 'translate':
        if (a.length < 1) return null;
        n = [1, 0, 0, 1, a[0], a[1] ?? 0];
        break;
      case 'scale':
        if (a.length < 1) return null;
        n = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
        break;
      case 'rotate': {
        if (a.length < 1) return null;
        const r = (a[0] * Math.PI) / 180;
        const c = Math.cos(r);
        const s = Math.sin(r);
        n = [c, s, -s, c, 0, 0];
        if (a.length >= 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case 'skewX':
        if (a.length < 1) return null;
        n = [1, 0, Math.tan((a[0] * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        if (a.length < 1) return null;
        n = [1, Math.tan((a[0] * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        return null;
    }
    m = mul(m, n);
  }
  if (!seen || v.slice(last).replace(/[\s,]/g, '')) return null;
  return m.every(Number.isFinite) ? m : null;
}

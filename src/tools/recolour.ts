/**
 * "Recolour the whole animation" (palette swap): one colour swapped for another on every frame and every layer, in
 * vector shapes (fills, lines, gradients, text, particles, symbol washes) and pixel drawings (tiles too), plus the
 * swatches. With "close colours too", colours near the one picked shift by the same amount, so shading made from
 * nearby colours comes along. Pure: works on a document and returns a new one.
 */
import type { Color, Doc, Drawing, Shape } from '../core/format';
import { recolourGradient } from '../core/gradient';

type RGB = [number, number, number];

function parse(c: string): { rgb: RGB; alpha: string } | null {
  let t = c.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3,4}$/i.test(t)) t = [...t].map((x) => x + x).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(t)) return null;
  const n = (i: number) => parseInt(t.slice(i, i + 2), 16);
  return { rgb: [n(0), n(2), n(4)], alpha: t.slice(6) };
}

const h2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const hex = (rgb: RGB, alpha = '') => '#' + h2(rgb[0]) + h2(rgb[1]) + h2(rgb[2]) + alpha;

export interface RecolourOptions {
  /** 0 = exactly this colour only, up to 100 = very loosely. */
  closeness?: number;
  /** Also change the stage colour when it matches. */
  background?: boolean;
}

/** Largest RGB distance that counts as close at `closeness` 100. */
const MAX_DIST = 160;

/** Maps one colour to its new colour (or itself). See-through stays as it was. */
export function colourMapper(from: Color, to: Color, closeness = 0): (rgb: RGB) => RGB | null {
  const f = parse(from)?.rgb;
  const t = parse(to)?.rgb;
  if (!f || !t) return () => null;
  const reach = (Math.max(0, Math.min(100, closeness)) / 100) * MAX_DIST;
  const d: RGB = [t[0] - f[0], t[1] - f[1], t[2] - f[2]];
  return (c) => {
    if (c[0] === f[0] && c[1] === f[1] && c[2] === f[2]) return t;
    if (reach <= 0) return null;
    const dist = Math.hypot(c[0] - f[0], c[1] - f[1], c[2] - f[2]);
    if (dist > reach) return null;
    return [c[0] + d[0], c[1] + d[1], c[2] + d[2]].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB;
  };
}

/** A colour-string version of the mapper, counting what it changes. */
function stringMapper(map: (rgb: RGB) => RGB | null, count: { n: number }): (c: Color) => Color {
  return (c) => {
    const p = parse(c);
    if (!p) return c;
    const m = map(p.rgb);
    if (!m) return c;
    const out = hex(m, p.alpha);
    if (out.toLowerCase() !== c.toLowerCase()) count.n++;
    return out;
  };
}

function recolourShape(s: Shape, f: (c: Color) => Color): Shape {
  switch (s.type) {
    case 'stroke': {
      const color = f(s.color);
      return color === s.color ? s : { ...s, color };
    }
    case 'fill': {
      const color = f(s.color);
      const gradient = s.gradient && recolourGradient(s.gradient, f);
      if (color === s.color && gradient === s.gradient) return s;
      return { ...s, color, ...(gradient ? { gradient } : {}) };
    }
    case 'path': {
      const fill = s.fill && f(s.fill);
      const sc = s.stroke && f(s.stroke.color);
      const fg = s.fillGradient && recolourGradient(s.fillGradient, f);
      const sg = s.strokeGradient && recolourGradient(s.strokeGradient, f);
      if (fill === s.fill && sc === (s.stroke?.color ?? null) && fg === s.fillGradient && sg === s.strokeGradient) return s;
      const out = { ...s, fill, stroke: s.stroke && sc ? { ...s.stroke, color: sc } : s.stroke };
      if (fg) out.fillGradient = fg;
      if (sg) out.strokeGradient = sg;
      return out;
    }
    case 'text': {
      const color = f(s.color);
      return color === s.color ? s : { ...s, color };
    }
    case 'particles': {
      const colorStart = f(s.colorStart);
      const colorEnd = f(s.colorEnd);
      return colorStart === s.colorStart && colorEnd === s.colorEnd ? s : { ...s, colorStart, colorEnd };
    }
    case 'instance': {
      if (!s.tint) return s;
      const color = f(s.tint.color);
      return color === s.tint.color ? s : { ...s, tint: { ...s.tint, color } };
    }
  }
}

/** A drawing with the colour swapped, the same object when nothing in it changed, and how many pixels changed. */
function recolourDrawing(d: Drawing, map: (rgb: RGB) => RGB | null, f: (c: Color) => Color): { d: Drawing; pixels: number } {
  if (d.kind === 'vector') {
    let changed = false;
    const shapes = d.shapes.map((s) => {
      const n = recolourShape(s, f);
      if (n !== s) changed = true;
      return n;
    });
    return { d: changed ? { ...d, shapes } : d, pixels: 0 };
  }
  if (d.kind === 'pixel') {
    const src = d.pixels;
    let out: Uint8ClampedArray | null = null;
    let pixels = 0;
    // Most pixel art uses few colours, so each colour is looked up once.
    const memo = new Map<number, RGB | null>();
    for (let i = 0; i < src.length; i += 4) {
      if (src[i + 3] === 0) continue;
      const key = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
      let m = memo.get(key);
      if (m === undefined) {
        m = map([src[i], src[i + 1], src[i + 2]]);
        if (m && m[0] === src[i] && m[1] === src[i + 1] && m[2] === src[i + 2]) m = null;
        memo.set(key, m);
      }
      if (!m) continue;
      out ??= new Uint8ClampedArray(src);
      out[i] = m[0];
      out[i + 1] = m[1];
      out[i + 2] = m[2];
      pixels++;
    }
    return { d: out ? { ...d, pixels: out } : d, pixels };
  }
  return { d, pixels: 0 };
}

export interface RecolourResult {
  doc: Doc;
  /** Colours changed in shapes and swatches. */
  colours: number;
  pixels: number;
  /** Drawings that changed. */
  drawings: string[];
}

/** The document with `from` swapped for `to` everywhere. Unchanged parts keep their objects. */
export function recolourDoc(doc: Doc, from: Color, to: Color, opts: RecolourOptions = {}): RecolourResult {
  const map = colourMapper(from, to, opts.closeness ?? 0);
  const count = { n: 0 };
  const f = stringMapper(map, count);
  let pixels = 0;
  const drawings: Record<string, Drawing> = {};
  const changed: string[] = [];
  for (const [id, d] of Object.entries(doc.drawings)) {
    const r = recolourDrawing(d, map, f);
    drawings[id] = r.d;
    pixels += r.pixels;
    if (r.d !== d) changed.push(id);
  }
  const swatches = doc.swatches.map((s) => {
    const color = f(s.color);
    return color === s.color ? s : { ...s, color };
  });
  const background = opts.background && doc.background ? f(doc.background) : doc.background;
  const out: Doc = { ...doc, drawings: changed.length ? drawings : doc.drawings, swatches, background };
  return { doc: out, colours: count.n, pixels, drawings: changed };
}

/** The colours an animation uses, most used first (shapes count once each, pixels by how many there are, scaled down). */
export function usedColours(doc: Doc, limit = 32): Color[] {
  const counts = new Map<string, number>();
  const note = (c: string | null | undefined, n = 1) => {
    if (!c) return;
    const p = parse(c);
    if (!p) return;
    const k = hex(p.rgb);
    counts.set(k, (counts.get(k) ?? 0) + n);
  };
  for (const d of Object.values(doc.drawings)) {
    if (d.kind === 'vector') {
      for (const s of d.shapes) {
        if (s.type === 'stroke' || s.type === 'fill' || s.type === 'text') note(s.color);
        if (s.type === 'path') {
          note(s.fill);
          note(s.stroke?.color);
        }
        if (s.type === 'particles') {
          note(s.colorStart);
          note(s.colorEnd);
        }
        for (const g of s.type === 'fill' ? [s.gradient] : s.type === 'path' ? [s.fillGradient, s.strokeGradient] : []) for (const st of g?.stops ?? []) note(st.color);
      }
    } else if (d.kind === 'pixel') {
      const px = d.pixels;
      const local = new Map<number, number>();
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        const k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
        local.set(k, (local.get(k) ?? 0) + 1);
      }
      for (const [k, n] of local) note('#' + k.toString(16).padStart(6, '0'), Math.max(1, Math.round(n / 16)));
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([c]) => c);
}

/**
 * "Recolour the whole animation" (palette swap): one colour swapped for another on every frame and every layer, in
 * vector shapes (fills, lines, gradients, text, particles, symbol washes) and pixel drawings (tiles too), plus the
 * swatches, and the colours in layer and folder effects (glow, shadow, outline). With "close colours too", colours near the one picked shift by the same amount, so shading made from
 * nearby colours comes along. Pure: works on a document and returns a new one.
 */
import type { Color, Doc, Drawing, Layer, LayerEffect, LayerFolder, PaletteColourChange } from '../core/format';
import { paletteScope, isEditingVariation, recolourOpenVariation } from '../artboards/variations';
import { recolourShape, shapeColours } from './shapeColour';

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
function stringMapper(map: (rgb: RGB) => RGB | null, count: { n: number }, swaps?: Map<string, string>): (c: Color) => Color {
  return (c) => {
    const p = parse(c);
    if (!p) return c;
    const m = map(p.rgb);
    if (!m) return c;
    const out = hex(m, p.alpha);
    if (out.toLowerCase() !== c.toLowerCase()) {
      count.n++;
      swaps?.set(hex(p.rgb), hex(m));
    }
    return out;
  };
}

/** A drawing with the colour swapped, the same object when nothing in it changed, and how many pixels changed. */
function recolourDrawing(d: Drawing, map: (rgb: RGB) => RGB | null, f: (c: Color) => Color, swaps?: Map<string, string>): { d: Drawing; pixels: number } {
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
      swaps?.set(hex([src[i], src[i + 1], src[i + 2]]), hex(m));
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

/** An effect stack with its colour settings swapped, the same array when nothing changed. */
function recolourEffects(fx: LayerEffect[] | undefined, f: (c: Color) => Color): LayerEffect[] | undefined {
  if (!fx?.length) return fx;
  let changed = false;
  const out = fx.map((e) => {
    let values: LayerEffect['values'] | null = null;
    for (const [k, v] of Object.entries(e.values)) {
      if (typeof v !== 'string') continue;
      const n = f(v);
      if (n === v) continue;
      values ??= { ...e.values };
      values[k] = n;
    }
    if (!values) return e;
    changed = true;
    return { ...e, values };
  });
  return changed ? out : fx;
}

function recolourLayers(layers: Layer[], f: (c: Color) => Color): Layer[] {
  let changed = false;
  const out = layers.map((l) => {
    const effects = recolourEffects(l.effects, f);
    if (effects === l.effects) return l;
    changed = true;
    return { ...l, effects };
  });
  return changed ? out : layers;
}

export interface RecolourResult {
  doc: Doc;
  /** Colours changed in shapes and swatches. */
  colours: number;
  pixels: number;
  /** Drawings that changed. */
  drawings: string[];
  /** Inside a variation: the colours as they show there, and what each became (the variation keeps these as its colourway). */
  swaps: PaletteColourChange[];
  /** The open artboard is a variation: only it changes, and what it shares with the original (swatches, folders, symbols) is left alone. */
  inVariation: boolean;
}

/** The document with `from` swapped for `to` everywhere (inside a variation: in its own drawings only). Unchanged parts keep their objects. */
export function recolourDoc(doc: Doc, from: Color, to: Color, opts: RecolourOptions = {}): RecolourResult {
  const map = colourMapper(from, to, opts.closeness ?? 0);
  const inVariation = isEditingVariation(doc);
  const scope = inVariation ? paletteScope(doc) : () => true;
  const count = { n: 0 };
  const swaps = new Map<string, string>();
  // Colours in drawings are noted as swaps (a variation keeps them); the rest are only counted.
  const f = stringMapper(map, count, swaps);
  const fx = stringMapper(map, count);
  let pixels = 0;
  const drawings: Record<string, Drawing> = {};
  const changed: string[] = [];
  for (const [id, d] of Object.entries(doc.drawings)) {
    if (!scope(id)) {
      drawings[id] = d;
      continue;
    }
    const r = recolourDrawing(d, map, f, swaps);
    drawings[id] = r.d;
    pixels += r.pixels;
    if (r.d !== d) changed.push(id);
  }
  // Swatches belong to the original: a variation leaves them.
  let swatchesChanged = false;
  const swatches = inVariation
    ? doc.swatches
    : doc.swatches.map((s) => {
        const color = fx(s.color);
        if (color === s.color) return s;
        swatchesChanged = true;
        return { ...s, color };
      });
  const background = opts.background && doc.background ? fx(doc.background) : doc.background;
  const out: Doc = { ...doc, drawings: changed.length ? drawings : doc.drawings, swatches: swatchesChanged ? swatches : doc.swatches, background };
  // Effects on layers, folders and the layers inside symbols.
  out.layers = recolourLayers(doc.layers, fx);
  if (doc.folders && !inVariation) {
    let any = false;
    const folders: Record<string, LayerFolder> = {};
    for (const [id, fo] of Object.entries(doc.folders)) {
      const effects = recolourEffects(fo.effects, fx);
      folders[id] = effects === fo.effects ? fo : { ...fo, effects };
      if (effects !== fo.effects) any = true;
    }
    if (any) out.folders = folders;
  }
  if (doc.symbols && !inVariation) {
    let any = false;
    const symbols: NonNullable<Doc['symbols']> = {};
    for (const [id, sy] of Object.entries(doc.symbols)) {
      const layers = recolourLayers(sy.layers, fx);
      symbols[id] = layers === sy.layers ? sy : { ...sy, layers };
      if (layers !== sy.layers) any = true;
    }
    if (any) out.symbols = symbols;
  }
  return { doc: out, colours: count.n, pixels, drawings: changed, swaps: [...swaps].map(([a, b]) => ({ from: a, to: b })), inVariation };
}

/** Puts a recolour into the document being edited: changed drawings, swatches, stage colour and effects. In a variation the drawings become its colourway. */
export function applyRecolour(d: Doc, r: RecolourResult): void {
  if (r.inVariation) recolourOpenVariation(d, r.swaps);
  else for (const id of r.drawings) d.drawings[id] = r.doc.drawings[id];
  // Only when a swatch really changes (writing the same ones again would count as a change to what a variation shares).
  if (r.doc.swatches.some((s, i) => s.color !== d.swatches[i]?.color)) d.swatches = r.doc.swatches;
  d.background = r.doc.background;
  r.doc.layers.forEach((l, i) => {
    if (d.layers[i] && d.layers[i].id === l.id && l.effects) d.layers[i].effects = l.effects;
  });
  if (r.doc.folders) for (const [id, fo] of Object.entries(r.doc.folders)) if (d.folders?.[id] && fo.effects) d.folders[id].effects = fo.effects;
  if (r.doc.symbols)
    for (const [id, sy] of Object.entries(r.doc.symbols))
      sy.layers.forEach((l, i) => {
        const dl = d.symbols?.[id]?.layers[i];
        if (dl && dl.id === l.id && l.effects) dl.effects = l.effects;
      });
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
  // Inside a variation, only what it shows (not the original's own drawings behind it).
  const scope = isEditingVariation(doc) ? paletteScope(doc) : () => true;
  for (const [id, d] of Object.entries(doc.drawings)) {
    if (!scope(id)) continue;
    if (d.kind === 'vector') {
      for (const s of d.shapes) for (const c of shapeColours(s)) note(c);
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
  const noteFx = (fx: LayerEffect[] | undefined) => {
    for (const e of fx ?? []) for (const v of Object.values(e.values)) if (typeof v === 'string') note(v);
  };
  for (const l of doc.layers) noteFx(l.effects);
  for (const fo of Object.values(doc.folders ?? {})) noteFx(fo.effects);
  for (const sy of Object.values(doc.symbols ?? {})) for (const l of sy.layers) noteFx(l.effects);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([c]) => c);
}

/**
 * Soft paint maths: how a soft edge falls off, how many passes build up to a flow, how a pixel's coverage turns into a
 * colour, and how a smooth edge becomes a crisp one by dithering. Pure functions, no DOM, so they can be tested alone.
 */
import type { RGBA } from '../canvas/pixels';

export type SoftKind = 'airbrush' | 'soft-brush' | 'soft-eraser' | 'highlighter' | 'smudge';
/** Smooth: see-through pixels, a true soft edge. Crisp: every pixel is all or nothing, dithered so the edge still reads as soft. */
export type EdgeMode = 'smooth' | 'crisp';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The narrowest soft edge a smooth brush gets, in pixels, so even a fully hard brush is not jagged. */
export const MIN_SMOOTH_EDGE = 0.75;

/**
 * How much of the brush reaches a pixel `dist` away from its middle, 0 to 1. Full strength out to `hardness` of the
 * radius, then a smooth fall (an S curve) to nothing at the edge. Hardness 1 is a hard disc, and hardness 0 starts
 * falling straight from the middle. `minEdge` is the narrowest fall allowed, in pixels.
 */
export function falloff(dist: number, radius: number, hardness: number, minEdge = 0): number {
  if (radius <= 0) return 0;
  const h = clamp01(hardness);
  const w = Math.max((1 - h) * radius, minEdge);
  if (w <= 0) return dist < radius ? 1 : 0;
  const inner = radius - w;
  if (dist >= radius) return 0;
  const t = (dist - inner) / w;
  if (t <= 0) return 1;
  return 1 - t * t * (3 - 2 * t);
}

/** The distance between dabs for a brush of this width: a tenth of it, and never under half a pixel. */
export function dabStep(diameter: number): number {
  return Math.max(0.5, Math.max(0.5, diameter) * 0.1);
}

/** Adds a strength to what the stroke has put on a pixel, so holding still builds up and never passes 1. */
export const buildUp = (have: number, add: number): number => have + add * (1 - have);

/** A pixel keeps the strongest dab that touched it, so a stroke crossing itself does not darken. Going over it with a new stroke does. */
export const holdAt = (have: number, add: number): number => (add > have ? add : have);

/** The pixel's four-by-four ordered dither threshold, 0 to 1 (never 0 and never 1). The same on every stroke, so strokes line up. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function threshold(x: number, y: number): number {
  const mx = ((x % 4) + 4) % 4;
  const my = ((y % 4) + 4) % 4;
  return (BAYER[my * 4 + mx] + 0.5) / 16;
}

/** Turns a smooth coverage into all or nothing for this pixel, so a soft edge becomes a dither of two colours that already exist. */
export const crispen = (cov: number, x: number, y: number): number => (cov > threshold(x, y) ? 1 : 0);

/** How each tool lays its paint on a pixel. */
export const KIND_INFO: Record<SoftKind, { label: string; blend: 'over' | 'erase' | 'multiply' | 'smudge' }> = {
  airbrush: { label: 'Airbrush', blend: 'over' },
  'soft-brush': { label: 'Soft brush', blend: 'over' },
  'soft-eraser': { label: 'Soft eraser', blend: 'erase' },
  highlighter: { label: 'Highlighter', blend: 'multiply' },
  smudge: { label: 'Smudge', blend: 'smudge' },
};

/** Somewhere to write a pixel: a plain list or a typed array. */
export type Out = number[] | Uint8Array | Uint8ClampedArray;

const byte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** `color` laid over `base` with `cov` of its strength (normal paint). */
export function paintOver(base: ArrayLike<number>, bi: number, color: RGBA, cov: number, out: Out): void {
  const sa = clamp01(cov) * (color[3] / 255);
  const ba = base[bi + 3] / 255;
  const ra = sa + ba * (1 - sa);
  if (ra <= 0) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return;
  }
  for (let k = 0; k < 3; k++) out[k] = byte((color[k] * sa + base[bi + k] * ba * (1 - sa)) / ra);
  out[3] = byte(ra * 255);
}

/**
 * `base` moved `cov` of the way to `target`, both as they are (colour and see-through together), so a pixel that becomes
 * see-through fades out rather than going dark. Used by the retouch brushes, where the target is a copy or a blur of the picture.
 */
export function mixTowards(base: ArrayLike<number>, target: ArrayLike<number>, cov: number, out: Out): void {
  const k = clamp01(cov);
  const ba = (base[3] / 255) * (1 - k);
  const ta = (target[3] / 255) * k;
  const ra = ba + ta;
  if (ra <= 0.002) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return;
  }
  for (let i = 0; i < 3; i++) out[i] = byte((base[i] * ba + target[i] * ta) / ra);
  out[3] = byte(ra * 255);
}

/** The pixel with `cov` of its see-through taken away (the soft eraser). A pixel nearly gone is gone. */
export function eraseOut(base: ArrayLike<number>, bi: number, cov: number, out: Out): void {
  const a = base[bi + 3] * (1 - clamp01(cov));
  if (a < 0.5) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return;
  }
  out[0] = base[bi];
  out[1] = base[bi + 1];
  out[2] = base[bi + 2];
  out[3] = byte(a);
}

/**
 * The highlighter: `color` multiplied into what is there, so a dark line underneath stays dark and shows through, and
 * a light one takes the tint. On empty pixels it lays the colour down as it is.
 */
export function multiplyOver(base: ArrayLike<number>, bi: number, color: RGBA, cov: number, out: Out): void {
  const sa = clamp01(cov) * (color[3] / 255);
  const ba = base[bi + 3] / 255;
  const ra = sa + ba * (1 - sa);
  if (ra <= 0) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return;
  }
  for (let k = 0; k < 3; k++) {
    const cb = base[bi + k];
    const cs = color[k];
    const mixed = (1 - ba) * cs + (ba * cs * cb) / 255;
    out[k] = byte((1 - sa / ra) * cb + (sa / ra) * mixed);
  }
  out[3] = byte(ra * 255);
}

/**
 * One pixel's new colour for a tool, from the pixel as it was before the stroke and how much of the stroke reached it.
 * Returns false when nothing changes there.
 */
export function softColor(kind: SoftKind, base: ArrayLike<number>, bi: number, color: RGBA, cov: number, out: Out): boolean {
  if (cov <= 0) return false;
  const blend = KIND_INFO[kind].blend;
  if (blend === 'erase') {
    if (base[bi + 3] === 0) return false;
    eraseOut(base, bi, cov, out);
  } else if (blend === 'multiply') multiplyOver(base, bi, color, cov, out);
  else paintOver(base, bi, color, cov, out);
  return true;
}

/** Mixes pixel `a` toward `b` by `t`, the way light mixes (see-through pixels count for less). */
export function mixPixels(a: RGBA, b: RGBA, t: number, out: Out): void {
  const k = clamp01(t);
  const wa = (a[3] / 255) * (1 - k);
  const wb = (b[3] / 255) * k;
  const w = wa + wb;
  if (w <= 0) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return;
  }
  for (let c = 0; c < 3; c++) out[c] = byte((a[c] * wa + b[c] * wb) / w);
  out[3] = byte(w * 255);
}

/** Crisp mixing: the pixel is `a` or `b` whole, never a blend, so no colour is made that was not already there. */
export function pickPixel(a: RGBA, b: RGBA, t: number, x: number, y: number, out: Out): void {
  const from = crispen(t, x, y) ? b : a;
  out[0] = from[0];
  out[1] = from[1];
  out[2] = from[2];
  out[3] = from[3];
}

/**
 * What decides how a soft edge is made. A palette-locked layer can only hold palette colours, so its edge is always
 * crisp. With Pixel perfect on, `crispAnswer` (the remembered answer) says whether to keep pixels crisp too.
 */
export function edgeFor(o: { locked: boolean; pixelPerfect: boolean; crispAnswer: 'crisp' | 'smooth' }): { mode: EdgeMode; why: 'locked' | 'perfect' | null } {
  if (o.locked) return { mode: 'crisp', why: 'locked' };
  if (o.pixelPerfect && o.crispAnswer === 'crisp') return { mode: 'crisp', why: 'perfect' };
  return { mode: 'smooth', why: null };
}

/** The centres a dab is laid at when mirror drawing is on: the dab itself and its images across each mirror line. Pixel units, a pixel's middle is x + 0.5. */
export function mirrorCentres(mode: 'off' | 'h' | 'v' | 'both', ax2: number, ay2: number, cx: number, cy: number): { x: number; y: number }[] {
  const out = [{ x: cx, y: cy }];
  const mx = ax2 - cx;
  const my = ay2 - cy;
  if (mode === 'h' || mode === 'both') out.push({ x: mx, y: cy });
  if (mode === 'v' || mode === 'both') out.push({ x: cx, y: my });
  if (mode === 'both') out.push({ x: mx, y: my });
  return out;
}

/** Every pixel a dab can reach, with its coverage. `emit` is called only for pixels with some. */
export function eachDabPixel(cx: number, cy: number, diameter: number, hardness: number, minEdge: number, emit: (x: number, y: number, cov: number) => void): void {
  const r = Math.max(0.5, diameter / 2);
  const x0 = Math.floor(cx - r - 1);
  const x1 = Math.ceil(cx + r + 1);
  const y0 = Math.floor(cy - r - 1);
  const y1 = Math.ceil(cy + r + 1);
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const c = falloff(Math.sqrt(dx * dx + dy * dy), r, hardness, minEdge);
      if (c > 0) emit(x, y, c);
    }
  }
}

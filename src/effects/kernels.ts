/**
 * The per-pixel effects (film grain, wave, colour fringe, dark corners, motion blur) as plain maths on arrays, with no
 * DOM: this is the software path, and the reference the GPU shaders in effectsGL.ts repeat. `kernelParams` turns an
 * effect's settings into canvas-pixel numbers once, and both paths read those same numbers, so they cannot drift apart.
 *
 * Pictures are handled premultiplied (colour already multiplied by alpha, as the canvas keeps it) in floats 0 to 1.
 * A pixel at (x, y) is sampled at its centre (x + 0.5, y + 0.5). Looking past the edge of the picture finds its edge
 * pixel again, so a drawing that fills the stage stays filled when it is bent or smeared, rather than getting see-through bites.
 */
import type { EffectKind } from '../core/format';

/** The effects done here (and on the GPU), rather than with the canvas filter. */
export type KernelKind = 'grain' | 'wave' | 'fringe' | 'vignette' | 'motionblur';

export function isKernelKind(k: EffectKind): k is KernelKind {
  return k === 'grain' || k === 'wave' || k === 'fringe' || k === 'vignette' || k === 'motionblur';
}

/** Most samples a motion blur takes along its line (the GPU takes the same). */
export const MOTION_MAX_SAMPLES = 64;

/** Where the stage is on the canvas, in canvas pixels. Vignette is measured from it. */
export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Four small groups of numbers, the same for every kind, so the GPU path needs one way to hand them over. */
export interface KernelParams {
  kind: KernelKind;
  /** Floats, in the order each kind documents below. */
  a: [number, number, number, number];
  b: [number, number, number, number];
  /** Two more floats some kinds need. */
  c: [number, number];
  /** An integer (the grain pattern) and a count (motion blur samples). */
  i: number;
  n: number;
}

const f32 = Math.fround;
const RAD = Math.PI / 180;

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})/i.exec(String(hex).trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * The numbers an effect draws with, in canvas pixels. `scale` turns document pixels into canvas pixels, `stage` is
 * where the stage sits on the canvas. Floats are rounded to 32 bits here so the CPU and the GPU start from equal values.
 *
 *   grain       a = [strength 0..0.5, cell px, grid x, grid y]   b = [colourful 0..1, 0, 0, 0]   i = pattern
 *   wave        a = [bend px, 2pi / spacing px, phase rad, rippling 0..1]   b = [push x, push y, vary x, vary y] (unit vectors)   c = [pattern origin x, y]
 *   fringe      a = [red shift x, red shift y, 0, 0]  (blue goes the other way)
 *   vignette    a = [centre x, centre y, half width, half height]   b = [r, g, b, strength 0..1]   c = [fade starts, fade ends]
 *   motionblur  a = [dir x, dir y, from px, to px]   n = samples
 */
export function kernelParams(kind: KernelKind, v: Record<string, number | string>, scale: number, stage: StageRect): KernelParams {
  const num = (k: string) => Number(v[k]) || 0;
  const z: [number, number, number, number] = [0, 0, 0, 0];
  const p: KernelParams = { kind, a: [...z], b: [...z], c: [0, 0], i: 0, n: 0 };
  if (kind === 'grain') {
    p.a = [(num('amount') / 100) * 0.5, Math.max(1, num('size') * scale), stage.x, stage.y];
    p.b = [Math.min(1, Math.max(0, num('colour') / 100)), 0, 0, 0];
    p.i = Math.round(num('pattern'));
  } else if (kind === 'wave') {
    const t = num('angle') * RAD;
    const dir = [Math.cos(t), Math.sin(t)];
    // The waves vary along the direction at right angles to the way the layer is pushed.
    p.a = [num('amount') * scale, (Math.PI * 2) / Math.max(1, num('length') * scale), num('phase') * RAD, num('ripple') / 100];
    p.b = [dir[0], dir[1], -dir[1], dir[0]];
    // The pattern starts at the stage corner, so waves stay put when the view moves.
    p.c = [stage.x, stage.y];
  } else if (kind === 'fringe') {
    const t = num('angle') * RAD;
    const d = num('distance') * scale;
    p.a = [Math.cos(t) * d, Math.sin(t) * d, 0, 0];
  } else if (kind === 'vignette') {
    const [r, g, b] = hexRgb(String(v.color ?? '#000000'));
    p.a = [stage.x + stage.w / 2, stage.y + stage.h / 2, Math.max(1, stage.w / 2), Math.max(1, stage.h / 2)];
    p.b = [r, g, b, Math.min(1, Math.max(0, num('amount') / 100))];
    // Where the fade starts and ends, as shares of the way from the middle to a corner.
    const mid = Math.min(1, Math.max(0, num('size') / 100));
    const half = Math.max(0.0005, (Math.min(1, Math.max(0, num('softness') / 100)) * 0.5));
    p.c = [mid - half, mid + half];
  } else {
    const t = num('angle') * RAD;
    const len = num('length') * scale;
    const trail = Math.min(1, Math.max(0, num('trail') / 100));
    p.a = [Math.cos(t), Math.sin(t), -len / 2 + (trail * len) / 2, len / 2 + (trail * len) / 2];
    p.n = Math.max(2, Math.min(MOTION_MAX_SAMPLES, Math.ceil(len) + 1));
  }
  for (const k of ['a', 'b'] as const) p[k] = p[k].map(f32) as [number, number, number, number];
  p.c = [f32(p.c[0]), f32(p.c[1])];
  return p;
}

// ---------------------------------------------------------------- shared pieces

/** The hash both paths use: three whole numbers in, 32 random bits out. */
export function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** hash3 as a number from 0 up to (not including) 1. */
export function hash01(x: number, y: number, z: number): number {
  return (hash3(x, y, z) >>> 8) / 16777216;
}

/** Straight RGBA bytes to premultiplied floats (into `out`, made if missing or the wrong size). */
export function toPremult(data: Uint8ClampedArray, out?: Float32Array): Float32Array {
  const f = out && out.length === data.length ? out : new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    f[i] = (data[i] / 255) * a;
    f[i + 1] = (data[i + 1] / 255) * a;
    f[i + 2] = (data[i + 2] / 255) * a;
    f[i + 3] = a;
  }
  return f;
}

/** Premultiplied floats back to straight RGBA bytes. */
export function fromPremult(f: Float32Array, out: Uint8ClampedArray): void {
  for (let i = 0; i < f.length; i += 4) {
    const a = f[i + 3];
    if (a <= 0) {
      out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
      continue;
    }
    out[i] = Math.round(Math.min(1, f[i] / a) * 255);
    out[i + 1] = Math.round(Math.min(1, f[i + 1] / a) * 255);
    out[i + 2] = Math.round(Math.min(1, f[i + 2] / a) * 255);
    out[i + 3] = Math.round(Math.min(1, a) * 255);
  }
}

/** The picture at a point, mixed from the four pixels round it. Adds `weight` times the colour to `acc` (r, g, b, a). */
function addBilinear(f: Float32Array, w: number, h: number, px: number, py: number, weight: number, acc: Float32Array): void {
  const fx = px - 0.5;
  const fy = py - 0.5;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const wx = fx - ix;
  const wy = fy - iy;
  for (let j = 0; j < 2; j++) {
    const y = Math.min(h - 1, Math.max(0, iy + j));
    const ky = (j ? wy : 1 - wy) * weight;
    for (let i = 0; i < 2; i++) {
      const x = Math.min(w - 1, Math.max(0, ix + i));
      const k = (i ? wx : 1 - wx) * ky;
      const o = (y * w + x) * 4;
      acc[0] += f[o] * k;
      acc[1] += f[o + 1] * k;
      acc[2] += f[o + 2] * k;
      acc[3] += f[o + 3] * k;
    }
  }
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- the effects

/** Runs one effect on `src` (premultiplied floats, w x h), writing the result into `out` (same size). */
export function runKernel(p: KernelParams, src: Float32Array, out: Float32Array, w: number, h: number): void {
  if (p.kind === 'grain') grain(p, src, out, w, h);
  else if (p.kind === 'wave') wave(p, src, out, w, h);
  else if (p.kind === 'fringe') fringe(p, src, out, w, h);
  else if (p.kind === 'vignette') vignette(p, src, out, w, h);
  else motionBlur(p, src, out, w, h);
}

/** Specks of random brightness, one per square cell, added to the colour where there is drawing. */
function grain(p: KernelParams, src: Float32Array, out: Float32Array, w: number, h: number): void {
  const [k, cell, gx, gy] = p.a;
  const colourful = p.b[0];
  for (let y = 0; y < h; y++) {
    const cy = Math.floor(f32(f32(y + 0.5 - gy) / cell));
    for (let x = 0; x < w; x++) {
      const cx = Math.floor(f32(f32(x + 0.5 - gx) / cell));
      const o = (y * w + x) * 4;
      const a = src[o + 3];
      if (a <= 0) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
        continue;
      }
      const base = Math.imul(p.i, 4);
      const l = hash01(cx, cy, base) * 2 - 1;
      for (let c = 0; c < 3; c++) {
        const n = l + (hash01(cx, cy, base + 1 + c) * 2 - 1 - l) * colourful;
        out[o + c] = Math.min(a, Math.max(0, src[o + c] + n * k * a));
      }
      out[o + 3] = a;
    }
  }
}

/** Each pixel looks a little to the side, by an amount that swings like a wave across the layer. */
function wave(p: KernelParams, src: Float32Array, out: Float32Array, w: number, h: number): void {
  const [amp, freq, phase, ripple] = p.a;
  const [dx, dy, ux, uy] = p.b;
  const [ox, oy] = p.c;
  const acc = new Float32Array(4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = ((px - ox) * ux + (py - oy) * uy) * freq + phase;
      const s = Math.sin(t) * amp;
      const c = Math.cos(t) * amp * ripple;
      acc.fill(0);
      addBilinear(src, w, h, px + dx * s + ux * c, py + dy * s + uy * c, 1, acc);
      const o = (y * w + x) * 4;
      out[o] = acc[0];
      out[o + 1] = acc[1];
      out[o + 2] = acc[2];
      out[o + 3] = acc[3];
    }
  }
}

/** Red from one side, blue from the other, green where it is. The result is there where any of the three is. */
function fringe(p: KernelParams, src: Float32Array, out: Float32Array, w: number, h: number): void {
  const [sx, sy] = p.a;
  const r = new Float32Array(4);
  const g = new Float32Array(4);
  const b = new Float32Array(4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      r.fill(0);
      g.fill(0);
      b.fill(0);
      addBilinear(src, w, h, px - sx, py - sy, 1, r);
      addBilinear(src, w, h, px, py, 1, g);
      addBilinear(src, w, h, px + sx, py + sy, 1, b);
      const o = (y * w + x) * 4;
      out[o] = r[0];
      out[o + 1] = g[1];
      out[o + 2] = b[2];
      out[o + 3] = Math.max(r[3], g[3], b[3]);
    }
  }
}

/** A colour laid over the picture, thicker the further from the middle of the stage. */
function vignette(p: KernelParams, src: Float32Array, out: Float32Array, w: number, h: number): void {
  const [cx, cy, hx, hy] = p.a;
  const [cr, cg, cb, amount] = p.b;
  const [e0, e1] = p.c;
  const inv = Math.SQRT1_2;
  for (let y = 0; y < h; y++) {
    const ny = (y + 0.5 - cy) / hy;
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - cx) / hx;
      const k = amount * smoothstep(e0, e1, Math.sqrt(nx * nx + ny * ny) * inv);
      const o = (y * w + x) * 4;
      out[o] = cr * k + src[o] * (1 - k);
      out[o + 1] = cg * k + src[o + 1] * (1 - k);
      out[o + 2] = cb * k + src[o + 2] * (1 - k);
      out[o + 3] = k + src[o + 3] * (1 - k);
    }
  }
}

/** The average of the picture at evenly spaced points along a line through each pixel. */
function motionBlur(p: KernelParams, src: Float32Array, out: Float32Array, w: number, h: number): void {
  const [dx, dy, from, to] = p.a;
  const n = p.n;
  const acc = new Float32Array(4);
  const step = n > 1 ? (to - from) / (n - 1) : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      acc.fill(0);
      for (let i = 0; i < n; i++) {
        const s = from + step * i;
        addBilinear(src, w, h, x + 0.5 + dx * s, y + 0.5 + dy * s, 1 / n, acc);
      }
      const o = (y * w + x) * 4;
      out[o] = acc[0];
      out[o + 1] = acc[1];
      out[o + 2] = acc[2];
      out[o + 3] = acc[3];
    }
  }
}

let scratchIn: Float32Array | undefined;
let scratchOut: Float32Array | undefined;

/** Runs an effect on straight RGBA bytes, writing straight RGBA bytes: the whole software path, for a canvas's pixels. */
export function runKernelBytes(p: KernelParams, src: Uint8ClampedArray, out: Uint8ClampedArray, w: number, h: number): void {
  scratchIn = toPremult(src, scratchIn);
  if (!scratchOut || scratchOut.length !== src.length) scratchOut = new Float32Array(src.length);
  runKernel(p, scratchIn, scratchOut, w, h);
  fromPremult(scratchOut, out);
}

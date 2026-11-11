// Animated GIF: one global palette worked out from sampled frames, then every frame mapped onto it (optionally
// dithered). Pure bytes, no canvas, so it runs the same in tests.
import { GIFEncoder, quantize, type Palette } from 'gifenc';

export const GIF_MAX_FPS = 50;

export interface GifOptions {
  width: number;
  height: number;
  fps: number;
  /** Repeat for ever (true) or play once. */
  loop: boolean;
  /** Pixels that are mostly see-through become the GIF's transparent colour. */
  transparent: boolean;
  /** Spread colour errors over neighbouring pixels so gradients look smoother (a bit noisier on flat colour). */
  dither: boolean;
}

/** Frame delays in milliseconds (multiples of 10, since GIF counts in hundredths of a second). Rounded cumulatively so the total length stays true. */
export function gifDelays(count: number, fps: number): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < count; i++) {
    const t = Math.round(((i + 1) * 100) / Math.min(fps, GIF_MAX_FPS));
    // Below two hundredths many viewers play a frame at a tenth of a second, so never go under.
    out.push(Math.max(2, t - prev) * 10);
    prev += Math.max(2, t - prev);
  }
  return out;
}

/** Up to `n` frame numbers spread evenly across `count`, always including the first and last. */
export function sampleFrames(count: number, n = 24): number[] {
  if (count <= n) return Array.from({ length: count }, (_, i) => i);
  const out = new Set<number>();
  for (let i = 0; i < n; i++) out.add(Math.round((i * (count - 1)) / (n - 1)));
  return [...out];
}

const MAX_SAMPLE_PIXELS = 600_000;

/**
 * The palette for the whole GIF. With transparency, index 0 is reserved for "see-through" and 255 colours remain.
 * When the sampled frames use few enough colours (pixel art, flat colour), they are used exactly.
 */
export function buildPalette(samples: Uint8ClampedArray[], transparent: boolean): Palette {
  const max = transparent ? 255 : 256;
  const exact = new Map<number, number>();
  let tooMany = false;
  let opaquePixels = 0;
  for (const s of samples) {
    for (let i = 0; i < s.length; i += 4) {
      if (transparent && s[i + 3] < 128) continue;
      opaquePixels++;
      if (tooMany) continue;
      const k = (s[i] << 16) | (s[i + 1] << 8) | s[i + 2];
      if (!exact.has(k)) {
        exact.set(k, 1);
        if (exact.size > max) tooMany = true;
      }
    }
  }
  let colours: Palette;
  if (!tooMany) {
    colours = [...exact.keys()].map((k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);
  } else {
    // Pool the opaque pixels of every sample (thinned out if there are a lot) and let gifenc pick the colours.
    const step = Math.max(1, Math.ceil(opaquePixels / MAX_SAMPLE_PIXELS));
    const pool = new Uint8Array(Math.ceil(opaquePixels / step) * 4 + 4);
    let n = 0;
    let seen = 0;
    for (const s of samples) {
      for (let i = 0; i < s.length; i += 4) {
        if (transparent && s[i + 3] < 128) continue;
        if (seen++ % step) continue;
        pool[n++] = s[i];
        pool[n++] = s[i + 1];
        pool[n++] = s[i + 2];
        pool[n++] = 255;
      }
    }
    colours = quantize(pool.subarray(0, n), max, { format: 'rgb565' }).map((c) => [c[0], c[1], c[2]]);
  }
  if (!colours.length) colours = [[0, 0, 0]];
  return transparent ? [[0, 0, 0], ...colours] : colours;
}

/** Maps colours to palette indexes, remembering answers (flat art asks about the same few colours over and over). */
function makeMapper(palette: Palette, first: number) {
  const cache = new Map<number, number>();
  return (r: number, g: number, b: number): number => {
    const k = (r << 16) | (g << 8) | b;
    let hit = cache.get(k);
    if (hit !== undefined) return hit;
    let best = first;
    let bestD = Infinity;
    for (let i = first; i < palette.length; i++) {
      const p = palette[i];
      const dr = p[0] - r;
      const dg = p[1] - g;
      const db = p[2] - b;
      // A little weight towards green and away from blue, which is how eyes see it.
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < bestD) {
        bestD = d;
        best = i;
        if (d === 0) break;
      }
    }
    if (cache.size > 300_000) cache.clear();
    cache.set(k, best);
    return best;
  };
}

/** One frame as palette indexes. */
export function indexFrame(rgba: Uint8ClampedArray, width: number, height: number, palette: Palette, opts: { transparent: boolean; dither: boolean }): Uint8Array {
  const first = opts.transparent ? 1 : 0;
  const map = makeMapper(palette, first);
  const out = new Uint8Array(width * height);
  if (!opts.dither) {
    for (let i = 0, p = 0; p < out.length; i += 4, p++) out[p] = opts.transparent && rgba[i + 3] < 128 ? 0 : map(rgba[i], rgba[i + 1], rgba[i + 2]);
    return out;
  }
  // Floyd-Steinberg: each pixel's leftover colour error is shared with the pixels to its right and below.
  let cur = new Float32Array((width + 2) * 3);
  let next = new Float32Array((width + 2) * 3);
  for (let y = 0; y < height; y++) {
    next.fill(0);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (opts.transparent && rgba[i + 3] < 128) {
        out[y * width + x] = 0;
        continue;
      }
      const e = (x + 1) * 3;
      const r = Math.min(255, Math.max(0, Math.round(rgba[i] + cur[e])));
      const g = Math.min(255, Math.max(0, Math.round(rgba[i + 1] + cur[e + 1])));
      const b = Math.min(255, Math.max(0, Math.round(rgba[i + 2] + cur[e + 2])));
      const idx = map(r, g, b);
      out[y * width + x] = idx;
      const p = palette[idx];
      const er = r - p[0];
      const eg = g - p[1];
      const eb = b - p[2];
      for (let c = 0; c < 3; c++) {
        const err = c === 0 ? er : c === 1 ? eg : eb;
        cur[e + 3 + c] += (err * 7) / 16;
        next[e - 3 + c] += (err * 3) / 16;
        next[e + c] += (err * 5) / 16;
        next[e + 3 + c] += err / 16;
      }
    }
    [cur, next] = [next, cur];
  }
  return out;
}

/** Writes frames one at a time, so a long animation never has to sit in memory all at once. */
export class GifWriter {
  private enc = GIFEncoder();
  private n = 0;
  private delays: number[];
  frames = 0;

  constructor(
    private opts: GifOptions,
    private palette: Palette,
    frameCount: number,
  ) {
    this.delays = gifDelays(frameCount, opts.fps);
  }

  addFrame(rgba: Uint8ClampedArray): void {
    const { width, height, transparent, dither, loop } = this.opts;
    const index = indexFrame(rgba, width, height, this.palette, { transparent, dither });
    this.enc.writeFrame(index, width, height, {
      palette: this.n === 0 ? this.palette : undefined,
      delay: this.delays[Math.min(this.n, this.delays.length - 1)],
      transparent,
      transparentIndex: 0,
      repeat: loop ? 0 : -1,
      // See-through frames wipe to the background before the next one is drawn; solid ones just paint over.
      dispose: transparent ? 2 : 1,
    });
    this.n++;
    this.frames++;
  }

  finish(): Uint8Array {
    this.enc.finish();
    return this.enc.bytes();
  }
}

/** All in one go, for small jobs and tests. */
export function encodeGif(frames: Uint8ClampedArray[], opts: GifOptions): Uint8Array {
  const palette = buildPalette(sampleFrames(frames.length).map((i) => frames[i]), opts.transparent);
  const w = new GifWriter(opts, palette, frames.length);
  for (const f of frames) w.addFrame(f);
  return w.finish();
}

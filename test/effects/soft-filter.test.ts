// The JS fallback for the canvas `filter` (Safari): the blur against an exact gaussian, the colour adjust against known
// values, the detection, and every filter-based effect forced down the fallback path on a stand-in canvas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adjustPixels, blurPixels, boxWindows, inkBounds, type Pixels } from '../../src/effects/softBlur';
import { applyEffect, BufferPool, ctx2, type Canvas2 } from '../../src/effects/apply';
import { nativeFilterWorks, resetFilterDetection, setFilterOverride } from '../../src/effects/filterSupport';

// A stand-in canvas: RGBA bytes (not premultiplied), with the parts applyEffect uses.
let probeFilter: 'none' | 'ignored' | 'works' = 'works';
const calls: string[] = [];

function parseColour(c: string): [number, number, number, number] {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(c);
  if (m) return [+m[1], +m[2], +m[3], +m[4]];
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
}

class Raster {
  data: Uint8ClampedArray;
  constructor(
    public width: number,
    public height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
  getContext() {
    return new RasterCtx(this);
  }
}

class RasterCtx {
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle = '#000000';
  filter = 'none';
  imageSmoothingEnabled = true;
  constructor(public canvas: Raster) {
    if (probeFilter === 'none') delete (this as { filter?: string }).filter;
  }
  setTransform() {}
  clearRect() {
    this.canvas.data.fill(0);
  }
  getImageData(x: number, y: number, w: number, h: number) {
    calls.push('getImageData');
    const out = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) for (let k = 0; k < 4; k++) out[(j * w + i) * 4 + k] = this.canvas.data[((y + j) * this.canvas.width + x + i) * 4 + k];
    return { data: out, width: w, height: h };
  }
  createImageData(w: number, h: number) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(img: Pixels, x: number, y: number) {
    calls.push('putImageData');
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) for (let k = 0; k < 4; k++) this.canvas.data[((y + j) * this.canvas.width + x + i) * 4 + k] = img.data[(j * img.width + i) * 4 + k];
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const [r, g, b, a] = parseColour(this.fillStyle);
    const d = this.canvas.data;
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % this.canvas.width;
      const py = Math.floor(i / 4 / this.canvas.width);
      if (px < x || py < y || px >= x + w || py >= y + h) {
        if (this.globalCompositeOperation === 'source-in') d[i + 3] = 0;
        continue;
      }
      if (this.globalCompositeOperation === 'source-in') {
        d[i + 3] = d[i + 3] * a;
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      } else this.over(i, r, g, b, a * 255);
    }
  }
  drawImage(src: Raster, dx = 0, dy = 0) {
    let from: Pixels = src;
    if (this.filter.startsWith('blur(') && probeFilter === 'works') {
      calls.push('native-blur');
      const sigma = parseFloat(this.filter.slice(5));
      const r = blurPixels(src, sigma, 'rgba');
      const tmp = new Raster(src.width, src.height);
      if (r) for (let j = 0; j < r.height; j++) for (let i = 0; i < r.width; i++) for (let k = 0; k < 4; k++) tmp.data[((r.y + j) * src.width + r.x + i) * 4 + k] = r.data[(j * r.width + i) * 4 + k];
      from = tmp;
    } else if (this.filter !== 'none') calls.push('native:' + this.filter);
    const ox = Math.round(dx);
    const oy = Math.round(dy);
    for (let y = 0; y < from.height; y++)
      for (let x = 0; x < from.width; x++) {
        const tx = x + ox;
        const ty = y + oy;
        if (tx < 0 || ty < 0 || tx >= this.canvas.width || ty >= this.canvas.height) continue;
        const s = (y * from.width + x) * 4;
        this.over((ty * this.canvas.width + tx) * 4, from.data[s], from.data[s + 1], from.data[s + 2], from.data[s + 3] * this.globalAlpha);
      }
  }
  private over(i: number, r: number, g: number, b: number, a255: number) {
    const d = this.canvas.data;
    const as = a255 / 255;
    const ad = d[i + 3] / 255;
    const ao = as + ad * (1 - as);
    if (ao <= 0) return;
    d[i] = (r * as + d[i] * ad * (1 - as)) / ao;
    d[i + 1] = (g * as + d[i + 1] * ad * (1 - as)) / ao;
    d[i + 2] = (b * as + d[i + 2] * ad * (1 - as)) / ao;
    d[i + 3] = ao * 255;
  }
}

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', Raster);
  probeFilter = 'works';
  calls.length = 0;
  resetFilterDetection();
});
afterEach(() => {
  vi.unstubAllGlobals();
  setFilterOverride(null);
  resetFilterDetection();
});

/** Exact separable gaussian on premultiplied RGBA, zero outside, in doubles. */
function referenceBlur(px: Pixels, sigma: number): Float64Array {
  const { width: w, height: h } = px;
  const r = Math.ceil(sigma * 4);
  const k: number[] = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const a = new Float64Array(w * h * 4);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) a[i * 4 + c] = (px.data[i * 4 + c] * px.data[i * 4 + 3]) / 255;
  for (let i = 0; i < w * h; i++) a[i * 4 + 3] = px.data[i * 4 + 3];
  const pass = (src: Float64Array, horizontal: boolean) => {
    const out = new Float64Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let c = 0; c < 4; c++) {
          let s = 0;
          for (let i = -r; i <= r; i++) {
            const xx = horizontal ? x + i : x;
            const yy = horizontal ? y : y + i;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            s += src[(yy * w + xx) * 4 + c] * k[i + r];
          }
          out[(y * w + x) * 4 + c] = s;
        }
    return out;
  };
  return pass(pass(a, true), false);
}

function picture(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(paint(x, y), (y * w + x) * 4);
  return { data, width: w, height: h };
}

function asFull(r: ReturnType<typeof blurPixels>, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  if (!r) return out;
  for (let j = 0; j < r.height; j++) for (let i = 0; i < r.width; i++) for (let k = 0; k < 4; k++) out[((r.y + j) * w + r.x + i) * 4 + k] = r.data[(j * r.width + i) * 4 + k];
  return out;
}

describe('soft blur against an exact gaussian', () => {
  // A red square, half opaque on one side, on a 64 x 48 picture.
  const img = picture(64, 48, (x, y) => (x >= 22 && x < 40 && y >= 14 && y < 30 ? [220, 40, 20, x < 31 ? 255 : 128] : [0, 0, 0, 0]));
  for (const sigma of [1, 3, 6, 10]) {
    it(`sigma ${sigma} stays within a few levels of the true blur`, () => {
      const got = asFull(blurPixels(img, sigma, 'rgba'), 64, 48);
      const ref = referenceBlur(img, sigma);
      let worstA = 0;
      let worstC = 0;
      for (let i = 0; i < 64 * 48; i++) {
        worstA = Math.max(worstA, Math.abs(got[i * 4 + 3] - ref[i * 4 + 3]));
        if (ref[i * 4 + 3] > 20) for (let c = 0; c < 3; c++) worstC = Math.max(worstC, Math.abs(got[i * 4 + c] - (ref[i * 4 + c] * 255) / ref[i * 4 + 3]));
      }
      // Box blurs are an approximation of a gaussian (the same one browsers use); a couple of levels apart is expected.
      expect(worstA).toBeLessThanOrEqual(sigma < 4 ? 2 : 3);
      expect(worstC).toBeLessThanOrEqual(4);
    });
  }

  it('keeps colour on the soft edge (premultiplied, no dark fringe)', () => {
    const got = asFull(blurPixels(img, 3, 'rgba'), 64, 48);
    const i = (22 * 1 + 20 * 64 - 3) * 4;
    expect(got[i + 3]).toBeGreaterThan(0);
    expect(got[i]).toBeGreaterThan(210);
  });

  it('alpha mode gives black ink with the same alpha', () => {
    const a = asFull(blurPixels(img, 3, 'alpha'), 64, 48);
    const c = asFull(blurPixels(img, 3, 'rgba'), 64, 48);
    for (let i = 0; i < 64 * 48; i++) {
      expect(Math.abs(a[i * 4 + 3] - c[i * 4 + 3])).toBeLessThanOrEqual(1);
      expect(a[i * 4]).toBe(0);
    }
  });

  it('preserves the total ink, and an empty picture gives nothing', () => {
    const r = blurPixels(img, 5, 'alpha')!;
    let before = 0;
    let after = 0;
    for (let i = 3; i < img.data.length; i += 4) before += img.data[i];
    for (let i = 3; i < r.data.length; i += 4) after += r.data[i];
    expect(Math.abs(after - before) / before).toBeLessThan(0.03);
    expect(blurPixels(picture(8, 8, () => [0, 0, 0, 0]), 3, 'rgba')).toBeNull();
  });

  it('only works on the part with ink', () => {
    const b = inkBounds(img, 0)!;
    expect(b).toEqual({ x0: 22, y0: 14, x1: 39, y1: 29 });
    const r = blurPixels(img, 3, 'rgba')!;
    expect(r.width).toBeLessThan(64);
  });

  it('picks boxes that add up to the sigma', () => {
    // Three odd boxes whose variances add up to sigma squared.
    for (const sigma of [2, 3.5, 8, 20]) {
      const variance = boxWindows(sigma).reduce((v, [l, r]) => v + ((l + r + 1) ** 2 - 1) / 12, 0);
      expect(Math.sqrt(variance)).toBeCloseTo(sigma, 0);
    }
  });
});

describe('soft colour adjust', () => {
  const one = (c: [number, number, number, number], a: Partial<Parameters<typeof adjustPixels>[1]>) => {
    const p = picture(1, 1, () => c);
    adjustPixels(p, { hue: 0, saturation: 100, brightness: 100, contrast: 100, ...a });
    return [...p.data];
  };
  it('leaves the picture alone at the neutral settings', () => expect(one([200, 100, 50, 255], {})).toEqual([200, 100, 50, 255]));
  it('brightness scales', () => expect(one([200, 100, 50, 255], { brightness: 50 })).toEqual([100, 50, 26, 255]));
  it('saturation 0 goes grey by luminance', () => {
    const [r, g, b] = one([200, 100, 50, 255], { saturation: 0 });
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeCloseTo(0.213 * 200 + 0.715 * 100 + 0.072 * 50, -0.5);
  });
  it('contrast pivots on mid grey', () => {
    expect(one([128, 128, 128, 255], { contrast: 200 })[0]).toBeCloseTo(129, 0);
    expect(one([192, 64, 128, 255], { contrast: 50 }).slice(0, 3)).toEqual([160, 96, 128]);
  });
  it('hue turns red to blue-ish at 240 degrees and keeps alpha', () => {
    const [r, , b, a] = one([255, 0, 0, 90], { hue: 240 });
    expect(b).toBeGreaterThan(r);
    expect(a).toBe(90);
  });
});

describe('detecting the canvas filter', () => {
  it('sees a canvas whose filter blurs', () => {
    expect(nativeFilterWorks(new Raster(2, 2).getContext() as never)).toBe(true);
  });
  it('sees a canvas that ignores the filter (Safari with the property set by script)', () => {
    probeFilter = 'ignored';
    expect(nativeFilterWorks(new Raster(2, 2).getContext() as never)).toBe(false);
  });
  it('sees a canvas with no filter property at all', () => {
    probeFilter = 'none';
    expect(nativeFilterWorks(new Raster(2, 2).getContext() as never)).toBe(false);
  });
  it('remembers the answer, and the override beats it', () => {
    const g = new Raster(2, 2).getContext() as never;
    expect(nativeFilterWorks(g)).toBe(true);
    probeFilter = 'none';
    expect(nativeFilterWorks(g)).toBe(true);
    setFilterOverride('fallback');
    expect(nativeFilterWorks(g)).toBe(false);
  });
});

describe('every filter effect on the forced fallback path', () => {
  const W = 40;
  const H = 30;
  /** A solid 8 x 8 blue square with a red 2 x 2 corner. */
  function source(pool: BufferPool): Canvas2 {
    const c = pool.get() as unknown as Raster;
    for (let y = 10; y < 18; y++) for (let x = 14; x < 22; x++) c.data.set(x < 16 && y < 12 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * W + x) * 4);
    return c as unknown as Canvas2;
  }
  const px = (c: Canvas2, x: number, y: number) => [...(c as unknown as Raster).data.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];
  const origin = { x: 0, y: 0 };

  it('blur softens edges without using the native filter', () => {
    setFilterOverride('fallback');
    const pool = new BufferPool(W, H);
    const out = applyEffect(source(pool), 'blur', { radius: 2 }, 1, origin, pool);
    expect(calls).not.toContain('native-blur');
    const edge = px(out, 12, 14);
    expect(edge[3]).toBeGreaterThan(0);
    expect(edge[3]).toBeLessThan(128);
    expect(px(out, 18, 14)[3]).toBeGreaterThan(200);
    expect(px(out, 2, 2)[3]).toBe(0);
  });

  it('blur of 0 leaves the picture as is', () => {
    setFilterOverride('fallback');
    const pool = new BufferPool(W, H);
    const src = source(pool);
    expect(applyEffect(src, 'blur', { radius: 0 }, 1, origin, pool)).toBe(src);
  });

  it('adjust changes colour in JS', () => {
    setFilterOverride('fallback');
    const pool = new BufferPool(W, H);
    const out = applyEffect(source(pool), 'adjust', { hue: 0, saturation: 100, brightness: 50, contrast: 100 }, 1, origin, pool);
    expect(px(out, 18, 14)).toEqual([0, 0, 128, 255]);
    expect(calls.some((c) => c.startsWith('native'))).toBe(false);
  });

  it('shadow lands offset, soft, in its colour, under the picture', () => {
    setFilterOverride('fallback');
    const pool = new BufferPool(W, H);
    const out = applyEffect(source(pool), 'shadow', { color: '#00ff00', opacity: 1, x: 6, y: 4, softness: 2 }, 1, origin, pool);
    expect(px(out, 18, 14)).toEqual([0, 0, 255, 255]);
    const s = px(out, 26, 20);
    expect(s[1]).toBeGreaterThan(200);
    expect(s[0]).toBeLessThan(20);
    expect(s[3]).toBeGreaterThan(100);
    expect(px(out, 36, 28)[3]).toBe(0);
    expect(calls.some((c) => c.startsWith('native'))).toBe(false);
  });

  it('hard shadow (softness 0) is a plain offset copy', () => {
    setFilterOverride('fallback');
    const pool = new BufferPool(W, H);
    const out = applyEffect(source(pool), 'shadow', { color: '#00ff00', opacity: 0.5, x: 10, y: 0, softness: 0 }, 1, origin, pool);
    const s = px(out, 28, 14);
    expect(s[1]).toBe(255);
    expect(Math.abs(s[3] - 128)).toBeLessThanOrEqual(1);
    expect(calls).not.toContain('getImageData');
  });

  it('shadow softness is the blur sigma itself, glow size is twice its sigma (as Chromium draws them)', () => {
    setFilterOverride('fallback');
    const alphaAt = (c: Canvas2, x: number, y: number) => px(c, x, y)[3];
    const pool = new BufferPool(W, H);
    // Softness 4 is the same softness as a soften radius of 4, moved by the offset.
    const ref = applyEffect(source(pool), 'blur', { radius: 4 }, 1, origin, pool);
    const shadow = applyEffect(source(pool), 'shadow', { color: '#000000', opacity: 1, x: 6, y: 3, softness: 4 }, 1, origin, pool);
    for (const [x, y] of [[26, 13], [27, 15], [24, 21], [25, 19]]) expect(Math.abs(alphaAt(shadow, x, y) - alphaAt(ref, x - 6, y - 3))).toBeLessThanOrEqual(2);
    // Glow size 8 is a soften radius of 4.
    const glow = applyEffect(source(pool), 'glow', { color: '#000000', size: 8, strength: 1 }, 1, origin, pool);
    for (const [x, y] of [[11, 14], [12, 9], [23, 14], [18, 20]]) expect(Math.abs(alphaAt(glow, x, y) - alphaAt(ref, x, y))).toBeLessThanOrEqual(2);
  });

  it('glow is a blurred tinted halo under the picture', () => {
    setFilterOverride('fallback');
    const pool = new BufferPool(W, H);
    const out = applyEffect(source(pool), 'glow', { color: '#ffff00', size: 8, strength: 1 }, 1, origin, pool);
    expect(px(out, 18, 14)).toEqual([0, 0, 255, 255]);
    const halo = px(out, 11, 14);
    expect(halo[3]).toBeGreaterThan(20);
    expect(halo[0]).toBeGreaterThan(200);
    expect(halo[2]).toBeLessThan(20);
    expect(px(out, 0, 0)[3]).toBe(0);
  });

  it('the native path is untouched when the filter works', () => {
    setFilterOverride('native');
    const pool = new BufferPool(W, H);
    applyEffect(source(pool), 'blur', { radius: 2 }, 1, origin, pool);
    applyEffect(source(pool), 'shadow', { color: '#00ff00', opacity: 1, x: 6, y: 4, softness: 2 }, 1, origin, pool);
    expect(calls).not.toContain('getImageData');
    expect(calls).not.toContain('putImageData');
    expect(calls.filter((c) => c === 'native-blur' || c.startsWith('native:')).length).toBe(2);
  });

  it('outline and pixelate need no filter and are the same on either path', () => {
    const pool = new BufferPool(W, H);
    setFilterOverride('fallback');
    const a = applyEffect(source(pool), 'outline', { color: '#ff0000', width: 2 }, 1, origin, pool);
    expect(px(a, 12, 14)[3]).toBe(255);
    expect(ctx2(a)).toBeTruthy();
  });
});

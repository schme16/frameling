/**
 * Draws effects on a layer's picture. Everything works in canvas pixels on canvases the size of the target, with no
 * transform: `scale` turns the document-pixel settings into canvas pixels, and `origin` is where the stage's top-left
 * corner is on the canvas (so pixelate squares line up with the stage, not the window).
 *
 * Blur, colour adjust and shadow use the canvas `filter` (fast, done on the GPU in Electron). Glow is a blurred,
 * tinted copy underneath. Outline stamps a tinted copy around a circle underneath. Pixelate shrinks and grows back.
 * Where the canvas has no working `filter` (Safari), blur, adjust, shadow and glow use the JS blur in softBlur.ts.
 */
import type { EffectKind } from '../core/format';
import { canFallback, nativeFilterWorks } from './filterSupport';
import { adjustPixels, blurPixels, MIN_SIGMA } from './softBlur';

export type Canvas2 = OffscreenCanvas | HTMLCanvasElement;
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): Canvas2 {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
}

export function ctx2(c: Canvas2): Ctx {
  return c.getContext('2d') as Ctx;
}

/** Same-size scratch canvases, handed out cleared and given back when done, so a frame allocates nothing new. */
export class BufferPool {
  private free: Canvas2[] = [];
  /** Canvases made (for tests and tuning). */
  made = 0;
  constructor(
    public w: number,
    public h: number,
  ) {}

  /** A cleared canvas with no transform. */
  get(): Canvas2 {
    const c = this.free.pop() ?? (this.made++, makeCanvas(this.w, this.h));
    const g = ctx2(c);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, this.w, this.h);
    return c;
  }

  put(c: Canvas2): void {
    if (c.width === this.w && c.height === this.h && this.free.length < 8) this.free.push(c);
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.free = [];
  }
}

/** True where the canvas `filter` really works (Chromium and Electron; not Safari or some test fakes). */
export function canFilter(g: Ctx): boolean {
  return nativeFilterWorks(g);
}

/** Draws the blurred ink of `src` (black, alpha only when `alphaOnly`) onto the cleared `out`, using the JS blur. */
function softBlurInto(out: Canvas2, src: Canvas2, sigma: number, alphaOnly: boolean): void {
  const g = ctx2(out);
  const pixels = ctx2(src).getImageData(0, 0, src.width, src.height);
  const r = blurPixels(pixels, sigma, alphaOnly ? 'alpha' : 'rgba');
  if (!r) return;
  const img = g.createImageData(r.width, r.height);
  img.data.set(r.data);
  g.putImageData(img, r.x, r.y);
}

/** The colour adjust done in JS: reads the picture, changes it, puts it on the cleared `out`. */
function softAdjustInto(out: Canvas2, src: Canvas2, v: Record<string, number | string>): void {
  const img = ctx2(src).getImageData(0, 0, src.width, src.height);
  adjustPixels(img, { hue: Number(v.hue), saturation: Number(v.saturation), brightness: Number(v.brightness), contrast: Number(v.contrast) });
  ctx2(out).putImageData(img, 0, 0);
}

/** A copy of `src`'s silhouette in `color`, softened by `sigma`, on a canvas from the pool (JS fallback for shadow and glow). */
function softSilhouette(src: Canvas2, sigma: number, color: string, pool: BufferPool): Canvas2 {
  const sil = pool.get();
  if (sigma < MIN_SIGMA) ctx2(sil).drawImage(src as CanvasImageSource, 0, 0);
  else softBlurInto(sil, src, sigma, true);
  const g = ctx2(sil);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, sil.width, sil.height);
  g.globalCompositeOperation = 'source-over';
  return sil;
}

function hexToRgba(hex: string, alpha = 1): string {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(m[1], 16);
  const a = (m[2] ? parseInt(m[2], 16) / 255 : 1) * alpha;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${+a.toFixed(4)})`;
}

/** The CSS filter string for the filter-based effects (exported for tests). */
export function filterFor(kind: EffectKind, v: Record<string, number | string>, scale: number): string | null {
  const n = (k: string) => Number(v[k]);
  const px = (x: number) => `${+(x * scale).toFixed(3)}px`;
  if (kind === 'blur') return `blur(${px(n('radius'))})`;
  if (kind === 'adjust') return `hue-rotate(${n('hue')}deg) saturate(${n('saturation')}%) brightness(${n('brightness')}%) contrast(${n('contrast')}%)`;
  if (kind === 'shadow') return `drop-shadow(${px(n('x'))} ${px(n('y'))} ${px(n('softness'))} ${hexToRgba(String(v.color), n('opacity'))})`;
  return null;
}

/** The offsets an outline stamps the drawing at: rings out to `r` canvas pixels, close enough that no gaps show. */
export function outlineOffsets(r: number): [number, number][] {
  const out: [number, number][] = [];
  if (r <= 0) return out;
  const rings = r > 6 ? [r, r * 0.66, r * 0.33] : r > 2.5 ? [r, r * 0.5] : [r];
  for (const ring of rings) {
    const n = Math.max(8, Math.min(40, Math.ceil((2 * Math.PI * ring) / 1.6)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push([Math.cos(a) * ring, Math.sin(a) * ring]);
    }
  }
  return out;
}

/**
 * Applies one effect to `src` and returns the result: `src` itself when changed in place, or a canvas from the pool
 * (and `src` goes back to the pool). The caller owns what's returned.
 */
export function applyEffect(src: Canvas2, kind: EffectKind, v: Record<string, number | string>, scale: number, origin: { x: number; y: number }, pool: BufferPool): Canvas2 {
  const n = (k: string) => Number(v[k]);
  const filter = filterFor(kind, v, scale);
  const native = canFilter(ctx2(src));
  const soft = !native && canFallback(ctx2(src));
  if (filter && soft) {
    if (kind === 'adjust') {
      const out = pool.get();
      softAdjustInto(out, src, v);
      pool.put(src);
      return out;
    }
    if (kind === 'blur') {
      const sigma = n('radius') * scale;
      if (sigma < MIN_SIGMA) return src;
      const out = pool.get();
      softBlurInto(out, src, sigma, false);
      pool.put(src);
      return out;
    }
    if (kind === 'shadow') {
      const sil = softSilhouette(src, (n('softness') * scale) / 2, hexToRgba(String(v.color), n('opacity')), pool);
      const out = pool.get();
      const g = ctx2(out);
      g.drawImage(sil as CanvasImageSource, n('x') * scale, n('y') * scale);
      g.drawImage(src as CanvasImageSource, 0, 0);
      pool.put(sil);
      pool.put(src);
      return out;
    }
  }
  if (filter) {
    const out = pool.get();
    const g = ctx2(out);
    if (!native) {
      pool.put(out);
      return src;
    }
    g.filter = filter;
    g.drawImage(src, 0, 0);
    g.filter = 'none';
    pool.put(src);
    return out;
  }
  if (kind === 'glow') {
    let glow: Canvas2;
    if (soft) {
      glow = softSilhouette(src, (n('size') * scale) / 2, String(v.color), pool);
    } else {
      glow = pool.get();
      const gg = ctx2(glow);
      if (native) gg.filter = `blur(${+((n('size') * scale) / 2).toFixed(3)}px)`;
      gg.drawImage(src, 0, 0);
      gg.filter = 'none';
      gg.globalCompositeOperation = 'source-in';
      gg.fillStyle = String(v.color);
      gg.fillRect(0, 0, glow.width, glow.height);
      gg.globalCompositeOperation = 'source-over';
    }
    const out = pool.get();
    const g = ctx2(out);
    // Strength above 1 stacks the glow, so it gets denser, not just wider.
    for (let left = n('strength'); left > 0; left -= 1) {
      g.globalAlpha = Math.min(1, left);
      g.drawImage(glow, 0, 0);
    }
    g.globalAlpha = 1;
    g.drawImage(src, 0, 0);
    pool.put(glow);
    pool.put(src);
    return out;
  }
  if (kind === 'outline') {
    const out = pool.get();
    const g = ctx2(out);
    for (const [dx, dy] of outlineOffsets(n('width') * scale)) g.drawImage(src, dx, dy);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = String(v.color);
    g.fillRect(0, 0, out.width, out.height);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(src, 0, 0);
    pool.put(src);
    return out;
  }
  if (kind === 'pixelate') {
    const cell = n('size') * scale;
    if (cell <= 1) return src;
    // Squares start at the stage's corner.
    const ox = (((origin.x % cell) + cell) % cell) - cell;
    const oy = (((origin.y % cell) + cell) % cell) - cell;
    const sw = Math.max(1, Math.ceil((src.width - ox) / cell));
    const sh = Math.max(1, Math.ceil((src.height - oy) / cell));
    const small = makeCanvas(sw, sh);
    const sg = ctx2(small);
    sg.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in sg) sg.imageSmoothingQuality = 'high';
    sg.setTransform(1 / cell, 0, 0, 1 / cell, -ox / cell, -oy / cell);
    sg.drawImage(src, 0, 0);
    const out = pool.get();
    const g = ctx2(out);
    g.imageSmoothingEnabled = false;
    g.setTransform(cell, 0, 0, cell, ox, oy);
    g.drawImage(small, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    pool.put(src);
    return out;
  }
  return src;
}

/**
 * The decisions and the pixel maths behind pasting from and to the rest of the computer. Pure (no canvas, no DOM), so
 * it all runs in tests. The code that draws and talks to the clipboard is in convert.ts, picture.ts and system.ts.
 */

/** What Frameling itself copied last, so Paste knows which of its own two clipboards is the newer one. */
export type Copied = 'shapes' | 'pixels';

export type PasteUse = 'picture' | 'shapes' | 'pixels' | 'nothing';

export interface PasteFacts {
  /** The kind of layer being pasted on. */
  layer: 'vector' | 'pixel';
  /** A picture is on the system clipboard and Frameling didn't put it there. */
  external: boolean;
  lastCopied: Copied | null;
  haveShapes: boolean;
  havePixels: boolean;
}

/**
 * What a paste should paste. A picture from another app wins, since it was copied after anything Frameling did (or the
 * clipboard would still hold Frameling's own). Otherwise the latest thing copied in Frameling, whichever kind it was.
 */
export function decidePaste(f: PasteFacts): PasteUse {
  if (f.external) return 'picture';
  const wants: Copied | null = f.lastCopied && (f.lastCopied === 'shapes' ? f.haveShapes : f.havePixels) ? f.lastCopied : f.haveShapes ? 'shapes' : f.havePixels ? 'pixels' : null;
  return wants ?? 'nothing';
}

export type BigPicture = 'shrink' | 'crop';

export interface Fit {
  /** The picture's size once placed. */
  width: number;
  height: number;
  /** Where its top left corner lands on the layer, in art pixels (negative when the edge is cut off). */
  x: number;
  y: number;
  shrunk: boolean;
  cropped: boolean;
}

/**
 * Where a picture of `w` x `h` goes on a layer `gw` x `gh` art pixels: in the middle. One that fits stays the size it
 * is (a picture is never made bigger). One that doesn't fit is shrunk to fit, keeping its shape, or, when `mode` is
 * 'crop', left at its size with the edges that hang over cut off.
 */
export function fitPicture(w: number, h: number, gw: number, gh: number, mode: BigPicture): Fit {
  const big = w > gw || h > gh;
  if (!big || mode === 'crop') {
    return { width: w, height: h, x: Math.floor((gw - w) / 2), y: Math.floor((gh - h) / 2), shrunk: false, cropped: big };
  }
  const k = Math.min(gw / w, gh / h);
  const width = Math.max(1, Math.min(gw, Math.round(w * k)));
  const height = Math.max(1, Math.min(gh, Math.round(h * k)));
  return { width, height, x: Math.floor((gw - width) / 2), y: Math.floor((gh - height) / 2), shrunk: true, cropped: false };
}

/** The picture made smaller by averaging every source pixel under each new one (see-through counts as less colour, not as black). */
export function shrinkPixels(src: Uint8ClampedArray, w: number, h: number, tw: number, th: number): Uint8ClampedArray {
  if (tw === w && th === h) return src;
  const out = new Uint8ClampedArray(tw * th * 4);
  const sx = w / tw;
  const sy = h / th;
  for (let y = 0; y < th; y++) {
    const y0 = y * sy;
    const y1 = (y + 1) * sy;
    for (let x = 0; x < tw; x++) {
      const x0 = x * sx;
      const x1 = (x + 1) * sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wt = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1) && yy < h; yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = Math.floor(x0); xx < Math.ceil(x1) && xx < w; xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          const k = wx * wy;
          const i = (yy * w + xx) * 4;
          const al = src[i + 3] * k;
          r += src[i] * al;
          g += src[i + 1] * al;
          b += src[i + 2] * al;
          a += al;
          wt += k;
        }
      }
      const o = (y * tw + x) * 4;
      if (a > 0) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
      }
      out[o + 3] = wt ? a / wt : 0;
    }
  }
  return out;
}

/** The picture laid on an empty grid `gw` x `gh` as `fit` says, shrunk first when it needs to be, and cut at the grid's edge. */
export function placeOnGrid(src: Uint8ClampedArray, w: number, h: number, gw: number, gh: number, fit: Fit): Uint8ClampedArray {
  const px = fit.shrunk ? shrinkPixels(src, w, h, fit.width, fit.height) : src;
  const pw = fit.shrunk ? fit.width : w;
  const ph = fit.shrunk ? fit.height : h;
  const out = new Uint8ClampedArray(gw * gh * 4);
  for (let y = 0; y < ph; y++) {
    const gy = y + fit.y;
    if (gy < 0 || gy >= gh) continue;
    for (let x = 0; x < pw; x++) {
      const gx = x + fit.x;
      if (gx < 0 || gx >= gw) continue;
      const i = (y * pw + x) * 4;
      const o = (gy * gw + gx) * 4;
      out[o] = px[i];
      out[o + 1] = px[i + 1];
      out[o + 2] = px[i + 2];
      out[o + 3] = px[i + 3];
    }
  }
  return out;
}

/**
 * Pixel art has no soft edges: a pixel more than half there becomes fully there, the rest become clear. `softened`
 * counts the pixels that were part see-through and got changed.
 */
export function hardenEdges(src: Uint8ClampedArray, threshold = 128): { pixels: Uint8ClampedArray; softened: number } {
  const out = new Uint8ClampedArray(src.length);
  let softened = 0;
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    if (a > 0 && a < 255) softened++;
    if (a >= threshold) {
      out[i] = src[i];
      out[i + 1] = src[i + 1];
      out[i + 2] = src[i + 2];
      out[i + 3] = 255;
    }
  }
  return { pixels: out, softened };
}

/** How many pixels of the picture show at all (not fully see-through). */
export function visiblePixels(px: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i]) n++;
  return n;
}

/** How many distinct opaque colours the picture has, counting up to `cap` (to say "a photo" against "flat art"). */
export function colourCount(px: Uint8ClampedArray, cap = 4096): number {
  const seen = new Set<number>();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    if (seen.size >= cap) break;
  }
  return seen.size;
}

/** Every pixel made `k` x `k` pixels, with no smoothing, so pixel art goes out at the size it is on the page. */
export function upscalePixels(src: Uint8ClampedArray, w: number, h: number, k: number): Uint8ClampedArray {
  if (k <= 1) return src;
  const ow = w * k;
  const out = new Uint8ClampedArray(ow * h * k * 4);
  for (let y = 0; y < h * k; y++) {
    const sy = Math.floor(y / k);
    for (let x = 0; x < ow; x++) {
      const si = (sy * w + Math.floor(x / k)) * 4;
      const o = (y * ow + x) * 4;
      out[o] = src[si];
      out[o + 1] = src[si + 1];
      out[o + 2] = src[si + 2];
      out[o + 3] = src[si + 3];
    }
  }
  return out;
}

/** How much a picture of pixels is scaled up for the clipboard: the layer's pixel size, but never past `maxSide` on a side. */
export const copyScale = (w: number, h: number, pixelSize: number, maxSide = 4096): number => Math.max(1, Math.min(pixelSize, Math.floor(maxSide / Math.max(w, h, 1))));

// ---------------------------------------------------------------- what gets said

const sizeWords = (w: number, h: number) => `${w} x ${h}`;

/** Plain words for what a pasted picture did to its size and where it went. */
export function sayPicture(opts: { from: { w: number; h: number }; fit: Fit; into: 'pixel' | 'vector'; layerName?: string; lock?: { changed: number } | null; softened?: number }): string {
  const { from, fit } = opts;
  const parts: string[] = [];
  if (fit.shrunk) parts.push(`Pasted a ${sizeWords(from.w, from.h)} picture, shrunk to ${sizeWords(fit.width, fit.height)} to fit the ${opts.into === 'pixel' ? 'layer' : 'page'}`);
  else if (fit.cropped) parts.push(`Pasted a ${sizeWords(from.w, from.h)} picture at full size, so its edges are cut off where it hangs over`);
  else parts.push(`Pasted a ${sizeWords(from.w, from.h)} picture at its own size, in the middle`);
  if (opts.into === 'vector') parts[0] += '. It is a picture of pixels: you can move, turn and resize it';
  if (opts.lock && opts.lock.changed > 0) parts.push(`its colours were matched to your palette, since this layer's palette is locked`);
  else if (opts.softened && opts.softened > 0) parts.push('soft edges became hard pixels');
  return parts.join(', ') + '.';
}

/** What a paste of shapes onto a pixel layer says it converted. */
export function sayShapesToPixels(opts: { count: number; pixelSize: number; locked: boolean; offPage: boolean; instances: boolean }): string {
  const what = opts.count === 1 ? 'shape' : `${opts.count} shapes`;
  const parts = [`Pasted ${what} as pixels: lines are no longer smooth curves, and edges are hard`];
  parts.push(opts.pixelSize > 1 ? `each pixel here is ${opts.pixelSize} x ${opts.pixelSize} of the page` : 'each pixel is one pixel of the page');
  if (opts.locked) parts.push("colours were matched to the palette, since this layer's palette is locked");
  if (opts.offPage) parts.push('anything past the page edge was left out');
  return parts.join('; ') + '.';
}

/** What a paste of pixels onto a vector layer says it did. */
export function sayPixelsToPicture(opts: { width: number; height: number; pixelSize: number }): string {
  return `Pasted the pixels as a picture (${sizeWords(opts.width, opts.height)} pixels): it stays pixels, so it won't turn into shapes, but you can move, turn and resize it. Double-click it to keep drawing in pixels.`;
}

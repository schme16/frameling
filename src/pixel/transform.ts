/**
 * Whole-drawing pixel operations: flip, quarter turns, turning by any angle without smudging, and outlines. Each one
 * takes RGBA bytes and returns a new array the same size (pixels are never changed in place). Pure, no DOM.
 */

/** An inclusive pixel box to flip or turn around, instead of the drawing's content (a selection's box). */
export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Img {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/** The pixels as one number each (RGBA packed), copying only if the bytes aren't 4-aligned. */
export function u32(p: Uint8ClampedArray): Uint32Array {
  if (p.byteOffset % 4 === 0) return new Uint32Array(p.buffer, p.byteOffset, p.length >> 2);
  return new Uint32Array(new Uint8ClampedArray(p).buffer);
}

/** The box round every pixel that isn't clear, or null when the drawing is empty. Inclusive. */
export function contentBounds(img: Img): { x0: number; y0: number; x1: number; y1: number } | null {
  const { width: w, height: h, pixels: p } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (p[row + x * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Mirror left to right, around the middle of what's drawn (so a sprite stays where it is). */
export function flipH(img: Img, around: 'canvas' | 'content' | PixelBox = 'content'): Uint8ClampedArray {
  const { width: w, height: h, pixels: p } = img;
  const b = typeof around === 'object' ? around : around === 'content' ? contentBounds(img) : null;
  const sum = b ? b.x0 + b.x1 : w - 1;
  const src = u32(p);
  const out = new Uint8ClampedArray(p.length);
  const dst = new Uint32Array(out.buffer);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = src[y * w + x];
      if (!v) continue;
      const nx = sum - x;
      if (nx >= 0 && nx < w) dst[y * w + nx] = v;
    }
  }
  return out;
}

/** Mirror top to bottom, around the middle of what's drawn. */
export function flipV(img: Img, around: 'canvas' | 'content' | PixelBox = 'content'): Uint8ClampedArray {
  const { width: w, height: h, pixels: p } = img;
  const b = typeof around === 'object' ? around : around === 'content' ? contentBounds(img) : null;
  const sum = b ? b.y0 + b.y1 : h - 1;
  const out = new Uint8ClampedArray(p.length);
  for (let y = 0; y < h; y++) {
    const ny = sum - y;
    if (ny < 0 || ny >= h) continue;
    out.set(p.subarray(y * w * 4, (y + 1) * w * 4), ny * w * 4);
  }
  return out;
}

/**
 * Turns by a multiple of 90 degrees (clockwise), exactly, around the middle of what's drawn. Pixels that would land
 * off the canvas are dropped.
 */
export function rotateQuarter(img: Img, turns: number, box?: PixelBox): Uint8ClampedArray {
  const { width: w, height: h, pixels: p } = img;
  const t = ((Math.round(turns) % 4) + 4) % 4;
  if (t === 0) return new Uint8ClampedArray(p);
  const b = box ?? contentBounds(img);
  if (!b) return new Uint8ClampedArray(p);
  // Twice the centre, so odd and even sizes both turn on the pixel grid.
  const cx2 = b.x0 + b.x1;
  const cy2 = b.y0 + b.y1;
  const src = u32(p);
  const out = new Uint8ClampedArray(p.length);
  const dst = new Uint32Array(out.buffer);
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const v = src[y * w + x];
      if (!v) continue;
      const dx2 = 2 * x - cx2;
      const dy2 = 2 * y - cy2;
      let nx2: number;
      let ny2: number;
      if (t === 1) [nx2, ny2] = [-dy2, dx2];
      else if (t === 2) [nx2, ny2] = [-dx2, -dy2];
      else [nx2, ny2] = [dy2, -dx2];
      // Odd-by-even boxes have a centre between pixels on one axis only; round the same way every time.
      const nx = Math.floor((nx2 + cx2) / 2);
      const ny = Math.floor((ny2 + cy2) / 2);
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) dst[ny * w + nx] = v;
    }
  }
  return out;
}

/**
 * Scale2x (also known as EPX): doubles the size, rounding off diagonal steps instead of making blocks. Running it
 * before a nearest-neighbour turn is what keeps rotated pixel art crisp (the idea behind RotSprite).
 */
export function scale2x(src: Uint32Array, w: number, h: number): Uint32Array {
  const W = w * 2;
  const out = new Uint32Array(W * h * 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const P = src[y * w + x];
      const A = y > 0 ? src[(y - 1) * w + x] : P;
      const B = x < w - 1 ? src[y * w + x + 1] : P;
      const C = x > 0 ? src[y * w + x - 1] : P;
      const D = y < h - 1 ? src[(y + 1) * w + x] : P;
      let e0 = P;
      let e1 = P;
      let e2 = P;
      let e3 = P;
      if (C === A && C !== D && A !== B) e0 = A;
      if (A === B && A !== C && B !== D) e1 = B;
      if (D === C && D !== B && C !== A) e2 = C;
      if (B === D && B !== A && D !== C) e3 = D;
      const o = y * 2 * W + x * 2;
      out[o] = e0;
      out[o + 1] = e1;
      out[o + W] = e2;
      out[o + W + 1] = e3;
    }
  }
  return out;
}

/**
 * Turns by any angle (degrees, clockwise) around the middle of what's drawn, without smudging: the art is blown up 8x
 * with Scale2x three times, then each pixel picks the one colour under its centre (no blending, so no new colours).
 * The canvas size stays the same; anything turned off the edge is dropped.
 */
export function rotateSmooth(img: Img, degrees: number, box?: PixelBox): Uint8ClampedArray {
  const { width: w, height: h, pixels: p } = img;
  const deg = ((degrees % 360) + 360) % 360;
  if (deg % 90 === 0) return rotateQuarter(img, deg / 90, box);
  const b = box ?? contentBounds(img);
  if (!b) return new Uint8ClampedArray(p);
  // Work on the content plus a margin, so the upscale stays small on a big canvas with a small sprite.
  const pad = 1;
  const bx = Math.max(0, b.x0 - pad);
  const by = Math.max(0, b.y0 - pad);
  const bw = Math.min(w - 1, b.x1 + pad) - bx + 1;
  const bh = Math.min(h - 1, b.y1 + pad) - by + 1;
  const all = u32(p);
  let cur: Uint32Array = new Uint32Array(bw * bh);
  for (let y = 0; y < bh; y++) cur.set(all.subarray((by + y) * w + bx, (by + y) * w + bx + bw), y * bw);
  const S = 8;
  let cw = bw;
  let ch = bh;
  for (let i = 0; i < 3; i++) {
    cur = scale2x(cur, cw, ch);
    cw *= 2;
    ch *= 2;
  }
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // The centre of the content, in canvas pixels (pixel centres are at +0.5).
  const cx = (b.x0 + b.x1 + 1) / 2;
  const cy = (b.y0 + b.y1 + 1) / 2;
  const out = new Uint8ClampedArray(p.length);
  const dst = new Uint32Array(out.buffer);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Turn this pixel's centre back the other way to find where it came from.
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const sx = cos * dx + sin * dy + cx;
      const sy = -sin * dx + cos * dy + cy;
      const ux = Math.floor((sx - bx) * S);
      const uy = Math.floor((sy - by) * S);
      if (ux < 0 || uy < 0 || ux >= cw || uy >= ch) continue;
      const v = cur[uy * cw + ux];
      if (v) dst[y * w + x] = v;
    }
  }
  return out;
}

/**
 * Adds an outline in `color` round everything drawn. `outside` paints the clear pixels touching the art; `inside`
 * repaints the art's own edge pixels. `corners` also counts diagonal neighbours (a thicker, rounder outline).
 */
export function outline(img: Img, color: readonly [number, number, number, number], where: 'outside' | 'inside', corners = false): { pixels: Uint8ClampedArray; changed: number } {
  const { width: w, height: h, pixels: p } = img;
  const out = new Uint8ClampedArray(p);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && p[(y * w + x) * 4 + 3] !== 0;
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const me = solid(x, y);
      if (where === 'outside' ? me : !me) continue;
      // Outside: a clear pixel next to art. Inside: an art pixel next to a clear pixel (or the canvas edge).
      const want = where === 'outside';
      let touch = solid(x - 1, y) === want || solid(x + 1, y) === want || solid(x, y - 1) === want || solid(x, y + 1) === want;
      if (!touch && corners) touch = solid(x - 1, y - 1) === want || solid(x + 1, y - 1) === want || solid(x - 1, y + 1) === want || solid(x + 1, y + 1) === want;
      if (!touch) continue;
      const i = (y * w + x) * 4;
      if (out[i] === color[0] && out[i + 1] === color[1] && out[i + 2] === color[2] && out[i + 3] === color[3]) continue;
      out[i] = color[0];
      out[i + 1] = color[1];
      out[i + 2] = color[2];
      out[i + 3] = color[3];
      changed++;
    }
  }
  return { pixels: out, changed };
}

/** Flood fill for pixel drawings (RGBA bytes). Pure: the input array is never touched. */

export type Rgba = [number, number, number, number];

/** `#rgb`, `#rrggbb` or `#rrggbbaa` to RGBA bytes. Anything unreadable is opaque black. */
export function parseColor(c: string): Rgba {
  let h = c.trim().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) return [0, 0, 0, 255];
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 255];
}

export interface PixelFillOptions {
  /** `contiguous` fills the connected area (4-way); `all` recolours every pixel of the same colour. */
  mode?: 'contiguous' | 'all';
  /** Tile mode: the area carries on across the edges (left meets right, top meets bottom). */
  wrap?: boolean;
  /** How different a colour can be and still count as the clicked one, 0 (exact) to 255 per channel. Default 0. */
  tolerance?: number;
  /** One byte per pixel; 1 is a wall (a line drawn on another layer). The fill never crosses or paints a wall. */
  walls?: Uint8Array;
}

export interface PixelFillResult {
  /** A new array. */
  pixels: Uint8ClampedArray;
  /** How many pixels changed. */
  changed: number;
}

/**
 * Replaces the colour at (x, y) with `color`. By default only exact matches count (fully transparent pixels all count
 * as the same colour, whatever their hidden RGB); `tolerance` lets close colours count too, and `walls` marks pixels
 * the fill stops at.
 */
export function floodFillPixels(src: Uint8ClampedArray, width: number, height: number, x: number, y: number, color: Rgba, opts: PixelFillOptions = {}): PixelFillResult {
  const out = new Uint8ClampedArray(src);
  if (x < 0 || y < 0 || x >= width || y >= height) return { pixels: out, changed: 0 };
  const at = (y * width + x) * 4;
  const tr = src[at];
  const tg = src[at + 1];
  const tb = src[at + 2];
  const ta = src[at + 3];
  const [nr, ng, nb, na] = color;
  const walls = opts.walls && opts.walls.length === width * height ? opts.walls : undefined;
  // A click on a wall fills nothing.
  if (walls && walls[y * width + x]) return { pixels: out, changed: 0 };
  const tol = Math.max(0, Math.min(255, Math.round(opts.tolerance ?? 0)));
  const same = (i: number) => {
    if (walls && walls[i >> 2]) return false;
    if (tol === 0) return ta === 0 ? src[i + 3] === 0 : src[i] === tr && src[i + 1] === tg && src[i + 2] === tb && src[i + 3] === ta;
    const a = src[i + 3];
    if (ta === 0 && a === 0) return true;
    if (ta === 0 || a === 0) return Math.abs(a - ta) <= tol;
    return Math.abs(src[i] - tr) <= tol && Math.abs(src[i + 1] - tg) <= tol && Math.abs(src[i + 2] - tb) <= tol && Math.abs(a - ta) <= tol;
  };
  // Painting the colour it already is changes nothing (with a tolerance, near colours still get tidied to it).
  if (tol === 0 && (ta === 0 ? na === 0 : tr === nr && tg === ng && tb === nb && ta === na)) return { pixels: out, changed: 0 };
  let changed = 0;
  const paint = (i: number) => {
    if (out[i] === nr && out[i + 1] === ng && out[i + 2] === nb && out[i + 3] === na) return;
    out[i] = nr;
    out[i + 1] = ng;
    out[i + 2] = nb;
    out[i + 3] = na;
    changed++;
  };
  if (opts.mode === 'all') {
    for (let i = 0; i < src.length; i += 4) if (same(i)) paint(i);
    return { pixels: out, changed };
  }
  const seen = new Uint8Array(width * height);
  if (opts.wrap) {
    // Neighbours wrap around. Tiles are small, so a plain 4-way walk is plenty.
    const todo = [y * width + x];
    while (todo.length) {
      const k = todo.pop()!;
      if (seen[k] || !same(k * 4)) continue;
      seen[k] = 1;
      paint(k * 4);
      const cx = k % width;
      const cy = (k - cx) / width;
      todo.push(cy * width + ((cx + 1) % width), cy * width + ((cx + width - 1) % width), ((cy + 1) % height) * width + cx, ((cy + height - 1) % height) * width + cx);
    }
    return { pixels: out, changed };
  }
  const stack: number[] = [x, y];
  while (stack.length) {
    const sy = stack.pop()!;
    const sx = stack.pop()!;
    const row = sy * width;
    if (seen[row + sx] || !same((row + sx) * 4)) continue;
    let a = sx;
    while (a > 0 && !seen[row + a - 1] && same((row + a - 1) * 4)) a--;
    let b = sx;
    while (b < width - 1 && !seen[row + b + 1] && same((row + b + 1) * 4)) b++;
    for (let i = a; i <= b; i++) {
      seen[row + i] = 1;
      paint((row + i) * 4);
    }
    for (const ny of [sy - 1, sy + 1]) {
      if (ny < 0 || ny >= height) continue;
      let inRun = false;
      for (let i = a; i <= b; i++) {
        const ok = !seen[ny * width + i] && same((ny * width + i) * 4);
        if (ok && !inRun) stack.push(i, ny);
        inRun = ok;
      }
    }
  }
  return { pixels: out, changed };
}

/**
 * Flood fills from several points in turn (a click and its mirror images), each on the result of the one before.
 * Points off the grid are skipped. `changed` is the total.
 */
export function floodFillPoints(src: Uint8ClampedArray, width: number, height: number, points: readonly (readonly [number, number])[], color: Rgba, opts: PixelFillOptions = {}): PixelFillResult {
  let pixels = src;
  let changed = 0;
  for (const [x, y] of points) {
    const r = floodFillPixels(pixels, width, height, x, y, color, opts);
    if (!r.changed) continue;
    pixels = r.pixels;
    changed += r.changed;
  }
  return { pixels: changed ? pixels : new Uint8ClampedArray(src), changed };
}

/** The most of the picture a layer can cover and still count as line art; past that it is a backdrop. */
export const BACKDROP_SHARE = 0.6;
/** How much of a pixel a line must cover (alpha, 0 to 255) to count as a wall. */
export const WALL_ALPHA = 32;

/**
 * The walls for the bucket from other layers' pixels (each `w x h` RGBA, already drawn at this layer's pixel size):
 * a pixel is a wall where any layer has ink. A layer covering most of the picture is a backdrop, not line art, so it
 * is left out; otherwise a background would wall everything in. Returns null when there are no walls at all.
 */
export function wallsFromLayers(layers: readonly Uint8ClampedArray[], w: number, h: number): Uint8Array | null {
  const total = w * h;
  const walls = new Uint8Array(total);
  let any = false;
  for (const px of layers) {
    if (px.length < total * 4) continue;
    let ink = 0;
    for (let p = 0; p < total; p++) if (px[p * 4 + 3] >= WALL_ALPHA) ink++;
    if (!ink || ink > total * BACKDROP_SHARE) continue;
    for (let p = 0; p < total; p++) if (px[p * 4 + 3] >= WALL_ALPHA) walls[p] = 1;
    any = true;
  }
  return any ? walls : null;
}

// Packs rectangles of different sizes onto one sheet as tightly as it can (the "maximal rectangles" method, placing
// each one where it leaves the shortest gap). Pure maths, no pictures.

const nextPow2 = (n: number): number => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

export interface Size {
  w: number;
  h: number;
}

export interface Packed {
  /** Top left of each rectangle, in the order they were given. */
  positions: { x: number; y: number }[];
  width: number;
  height: number;
}

interface Free {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Places every rectangle inside a bin of the given size, or returns null when they don't all fit. */
export function packInto(items: Size[], binW: number, binH: number): { x: number; y: number }[] | null {
  let free: Free[] = [{ x: 0, y: 0, w: binW, h: binH }];
  const out: { x: number; y: number }[] = new Array(items.length);
  // Big ones first: they are the hardest to fit later.
  const order = items.map((_, i) => i).sort((a, b) => Math.max(items[b].w, items[b].h) - Math.max(items[a].w, items[a].h) || items[b].w * items[b].h - items[a].w * items[a].h || a - b);
  for (const i of order) {
    const { w, h } = items[i];
    let best: Free | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    for (const f of free) {
      if (f.w < w || f.h < h) continue;
      const short = Math.min(f.w - w, f.h - h);
      const long = Math.max(f.w - w, f.h - h);
      if (short < bestShort || (short === bestShort && long < bestLong) || (short === bestShort && long === bestLong && best && (f.y < best.y || (f.y === best.y && f.x < best.x)))) {
        best = f;
        bestShort = short;
        bestLong = long;
      }
    }
    if (!best) return null;
    const placed = { x: best.x, y: best.y, w, h };
    out[i] = { x: placed.x, y: placed.y };
    // Every free area the new one overlaps splits into up to four smaller ones around it.
    const next: Free[] = [];
    for (const f of free) {
      if (placed.x >= f.x + f.w || placed.x + w <= f.x || placed.y >= f.y + f.h || placed.y + h <= f.y) {
        next.push(f);
        continue;
      }
      if (placed.x > f.x) next.push({ x: f.x, y: f.y, w: placed.x - f.x, h: f.h });
      if (placed.x + w < f.x + f.w) next.push({ x: placed.x + w, y: f.y, w: f.x + f.w - placed.x - w, h: f.h });
      if (placed.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: placed.y - f.y });
      if (placed.y + h < f.y + f.h) next.push({ x: f.x, y: placed.y + h, w: f.w, h: f.y + f.h - placed.y - h });
    }
    // Drop areas that sit wholly inside another.
    free = next.filter((a, ai) => !next.some((b, bi) => bi !== ai && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (bi < ai || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h)));
  }
  return out;
}

const MAX_RECTS_ITEMS = 160;

/** Rows of rectangles, tallest first, each row as tall as its tallest. Null when they don't fit. */
export function packShelves(items: Size[], binW: number, binH: number): { x: number; y: number }[] | null {
  const order = items.map((_, i) => i).sort((a, b) => items[b].h - items[a].h || items[b].w - items[a].w || a - b);
  const out: { x: number; y: number }[] = new Array(items.length);
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const i of order) {
    const { w, h } = items[i];
    if (w > binW) return null;
    if (x + w > binW) {
      y += rowH;
      x = 0;
      rowH = 0;
    }
    if (y + h > binH) return null;
    out[i] = { x, y };
    x += w;
    rowH = Math.max(rowH, h);
  }
  return out;
}

/**
 * Tries a range of sheet widths and keeps the one with the smallest area (squarer wins a tie). With `pot`, both
 * sides are powers of two. Returns null when nothing fits inside `maxSide`.
 */
export function packSheet(items: Size[], opts: { pot?: boolean; maxSide: number }): Packed | null {
  if (!items.length) return { positions: [], width: 1, height: 1 };
  const maxW = Math.max(...items.map((s) => s.w));
  const maxH = Math.max(...items.map((s) => s.h));
  if (maxW > opts.maxSide || maxH > opts.maxSide) return null;
  const area = items.reduce((a, s) => a + s.w * s.h, 0);
  const sumW = items.reduce((a, s) => a + s.w, 0);
  const widths = new Set<number>();
  if (opts.pot) {
    for (let w = nextPow2(maxW); w <= opts.maxSide; w *= 2) widths.add(w);
  } else {
    const hi = Math.min(opts.maxSide, sumW);
    const lo = maxW;
    // A spread of widths around the square root of the area, plus a single row.
    const tries = items.length > 400 ? 8 : 28;
    const centre = Math.max(lo, Math.ceil(Math.sqrt(area)));
    for (let k = 0; k <= tries; k++) {
      const t = k / tries;
      widths.add(Math.min(hi, Math.max(lo, Math.round(lo + (Math.min(hi, centre * 2) - lo) * t))));
    }
    widths.add(hi);
    widths.add(Math.min(hi, centre));
  }
  let best: Packed | null = null;
  let bestScore = Infinity;
  for (const w of [...widths].sort((a, b) => a - b)) {
    // Lots of sprites: rows (shelves) are near as tight and far quicker than the full method.
    const pos = items.length > MAX_RECTS_ITEMS ? packShelves(items, w, opts.maxSide) : packInto(items, w, opts.maxSide);
    if (!pos) continue;
    let usedW = 0;
    let usedH = 0;
    pos.forEach((p, i) => {
      usedW = Math.max(usedW, p.x + items[i].w);
      usedH = Math.max(usedH, p.y + items[i].h);
    });
    const W = opts.pot ? nextPow2(usedW) : usedW;
    const H = opts.pot ? nextPow2(usedH) : usedH;
    if (W > opts.maxSide || H > opts.maxSide) continue;
    // Smallest area, nudged towards square so a sheet never comes out as a thin strip.
    const score = W * H * (1 + 0.15 * (Math.max(W, H) / Math.min(W, H) - 1));
    if (score < bestScore) {
      bestScore = score;
      best = { positions: pos, width: W, height: H };
    }
  }
  return best;
}

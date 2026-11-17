// The picture tip editor's working copy: a small grid of RGBA cells (up to 32 by 32, the most a picture tip holds) that can be
// painted on, flipped, turned and filled, then turned back into the `PixelStamp` the pixel brush paints with. Every edit returns a
// new grid, so undo is a list of them. Also makes a grid from a picture the person supplies (shrunk to fit, never bigger
// than 32 by 32 in memory). Pure, no DOM.
import { tipFrom } from './import/tip';
import { MAX_STAMP, stampCells, type PixelStamp } from './stamps';

export const MIN_GRID = 1;
export const MAX_GRID = MAX_STAMP;

export interface TipGrid {
  w: number;
  h: number;
  /** w * h cells of red, green, blue, alpha. Alpha is how much paint the cell lays down. */
  rgba: Uint8ClampedArray;
}

/** Cells fainter than this (out of 255) are empty. */
const FAINT = 6;

const clampSide = (n: number): number => Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(Number.isFinite(n) ? n : MIN_GRID)));
const at = (g: TipGrid, x: number, y: number): number => (y * g.w + x) * 4;
const inside = (g: TipGrid, x: number, y: number): boolean => x >= 0 && y >= 0 && x < g.w && y < g.h;

export function newGrid(w: number, h: number): TipGrid {
  const gw = clampSide(w);
  const gh = clampSide(h);
  return { w: gw, h: gh, rgba: new Uint8ClampedArray(gw * gh * 4) };
}

export const copyGrid = (g: TipGrid): TipGrid => ({ w: g.w, h: g.h, rgba: new Uint8ClampedArray(g.rgba) });

export const isEmpty = (g: TipGrid): boolean => {
  for (let i = 3; i < g.rgba.length; i += 4) if (g.rgba[i] > FAINT) return false;
  return true;
};

export const sameGrid = (a: TipGrid, b: TipGrid): boolean => a.w === b.w && a.h === b.h && a.rgba.every((v, i) => v === b.rgba[i]);

export type Cell = [number, number, number, number];

export const cellAt = (g: TipGrid, x: number, y: number): Cell => {
  if (!inside(g, x, y)) return [0, 0, 0, 0];
  const i = at(g, x, y);
  return [g.rgba[i], g.rgba[i + 1], g.rgba[i + 2], g.rgba[i + 3]];
};

/** Puts one cell in the grid, in place (the editor copies the grid first). Off the grid does nothing. */
export function setCell(g: TipGrid, x: number, y: number, c: Cell): void {
  if (!inside(g, x, y)) return;
  const i = at(g, x, y);
  g.rgba[i] = c[0];
  g.rgba[i + 1] = c[1];
  g.rgba[i + 2] = c[2];
  g.rgba[i + 3] = c[3];
}

/** A straight line of cells from one cell to another, in place, with no gaps however fast the pointer moved. */
export function paintLine(g: TipGrid, x0: number, y0: number, x1: number, y1: number, c: Cell): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 4 * MAX_GRID; n++) {
    setCell(g, x, y, c);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Fills the patch of like cells under (x, y) with a colour, four ways, in place. Returns how many cells changed. */
export function fillFrom(g: TipGrid, x: number, y: number, c: Cell): number {
  if (!inside(g, x, y)) return 0;
  const from = cellAt(g, x, y);
  const same = (p: Cell): boolean => p[0] === from[0] && p[1] === from[1] && p[2] === from[2] && p[3] === from[3];
  if (same(c)) return 0;
  // Empty cells all count as one colour, whatever red, green and blue they carry.
  const isClear = from[3] <= FAINT;
  const match = (p: Cell): boolean => (isClear ? p[3] <= FAINT : same(p));
  const stack: number[] = [y * g.w + x];
  let n = 0;
  while (stack.length) {
    const k = stack.pop() as number;
    const cx = k % g.w;
    const cy = (k - cx) / g.w;
    if (!match(cellAt(g, cx, cy))) continue;
    setCell(g, cx, cy, c);
    n++;
    if (cx > 0) stack.push(k - 1);
    if (cx < g.w - 1) stack.push(k + 1);
    if (cy > 0) stack.push(k - g.w);
    if (cy < g.h - 1) stack.push(k + g.w);
  }
  return n;
}

export function flipAcross(g: TipGrid): TipGrid {
  const o = newGrid(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) setCell(o, g.w - 1 - x, y, cellAt(g, x, y));
  return o;
}

export function flipDown(g: TipGrid): TipGrid {
  const o = newGrid(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) setCell(o, x, g.h - 1 - y, cellAt(g, x, y));
  return o;
}

/** A quarter turn clockwise (the sides swap). */
export function turnRight(g: TipGrid): TipGrid {
  const o = newGrid(g.h, g.w);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) setCell(o, g.h - 1 - y, x, cellAt(g, x, y));
  return o;
}

/** Moves everything by whole cells; what goes off the edge is lost, and what comes in is empty. */
export function shift(g: TipGrid, dx: number, dy: number): TipGrid {
  const o = newGrid(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) setCell(o, x + dx, y + dy, cellAt(g, x, y));
  return o;
}

/** Turns paint into clear and clear into paint (in `c`), cell by cell: a negative of the shape. Shades flip too. */
export function invertShape(g: TipGrid, c: Cell): TipGrid {
  const o = newGrid(g.w, g.h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const p = cellAt(g, x, y);
      const a = p[3] <= FAINT ? 255 : 255 - p[3];
      setCell(o, x, y, a <= FAINT ? [0, 0, 0, 0] : [p[3] <= FAINT ? c[0] : p[0], p[3] <= FAINT ? c[1] : p[1], p[3] <= FAINT ? c[2] : p[2], a]);
    }
  return o;
}

/** Every cell with more than `at` paint becomes full and every other one empty: no shades left, so the edge is crisp. */
export function harden(g: TipGrid, level = 128): TipGrid {
  const o = copyGrid(g);
  for (let i = 3; i < o.rgba.length; i += 4) {
    const on = o.rgba[i] >= level;
    o.rgba[i] = on ? 255 : 0;
    if (!on) {
      o.rgba[i - 3] = 0;
      o.rgba[i - 2] = 0;
      o.rgba[i - 1] = 0;
    }
  }
  return o;
}

/** The grid on a canvas of another size, the drawing kept in the middle (or as near as the sides allow). */
export function resizeGrid(g: TipGrid, w: number, h: number): TipGrid {
  const o = newGrid(w, h);
  const ox = Math.floor((o.w - g.w) / 2);
  const oy = Math.floor((o.h - g.h) / 2);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) setCell(o, x + ox, y + oy, cellAt(g, x, y));
  return o;
}

/** How many different colours the paint in the grid has. */
export function colourCount(g: TipGrid): number {
  const seen = new Set<number>();
  for (let i = 0; i < g.rgba.length; i += 4) if (g.rgba[i + 3] > FAINT) seen.add((g.rgba[i] << 16) | (g.rgba[i + 1] << 8) | g.rgba[i + 2]);
  return seen.size;
}

// ---------------------------------------------------------------- to and from a stamp

/** The grid a picture tip is drawn on: its own colours when it keeps them, else black with the amount of paint as see-through. */
export function gridFromStamp(st: PixelStamp): TipGrid {
  const g = newGrid(st.w, st.h);
  for (const c of stampCells(st)) {
    const cx = Math.floor((st.w - 1) / 2);
    const cy = Math.floor((st.h - 1) / 2);
    const x = c.x + cx;
    const y = c.y + cy;
    if (st.keep) setCell(g, x, y, [c.rgba[0], c.rgba[1], c.rgba[2], c.rgba[3]]);
    else setCell(g, x, y, [0, 0, 0, st.soft ? c.rgba[3] : 255]);
  }
  return g;
}

export interface MadeTip {
  stamp: PixelStamp;
  /** The longer side of what you can see: the brush size that puts the picture down pixel for pixel. */
  size: number;
}

function bounds(g: TipGrid): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = g.w;
  let y0 = g.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (g.rgba[at(g, x, y) + 3] > FAINT) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

/**
 * The picture tip the grid makes. `colour` true keeps its colours (when it has more than one), false paints its shape in the
 * colour you pick, with the see-through of each cell as how much paint it lays down. Null when nothing is drawn. The empty
 * margin is trimmed, so "size" means the part you can see.
 */
export function stampFromGrid(g: TipGrid, colour: boolean): MadeTip | null {
  const b = bounds(g);
  if (!b) return null;
  const w = b.x1 - b.x0 + 1;
  const h = b.y1 - b.y0 + 1;
  const size = Math.max(w, h);
  if (colour) {
    try {
      const t = tipFrom(g.w, g.h, (x, y, out) => {
        const i = at(g, x, y);
        out[0] = g.rgba[i];
        out[1] = g.rgba[i + 1];
        out[2] = g.rgba[i + 2];
        out[3] = g.rgba[i + 3];
      }, true);
      return { stamp: t.stamp, size: Math.max(t.stamp.w, t.stamp.h) };
    } catch {
      return null;
    }
  }
  const crisp = (() => {
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (g.rgba[at(g, x, y) + 3] > FAINT && g.rgba[at(g, x, y) + 3] < 250) return false;
    return true;
  })();
  const colours: string[] = [];
  const index = new Map<string, number>();
  const cells: number[] = new Array(w * h).fill(0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = g.rgba[at(g, b.x0 + x, b.y0 + y) + 3];
      if (a <= FAINT) continue;
      // Crisp: every cell is paint. Soft: 32 levels is plenty to look smooth, and a full cell stays full.
      const level = crisp || a >= 250 ? 255 : Math.max(8, Math.round((a / 255) * 31) * 8);
      const key = `#000000${level < 255 ? hex2(level) : ''}`;
      let k = index.get(key);
      if (k === undefined) {
        colours.push(key);
        k = colours.length;
        index.set(key, k);
      }
      cells[y * w + x] = k;
    }
  const stamp: PixelStamp = { w, h, colours, cells, keep: false };
  if (!crisp) stamp.soft = true;
  return { stamp, size };
}

// ---------------------------------------------------------------- from a picture

/** What to make of a picture with nothing see-through in it: the dark parts are the brush, the light parts, or the picture as it is. */
export type PictureReading = 'dark' | 'light' | 'colours';

/** A picture (RGBA, any size) as a grid of at most 32 by 32, each cell the average of the patch under it. A picture already that small keeps its pixels. */
export function gridFromPicture(w: number, h: number, rgba: Uint8ClampedArray | Uint8Array, how: PictureReading, hasClear: boolean): TipGrid {
  const longer = Math.max(w, h);
  const f = longer > MAX_GRID ? MAX_GRID / longer : 1;
  const g = newGrid(Math.max(1, Math.round(w * f)), Math.max(1, Math.round(h * f)));
  for (let cy = 0; cy < g.h; cy++) {
    const y0 = Math.floor((cy * h) / g.h);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * h) / g.h));
    for (let cx = 0; cx < g.w; cx++) {
      const x0 = Math.floor((cx * w) / g.w);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / g.w));
      let r = 0;
      let gr = 0;
      let b = 0;
      let a = 0;
      let l = 0;
      let n = 0;
      for (let y = y0; y < y1 && y < h; y++)
        for (let x = x0; x < x1 && x < w; x++) {
          const i = (y * w + x) * 4;
          const pa = rgba[i + 3];
          r += rgba[i] * pa;
          gr += rgba[i + 1] * pa;
          b += rgba[i + 2] * pa;
          a += pa;
          l += (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) * (pa / 255);
          n++;
        }
      if (!n) continue;
      const alpha = a / n;
      if (hasClear || how === 'colours') {
        // The picture's own shape and colours.
        if (a > 0) setCell(g, cx, cy, [Math.round(r / a), Math.round(gr / a), Math.round(b / a), Math.round(alpha)]);
      } else {
        // Lightness is how much paint: dark parts first, or light parts first.
        const lum = l / n;
        const amount = how === 'dark' ? 255 - lum : lum;
        setCell(g, cx, cy, [0, 0, 0, Math.round(amount)]);
      }
    }
  }
  return g;
}

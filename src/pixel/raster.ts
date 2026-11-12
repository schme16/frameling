/**
 * Clean pixel shapes: lines that snap to tidy pixel steps, rectangles and ellipses. Each function calls `plot` for
 * every pixel, so callers can paint straight into a buffer with no lists in between. Pure, no DOM.
 */
import type { PxPt } from '../canvas/pixels';

export type Plot = (x: number, y: number) => void;

/** Bresenham, both ends included. */
export function plotLine(x0: number, y0: number, x1: number, y1: number, plot: Plot): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/**
 * Pixel art's "clean" line slopes: every step is the same length (1:1, 1:2, 2:1, 1:3, 3:1, 1:4, 4:1, flat, upright).
 * Moves the end so the line from `a` uses the nearest one, with whole steps, so there are no odd-sized jaggies.
 */
export function snapCleanLine(a: PxPt, b: PxPt): PxPt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!dx && !dy) return b;
  const ratios: [number, number][] = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [3, 1], [1, 3], [4, 1], [1, 4]];
  const ang = Math.atan2(Math.abs(dy), Math.abs(dx));
  let best = ratios[0];
  let bestD = Infinity;
  for (const r of ratios) {
    const d = Math.abs(Math.atan2(r[1], r[0]) - ang);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  const [rx, ry] = best;
  // Whole steps of the pattern: a 2:1 line is made of 2-pixel runs, so k steps reach 2k - 1 across and k - 1 down.
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const reach = (k: number) => [rx ? rx * k - 1 : 0, ry ? ry * k - 1 : 0];
  const guess = Math.max(1, Math.round((ax + ay + 1) / (rx + ry)));
  let k = guess;
  let kd = Infinity;
  for (let t = Math.max(1, guess - 2); t <= guess + 2; t++) {
    const [ex, ey] = reach(t);
    const d = (ex - ax) ** 2 + (ey - ay) ** 2;
    if (d < kd) {
      kd = d;
      k = t;
    }
  }
  const [ex, ey] = reach(k);
  return { x: a.x + (dx < 0 ? -ex : ex), y: a.y + (dy < 0 ? -ey : ey) };
}

/** A rectangle between two corner pixels (inclusive). `filled` plots the inside too. */
export function plotRect(x0: number, y0: number, x1: number, y1: number, filled: boolean, plot: Plot): void {
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1);
  const by = Math.max(y0, y1);
  for (let y = ay; y <= by; y++) {
    if (filled || y === ay || y === by) for (let x = ax; x <= bx; x++) plot(x, y);
    else {
      plot(ax, y);
      if (bx !== ax) plot(bx, y);
    }
  }
}

/** Just the inside of a rectangle (everything but the edge pixels). */
export function plotRectInside(x0: number, y0: number, x1: number, y1: number, plot: Plot): void {
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1);
  const by = Math.max(y0, y1);
  for (let y = ay + 1; y < by; y++) for (let x = ax + 1; x < bx; x++) plot(x, y);
}

/**
 * An ellipse that fits the box between two corner pixels (inclusive), any size, even or odd. Zingl's algorithm, so
 * the curve is symmetric and has no doubled pixels. With `fill` the spans inside are plotted through `fill`.
 */
export function plotEllipse(x0: number, y0: number, x1: number, y1: number, plot: Plot, fill?: Plot): void {
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (y0 > y1) [y0, y1] = [y1, y0];
  let a = x1 - x0;
  const b = y1 - y0;
  if (a === 0 || b === 0) return plotLine(x0, y0, x1, y1, plot);
  let b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  y0 += (b + 1) >> 1;
  y1 = y0 - b1;
  a = 8 * a * a;
  b1 = 8 * b * b;
  const span = (xa: number, xb: number, y: number) => {
    if (fill) for (let x = xa + 1; x < xb; x++) fill(x, y);
  };
  let lastY0 = NaN;
  let lastY1 = NaN;
  do {
    plot(x1, y0);
    plot(x0, y0);
    plot(x0, y1);
    plot(x1, y1);
    if (fill && y0 !== lastY0) {
      span(x0, x1, y0);
      lastY0 = y0;
    }
    if (fill && y1 !== lastY1 && y1 !== y0) {
      span(x0, x1, y1);
      lastY1 = y1;
    }
    const e2 = 2 * err;
    if (e2 <= dy) {
      y0++;
      y1--;
      err += dy += a;
    }
    if (e2 >= dx || 2 * err > dy) {
      x0++;
      x1--;
      err += dx += b1;
    }
  } while (x0 <= x1);
  // Very flat ellipses: finish the tips.
  while (y0 - y1 <= b) {
    plot(x0 - 1, y0);
    plot(x1 + 1, y0++);
    plot(x0 - 1, y1);
    plot(x1 + 1, y1--);
  }
}

/** The box a drag makes between two pixels. Shift makes it square, Alt grows it from the first pixel as the centre. */
export function dragBox(a: PxPt, b: PxPt, shift: boolean, alt: boolean): [PxPt, PxPt] {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (shift) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * m;
    dy = (dy < 0 ? -1 : 1) * m;
  }
  if (alt) return [{ x: a.x - dx, y: a.y - dy }, { x: a.x + dx, y: a.y + dy }];
  return [a, { x: a.x + dx, y: a.y + dy }];
}

/**
 * A straight-sided shape as clean pixels. `pts` are corners in pixel units (cell x spans x to x + 1). The fill takes
 * every cell whose middle is inside (even-odd, so a star's middle stays filled); the edge joins the corners' cells
 * with plain lines. Either can be left out.
 */
export function plotPolygon(pts: { x: number; y: number }[], closed: boolean, edge: Plot | null, fill?: Plot): void {
  const n = pts.length;
  if (!n) return;
  if (fill && closed && n >= 3) {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    const xs: number[] = [];
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const cy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (a.y <= cy === b.y <= cy) continue;
        xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // Cells whose middles fall between the two crossings.
        for (let x = Math.ceil(xs[k] - 0.5); x + 0.5 < xs[k + 1]; x++) fill(x, y);
      }
    }
  }
  if (!edge) return;
  const cell = (p: { x: number; y: number }) => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
  if (n === 1) {
    const c = cell(pts[0]);
    edge(c.x, c.y);
    return;
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = cell(pts[i]);
    const b = cell(pts[(i + 1) % n]);
    plotLine(a.x, a.y, b.x, b.y, edge);
  }
}

/** The cells a closed outline (in pixel units) covers: every cell whose middle is inside. Rows run top to bottom. */
export function coveredCells(pts: { x: number; y: number }[]): PxPt[] {
  const out: PxPt[] = [];
  plotPolygon(pts, true, null, (x, y) => void out.push({ x, y }));
  return out;
}

/**
 * The cells of a covered area that lie within `depth` cells of its edge: a cell is in the ring when it is that many
 * steps (up, down, left or right) from a cell outside the area. Flat edges get exactly `depth` rows, a slanted edge
 * stays one clean 8-connected line at depth 1, and an area too small for the ring is all ring.
 */
export function edgeRing(cells: PxPt[], depth: number): PxPt[] {
  if (!cells.length) return [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cells) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x);
    y1 = Math.max(y1, c.y);
  }
  // One empty cell all round, so the outside is always next to the edge.
  const w = x1 - x0 + 3;
  const h = y1 - y0 + 3;
  const far = w + h + 1;
  const d = new Int32Array(w * h);
  d.fill(0);
  for (const c of cells) d[(c.y - y0 + 1) * w + (c.x - x0 + 1)] = far;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], d[i - 1] + 1, d[i - w] + 1);
    }
  }
  for (let y = h - 2; y >= 1; y--) {
    for (let x = w - 2; x >= 1; x--) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], d[i + 1] + 1, d[i + w] + 1);
    }
  }
  return cells.filter((c) => d[(c.y - y0 + 1) * w + (c.x - x0 + 1)] <= depth);
}

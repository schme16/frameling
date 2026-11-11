/**
 * A scanline polygon rasteriser into a binary mask. No canvas, no DOM, so it runs in Node, tests and workers.
 *
 * Pixel (i, j) covers [i, i+1] x [j, j+1] and is "inside" when its centre is. Rings are flat `[x0, y0, x1, y1, ...]`
 * arrays, implicitly closed.
 */

export type FillRule = 'evenodd' | 'nonzero';

let scratchX = new Float64Array(1024);
let scratchD = new Int8Array(1024);
let scratchOff = new Int32Array(1024);

function grow(n: number) {
  if (scratchX.length < n) {
    const m = Math.max(n, scratchX.length * 2);
    scratchX = new Float64Array(m);
    scratchD = new Int8Array(m);
  }
}

/**
 * Sets `value` in `mask` (w x h) for every pixel inside the rings under the given rule. Several rings are one
 * shape: with evenodd the overlaps cancel, with nonzero their windings add (so give outer rings one orientation
 * and holes the other, or give every ring the same orientation to union them).
 */
export function fillRings(mask: Uint8Array, w: number, h: number, rings: ArrayLike<number>[], rule: FillRule, value = 1): void {
  // Row range and a difference array of how many crossings land on each row.
  let rmin = h;
  let rmax = -1;
  for (const ring of rings) {
    const n = ring.length >> 1;
    if (n < 3) continue;
    let py = ring[2 * n - 1];
    for (let i = 0; i < n; i++) {
      const y = ring[2 * i + 1];
      let j0 = Math.ceil(Math.min(py, y) - 0.5);
      let j1 = Math.ceil(Math.max(py, y) - 0.5) - 1;
      if (j0 < 0) j0 = 0;
      if (j1 > h - 1) j1 = h - 1;
      if (j0 <= j1) {
        if (j0 < rmin) rmin = j0;
        if (j1 > rmax) rmax = j1;
      }
      py = y;
    }
  }
  if (rmax < rmin) return;
  const rows = rmax - rmin + 1;
  if (scratchOff.length < rows + 2) scratchOff = new Int32Array(Math.max(rows + 2, scratchOff.length * 2));
  const off = scratchOff;
  off.fill(0, 0, rows + 2);
  for (const ring of rings) {
    const n = ring.length >> 1;
    if (n < 3) continue;
    let py = ring[2 * n - 1];
    for (let i = 0; i < n; i++) {
      const y = ring[2 * i + 1];
      let j0 = Math.ceil(Math.min(py, y) - 0.5);
      let j1 = Math.ceil(Math.max(py, y) - 0.5) - 1;
      if (j0 < rmin) j0 = rmin;
      if (j1 > rmax) j1 = rmax;
      if (j0 <= j1) {
        off[j0 - rmin + 1]++;
        off[j1 - rmin + 2]--;
      }
      py = y;
    }
  }
  // Difference array to per-row counts, then to start offsets.
  const counts = new Int32Array(rows);
  let run = 0;
  for (let r = 0; r < rows; r++) {
    run += off[r + 1];
    counts[r] = run;
  }
  off[0] = 0;
  for (let r = 0; r < rows; r++) off[r + 1] = off[r] + counts[r];
  const total = off[rows];
  grow(total);
  const fillPos = new Int32Array(rows);
  for (const ring of rings) {
    const n = ring.length >> 1;
    if (n < 3) continue;
    let px = ring[2 * n - 2];
    let py = ring[2 * n - 1];
    for (let i = 0; i < n; i++) {
      const x = ring[2 * i];
      const y = ring[2 * i + 1];
      if (y !== py) {
        let j0 = Math.ceil(Math.min(py, y) - 0.5);
        let j1 = Math.ceil(Math.max(py, y) - 0.5) - 1;
        if (j0 < rmin) j0 = rmin;
        if (j1 > rmax) j1 = rmax;
        if (j0 <= j1) {
          const slope = (x - px) / (y - py);
          const dir = y > py ? 1 : -1;
          for (let j = j0; j <= j1; j++) {
            const r = j - rmin;
            const k = off[r] + fillPos[r]++;
            scratchX[k] = px + (j + 0.5 - py) * slope;
            scratchD[k] = dir;
          }
        }
      }
      px = x;
      py = y;
    }
  }
  for (let r = 0; r < rows; r++) {
    const s = off[r];
    const e = off[r + 1];
    if (e - s < 2) continue;
    // Insertion sort of this row's crossings by x (rows hold a handful, so this beats anything fancier).
    for (let a = s + 1; a < e; a++) {
      const xv = scratchX[a];
      const dv = scratchD[a];
      let b = a - 1;
      while (b >= s && scratchX[b] > xv) {
        scratchX[b + 1] = scratchX[b];
        scratchD[b + 1] = scratchD[b];
        b--;
      }
      scratchX[b + 1] = xv;
      scratchD[b + 1] = dv;
    }
    const base = (r + rmin) * w;
    if (rule === 'evenodd') {
      for (let a = s; a + 1 < e; a += 2) span(mask, base, w, scratchX[a], scratchX[a + 1], value);
    } else {
      let wind = 0;
      for (let a = s; a < e - 1; a++) {
        wind += scratchD[a];
        if (wind !== 0) span(mask, base, w, scratchX[a], scratchX[a + 1], value);
      }
    }
  }
}

function span(mask: Uint8Array, base: number, w: number, xa: number, xb: number, value: number) {
  let a = Math.ceil(xa - 0.5);
  let b = Math.ceil(xb - 0.5);
  if (a < 0) a = 0;
  if (b > w) b = w;
  if (a < b) mask.fill(value, base + a, base + b);
}

/** Twice the signed area of a flat ring (positive is clockwise on screen, y down). */
export function ringArea2(ring: ArrayLike<number>): number {
  const n = ring.length >> 1;
  let a = 0;
  let px = ring[2 * n - 2];
  let py = ring[2 * n - 1];
  for (let i = 0; i < n; i++) {
    const x = ring[2 * i];
    const y = ring[2 * i + 1];
    a += px * y - x * py;
    px = x;
    py = y;
  }
  return a;
}

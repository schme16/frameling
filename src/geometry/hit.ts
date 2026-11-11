/** Flattening and point tests for `SubPath`s, in document coordinates. */
import type { SubPath } from '../core/format';

/** A closed subpath as a flat `[x0, y0, x1, y1, ...]` ring, with curves cut into short straight pieces. */
export function flattenSubPath(sp: SubPath): number[] {
  const out: number[] = [];
  const pts = sp.points;
  const n = pts.length;
  if (!n) return out;
  out.push(pts[0].x, pts[0].y);
  const seg = (a: number, b: number) => {
    const p = pts[a];
    const q = pts[b];
    if (q.c1 && q.c2) {
      const l = Math.hypot(q.c1.x - p.x, q.c1.y - p.y) + Math.hypot(q.c2.x - q.c1.x, q.c2.y - q.c1.y) + Math.hypot(q.x - q.c2.x, q.y - q.c2.y);
      const k = Math.max(2, Math.min(48, Math.ceil(l / 3)));
      for (let j = 1; j < k; j++) {
        const t = j / k;
        const mt = 1 - t;
        const w0 = mt * mt * mt;
        const w1 = 3 * mt * mt * t;
        const w2 = 3 * mt * t * t;
        const w3 = t * t * t;
        out.push(w0 * p.x + w1 * q.c1.x + w2 * q.c2.x + w3 * q.x, w0 * p.y + w1 * q.c1.y + w2 * q.c2.y + w3 * q.y);
      }
    }
    if (b !== 0) out.push(q.x, q.y);
  };
  for (let i = 1; i < n; i++) seg(i - 1, i);
  if (sp.closed) seg(n - 1, 0);
  return out;
}

/** Even-odd point test over several subpaths, the way fills are painted. */
export function pointInPaths(paths: SubPath[], x: number, y: number): boolean {
  let inside = false;
  for (const sp of paths) {
    const r = flattenSubPath(sp);
    const n = r.length >> 1;
    if (n < 3) continue;
    let px = r[2 * n - 2];
    let py = r[2 * n - 1];
    for (let i = 0; i < n; i++) {
      const cx = r[2 * i];
      const cy = r[2 * i + 1];
      if (cy > y !== py > y && x < ((px - cx) * (y - cy)) / (py - cy) + cx) inside = !inside;
      px = cx;
      py = cy;
    }
  }
  return inside;
}

/** Bounding box of subpaths (points and controls), or null when empty. */
export function pathsBounds(paths: SubPath[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const sp of paths) {
    const r = flattenSubPath(sp);
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < x0) x0 = r[i];
      if (r[i] > x1) x1 = r[i];
      if (r[i + 1] < y0) y0 = r[i + 1];
      if (r[i + 1] > y1) y1 = r[i + 1];
    }
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

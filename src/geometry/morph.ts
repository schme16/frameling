/**
 * Binary morphology on w x h masks (one byte per pixel, 1 = set): an exact Euclidean distance transform, and a
 * disc dilation that gives exactly the same answer as thresholding it, but works on runs so a sparse mask (lines
 * on a big stage) costs next to nothing.
 */

const INF = 1e20;

/**
 * Squared Euclidean distance from every pixel to the nearest set pixel of `src` (Felzenszwalb and Huttenlocher,
 * exact, linear time). Pixels with no set pixel anywhere get a huge value.
 */
export function distanceTransform(src: Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = src[i] ? 0 : INF;
  const m = Math.max(w, h);
  const f = new Float64Array(m);
  const d = new Float64Array(m);
  const v = new Int32Array(m);
  const z = new Float64Array(m + 1);
  const pass = (n: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      d[q] = (q - p) * (q - p) + f[p];
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    pass(h);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = out[row + x];
    pass(w);
    for (let x = 0; x < w; x++) out[row + x] = d[x];
  }
  return out;
}

/** Half widths of a disc of radius r: pixels (dx, dy) with dx^2 + dy^2 <= r^2, as hw[|dy|] = max dx. */
export function discTable(r: number): Int32Array {
  const m = Math.floor(r);
  const hw = new Int32Array(m + 1);
  for (let dy = 0; dy <= m; dy++) hw[dy] = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 1e-9);
  return hw;
}

/** ORs a horizontal run [x0, x1] (inclusive) on row y, swelled by a disc, into `dst`. */
function stampRun(dst: Uint8Array, w: number, h: number, y: number, x0: number, x1: number, hw: Int32Array) {
  const m = hw.length - 1;
  for (let dy = -m; dy <= m; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= h) continue;
    const e = hw[dy < 0 ? -dy : dy];
    let a = x0 - e;
    let b = x1 + e;
    if (a < 0) a = 0;
    if (b > w - 1) b = w - 1;
    if (a <= b) dst.fill(1, yy * w + a, yy * w + b + 1);
  }
}

/** A copy of `src` dilated by a disc of radius r (pixels within r of a set pixel are set). */
export function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const dst = src.slice();
  if (r < 1) return dst;
  const hw = discTable(r);
  const n = w * h;
  let pos = src.indexOf(1);
  while (pos !== -1 && pos < n) {
    const y = (pos / w) | 0;
    const rowEnd = (y + 1) * w;
    let end = src.indexOf(0, pos);
    if (end === -1 || end > rowEnd) end = rowEnd;
    stampRun(dst, w, h, y, pos - y * w, end - 1 - y * w, hw);
    pos = end >= n ? -1 : src.indexOf(1, end);
  }
  return dst;
}

/** ORs a disc-swelled copy of each span (flat `y, x0, x1` triples, x1 inclusive) into `dst`. */
export function stampSpans(dst: Uint8Array, w: number, h: number, spans: Int32Array, count: number, r: number): void {
  const hw = discTable(r);
  for (let i = 0; i < count; i++) stampRun(dst, w, h, spans[3 * i], spans[3 * i + 1], spans[3 * i + 2], hw);
}

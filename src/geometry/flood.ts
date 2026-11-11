/** Scanline flood fill on a blocked mask, 4-connected, recording the filled runs. */

export interface FloodResult {
  /** 1 where filled. */
  mark: Uint8Array;
  /** Filled runs as flat `y, x0, x1` triples (x1 inclusive). */
  spans: Int32Array;
  spanCount: number;
  /** Number of filled pixels. */
  count: number;
  /** True when the fill reached the first or last row or column. */
  touchesEdge: boolean;
}

/** Fills from (sx, sy) through every pixel where `blocked` is 0. The start must be free. */
export function floodSpans(blocked: Uint8Array, w: number, h: number, sx: number, sy: number): FloodResult {
  const mark = new Uint8Array(w * h);
  let spans = new Int32Array(3 * 256);
  let spanCount = 0;
  let count = 0;
  let touchesEdge = false;
  let stack = new Int32Array(2 * 256);
  let sp = 0;
  const push = (x: number, y: number) => {
    if (sp + 2 > stack.length) {
      const bigger = new Int32Array(stack.length * 2);
      bigger.set(stack);
      stack = bigger;
    }
    stack[sp++] = x;
    stack[sp++] = y;
  };
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || blocked[sy * w + sx]) return { mark, spans, spanCount, count, touchesEdge };
  push(sx, sy);
  while (sp > 0) {
    const y = stack[--sp];
    const x = stack[--sp];
    const row = y * w;
    if (blocked[row + x] || mark[row + x]) continue;
    let a = x;
    while (a > 0 && !blocked[row + a - 1] && !mark[row + a - 1]) a--;
    let b = x;
    while (b < w - 1 && !blocked[row + b + 1] && !mark[row + b + 1]) b++;
    mark.fill(1, row + a, row + b + 1);
    count += b - a + 1;
    if (spanCount * 3 + 3 > spans.length) {
      const bigger = new Int32Array(spans.length * 2);
      bigger.set(spans);
      spans = bigger;
    }
    spans[spanCount * 3] = y;
    spans[spanCount * 3 + 1] = a;
    spans[spanCount * 3 + 2] = b;
    spanCount++;
    if (a === 0 || b === w - 1 || y === 0 || y === h - 1) touchesEdge = true;
    for (let dir = -1; dir <= 1; dir += 2) {
      const ny = y + dir;
      if (ny < 0 || ny >= h) continue;
      const nrow = ny * w;
      let inRun = false;
      for (let xx = a; xx <= b; xx++) {
        const free = !blocked[nrow + xx] && !mark[nrow + xx];
        if (free && !inRun) {
          push(xx, ny);
          inRun = true;
        } else if (!free) inRun = false;
      }
    }
  }
  return { mark, spans, spanCount, count, touchesEdge };
}

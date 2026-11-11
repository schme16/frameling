/**
 * Marching squares: turns a binary mask into closed loops.
 *
 * Samples are pixel centres, and contour vertices sit on the midpoints between an inside and an outside sample, so
 * a loop hugs the pixel edges with the corners cut. Diagonal-only neighbours are not joined (the same 4-way
 * connectivity the flood fill uses), so a loop never pinches into a figure 8.
 *
 * Every loop has the inside on its right (y down). Outer boundaries therefore run clockwise on screen, with positive
 * `ringArea2`, and holes run the other way with negative.
 */

export interface MaskBox {
  /** Inclusive pixel bounds of the set pixels. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The loops of the set pixels in `mask` inside `box`, as flat arrays of mask coordinates. */
export function traceMask(mask: Uint8Array, w: number, h: number, box: MaskBox): number[][] {
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  if (bw <= 0 || bh <= 0) return [];
  // Crop with one pixel of empty border so every contour closes inside the grid.
  const W = bw + 2;
  const H = bh + 2;
  const m = new Uint8Array(W * H);
  for (let y = 0; y < bh; y++) {
    const src = (box.y0 + y) * w + box.x0;
    m.set(mask.subarray(src, src + bw), (y + 1) * W + 1);
  }
  const next = new Int32Array(2 * W * H).fill(-1);
  let starts = new Int32Array(1024);
  let ns = 0;
  //The cases below are written walking with the inside on the left, so each link is stored backwards
  const link = (a: number, b: number) => {
    next[b] = a;
    if (ns === starts.length) {
      const bigger = new Int32Array(ns * 2);
      bigger.set(starts);
      starts = bigger;
    }
    starts[ns++] = b;
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      const tl = m[i];
      const tr = m[i + 1];
      const bl = m[i + W];
      const br = m[i + W + 1];
      const c = tl | (tr << 1) | (br << 2) | (bl << 3);
      if (c === 0 || c === 15) continue;
      const T = i * 2;
      const B = (i + W) * 2;
      const L = i * 2 + 1;
      const R = (i + 1) * 2 + 1;
      switch (c) {
        case 1: link(L, T); break;
        case 2: link(T, R); break;
        case 3: link(L, R); break;
        case 4: link(R, B); break;
        case 5: link(L, T); link(R, B); break;
        case 6: link(T, B); break;
        case 7: link(L, B); break;
        case 8: link(B, L); break;
        case 9: link(B, T); break;
        case 10: link(T, R); link(B, L); break;
        case 11: link(B, R); break;
        case 12: link(R, L); break;
        case 13: link(R, T); break;
        case 14: link(T, L); break;
      }
    }
  }
  const loops: number[][] = [];
  for (let s = 0; s < ns; s++) {
    const start = starts[s];
    if (next[start] < 0) continue;
    const loop: number[] = [];
    let cur = start;
    for (;;) {
      const e = cur >> 1;
      const ex = e % W;
      const ey = (e / W) | 0;
      //Edge ids are local sample coordinates, which sit one pixel in from the box because of the border
      if (cur & 1) loop.push(ex + box.x0 - 0.5, ey + box.y0);
      else loop.push(ex + box.x0, ey + box.y0 - 0.5);
      const n = next[cur];
      next[cur] = -2;
      if (n < 0) break;
      cur = n;
      if (cur === start) break;
    }
    loops.push(loop);
  }
  return loops;
}

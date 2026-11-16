// The small copy of the picture the dialog shows while you drag: made once, nearest pixel so pixel art stays crisp, then run
// through the tables every time something moves. Pure, so it is tested without a canvas.
export interface Small {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/** The picture shrunk to fit inside `max` pixels on its longer side (never enlarged), taking the pixel nearest each spot. */
export function shrinkToFit(img: Small, max: number): Small {
  const { width, height, pixels } = img;
  const k = Math.min(1, max / Math.max(width, height));
  if (k >= 1) return img;
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / w));
      const s = (sy * width + sx) * 4;
      out.set(pixels.subarray(s, s + 4), (y * w + x) * 4);
    }
  }
  return { width: w, height: h, pixels: out };
}

/** The part of the picture worth showing: the box round everything painted, with a little room, so a small sprite in a big canvas is not a speck. */
export function contentBox(img: Small, pad = 2): { x: number; y: number; w: number; h: number } | null {
  const { width, height, pixels } = img;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (pixels[(y * width + x) * 4 + 3] !== 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const x = Math.max(0, x0 - pad);
  const y = Math.max(0, y0 - pad);
  return { x, y, w: Math.min(width, x1 + pad + 1) - x, h: Math.min(height, y1 + pad + 1) - y };
}

/** A copy of the part of the picture inside the box. */
export function cropTo(img: Small, box: { x: number; y: number; w: number; h: number }): Small {
  const out = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y + y) * img.width + box.x) * 4;
    out.set(img.pixels.subarray(from, from + box.w * 4), y * box.w * 4);
  }
  return { width: box.w, height: box.h, pixels: out };
}

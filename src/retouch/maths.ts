/**
 * The maths of the retouch brushes: where a clone stamp copies from, and what a blur or a sharpen turns a pixel into.
 * Pure functions on a `Reader` (anything that says what pixel is at x, y), so they are tested without a canvas.
 * The dab engine (src/dab) lays the dabs and decides how far each pixel goes toward the colour made here.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Somewhere to read a picture from: writes the pixel at x, y (r, g, b, a) into `out`. Must cope with a spot outside the picture (see-through). */
export type Reader = (x: number, y: number, out: Uint8ClampedArray | number[]) => void;

// ---------------------------------------------------------------- clone stamp

/**
 * What the clone stamp remembers between strokes: the spot you chose to copy from, and the gap between where you paint and
 * where it copies from (the offset), which is what "aligned" keeps.
 */
export interface CloneAim {
  source: Pt | null;
  offset: Pt | null;
}

export const noAim = (): CloneAim => ({ source: null, offset: null });

/** Choosing a new source forgets the old offset: the next stroke works it out afresh. Whole pixels, because a copy lands pixel for pixel. */
export function chooseSource(at: Pt): CloneAim {
  return { source: { x: Math.floor(at.x), y: Math.floor(at.y) }, offset: null };
}

/**
 * The offset a stroke starting at `start` copies with. Aligned: the one already worked out, if there is one, so lifting the
 * pen and starting again carries on in step with the first stroke. Not aligned: always from the source, so every stroke
 * begins by copying the spot you chose. The very first stroke after choosing a source has no offset yet, so it takes the same
 * answer either way. Null when there is no source.
 */
export function strokeOffset(aim: CloneAim, start: Pt, aligned: boolean): Pt | null {
  if (!aim.source) return null;
  if (aligned && aim.offset) return aim.offset;
  return { x: aim.source.x - Math.floor(start.x), y: aim.source.y - Math.floor(start.y) };
}

/** Where a pixel at `at` is copied from. */
export const copiedFrom = (at: Pt, offset: Pt): Pt => ({ x: Math.floor(at.x) + offset.x, y: Math.floor(at.y) + offset.y });

/**
 * Where to draw the "this is what it will copy" ring while the pen hovers: the source spot itself when the next stroke will start
 * there (nothing aligned yet, or not aligned), else the hover spot moved by the offset.
 */
export function previewSpot(aim: CloneAim, hover: Pt, aligned: boolean): Pt | null {
  const o = strokeOffset(aim, hover, aligned);
  if (!o) return null;
  return aligned && aim.offset ? { x: hover.x + o.x, y: hover.y + o.y } : aim.source;
}

// ---------------------------------------------------------------- blur and sharpen

/** How many pixels out a blur reaches for an amount of 0.05 to 1: from 1 (a gentle smear) to 6. */
export const blurRadius = (amount: number): number => Math.max(1, Math.min(6, Math.round(1 + amount * 5)));

/** How hard a sharpen pushes each pixel away from its neighbours' average for an amount of 0.05 to 1: up to 3 times the difference. */
export const sharpenGain = (amount: number): number => Math.max(0, Math.min(1, amount)) * 3;

/** The reach a sharpen looks over: its neighbours within one pixel, or two for a strong one. */
export const sharpenRadius = (amount: number): number => (amount > 0.7 ? 2 : 1);

const byte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/**
 * The average of the square of pixels around (x, y) reaching `radius` out, with see-through counted properly: a clear
 * pixel adds no colour and brings the see-through down, so a blur at the edge of a shape softens the edge instead of
 * dragging black into it. Pixels off the edge of the picture are left out, so the picture's own edge does not fade.
 */
export function blurAt(read: Reader, width: number, height: number, x: number, y: number, radius: number, out: Uint8ClampedArray | number[]): void {
  const px = new Uint8ClampedArray(4);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let n = 0;
  const x0 = Math.max(0, x - radius);
  const x1 = Math.min(width - 1, x + radius);
  const y0 = Math.max(0, y - radius);
  const y1 = Math.min(height - 1, y + radius);
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      read(xx, yy, px);
      const w = px[3];
      r += px[0] * w;
      g += px[1] * w;
      b += px[2] * w;
      a += w;
      n++;
    }
  }
  if (n === 0 || a === 0) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return;
  }
  out[0] = byte(r / a);
  out[1] = byte(g / a);
  out[2] = byte(b / a);
  out[3] = byte(a / n);
}

/** What a sharpen makes of a pixel: its colour pushed away from the average round it (an unsharp mask). The see-through stays as it was, and a clear pixel stays clear. */
export function sharpenOf(was: ArrayLike<number>, blurred: ArrayLike<number>, gain: number, out: Uint8ClampedArray | number[]): void {
  out[3] = was[3];
  if (was[3] === 0) {
    out[0] = was[0];
    out[1] = was[1];
    out[2] = was[2];
    return;
  }
  for (let i = 0; i < 3; i++) out[i] = byte(was[i] + gain * (was[i] - blurred[i]));
}

/** Remembers one result per pixel for the length of a stroke, so a pixel dabbed again and again is worked out once. */
export class StrokeMemo {
  private readonly seen = new Map<number, number>();
  constructor(private readonly width: number) {}

  /** The colour for (x, y), from the memory when it has been worked out already; `make` writes it into its argument otherwise. */
  get(x: number, y: number, make: (out: Uint8ClampedArray) => void, out: Uint8ClampedArray | number[]): void {
    const k = y * this.width + x;
    let v = this.seen.get(k);
    if (v === undefined) {
      const t = new Uint8ClampedArray(4);
      make(t);
      v = ((t[0] << 24) | (t[1] << 16) | (t[2] << 8) | t[3]) >>> 0;
      this.seen.set(k, v);
    }
    out[0] = v >>> 24;
    out[1] = (v >>> 16) & 255;
    out[2] = (v >>> 8) & 255;
    out[3] = v & 255;
  }
}

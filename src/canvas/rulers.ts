// Ruler maths: which ticks to draw and what to call them, for a stretch of the stage at a zoom, in the chosen unit.
// Pure, so it can be tested without a canvas.
import { pxTo, toPx, type Unit } from '../core/units';

/** How thick the rulers are, in CSS pixels. */
export const RULER = 20;
/** Numbered ticks are at least this far apart on screen. */
const MAJOR_MIN_PX = 56;
/** Small ticks are at least this far apart on screen. */
const MINOR_MIN_PX = 5;

/** The smallest of 1, 2, 5, 10, 20, 50... (or 0.1, 0.2, 0.5...) that is at least `min`. */
export function niceStep(min: number): number {
  if (!(min > 0) || !Number.isFinite(min)) return 1;
  const p = 10 ** Math.floor(Math.log10(min));
  for (const m of [1, 2, 5, 10]) if (m * p >= min - 1e-12) return m * p;
  return 10 * p;
}

/** How many small steps between numbered ticks, as many as fit (10, 5, 4, 2 or none). */
export function subdivisions(major: number, screenPerUnit: number): number {
  const mant = Math.round(major / 10 ** Math.floor(Math.log10(major) + 1e-9));
  const options = mant === 2 ? [4, 2] : mant === 5 ? [5] : [10, 5, 2];
  for (const n of options) if ((major / n) * screenPerUnit >= MINOR_MIN_PX) return n;
  return 1;
}

export interface Ticks {
  /** Numbered ticks: where (stage pixels) and what they say. */
  major: { at: number; label: string }[];
  /** Small ticks, in stage pixels. `half` marks the one halfway between numbers (drawn a little longer). */
  minor: { at: number; half: boolean }[];
}

/** Ticks for the stage from `from` to `to` (stage pixels) at `zoom` (screen pixels per stage pixel). */
export function rulerTicks(from: number, to: number, zoom: number, unit: Unit, dpi: number): Ticks {
  const pxPerUnit = toPx(1, unit, dpi);
  const screenPerUnit = zoom * pxPerUnit;
  const major = niceStep(MAJOR_MIN_PX / screenPerUnit);
  const n = subdivisions(major, screenPerUnit);
  const minorStep = major / n;
  const u0 = pxTo(Math.min(from, to), unit, dpi);
  const u1 = pxTo(Math.max(from, to), unit, dpi);
  const places = Math.max(0, -Math.floor(Math.log10(major) + 1e-9));
  const out: Ticks = { major: [], minor: [] };
  const i0 = Math.floor(u0 / minorStep);
  const i1 = Math.ceil(u1 / minorStep);
  // A cap keeps a silly zoom from making millions of ticks.
  if (i1 - i0 > 5000) return out;
  for (let i = i0; i <= i1; i++) {
    const v = i * minorStep;
    const at = toPx(v, unit, dpi);
    if (i % n === 0) out.major.push({ at, label: formatTick(v, places) });
    else out.minor.push({ at, half: n % 2 === 0 && i % n === n / 2 });
  }
  return out;
}

function formatTick(v: number, places: number): string {
  const s = v.toFixed(places);
  return s === '-0' || /^-0\.0*$/.test(s) ? '0' : s;
}

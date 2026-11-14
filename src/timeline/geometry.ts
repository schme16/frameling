/** Pure maths for laying the grid out: which frame is under a pixel, which frames are on screen, how zoom behaves. */

export function frameAtX(x: number, cw: number, max = Infinity): number {
  return Math.max(0, Math.min(max, Math.floor(x / cw)));
}

/** First and last frame (inclusive) to draw for a scroll position, with some spare frames either side. */
export function visibleFrames(scrollLeft: number, viewWidth: number, cw: number, spare = 6): { from: number; to: number } {
  return { from: Math.max(0, Math.floor(scrollLeft / cw) - spare), to: Math.ceil((scrollLeft + viewWidth) / cw) + spare };
}

/** Frames between ruler numbers, so they never crowd: every 5 when roomy, then 10, 20, 50, and on up for tiny frames. */
export function labelStep(cw: number): number {
  if (cw >= 18) return 5;
  if (cw >= 10) return 10;
  if (cw >= 7) return 20;
  if (cw >= 3) return 50;
  if (cw >= 1.2) return 100;
  if (cw >= 0.5) return 250;
  return 500;
}

/** The scroll position that keeps the frame under the pointer where it is while zooming. */
export function zoomScroll(scrollLeft: number, anchorX: number, oldCw: number, newCw: number): number {
  const frame = (scrollLeft + anchorX) / oldCw;
  return Math.max(0, frame * newCw - anchorX);
}

/** Time of a frame in seconds, to two decimals ("0.17"). */
export function seconds(frame: number, fps: number): string {
  return (frame / fps).toFixed(2);
}

/** "1 / 24" style frame text. People count from 1, the data counts from 0. */
export function frameText(frame: number, length: number): string {
  return `${frame + 1} / ${length}`;
}

/** A cel's key part and held tail, in frames: the key is always the first frame. */
export function celParts(length: number): { key: number; hold: number } {
  return { key: 1, hold: Math.max(0, length - 1) };
}

/** The words for a hold: 1 = "on ones", 2 = "on twos", up to fours, then a plain count. */
export function holdWords(frames: number): string {
  const on = ['', 'ones', 'twos', 'threes', 'fours'][frames];
  return on ? `${frames} frame${frames === 1 ? '' : 's'} (on ${on})` : `${frames} frames`;
}

/** Under this many pixels wide a drawing is too small to draw by itself, so runs of them are drawn as one band. */
export const TINY_CEL = 4;

/** One thing to draw on a row: a single drawing, or (dense) a run of tiny ones drawn as one band. */
export interface CelPiece<C> {
  cel: C;
  /** Pixels from the row's start, with no gap taken off. */
  left: number;
  right: number;
  /** How many drawings the band stands for (1 for a single one). */
  count: number;
  dense: boolean;
}

/**
 * What to draw for a row of cels at this zoom. Wide enough drawings are drawn as they are. Tiny ones that touch are
 * joined into one band, so a clip of hundreds of one-frame drawings squeezed into a window stays a few shapes.
 * `cels` is in time order; so is the result.
 */
export function thinCels<C extends { start: number; length: number }>(cels: readonly C[], cw: number): CelPiece<C>[] {
  const out: CelPiece<C>[] = [];
  let run: CelPiece<C> | null = null;
  for (const cel of cels) {
    const left = cel.start * cw;
    const right = (cel.start + cel.length) * cw;
    if (right - left >= TINY_CEL) {
      run = null;
      out.push({ cel, left, right, count: 1, dense: false });
    } else if (run && left - run.right <= 1) {
      run.right = Math.max(run.right, right);
      run.count++;
      run.dense = true;
    } else {
      run = { cel, left, right, count: 1, dense: false };
      out.push(run);
    }
  }
  // A band of one is just a thin drawing: keep it at least a pixel wide.
  for (const p of out) if (p.right - p.left < 1) p.right = p.left + 1;
  return out;
}

/** The gap left between neighbouring drawings: 2 px when roomy, none when frames are tiny. */
export function celGap(cw: number): number {
  return cw >= 5 ? 2 : cw >= 2 ? 1 : 0;
}

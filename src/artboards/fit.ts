/**
 * Fitting a shot into a picture of another size (joining, playing and exporting shots of different sizes).
 * Pure maths, no DOM. "bars" keeps the whole shot and fills the rest with bars (letterbox or pillarbox);
 * "fill" covers the whole picture and crops what hangs over.
 */
import { currentChoice, registerChoice } from '../core/choices';

export type FitMode = 'bars' | 'fill';

registerChoice<FitMode>({
  id: 'artboards.fit',
  title: 'Shots of different sizes',
  question: 'When shots are different sizes, how should each fit the picture?',
  category: 'Export',
  default: 'bars',
  silent: true,
  help: 'Used by Play all in order and by exporting the artboards all in order, as one.',
  options: [
    { value: 'bars', label: 'Fit (bars)', detail: 'The whole shot shows, with bars at the sides or top and bottom (the stage colour).' },
    { value: 'fill', label: 'Fill (crop)', detail: 'The shot covers the whole picture and what hangs over is cropped.' },
  ],
});

/** How shots of different sizes fit: what Preferences says (Fit by default). */
export const currentFit = (): FitMode => currentChoice<FitMode>('artboards.fit');


export interface Placement {
  /** Scale from the shot to the picture. */
  k: number;
  /** Where the shot's top-left lands in the picture. */
  x: number;
  y: number;
  /** The shot's size as placed. */
  w: number;
  h: number;
  /** The bars, in picture space (empty when the shot fills the picture). */
  bars: { x: number; y: number; w: number; h: number }[];
}

const EPS = 1e-6;

/** Where a shot of `sw` x `sh` goes in a picture of `W` x `H`, centred. */
export function fitPlacement(sw: number, sh: number, W: number, H: number, mode: FitMode): Placement {
  const k = mode === 'fill' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const w = sw * k;
  const h = sh * k;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  const bars: Placement['bars'] = [];
  if (mode === 'bars') {
    if (y > EPS) bars.push({ x: 0, y: 0, w: W, h: y }, { x: 0, y: H - y, w: W, h: y });
    if (x > EPS) bars.push({ x: 0, y: 0, w: x, h: H }, { x: W - x, y: 0, w: x, h: H });
  }
  return { k, x, y, w, h, bars };
}

/** True when a shot of this size needs no fitting into the picture. */
export function sameSize(sw: number, sh: number, W: number, H: number): boolean {
  return sw === W && sh === H;
}

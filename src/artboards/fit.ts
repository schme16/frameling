/**
 * Fitting a shot into a picture of another size (joining, playing and exporting shots of different sizes).
 * Pure maths, no DOM. "bars" keeps the whole shot and fills the rest with bars (letterbox or pillarbox);
 * "fill" covers the whole picture and crops what hangs over.
 */
import { currentChoice, registerChoice } from '../core/choices';
import { createStore, readRaw, writeJson } from '../ui/mini';
import { choiceWord } from '../words/choices';

export type FitMode = 'bars' | 'fill';

registerChoice<FitMode>({
  id: 'artboards.fit',
  title: choiceWord('choice.artboards.fit.title'),
  question: choiceWord('choice.artboards.fit.question'),
  category: 'Export',
  default: 'bars',
  silent: true,
  help: 'Used by Play all in order and by exporting the artboards all in order, as one.',
  options: [
    { value: 'bars', label: choiceWord('choice.artboards.fit.bars.label'), detail: choiceWord('choice.artboards.fit.bars.detail') },
    { value: 'fill', label: choiceWord('choice.artboards.fit.fill.label'), detail: choiceWord('choice.artboards.fit.fill.detail') },
  ],
});

export type BarColor = 'background' | 'black' | 'white';

registerChoice<BarColor>({
  id: 'artboards.barColor',
  title: choiceWord('choice.artboards.barColor.title'),
  question: choiceWord('choice.artboards.barColor.question'),
  category: 'Export',
  default: 'background',
  silent: true,
  help: 'The picture is the first shot, so by default the bars are its background colour.',
  options: [
    { value: 'background', label: choiceWord('choice.artboards.barColor.background.label'), detail: choiceWord('choice.artboards.barColor.background.detail') },
    { value: 'black', label: choiceWord('choice.artboards.barColor.black.label'), detail: choiceWord('choice.artboards.barColor.black.detail') },
    { value: 'white', label: choiceWord('choice.artboards.barColor.white.label') },
  ],
});

/** The bars' colour: what Preferences says, given the picture's own background (null means see-through). */
export function barColorFor(background: string | null): string | null {
  const c = currentChoice<BarColor>('artboards.barColor');
  return c === 'black' ? '#000000' : c === 'white' ? '#ffffff' : background;
}

/** How shots of different sizes fit: what Preferences says (Fit by default). */
export const currentFit = (): FitMode => currentChoice<FitMode>('artboards.fit');


export type PictureSize = 'first' | 'largest' | 'custom';

registerChoice<PictureSize>({
  id: 'artboards.pictureSize',
  title: choiceWord('choice.artboards.pictureSize.title'),
  question: choiceWord('choice.artboards.pictureSize.question'),
  category: 'Export',
  default: 'first',
  silent: true,
  help: 'Used by Play all in order and by exporting the artboards all in order, as one. Shots of another size are fitted into it.',
  options: [
    { value: 'first', label: choiceWord('choice.artboards.pictureSize.first.label'), detail: choiceWord('choice.artboards.pictureSize.first.detail') },
    { value: 'largest', label: choiceWord('choice.artboards.pictureSize.largest.label'), detail: choiceWord('choice.artboards.pictureSize.largest.detail') },
    { value: 'custom', label: choiceWord('choice.artboards.pictureSize.custom.label'), detail: choiceWord('choice.artboards.pictureSize.custom.detail') },
  ],
});

export interface PicSize {
  width: number;
  height: number;
}

/** Biggest picture side a custom size can be. */
export const MAX_PICTURE_SIDE = 8192;

const CUSTOM_KEY = 'frameling.artboards.customPicture.v1';
const clampSide = (n: number): number => Math.max(1, Math.min(MAX_PICTURE_SIDE, Math.round(Number.isFinite(n) ? n : 1)));
const readCustom = (): PicSize | null => {
  const v = readRaw<Partial<PicSize> | null>(CUSTOM_KEY, null);
  return v && Number.isFinite(v.width) && Number.isFinite(v.height) ? { width: clampSide(v.width!), height: clampSide(v.height!) } : null;
};

/** The size typed in for "Custom" (null until one is typed: then the first shot's size stands in). */
export const customPicture = createStore<PicSize | null>(readCustom());

export function setCustomPicture(size: PicSize): void {
  const s = { width: clampSide(size.width), height: clampSide(size.height) };
  customPicture.set(s);
  writeJson(CUSTOM_KEY, s);
}

/** The picture's size for shots of these sizes (in order): the first, the one with the most area, or the custom size. */
export function pictureSizeFor(sizes: readonly PicSize[], mode: PictureSize, custom: PicSize | null = null): PicSize {
  const first = sizes[0] ?? { width: 1, height: 1 };
  if (mode === 'custom') return custom ? { width: clampSide(custom.width), height: clampSide(custom.height) } : { ...first };
  if (mode === 'largest') return sizes.reduce((best, s) => (s.width * s.height > best.width * best.height ? s : best), first);
  return { ...first };
}

/** How the picture is sized: what the Export dialog and the player say (First shot by default). */
export const currentPictureSize = (sizes: readonly PicSize[]): PicSize => {
  const c = pictureSizeFor(sizes, currentChoice<PictureSize>('artboards.pictureSize'), customPicture.get());
  return { width: c.width, height: c.height };
};

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

// Dither patterns for the dither brush: which pixels get the stroke colour and which get the fill colour. Ordered
// (Bayer) thresholds, so neighbouring strokes line up into one even pattern however you paint them.

export type DitherPattern = 'checker' | 'light' | 'heavy' | 'lines' | 'columns' | 'grid' | 'bayer';

export interface DitherInfo {
  id: DitherPattern;
  label: string;
  /** Rows of 0/1, as a little picture for the options (1 = stroke colour). */
  preview: string[];
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** True when (x, y) takes the stroke colour. Works for negative x and y too. */
export function ditherOn(p: DitherPattern, x: number, y: number): boolean {
  const mx = ((x % 4) + 4) % 4;
  const my = ((y % 4) + 4) % 4;
  switch (p) {
    case 'checker':
      return ((x + y) & 1) === 0;
    case 'light':
      // One in four, staggered row to row so it reads as an even tone rather than a grid of dots.
      return (my & 1) === 0 ? mx === 0 : mx === 2;
    case 'heavy':
      return (my & 1) === 0 ? mx !== 0 : mx !== 2;
    case 'lines':
      return (y & 1) === 0;
    case 'columns':
      return (x & 1) === 0;
    case 'grid':
      return (x & 1) === 0 || (y & 1) === 0;
    case 'bayer':
      // A sparse 1-in-8 sprinkle, nice for soft gradients and texture.
      return BAYER4[my * 4 + mx] < 2;
  }
}

function previewOf(p: DitherPattern): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 4; y++) {
    let r = '';
    for (let x = 0; x < 4; x++) r += ditherOn(p, x, y) ? '1' : '0';
    rows.push(r);
  }
  return rows;
}

export const DITHER_PATTERNS: DitherInfo[] = (
  [
    ['checker', 'Checker (half and half)'],
    ['light', 'Light (one in four)'],
    ['heavy', 'Heavy (three in four)'],
    ['bayer', 'Sprinkle (one in eight)'],
    ['lines', 'Stripes across'],
    ['columns', 'Stripes down'],
    ['grid', 'Grid'],
  ] as [DitherPattern, string][]
).map(([id, label]) => ({ id, label, preview: previewOf(id) }));

// ---------------------------------------------------------------- gradient dithers

/** How a pixel gradient turns "this far between two colours" into one colour or the other. */
export type GradientDither = 'bands' | 'chunky' | 'classic' | 'smooth' | 'grainy';

export interface GradientDitherInfo {
  id: GradientDither;
  label: string;
  detail: string;
}

export const GRADIENT_DITHERS: GradientDitherInfo[] = [
  { id: 'classic', label: 'Classic', detail: 'The usual ordered pattern (a 4 by 4 grid), 16 shades between two colours.' },
  { id: 'smooth', label: 'Smooth', detail: 'A finer 8 by 8 pattern, 64 shades between two colours. The softest blend.' },
  { id: 'chunky', label: 'Chunky', detail: 'A 2 by 2 checker pattern, 4 shades. Bold and retro.' },
  { id: 'grainy', label: 'Grainy', detail: 'Scattered pixels with no pattern, like film grain.' },
  { id: 'bands', label: 'Bands', detail: 'No dithering: hard steps from one colour to the next.' },
];

const BAYER2 = [0, 2, 3, 1];

/** The 8 by 8 Bayer matrix, made from the 4 by 4 one the usual way. */
const BAYER8: number[] = (() => {
  const out = new Array<number>(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[y * 8 + x] = 4 * BAYER4[(y & 3) * 4 + (x & 3)] + BAYER2[(y >> 2) * 2 + (x >> 2)];
  return out;
})();

/** A steady scatter in (0, 1) for a pixel (the same pixel always gets the same number, and it works for negative x and y). */
function scatter(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) + 0.5) / 4294967296;
}

/**
 * The cut-off for a pixel, in (0, 1): a pixel that is further than this between two colours takes the second one. Over
 * a whole pattern the cut-offs are spread evenly, so a position a third of the way along gives the second colour to
 * about a third of the pixels.
 */
export function gradientThreshold(style: GradientDither, x: number, y: number): number {
  const mx = ((x % 8) + 8) % 8;
  const my = ((y % 8) + 8) % 8;
  switch (style) {
    case 'bands':
      return 0.5;
    case 'chunky':
      return (BAYER2[(my & 1) * 2 + (mx & 1)] + 0.5) / 4;
    case 'classic':
      return (BAYER4[(my & 3) * 4 + (mx & 3)] + 0.5) / 16;
    case 'smooth':
      return (BAYER8[my * 8 + mx] + 0.5) / 64;
    case 'grainy':
      return scatter(x, y);
  }
}

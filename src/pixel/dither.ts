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

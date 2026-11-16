// The pixel brushes that come with Frameling: a few plain pixel brushes, some shapes, scatter and picture tips, smooth
// edged brushes, and the soft paint and dry media tools as ready-made brushes. They sit in the same library as the
// vector starters and, like them, never change and can't be deleted; save a copy to make it your own.
import { DEFAULT_BRUSH } from '../core/doc';
import { DEFAULT_DAB, cleanDab, type DabBrush } from '../dab/maths';
import type { PixelSpec } from '../dab/spec';
import { MEDIA, type DryId } from '../dry/maths';
import { DEFAULT_SOFT } from '../soft/settings';
import type { PixelStamp } from './stamps';
import type { BrushPreset } from './model';

/** The groups the pixel starters sit in, in the order the picker lists them. */
export const PIXEL_GROUPS = ['Pixel basics', 'Shapes', 'Scatter and spray', 'Picture tips', 'Smooth edges', 'Soft paint', 'Dry media'] as const;
export type PixelGroup = (typeof PIXEL_GROUPS)[number];

/** A one-colour picture from rows of text: `#` is paint, anything else is clear. */
export function pictureFromRows(rows: readonly string[]): PixelStamp {
  const w = Math.max(...rows.map((r) => r.length));
  const cells: number[] = [];
  for (const r of rows) for (let x = 0; x < w; x++) cells.push(r[x] === '#' ? 1 : 0);
  return { w, h: rows.length, colours: ['#000000'], cells, keep: false };
}

const STAR = pictureFromRows(['..#..', '.###.', '#####', '.###.', '#...#']);
const HEART = pictureFromRows(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']);
const SPARKLE = pictureFromRows(['..#..', '..#..', '#####', '..#..', '..#..']);
const DIAMOND = pictureFromRows(['..#..', '.###.', '#####', '.###.', '..#..']);

const dab = (id: string, name: string, group: PixelGroup, b: Partial<DabBrush>): BrushPreset => ({
  id: `starter:px-${id}`,
  name,
  tool: 'pixel',
  builtin: true,
  group,
  brush: DEFAULT_BRUSH,
  pixel: { kind: 'dab', dab: cleanDab({ ...DEFAULT_DAB, ...b }) },
});

const spec = (id: string, name: string, group: PixelGroup, pixel: PixelSpec): BrushPreset => ({ id: `starter:px-${id}`, name, tool: 'pixel', builtin: true, group, brush: DEFAULT_BRUSH, pixel });

const soft = (tool: 'soft-brush' | 'airbrush' | 'highlighter', name: string): BrushPreset => {
  const o = DEFAULT_SOFT.tools[tool];
  return spec(tool, name, 'Soft paint', { kind: 'soft', tool, size: o.size, hardness: o.hardness, flow: o.flow });
};

const dry = (medium: DryId, name: string): BrushPreset => {
  const m = MEDIA.find((x) => x.id === medium)!;
  return spec(medium, name, 'Dry media', { kind: 'dry', medium, paper: 'medium', size: m.size, hardness: m.hardness, press: m.press });
};

export const PIXEL_STARTERS: readonly BrushPreset[] = [
  dab('pencil', 'Pixel pencil', 'Pixel basics', { size: 1 }),
  dab('round3', 'Round 3', 'Pixel basics', { size: 3 }),
  dab('round6', 'Round 6', 'Pixel basics', { size: 6 }),
  dab('square4', 'Square 4', 'Pixel basics', { tip: 'square', size: 4 }),
  dab('round16', 'Big round', 'Pixel basics', { size: 16, spacing: 0.15 }),

  dab('chisel', 'Chisel', 'Shapes', { tip: 'square', size: 12, roundness: 0.25, angle: 45, spacing: 0.1 }),
  dab('turning-chisel', 'Chisel that turns', 'Shapes', { tip: 'square', size: 10, roundness: 0.3, follow: true, spacing: 0.1 }),
  dab('slash', 'Slash', 'Shapes', { size: 8, roundness: 0.3, angle: 135, spacing: 0.1 }),

  dab('speckle', 'Speckle', 'Scatter and spray', { size: 3, spacing: 1.2, scatter: 1.2, sizeJitter: 0.6 }),
  dab('sprinkle', 'Sprinkle', 'Scatter and spray', { tip: 'square', size: 2, spacing: 1, scatter: 2 }),
  dab('dotted', 'Pixel dotted line', 'Scatter and spray', { size: 3, spacing: 3 }),
  dab('stipple', 'Pixel stipple', 'Scatter and spray', { size: 2, spacing: 0.6, scatter: 0.9, opacity: 0.8 }),

  dab('stars', 'Pixel stars', 'Picture tips', { tip: 'picture', picture: STAR, size: 5, spacing: 1.6, scatter: 0.5 }),
  dab('hearts', 'Pixel hearts', 'Picture tips', { tip: 'picture', picture: HEART, size: 7, spacing: 1.8, scatter: 0.3 }),
  dab('sparkles', 'Pixel sparkles', 'Picture tips', { tip: 'picture', picture: SPARKLE, size: 5, spacing: 1.4, scatter: 0.8, sizeJitter: 0.4 }),
  dab('diamonds', 'Diamond chain', 'Picture tips', { tip: 'picture', picture: DIAMOND, size: 5, spacing: 1, follow: true }),

  dab('smooth-pen', 'Smooth pen', 'Smooth edges', { size: 4, aliased: false, spacing: 0.1 }),
  dab('smooth-felt', 'Smooth felt tip', 'Smooth edges', { size: 10, hardness: 0.85, aliased: false, spacing: 0.1, opacity: 0.85 }),
  dab('soft-round', 'Soft round', 'Smooth edges', { size: 20, hardness: 0.3, aliased: false, flow: 0.6, spacing: 0.15 }),

  soft('soft-brush', 'Soft pixel brush'),
  soft('airbrush', 'Pixel airbrush'),
  soft('highlighter', 'Pixel highlighter'),

  dry('vine-charcoal', 'Vine charcoal on paper'),
  dry('compressed-charcoal', 'Compressed charcoal on paper'),
  dry('chalk', 'Chalk on paper'),
  dry('soft-pastel', 'Soft pastel on paper'),
  dry('crayon', 'Crayon on paper'),
  dry('soft-pencil', 'Soft pencil on paper'),
];

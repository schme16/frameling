// The pixel brushes that come with Frameling: a few plain pixel brushes, some shapes, scatter and picture tips, sketching
// and inking brushes, smooth edged brushes, and the soft paint and dry media tools as ready-made brushes. They sit in the same library as the
// vector starters and, like them, never change and can't be deleted; save a copy to make it your own.
import { DEFAULT_BRUSH } from '../core/doc';
import { DEFAULT_DAB, cleanDab, type DabBrush } from '../dab/maths';
import type { PixelSpec } from '../dab/spec';
import type { DynRoute } from '../dab/dynamics';
import { MEDIA, type DryId } from '../dry/maths';
import { DEFAULT_SOFT } from '../soft/settings';
import type { PixelStamp } from './stamps';
import type { BrushPreset } from './model';

/** The groups the pixel starters sit in, in the order the picker lists them. */
export const PIXEL_GROUPS = ['Pixel basics', 'Shapes', 'Scatter and spray', 'Picture tips', 'Pen and speed', 'Sketch and ink', 'Grain and texture', 'Colour', 'Smooth edges', 'Soft paint', 'Dry media'] as const;
export type PixelGroup = (typeof PIXEL_GROUPS)[number];

/** A one-colour picture from rows of text: `#` is paint, anything else is clear. */
export function pictureFromRows(rows: readonly string[]): PixelStamp {
  const w = Math.max(...rows.map((r) => r.length));
  const cells: number[] = [];
  for (const r of rows) for (let x = 0; x < w; x++) cells.push(r[x] === '#' ? 1 : 0);
  return { w, h: rows.length, colours: ['#000000'], cells, keep: false };
}

// A comb across the line: with `follow` it turns to the line, so each tooth drags a streak along it.
const COMB = pictureFromRows(['##', '##', '..', '##', '##', '##', '..', '##', '..', '##', '##', '##']);
const STAR = pictureFromRows(['..#..', '.###.', '#####', '.###.', '#...#']);
const HEART = pictureFromRows(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']);
const SPARKLE = pictureFromRows(['..#..', '..#..', '#####', '..#..', '..#..']);
const DIAMOND = pictureFromRows(['..#..', '.###.', '#####', '.###.', '..#..']);

/**
 * A soft picture tip drawn by a rule: `paint(x, y)` says how much paint each cell lays down, 0 to 1, in the colour picked.
 * Kept to eight steps of see-through so the picture stays small when it is saved.
 */
export function softPicture(w: number, h: number, paint: (x: number, y: number) => number): PixelStamp {
  const STEPS = 8;
  const colours = Array.from({ length: STEPS }, (_, i) => `#000000${Math.round(((i + 1) / STEPS) * 255).toString(16).padStart(2, '0')}`);
  const cells: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(Math.round(Math.min(1, Math.max(0, paint(x, y))) * STEPS));
  return { w, h, colours, cells, keep: false, soft: true };
}

/** The same numbers every time, so a built-in tip never changes between runs. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// A flat brush of loose bristles, lying across the line (it turns with `follow`): each bristle its own strength and
// length, so a stroke drags streaks with ragged ends, the way a dry paint brush does.
const BRISTLES = (() => {
  const rnd = seeded(11);
  const strength = Array.from({ length: 32 }, () => 0.6 + rnd() * 0.4);
  const reach = Array.from({ length: 32 }, () => 3 + rnd() * 3);
  return softPicture(8, 32, (x, y) => strength[y] * Math.max(0, Math.min(1, reach[y] - Math.abs(x - 3.5))));
})();

// A felt marker's broad side: an even bar with a soft edge and faint lines along it, so the stroke shows the felt.
const MARKER = softPicture(6, 24, (x, y) => {
  const edge = Math.min(1, (Math.min(y, 23 - y) + 1) / 4);
  const felt = y % 3 === 0 ? 0.75 : 1;
  return 0.8 * edge * felt * (x === 0 || x === 5 ? 0.6 : 1);
});

const r = (from: DynRoute['from'], to: DynRoute['to'], amount: number, invert = false): DynRoute => ({ from, to, amount, invert });

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
  return spec(medium, name, 'Dry media', { kind: 'dry', medium, size: m.size, hardness: m.hardness, press: m.press });
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

  dab('pressure-pencil', 'Pressure pencil', 'Pen and speed', { size: 5, spacing: 0.12, dynamics: [r('pressure', 'size', 0.8)] }),
  dab('tapered-ink', 'Tapered ink', 'Pen and speed', { size: 9, spacing: 0.1, dynamics: [r('fade', 'size', 1)], fadeLength: 160 }),
  dab('speed-nib', 'Fast is thin', 'Pen and speed', { size: 9, spacing: 0.1, dynamics: [r('speed', 'size', 0.75, true)] }),
  // Many small dots flung about the line (a size-14 disc at a wide spacing was a row of discs, not a spray). A harder press flings them further and lays them thicker.
  dab('pressure-spray', 'Pressure spray', 'Pen and speed', { size: 2, spacing: 0.25, scatter: 2, dynamics: [r('pressure', 'scatter', 1), r('pressure', 'flow', 0.4)] }),
  dab('pressure-felt', 'Pressure felt tip', 'Pen and speed', { size: 12, hardness: 0.8, aliased: false, spacing: 0.08, dynamics: [r('pressure', 'size', 0.5), r('pressure', 'flow', 0.7)] }),

  // Modelled on the kinds of brush Procreate artists reach for first (inking pens, a soft 6B, a felt marker, a dry paint
  // brush), tuned by laying each beside Procreate's own picture of such a stroke. Every setting and tip here is Frameling's
  // own: nothing is copied out of a brush file.
  dab('inking-pen', 'Inking pen', 'Sketch and ink', { size: 10, aliased: false, spacing: 0.05, dynamics: [r('pressure', 'size', 1)] }),
  dab('dry-ink', 'Dry ink', 'Sketch and ink', { size: 14, aliased: false, spacing: 0.05, dual: { tip: 'round', size: 1, density: 0.1, cut: true }, dynamics: [r('pressure', 'size', 1)] }),
  dab('ink-bleed', 'Ink bleed', 'Sketch and ink', { size: 12, hardness: 0.25, aliased: false, spacing: 0.05, dynamics: [r('pressure', 'size', 0.9)] }),
  dab('colouring-pen', 'Colouring pen', 'Sketch and ink', { size: 12, hardness: 0.9, aliased: false, spacing: 0.05, dynamics: [r('pressure', 'size', 0.6)] }),
  dab('soft-6b', 'Soft 6B pencil', 'Sketch and ink', { size: 26, aliased: false, spacing: 0.08, dual: { tip: 'round', size: 1, density: 0.5, cut: false }, dynamics: [r('pressure', 'size', 0.9)] }),
  dab('sketch-pencil', 'Light sketch pencil', 'Sketch and ink', { size: 6, hardness: 0.6, aliased: false, spacing: 0.1, flow: 0.5, opacity: 0.8, dual: { tip: 'round', size: 1, density: 0.6, cut: false }, dynamics: [r('pressure', 'flow', 0.6)] }),
  dab('felt-marker', 'Felt marker', 'Sketch and ink', { tip: 'picture', picture: MARKER, size: 16, aliased: false, spacing: 0.05, follow: true, opacity: 0.9 }),
  dab('dry-brush', 'Dry bristle brush', 'Sketch and ink', { tip: 'picture', picture: BRISTLES, size: 30, aliased: false, spacing: 0.05, follow: true, dynamics: [r('pressure', 'size', 0.4), r('pressure', 'flow', 0.6)] }),
  dab('canvas-brush', 'Canvas brush', 'Sketch and ink', { size: 40, hardness: 0, aliased: false, spacing: 0.08, flow: 0.3, grain: { paper: 'laid', depth: 0.5, scale: 1, moving: false }, dynamics: [r('pressure', 'flow', 0.6)] }),

  dab('chalk-grain', 'Chalk grain', 'Grain and texture', { size: 12, spacing: 0.12, flow: 0.5, grain: { paper: 'rough', depth: 1, scale: 1, moving: false } }),
  dab('pencil-paper', 'Pencil on paper', 'Grain and texture', { size: 3, spacing: 0.12, flow: 0.65, grain: { paper: 'fine', depth: 0.9, scale: 1, moving: false }, dynamics: [r('pressure', 'flow', 0.6)] }),
  dab('sponge', 'Pixel sponge', 'Grain and texture', { size: 18, spacing: 0.3, flow: 0.55, grain: { depth: 1, scale: 2, moving: true } }),
  dab('spatter', 'Pixel spatter', 'Grain and texture', { size: 16, spacing: 0.2, dual: { tip: 'round', size: 2, density: 0.25, cut: false } }),
  dab('bristles', 'Pixel bristles', 'Grain and texture', { tip: 'picture', picture: COMB, size: 12, spacing: 0.1, follow: true }),
  dab('cracked', 'Cracked paint', 'Grain and texture', { size: 14, spacing: 0.15, dual: { tip: 'round', size: 3, density: 0.2, cut: true } }),

  dab('rainbow', 'Rainbow trail', 'Colour', { size: 6, spacing: 0.12, dynamics: [r('fade', 'hue', 1)], fadeLength: 260 }),
  dab('autumn', 'Autumn leaves', 'Colour', { tip: 'square', size: 4, spacing: 1, scatter: 1.6, sizeJitter: 0.4, dynamics: [r('random', 'hue', 0.12), r('random', 'lightness', 0.3)] }),
  dab('confetti', 'Pixel confetti', 'Colour', { tip: 'square', size: 3, spacing: 1.2, scatter: 2, angleJitter: 1, dynamics: [r('random', 'hue', 1), r('random', 'saturation', 0.2)] }),
  dab('to-fill', 'Fades to the fill colour', 'Colour', { size: 8, spacing: 0.1, dynamics: [r('fade', 'mix', 1)], fadeLength: 200 }),
  dab('wet-smear', 'Wet smear', 'Colour', { size: 12, hardness: 0.7, aliased: false, spacing: 0.1, wet: 0.85 }),

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

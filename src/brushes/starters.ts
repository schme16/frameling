// The brushes that come with Frameling: the ones artists reach for most in other drawing apps, grouped by what they
// draw. Each is a plain brush or one of the tips (chalk, charcoal, watercolour, stamp), so every one of them stays a
// vector shape on the way out. They never change and can't be deleted; save a copy to make it your own.
// Soft edges, the highlighter and smudge are not brushes here: they are pixel tools (src/soft), since a vector shape
// can't carry a fading edge.
import { DEFAULT_BRUSH } from '../core/doc';
import type { BrushSettings } from '../core/format';
import type { DryId } from '../dry/maths';
import { defaultTip, startBattlements, startLink, startRibbon, startVine } from '../geometry/tip';
import type { BrushPreset } from './model';

/** The groups the starters sit in, in the order the picker lists them. */
export const STARTER_GROUPS = ['Pencils', 'Pens', 'Pen and speed', 'Markers', 'Paint', 'Chalk and charcoal', 'Watercolour', 'Stamps and texture', 'Scatter and spray', 'Calligraphy', 'Shapes', 'Bristles', 'Along the line', 'Edged'] as const;
export type StarterGroup = (typeof STARTER_GROUPS)[number];

const make = (id: string, name: string, group: StarterGroup, brush: Partial<BrushSettings>): BrushPreset => ({ id: `starter:${id}`, name, tool: 'brush', builtin: true, group, brush: { ...DEFAULT_BRUSH, ...brush } });

// Chalk and charcoal on paper: the line catches on the paper's tooth, as the dry media do on a pixel layer.
const dry = (kind: 'chalk' | 'charcoal', medium: DryId, amount: number) => ({ kind, amount, grain: 1, dry: medium });
const stamp = (shape: 'dot' | 'leaf' | 'star' | 'diamond' | 'dash' | 'heart' | 'paw' | 'custom', angle: 'follow' | 'upright' | 'random', spacing: number, jitter: number, scatter: number) => ({
  ...defaultTip('stamp'),
  shape,
  angle,
  spacing,
  jitter,
  scatter,
});

const battlements = startBattlements();

/** The first eight are the original starters: their ids stay, so favourites and recent keep pointing at them. */
export const STARTERS: readonly BrushPreset[] = [
  // Pencils
  make('pencil', 'Pencil', 'Pencils', { size: 2, thinning: 0.25, smoothing: 0.3, streamline: 0.25 }),
  make('mechanical', 'Mechanical pencil', 'Pencils', { size: 1.6, thinning: 0.1, smoothing: 0.3, streamline: 0.2 }),
  make('soft-pencil', 'Soft pencil (6B)', 'Pencils', { size: 5, thinning: 0.5, smoothing: 0.35, streamline: 0.3, tip: dry('chalk', 'soft-pencil', 0.3) }),
  make('colour-pencil', 'Colour pencil', 'Pencils', { size: 4, thinning: 0.3, smoothing: 0.35, streamline: 0.3, tip: dry('chalk', 'colour-pencil', 0.4) }),
  make('sketch-pencil', 'Sketch pencil', 'Pencils', { size: 3, thinning: 0.6, smoothing: 0.3, streamline: 0.25, tip: dry('charcoal', 'sketch-pencil', 0.3) }),
  // Pens
  make('ink', 'Ink', 'Pens', { size: 5, thinning: 0.5, smoothing: 0.7, streamline: 0.7 }),
  make('fineliner', 'Fine liner', 'Pens', { size: 2.5, thinning: 0.1, smoothing: 0.6, streamline: 0.6 }),
  make('technical', 'Technical pen', 'Pens', { size: 3, thinning: 0, smoothing: 0.5, streamline: 0.6 }),
  make('gel', 'Gel pen', 'Pens', { size: 3.5, thinning: 0.3, smoothing: 0.5, streamline: 0.5 }),
  make('ballpoint', 'Ballpoint pen', 'Pens', { size: 2.2, thinning: 0.15, smoothing: 0.3, streamline: 0.35 }),
  make('comic', 'Comic pen (G-pen)', 'Pens', { size: 7, thinning: 0.7, smoothing: 0.65, streamline: 0.7, taperStart: 8, taperEnd: 30 }),
  make('brush-pen', 'Brush pen', 'Pens', { size: 12, thinning: 0.8, smoothing: 0.7, streamline: 0.75, taperStart: 20, taperEnd: 70 }),
  make('dip-pen', 'Dip pen', 'Pens', { size: 9, thinning: 0.9, smoothing: 0.6, streamline: 0.65, taperStart: 6, taperEnd: 24 }),
  // Pen and speed: the pressure brushes that the pixel side has too (same names, same groups, so they pair)
  make('pressure-pencil', 'Pressure pencil', 'Pen and speed', { size: 3, thinning: 0.667, smoothing: 0.3, streamline: 0.25 }),
  make('pressure-spray', 'Pressure spray', 'Pen and speed', { size: 2, thinning: 0.5, smoothing: 0.6, streamline: 0.6, tip: { ...stamp('dot', 'upright', 0.25, 0, 2), fixedSize: false } }),
  // Markers
  make('marker', 'Marker', 'Markers', { size: 28, thinning: 0, smoothing: 0.5, streamline: 0.4 }),
  make('felt-tip', 'Felt-tip marker', 'Markers', { size: 10, thinning: 0, smoothing: 0.5, streamline: 0.45 }),
  make('fine-marker', 'Fine marker', 'Markers', { size: 5, thinning: 0, smoothing: 0.5, streamline: 0.45 }),
  make('block-marker', 'Block marker', 'Markers', { size: 40, thinning: 0, smoothing: 0.55, streamline: 0.5, capStart: false, capEnd: false }),
  make('brush-marker', 'Brush marker', 'Markers', { size: 14, thinning: 0.4, smoothing: 0.55, streamline: 0.55, taperEnd: 25 }),
  // Paint
  make('tapered', 'Tapered brush', 'Paint', { size: 14, thinning: 0.6, smoothing: 0.6, streamline: 0.6, taperStart: 40, taperEnd: 60 }),
  make('round-brush', 'Round brush', 'Paint', { size: 16, thinning: 0.7, smoothing: 0.6, streamline: 0.6, taperStart: 12, taperEnd: 50 }),
  // Gouache is flat, opaque and matte: fat bristles closed into one solid body with only a trace of brush marks, finished chalky and velvety. Marker is the glossy flat one.
  make('gouache', 'Gouache', 'Paint', { size: 26, thinning: 0.15, smoothing: 0.6, streamline: 0.55, tip: { ...defaultTip('bristle'), count: 30, stiffness: 0.9, amount: 0, body: 1, tone: 0.05, matte: 1 } }),
  // Oil paint is a full brush of paint: bristles fat enough to close into one solid body, run lighter and darker in broad streaks, with blunt rounded ends.
  make('oil', 'Oil paint', 'Paint', { size: 30, thinning: 0.3, smoothing: 0.55, streamline: 0.5, taperStart: 10, taperEnd: 26, tip: { ...defaultTip('bristle'), count: 36, stiffness: 0.85, amount: 0, body: 0.6, tone: 1 } }),
  // A bristle brush is separate hairs: a few dark lines and gaps between them, streaking along the line.
  make('bristle', 'Bristle brush', 'Paint', { size: 40, thinning: 0.2, smoothing: 0.5, streamline: 0.45, tip: { ...defaultTip('bristle'), count: 12, stiffness: 0.55, amount: 0.15, body: -0.1, tone: 0.8 } }),
  // A dry brush drags over paper and skips where it is high: paper tooth with big grain and long streaks.
  make('dry-brush', 'Dry brush', 'Paint', { size: 34, thinning: 0.25, smoothing: 0.5, streamline: 0.45, tip: { kind: 'charcoal', amount: 0.4, grain: 2, dry: 'crayon', streak: 1 } }),
  // Chalk and charcoal
  make('chalk', 'Chalk', 'Chalk and charcoal', { size: 18, thinning: 0.3, smoothing: 0.4, streamline: 0.4, tip: defaultTip('chalk') }),
  make('charcoal', 'Charcoal', 'Chalk and charcoal', { size: 22, thinning: 0.4, smoothing: 0.4, streamline: 0.4, tip: defaultTip('charcoal') }),
  make('soft-pastel', 'Soft pastel', 'Chalk and charcoal', { size: 30, thinning: 0.2, smoothing: 0.45, streamline: 0.45, tip: dry('chalk', 'soft-pastel', 0.45) }),
  make('oil-pastel', 'Oil pastel', 'Chalk and charcoal', { size: 22, thinning: 0.1, smoothing: 0.45, streamline: 0.4, tip: dry('chalk', 'oil-pastel', 0.2) }),
  make('crayon', 'Crayon', 'Chalk and charcoal', { size: 12, thinning: 0.15, smoothing: 0.4, streamline: 0.35, tip: dry('charcoal', 'crayon', 0.4) }),
  make('vine-charcoal', 'Vine charcoal', 'Chalk and charcoal', { size: 24, thinning: 0.5, smoothing: 0.4, streamline: 0.4, tip: dry('charcoal', 'vine-charcoal', 0.65) }),
  make('compressed-charcoal', 'Compressed charcoal', 'Chalk and charcoal', { size: 20, thinning: 0.3, smoothing: 0.4, streamline: 0.4, tip: dry('charcoal', 'compressed-charcoal', 0.35) }),
  // Watercolour
  make('watercolour', 'Watercolour', 'Watercolour', { size: 30, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: defaultTip('watercolour') }),
  make('wet-wash', 'Wet wash', 'Watercolour', { size: 60, thinning: 0, smoothing: 0.65, streamline: 0.65, tip: { ...defaultTip('watercolour'), amount: 0.25 } }),
  make('fine-watercolour', 'Fine watercolour', 'Watercolour', { size: 12, thinning: 0.5, smoothing: 0.6, streamline: 0.6, taperStart: 10, taperEnd: 40, tip: { ...defaultTip('watercolour'), amount: 0.6 } }),
  make('ink-wash', 'Ink wash', 'Watercolour', { size: 20, thinning: 0.6, smoothing: 0.65, streamline: 0.65, taperEnd: 50, tip: { ...defaultTip('watercolour'), amount: 0.9 } }),
  // Stamps and texture
  make('leaves', 'Leaves', 'Stamps and texture', { size: 22, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: { ...defaultTip('stamp'), shape: 'leaf', spacing: 0.9, jitter: 0.35, scatter: 0.3 } }),
  make('falling-leaves', 'Falling leaves', 'Stamps and texture', { size: 18, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: stamp('leaf', 'random', 1.3, 0.4, 0.9) }),
  make('stars', 'Stars', 'Stamps and texture', { size: 16, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: stamp('star', 'random', 1.3, 0.3, 0.2) }),
  make('sparkles', 'Sparkles', 'Stamps and texture', { size: 10, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: stamp('star', 'random', 0.8, 0.8, 1.4) }),
  make('spinning-leaves', 'Spinning leaves', 'Stamps and texture', { size: 22, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: { ...stamp('leaf', 'follow', 1.2, 0.3, 0.4), turn: 0.35, gapVary: 0.6 } }),
  make('paw-prints', 'Paw prints', 'Stamps and texture', { size: 24, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: stamp('paw', 'follow', 1.7, 0.1, 0) }),
  make('hearts', 'Hearts', 'Stamps and texture', { size: 16, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: stamp('heart', 'upright', 1.2, 0.3, 0.15) }),
  make('dotted-line', 'Dotted line', 'Stamps and texture', { size: 6, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: stamp('dot', 'upright', 1.9, 0, 0) }),
  make('dashed-line', 'Dashed line', 'Stamps and texture', { size: 7, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: stamp('dash', 'follow', 1.9, 0, 0) }),
  make('stipple', 'Stipple', 'Stamps and texture', { size: 5, thinning: 0, smoothing: 0.5, streamline: 0.5, tip: stamp('dot', 'random', 0.6, 0.7, 1.1) }),
  make('spatter', 'Spatter', 'Stamps and texture', { size: 14, thinning: 0, smoothing: 0.5, streamline: 0.5, tip: stamp('dot', 'upright', 0.8, 0.9, 1.6) }),
  make('confetti', 'Confetti', 'Stamps and texture', { size: 12, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: stamp('diamond', 'random', 1.3, 0.5, 1) }),
  // Scatter and spray, and Shapes: also on the pixel side, with the same names
  make('speckle', 'Speckle', 'Scatter and spray', { size: 3, thinning: 0.4, smoothing: 0.6, streamline: 0.6, tip: stamp('dot', 'upright', 1.2, 0.857, 1.2) }),
  make('sprinkle', 'Sprinkle', 'Scatter and spray', { size: 2, thinning: 0.4, smoothing: 0.6, streamline: 0.6, tip: { ...stamp('custom', 'upright', 1, 0, 2), custom: [[-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]] } }),
  make('slash', 'Slash', 'Shapes', { size: 8, thinning: 0.4, smoothing: 0.6, streamline: 0.6, tip: { ...defaultTip('nib'), roundness: 0.3, nibAngle: -45 } }),
  // Calligraphy: a pen nib with an angle
  make('italic', 'Italic nib', 'Calligraphy', { size: 14, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: { ...defaultTip('nib'), roundness: 0.18, nibAngle: 40 } }),
  make('broad', 'Broad nib', 'Calligraphy', { size: 22, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: { ...defaultTip('nib'), roundness: 0.12, nibAngle: 30 } }),
  make('copperplate', 'Copperplate', 'Calligraphy', { size: 9, thinning: 0.7, smoothing: 0.65, streamline: 0.65, tip: { ...defaultTip('nib'), roundness: 0.35, nibAngle: 55 } }),
  make('round-nib', 'Round nib', 'Calligraphy', { size: 8, thinning: 0.5, smoothing: 0.6, streamline: 0.6, tip: { ...defaultTip('nib'), roundness: 1 } }),
  make('turning-nib', 'Turning nib', 'Calligraphy', { size: 16, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: { ...defaultTip('nib'), roundness: 0.2, nibAngle: 90, angle: 'follow' } }),
  // Bristles: many thin lines
  make('hog', 'Hog bristle', 'Bristles', { size: 36, thinning: 0.4, smoothing: 0.55, streamline: 0.55, tip: { ...defaultTip('bristle'), count: 18, stiffness: 0.7, amount: 0.2 } }),
  make('dry-bristle', 'Dry bristle', 'Bristles', { size: 40, thinning: 0.5, smoothing: 0.5, streamline: 0.5, tip: { ...defaultTip('bristle'), count: 24, stiffness: 0.5, amount: 0.65 } }),
  make('fan', 'Fan brush', 'Bristles', { size: 56, thinning: 0.2, smoothing: 0.55, streamline: 0.55, tip: { ...defaultTip('bristle'), count: 32, stiffness: 0.9, amount: 0.35 } }),
  make('rake', 'Rake', 'Bristles', { size: 30, thinning: 0, smoothing: 0.5, streamline: 0.5, tip: { ...defaultTip('bristle'), count: 6, stiffness: 1, amount: 0, body: -0.85 } }),
  // Along the line: a drawing bent along it
  make('ribbon', 'Ribbon', 'Along the line', { size: 18, thinning: 0.6, smoothing: 0.65, streamline: 0.65, tip: { kind: 'along', custom: startRibbon(), fit: 'stretch' } }),
  make('thread', 'Thread', 'Along the line', { size: 7, thinning: 0.3, smoothing: 0.65, streamline: 0.65, tip: { kind: 'along', custom: startRibbon(), fit: 'stretch' } }),
  make('chain', 'Chain', 'Along the line', { size: 22, thinning: 0, smoothing: 0.65, streamline: 0.65, tip: { kind: 'edged', custom: startLink() } }),
  make('chain-links', 'Beads and links', 'Along the line', { size: 16, thinning: 0, smoothing: 0.65, streamline: 0.65, tip: { kind: 'along', custom: startLink(), fit: 'repeat' } }),
  make('leafy-vine', 'Leafy vine', 'Along the line', { size: 40, thinning: 0, smoothing: 0.6, streamline: 0.6, tip: { kind: 'along', custom: startVine(), fit: 'repeat' } }),
  // Edged: a drawing for the sides, with its own ends and corners
  make('battlements', 'Battlements', 'Edged', { size: 30, thinning: 0, smoothing: 0.4, streamline: 0.2, tip: { kind: 'edged', custom: battlements.sides, pieces: { start: battlements.end, end: battlements.end, inner: battlements.inner, outer: battlements.outer } } }),
];

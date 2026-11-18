// The known gaps between the vector Brush and the pixel brush, for test/brushes/parity.test.tsx. This file is the list the
// test checks against: it comes from brand/ab/brush-parity/table.md and the work list in brand/ab/brush-parity/plan.md.
//
// How it works: the test finds out what is really on each side (the starters made on each side, the controls in the
// panels, by their `data-control` ids) and fails when something is one sided and is not in this file, and when something
// in this file is not one sided any more. So the list can only shrink. Each piece of the plan that closes a gap makes the
// test fail until the entry is taken out (a control) or moved into BRUSH_PAIRS (a brush).
//
// Since piece 6 there is one brush list: every brush is on both kinds of layer, drawn through its translation when it was
// only made on the other kind. A brush here is "one sided" when it is made on one side only. A control is one sided when the
// other kind of panel has no control of that kind (a greyed one with its reason counts as being there).
//
// Every entry says in plain words which piece of the plan clears it. "by design" is for what is one sided on purpose:
// a vector layer has shapes and a pixel layer has pixels, and those stay.

import { MERGED_PAIRS } from '../../src/brushes/pairs';

/** A control, or a few that go together, that exists on `side` only. `ids` are the `data-control` ids. */
export interface ControlGap {
  side: 'vector' | 'pixel';
  ids: string[];
  /** What it is, in the words on screen. */
  what: string;
  /** Which piece of the plan clears it, or "by design". */
  clears: string;
}
/** A starter brush that has no counterpart on the other side. */
export interface BrushGap {
  side: 'vector' | 'pixel';
  id: string;
  name: string;
  clears: string;
}

/** Starter brushes that are the same job on both sides: [vector id, pixel id, how alike]. A brush leaves its list below when it gets a pair. */
export const BRUSH_PAIRS: [string, string, 'same' | 'close'][] = [
  ...MERGED_PAIRS.map(([v, p]): [string, string, 'same'] => [v, p, 'same']),
  ['starter:ink', 'starter:px-tapered-ink', 'close'],
  ['starter:fineliner', 'starter:px-smooth-pen', 'close'],
  ['starter:technical', 'starter:px-round3', 'close'],
  ['starter:comic', 'starter:px-inking-pen', 'close'],
  ['starter:marker', 'starter:px-smooth-felt', 'close'],
  ['starter:felt-tip', 'starter:px-felt-marker', 'close'],
  ['starter:bristle', 'starter:px-bristles', 'close'],
  ['starter:italic', 'starter:px-chisel', 'close'],
  ['starter:turning-nib', 'starter:px-turning-chisel', 'close'],
  ['starter:chain-links', 'starter:px-diamonds', 'close'],
];

/** Vector brushes with no pixel counterpart. */
export const ONE_SIDED_VECTOR_BRUSHES: BrushGap[] = [
  { side: 'vector', id: 'starter:gouache', name: "Gouache", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no bristles)" },
  { side: 'vector', id: 'starter:oil', name: "Oil paint", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no bristles)" },
  { side: 'vector', id: 'starter:watercolour', name: "Watercolour", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no rim of a wash)" },
  { side: 'vector', id: 'starter:wet-wash', name: "Wet wash", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no rim of a wash)" },
  { side: 'vector', id: 'starter:fine-watercolour', name: "Fine watercolour", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no rim of a wash)" },
  { side: 'vector', id: 'starter:ink-wash', name: "Ink wash", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no rim of a wash)" },
  { side: 'vector', id: 'starter:spinning-leaves', name: "Spinning leaves", clears: "piece 14: needs Gap variety in the pixel engine" },
  { side: 'vector', id: 'starter:copperplate', name: "Copperplate", clears: "piece 14: needs pressure on Roundness in the pixel engine" },
  { side: 'vector', id: 'starter:hog', name: "Hog bristle", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no bristles)" },
  { side: 'vector', id: 'starter:fan', name: "Fan brush", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no bristles)" },
  { side: 'vector', id: 'starter:rake', name: "Rake", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no bristles)" },
  { side: 'vector', id: 'starter:ribbon', name: "Ribbon", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no bending a drawing along the line)" },
  { side: 'vector', id: 'starter:thread', name: "Thread", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no bending a drawing along the line)" },
  { side: 'vector', id: 'starter:chain', name: "Chain", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no bending a drawing along the line)" },
  { side: 'vector', id: 'starter:leafy-vine', name: "Leafy vine", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no bending a drawing along the line)" },
  { side: 'vector', id: 'starter:battlements', name: "Battlements", clears: "piece 13: needs vector tips drawn onto pixels (the engine has no bending a drawing along the line)" },
];

/**
 * Brushes made on one side only whose other half, worked out by translation (piece 6), is as good as one made by hand: a plain
 * round or square dab and a plain line say the same thing. They leave the one sided list; the test checks the translation loses nothing it names.
 */
export const TRANSLATES_FINE: BrushGap[] = [
  { side: 'pixel', id: 'starter:px-round6', name: 'Round 6', clears: 'piece 6: its vector half is a plain round line of the same width' },
  { side: 'pixel', id: 'starter:px-square4', name: 'Square 4', clears: 'piece 6: its vector half is a plain line of the same width (sharp corners stay pixel only)' },
  { side: 'pixel', id: 'starter:px-round16', name: 'Big round', clears: 'piece 6: its vector half is a plain round line of the same width' },
];

/** Pixel brushes made on the pixel side only, with no vector brush made to match. */
export const ONE_SIDED_PIXEL_BRUSHES: BrushGap[] = [
  { side: 'pixel', id: 'starter:px-sketch-pencil', name: "Light sketch pencil", clears: "piece 12: dual tip on a vector stroke" },
  { side: 'pixel', id: 'starter:px-speed-nib', name: "Fast is thin", clears: "piece 10: speed on a vector point" },
  { side: 'pixel', id: 'starter:px-pressure-felt', name: "Pressure felt tip", clears: "piece 11: flow on a vector stroke" },
  { side: 'pixel', id: 'starter:px-dry-ink', name: "Dry ink", clears: "piece 12: dual tip on a vector stroke" },
  { side: 'pixel', id: 'starter:px-ink-bleed', name: "Ink bleed", clears: "piece 9: soft edge on a vector stroke" },
  { side: 'pixel', id: 'starter:px-colouring-pen', name: "Colouring pen", clears: "piece 9: soft edge on a vector stroke" },
  { side: 'pixel', id: 'starter:px-soft-6b', name: "Soft 6B pencil", clears: "piece 12: dual tip on a vector stroke" },
  { side: 'pixel', id: 'starter:px-canvas-brush', name: "Canvas brush", clears: "piece 11: flow on a vector stroke" },
  { side: 'pixel', id: 'starter:px-chalk-grain', name: "Chalk grain", clears: "piece 11: flow on a vector stroke" },
  { side: 'pixel', id: 'starter:px-pencil-paper', name: "Pencil on paper", clears: "piece 11: flow on a vector stroke" },
  { side: 'pixel', id: 'starter:px-sponge', name: "Pixel sponge", clears: "piece 11: flow on a vector stroke" },
  { side: 'pixel', id: 'starter:px-cracked', name: "Cracked paint", clears: "piece 12: dual tip on a vector stroke" },
  { side: 'pixel', id: 'starter:px-rainbow', name: "Rainbow trail", clears: "piece 11: colour changes along a vector stroke" },
  { side: 'pixel', id: 'starter:px-autumn', name: "Autumn leaves", clears: "piece 11: colour changes along a vector stroke" },
  { side: 'pixel', id: 'starter:px-to-fill', name: "Fades to the fill colour", clears: "piece 11: colour changes along a vector stroke" },
  { side: 'pixel', id: 'starter:px-wet-smear', name: "Wet smear", clears: "by design: wet paint needs the pixels under the stroke (piece 15 leaves it pixel only)" },
  { side: 'pixel', id: 'starter:px-soft-round', name: "Soft round", clears: "piece 9: soft edge on a vector stroke" },
  { side: 'pixel', id: 'starter:px-soft-brush', name: "Soft pixel brush", clears: "piece 9: soft edge on a vector stroke" },
  { side: 'pixel', id: 'starter:px-airbrush', name: "Pixel airbrush", clears: "piece 9: soft edge on a vector stroke, then piece 11 (build up)" },
  { side: 'pixel', id: 'starter:px-highlighter', name: "Pixel highlighter", clears: "piece 11: a blend mode on a vector stroke" },
];

/** Starters made on one side only, where the other half is a rougher translation. They are in the one list on both kinds of layer; this is what is left to make by hand. */
export const ONE_SIDED_BRUSHES: BrushGap[] = [...ONE_SIDED_VECTOR_BRUSHES, ...ONE_SIDED_PIXEL_BRUSHES];

/** Controls on the vector Brush only. */
export const VECTOR_ONLY_CONTROLS: ControlGap[] = [
  { side: 'vector', ids: ['picker-smoothing'], what: 'Smoothing in the brush list\'s drop down', clears: 'piece 4: the shared panel and its list' },
  { side: 'vector', ids: ['smoothing'], what: 'Smoothing', clears: 'piece 4: the shared panel (the pixel side has only the Stabilizer)' },
  { side: 'vector', ids: ['hold-to-tidy', 'hold-time'], what: 'Hold to tidy, and Hold time', clears: 'by design: it swaps a stroke for a clean shape, and a pixel layer has no shapes' },
  { side: 'vector', ids: ['merge-shapes'], what: 'Merge shapes together', clears: 'by design: a pixel layer has no shapes to merge' },
  { side: 'vector', ids: ['along-from-selection'], what: 'Use the selection as the drawing', clears: 'piece 13: vector tips drawn onto pixels' },
];

/** Controls on the pixel brush only. */
export const PIXEL_ONLY_CONTROLS: ControlGap[] = [
  { side: 'pixel', ids: ['paper-invert'], what: "Catch on the dark parts instead", clears: "piece 12: a picture grain on a vector stroke" },
  { side: 'pixel', ids: ['paper-soften'], what: "Soften the bumps of a bigger paper", clears: "piece 12: a picture grain on a vector stroke" },
  { side: 'pixel', ids: ['paper-new-patch'], what: "A new patch of paper for every dab", clears: "piece 12: a picture grain on a vector stroke" },
  { side: 'pixel', ids: ['paper-thin'], what: "Thin the paint instead of stopping it", clears: "piece 12: a picture grain on a vector stroke" },
  { side: 'pixel', ids: ['paper-hold'], what: "How much it holds the whole line back", clears: "piece 12: a picture grain on a vector stroke" },
  { side: 'pixel', ids: ['picture-own-colours'], what: "Its own colours (a picture tip)", clears: "piece 4: the shared Tip picker" },
  { side: 'pixel', ids: ['picture-reset'], what: "Back to the usual brush (a picture tip)", clears: "piece 4: the shared Tip picker" },
  { side: 'pixel', ids: ['picture-draw', 'picture-file'], what: "Draw a picture... and From a picture file... (a picture tip)", clears: "piece 4: the shared Tip picker" },
  { side: 'pixel', ids: ['edges'], what: "Edges: Sharp pixels or Smooth", clears: "by design: vector lines are always smooth" },
  { side: 'pixel', ids: ['edge-smooth-button'], what: "Make the edge smooth instead", clears: "by design: it explains dithering, which vectors do not do" },
  { side: 'pixel', ids: ['size-follows-invert', 'size-follows-curve'], what: "The other way round, and Shape of the response, for Size follows", clears: "piece 10: dynamics on a vector stroke" },
  { side: 'pixel', ids: ['flow-follows-amount', 'flow-follows-invert', 'flow-follows-curve'], what: "The Amount, The other way round and Shape of the response of Flow follows (the switch itself is greyed on a vector layer)", clears: "piece 11: flow on a vector stroke" },
  { side: 'pixel', ids: ['opacity-follows-amount', 'opacity-follows-invert', 'opacity-follows-curve'], what: "The Amount, The other way round and Shape of the response of Opacity follows (the switch itself is greyed on a vector layer)", clears: "piece 11: flow on a vector stroke" },
  { side: 'pixel', ids: ['angle-follows-amount', 'angle-follows-invert', 'angle-follows-curve'], what: "The Amount, The other way round and Shape of the response of Angle follows (the switch itself is greyed on a vector layer)", clears: "piece 10: dynamics on a vector stroke" },
  { side: 'pixel', ids: ['scatter-follows-amount', 'scatter-follows-invert', 'scatter-follows-curve'], what: "The Amount, The other way round and Shape of the response of Scatter follows (the switch itself is greyed on a vector layer)", clears: "piece 10: dynamics on a vector stroke" },
  { side: 'pixel', ids: ['mix-follows-amount', 'mix-follows-invert'], what: "The Amount and The other way round of Colour mixes toward the fill colour (the switch itself is greyed on a vector layer)", clears: "piece 11: colour changes along a vector stroke" },
  { side: 'pixel', ids: ['taper', 'taper-thin'], what: "Thin to a point at the ends, and How thin (How faint is greyed on a vector layer)", clears: "piece 10: dynamics on a vector stroke" },
  { side: 'pixel', ids: ['fade-length'], what: "Fade length", clears: "piece 10: dynamics on a vector stroke (the fade source)" },
  { side: 'pixel', ids: ['dual-dot-shape', 'dual-dot-size', 'dual-picture', 'dual-picture-size', 'dual-invert', 'dual-amount', 'dual-cut'], what: "Dual tip: Dot shape, Dot size, a picture for the dots, How many dots, Cut holes instead (the switch itself is greyed on a vector layer)", clears: "piece 12: dual tip on a vector stroke" },
  { side: 'pixel', ids: ['dual-laid-width', 'dual-laid-spacing', 'dual-laid-scatter'], what: "Second brush width, spacing and scatter", clears: "piece 12: dual tip on a vector stroke" },
  { side: 'pixel', ids: ['builds-up'], what: "Builds up while you hold still (Airbrush)", clears: "piece 10: time on a vector point" },
  { side: 'pixel', ids: ['press'], what: "Pressure (Chalk and charcoal)", clears: "piece 4: Chalk and charcoal takes the shared panel" },
  { side: 'pixel', ids: ['pixel-perfect'], what: "Pixel perfect", clears: "by design: pixel art only" },
];

export const ONE_SIDED_CONTROLS: ControlGap[] = [...VECTOR_ONLY_CONTROLS, ...PIXEL_ONLY_CONTROLS];

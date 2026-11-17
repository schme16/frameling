// The known gaps between the vector Brush and the pixel brush, for test/brushes/parity.test.tsx. This file is the list the
// test checks against: it comes from brand/ab/brush-parity/table.md and the work list in brand/ab/brush-parity/plan.md.
//
// How it works: the test finds out what is really on each side (the brushes in the two starter lists, the controls in the
// two panels, by their `data-control` ids) and fails when something is one sided and is not in this file, and when something
// in this file is not one sided any more. So the list can only shrink. Each piece of the plan that closes a gap makes the
// test fail until the entry is taken out (a control) or moved into BRUSH_PAIRS (a brush).
//
// Every entry says in plain words which piece of the plan clears it. "by design" is for what is one sided on purpose:
// a vector layer has shapes and a pixel layer has pixels, and those stay.

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
  ['starter:pencil', 'starter:px-pencil', 'same'], // Pencil and Pixel pencil
  ['starter:soft-pencil', 'starter:px-soft-pencil', 'same'], // Soft pencil (6B) and Soft pencil on paper
  ['starter:sketch-pencil', 'starter:px-sketch-pencil-medium', 'same'], // Sketch pencil
  ['starter:ink', 'starter:px-tapered-ink', 'close'], // Ink and Tapered ink
  ['starter:fineliner', 'starter:px-smooth-pen', 'close'], // Fine liner and Smooth pen
  ['starter:technical', 'starter:px-round3', 'close'], // Technical pen and Round 3
  ['starter:comic', 'starter:px-inking-pen', 'close'], // Comic pen (G-pen) and Inking pen
  ['starter:marker', 'starter:px-smooth-felt', 'close'], // Marker and Smooth felt tip
  ['starter:felt-tip', 'starter:px-felt-marker', 'close'], // Felt-tip marker and Felt marker
  ['starter:bristle', 'starter:px-bristles', 'close'], // Bristle brush and Pixel bristles
  ['starter:chalk', 'starter:px-chalk', 'same'], // Chalk and Chalk on paper
  ['starter:soft-pastel', 'starter:px-soft-pastel', 'same'], // Soft pastel and Soft pastel on paper
  ['starter:crayon', 'starter:px-crayon', 'same'], // Crayon and Crayon on paper
  ['starter:vine-charcoal', 'starter:px-vine-charcoal', 'same'], // Vine charcoal and Vine charcoal on paper
  ['starter:compressed-charcoal', 'starter:px-compressed-charcoal', 'same'], // Compressed charcoal and Compressed charcoal on paper
  ['starter:stars', 'starter:px-stars', 'same'], // Stars and Pixel stars
  ['starter:sparkles', 'starter:px-sparkles', 'same'], // Sparkles and Pixel sparkles
  ['starter:hearts', 'starter:px-hearts', 'same'], // Hearts and Pixel hearts
  ['starter:dotted-line', 'starter:px-dotted', 'same'], // Dotted line and Pixel dotted line
  ['starter:stipple', 'starter:px-stipple', 'same'], // Stipple and Pixel stipple
  ['starter:spatter', 'starter:px-spatter', 'same'], // Spatter and Pixel spatter
  ['starter:confetti', 'starter:px-confetti', 'same'], // Confetti and Pixel confetti
  ['starter:italic', 'starter:px-chisel', 'close'], // Italic nib and Chisel
  ['starter:turning-nib', 'starter:px-turning-chisel', 'close'], // Turning nib and Chisel that turns
  ['starter:dry-bristle', 'starter:px-dry-brush', 'same'], // Dry bristle and Dry bristle brush
  ['starter:chain-links', 'starter:px-diamonds', 'close'], // Beads and links and Diamond chain
  ['starter:mechanical', 'starter:px-mechanical', 'same'], // mechanical 
  ['starter:colour-pencil', 'starter:px-colour-pencil', 'same'], // colour-pencil 
  ['starter:gel', 'starter:px-gel', 'same'], // gel 
  ['starter:ballpoint', 'starter:px-ballpoint', 'same'], // ballpoint 
  ['starter:brush-pen', 'starter:px-brush-pen', 'same'], // brush-pen 
  ['starter:dip-pen', 'starter:px-dip-pen', 'same'], // dip-pen 
  ['starter:fine-marker', 'starter:px-fine-marker', 'same'], // fine-marker 
  ['starter:block-marker', 'starter:px-block-marker', 'same'], // block-marker 
  ['starter:brush-marker', 'starter:px-brush-marker', 'same'], // brush-marker 
  ['starter:tapered', 'starter:px-tapered', 'same'], // tapered 
  ['starter:round-brush', 'starter:px-round-brush', 'same'], // round-brush 
  ['starter:dry-brush', 'starter:px-dry-brush-crayon', 'same'], // dry-brush 
  ['starter:charcoal', 'starter:px-charcoal', 'same'], // charcoal 
  ['starter:oil-pastel', 'starter:px-oil-pastel', 'same'], // oil-pastel 
  ['starter:leaves', 'starter:px-leaves', 'same'], // leaves 
  ['starter:falling-leaves', 'starter:px-falling-leaves', 'same'], // falling-leaves 
  ['starter:paw-prints', 'starter:px-paw-prints', 'same'], // paw-prints 
  ['starter:dashed-line', 'starter:px-dashed-line', 'same'], // dashed-line 
  ['starter:broad', 'starter:px-broad-nib', 'same'], // broad 
  ['starter:round-nib', 'starter:px-round-nib', 'same'], // round-nib 
  ['starter:pressure-pencil', 'starter:px-pressure-pencil', 'same'], // pressure-pencil 
  ['starter:pressure-spray', 'starter:px-pressure-spray', 'same'], // pressure-spray 
  ['starter:speckle', 'starter:px-speckle', 'same'], // speckle 
  ['starter:sprinkle', 'starter:px-sprinkle', 'same'], // sprinkle 
  ['starter:slash', 'starter:px-slash', 'same'], // slash 
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

/** Pixel brushes with no vector counterpart. */
export const ONE_SIDED_PIXEL_BRUSHES: BrushGap[] = [
  { side: 'pixel', id: 'starter:px-sketch-pencil', name: "Light sketch pencil", clears: "piece 12: dual tip on a vector stroke" },
  { side: 'pixel', id: 'starter:px-round6', name: "Round 6", clears: "piece 6: the swap gives it a vector half, drawn smooth (sharp edges stay pixel only)" },
  { side: 'pixel', id: 'starter:px-square4', name: "Square 4", clears: "piece 6: the swap gives it a vector half, drawn smooth (sharp edges stay pixel only)" },
  { side: 'pixel', id: 'starter:px-round16', name: "Big round", clears: "piece 6: the swap gives it a vector half, drawn smooth (sharp edges stay pixel only)" },
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

export const ONE_SIDED_BRUSHES: BrushGap[] = [...ONE_SIDED_VECTOR_BRUSHES, ...ONE_SIDED_PIXEL_BRUSHES];

/** Controls on the vector Brush only. */
export const VECTOR_ONLY_CONTROLS: ControlGap[] = [
  { side: 'vector', ids: ['preview'], what: 'The big stroke preview at the top', clears: 'piece 4: the shared panel draws one for the pixel brush too' },
  { side: 'vector', ids: ['picker-smoothing'], what: 'Smoothing in the brush list\'s drop down', clears: 'piece 4: the shared panel and its list' },
  { side: 'vector', ids: ['smoothing'], what: 'Smoothing', clears: 'piece 4: the shared panel (the pixel side has only the Stabilizer)' },
  { side: 'vector', ids: ['hold-to-tidy', 'hold-time'], what: 'Hold to tidy, and Hold time', clears: 'by design: it swaps a stroke for a clean shape, and a pixel layer has no shapes' },
  { side: 'vector', ids: ['merge-shapes'], what: 'Merge shapes together', clears: 'by design: a pixel layer has no shapes to merge' },
  { side: 'vector', ids: ['wash-edge'], what: 'Edge (the rim of a watercolour wash)', clears: 'piece 13: vector tips drawn onto pixels' },
  { side: 'vector', ids: ['gap-variety'], what: 'Gap variety (stamps that bunch and spread)', clears: 'piece 14: spacing that varies in the pixel engine' },
  { side: 'vector', ids: ['bristle-count'], what: 'Bristles', clears: 'piece 13: vector tips drawn onto pixels' },
  { side: 'vector', ids: ['bristle-stiffness'], what: 'Stiffness', clears: 'piece 13: vector tips drawn onto pixels' },
  { side: 'vector', ids: ['bristle-dry-gaps'], what: 'Dry gaps', clears: 'piece 13: vector tips drawn onto pixels' },
  { side: 'vector', ids: ['bristle-thickness'], what: 'Bristle thickness', clears: 'piece 13: vector tips drawn onto pixels' },
  { side: 'vector', ids: ['bristle-streaks'], what: 'Light and dark streaks', clears: 'piece 13: vector tips drawn onto pixels' },
  { side: 'vector', ids: ['along-fit'], what: 'On a long line (stretch or repeat)', clears: 'piece 13: vector tips drawn onto pixels' },
  { side: 'vector', ids: ['along-from-selection'], what: 'Use the selection as the drawing', clears: 'piece 13: vector tips drawn onto pixels' },
  { side: 'vector', ids: ['edged-parts'], what: 'The five parts of an Edged brush (sides, start, end, corners)', clears: 'piece 13: vector tips drawn onto pixels' },
  { side: 'vector', ids: ['matte'], what: 'Matte finish', clears: 'piece 9: the same colour adjust and film grain on a pixel layer' },
];

/** Controls on the pixel brush only. */
export const PIXEL_ONLY_CONTROLS: ControlGap[] = [
  { side: 'pixel', ids: ['paper-keep'], what: "Keep this brush on (a paper) / Use the sheet's paper", clears: "piece 8: a vector brush keeps its own paper" },
  { side: 'pixel', ids: ['paper-picture'], what: "Use a picture as the paper", clears: "piece 12: a picture grain on a vector stroke" },
  { side: 'pixel', ids: ['paper-invert'], what: "Catch on the dark parts instead", clears: "piece 12: a picture grain on a vector stroke" },
  { side: 'pixel', ids: ['paper-soften'], what: "Soften the bumps of a bigger paper", clears: "piece 12: a picture grain on a vector stroke" },
  { side: 'pixel', ids: ['paper-new-patch'], what: "A new patch of paper for every dab", clears: "piece 12: a picture grain on a vector stroke" },
  { side: 'pixel', ids: ['paper-thin'], what: "Thin the paint instead of stopping it", clears: "piece 12: a picture grain on a vector stroke" },
  { side: 'pixel', ids: ['paper-hold'], what: "How much it holds the whole line back", clears: "piece 12: a picture grain on a vector stroke" },
  { side: 'pixel', ids: ['tip-square'], what: "Tip: Square", clears: "piece 4: the shared Tip picker" },
  { side: 'pixel', ids: ['picture-own-colours'], what: "Its own colours (a picture tip)", clears: "piece 4: the shared Tip picker" },
  { side: 'pixel', ids: ['stamp-reset'], what: "Back to the usual brush (a picture brush on the plain Brush)", clears: "piece 5: the plain Brush on a pixel layer takes the shared panel" },
  { side: 'pixel', ids: ['picture-draw', 'picture-file'], what: "Draw a picture... and From a picture file... (a picture tip)", clears: "piece 4: the shared Tip picker" },
  { side: 'pixel', ids: ['edges'], what: "Edges: Sharp pixels or Smooth", clears: "by design: vector lines are always smooth" },
  { side: 'pixel', ids: ['hardness'], what: "Hardness (and Edge on chalk and charcoal)", clears: "piece 9: a soft edge on a vector stroke" },
  { side: 'pixel', ids: ['edge-smooth-button'], what: "Make the edge smooth instead", clears: "by design: it explains dithering, which vectors do not do" },
  { side: 'pixel', ids: ['flow'], what: "Flow", clears: "piece 11: flow on a vector stroke" },
  { side: 'pixel', ids: ['opacity'], what: "Opacity (the most any pixel gets in a stroke)", clears: "piece 9: opacity on a vector stroke" },
  { side: 'pixel', ids: ['size-follows-invert', 'size-follows-curve'], what: "The other way round, and Shape of the response, for Size follows", clears: "piece 10: dynamics on a vector stroke" },
  { side: 'pixel', ids: ['flow-follows', 'flow-follows-amount', 'flow-follows-invert', 'flow-follows-curve'], what: "Flow follows, with its Amount, The other way round and Shape of the response", clears: "piece 11: flow on a vector stroke" },
  { side: 'pixel', ids: ['opacity-follows', 'opacity-follows-amount', 'opacity-follows-invert', 'opacity-follows-curve'], what: "Opacity follows, with its Amount, The other way round and Shape of the response", clears: "piece 11: flow on a vector stroke" },
  { side: 'pixel', ids: ['angle-follows', 'angle-follows-amount', 'angle-follows-invert', 'angle-follows-curve'], what: "Angle follows, with its Amount, The other way round and Shape of the response", clears: "piece 10: dynamics on a vector stroke" },
  { side: 'pixel', ids: ['scatter-follows', 'scatter-follows-amount', 'scatter-follows-invert', 'scatter-follows-curve'], what: "Scatter follows, with its Amount, The other way round and Shape of the response", clears: "piece 10: dynamics on a vector stroke" },
  { side: 'pixel', ids: ['mix-follows', 'mix-follows-amount', 'mix-follows-invert'], what: "Colour mixes toward the fill colour, with its Amount and The other way round", clears: "piece 11: colour changes along a vector stroke" },
  { side: 'pixel', ids: ['taper', 'taper-thin', 'taper-faint'], what: "Thin to a point at the ends, How thin and How faint the tip gets", clears: "piece 10: dynamics on a vector stroke" },
  { side: 'pixel', ids: ['fade-length'], what: "Fade length", clears: "piece 10: dynamics on a vector stroke (the fade source)" },
  { side: 'pixel', ids: ['dual-tip', 'dual-dot-shape', 'dual-dot-size', 'dual-picture', 'dual-picture-size', 'dual-invert', 'dual-amount', 'dual-cut'], what: "Dual tip: the switch, Dot shape, Dot size, a picture for the dots, How many dots, Cut holes instead", clears: "piece 12: dual tip on a vector stroke" },
  { side: 'pixel', ids: ['dual-laid-width', 'dual-laid-spacing', 'dual-laid-scatter'], what: "Second brush width, spacing and scatter", clears: "piece 12: dual tip on a vector stroke" },
  { side: 'pixel', ids: ['hue-wobble'], what: "Hue wobble", clears: "piece 11: colour changes along a vector stroke" },
  { side: 'pixel', ids: ['lightness-wobble'], what: "Lightness wobble", clears: "piece 11: colour changes along a vector stroke" },
  { side: 'pixel', ids: ['saturation-wobble'], what: "Colourfulness wobble", clears: "piece 11: colour changes along a vector stroke" },
  { side: 'pixel', ids: ['wet-paint'], what: "Wet paint", clears: "by design: it picks up the pixels under the stroke (piece 15 keeps it pixel only)" },
  { side: 'pixel', ids: ['blend'], what: "How the paint joins what is there (the blend mode)", clears: "piece 11: a blend mode on a vector stroke" },
  { side: 'pixel', ids: ['builds-up'], what: "Builds up while you hold still (Airbrush)", clears: "piece 10: time on a vector point" },
  { side: 'pixel', ids: ['press'], what: "Pressure (Chalk and charcoal)", clears: "piece 4: Chalk and charcoal takes the shared panel" },
  { side: 'pixel', ids: ['pixel-perfect'], what: "Pixel perfect", clears: "by design: pixel art only" },
  { side: 'pixel', ids: ['plain-shape'], what: "Shape: Square or Round (the plain Brush on a pixel layer)", clears: "piece 5: the plain Brush on a pixel layer takes the shared panel" },
];

export const ONE_SIDED_CONTROLS: ControlGap[] = [...VECTOR_ONLY_CONTROLS, ...PIXEL_ONLY_CONTROLS];

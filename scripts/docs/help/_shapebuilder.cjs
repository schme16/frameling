// Shared pieces for the Shape builder's help clip and board looks: three overlapping circles, and drags across their bits.
const S = require('./_shapes.cjs');
const { shapeOf, ellPath, stroke, INK, put, UI } = S;

// The stage's own middle on screen and a zoom that shows all of a 1280 x 720 page, worked out here rather than taken
// from view() in _shapes.cjs, which assumes a rail 30 px narrower than the app has now.
const Z = 0.85;
const STAGE = { left: 143, top: 47, w: 734, h: 444 };
const view = () => UI({ zoom: Z, panX: STAGE.w / 2 - 640 * Z, panY: STAGE.h / 2 - 360 * Z });
const at = (x, y) => [Math.round(STAGE.left + STAGE.w / 2 + (x - 640) * Z), Math.round(STAGE.top + STAGE.h / 2 + (y - 360) * Z)];
/** A drag through document points, like draw() in _shapes.cjs but on this mapping. */
const draw = (pts, o = {}) => ({ drag: pts.map(([x, y]) => at(x, y)), steps: o.steps ?? 12, delay: o.delay ?? 12, ...(o.mods ? { mods: o.mods } : {}), ...(o.hold ? { hold: o.hold } : {}), ...(o.after ? { after: o.after } : {}) });

const CORAL = '#ff8a7a';
const MINT = '#6ed3b5';
const SUNNY = '#ffd23f';
const ring = (cx, cy, r, fill) => shapeOf([ellPath(cx - r, cy - r, r * 2, r * 2)], fill, stroke(INK, 4, { join: 'round' }));

/** Three circles that all cross, back to front: coral, mint, sunny. Their bits (document coordinates) are in BITS. */
const circles = () => [ring(540, 300, 120, CORAL), ring(700, 300, 120, MINT), ring(620, 430, 120, SUNNY)];
const BITS = {
  coral: [450, 290],
  lens: [620, 240],
  mint: [790, 290],
  sunny: [620, 520],
  centre: [620, 350],
  coralSunny: [560, 385],
};

const scene = () => [S.T('blank-vector'), view(), put('Lines', circles(), []), UI({ tool: 'shape-builder', selection: [] }), { wait: 900 }, view(), { wait: 400 }, S.away, { wait: 300 }];
/** A drag across the coral bit, the lens and the mint bit: the three that make one shape. */
const joinPath = [BITS.coral, [535, 265], BITS.lens, [705, 265], BITS.mint];
/** A drag down the middle: the sunny bit at the bottom and the bit in the centre. */
const awayPath = [BITS.sunny, [620, 450], BITS.centre];

module.exports = { circles, scene, BITS, joinPath, awayPath, at, draw, STAGE };

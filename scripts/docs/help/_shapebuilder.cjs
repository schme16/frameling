// Shared pieces for the Shape builder's help clip and board looks: three overlapping circles, and drags across their bits.
const S = require('./_shapes.cjs');
const { shapeOf, ellPath, stroke, INK, put, UI } = S;

// A zoom that shows all of a 1280 x 720 page. Where the stage sits is read from the running app by view() and at() in
// _shapes.cjs, so there is no rail width in here to go stale.
const Z = 0.85;
const view = () => S.view(Z);
const { at, draw } = S;

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

module.exports = { circles, scene, BITS, joinPath, awayPath, at, draw };

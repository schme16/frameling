// Help clip for the Shape builder, once per theme: see scripts/docs/help-media.cjs.
const { REC, STOP, WARM, STAGE } = require('./_shapes.cjs');
const B = require('./_shapebuilder.cjs');
const { draw } = B;

module.exports = [
  // Point at a bit and it lights up; drag across three to make one shape; Alt-drag across two to take them away.
  { name: 'tool-shape-builder', width: 1000, choices: { 'shapes.buildLook': 'dragged' }, steps: [...B.scene(),
    WARM, REC(STAGE, 70), { wait: 700 },
    { move: B.at(...B.BITS.lens), after: 900 },
    { move: B.at(...B.BITS.centre), after: 700 },
    draw(B.joinPath, { steps: 10, delay: 22, hold: 700, after: 1300 }),
    draw(B.awayPath, { steps: 10, delay: 22, mods: ['alt'], hold: 700, after: 1800 }),
    { wait: 500 }, STOP] },
];

// The board look for the Shape builder: three overlapping circles before, part way through a drag with the bits lit,
// and after (once joined, and once with two bits taken away), plus a clip of a real build. Once per theme, in the real app.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" node_modules/.bin/electron scripts/docs/help-media.cjs --entries scripts/docs/ab-shape-builder --out <dir>
const { REC, STOP, WARM } = require('../help/_shapes.cjs');
const B = require('../help/_shapebuilder.cjs');
const { draw, at } = B;

const CANVAS = [128, 38, 764, 462];
const CROP = [128, 38, 764, 462];
const choices = { 'shapes.buildLook': 'dragged' };
const pt = (xy) => at(...xy);
const shot = { shot: '@', crop: CROP };

module.exports = [
  { name: 'sb-0-before', width: 1000, choices, steps: [...B.scene(), { move: pt(B.BITS.lens), after: 600 }, shot] },
  // Part way: the drag has crossed the coral bit and the lens and is heading for the mint one. Pointer still down.
  { name: 'sb-1-mid-drag', width: 1000, choices, steps: [...B.scene(),
    { down: pt(B.BITS.coral), after: 200 },
    { held: pt([535, 265]), after: 200 }, { held: pt(B.BITS.lens), after: 200 }, { held: pt([705, 265]), after: 200 }, { held: pt(B.BITS.mint), after: 500 },
    shot, { up: pt(B.BITS.mint) }] },
  { name: 'sb-2-after', width: 1000, choices, steps: [...B.scene(), draw(B.joinPath, { steps: 8, delay: 16, hold: 300, after: 500 }), { move: [720, 28], after: 300 }, shot] },
  // The other half: Alt held, the bottom bit and the middle one red and striped, still down.
  { name: 'sb-3-mid-alt', width: 1000, choices, steps: [...B.scene(),
    { down: pt(B.BITS.sunny), mods: ['alt'], after: 200 },
    { held: pt([620, 450]), mods: ['alt'], after: 200 }, { held: pt(B.BITS.centre), mods: ['alt'], after: 500 },
    shot, { up: pt(B.BITS.centre), mods: ['alt'] }] },
  { name: 'sb-4-after-alt', width: 1000, choices, steps: [...B.scene(), draw(B.awayPath, { steps: 8, delay: 16, mods: ['alt'], hold: 300, after: 500 }), { move: [720, 28], after: 300 }, shot] },
  // A real build, start to finish.
  { name: 'sb-clip', width: 1000, choices, steps: [...B.scene(),
    WARM, REC(CANVAS, 70), { wait: 700 },
    { move: pt(B.BITS.lens), after: 900 },
    draw(B.joinPath, { steps: 10, delay: 22, hold: 700, after: 1300 }),
    draw(B.awayPath, { steps: 10, delay: 22, mods: ['alt'], hold: 700, after: 1800 }),
    { wait: 500 }, STOP] },
];

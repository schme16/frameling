// Looks for picking part of a shape (brand/ab/select-scope): the same box dragged round one corner of the same art, then
// the picked thing pulled the same way, once with "Just the bit I went round" (A) and once with "The whole shape" (B).
// Pictures of what got picked and of what happens when you move it, and a clip of each. Dark and light each.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-select-scope --out brand/ab/select-scope
const { draw, REC, STOP, WARM } = require('../help/_shapes.cjs');
const parts = require('../help/select-parts.cjs');

// Same art and setup as the help clip.
const clip = parts[0];
const setupSteps = parts.setup();
const CANVAS = [113, 47, 764, 444];
const BOX = [[780, 150], [680, 250]];
const park = { move: [1000, 700] };
const pull = (a) => draw(a, { steps: 14, delay: 16, after: 900 });

const variant = (tag, scope) => {
  const base = { ...clip, choices: { 'select.vectorScope': scope } };
  const nameOf = (n) => `scope-${tag}-${n}`;
  const pickedSteps = [...setupSteps, draw(BOX, { steps: 14, delay: 16, after: 900 })];
  // Each side pulls the same way from the same spot: the picked corner for A, the middle of the shape for B.
  const grab = scope === 'parts' ? [[720, 200], [800, 140]] : [[560, 330], [640, 270]];
  return [
    { ...base, name: nameOf('picked'), steps: [...pickedSteps, park, { wait: 500 }, { shot: '@', crop: CANVAS }] },
    { ...base, name: nameOf('moved'), steps: [...pickedSteps, pull(grab), park, { wait: 500 }, { shot: '@', crop: CANVAS }] },
    { ...base, name: nameOf('clip'), steps: [...setupSteps, WARM, REC(CANVAS, 70), { wait: 600 }, draw(BOX, { steps: 14, delay: 16, after: 1100 }), draw(grab, { steps: 14, delay: 16, after: 1800 }), STOP] },
  ];
};

module.exports = [...variant('a', 'parts'), ...variant('b', 'whole')];

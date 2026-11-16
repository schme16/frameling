// Vector chalk and charcoal with paper tooth (brand/ab/vector-charcoal): every dry brush drawing a firm stroke, a light stroke,
// a pressure ramp and three passes over each other, on paper, in both themes. ONLY=a,b limits the brushes; HOLES=1 draws the older
// grain made of tiny shapes instead; SIZE=<px> sets the brush size.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-vector-charcoal --out <dir>
const { scene, INK } = require('./_draw.cjs');
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
module.exports = Object.keys(INK)
  .filter((id) => !only || only.includes(id))
  .map((id) => ({ name: `${id}${process.env.HOLES ? '-holes' : ''}`, prefs: { firstDrawn: true, showTips: false }, width: 800, steps: [...scene(id, { holes: !!process.env.HOLES, size: process.env.SIZE ? Number(process.env.SIZE) : undefined }), { shot: '@', el: '.cv-root', pad: 0 }] }));

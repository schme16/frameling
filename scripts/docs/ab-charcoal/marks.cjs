// The look for chalk and charcoal (brand/ab/charcoal): every medium drawing a firm stroke, a light stroke, a pressure ramp and
// three passes over each other, on paper, in both themes. PAPER=<kind> picks the paper (default medium); ONLY=a,b limits the media.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-charcoal --out <dir>
const { scene, INK } = require('./_draw.cjs');
const paper = process.env.PAPER || 'medium';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
module.exports = Object.keys(INK)
  .filter((id) => !only || only.includes(id))
  .map((id) => ({ name: `${id}-${paper}`, prefs: { firstDrawn: true, showTips: false }, width: 800, steps: [...scene(id, paper), { shot: '@', el: '.cv-root', pad: 0 }] }));

// Looks for the Swap fonts window (brand/ab/font-swap): as it opens on a drawing with two missing fonts, then with a
// replacement picked for each. Same steps as the help picture. Dark and light each.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-font-swap --out brand/ab/font-swap
const [help] = require('../help/font-swap.cjs');

const upToPick = help.steps.filter((s) => !(s.eval && s.eval.includes('dispatchEvent')) && !s.shot);
const picks = help.steps.filter((s) => s.eval && s.eval.includes('dispatchEvent'));
const shot = { shot: '@', el: '.io-modal', pad: 0 };
const park = { move: [640, 990] };

module.exports = [
  { ...help, name: 'font-swap-opened', steps: [...upToPick.filter((s) => !s.move), { wait: 600 }, park, shot] },
  { ...help, name: 'font-swap-picked', steps: [...upToPick.filter((s) => !s.move), ...picks, { wait: 1200 }, park, shot] },
];

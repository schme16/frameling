// The look for soft-tools (brand/ab/soft-tools): the rail before and after on a pixel layer and a vector layer, the pull-out open, and the
// menu. Run once on a build of development (V=before) and once on this branch (V=after), each with --renderer <dir>:
//   V=before SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-soft-tools --renderer <dir> --out <dir>
const { js, wait } = require('../help/_lib.cjs');
const F = '__frameling';
const V = process.env.V || 'after';
const away = { move: [900, 8] };
const prefs = { firstDrawn: true, showTips: false, showQuill: false };
const pixel = [js(`${F}.template('blank-pixel')`), wait(700), away, wait(400)];
const vector = [js(`${F}.template('blank-vector')`), wait(700), away, wait(400)];
const rail = { shot: '@', crop: [0, 38, 150, 862] };
const withFly = (id, text) => [{ holdOn: `.ui-tool.is-stack[data-stack="${id}"]`, hold: 650, after: 700 }, { shot: '@', crop: [0, 38, 480, 700] }];

module.exports = [
  { name: `${V}-rail-pixel`, size: [1400, 900], width: 1400, prefs, steps: [...pixel, rail] },
  { name: `${V}-rail-vector`, size: [1400, 900], width: 1400, prefs, steps: [...vector, rail] },
  { name: `${V}-menu`, size: [1400, 900], width: 1400, prefs, steps: [...pixel, { clickOn: '.ui-menubar [role=menuitem]', text: V === 'before' ? 'Soft paint' : 'Tools', after: 700 }, ...(V === 'before' ? [] : [{ clickOn: '[role=menu] [role=menuitem]', text: 'Soft paint', hover: true, after: 800 }]), { shot: '@', crop: [0, 0, 1300, 560] }] },
  ...(V === 'before' ? [] : [
    { name: 'after-pullout-pixel', size: [1400, 900], width: 1400, prefs, steps: [...pixel, ...withFly('brush')] },
    { name: 'after-pullout-vector', size: [1400, 900], width: 1400, prefs, steps: [...vector, ...withFly('brush')] },
    { name: 'after-retouch-vector', size: [1400, 900], width: 1400, prefs, steps: [...vector, ...withFly('retouch')] },
    { name: 'after-pullout-narrow', size: [980, 780], width: 1400, prefs: { ...prefs, toolRail: 'stacked' }, steps: [...pixel, { holdOn: '.ui-tool.is-stack[data-stack="draw"]', hold: 650, after: 700 }, { shot: '@', crop: [0, 38, 480, 700] }] },
  ]),
];

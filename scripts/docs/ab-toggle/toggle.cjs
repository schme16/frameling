// A/B shots and the clip for the Pixels | Vectors switch (brand/ab/toggle). The real rail in the real app.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-toggle --renderer <dir> --out <dir>
// Then scripts/docs/ab-toggle/sheets.sh puts the pictures side by side with captions.
const { js, wait, cmd } = require('../help/_lib.cjs');
const F = '__frameling';
const away = { move: [900, 40] };
const prefs = { showTips: false, reduceMotion: true };
const rail = { shot: '@', el: '.ui-tools', pad: 10 };
const scene = { shot: '@', crop: [0, 40, 700, 700] };

const kindOf = (k) => js(`(() => { const s = ${F}.store(); const l = s.get().doc.layers.find((x) => x.kind === ${JSON.stringify(k)}); if (l) s.setUi({ activeLayerId: l.id }); })()`);
const tool = (id) => js(`${F}.store().setUi({ tool: ${JSON.stringify(id)} })`);
const press = (side) => js(`document.querySelector('.ui-tool-side.is-${side}')?.click()`);
// A document with both kinds of layer, sitting on the vector one.
const both = [js(`${F}.dock.applyWorkspace('draw')`), wait(500), js(`${F}.template('blank-vector')`), wait(400), cmd('layers.addPixel'), wait(7600), kindOf('vector'), wait(300)];
const vectorOnly = [js(`${F}.dock.applyWorkspace('draw')`), wait(500), js(`${F}.template('blank-vector')`), wait(400)];
const pixelOnly = [js(`${F}.dock.applyWorkspace('pixel')`), wait(500), js(`${F}.template('blank-pixel')`), wait(400)];

module.exports = [
  { name: 'rail-vectors', prefs, steps: [...both, away, wait(400), rail] },
  { name: 'rail-pixels', prefs, steps: [...both, kindOf('pixel'), away, wait(400), rail] },
  { name: 'scene-vectors', prefs, steps: [...both, away, wait(400), scene] },
  { name: 'scene-pixels', prefs, steps: [...both, kindOf('pixel'), away, wait(400), scene] },
  // The moment a pixel-only tool is picked on a vector layer: before, then after.
  { name: 'flip-before', prefs, steps: [...both, away, wait(400), scene] },
  { name: 'flip-after', prefs, steps: [...both, tool('shade'), away, wait(600), scene] },
  // The offer, with no pixel layer in the document.
  { name: 'offer', prefs, steps: [...vectorOnly, press('pixel'), wait(700), { shot: '@', crop: [0, 40, 1100, 700] }] },
  // The icons-only forms: one button wide, and lying along the top.
  { name: 'narrow-vectors', prefs: { ...prefs, toolRail: 'stacked', toolNames: false }, steps: [...both, away, wait(400), rail] },
  { name: 'narrow-pixels', prefs: { ...prefs, toolRail: 'stacked', toolNames: false }, steps: [...both, kindOf('pixel'), away, wait(400), rail] },
  // The clip: press Pixels, press Vectors, pick Shade (which flips it back to Pixels).
  {
    name: 'press',
    prefs,
    steps: [
      ...both,
      away,
      wait(600),
      { rec: '@', crop: [0, 40, 700, 700] },
      wait(700),
      press('pixel'),
      wait(1300),
      press('vector'),
      wait(1300),
      tool('shade'),
      wait(1500),
      { rec: 'stop' },
    ],
    width: 700,
  },
];

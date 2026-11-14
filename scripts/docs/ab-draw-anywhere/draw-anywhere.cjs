// A/B shots and the clip for draw anywhere (brand/ab/draw-anywhere). The real app, real pointer strokes.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-draw-anywhere --out <dir>
// Then scripts/docs/ab-draw-anywhere/sheets.sh puts the pictures side by side with captions.
const { js, wait, cmd } = require('../help/_lib.cjs');
const F = '__frameling';
const away = { move: [900, 60] };
const prefs = { showTips: false, reduceMotion: true, showExplanations: false };

const pick = (name) => js(`(() => { const s = ${F}.store(); const l = s.get().doc.layers.find((x) => x.name === ${JSON.stringify(name)}); if (l) s.setUi({ activeLayerId: l.id }); })()`);
const press = (side) => js(`document.querySelector('.ui-tool-side.is-${side}')?.click()`);
const tool = (id) => js(`${F}.store().setUi({ tool: ${JSON.stringify(id)} })`);
const toasts = js(`document.querySelectorAll('.ui-toast, [data-toast]').forEach((t) => t.remove())`);
// Strokes on the page (window coordinates for a 1280 x 800 window in the Draw workspace).
const squiggle = (x, y) => ({ drag: [[x, y], [x + 40, y - 30], [x + 80, y], [x + 120, y - 30], [x + 160, y]], steps: 8 });
const start = [js(`${F}.dock.applyWorkspace('draw')`), wait(500), js(`${F}.template('blank-vector')`), wait(500), js(`${F}.showPanel('layers')`), wait(400)];
// Two pairs: pixels drawn on the Lines layer and on the Colour layer, each with the switch on Pixels.
const twoPairs = [
  ...start,
  tool('brush'),
  pick('Lines'),
  press('pixel'),
  wait(300),
  squiggle(420, 330),
  wait(500),
  pick('Colour'),
  press('pixel'),
  wait(300),
  squiggle(420, 430),
  wait(700),
  away,
  wait(400),
];
const panel = { shot: '@', crop: [888, 60, 322, 260] };
const scene = { shot: '@', crop: [0, 60, 1280, 700] };

module.exports = [
  { name: 'layers-paired', prefs, steps: [...twoPairs, toasts, wait(300), panel] },
  { name: 'layers-split', prefs, steps: [...twoPairs, toasts, pick('Lines (pixels)'), cmd('layers.unpair'), wait(300), pick('Colour (pixels)'), cmd('layers.unpair'), wait(500), away, wait(300), panel] },
  { name: 'scene-paired', prefs, steps: [...twoPairs, scene] },
  // Reaching a half: right-click its chip.
  {
    name: 'half-menu',
    prefs,
    steps: [
      ...twoPairs,
      toasts,
      js(`(() => { const c = document.querySelector('.lp-panel .tl-half[data-half="vector"]'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 6, clientY: r.bottom })); })()`),
      wait(500),
      { shot: '@', crop: [700, 60, 580, 560] },
    ],
  },
  // The clip: the same one the help topic has (a vector stroke, press Pixels, draw, Undo, Redo).
  ...require('../help/draw-anywhere.cjs').map((e) => ({ ...e, name: 'press' })),
];

// Help clip for "Draw pixels or vectors anywhere": a vector stroke, press Pixels, draw (the pixel layer appears beside it and
// the two show as one row in Layers), then Undo takes back the layer with the stroke, and Redo brings both back.
// Real pointer strokes in the real app. See help-media.cjs for the entry format.
const { js, wait } = require('./_lib.cjs');
const F = '__frameling';

const pick = (name) => js(`(() => { const s = ${F}.store(); const l = s.get().doc.layers.find((x) => x.name === ${JSON.stringify(name)}); if (l) s.setUi({ activeLayerId: l.id }); })()`);
const press = (side) => js(`document.querySelector('.ui-tool-side.is-${side}')?.click()`);
const squiggle = (x, y) => ({ drag: [[x, y], [x + 40, y - 30], [x + 80, y], [x + 120, y - 30], [x + 160, y]], steps: 8 });

module.exports = [
  {
    name: 'draw-anywhere',
    prefs: { showTips: false, reduceMotion: true, showExplanations: false },
    steps: [
      js(`${F}.dock.applyWorkspace('draw')`),
      wait(500),
      js(`${F}.template('blank-vector')`),
      wait(500),
      js(`${F}.showPanel('layers')`),
      wait(400),
      js(`${F}.store().setUi({ tool: 'brush' })`),
      pick('Lines'),
      { move: [900, 60] },
      wait(500),
      { rec: '@', crop: [0, 60, 1280, 700] },
      wait(500),
      squiggle(420, 330),
      wait(900),
      press('pixel'),
      wait(1100),
      squiggle(420, 430),
      wait(2200),
      { key: 'z', mods: ['control'] },
      wait(1300),
      { key: 'z', mods: ['control', 'shift'] },
      wait(1500),
      { rec: 'stop' },
    ],
    width: 800,
  },
];

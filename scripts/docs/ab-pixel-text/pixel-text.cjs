// Look for pixel text (brand/ab/pixel-text): the same words typed with the Text tool on a pixel layer (A) and on a vector
// layer over the same pixel scene (B, what you had before). A is crisp, on the grid, in one colour; B is smoothed, off the
// grid, with blended edge colours that no palette holds.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-pixel-text --out brand/ab/pixel-text
const L = require('../help/_lib.cjs');
const { SCENE } = require('../help/pixel-text.cjs');
const F = '__frameling';
const { scene, pin, at } = SCENE;

const open = [
  L.js(`${F}.dock.applyWorkspace('pixel')`),
  L.wait(500),
  L.template('blank-pixel'),
  L.wait(300),
  scene,
  L.wait(300),
  L.js(`${F}.run('view.pixelGrid')`),
  L.js(`${F}.run('view.zoom100')`),
  L.js(`${F}.run('view.center')`),
  L.js(`${F}.store().setUi({ color: '#fff1c9', tool: 'text' })`),
  L.wait(400),
];
const words = () => {
  return [
    pin,
    L.wait(300),
    { click: at(4, 4) },
    L.wait(300),
    { type: 'Moon Hill' },
    L.wait(200),
    { key: 'Escape' },
    L.wait(300),
    { click: at(4, 20) },
    L.wait(300),
    { type: 'Frogs welcome' },
    L.wait(200),
    { key: 'Escape' },
    L.wait(300),
    { move: [1100, 800] },
    L.wait(300),
    { shot: '@', crop: [471, 208, 640, 320] },
  ];
};
const base = { prefs: { showTips: false, firstDrawn: true }, size: [1500, 900], width: 900 };

module.exports = [
  { ...base, name: 'a-pixel-text', steps: [...open, ...words()] },
  { ...base, name: 'b-vector-text', steps: [...open.slice(0, 5), L.cmd('layers.addVector'), L.wait(300), ...open.slice(5), ...words()] },
];

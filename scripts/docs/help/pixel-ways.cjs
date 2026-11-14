// Help pictures and clips for starting a pixel sprite, the four ways to build one, Paint and Back, and the Spray.
const { js, wait, key } = require('./_lib.cjs');

const F = '__frameling';
const P = '__framelingPixel';
const A = '__framelingArtboards';
const away = { move: [640, 780] };
const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.click()`);
const setUi = (o) => js(`${F}.store().setUi(${JSON.stringify(o)})`);
const pixelWs = js(`${F}.dock.applyWorkspace('pixel')`);

module.exports = [
  {
    // Quill's chooser with An animation picked.
    name: 'pixel-new',
    prefs: { showTips: false },
    steps: [js(`${P}.openChooser()`), wait(700), click('.px-way-card[data-way="animation"]'), wait(1500), away, { shot: '@', el: '.io-modal', pad: 0 }],
  },
  {
    // Frames on boards turned into an animation: the chip, the Change dialog, then the timeline comes back.
    name: 'pixel-ways',
    prefs: { showTips: false },
    steps: [
      pixelWs,
      wait(500),
      js(`${A}.load('frames')`),
      wait(900),
      js(`${F}.run('view.fit')`),
      away,
      wait(900),
      { rec: '@', crop: [0, 0, 1280, 800], every: 70 },
      wait(1600),
      click('.px-way-chip'),
      wait(1400),
      click('.px-way-card[data-way="animation"]'),
      wait(1400),
      click('.io-foot .io-primary'),
      wait(1800),
      js(`${F}.run('view.fit')`),
      wait(2200),
      { rec: 'stop' },
    ],
  },
  {
    // Frames on boards with one set of layers: a layer added once is on every frame, and the Layers panel says so.
    name: 'pixel-shared-layers',
    prefs: { showTips: false },
    steps: [
      pixelWs,
      wait(500),
      js(`${A}.load('shared')`),
      js(`${F}.showPanel('layers')`),
      wait(900),
      js(`${A}.addSparkles('Sparkle')`),
      js(`${F}.run('artboards.fitAll')`),
      away,
      wait(1200),
      { shot: '@' },
    ],
  },
  {
    // The Palette with Paint and Back at the top, a right-click stroke of Back on the sprite.
    name: 'pixel-wells',
    prefs: { showTips: false },
    steps: [
      pixelWs,
      wait(500),
      js(`${F}.template('hero-sprites')`),
      wait(700),
      key('p'),
      js(`${F}.run('view.zoom100')`),
      js(`${F}.run('view.center')`),
      setUi({ color: '#ff6f91', fillColor: '#6fb8ff', dirty: false }),
      away,
      wait(700),
      { shot: '@', crop: [0, 47, 1000, 440] },
    ],
  },
  {
    // A sprinkle of Paint with the Spray, on a blank picture.
    name: 'pixel-spray',
    prefs: { showTips: false },
    steps: [
      pixelWs,
      wait(500),
      js(`${P}.newSprite('picture', 32)`),
      wait(600),
      js(`${F}.run('view.fit')`),
      setUi({ tool: 'spray', color: '#4fd1a5', fillColor: '#ffc94a', dirty: false }),
      wait(500),
      { drag: [[560, 260], [640, 230], [720, 270], [780, 240]], steps: 10, delay: 40 },
      setUi({ color: '#ff6f91' }),
      { drag: [[600, 330], [700, 350], [760, 320]], steps: 10, delay: 40 },
      setUi({ color: '#9b7bff' }),
      { drag: [[560, 190], [660, 180], [740, 200]], steps: 8, delay: 40 },
      away,
      wait(600),
      { shot: '@', crop: [0, 47, 1000, 440] },
    ],
  },
  {
    // The Preview on boards: frames on boards play in order with a strip of boards, then sprites on a sheet with a picker.
    name: 'pixel-preview-boards',
    prefs: { showTips: false },
    steps: [
      pixelWs,
      wait(500),
      js(`${A}.load('frames')`),
      js(`${F}.showPanel('preview')`),
      wait(900),
      js(`${F}.run('view.fit')`),
      away,
      wait(900),
      { rec: '@', crop: [0, 47, 1280, 753], every: 70 },
      wait(2600),
      js(`${A}.load('sprites')`),
      js(`${F}.showPanel('preview')`),
      wait(900),
      js(`${F}.run('view.fit')`),
      away,
      wait(2200),
      click('.px-preview-board:nth-child(2)'),
      wait(1600),
      click('.px-preview-board:nth-child(3)'),
      wait(1800),
      { rec: 'stop' },
    ],
  },
];

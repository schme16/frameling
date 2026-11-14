// A/B looks for the pixel gradient: the dither styles, and plain two colours against palette steps (and a smooth mix).
// Each entry is one picture of the same sunset (Paint to Back, top to bottom) with one setting changed; the montage
// in brand/ab/pixel-gradient/ puts them side by side. Run:
//   npm run help:media -- --entries scripts/docs/ab-pixel-gradient --out brand/ab/pixel-gradient
// then scripts/ab/pixel-gradient-montage.sh builds the labelled side by side pictures.
const { js, wait, key } = require('../help/_lib.cjs');

const F = '__frameling';
const G = 16;
const W = 32;
const H = 16;
const cell = 16;
// The stage's top left is pinned here so every look is cropped the same, whatever the tool options bar did to the layout.
const left = 414;
const top = 150;
const at = (x, y) => [Math.round(left + (x + 0.5) * cell), Math.round(top + (y + 0.5) * cell)];

const one = (name, settings, o = {}) => ({
  name,
  steps: [
    js(`${F}.dock.applyWorkspace('pixel')`),
    wait(500),
    js(`${F}.template('blank-pixel')`),
    wait(300),
    js(`(() => { const st = ${F}.store(); const d = structuredClone(st.get().doc); const L = d.layers.find((l) => l.kind === 'pixel'); d.width = ${W} * L.pixelSize; d.height = ${H} * L.pixelSize; st.load(d); })()`),
    wait(300),
    key('f'),
    js(`${F}.run('view.zoom100')`),
    js(`${F}.run('view.zoomIn')`),
    js(`${F}.run('view.zoomIn')`),
    js(`${F}.run('view.center')`),
    wait(300),
    js(`(() => { const r = document.querySelector('.cv-layer').getBoundingClientRect(); ${F}.store().setUi({ panX: ${left} - r.x, panY: ${top} - r.y }); })()`),
    wait(300),
    js(`__framelingPixel.settings(${JSON.stringify({ gradientShape: 'linear', ...settings })})`),
    js(`${F}.store().setUi(${JSON.stringify({ color: o.paint ?? '#5a1f33', fillColor: o.back ?? '#ffe066' })})`),
    wait(200),
    { drag: (o.drag ?? [[G, 0], [G, H - 1]]).map(([x, y]) => at(x, y)), steps: 10, delay: 24 },
    { move: [640, 762] },
    wait(500),
    { shot: '@', crop: [left - 2, top - 2, W * cell + 4, H * cell + 4] },
  ],
});

module.exports = [
  one('ab-dither-classic', { gradientDither: 'classic', gradientColours: 'palette' }),
  one('ab-dither-smooth', { gradientDither: 'smooth', gradientColours: 'palette' }),
  one('ab-dither-chunky', { gradientDither: 'chunky', gradientColours: 'palette' }),
  one('ab-dither-grainy', { gradientDither: 'grainy', gradientColours: 'palette' }),
  one('ab-dither-bands', { gradientDither: 'bands', gradientColours: 'palette' }),
  one('ab-colours-two', { gradientDither: 'classic', gradientColours: 'two' }),
  one('ab-colours-palette', { gradientDither: 'classic', gradientColours: 'palette' }),
  one('ab-colours-smooth', { gradientColours: 'blend' }),
  one('ab-radial-palette', { gradientDither: 'classic', gradientColours: 'palette', gradientShape: 'radial' }, { drag: [[G, 8], [G + 14, 8]] }),
];

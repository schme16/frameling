// Stills for the turn-view look: the note that says the view is turned (with its angle), and Alt plus a click still
// picking a colour on a pixel layer. Run with: help-media.cjs --entries scripts/docs/ab-turn-view --out brand/ab/turn-view
const { js, wait, key } = require('../help/_lib.cjs');

const F = '__frameling';
const setUi = (o) => js(`${F}.store().setUi(${JSON.stringify(o)})`);
const away = { move: [720, 28] };
const arc = (from, to, n, r = 230) => Array.from({ length: n }, (_, i) => { const a = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180; return [Math.round(495 + r * Math.cos(a)), Math.round(269 + r * Math.sin(a))]; });

// The pixel stage once the sprite page is fitted (window 1280 x 800, Pixel workspace): see help/pixel.cjs grid().
// The middle of the pink bar the two strokes leave, in window coordinates (found from a first look at the shot).
const BAR = [659, 242];
function grid(w, h, cell) {
  const ox = 403 + (526 - w * cell) / 2;
  const oy = 96 + (395 - h * cell) / 2;
  return { at: (x, y) => [Math.round(ox + (x + 0.5) * cell), Math.round(oy + (y + 0.5) * cell)] };
}

module.exports = [
  {
    // Turned by an Alt drag to an angle that is not a multiple of 15: the note says how far, with a Straighten button.
    name: 'turn-view-angle',
    steps: [
      { eval: `${F}.template('blank-vector')` },
      setUi({ zoom: 0.5, panX: 382 - 320, panY: 222 - 180, color: '#5b4bd6', tool: 'brush' }),
      wait(600), away, wait(300),
      { drag: [[300, 200], [380, 150], [470, 170], [520, 240], [470, 330], [380, 340], [310, 280]], steps: 6, delay: 20 },
      wait(300),
      { drag: arc(0, 37, 7), mods: ['alt'], steps: 3, delay: 28 },
      wait(900), away, wait(500),
      { shot: '@', crop: [113, 47, 764, 444] },
    ],
  },
  {
    // Alt and a plain click on a pixel layer picks the colour under the pointer, as it always did. The Paint colour
    // starts dark, the click lands on a pink pixel, and the Paint square turns pink.
    name: 'turn-view-alt-pick',
    steps: (() => {
      const g = grid(32, 32, 8);
      return [
        js(`${F}.dock.applyWorkspace('pixel')`),
        wait(500),
        js(`${F}.template('hero-sprites')`),
        wait(600),
        js(`${F}.run('view.zoom100')`), js(`${F}.run('view.center')`),
        wait(500),
        setUi({ tool: 'pencil', color: '#ff6f91' }),
        { drag: [g.at(10, 8), g.at(20, 8)], steps: 6, delay: 30 },
        { drag: [g.at(10, 9), g.at(20, 9)], steps: 6, delay: 30 },
        wait(900),
        setUi({ color: '#1d1b26' }),
        wait(900),
        { log: `'before ' + ${F}.store().get().ui.color` },
        { move: BAR }, wait(300),
        { click: BAR, mods: ['alt'], after: 600 },
        { log: `${F}.store().get().ui.color` },
        { move: [640, 700] },
        wait(500),
        { shot: '@', crop: [0, 47, 1280, 500] },
      ];
    })(),
  },
];

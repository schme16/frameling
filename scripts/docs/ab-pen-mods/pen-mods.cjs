// The same drawn shape with each pen modifier on (brand/ab/stream-pen-mods), shot in the real app, once per theme. Names: <modifier>.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-pen-mods --out <dir> [--only shaky,...]
// then scripts/docs/ab-pen-mods/caption.sh <dir> to burn the captions in and make the side by side. Each clip draws a wave,
// a straight line and a ring, the same every time, with the chip at the top right counting down. Where things
// land is measured from the running app (view() and at() in help/_shapes.cjs), the doc at 50%.
const L = require('../help/_lib.cjs');
const { view, at } = require('../help/_shapes.cjs');
const fit = view(0.5);
const away = { move: [720, 28] };
const wave = { drag: Array.from({ length: 40 }, (_, i) => at(220 + i * 21, 190 + 55 * Math.sin((i / 39) * Math.PI * 2.4))), steps: 4, delay: 12 };
const line = { drag: Array.from({ length: 30 }, (_, i) => at(220 + i * 29, 345)), steps: 4, delay: 12 };
const ring = { drag: Array.from({ length: 44 }, (_, i) => { const a = (i / 43) * Math.PI * 2.05; return at(640 + Math.cos(a) * 110, 540 + Math.sin(a) * 90); }), steps: 4, delay: 12 };
const blue = '#2d3f6e';
const PAPER = L.js(`(() => { const S = __frameling.store(); const c = getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number); const dark = (c[0] + c[1] + c[2]) / 3 < 110; S.update('page', (d) => { d.background = dark ? '#262a33' : '#ffffff'; }); S.setUi({ color: dark ? '#f3ecd9' : '${blue}' }); })()`);
const BRUSH = L.js('__frameling.store().setUi((u) => ({ brush: { ...u.brush, size: 14, thinning: 0, smoothing: 0.5, streamline: 0.3, taperStart: 0, taperEnd: 0 } }))');

const entry = (name, command) => ({
  name,
  prefs: { firstDrawn: true, showTips: false, reduceMotion: false },
  width: 1000,
  steps: [
    L.template('blank-vector'), L.cmd('tools.brush'), L.wait(700), PAPER, BRUSH, L.wait(500), fit, away, L.wait(300),
    { shot: 'warm', crop: [0, 0, 32, 32] },
    { rec: '@', crop: { stageCrop: { rightGap: 0, down: 109 } }, every: 80 },
    L.wait(500),
    ...(command ? [L.cmd(command), L.wait(1500)] : [L.wait(800)]),
    wave, L.wait(300), line, L.wait(300), ring, L.wait(1500),
    { rec: 'stop' },
  ],
});

module.exports = [
  entry('plain', null),
  entry('steady', 'penmods.try.steady'),
  entry('shaky', 'penmods.try.shaky'),
  entry('thin', 'penmods.try.thin'),
  entry('fat', 'penmods.try.fat'),
  entry('rope', 'penmods.try.rope'),
];

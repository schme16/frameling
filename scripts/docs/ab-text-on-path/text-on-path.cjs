// Looks for text on a curve (brand/ab/text-on-path): words round a circle, words along a wave, and the same words still
// being edited after they are on the curve (the Text panel open, new words typed into the box under them). Real command,
// real app, once per theme.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-text-on-path --out <dir>
const { L, scene } = require('../help/_text-on-path.cjs');

const base = { prefs: { showTips: false, firstDrawn: true }, choices: { 'text.pathSide': 'outside' }, size: [1280, 800], width: 900 };
const open = (which, opts) => [L.template('blank-vector'), L.wait(1200), L.cmd('view.fit'), L.wait(400), scene(which, opts), L.wait(900), { move: [640, 790] }];
// The page sits at 195,92 in the window, 627 by 353.
const PAGE = [185, 82, 647, 373];

module.exports = [
  { ...base, name: 'circle', steps: [...open(['circle']), { shot: '@', crop: PAGE }] },
  { ...base, name: 'wave', steps: [...open(['wave']), { shot: '@', crop: PAGE }] },
  {
    ...base,
    size: [1280, 1000],
    name: 'editing',
    steps: [
      ...open(['circle']),
      L.js(`__frameling.store().setUi({ selection: ['badge'] })`),
      L.panel('text'),
      L.wait(700),
      L.js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Type on the canvas')?.click()`),
      L.wait(500),
      L.js(`[...document.querySelectorAll('summary')].find((b) => b.textContent.trim().startsWith('Look'))?.click()`),
      { type: 'SUNRISE BAKERY AND CAFE' },
      L.wait(700),
      { shot: '@', crop: [0, 40, 1280, 700] },
    ],
  },
];

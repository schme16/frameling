// Looks for menus-ws: menu changes are kept per workspace. Hide the Pixel menu while in Pixel, switch to Draw (the menu is
// still there), and come back to Pixel (still hidden). A clip of the bar, and one picture of the bar at each step.
// Run: SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-menus-ws --out brand/ab/menus-ws
const L = require('../help/_lib.cjs');
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const BAR = [0, 0, 1280, 48];
const openMenus = L.js(`__frameling.overlays.openPrefs('menus')`);
const closeIt = { key: 'Escape' };
const to = (id) => L.js(`__frameling.dock.applyWorkspace(${JSON.stringify(id)})`);
const hidePixel = L.js(`(() => { const b = document.querySelector('[aria-label="Hide Pixel tools"]'); b && b.click(); })()`);
const CALM = { reduceMotion: true, showTips: false };
const choices = { 'ui.backdropClick': 'stay' };

const start = [to('pixel'), L.wait(700), ...settle];
const hideSteps = [openMenus, L.wait(900), hidePixel, L.wait(700), closeIt, L.wait(600)];

module.exports = [
  { name: 'pixel-before', prefs: CALM, choices, width: 1280, steps: [...start, { shot: '@', crop: BAR }] },
  { name: 'pixel-after', prefs: CALM, choices, width: 1280, steps: [...start, ...hideSteps, { shot: '@', crop: BAR }] },
  { name: 'draw-still', prefs: CALM, choices, width: 1280, steps: [...start, ...hideSteps, to('draw'), L.wait(700), { shot: '@', crop: BAR }] },
  {
    name: 'switch-clip',
    prefs: CALM,
    choices,
    width: 1280,
    steps: [
      ...start,
      { rec: '@', crop: BAR, every: 70 },
      L.wait(1200),
      openMenus, L.wait(900), hidePixel, L.wait(900), closeIt, L.wait(1200),
      to('draw'), L.wait(1800),
      to('pixel'), L.wait(1800),
      to('animate'), L.wait(1500),
      { rec: 'stop' },
    ],
  },
];

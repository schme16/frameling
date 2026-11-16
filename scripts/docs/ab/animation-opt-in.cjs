// Looks for the animation-opt-in branch: a new plain drawing as it opens now (no animation) beside how it opened before, and a
// clip of pressing Add animation and the timeline arriving.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs \
//     --entries scripts/docs/ab --out brand/ab/animation-opt-in --only before,after,after-add,clip
const L = require('../help/_lib.cjs');
const closeToasts = L.js("document.querySelectorAll('.ui-toast-x').forEach((b) => b.click())");
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const calm = { showTips: false, reduceMotion: true };
const away = { move: [900, 400] };

module.exports = [
  // A: a new drawing as it opened before, with a 24 frame timeline across the bottom and a frame rate in the status bar.
  { name: 'before', size: [1280, 800], width: 1280, prefs: calm, steps: [L.js('__frameling.blank(true)'), L.wait(700), away, closeToasts, L.wait(300), ...settle, { shot: '@' }] },
  // B: the same new drawing now. A picture to draw on, and nothing about frames.
  { name: 'after', size: [1280, 800], width: 1280, prefs: calm, steps: [L.js('__frameling.blank(false)'), L.wait(700), away, closeToasts, L.wait(300), ...settle, { shot: '@' }] },
  // B after one press of Add animation.
  {
    name: 'after-add',
    size: [1280, 800],
    width: 1280,
    prefs: calm,
    steps: [L.js('__frameling.blank(false)'), L.wait(600), L.cmd('animation.add'), L.wait(900), away, closeToasts, L.wait(300), ...settle, { shot: '@' }],
  },
  // The clip: open on a clean drawing, open the Animation menu, press Add animation, the timeline arrives.
  {
    name: 'clip',
    size: [1280, 800],
    width: 960,
    prefs: calm,
    steps: [
      L.js('__frameling.blank(false)'),
      L.wait(700),
      away,
      closeToasts, L.wait(300), ...settle,
      { rec: '@', every: 70 },
      L.wait(1600),
      { clickOn: '.ui-menubar [role=menuitem]', text: 'Animation', after: 1100 },
      { clickOn: '[data-command="animation.add"]', hover: true, after: 1100 },
      { clickOn: '[data-command="animation.add"]', after: 2600 },
      { rec: 'stop' },
    ],
  },
];

// Looks for ux-stream-tab: streaming gets a tab in Preferences, and the Streaming menu leaves the bar when the streaming
// tools are tucked away. Run the same file against the build before (--only bar-tucked,menu-before,tab-before) and after
// (--only bar-tucked,view-tucked,bar-on,tab-after,tab-tucked), then put them together with sheet.py.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-ux-stream-tab --out <raw> --only ...
const L = require('../help/_lib.cjs');
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const CALM = { reduceMotion: true, showTips: false };
const BAR = [0, 0, 1280, 48];
const tuck = L.js(`__frameling.run('features.streamingOff')`);
const choices = { 'ui.backdropClick': 'stay' };
const base = { prefs: CALM, choices, width: 1280, size: [1280, 900] };
const quiet = L.js(`(() => { document.querySelectorAll('.ui-toast, [data-testid^="toast"]').forEach((e) => e.remove()); })()`);

module.exports = [
  { name: 'bar-on', ...base, steps: [L.template('bouncing-ball'), L.wait(800), ...settle, { shot: '@', crop: BAR }] },
  { name: 'bar-tucked', ...base, steps: [L.template('bouncing-ball'), L.wait(800), tuck, L.wait(900), quiet, ...settle, { shot: '@', crop: BAR }] },
  {
    name: 'view-tucked',
    ...base,
    steps: [
      L.template('bouncing-ball'), L.wait(800), tuck, L.wait(900), quiet, ...settle,
      { clickOn: '[data-top]', text: 'View', after: 700 },
      { clickOn: '.ui-menu-item', text: 'Sharing your screen', hover: true, after: 700 },
      { shot: '@', crop: [0, 0, 1000, 900] },
    ],
  },
  {
    name: 'menu-before',
    ...base,
    steps: [
      L.template('bouncing-ball'), L.wait(800), tuck, L.wait(900), quiet, ...settle,
      { clickOn: '[data-top]', text: 'Streaming', after: 700 },
      { shot: '@', crop: [0, 0, 1000, 900] },
    ],
  },
  { name: 'tab-before', ...base, steps: [L.template('bouncing-ball'), L.wait(600), L.js(`__frameling.overlays.openPrefs('features')`), L.wait(900), ...settle, { shot: '@', el: '.ui-prefs', pad: 0 }] },
  { name: 'tab-after', ...base, steps: [L.template('bouncing-ball'), L.wait(600), L.js(`__frameling.overlays.openPrefs('streaming')`), L.wait(900), ...settle, { shot: '@', el: '.ui-prefs', pad: 0 }] },
  { name: 'tab-tucked', ...base, steps: [L.template('bouncing-ball'), L.wait(600), tuck, L.wait(600), L.js(`__frameling.overlays.openPrefs('streaming')`), L.wait(900), ...settle, { shot: '@', el: '.ui-prefs', pad: 0 }] },
];

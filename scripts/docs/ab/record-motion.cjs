// A/B clips for Record a move: the same drag, kept as a key on every frame (raw) and kept tidy (Detail at its usual half).
// Run: SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab --only a-raw,b-tidied --out brand/ab/record-motion
const L = require('../help/_lib.cjs');

const detail = (v) => L.js(`(() => { const i = document.querySelector('.sy-recbar-detail input'); if (!i) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '${v}'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

/** Draw a ball, pick Record a move, and drag a wavy swoop that slows at the top (the same in both). */
const perform = [
  L.template('blank-vector'),
  L.cmd('view.fit'),
  L.js(`__frameling.store().setUi({ tool: 'ellipse', fillColor: '#ff6f91' })`),
  L.wait(400),
  { drag: [[300, 330], [380, 410]], steps: 8, delay: 12, after: 300 },
  L.js(`__frameling.store().setUi({ tool: 'select' })`),
  L.wait(500),
  L.cmd('tween.recordMove'),
  L.wait(400),
];
const swoop = { drag: [[340, 370], [400, 250], [470, 170], [560, 150], [640, 230], [690, 330], [760, 350], [800, 280]], steps: 9, delay: 45, pause: [[3, 300]], after: 1200 };
const clip = (fn) => [{ rec: '@', crop: [142, 46, 740, 652], every: 80 }, ...fn, { rec: 'stop' }];

module.exports = [
  {
    name: 'a-raw',
    steps: [...perform, ...clip([L.wait(500), swoop, detail(1), L.wait(1400), { clickOn: '.sy-recbar button', text: 'Play', after: 3600 }])],
  },
  {
    name: 'b-tidied',
    steps: [...perform, ...clip([L.wait(500), swoop, detail(0.5), L.wait(1400), { clickOn: '.sy-recbar button', text: 'Play', after: 3600 }])],
  },
].map((e) => ({ ...e, prefs: { firstDrawn: true, showTips: false, showQuill: false }, choices: { 'record.room': 'replace' } }));

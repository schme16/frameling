// Help clip for Record a move: a ball drawn, Record a move picked from the menu, a swoop dragged with a pause in it, and
// the bar that appears (Detail slid from tidy to close and back) before Play shows it moving. Window 1280 x 800.
const L = require('./_lib.cjs');

/** The Detail slider on the bar, set the way a hand would (React watches the input event). */
const detail = (v) => L.js(`(() => { const i = document.querySelector('.sy-recbar-detail input'); if (!i) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '${v}'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

module.exports = [
  {
    name: 'record-motion',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    choices: { 'record.room': 'replace' },
    steps: [
      L.template('blank-vector'),
      L.cmd('view.fit'),
      L.js(`__frameling.store().setUi({ tool: 'ellipse', fillColor: '#ff6f91' })`),
      L.wait(400),
      { drag: [[300, 330], [380, 410]], steps: 8, delay: 12, after: 300 },
      L.js(`__frameling.store().setUi({ tool: 'select' })`),
      L.wait(600),
      { rec: '@', crop: [0, 0, 1280, 800], every: 80 },
      L.wait(700),
      { clickOn: '.ui-menubar [role=menuitem]', text: 'Frames and motion', after: 900 },
      { clickOn: '[role=menu] [role=menuitem]', text: 'In-betweens and easing', hover: true, after: 900 },
      { clickOn: '[role=menu] [role=menuitem]', text: 'Record a move', hover: true, after: 900 },
      { clickOn: '[role=menu] [role=menuitem]', text: 'Record a move', after: 800 },
      { drag: [[340, 370], [430, 220], [540, 150], [620, 260], [700, 380], [790, 300]], steps: 9, delay: 45, pause: [[3, 450]], after: 1300 },
      detail(0.9), L.wait(1300),
      detail(0.2), L.wait(1300),
      detail(0.5), L.wait(900),
      { clickOn: '.sy-recbar button', text: 'Play', after: 3400 },
      { rec: 'stop' },
    ],
  },
];

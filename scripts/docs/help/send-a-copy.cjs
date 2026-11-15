// Help clip for Send a copy: a few strokes drawn, File > Send a copy... picked, the undo history question answered with
// the real sizes showing, then the toast that says where the copy went. Window 1280 x 800. The runner's pretend desktop
// answers the save (see mockMain in ../steps.cjs), so nothing is written.
const L = require('./_lib.cjs');

module.exports = [
  {
    name: 'send-a-copy',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    steps: [
      L.template('blank-vector'),
      L.cmd('view.fit'),
      L.js(`__frameling.store().setUi({ tool: 'brush', color: '#5b4bd6', brush: { ...__frameling.store().get().ui.brush, size: 18 } })`),
      L.wait(500),
      { drag: [[240, 330], [330, 200], [440, 170], [540, 260], [600, 360]], steps: 8, delay: 25, after: 400 },
      L.js(`__frameling.store().setUi({ color: '#e0528b' })`),
      { drag: [[300, 380], [420, 300], [560, 340], [680, 260], [760, 300]], steps: 8, delay: 25, after: 400 },
      L.js(`__frameling.store().setUi({ color: '#2f9e6a' })`),
      { drag: [[200, 440], [380, 420], [560, 450], [760, 430]], steps: 8, delay: 25, after: 800 },
      { rec: '@', crop: [0, 0, 1280, 800], every: 80 },
      L.wait(600),
      { clickOn: '.ui-menubar [role=menuitem]', text: 'File', after: 700 },
      { clickOn: '[role=menu] [role^=menuitem]', text: 'Send a copy...', hover: true, after: 1000 },
      { clickOn: '[role=menu] [role^=menuitem]', text: 'Send a copy...', after: 1800 },
      { clickOn: '.ui-choice-opt', text: 'Just the drawing', hover: true, after: 1400 },
      { clickOn: '.ui-choice-opt', text: 'Send my undo history too', hover: true, after: 1400 },
      { clickOn: '.ui-choice-opt', text: 'Just the drawing', after: 900 },
      { clickOn: '.ui-choice-foot .ui-btn-primary', after: 1800 },
      L.wait(2500),
      { rec: 'stop' },
    ],
  },
];

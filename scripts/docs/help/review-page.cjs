// Help clip for Send for review and Bring in comments: a drawing with two notes, File > Send for review... picked (the
// question about your own notes answered, then the message with the size), then File > Bring in comments... picked and
// Anna's note, answer, circle and tick arriving with her name on them. Window 1280 x 800. The runner's pretend desktop
// answers the save and the open (see mockMain in ../steps.cjs), so nothing is written.
const L = require('./_lib.cjs');
const { SETUP } = require('../review-demo.cjs');
const UI = (o) => ({ eval: `__frameling.store().setUi(${JSON.stringify(o)})` });
const away = { move: [720, 28] };

module.exports = [
  {
    name: 'review-page',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    width: 1000,
    steps: [
      L.template('blank-vector'),
      L.js(SETUP),
      UI({ zoom: 0.5, panX: 62, panY: 42 }),
      L.wait(900),
      away,
      { rec: '@', crop: [0, 0, 1280, 800], every: 80 },
      L.wait(900),
      { clickOn: '.ui-menubar [role=menuitem]', text: 'File', after: 700 },
      { clickOn: '[role=menu] [role^=menuitem]', text: 'Send for review...', hover: true, after: 900 },
      { clickOn: '[role=menu] [role^=menuitem]', text: 'Send for review...', after: 1800 },
      { clickOn: '.ui-choice-opt', text: 'Show them', hover: true, after: 1200 },
      { clickOn: '.ui-choice-foot .ui-btn-primary', after: 3200 },
      L.wait(1200),
      { clickOn: '.ui-menubar [role=menuitem]', text: 'File', after: 700 },
      { clickOn: '[role=menu] [role^=menuitem]', text: 'Bring in comments...', hover: true, after: 900 },
      { clickOn: '[role=menu] [role^=menuitem]', text: 'Bring in comments...', after: 2600 },
      L.wait(2400),
      // Open the note Anna answered, to see her name and the time on it.
      L.js(`__framelingNotes.open('n-mouth')`),
      L.wait(3200),
      { rec: 'stop' },
    ],
  },
];

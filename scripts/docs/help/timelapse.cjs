// Help clip for the timelapse: a drawing opened, Record a timelapse picked from File > Export, a few strokes drawn with the
// red badge showing, Stop pressed on the badge, then Make the video from the toast and the length picked. Window 1280 x 800.
const L = require('./_lib.cjs');

module.exports = [
  {
    name: 'timelapse',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    steps: [
      L.template('blank-vector'),
      L.cmd('view.fit'),
      L.js(`__frameling.store().setUi({ tool: 'brush', color: '#5b4bd6', brush: { ...__frameling.store().get().ui.brush, size: 18 } })`),
      L.wait(500),
      { rec: '@', crop: [0, 0, 1280, 800], every: 80 },
      L.wait(600),
      { clickOn: '.ui-menubar [role=menuitem]', text: 'File', after: 700 },
      { clickOn: '[role=menu] [role=menuitem]', text: 'Export', hover: true, after: 800 },
      { clickOn: '[role=menu] [role^=menuitem]', text: 'Record a timelapse', hover: true, after: 800 },
      { clickOn: '[role=menu] [role^=menuitem]', text: 'Record a timelapse', after: 1200 },
      { drag: [[240, 330], [330, 200], [440, 170], [540, 260], [600, 360]], steps: 8, delay: 25, after: 900 },
      L.js(`__frameling.store().setUi({ color: '#e0528b' })`),
      { drag: [[300, 380], [420, 300], [560, 340], [680, 260], [760, 300]], steps: 8, delay: 25, after: 900 },
      L.js(`__frameling.store().setUi({ color: '#2f9e6a' })`),
      { drag: [[200, 440], [380, 420], [560, 450], [760, 430]], steps: 8, delay: 25, after: 1500 },
      { clickOn: '.tl-badge button', text: 'Stop', after: 1300 },
      { clickOn: '.ui-toast-action', text: 'Make the video', after: 1200 },
      { clickOn: '.tl-opt', text: 'About 20 seconds', after: 1500 },
      L.wait(1500),
      { rec: 'stop' },
    ],
  },
];

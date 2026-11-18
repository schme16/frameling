// The help clip for the buttons with more tools behind them: click the Brush button, press and hold it, pick the Airbrush from the
// pull-out, then press Shift+F and watch the button change to the Soft brush. A pixel layer, so every tool in the pull-out is live.
const { js, wait } = require('./_lib.cjs');

const rail = [0, 40, 440, 560];

module.exports = [
  {
    name: 'tool-pullouts',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    size: [1280, 800],
    width: 640,
    poster: 42,
    steps: [
      js(`__frameling.template('blank-pixel')`), wait(700), js(`__frameling.run('tools.pencil')`), { move: [900, 60] }, wait(500),
      { rec: '@', crop: rail, every: 80 }, wait(500),
      // A plain click picks the tool the button shows.
      { clickOn: '.ui-tool.is-stack[data-stack="brush"]', after: 900 },
      // Press and hold: the pull-out, each tool with its key.
      { holdOn: '.ui-tool.is-stack[data-stack="brush"]', hold: 700, after: 500 },
      { clickOn: '.ui-tool-fly-item', text: 'Soft brush', hover: true, pause: 300, after: 1500 },
      { clickOn: '.ui-tool-fly-item', text: 'Airbrush', pause: 500, after: 1300 },
      // A key press changes the button to its tool.
      { move: [900, 60] }, wait(500),
      { key: 'F', mods: ['shift'] }, wait(1700),
      { move: [900, 60] }, wait(400), { rec: 'stop' },
    ],
  },
];

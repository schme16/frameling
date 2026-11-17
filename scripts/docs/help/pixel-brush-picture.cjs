// The help picture for the picture tip editor: the Pixel workspace with the editor open on a soft flower, the real brush beside
// it. (The editor, strokes with each kind of tip and the options are in scripts/docs/ab-pixel-picture.)
const P = require('../ab-pixel-picture/_pics.cjs');
const { L, start, away } = P;

module.exports = [
  {
    name: 'pixel-brush-picture',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160),
      L.js(`__framelingDab.editor(${JSON.stringify(P.flower())})`), L.wait(700), away, L.wait(600),
      { shot: '@', el: '.io-modal', pad: 10 },
    ],
  },
];

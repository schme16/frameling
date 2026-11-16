// Help picture for bringing in brush files: the list that opens when you pick a Photoshop set, with what came in whole
// and what did not. The set is made up (scripts/docs/help/_brushset.cjs). See help-media.cjs for the entry format.
const { js, wait } = require('./_lib.cjs');
const { madeUpSet } = require('./_brushset.cjs');

const F = '__frameling';
const b64 = Buffer.from(madeUpSet()).toString('base64');

module.exports = [
  {
    name: 'brush-import',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    size: [1280, 900],
    steps: [
      js(`${F}.dock.applyWorkspace('pixel')`),
      wait(600),
      js(`__brushImport.show(${JSON.stringify(b64)}, 'Garden brushes.abr')`),
      wait(1200),
      { move: [20, 880] },
      { shot: '@', el: '.io-modal', pad: 12 },
    ],
  },
];

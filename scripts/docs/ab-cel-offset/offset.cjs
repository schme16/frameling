// Looks for the cel offset work (run with `npm run help:media -- --entries scripts/docs/ab-cel-offset --out <dir>`, once per theme).
//  bob-before: a bob as six drawings, one drawn again for every position.
//  bob-after:  the same bob as one drawing, moved on each key (a small corner mark on each moved key).
//  sheet-canvas: what the canvas shows for a document with a fading folder and a multiply folder (the truth the sheet is judged against).
const L = require('../help/_lib.cjs');
const { pixelMushroom } = require('../help/_convert-art.cjs');
const { foldersInPage, bobDoc } = require('./_docs.cjs');

const bob = (name, moved) => ({
  name,
  size: [1280, 900],
  steps: [L.template('blank-pixel'), pixelMushroom, L.js(`__frameling.dock.applyWorkspace('animate')`), L.wait(1200), bobDoc(moved), L.wait(1200), { click: [728, 811], after: 600 }, { move: [640, 20] }, L.wait(400), { shot: '@', crop: [144, 48, 736, 816] }],
});

module.exports = [
  bob('bob-before', false),
  bob('bob-after', true),
  {
    name: 'sheet-canvas',
    size: [1280, 900],
    steps: [L.template('blank-pixel'), foldersInPage, L.js(`__frameling.run('view.fit')`), L.wait(1200), { click: [728, 811], after: 600 }, { move: [640, 20] }, L.wait(400), { shot: '@', crop: [326, 101, 371, 371] }],
  },
];

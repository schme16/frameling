// The help picture for Paper: the Pixel workspace with chalk and charcoal picked, the Paper box in the options on Rough
// (the paper it says is the sheet's), and a ball shaded with charcoal on that paper.
const { ball } = require('../ab-charcoal/_draw.cjs');
const L = require('./_lib.cjs');

const toGroup = L.js(`document.querySelector('[data-testid="paper-group"]')?.scrollIntoView({ block: 'center' })`);

module.exports = [
  {
    name: 'paper',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    steps: [L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...ball('compressed-charcoal', 'rough', { size: 10 }), toGroup, L.wait(6800), { shot: '@' }],
  },
];

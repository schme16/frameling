// The help picture for Chalk and charcoal: the Pixel workspace with the tool picked, its options open (the media, the papers)
// and a ball shaded with compressed charcoal. (Every medium, and the test marks, are in scripts/docs/ab-charcoal.)
const { ball } = require('../ab-charcoal/_draw.cjs');
const L = require('./_lib.cjs');

module.exports = [
  {
    name: 'chalk-charcoal',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    steps: [L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...ball('compressed-charcoal', 'medium', { size: 10 }), L.wait(6800), { shot: '@' }],
  },
];

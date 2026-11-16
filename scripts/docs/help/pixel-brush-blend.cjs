// The help picture for paint modes: four colour blocks and five strokes of the same pink across them, from the top: paint over it,
// multiply, screen, overlay, colour only, with the Colour changes fold open. (Before and after are in scripts/docs/ab-brush-engine2.)
const B = require('../ab-brush-engine2/_blend.cjs');
const { L } = B;
const open = (name) => L.js(`(() => { const b = document.querySelector('[data-fold="${name}"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);

module.exports = [
  {
    name: 'pixel-brush-blend',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...B.scene(B.MODES),
      open('pixel-brush-colour'), L.wait(300), L.js(`document.querySelector('[data-fold="pixel-brush-colour"]')?.scrollIntoView({ block: 'start' })`), L.wait(400), B.away, L.wait(5000), { shot: '@' },
    ],
  },
];

// Where the new controls sit in the pixel brush options: the picture tip buttons, and the Paper box and the Dual tip fold with a
// picture in each, cropped to the options panel.
const P = require('./_pics.cjs');
const { L, start } = P;
const open = (name) => L.js(`(() => { const b = document.querySelector('[data-fold="${name}"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
const crop = (sel) => L.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const panel = el.closest('.ui-panel') || el.closest('[role="tabpanel"]') || el.closest('.cv-options')?.parentElement || el.parentElement; panel.classList.add('shotme'); el.scrollIntoView({ block: 'center' }); })()`);
module.exports = [
  {
    name: 'options-tip',
    prefs: { firstDrawn: true, showTips: false },
    width: 900,
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160),
      P.dabSet({ tip: 'picture', picture: P.flower(), size: 13, spacing: 1.4 }), L.wait(400),
      crop('[data-testid="dab-picture"]'), L.wait(300),
      { shot: '@', el: '.shotme', pad: 6 },
    ],
  },
  {
    name: 'options-texture',
    prefs: { firstDrawn: true, showTips: false },
    width: 900,
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160),
      P.run(`__framelingDab.set({ grain: { depth: 0.9, scale: 1, moving: false }, dual: { tip: 'round', size: 3, density: 0.5, cut: false } }); await __framelingDab.grainFromBytes(await ${P.WEAVE}); await __framelingDab.dualFromBytes(await ${P.LEAVES});`),
      open('pixel-brush-texture'), L.wait(500),
      crop('[data-testid="paper-group"]'), L.wait(300),
      { shot: '@', el: '.shotme', pad: 6 },
    ],
  },
];

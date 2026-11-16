// The help clip for the Blur and Sharpen brushes: bars and a ring with hard edges, the blur brush softening the left half, then the
// sharpen brush bringing the snap back to some of it. (The before and after are in scripts/docs/ab-clone-curves.)
const S = require('../ab-clone-curves/_scene.cjs');
const { L, paint, start, draw, retouch, pick, away, line } = S;

const arc = (a0, a1, n = 30) => Array.from({ length: n }, (_, i) => { const a = a0 + ((a1 - a0) * i) / (n - 1); return [Math.round(92 + 24 * Math.cos(a)), Math.round(48 + 24 * Math.sin(a)), 0.5]; });
const edges = [[22, 12, 22, 84], [30, 84, 30, 12], [38, 12, 38, 84], [46, 84, 46, 12]];

module.exports = [
  {
    name: 'blur-sharpen-brush',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    width: 800,
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(128),
      paint({ scene: 'shapes' }), L.wait(300),
      { rec: '@', every: 80 }, L.wait(800),
      retouch('blur', { amount: 0.45, brush: { size: 17, hardness: 0.5, spacing: 0.12 } }), pick('blur-brush'), L.wait(600),
      ...edges.map(([a, b, c, d]) => draw(line(a, b, c, d, 22), { delay: 40 })),
      draw(arc(Math.PI / 2, (3 * Math.PI) / 2, 30), { delay: 40 }), draw(arc((3 * Math.PI) / 2, Math.PI / 2, 30), { delay: 40 }),
      L.wait(600),
      retouch('sharpen', { amount: 0.9, brush: { size: 14, hardness: 0.5, spacing: 0.12 } }), pick('sharpen-brush'), L.wait(600),
      draw(line(30, 14, 30, 82, 24), { delay: 40 }), draw(line(38, 82, 38, 14, 24), { delay: 40 }), draw(arc(Math.PI / 2, Math.PI, 20), { delay: 40 }),
      away, L.wait(1000), { rec: 'stop' },
    ],
  },
];

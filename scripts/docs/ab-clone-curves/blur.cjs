// A softened edge against a hard one: bars and a ring with hard edges, the blur brush drawn over the left half of them (so one picture
// holds both), and a clip of the blur brush and then the sharpen brush at work. `--entries scripts/docs/ab-clone-curves --out <dir>`.
const { L, paint, start, draw, retouch, pick, away, line } = require('./_scene.cjs');

const PREFS = { firstDrawn: true, showTips: false, showQuill: false };
const shot = { shot: '@', el: '.cv-root', pad: 0 };
const scene = () => [...start(128), paint({ scene: 'shapes' }), L.wait(300)];

// Down the edges of the bars on the left and round the left half of the ring, two passes each.
const arc = (a0, a1, n = 30) => Array.from({ length: n }, (_, i) => { const a = a0 + ((a1 - a0) * i) / (n - 1); return [Math.round(92 + 24 * Math.cos(a)), Math.round(48 + 24 * Math.sin(a)), 0.5]; });
const edges = [[22, 12, 22, 84], [30, 84, 30, 12], [38, 12, 38, 84], [46, 84, 46, 12]];
const blurAll = (delay) => [
  retouch('blur', { amount: 0.45, brush: { size: 17, hardness: 0.5, spacing: 0.12 } }),
  pick('blur-brush'),
  ...edges.map(([a, b, c, d]) => draw(line(a, b, c, d, 22), { delay })),
  draw(arc(Math.PI / 2, (3 * Math.PI) / 2, 30), { delay }),
  draw(arc((3 * Math.PI) / 2, Math.PI / 2, 30), { delay }),
];

module.exports = [
  { name: 'blur-before', prefs: PREFS, width: 640, steps: [...scene(), away, L.wait(300), shot] },
  { name: 'blur-after', prefs: PREFS, width: 640, steps: [...scene(), ...blurAll(6), away, L.wait(400), shot] },
  {
    name: 'blur-clip',
    prefs: PREFS,
    width: 640,
    steps: [
      ...scene(), { rec: '@', el: '.cv-root', pad: 0, every: 70 }, L.wait(700),
      ...blurAll(40), L.wait(500),
      // Then the sharpen brush over two of the softened edges, and the ring's lower half, to bring the snap back.
      retouch('sharpen', { amount: 0.9, brush: { size: 14, hardness: 0.5, spacing: 0.12 } }), pick('sharpen-brush'),
      draw(line(30, 14, 30, 82, 24), { delay: 40 }), draw(line(38, 82, 38, 14, 24), { delay: 40 }), draw(arc(Math.PI / 2, Math.PI, 20), { delay: 40 }),
      away, L.wait(900), { rec: 'stop' },
    ],
  },
];

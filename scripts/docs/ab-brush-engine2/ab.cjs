// The before and after pictures for the second brush engine round, one scene each: pen curves (four pressure ramps, straight against
// four feels), paint modes (five strokes across four colour blocks, all paint-over against five modes) and wet paint that crosses
// its own line (shot once on an older build with --renderer, and once on this one). `--entries scripts/docs/ab-brush-engine2 --out <raw>`,
// then crop.py puts each before beside its after.
const B = require('./_blend.cjs');
const C = require('./_curves.cjs');
const { L } = C;
const F = '__frameling';

const PREFS = { firstDrawn: true, showTips: false, showQuill: false };
const shot = { shot: '@', el: '.cv-root', pad: 0 };
const WIDTH = 640;

const FEELS = {
  even: undefined,
  light: [[0, 0], [0.25, 0.5], [0.6, 0.85], [1, 1]],
  firm: [[0, 0], [0.4, 0.15], [0.75, 0.5], [1, 1]],
  own: [[0, 0], [0.5, 0.92], [1, 1]],
};
const rowBrush = (curve) => C.whole({ ...C.BRUSH, dynamics: [{ from: 'pressure', to: 'size', amount: 0.95, invert: false, ...(curve ? { curve } : {}) }] });
const curveRows = (feels) => [...C.start(160), C.fill, ...feels.flatMap((f, i) => [rowBrush(FEELS[f]), C.draw(C.ramp(24 + i * 38), C.pen)]), C.away, L.wait(400)];

// The loop: it starts as the Fill colour (blue) and runs out into the colour picked (red), then comes back across its own early line.
const wetLoop = () => {
  const seg = (a, b, n) => Array.from({ length: n }, (_, k) => [Math.round(a[0] + (b[0] - a[0]) * (k / n)), Math.round(a[1] + (b[1] - a[1]) * (k / n)), 0.5]);
  const pts = [...seg([14, 24], [140, 24], 30), ...seg([140, 24], [140, 84], 12), ...seg([140, 84], [34, 84], 26), ...seg([34, 84], [34, 6], 20), [34, 6, 0.5]];
  return [
    ...C.start(160),
    L.js(`${F}.store().setUi({ color: '#d93a3a', fillColor: '#2f5fe8' })`),
    C.whole({ size: 16, spacing: 0.12, hardness: 1, aliased: false, wet: 0.85, dynamics: [{ from: 'fade', to: 'mix', amount: 1, invert: false }], fadeLength: 75 }),
    C.draw(pts, { delay: 12 }), C.away, L.wait(400),
  ];
};

module.exports = [
  { name: 'curves-before', prefs: PREFS, width: WIDTH, steps: [...curveRows(['even', 'even', 'even', 'even']), shot] },
  { name: 'curves-after', prefs: PREFS, width: WIDTH, steps: [...curveRows(['even', 'light', 'firm', 'own']), shot] },
  { name: 'blend-before', prefs: PREFS, width: WIDTH, steps: [...B.scene(['normal', 'normal', 'normal', 'normal', 'normal']), B.away, L.wait(400), shot] },
  { name: 'blend-after', prefs: PREFS, width: WIDTH, steps: [...B.scene(B.MODES), B.away, L.wait(400), shot] },
  { name: 'wet-loop', prefs: PREFS, width: WIDTH, steps: [...wetLoop(), shot] },
];

// Help pictures and clips for combining shapes, line styles and hold to tidy, once per theme: see scripts/docs/help-media.cjs.
const { T, UI, dom, away, view, at, INK, rect, ell, line, pathOf, label, stroke, put, run, tool, draw, along, REC, STOP, WARM, wobbler } = require('./_shapes.cjs');

const CANVAS = [113, 47, 764, 444];
const RED = '#e0685e';
const BLUE = '#4a7cf0';

/** Two overlapping shapes: a round one underneath, a boxy one in front, each with its own colour and outline. */
const pair = (x, y) => [ell(x, y, 220, 220, RED, stroke(INK, 6)), rect(x + 110, y + 50, 220, 170, BLUE, stroke('#16356e', 6, { join: 'miter' }))];

const combineStep = (x, y, text, cmdId, words) => [
  put('Lines', pair(x, y), [0, 1]),
  run(cmdId),
  { wait: 300 },
  put('Lines', [label(x + 165, y + 275, words)], []),
];

module.exports = [
  // Four ways to make one shape from two: what you get, left to right and top to bottom.
  { name: 'combine-shapes', width: 1000, choices: { 'shapes.combineLook': 'bottom' }, steps: [T('blank-vector'), view(0.6),
    ...combineStep(120, 70, 'Join', 'shapes.join', 'Join'),
    ...combineStep(740, 70, 'Cut out', 'shapes.cut', 'Cut out'),
    ...combineStep(120, 380, 'Keep the overlap', 'shapes.overlap', 'Keep the overlap'),
    ...combineStep(740, 380, 'Punch a hole', 'shapes.punch', 'Punch a hole'),
    UI({ selection: [] }), { wait: 4800 }, away, { wait: 300 }, { shot: '@', crop: CANVAS }] },

  // Dashes, dots, arrow heads and a width that changes along the line: all outline styles, none of it a picture.
  { name: 'line-style', width: 1000, steps: [T('blank-vector'), view(0.6),
    put('Lines', [
      line(110, 90, 560, 90, stroke(INK, 8, { cap: 'butt', dash: [3, 2] })),
      line(110, 170, 560, 170, stroke(INK, 8, { cap: 'round', dash: [0.01, 2] })),
      line(110, 250, 560, 250, stroke(INK, 8, { cap: 'round', dash: [4, 2, 0.01, 2] })),
      line(110, 330, 560, 330, stroke(BLUE, 8, { arrowEnd: 'triangle', arrowSize: 4 })),
      line(110, 410, 560, 410, stroke(RED, 8, { arrowStart: 'dot', arrowEnd: 'open', arrowSize: 3.5 })),
      pathOf([{ x: 110, y: 520 }, { x: 560, y: 520, c1: { x: 250, y: 440 }, c2: { x: 420, y: 600 } }], stroke(INK, 26, { widths: [{ at: 0, w: 0.15 }, { at: 0.5, w: 1.3 }, { at: 1, w: 0.15 }] })),
      pathOf([{ x: 110, y: 640 }, { x: 560, y: 640 }], stroke('#2a9d8f', 22, { cap: 'round', widths: [{ at: 0, w: 1 }, { at: 1, w: 0.05 }] })),
      { ...ell(700, 90, 230, 230, null, stroke(INK, 8, { cap: 'round', dash: [0.01, 2.4] })) },
      { ...rect(700, 400, 360, 220, '#f7c95a', stroke(INK, 8, { cap: 'butt', join: 'miter', dash: [3, 2] })) },
      label(815, 350, 'Dotted ellipse', 24), label(880, 672, 'Dashed box', 24),
    ], []),
    { wait: 700 }, away, { wait: 300 }, { shot: '@', crop: CANVAS }] },

  // Draw a rough circle, box and line with the brush; hold the pen still at the end and each becomes a clean one.
  { name: 'hold-to-tidy', width: 800, choices: { 'draw.holdToTidy': 'on' }, steps: (() => {
    const w = wobbler(7);
    const brush = { size: 10, thinning: 0, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };
    const circ = along(60, (t) => [340 + 140 * Math.cos(t * Math.PI * 2.06 + 0.6) + w(4), 250 + 140 * Math.sin(t * Math.PI * 2.06 + 0.6) + w(4)]);
    const box = [[760, 140], [1010, 150], [1020, 300], [1005, 330], [770, 335], [750, 320], [760, 160]].map(([x, y]) => [x + w(3), y + w(3)]);
    const rough = along(40, (t) => [260 + t * 520, 560 + Math.sin(t * 9) * 5 + t * 12 + w(2)]);
    return [T('blank-vector'), view(0.6), UI({ color: '#7a5cff', brush }), tool('brush'), { wait: 700 }, away, WARM, REC(CANVAS, 70), { wait: 900 },
      draw(circ, { steps: 2, delay: 14, hold: 1400, pull: [470, 380], holdAfterPull: 700, after: 1800 }),
      draw(box, { steps: 5, delay: 16, hold: 1300, after: 1700 }),
      draw(rough, { steps: 2, delay: 14, hold: 1300, after: 2400 }),
      { wait: 600 }, STOP];
  })() },
];

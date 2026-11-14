// Before and after looks for combining shapes, and clips for hold to tidy.
// Run: SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab --only <names> --out brand/ab/shape-tools
// The line styles beside their exported files are made by scripts/ab/shape-tools-files.cjs (see brand/ab/shape-tools/note.md).
const { T, UI, dom, away, view, INK, rect, ell, line, label, stroke, put, run, tool, draw, along, REC, STOP, WARM, wobbler } = require('../help/_shapes.cjs');

const CANVAS = [113, 47, 764, 444];
const RED = '#e0685e';
const BLUE = '#4a7cf0';
const GREEN = '#3fae7a';
const GOLD = '#f7c95a';
const NAVY = '#16356e';

/** Round shape underneath (red, dark outline), boxy one in front (blue, navy outline): the colours show what survives. */
const pair = (x, y) => [ell(x, y, 220, 220, RED, stroke(INK, 7)), rect(x + 110, y + 50, 220, 170, BLUE, stroke(NAVY, 7, { join: 'miter' }))];

const before = (cmdId, words, note) => ({
  choices: { 'shapes.combineLook': 'bottom' },
  steps: [T('blank-vector'), view(0.6),
    put('Lines', pair(70, 150), []),
    put('Lines', pair(700, 150), [0, 1]),
    run(cmdId), { wait: 200 }, UI({ selection: [] }),
    put('Lines', [label(235, 70, 'Before', 30), label(865, 70, words, 30),
      label(235, 480, 'Round one red with a dark outline,', 22), label(235, 512, 'boxy one blue with a navy outline', 22),
      label(865, 480, note[0], 22), label(865, 512, note[1], 22)], []),
    { wait: 4800 }, away, { wait: 300 }, { shot: '@', crop: CANVAS }],
});

const clipBrush = { size: 10, thinning: 0, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };
const circle = (w, n, cx = 340, cy = 250, r = 140, turns = 2.06) => along(n, (t) => [cx + r * Math.cos(t * Math.PI * turns + 0.6) + w(4), cy + r * Math.sin(t * Math.PI * turns + 0.6) + w(4)]);

module.exports = [
  { name: 'boolean-join', ...before('shapes.join', 'After: Join', ['One shape, wearing the colours', 'and outline of the bottom one']) },
  { name: 'boolean-cut', ...before('shapes.cut', 'After: Cut out', ['The top one punched its outline out and', 'went. The bottom one keeps its colours']) },
  { name: 'boolean-overlap', ...before('shapes.overlap', 'After: Keep the overlap', ['Only where they crossed is left,', 'in the bottom one’s colours']) },
  { name: 'boolean-punch', ...before('shapes.punch', 'After: Punch a hole', ['Everything but where they crossed,', 'in the bottom one’s colours']) },

  // Cut out through three shapes: every one under the cutter keeps its own colour and outline.
  { name: 'boolean-cut-three', choices: { 'shapes.combineLook': 'bottom' }, steps: [T('blank-vector'), view(0.6),
    put('Lines', [rect(70, 160, 420, 90, RED, stroke(INK, 7, { join: 'miter' })), rect(70, 280, 420, 90, GOLD, stroke(INK, 7, { join: 'miter' })), rect(70, 400, 420, 90, GREEN, stroke(INK, 7, { join: 'miter' })), ell(240, 120, 150, 440, '#ffffff', stroke(NAVY, 7))], []),
    put('Lines', [rect(700, 160, 420, 90, RED, stroke(INK, 7, { join: 'miter' })), rect(700, 280, 420, 90, GOLD, stroke(INK, 7, { join: 'miter' })), rect(700, 400, 420, 90, GREEN, stroke(INK, 7, { join: 'miter' })), ell(870, 120, 150, 440, '#ffffff', stroke(NAVY, 7))], [0, 1, 2, 3]),
    run('shapes.cut'), { wait: 200 }, UI({ selection: [] }),
    put('Lines', [label(280, 45, 'Before: a white oval over three bars', 26), label(910, 45, 'After: Cut out', 30), label(910, 560, 'Each bar keeps its own colour and outline', 22), label(910, 592, 'The oval is gone', 22)], []),
    { wait: 4800 }, away, { wait: 300 }, { shot: '@', crop: CANVAS }] },

  // Join, remembering to keep the top shape's colours instead (Preferences > Behaviour > Colours when shapes are combined).
  { name: 'boolean-join-top-colours', choices: { 'shapes.combineLook': 'top' }, ...(() => {
    const b = before('shapes.join', 'After: Join (top colours)', ['The same two shapes, but it was set', 'to keep the top shape’s colours']);
    return { steps: b.steps };
  })() },

  // Hold at the end of a stroke: the clip that goes with the feature.
  { name: 'quickshape-snap', choices: { 'draw.holdToTidy': 'on' }, steps: (() => {
    const w = wobbler(7);
    const box = [[760, 140], [1010, 150], [1020, 300], [1005, 330], [770, 335], [750, 320], [760, 160]].map(([x, y]) => [x + w(3), y + w(3)]);
    const rough = along(40, (t) => [260 + t * 520, 560 + Math.sin(t * 9) * 5 + t * 12 + w(2)]);
    return [T('blank-vector'), view(0.6), UI({ color: '#7a5cff', brush: clipBrush }), tool('brush'), { wait: 700 }, away, WARM, REC(CANVAS, 50), { wait: 900 },
      draw(circle(w, 60), { steps: 2, delay: 14, hold: 1400, pull: [470, 380], holdAfterPull: 700, after: 1800 }),
      draw(box, { steps: 5, delay: 16, hold: 1300, after: 1700 }),
      draw(rough, { steps: 2, delay: 14, hold: 1300, after: 2400 }), { wait: 600 }, STOP];
  })() },

  // Drawing slowly on purpose, pausing to think, then lifting: nothing is tidied, however it looks. Also a squiggle held for a long time.
  { name: 'quickshape-slow', choices: { 'draw.holdToTidy': 'on' }, steps: (() => {
    const w = wobbler(11);
    const squig = along(50, (t) => [700 + t * 380, 300 + Math.sin(t * 14) * 70 + w(2)]);
    return [T('blank-vector'), view(0.6), UI({ color: '#7a5cff', brush: clipBrush }), tool('brush'), { wait: 700 }, away, WARM, REC(CANVAS, 50), { wait: 900 },
      // A careful circle: a point about every 10 screen pixels, 120 ms apart (80 pixels a second), with a 450 ms think half way round.
      draw(circle(w, 28), { steps: 1, delay: 140, pause: [[14, 450]], hold: 400, after: 1500 }),
      // A squiggle, then the pen held still on it for two full seconds: it is not any shape, so it stays.
      draw(squig, { steps: 2, delay: 14, hold: 2200, after: 1600 }), { wait: 600 }, STOP];
  })() },

  // Tidied, then Ctrl+Z: your own line comes back (one step), and a second Ctrl+Z removes it.
  { name: 'quickshape-undo', choices: { 'draw.holdToTidy': 'on' }, steps: (() => {
    const w = wobbler(7);
    return [T('blank-vector'), view(0.6), UI({ color: '#7a5cff', brush: clipBrush }), tool('brush'), { wait: 700 }, away, WARM, REC(CANVAS, 50), { wait: 900 },
      draw(circle(w, 60), { steps: 2, delay: 14, hold: 1300, after: 1500 }),
      { key: 'z', mods: ['control'], after: 1800 },
      { key: 'z', mods: ['control'], after: 1500 }, { wait: 500 }, STOP];
  })() },
];

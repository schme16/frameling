// The Transform tool's capture steps, shared by its help clip (scripts/docs/help/transform.cjs) and its before/after look
// (scripts/docs/ab/transform-tool.cjs): a pair of shapes, and a patch of pixels, each moved, stretched, squashed, slanted
// and turned with real mouse events through the real tool, then Enter and one undo to show it was one step.
const { js, wait, key } = require('./help/_lib.cjs');

const F = '__frameling';
const UI = (o) => js(`${F}.store().setUi(${JSON.stringify(o)})`);
const away = { move: [880, 780] };

// ---------------------------------------------------------------- the same five drags for any starting box
// A box is { x0, y0, x1, y1 } in window pixels. Every drag is worked out from the box as the one before left it, so
// the pointer always lands on the handle it means to. `k` shrinks the moves for a small canvas.
const drag = (pts, o = {}) => ({ drag: pts.map(([x, y]) => [Math.round(x), Math.round(y)]), steps: o.steps ?? 14, delay: o.delay ?? 16, ...(o.mods ? { mods: o.mods } : {}) });
const arc = (c, r, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos(a0 + ((a1 - a0) * i) / n), c[1] + r * Math.sin(a0 + ((a1 - a0) * i) / n)]);

function story(b, o = {}) {
  const { kx = 1, ky = 1, left = false } = o;
  const w0 = b.x1 - b.x0;
  const h0 = b.y1 - b.y0;
  const out = [];
  // Move: grab it off the middle (the middle is the pivot).
  const dx = (left ? -0.7 : 0.7) * w0 * kx;
  const dy = -0.15 * h0 * ky;
  out.push(drag([[b.x0 + w0 * 0.2, b.y0 + h0 * 0.25], [b.x0 + w0 * 0.2 + dx, b.y0 + h0 * 0.25 + dy]]));
  const m = { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy };
  // Stretch: the bottom right corner out.
  const sx = 0.35 * w0 * kx;
  const sy = 0.55 * h0 * ky;
  out.push(drag([[m.x1, m.y1], [m.x1 + sx, m.y1 + sy]]));
  const s = { ...m, x1: m.x1 + sx, y1: m.y1 + sy };
  // Squash: the top side down.
  const cx = (s.x0 + s.x1) / 2;
  const qy = 0.22 * (s.y1 - s.y0);
  out.push(drag([[cx, s.y0], [cx, s.y0 + qy]]));
  const q = { ...s, y0: s.y0 + qy };
  // Slant: hold Ctrl and slide the top side along itself. The bottom side stays.
  const slide = 0.2 * (q.x1 - q.x0);
  out.push(drag([[cx, q.y0], [cx + slide, q.y0]], { mods: ['control'] }));
  // Where the box's middle and turn knob are now: the shear keeps the bottom put and moves the top by `slide`.
  const h = q.y1 - q.y0;
  const pivot = [cx + slide / 2, (q.y0 + q.y1) / 2];
  const top = [cx + slide, q.y0];
  const dirx = top[0] - pivot[0];
  const diry = top[1] - pivot[1];
  const len = Math.hypot(dirx, diry);
  const knob = [top[0] + (dirx / len) * 28, top[1] + (diry / len) * 28];
  const r = Math.hypot(knob[0] - pivot[0], knob[1] - pivot[1]);
  const a0 = Math.atan2(knob[1] - pivot[1], knob[0] - pivot[0]);
  out.push(drag(arc(pivot, r, a0, a0 + (28 * Math.PI) / 180, 10), { steps: 4 }));
  void h;
  return out;
}

// ---------------------------------------------------------------- shapes
const INK = '#1d1b26';
const path = (x, y, w, h) => ({ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const KAPPA = 0.5522847498307936;
const ell = (x, y, w, h) => {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = KAPPA * rx, ky = KAPPA * ry;
  return { closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] };
};
const shape = (id, paths, fill) => ({ id, type: 'path', paths, fill, stroke: { color: INK, width: 4, join: 'round', cap: 'round' }, opacity: 1 });
const SHAPES = [shape('t1', [path(480, 290, 160, 100)], '#9b7bff'), shape('t2', [ell(525, 312, 56, 56)], '#f4c04f')];
const put = js(`(() => { const S = ${F}.store(); const shapes = ${JSON.stringify(SHAPES)}; S.update('setup', (d) => { const l = d.layers[d.layers.length - 1]; d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); const l = S.get().doc.layers[S.get().doc.layers.length - 1]; S.setUi({ activeLayerId: l.id, selection: ['t1', 't2'] }); })()`);
// The stage point (cx, cy) in the middle of the canvas viewport (764 x 444 at 113, 47).
const Z = 1.3;
const view = (z, cx, cy) => UI({ zoom: z, panX: 382 - cx * z, panY: 222 - cy * z });
const onScreen = (x, y) => [495 + (x - 640) * Z, 269 + (y - 360) * Z];
const [sx0, sy0] = onScreen(480, 290);
const [sx1, sy1] = onScreen(640, 390);
const shapeBox = { x0: sx0, y0: sy0, x1: sx1, y1: sy1 };

// ---------------------------------------------------------------- pixels (the hero sprites, the same box Pip clip picks)
const cell = 8;
const ox = 403 + (526 - 32 * cell) / 2;
const oy = 96 + (395 - 32 * cell) / 2;
const at = (x, y) => [Math.round(ox + (x + 0.5) * cell), Math.round(oy + (y + 0.5) * cell)];
const pixelBox = { x0: ox + 8 * cell, y0: oy + 14 * cell, x1: ox + 25 * cell, y1: oy + 23 * cell };


/** The shapes: blank page, two shapes picked, the Transform tool, the five drags, Enter, one undo. */
const shapeSteps = (rec) => [
  js(`${F}.template('blank-vector')`),
  wait(600),
  view(Z, 640, 360),
  put,
  js(`${F}.run('tools.transform')`),
  wait(600),
  away,
  rec,
  wait(1100),
  ...story(shapeBox).flatMap((d) => [d, wait(600)]),
  key('Enter'),
  wait(1300),
  key('z', ['control']),
  wait(1700),
  { rec: 'stop' },
];

/** The pixels: the hero sprites, Pip picked with the box select, then Transform and the same five drags. */
const pixelSteps = (rec) => {
  const sel = [at(8, 14), at(24, 22)];
  return [
    js(`${F}.dock.applyWorkspace('pixel')`),
    wait(500),
    js(`${F}.template('hero-sprites')`),
    wait(600),
    key('v'),
    { click: [1232, 76] },
    wait(600),
    js(`${F}.run('view.zoom100')`),
    js(`${F}.run('view.center')`),
    wait(500),
    away,
    rec,
    wait(1000),
    { drag: sel, steps: 10, delay: 40 },
    wait(900),
    js(`${F}.run('tools.transform')`),
    wait(700),
    ...story(pixelBox, { kx: 0.4, ky: 0.8, left: true }).flatMap((d) => [d, wait(600)]),
    key('Enter'),
    wait(1300),
    key('z', ['control']),
    wait(1700),
    { rec: 'stop' },
  ];
};

module.exports = { shapeSteps, pixelSteps, SHAPE_CROP: [113, 47, 764, 444], PIXEL_CROP: [403, 47, 526, 444] };

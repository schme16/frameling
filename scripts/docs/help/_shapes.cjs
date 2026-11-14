// Helpers shared by the entries for combining shapes, line styles and hold to tidy (help topics and the before/after looks).
// Window coordinates: the canvas viewport is 764 x 444 at (113, 47); view(z, cx, cy) puts stage point (cx, cy) at its middle.
const dom = (js) => ({ eval: js });
const UI = (o) => dom(`__frameling.store().setUi(${JSON.stringify(o)})`);
const T = (id) => dom(`__frameling.template(${JSON.stringify(id)})`);
const away = { move: [720, 28] };
let view_ = { z: 0.6, cx: 640, cy: 360 };
const view = (z = 0.6, cx = 640, cy = 360) => {
  view_ = { z, cx, cy };
  return UI({ zoom: z, panX: 382 - cx * z, panY: 222 - cy * z });
};
const at = (x, y) => [Math.round(495 + (x - view_.cx) * view_.z), Math.round(269 + (y - view_.cy) * view_.z)];
const INK = '#1d1b26';
const KAPPA = 0.5522847498307936;
let nid = 0;
const hid = (p = 'h') => `${p}${++nid}`;
const rectPath = (x, y, w, h) => ({ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const ellPath = (x, y, w, h) => {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = KAPPA * rx, ky = KAPPA * ry;
  return { closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] };
};
const stroke = (color, width, extra = {}) => ({ color, width, join: 'round', cap: 'round', ...extra });
const shapeOf = (paths, fill, st) => ({ id: hid(), type: 'path', paths, fill, stroke: st ?? null, opacity: 1 });
const rect = (x, y, w, h, fill, st) => shapeOf([rectPath(x, y, w, h)], fill, st);
const ell = (x, y, w, h, fill, st) => shapeOf([ellPath(x, y, w, h)], fill, st);
const line = (x1, y1, x2, y2, st) => shapeOf([{ closed: false, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] }], null, st);
/** An open path through points, with curves when a point has handles. */
const pathOf = (points, st) => shapeOf([{ closed: false, points }], null, st);
/** A word on the stage (a label under a picture). */
const label = (x, y, text, size = 26, color = '#2b2d42') => ({ id: hid('t'), type: 'text', text, font: 'Nunito', size, weight: 700, color, align: 'center', lineHeight: 1.2, letterSpacing: 0, opacity: 1, transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 } });
/** Puts shapes on a layer's first drawing (by layer name) and, with `sel`, selects the ones whose index is listed. */
const put = (layer, shapes, sel) => dom(`(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(shapes)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.name === ${JSON.stringify(layer)}); d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); const l = S.get().doc.layers.find((x) => x.name === ${JSON.stringify(layer)}); S.setUi({ activeLayerId: l.id, selection: ${JSON.stringify(sel ?? [])}.map((i) => shapes[i].id) }); })()`);
const run = (id) => dom(`__frameling.run(${JSON.stringify(id)})`);
const tool = (id) => run(`tools.${id}`);
const draw = (pts, o = {}) => ({ drag: pts.map(([x, y]) => at(x, y)), steps: o.steps ?? 12, delay: o.delay ?? 12, ...(o.mods ? { mods: o.mods } : {}), ...(o.hold ? { hold: o.hold } : {}), ...(o.pause ? { pause: o.pause } : {}), ...(o.pull ? { pull: at(...o.pull) } : {}), ...(o.holdAfterPull ? { holdAfterPull: o.holdAfterPull } : {}), ...(o.after ? { after: o.after } : {}) });
const along = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const PANEL = [113, 47, 1087, 444];
const REC = (crop, every = 80) => ({ rec: '@', crop, every });
const STOP = { rec: 'stop' };
/** A throwaway capture first: a hidden window can hand back a stale frame for the first one. */
const WARM = { shot: 'warm', crop: [0, 0, 32, 32] };
/** A tiny seeded wobble, so a hand-drawn shape is the same every time it is shot. */
const wobbler = (seed) => { let s = seed; return (a) => { s = (s * 1664525 + 1013904223) % 4294967296; return (s / 4294967296 - 0.5) * 2 * a; }; };

module.exports = { dom, UI, T, away, view, at, INK, hid, rect, ell, line, pathOf, label, stroke, put, run, tool, draw, along, PANEL, REC, STOP, WARM, wobbler, ellPath, rectPath };

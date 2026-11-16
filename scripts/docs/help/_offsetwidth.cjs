// Shared pieces for the offset path and width tool captures (help topics and the board looks).
const S = require('./_shapes.cjs');
const { dom, put, stroke, INK, shapeOf, hid, UI } = S;

/** A ghost: a dome with a zigzag hem, as a closed shape with curves. (x, y) is its top left, about 220 wide and 250 tall. */
const ghost = (x, y, fill = '#e4dbff', st = stroke(INK, 5, { join: 'round' })) =>
  shapeOf([{ closed: true, points: [
    { x, y: y + 235 },
    { x: x + 110, y, c1: { x, y: y + 95 }, c2: { x: x + 28, y } },
    { x: x + 220, y: y + 235, c1: { x: x + 192, y }, c2: { x: x + 220, y: y + 95 } },
    { x: x + 183, y: y + 205 },
    { x: x + 147, y: y + 240 },
    { x: x + 110, y: y + 205 },
    { x: x + 73, y: y + 240 },
    { x: x + 37, y: y + 205 },
  ] }], fill, st);

/** Two eyes on a ghost, as plain dots (not picked, so they stay put while the ghost is copied). */
const eyes = (x, y) => [
  { ...shapeOf([{ closed: true, points: [{ x: x + 70, y: y + 90 }, { x: x + 86, y: y + 90 }, { x: x + 86, y: y + 118 }, { x: x + 70, y: y + 118 }] }], INK, null) },
  { ...shapeOf([{ closed: true, points: [{ x: x + 134, y: y + 90 }, { x: x + 150, y: y + 90 }, { x: x + 150, y: y + 118 }, { x: x + 134, y: y + 118 }] }], INK, null) },
];

/** Drives the real Offset path card: which way, how far, which corners, then Make the copy. */
const offset = (dir, px, corners = 'round') => [
  { eval: '__frameling.run("offset.card")' },
  { wait: 350 },
  dom(`(() => { const bar = document.querySelector('.sl-bar'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const r = bar.querySelector('input[type=range]'); set.call(r, ${px}); r.dispatchEvent(new Event('input', { bubbles: true })); const btn = (t) => [...bar.querySelectorAll('button')].find((b) => b.textContent.trim() === t); btn(${JSON.stringify(dir === 'out' ? 'Bigger' : 'Smaller')}).click(); btn(${JSON.stringify(corners === 'round' ? 'Round' : 'Sharp')}).click(); })()`),
  { wait: 500 },
];
const makeCopy = [
  dom(`[...document.querySelectorAll('.sl-bar button')].find((b) => b.textContent.trim() === 'Make the copy').click()`),
  { wait: 400 },
];
/** Gives whatever is selected a new look (fill, outline), so the copy reads as a sticker edge or a cut line. */
const wear = (fill, st) => dom(`(() => { const S = __frameling.store(); const sel = S.get().ui.selection; S.update('recolour the copy', (d) => { for (const dr of Object.values(d.drawings)) for (const s of dr.shapes || []) if (sel.includes(s.id)) { s.fill = ${JSON.stringify(fill)}; s.stroke = ${JSON.stringify(st)}; delete s.fillGradient; } }); })()`);

/** A long S-shaped line, and a few points on it (u along the curve) with the stage normal there, for dragging its edge. */
const SX = { a: { x: 250, y: 440 }, b: { x: 1030, y: 300 }, c1: { x: 480, y: 250 }, c2: { x: 800, y: 540 } };
const bez = (u) => {
  const m = 1 - u;
  const w = [m * m * m, 3 * m * m * u, 3 * m * u * u, u * u * u];
  const P = [SX.a, SX.c1, SX.c2, SX.b];
  return { x: P.reduce((s, p, i) => s + p.x * w[i], 0), y: P.reduce((s, p, i) => s + p.y * w[i], 0) };
};
const bezNormal = (u) => {
  const a = bez(Math.max(0, u - 0.01)), b = bez(Math.min(1, u + 0.01));
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
  return { x: dy / l, y: -dx / l };
};
const sLine = (width, color) => shapeOf([{ closed: false, points: [{ ...SX.a }, { x: SX.b.x, y: SX.b.y, c1: { ...SX.c1 }, c2: { ...SX.c2 } }] }], null, stroke(color, width, { cap: 'round' }));
/** A drag that starts on the line at u and pulls its edge `out` stage pixels along the normal. */
const pull = (u, out) => {
  const p = bez(u), n = bezNormal(u);
  return [[p.x, p.y], [p.x + n.x * out * 0.35, p.y + n.y * out * 0.35], [p.x + n.x * out * 0.7, p.y + n.y * out * 0.7], [p.x + n.x * out, p.y + n.y * out]];
};

/** A drag that takes hold of the edge `from` stage pixels off the line at u and moves it to `to`. */
const edge = (u, from, to) => {
  const p = bez(u), n = bezNormal(u);
  return [0, 0.35, 0.7, 1].map((f) => { const d = from + (to - from) * f; return [p.x + n.x * d, p.y + n.y * d]; });
};

module.exports = { edge, ghost, eyes, offset, makeCopy, wear, sLine, pull, bez, UI, put, hid };

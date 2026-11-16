// Shared pieces for the Repeat captures (the help picture and the board looks): the same petal, tile and wing each time.
// Stage coordinates, 1280 x 720; a scene is built at a place and a size so three of them can sit side by side.
const S = require('./_shapes.cjs');
const { dom, put, stroke, INK, shapeOf, ellPath, rectPath, hid } = S;

const PINK = '#ff8fab';
const TEAL = '#4cc9b0';
const SUN = '#ffd23f';
const PLUM = '#9b7bff';

/** Maps a scene's own coordinates to the stage: `s` times bigger, moved to (ox, oy). */
const at = (s, ox, oy) => (x, y) => ({ x: ox + x * s, y: oy + y * s });
const mapPath = (p, f) => ({ closed: p.closed, points: p.points.map((q) => ({ ...f(q.x, q.y), ...(q.c1 ? { c1: f(q.c1.x, q.c1.y) } : {}), ...(q.c2 ? { c2: f(q.c2.x, q.c2.y) } : {}) })) });
const withRepeat = (shape, repeat, group) => ({ ...shape, repeat, ...(group ? { group } : {}) });

/** A ring of petals round the middle of the scene (0, 0). `centre` is where the ring turns, `n` how many. */
const ring = (f, s, n = 10, centre = { x: 0, y: 0 }, turn = true) => {
  const c = f(centre.x, centre.y);
  const petal = shapeOf([mapPath(ellPath(-20, -190, 40, 100), f)], PINK, stroke(INK, Math.max(2, 4 * s)));
  const dot = shapeOf([mapPath(ellPath(-16, -16, 32, 32), f)], SUN, stroke(INK, Math.max(2, 4 * s)));
  return { repeated: withRepeat(petal, { kind: 'ring', count: n, cx: c.x, cy: c.y, ...(turn ? {} : { turn: false }) }), dot, centre: c };
};

/** Rows and columns of a diamond tile, the middle of the whole grid at (0, 0). */
const grid = (f, s, cols = 5, rows = 3) => {
  const dx = 130 * s;
  const dy = 120 * s;
  const w = 90;
  const x0 = -((cols - 1) * 130 + w) / 2;
  const y0 = -((rows - 1) * 120 + w) / 2;
  const diamond = { closed: true, points: [{ x: x0 + w / 2, y: y0 }, { x: x0 + w, y: y0 + w / 2 }, { x: x0 + w / 2, y: y0 + w }, { x: x0, y: y0 + w / 2 }] };
  const tile = shapeOf([mapPath(diamond, f)], TEAL, stroke(INK, Math.max(2, 4 * s)));
  return withRepeat(tile, { kind: 'grid', cols, rows, dx, dy });
};

/** A wing left of the line at x = 0, and a spot on it, mirrored across that line. */
const wing = (f, s) => {
  const shape = { closed: true, points: [
    { x: -12, y: 0 },
    { x: -200, y: -190, c1: { x: -20, y: -110 }, c2: { x: -110, y: -200 } },
    { x: -300, y: -20, c1: { x: -280, y: -170 }, c2: { x: -320, y: -90 } },
    { x: -190, y: 150, c1: { x: -300, y: 60 }, c2: { x: -270, y: 140 } },
    { x: -12, y: 28, c1: { x: -110, y: 170 }, c2: { x: -30, y: 100 } },
  ] };
  const a = f(0, 0);
  const rep = { kind: 'mirror', x: a.x, y: a.y };
  const g = hid('g');
  const body = withRepeat(shapeOf([mapPath(shape, f)], PLUM, stroke(INK, Math.max(2, 4 * s))), rep, g);
  const spot = withRepeat(shapeOf([mapPath(ellPath(-190, -60, 70, 70), f)], '#ffffff', null), rep, g);
  return [body, spot];
};

/** Guides across the stage (x lines and y lines), as the page keeps them. */
const guides = (list) => dom(`__frameling.store().update('guides', (d) => { d.guides = ${JSON.stringify(list.map(([axis, at], i) => ({ id: `rg${i}`, axis, at })))}; })`);

module.exports = { ring, grid, wing, at, guides, withRepeat, mapPath, PINK, TEAL, SUN, PLUM };

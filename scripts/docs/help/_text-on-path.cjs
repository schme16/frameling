// The scene for the text on a curve help picture and its look (brand/ab/text-on-path): a badge with words round it and
// a wave with words along it, made with the real command (Put text on a curve), in each theme. Shapes are put in the
// drawing by the page, then the words and their curve are selected and the command joins them.
const L = require('./_lib.cjs');

const K = 0.5522847498307936;
/** A closed circle path in document pixels, clockwise on the screen from its right-hand point. */
const circle = (cx, cy, r) => ({
  closed: true,
  points: [
    { x: cx + r, y: cy, c1: { x: cx + K * r, y: cy - r }, c2: { x: cx + r, y: cy - K * r } },
    { x: cx, y: cy + r, c1: { x: cx + r, y: cy + K * r }, c2: { x: cx + K * r, y: cy + r } },
    { x: cx - r, y: cy, c1: { x: cx - K * r, y: cy + r }, c2: { x: cx - r, y: cy + K * r } },
    { x: cx, y: cy - r, c1: { x: cx - r, y: cy - K * r }, c2: { x: cx - K * r, y: cy - r } },
  ],
});

/** A gentle wave as an open path, left to right: two swells, smooth through each crest and trough. */
const wave = (x0, y0, w, amp) => {
  const n = 4;
  const seg = w / n;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push({ x: x0 + seg * i, y: y0 + (i % 2 ? amp : -amp) });
  return { closed: false, points: pts.map((p, i) => (i === 0 ? { ...p } : { ...p, c1: { x: pts[i - 1].x + seg * 0.5, y: pts[i - 1].y }, c2: { x: p.x - seg * 0.5, y: p.y } })) };
};

const text = (id, t, x, y, size, color) => ({ id, type: 'text', text: t, font: 'Nunito', size, weight: 700, color, align: 'left', lineHeight: 1.2, letterSpacing: 1, opacity: 1, transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 } });
const line = (id, paths, color, width) => ({ id, type: 'path', fill: null, stroke: { color, width, join: 'round', cap: 'round' }, opacity: 1, paths });

/** Page and ink for the theme the harness is in (slate and cream in the dark theme, cream paper and ink in the light one). */
const THEME = 'getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number).reduce((a, b) => a + b, 0) / 3 < 110';

/**
 * Puts the scenes in the drawing. `which` is any of 'circle', 'wave'; each is made, selected, and joined with the command.
 * Sizes are relative to the page, which is shown to fit.
 */
const scene = (which, opts = {}) =>
  L.js(`(async () => {
    const S = __frameling.store();
    const dark = ${THEME};
    const W = S.get().doc.width, H = S.get().doc.height;
    const ink = dark ? '#ffe9a8' : '#2b2d42', accent = dark ? '#ff7aa8' : '#d63a6c';
    const circle = ${circle.toString()}, wave = ${wave.toString()}, text = ${text.toString()}, line = ${line.toString()};
    const K = ${K};
    const which = ${JSON.stringify(which)};
    const shapes = [];
    const joins = [];
    if (which.includes('circle')) {
      const cx = which.length > 1 ? W * 0.27 : W * 0.5, cy = H * 0.5, r = Math.min(H * 0.3, W * 0.2);
      shapes.push(line('ring', [circle(cx, cy, r)], accent, 5), text('badge', ${JSON.stringify(opts.badge || 'MOONLIGHT BAKERY')}, cx, cy, Math.round(r * 0.28), ink));
      joins.push(['badge', 'ring']);
      shapes.push({ id: 'moon', type: 'path', fill: accent, stroke: null, opacity: 1, paths: [circle(cx, cy, r * 0.34)] });
    }
    if (which.includes('wave')) {
      const x0 = which.length > 1 ? W * 0.52 : W * 0.12, w = which.length > 1 ? W * 0.42 : W * 0.76;
      shapes.push(line('swell', [wave(x0, H * 0.52, w, H * 0.09)], accent, 5), text('title', ${JSON.stringify(opts.title || 'Over the rolling waves we go')}, x0, H * 0.5, Math.round(H * 0.085), ink));
      joins.push(['title', 'swell']);
    }
    S.update('Scene', (d) => {
      d.background = dark ? '#262a33' : '#fff7e8';
      const l = d.layers.find((x) => x.id === S.get().ui.activeLayerId) ?? d.layers.find((x) => x.kind === 'vector');
      d.drawings[l.cels[0].drawingId].shapes.push(...shapes);
    });
    for (const [t, c] of joins) {
      S.setUi({ selection: [t, c] });
      __frameling.run('text.onPath');
      await new Promise((r) => setTimeout(r, 120));
    }
    S.setUi({ selection: [] });
    return true;
  })()`);

module.exports = { L, scene };

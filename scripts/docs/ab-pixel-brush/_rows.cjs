// The brush kinds the second slice of the pixel brush adds, as rows of one stroke each. Shared by the A/B pictures, the
// clips and the help pictures so every one of them draws the same thing. Paths are in art pixels.
const { L, start, draw, whole, wave, away, shot } = require('./_draw.cjs');
const F = '__frameling';

const r = (from, to, amount, invert = false) => ({ from, to, amount, invert });

/** A wave whose pressure follows `p(t)`; drawn with a pen so the page sees real pressure. */
const ramp = (y, amp, x0, x1, n, p) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [Math.round(x0 + (x1 - x0) * t), Math.round(y + amp * Math.sin(t * Math.PI * 2)), p(t)]; });
/** A wave sampled slow at the start and flying at the end: points get further apart, so speed rises along it. */
const speedy = (y, amp, x0, x1) => {
  const pts = [];
  let t = 0;
  let step = 0.006;
  while (t < 1) { pts.push([Math.round(x0 + (x1 - x0) * t), Math.round(y + amp * Math.sin(t * Math.PI * 2)), 0.5]); step *= 1.16; t += step; }
  pts.push([x1, Math.round(y + amp * Math.sin(Math.PI * 2)), 0.5]);
  return pts;
};

const ROWS = {
  plain: { name: 'Round, no dynamics', brush: { size: 8, spacing: 0.15 }, path: (y) => wave(y, 4, 10, 150, 30) },
  pressure: { name: 'Pressure pencil', brush: { size: 10, spacing: 0.1, dynamics: [r('pressure', 'size', 0.85)] }, path: (y) => ramp(y, 4, 10, 150, 40, (t) => 0.1 + 0.9 * Math.sin(t * Math.PI)), opts: { pen: true, delay: 14 } },
  taper: { name: 'Tapered ink (fade)', brush: { size: 10, spacing: 0.08, dynamics: [r('fade', 'size', 1)], fadeLength: 150 }, path: (y) => wave(y, 4, 10, 150, 40), opts: { delay: 14 } },
  speed: { name: 'Fast is thin (speed)', brush: { size: 10, spacing: 0.08, dynamics: [r('speed', 'size', 0.8, true)] }, path: (y) => speedy(y, 4, 10, 150), opts: { delay: 14 } },
  spray: { name: 'Pressure spray', brush: { size: 12, spacing: 0.7, scatter: 0.3, dynamics: [r('pressure', 'scatter', 0.9), r('pressure', 'flow', 0.4)] }, path: (y) => ramp(y, 3, 10, 150, 40, (t) => 0.1 + 0.9 * t), opts: { pen: true, delay: 14 } },
  chalk: { name: 'Chalk grain', brush: { size: 12, spacing: 0.12, flow: 0.5, grain: { paper: 'rough', depth: 1, scale: 1, moving: false } }, path: (y) => wave(y, 4, 10, 150, 30) },
  pencil: { name: 'Pencil on paper (pressure)', brush: { size: 4, spacing: 0.12, flow: 0.7, grain: { paper: 'fine', depth: 0.9, scale: 1, moving: false }, dynamics: [r('pressure', 'flow', 0.7)] }, path: (y) => ramp(y, 3, 10, 150, 40, (t) => 0.05 + 0.95 * t), opts: { pen: true, delay: 14 } },
  sponge: { name: 'Sponge (moving grain)', brush: { size: 14, spacing: 0.3, flow: 0.55, grain: { paper: 'medium', depth: 1, scale: 2, moving: true } }, path: (y) => wave(y, 4, 10, 150, 30) },
  spatter: { name: 'Spatter (dual tip)', brush: { size: 14, spacing: 0.2, dual: { tip: 'round', size: 2, density: 0.25, cut: false } }, path: (y) => wave(y, 4, 10, 150, 30) },
  bristles: { name: 'Bristles (dual tip, turns)', brush: { size: 12, spacing: 0.08, follow: true, dual: { tip: 'square', size: 1, density: 0.5, cut: false } }, path: (y) => wave(y, 5, 10, 150, 30) },
  rainbow: { name: 'Rainbow trail', brush: { size: 7, spacing: 0.12, dynamics: [r('fade', 'hue', 1)], fadeLength: 150 }, path: (y) => wave(y, 4, 10, 150, 30), colour: '#e8452f' },
  autumn: { name: 'Autumn leaves (colour wobble)', brush: { tip: 'square', size: 5, spacing: 1, scatter: 1.4, sizeJitter: 0.4, dynamics: [r('random', 'hue', 0.12), r('random', 'lightness', 0.3)] }, path: (y) => wave(y, 4, 10, 150, 40), colour: '#d9692a' },
  tofill: { name: 'Fades to the fill colour', brush: { size: 9, spacing: 0.1, dynamics: [r('fade', 'mix', 1)], fadeLength: 150 }, path: (y) => wave(y, 4, 10, 150, 30), colour: '#2f6fe8' },
  wet: { name: 'Wet smear over colour', brush: { size: 10, hardness: 0.8, aliased: false, spacing: 0.1, wet: 0.9 }, path: (y) => wave(y, 2, 10, 150, 30), colour: '#e8452f', under: '#2f9fe8' },
};

/** The steps to draw one row at height y. A row with an `under` colour gets a bar of that colour first. */
function row(id, y) {
  const o = ROWS[id];
  const steps = [];
  if (o.under) steps.push(L.js(`${F}.store().setUi({ color: ${JSON.stringify(o.under)} })`), whole({ size: 12, spacing: 0.1 }), draw([[72, y - 12, 0.5], [72, y + 12, 0.5]], {}), draw([[88, y - 12, 0.5], [88, y + 12, 0.5]], {}), draw([[104, y - 12, 0.5], [104, y + 12, 0.5]], {}), draw([[120, y - 12, 0.5], [120, y + 12, 0.5]], {}));
  if (o.colour) steps.push(L.js(`${F}.store().setUi({ color: ${JSON.stringify(o.colour)} })`));
  steps.push(whole(o.brush), draw(o.path(y), o.opts));
  return steps;
}

/** The ink for the theme again, after a row that used its own colour. */
const inkBack = L.js(`(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number); ${F}.store().setUi({ color: (c[0] + c[1] + c[2]) / 3 < 128 ? '#efe9da' : '#1d1c21' }); })()`);
const fill = L.js(`${F}.store().setUi({ fillColor: '#e8a52f' })`);

/** A picture of some rows, top to bottom, on a sprite sized to them. */
function picture(name, ids, size = 160) {
  const gap = Math.floor((size - 16) / ids.length);
  return {
    name,
    prefs: { firstDrawn: true, showTips: false },
    width: 900,
    steps: [...start(size), fill, ...ids.flatMap((id, i) => [...row(id, 12 + gap * i + Math.floor(gap / 2)), inkBack]), away, L.wait(500), shot],
  };
}

module.exports = { ROWS, row, picture, inkBack, fill, r };

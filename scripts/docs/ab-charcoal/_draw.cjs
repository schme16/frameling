// Shared by the chalk and charcoal entries: the scene each medium is shown on (a firm stroke, a light stroke, a pressure ramp
// and three passes over each other, drawn with a pretend pen through real pointer events), in the colours of each theme.
// Files starting with _ are not entries.
const L = require('../help/_lib.cjs');
const { HELPER } = require('../ab-soft-paint/_draw.cjs');
const F = '__frameling';

/** A gentle wave across the sprite at height y, as a list of [x, y, pressure]. */
const wave = (y, amp, x0, x1, n, p) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [Math.round(x0 + (x1 - x0) * t), Math.round(y + amp * Math.sin(t * Math.PI * 2)), p(t)]; });
const line = (x0, y0, x1, y1, n, p) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), p(t)]; });

const PATHS = {
  firm: wave(58, 12, 40, 360, 60, () => 0.9),
  light: wave(128, 12, 40, 360, 60, () => 0.25),
  ramp: wave(198, 8, 40, 360, 70, (t) => 0.05 + 0.95 * t),
  passA: line(70, 270, 340, 360, 50, () => 0.5),
  passB: line(70, 360, 340, 270, 50, () => 0.5),
  passC: line(60, 315, 350, 315, 50, () => 0.5),
};

// [ink in the light theme, ink in the dark theme]. Colour media keep their colour in both.
const INK = {
  'vine-charcoal': ['#1d1c21', '#e8e3d6'],
  'compressed-charcoal': ['#17161a', '#efe9da'],
  chalk: ['#2a2830', '#f1ede2'],
  'soft-pastel': ['#d6483f', '#ee6a5f'],
  'oil-pastel': ['#2563c4', '#5b9bf0'],
  crayon: ['#d9531e', '#f07a3c'],
  'sketch-pencil': ['#34333b', '#cfcdd6'],
  'soft-pencil': ['#26252c', '#dedbe3'],
  'colour-pencil': ['#1f8f63', '#4fcf9a'],
};
const PAPER = { light: '#f2e9d6', dark: '#26252d' };

const draw = (path, o) => L.js(`__sp.stroke(${JSON.stringify(path)}, ${JSON.stringify(o ?? {})})`);
const dry = (call) => L.js(`__framelingDry.${call}`);
/** True in the dark theme, from the page itself, so one list of steps serves both. */
const DARK = `(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number); return (c[0] + c[1] + c[2]) / 3 < 128; })()`;

/** A fresh pixel sprite on paper, ready to draw. */
function start(paper) {
  return [
    L.js(`__framelingPixel.newSprite('picture', 400)`),
    L.wait(700),
    L.js(`(() => { const dark = ${DARK}; ${F}.store().update('paper', (d) => { d.background = dark ? ${JSON.stringify(PAPER.dark)} : ${JSON.stringify(PAPER.light)}; }); })()`),
    L.js(`${F}.run('view.fit')`),
    L.js(HELPER),
    L.js(`${F}.declinePenCheck()`),
    L.js(`__framelingSoft.reset(); __framelingSoft.edge('smooth'); __framelingDry.reset(); __framelingDry.paper(${JSON.stringify(paper)})`),
    L.wait(300),
  ];
}

const setInk = (id) => L.js(`(() => { const dark = ${DARK}; ${F}.store().setUi({ tool: 'charcoal', color: dark ? ${JSON.stringify(INK[id][1])} : ${JSON.stringify(INK[id][0])} }); })()`);

/** Everything one picture needs for one medium: the four marks. */
function scene(id, paper = 'medium', opts = {}) {
  return [
    ...start(paper),
    dry(`medium(${JSON.stringify(id)})`),
    ...(opts.size ? [dry(`set(${JSON.stringify(id)}, { size: ${opts.size} })`)] : []),
    setInk(id),
    draw(PATHS.firm, { pen: true, delay: 10 }),
    draw(PATHS.light, { pen: true, delay: 10 }),
    draw(PATHS.ramp, { pen: true, delay: 12 }),
    draw(PATHS.passA, { pen: true, delay: 10 }),
    draw(PATHS.passB, { pen: true, delay: 10 }),
    draw(PATHS.passC, { pen: true, delay: 10 }),
    { move: [640, 780] },
    L.wait(500),
  ];
}


/** A ball on the ground, shaded the way you would with a stick of charcoal: curved strokes round the form, pressed harder toward the shadow, and a cast shadow. */
function ballPaths(cx = 200, cy = 170, r = 100) {
  const out = [];
  const pt = (x, y, p) => [Math.round(x), Math.round(y), p];
  // The outline, lightly.
  out.push(Array.from({ length: 90 }, (_, i) => { const a = ((120 + (i / 89) * 370) * Math.PI) / 180; return pt(cx + r * Math.cos(a), cy + r * Math.sin(a), 0.3 + 0.2 * Math.max(0, Math.cos(a - 0.8))); }));
  // Diagonal hatching across the ball, pressed harder toward the shadow side (lower right). Light comes from the upper left.
  const hatch = (angle, gap, lo, hi, minDark) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const nx = -dy;
    const ny = dx;
    for (let o = -r + 4; o < r - 2; o += gap) {
      const half = Math.sqrt(Math.max(0, r * r - o * o)) - 3;
      if (half < 6) continue;
      const n = 24;
      const stroke = Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        const along = -half + 2 * half * t;
        const x = cx + nx * o + dx * along;
        const y = cy + ny * o + dy * along;
        // How far into the shadow this bit is: 0 at the lit edge, 1 at the far side.
        const d = ((x - cx) * 0.7 + (y - cy) * 0.7) / r;
        const dark = Math.min(1, Math.max(0, (d + 0.5) / 1.4));
        return { dark, p: pt(x, y + 1.5 * Math.sin(t * 5 + o), lo + (hi - lo) * dark) };
      }).filter((q) => q.dark >= minDark).map((q) => q.p);
      if (stroke.length > 3) out.push(stroke);
    }
  };
  hatch((55 * Math.PI) / 180, 8, 0.12, 0.7, 0);
  hatch((-30 * Math.PI) / 180, 9, 0.1, 0.65, 0.35);
  hatch((100 * Math.PI) / 180, 8, 0.1, 0.7, 0.62);
  // A cast shadow on the ground, hatched, fading to the right.
  for (let k = 0; k < 6; k++) { const y = cy + r - 4 + k * 6; out.push(Array.from({ length: 30 }, (_, i) => { const t = i / 29; return pt(cx - 30 + k * 6 + t * (170 - k * 14), y + 2 * Math.sin(t * 3 + k), 0.55 - 0.4 * t); })); }
  return out;
}

/** The ball drawn with one medium. */
function ball(id, paper = 'medium', opts = {}) {
  return [
    ...start(paper),
    dry(`medium(${JSON.stringify(id)})`),
    ...(opts.size ? [dry(`set(${JSON.stringify(id)}, { size: ${opts.size} })`)] : []),
    setInk(id),
    ...ballPaths().map((p) => draw(p, { pen: true, delay: 3 })),
    { move: [640, 780] },
    L.wait(500),
  ];
}

module.exports = { ball, ballPaths, scene, start, setInk, draw, dry, PATHS, INK, PAPER, DARK };

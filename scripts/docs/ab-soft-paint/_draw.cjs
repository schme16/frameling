// Shared by the soft paint entries: the in-page helper that draws strokes with real pointer events (mouse, or a pen with
// pressure), and the scene each tool is shown on. Files starting with _ are not entries.
const L = require('../help/_lib.cjs');
const F = '__frameling';

// Installed once per page. Strokes are in document pixels; each is a list of [x, y, pressure].
const HELPER = `(() => {
  const root = () => document.querySelector('.cv-root');
  const client = (x, y) => { const { zoom, panX, panY } = ${F}.store().get().ui; const r = root().getBoundingClientRect(); return [r.left + x * zoom + panX, r.top + y * zoom + panY]; };
  const send = (type, x, y, pressure, pen) => { const [cx, cy] = client(x, y); root().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: pen ? 7 : 1, pointerType: pen ? 'pen' : 'mouse', isPrimary: true, clientX: cx, clientY: cy, pressure, button: 0, buttons: type === 'pointerup' ? 0 : 1, tiltX: 0, tiltY: 0 })); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__sp = { async stroke(pts, o = {}) { const pen = !!o.pen; const d = o.delay ?? 10; send('pointerdown', pts[0][0], pts[0][1], pts[0][2] ?? 0.5, pen); await wait(d); for (let i = 1; i < pts.length; i++) { send('pointermove', pts[i][0], pts[i][1], pts[i][2] ?? 0.5, pen); await wait(d); } if (o.hold) await wait(o.hold); const l = pts[pts.length - 1]; send('pointerup', l[0], l[1], 0, pen); await wait(60); }, wait };
})()`;

/** A gentle wave across the canvas at height y, as a list of points. */
const wave = (y, amp = 12, x0 = 40, x1 = 360, n = 36, p) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [Math.round(x0 + (x1 - x0) * t), Math.round(y + amp * Math.sin(t * Math.PI * 2)), p ? p(t) : 0.5]; });
const line = (x0, y0, x1, y1, n = 30, p) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), p ? p(t) : 0.5]; });

const ROWS = { firm: 55, light: 125, ramp: 195 };
const PATHS = {
  firm: wave(ROWS.firm),
  light: wave(ROWS.light),
  ramp: wave(ROWS.ramp, 8, 40, 360, 44, (t) => 0.05 + 0.95 * t),
  crossA: line(70, 270, 340, 355, 30),
  crossB: line(70, 355, 340, 270, 30),
};

// Smudge starts on a band of colour and drags it out across the others.
const SMUDGE = {
  firm: wave(ROWS.firm, 12, 95, 335),
  light: wave(ROWS.light, 12, 95, 335),
  ramp: wave(ROWS.ramp, 8, 95, 335, 44, (t) => 0.05 + 0.95 * t),
  crossA: line(95, 270, 335, 355, 30),
  crossB: line(335, 270, 95, 355, 30),
};
const pathsFor = (kind) => (kind === 'smudge' ? SMUDGE : PATHS);

const draw = (path, o) => L.js(`__sp.stroke(${JSON.stringify(path)}, ${JSON.stringify(o ?? {})})`);
const setUi = (o) => L.js(`${F}.store().setUi(${JSON.stringify(o)})`);
const soft = (kind, o) => L.js(`__framelingSoft.set(${JSON.stringify(kind)}, ${JSON.stringify(o)})`);
const away = { move: [640, 780] };

// What each tool is shown with: its underlay (something for it to work on), its colours, and how firm and light it goes.
const TOOLS = {
  'soft-brush': { colour: '#ff6f91', second: '#4fd1a5', firm: { size: 26, hardness: 0.4, flow: 1 }, light: { flow: 0.3 }, cross: { flow: 0.55 } },
  airbrush: { colour: '#9b7bff', second: '#ffc94a', firm: { size: 36, hardness: 0, flow: 1 }, light: { flow: 0.25 }, cross: { flow: 0.35 } },
  highlighter: { colour: '#ffe14a', second: '#5ee0ff', firm: { size: 24, hardness: 0.9, flow: 0.9 }, light: { flow: 0.45 }, cross: { flow: 0.7 }, under: 'lines' },
  'soft-eraser': { colour: '#4fd1a5', firm: { size: 26, hardness: 0.3, flow: 1 }, light: { flow: 0.35 }, cross: { flow: 0.5 }, under: 'blocks' },
  smudge: { colour: '#000000', firm: { size: 26, hardness: 0.3, flow: 0.9 }, light: { flow: 0.3 }, cross: { flow: 0.6 }, under: 'bands' },
};

/** What goes down first, with the soft brush at full hardness, so there is something for the tool to work on. */
function underlay(kind) {
  const u = TOOLS[kind].under;
  if (!u) return [];
  const steps = [setUi({ tool: 'soft-brush' }), soft('soft-brush', { hardness: 1, flow: 1 })];
  if (u === 'lines') {
    steps.push(soft('soft-brush', { size: 3 }), setUi({ color: '#1b1b2a' }));
    for (const p of [PATHS.firm, PATHS.light, PATHS.ramp, PATHS.crossA, PATHS.crossB]) steps.push(draw(p));
  } else if (u === 'blocks') {
    steps.push(soft('soft-brush', { size: 54 }), setUi({ color: '#4fd1a5' }));
    for (const p of [PATHS.firm, PATHS.light, PATHS.ramp]) steps.push(draw(p));
    steps.push(setUi({ color: '#ffc94a' }), draw(PATHS.crossA), draw(PATHS.crossB));
  } else if (u === 'bands') {
    steps.push(soft('soft-brush', { size: 56 }));
    [[95, '#ff6f91'], [200, '#ffc94a'], [305, '#4fd1a5']].forEach(([x, c]) => steps.push(setUi({ color: c }), draw(line(x, 15, x, 385, 24))));
  }
  return steps;
}

/** Everything one picture needs: a fresh pixel sprite, the underlay, then the four strokes with the tool. `edge` is the answer to the Pixel perfect question. */
function scene(kind, edge) {
  const t = TOOLS[kind];
  const P = pathsFor(kind);
  return [
    L.js(`__framelingPixel.newSprite('picture', 400)`),
    L.wait(700),
    L.js(`${F}.run('view.fit')`),
    L.js(HELPER),
    L.js(`${F}.declinePenCheck()`),
    L.js(`__framelingSoft.reset(); __framelingSoft.edge(${JSON.stringify(edge)})`),
    L.wait(300),
    ...underlay(kind),
    setUi({ tool: kind, color: t.colour }),
    soft(kind, { ...t.firm }),
    draw(P.firm),
    soft(kind, t.light),
    draw(P.light),
    soft(kind, { flow: t.firm.flow }),
    draw(P.ramp, { pen: true, delay: 14 }),
    soft(kind, t.cross),
    draw(P.crossA),
    ...(t.second ? [setUi({ color: t.second })] : []),
    draw(P.crossB),
    away,
    L.wait(500),
  ];
}

module.exports = { HELPER, TOOLS, PATHS, scene, draw, setUi, soft, away, underlay };

// Gouache against Marker and Block marker (brand/ab/gouache). Two entries, each run once per theme:
//   strokes: Marker, Block marker and Gouache drawing the same slow wave in the same colour, as real strokes on the page
//   cover:   a scribble of fine lines, then Marker and Gouache painted across it, to show what Gouache is chosen for
// compose.py puts before and after side by side. Run it on whichever build is checked out:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-gouache --out <dir>
const L = require('../help/_lib.cjs');
const { HELPER } = require('../ab-soft-paint/_draw.cjs');
const { DARK, PAPER } = require('../ab-charcoal/_draw.cjs');
const F = '__frameling';

const PAINT = ['#c4472f', '#f0735a'];
const INK = ['#26252c', '#e8e3d6'];

const wave = (y) => Array.from({ length: 49 }, (_, i) => { const t = i / 48; return [Math.round(24 + t * 352), Math.round(y + Math.sin(t * Math.PI * 2) * 9), +(0.25 + 0.6 * Math.sin(t * Math.PI)).toFixed(3)]; });
// Loops of fine line crossing the row, so whatever is painted over them either hides them or doesn't.
const scribble = (y, phase) => Array.from({ length: 90 }, (_, i) => { const t = i / 89; return [Math.round(24 + t * 352), Math.round(y + Math.sin(t * Math.PI * 5 + phase) * 44), 0.6]; });
const bar = (y, x0, x1) => Array.from({ length: 30 }, (_, i) => [Math.round(x0 + (i / 29) * (x1 - x0)), y, 0.7]);

const setup = (height) => [
  L.template('blank-vector'),
  L.wait(700),
  L.js(`(() => { const dark = ${DARK}; ${F}.store().update('paper', (d) => { d.width = 400; d.height = ${height}; d.background = dark ? ${JSON.stringify(PAPER.dark)} : ${JSON.stringify(PAPER.light)}; }); })()`),
  L.js(`${F}.run('view.fit')`),
  L.js(HELPER),
  L.js(`${F}.declinePenCheck()`),
  L.cmd('tools.brush'),
  L.wait(300),
];
const pick = (id, colours) => [
  L.js(`${F}.run(${JSON.stringify(`brush.pick.starter:${id}`)})`),
  L.wait(250),
  L.js(`(() => { const dark = ${DARK}; ${F}.store().setUi({ tool: 'brush', color: dark ? ${JSON.stringify(colours[1])} : ${JSON.stringify(colours[0])} }); })()`),
  L.wait(150),
];
const draw = (path) => L.js(`__sp.stroke(${JSON.stringify(path)}, { pen: true, delay: 10 })`);
const done = [{ move: [640, 780] }, L.wait(500), { shot: '@', el: '.cv-root', pad: 0 }];

module.exports = [
  {
    name: 'strokes',
    prefs: { firstDrawn: true, showTips: false },
    width: 800,
    steps: [...setup(200), ...['marker', 'block-marker', 'gouache'].flatMap((id, i) => [...pick(id, PAINT), draw(wave(36 + i * 64))]), ...done],
  },
  {
    name: 'cover',
    prefs: { firstDrawn: true, showTips: false },
    width: 800,
    steps: [
      ...setup(260),
      ...pick('technical', INK),
      draw(scribble(66, 0)),
      draw(scribble(66, 2)),
      draw(scribble(196, 0)),
      draw(scribble(196, 2)),
      ...pick('marker', PAINT),
      draw(bar(66, 24, 376)),
      ...pick('gouache', PAINT),
      draw(bar(196, 24, 376)),
      ...done,
    ],
  },
];

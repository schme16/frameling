// Shared by the pixel brush entries: a small pixel sprite on paper, strokes drawn through real pointer events, and the pixel
// brush set through __framelingDab. Files starting with _ are not entries.
const L = require('../help/_lib.cjs');
const { HELPER } = require('../ab-soft-paint/_draw.cjs');
const F = '__frameling';

/** True in the dark theme, from the page itself, so one list of steps serves both. */
const DARK = `(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number); return (c[0] + c[1] + c[2]) / 3 < 128; })()`;
const PAPER = { light: '#f2e9d6', dark: '#26252d' };
const INK = { light: '#1d1c21', dark: '#efe9da' };

const wave = (y, amp, x0, x1, n) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [Math.round(x0 + (x1 - x0) * t), Math.round(y + amp * Math.sin(t * Math.PI * 2)), 0.5]; });
const line = (x0, y0, x1, y1, n) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 0.5]; });
// Paths are in art pixels; the page's pointer events are in document pixels, which are `PS` times bigger (see pixelSizeFor in src/pixel/way.ts).
let PS = 1;
const draw = (path, o) => L.js(`__sp.stroke(${JSON.stringify(path.map(([x, y, p]) => [x * PS, y * PS, p]))}, ${JSON.stringify(o ?? {})})`);
const dab = (patch) => L.js(`__framelingDab.set(${JSON.stringify(patch)})`);
const whole = (b) => L.js(`__framelingDab.whole(${JSON.stringify(b)})`);

/** A fresh pixel sprite on paper with the pixel brush picked, in the ink of the theme. */
function start(size = 160) {
  PS = Math.max(1, Math.floor(512 / Math.max(1, size)));
  return [
    L.js(`__framelingPixel.newSprite('picture', ${size})`),
    L.wait(700),
    L.js(`(() => { const dark = ${DARK}; ${F}.store().update('paper', (d) => { d.background = dark ? ${JSON.stringify(PAPER.dark)} : ${JSON.stringify(PAPER.light)}; }); })()`),
    L.js(`${F}.run('view.fit')`),
    L.js(HELPER),
    L.js(`${F}.declinePenCheck()`),
    L.js(`__framelingDab.reset(); __framelingSoft.edge('smooth')`),
    L.js(`(() => { const dark = ${DARK}; ${F}.store().setUi({ tool: 'pixel-brush', color: dark ? ${JSON.stringify(INK.dark)} : ${JSON.stringify(INK.light)} }); })()`),
    L.wait(300),
  ];
}

const away = { move: [640, 780] };
const shot = { shot: '@', el: '.cv-root', pad: 0 };

/** A picture tip from rows of text. */
const picture = (rows, keep = false) => {
  const w = Math.max(...rows.map((r) => r.length));
  return { w, h: rows.length, colours: ['#000000'], cells: rows.flatMap((r) => Array.from({ length: w }, (_, x) => (r[x] === '#' ? 1 : 0))), keep };
};
const STAR = picture(['..#..', '.###.', '#####', '.###.', '#...#']);
const HEART = picture(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']);
const DIAMOND = picture(['..#..', '.###.', '#####', '.###.', '..#..']);

module.exports = { L, start, draw, dab, whole, wave, line, away, shot, picture, STAR, HEART, DIAMOND, DARK, PAPER, INK };

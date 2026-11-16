// Every vector starter brush drawn as a real stroke on the canvas, eight to a page (survey-0, survey-1, ...), in the
// order src/brushes/starters.ts lists them, so a contact sheet can name each one (scripts/ab/brush-survey-compose.py).
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-survey --out <dir>
const fs = require('fs');
const path = require('path');
const L = require('../help/_lib.cjs');
const { HELPER } = require('../ab-soft-paint/_draw.cjs');
const { DARK, PAPER } = require('../ab-charcoal/_draw.cjs');
const F = '__frameling';
const INK = ['#26252c', '#e8e3d6'];
const PER = 8;

const src = fs.readFileSync(path.join(__dirname, '../../../src/brushes/starters.ts'), 'utf8');
const IDS = [...src.matchAll(/^ {2}make\('([a-z0-9-]+)', '([^']*)'/gm)].map((m) => m[1]);
const wave = (y) => Array.from({ length: 49 }, (_, i) => { const t = i / 48; return [Math.round(24 + t * 352), Math.round(y + Math.sin(t * Math.PI * 2) * 9), +(0.25 + 0.6 * Math.sin(t * Math.PI)).toFixed(3)]; });

const page = (n, ids) => ({
  name: `survey-${n}`,
  prefs: { firstDrawn: true, showTips: false },
  width: 800,
  steps: [
    L.template('blank-vector'),
    L.wait(700),
    L.js(`(() => { const dark = ${DARK}; ${F}.store().update('paper', (d) => { d.width = 400; d.height = 520; d.background = dark ? ${JSON.stringify(PAPER.dark)} : ${JSON.stringify(PAPER.light)}; }); })()`),
    L.js(`${F}.run('view.fit')`),
    L.js(HELPER),
    L.js(`${F}.declinePenCheck()`),
    L.cmd('tools.brush'),
    L.wait(300),
    ...ids.flatMap((id, i) => [
      L.js(`${F}.run(${JSON.stringify(`brush.pick.starter:${id}`)})`),
      L.wait(250),
      L.js(`(() => { const dark = ${DARK}; ${F}.store().setUi({ tool: 'brush', color: dark ? ${JSON.stringify(INK[1])} : ${JSON.stringify(INK[0])} }); })()`),
      L.wait(150),
      L.js(`__sp.stroke(${JSON.stringify(wave(34 + i * 60))}, { pen: true, delay: 10 })`),
    ]),
    { move: [640, 780] },
    L.wait(500),
    { shot: '@', el: '.cv-root', pad: 0 },
  ],
});

module.exports = Array.from({ length: Math.ceil(IDS.length / PER) }, (_, n) => page(n, IDS.slice(n * PER, n * PER + PER)));

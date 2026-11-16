// Brush picker previews against real strokes (brand/ab/chalk-previews). Two entries, each run once per theme:
//   library: the picker open on the "Chalk and charcoal" folder, so its seven stroke previews and round thumbnails show
//   canvas:  the same seven brushes drawing a real stroke on the page (a pretend pen swelling in the middle, as the preview's own line does)
// compose.py puts them side by side. AFTER=1 is not needed: run it on whichever build is checked out.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-chalk-previews --out <dir>
const L = require('../help/_lib.cjs');
const { HELPER } = require('../ab-soft-paint/_draw.cjs');
const { DARK, PAPER } = require('../ab-charcoal/_draw.cjs');
const { libraryText } = require('../help/_library.cjs');
const F = '__frameling';

const IDS = ['chalk', 'charcoal', 'soft-pastel', 'oil-pastel', 'crayon', 'vine-charcoal', 'compressed-charcoal'];
const ORDER = ['Chalk', 'Charcoal', 'Soft pastel', 'Oil pastel', 'Crayon', 'Vine charcoal', 'Compressed charcoal'];
const INK = ['#26252c', '#e8e3d6'];

const click = (sel) => L.js(`document.querySelector(${JSON.stringify(sel)}).click()`);
const header = (name) => L.js(`(() => { const h = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === ${JSON.stringify(name)}); if (h.getAttribute('aria-expanded') !== 'true') h.click(); })()`);

// One slow wave with a swell in the middle, as the preview draws it, as a list of [x, y, pressure] in page pixels.
const wave = (y) => Array.from({ length: 49 }, (_, i) => { const t = i / 48; return [Math.round(24 + t * 352), Math.round(y + Math.sin(t * Math.PI * 2) * 9), +(0.25 + 0.6 * Math.sin(t * Math.PI)).toFixed(3)]; });

const canvas = {
  name: 'canvas',
  prefs: { firstDrawn: true, showTips: false },
  width: 800,
  steps: [
    L.template('blank-vector'),
    L.wait(700),
    L.js(`(() => { const dark = ${DARK}; ${F}.store().update('paper', (d) => { d.width = 400; d.height = 400; d.background = dark ? ${JSON.stringify(PAPER.dark)} : ${JSON.stringify(PAPER.light)}; }); })()`),
    L.js(`${F}.run('view.fit')`),
    L.js(HELPER),
    L.js(`${F}.declinePenCheck()`),
    L.cmd('tools.brush'),
    L.wait(300),
    ...IDS.flatMap((id, i) => [
      L.js(`${F}.run(${JSON.stringify(`brush.pick.starter:${id}`)})`),
      L.wait(250),
      L.js(`(() => { const dark = ${DARK}; ${F}.store().setUi({ tool: 'brush', color: dark ? ${JSON.stringify(INK[1])} : ${JSON.stringify(INK[0])} }); })()`),
      L.wait(150),
      L.js(`__sp.stroke(${JSON.stringify(wave(30 + i * 56))}, { pen: true, delay: 10 })`),
    ]),
    { move: [640, 780] },
    L.wait(500),
    { shot: '@', el: '.cv-root', pad: 0 },
  ],
};

const library = (name, more) => ({
  name,
  prefs: { firstDrawn: true, showTips: false },
  size: [1400, 900],
  width: 1400,
  steps: [
    L.template('blank-vector'), L.cmd('tools.brush'), L.wait(700),
    L.js(`__brushes.addFromText(${JSON.stringify(libraryText())})`), L.wait(4300),
    L.js('__brushes.box({ w: 440, h: 760 })'), L.js("document.querySelector('.pk-btn').scrollIntoView({ block: 'start' })"), L.wait(300), click('.pk-btn'), L.wait(400),
    L.js(`(() => { const b = document.querySelector('.pk-icon[aria-label="Open every group"]'); if (b) b.click(); })()`), L.wait(250),
    L.js(`(() => { const b = document.querySelector('.pk-icon[aria-label="Fold every group"]'); if (b) b.click(); })()`), L.wait(250),
    header('Chalk and charcoal'), L.wait(900),
    L.js(`(() => { const g = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === 'Chalk and charcoal'); g.scrollIntoView({ block: 'start' }); })()`),
    L.wait(900),
    ...(more ? [L.js(`document.querySelector('.pk-list').scrollTop += ${more}`), L.wait(700)] : []),
    { move: [300, 20] }, L.wait(300),
    { shot: '@', el: '.pk-pop', pad: 0 },
  ],
});

// The folder is seven rows tall and the panel shows four or five, so the library is shot twice: the top of the folder, then scrolled down.
module.exports = [canvas, library('library', 0), library('library-more', 240)];

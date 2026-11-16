// Library pictures against real strokes (brand/ab/pixel-previews). Run once on the old build and once on the new one:
//   pixel-library:  the pixel brush picker with the Soft paint and Dry media folders open
//   pixel-real:     the same tools drawing a real stroke on a pixel layer (a mouse, so no pen pressure), one band each
//   bristles:       the vector picker with the Bristles folder open (the round thumbnails are the point)
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-pixel-previews --renderer <dist/renderer> --out <dir>
// scripts/ab/pixel-previews-compose.py puts them side by side.
const { start, draw, line, away, DARK, INK } = require('../ab-pixel-brush/_draw.cjs');
const L = require('../help/_lib.cjs');
const F = '__frameling';

// In the order the Library lists them, so each band lines up with its row.
const SOFT = ['soft-brush', 'airbrush', 'highlighter'];
const DRY = ['vine-charcoal', 'compressed-charcoal', 'chalk', 'soft-pastel', 'crayon', 'soft-pencil'];

const click = (sel) => L.js(`document.querySelector(${JSON.stringify(sel)}).click()`);
const header = (name) => L.js(`(() => { const h = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === ${JSON.stringify(name)}); if (h.getAttribute('aria-expanded') !== 'true') h.click(); })()`);
const fold = L.js(`(() => { const b = document.querySelector('.pk-icon[aria-label="Fold every group"]'); if (b) b.click(); })()`);

const library = {
  name: 'pixel-library',
  prefs: { firstDrawn: true, showTips: false },
  size: [1400, 1100],
  width: 1400,
  steps: [
    L.js(`${F}.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160),
    L.js('__brushes.box({ w: 440, h: 920 })'), click('.pk-btn'), L.wait(1200),
    L.js(`(() => { const b = document.querySelector('.pk-icon[aria-label="Open every group"]'); if (b) b.click(); })()`), L.wait(300), fold, L.wait(300),
    header('Soft paint'), L.wait(600), header('Dry media'), L.wait(900),
    L.js(`(() => { const g = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === 'Soft paint'); g.scrollIntoView({ block: 'start' }); })()`),
    L.wait(900), { move: [300, 20] }, L.wait(300),
    { shot: '@', el: '.pk-pop', pad: 0 },
  ],
};

const BAND = 43;
const wave = (y) => Array.from({ length: 40 }, (_, i) => { const t = i / 39; return [Math.round(30 + t * 340), Math.round(y + Math.sin(t * Math.PI * 2) * 8), 0.5]; });
const inkNow = (tool) => L.js(`(() => { const dark = ${DARK}; ${F}.store().setUi({ tool: ${JSON.stringify(tool)}, color: dark ? ${JSON.stringify(INK.dark)} : ${JSON.stringify(INK.light)} }); })()`);

const real = {
  name: 'pixel-real',
  prefs: { firstDrawn: true, showTips: false },
  width: 800,
  steps: [
    ...start(400),
    L.js(`__framelingSoft.reset(); __framelingDry.reset()`),
    ...SOFT.flatMap((id, i) => {
      const y = 24 + i * BAND;
      return [
        // The highlighter works on what is there, so it gets two lines of words to go over.
        ...(id === 'highlighter'
          ? [inkNow('soft-brush'), L.js(`__framelingSoft.set('soft-brush', { size: 3, hardness: 1, flow: 1 })`),
            ...[y - 7, y + 7].flatMap((yy, row) => [30, 90, 170, 240, 300].map((x0, k) => draw(line(x0 + row * 12, yy, x0 + row * 12 + 42 - k * 3, yy, 8)))),
            L.js(`__framelingSoft.reset()`)]
          : []),
        inkNow(id),
        draw(wave(y)),
      ];
    }),
    ...DRY.flatMap((id, i) => [inkNow('charcoal'), L.js(`__framelingDry.medium(${JSON.stringify(id)})`), draw(wave(24 + (SOFT.length + i) * BAND))]),
    away, L.wait(500),
    { shot: '@', el: '.cv-root', pad: 0 },
  ],
};

const bristles = {
  name: 'bristles',
  prefs: { firstDrawn: true, showTips: false },
  size: [1400, 900],
  width: 1400,
  steps: [
    L.template('blank-vector'), L.cmd('tools.brush'), L.wait(700),
    L.js('__brushes.box({ w: 440, h: 760 })'), L.js("document.querySelector('.pk-btn').scrollIntoView({ block: 'start' })"), L.wait(300), click('.pk-btn'), L.wait(400),
    L.js(`(() => { const b = document.querySelector('.pk-icon[aria-label="Open every group"]'); if (b) b.click(); })()`), L.wait(250), fold, L.wait(250),
    header('Bristles'), L.wait(900),
    L.js(`(() => { const g = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === 'Bristles'); g.scrollIntoView({ block: 'start' }); })()`),
    L.wait(900), { move: [300, 20] }, L.wait(300),
    { shot: '@', el: '.pk-pop', pad: 0 },
  ],
};

module.exports = [library, real, bristles];

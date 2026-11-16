// The Paper group before and after (brand/ab/paper-group): the tool options of chalk and charcoal and of the pixel brush
// with grain on, then a stroke from each on two papers. Both builds run the same steps; AB_SIDE=before only changes where
// the pixel brush's paper lives (it was a brush setting then), so the two sides show the same drawing situation:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" [AB_SIDE=before] npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-paper-group --renderer <dist> --out <raw>
const { L, start, draw, wave, away } = require('../ab-pixel-brush/_draw.cjs');

const BEFORE = process.env.AB_SIDE === 'before';
const F = '__frameling';
const DARK = `(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number); return (c[0] + c[1] + c[2]) / 3 < 128; })()`;
const INK = { light: '#1d1c21', dark: '#efe9da' };
const ink = (tool) => L.js(`(() => { const dark = ${DARK}; ${F}.store().setUi({ tool: ${JSON.stringify(tool)}, color: dark ? ${JSON.stringify(INK.dark)} : ${JSON.stringify(INK.light)} }); })()`);
const sheet = (paper) => L.js(`__framelingDry.paper(${JSON.stringify(paper)})`);
// Grain on. Before this change the brush carried its own paper, so it is set to the same one; after, it follows the sheet.
const grain = (paper) => L.js(`__framelingDab.set({ grain: ${BEFORE ? `{ paper: ${JSON.stringify(paper)}, depth: 1, scale: 1, moving: false }` : '{ depth: 1, scale: 1, moving: false }'}, flow: 0.5, size: 14 })`);
const open = (name) => L.js(`(() => { const b = document.querySelector('[data-fold="${name}"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
// Scrolls the options so the Paper row (before) or the Paper group (after) is near the top.
const toPaper = L.js(`(() => { const e = document.querySelector('[data-testid="paper-group"]') || document.querySelector('[data-fold="pixel-brush-texture"]') || [...document.querySelectorAll('.cv-field-label')].find((x) => x.textContent === 'Paper'); e?.scrollIntoView({ block: 'start' }); for (let p = e?.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) { p.scrollTop -= 90; break; } } })()`);
const PANEL = { shot: '@', crop: [1010, 46, 300, 900] };
const STAGE = { shot: '@', el: '.cv-root', pad: 0 };

const entry = (name, steps, shot) => ({ name, prefs: { firstDrawn: true, showTips: false, showQuill: false }, size: [1400, 1000], width: 1400, steps: [L.js(`${F}.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160), ...steps, L.wait(900), away, L.wait(300), shot] });

const pen = (y) => ({ pen: true, delay: 10 });
const strokes = (tool, paper, setup) => [sheet(paper), ...setup, ink(tool), draw(wave(40, 12, 14, 146, 50), pen()), draw(wave(80, 12, 14, 146, 50), { pen: true, delay: 10 }), draw(wave(120, 12, 14, 146, 50), { pen: true, delay: 10 })];

module.exports = [
  entry('panel-dry', [sheet('rough'), ink('charcoal'), L.wait(500), toPaper], PANEL),
  entry('panel-pixel', [sheet('rough'), grain('rough'), ink('pixel-brush'), L.wait(500), ...(BEFORE ? [open('pixel-brush-texture')] : []), L.wait(300), toPaper], PANEL),
  entry('stroke-dry-smooth', strokes('charcoal', 'smooth', []), STAGE),
  entry('stroke-dry-rough', strokes('charcoal', 'rough', []), STAGE),
  entry('stroke-pixel-smooth', strokes('pixel-brush', 'smooth', [grain('smooth')]), STAGE),
  entry('stroke-pixel-rough', strokes('pixel-brush', 'rough', [grain('rough')]), STAGE),
];

// Looks for the colour branch: Properties with Colours on top (before and after), the new colour picker with its Opacity bar,
// a palette colour being given opacity, a place where opacity is deliberately not offered, and the palette lock case.
// Run once against the old build and once against the new one:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs \
//     --entries scripts/docs/ab-colour --renderer <abs dist dir> --out <dir>
const L = require('../help/_lib.cjs');
const F = '__frameling';
const prefs = { reduceMotion: true, showTips: false };
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const away = { move: [640, 762] };
const click = (sel, nth = 0) => L.js(`(() => { const el = document.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click(); return true; })()`);
const dbl = (sel, nth = 0) => L.js(`(() => { const el = document.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return true; })()`);
/** Presses a key on the first thing that matches, the way the picker's own sliders are driven. */
const press1 = (sel, k, shiftKey) => L.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, shiftKey: ${!!shiftKey}, bubbles: true })); return true; })()`);
/** Presses a key on the first thing that matches, a few times with the screen drawn in between, like a real hand. */
const press = (sel, k, times = 1, shiftKey = false) => Array.from({ length: times }, () => [press1(sel, k, shiftKey), L.wait(120)]).flat();
/** Picks the first symbol on the stage, as a click would. */
const pickSymbol = L.js(`(() => { const st = ${F}.store(); const s = st.get(); for (const l of s.doc.layers) { const c = l.cels.find((c) => s.ui.frame >= c.start && s.ui.frame < c.start + c.length); const d = c && s.doc.drawings[c.drawingId]; const sh = d && d.kind === 'vector' && d.shapes.find((x) => x.type === 'instance'); if (sh) { st.setUi({ activeLayerId: l.id, selection: [sh.id], tool: 'select' }); return true; } } throw new Error('no symbol'); })()`);
const top = L.js(`(() => { document.querySelectorAll('.rd-scroll').forEach((e) => (e.scrollTop = 0)); return true; })()`);
const pixel = [L.js(`${F}.dock.applyWorkspace('pixel')`), L.wait(600), L.js(`${F}.template('blank-pixel')`), L.wait(500)];
const logo = [L.template('bouncing-logo'), L.js(`${F}.store().setUi({ frame: 30 })`), L.key('v'), L.wait(1000)];
const PROPS = [884, 40, 396, 1010];
module.exports = [
  // Properties with a symbol picked: before, what is about it leads; after, Colours lead and it comes straight after.
  { name: 'props-picked', size: [1280, 1100], width: 400, prefs, steps: [...logo, pickSymbol, L.wait(1500), top, away, ...settle, { shot: '@', crop: PROPS }] },
  // Properties while drawing with nothing picked: before, Tool options first; after, Colours first.
  { name: 'props-drawing', size: [1280, 1100], width: 400, prefs, steps: [L.template('bouncing-ball'), L.wait(900), L.key('b'), L.wait(900), top, away, ...settle, { shot: '@', crop: PROPS }] },
  // The picker in the Colours panel: a see-through fill, with the Opacity bar.
  { name: 'colours-opacity', size: [1280, 1000], width: 400, prefs, steps: [L.template('blank-vector'), L.js(`${F}.store().setUi({ fillColor: '#9b7bff80', activeWell: 'fill' })`), L.wait(800), away, ...settle, { shot: '@', crop: [884, 40, 396, 720] }] },
  // The picker opened from the Paint colour in the Pixel workspace.
  { name: 'picker-open', size: [1280, 1000], width: 400, prefs, steps: [...pixel, L.js(`${F}.store().setUi({ color: '#4f9bd1' })`), click('.px-well-paint'), L.wait(500), ...press('.cp-alpha', 'ArrowLeft', 4, true), L.wait(500), ...settle, { shot: '@', crop: [0, 40, 700, 560] }] },
  // A palette colour being given opacity: the picker with its note, then the chip afterwards with a chequerboard behind it.
  { name: 'palette-opacity', size: [1280, 1000], width: 400, prefs, steps: [...pixel, dbl('.px-chip', 3), L.wait(500), ...press('.cp-alpha', 'ArrowLeft', 5, true), L.wait(500), ...settle, { shot: '@', crop: [0, 40, 700, 700] }] },
  { name: 'palette-opacity-done', size: [1280, 1000], width: 400, prefs, steps: [...pixel, dbl('.px-chip', 3), L.wait(500), ...press('.cp-alpha', 'ArrowLeft', 5, true), L.wait(300), L.key('Escape'), L.wait(700), away, ...settle, { shot: '@', crop: [0, 40, 700, 700] }] },
  // Where opacity is deliberately not offered: the document background, with the reason in its place.
  { name: 'opacity-not-offered', size: [1280, 1000], width: 400, prefs, steps: [L.template('blank-vector'), L.wait(500), L.cmd('document.settings'), L.wait(800), click('.ds-bg .cp-chip'), L.wait(600), ...settle, { shot: '@', crop: [200, 150, 880, 820] }] },
  // A layer locked to the palette: the Paint colour's picker says whose opacity paint takes.
  { name: 'opacity-locked', size: [1280, 1000], width: 400, prefs, steps: [...pixel, L.cmd('pixel.paletteLock'), L.wait(500), click('.px-well-paint'), L.wait(600), ...settle, { shot: '@', crop: [0, 40, 700, 560] }] },
];

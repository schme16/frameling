// Looks for Position and size and Align and space out leaving Symbol and motion: Properties with one plain shape picked,
// two plain shapes picked, and a symbol picked. Run once against the old build and once against the new one:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs \
//     --entries scripts/docs/ab-pos-align --renderer <abs dist dir> --out <dir>
const L = require('../help/_lib.cjs');
const F = '__frameling';
const prefs = { reduceMotion: true, showTips: false };
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const away = { move: [640, 762] };
const INK = '#1d1b26';
const rectPath = (x, y, w, h) => ({ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const rect = (id, x, y, w, h, fill) => ({ id, type: 'path', paths: [rectPath(x, y, w, h)], fill, stroke: { color: INK, width: 5, join: 'round', cap: 'round' }, opacity: 1 });
const SHAPES = [rect('pa1', 150, 120, 170, 120, '#ff8fb1'), rect('pa2', 400, 330, 90, 90, '#8fd0ff'), rect('pa3', 560, 90, 130, 70, '#ffd36b')];
const pick = (ids) => L.js(`(() => { const S = ${F}.store(); S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...${JSON.stringify(SHAPES)}); }); S.setUi({ tool: 'select', selection: ${JSON.stringify(ids)} }); })()`);
const top = L.js(`(() => { document.querySelectorAll('.rd-scroll').forEach((e) => (e.scrollTop = 0)); return true; })()`);
// Scrolls Properties so the heading that starts with this text is at the top (Colours is tall, so the rest is below it).
const scrollTo = (text) => L.js(`(() => { const el = [...document.querySelectorAll('h3')].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)})); const sc = document.querySelector('.rd-scroll'); if (!el || !sc) return 'missing'; sc.scrollTop = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 6; return 'ok'; })()`);
const PROPS = [884, 40, 396, 1010];
const pickSymbol = L.js(`(() => { const st = ${F}.store(); const s = st.get(); for (const l of s.doc.layers) { const c = l.cels.find((c) => s.ui.frame >= c.start && s.ui.frame < c.start + c.length); const d = c && s.doc.drawings[c.drawingId]; const i = d && d.kind === 'vector' && d.shapes.find((x) => x.type === 'instance'); if (i) { st.setUi({ activeLayerId: l.id, selection: [i.id], tool: 'select' }); return true; } } return false; })()`);
module.exports = [
  // Selected pixels: Position and size counts whole pixels of the art (before: inside Symbol and motion, which the Pixel workspace tucks away).
  { name: 'pixel-selected', size: [1280, 1100], width: 400, prefs, steps: [L.js(`${F}.dock.applyWorkspace('pixel')`), L.wait(600), L.js(`${F}.template('hero-sprites')`), L.wait(900), L.key('v'), L.wait(300), L.js(`${F}.run('select.all')`), L.wait(600), L.panel('symbol-props'), L.wait(300), L.panel('selection-numbers'), L.wait(900), scrollTo('Position and size'), L.wait(400), away, ...settle, { shot: '@', crop: PROPS }] },
  // What Symbol and motion says with a plain shape picked: before it offered symbol controls and told you to select one; after it is the in-betweens and an honest line.
  { name: 'motion-one-shape', size: [1280, 1100], width: 400, prefs, steps: [L.template('blank-vector'), L.wait(700), pick(['pa1']), L.wait(1200), scrollTo('Symbol and motion'), L.wait(300), away, ...settle, { shot: '@', crop: PROPS }] },
  // The same three, scrolled to where Position and size is (before: inside Symbol and motion; after: its own section).
  { name: 'low-one-shape', size: [1280, 1100], width: 400, prefs, steps: [L.template('blank-vector'), L.wait(700), pick(['pa1']), L.wait(1200), scrollTo('Position and size'), L.wait(300), away, ...settle, { shot: '@', crop: PROPS }] },
  { name: 'low-two-shapes', size: [1280, 1100], width: 400, prefs, steps: [L.template('blank-vector'), L.wait(700), pick(['pa1', 'pa2']), L.wait(1200), scrollTo('Position and size'), L.wait(300), away, ...settle, { shot: '@', crop: PROPS }] },
  { name: 'props-one-shape', size: [1280, 1100], width: 400, prefs, steps: [L.template('blank-vector'), L.wait(700), pick(['pa1']), L.wait(1200), top, away, ...settle, { shot: '@', crop: PROPS }] },
  { name: 'props-two-shapes', size: [1280, 1100], width: 400, prefs, steps: [L.template('blank-vector'), L.wait(700), pick(['pa1', 'pa2']), L.wait(1200), top, away, ...settle, { shot: '@', crop: PROPS }] },
  { name: 'props-symbol', size: [1280, 1100], width: 400, prefs, steps: [L.template('bouncing-logo'), L.js(`${F}.store().setUi({ frame: 30 })`), L.key('v'), L.wait(1000), pickSymbol, L.wait(1500), top, away, ...settle, { shot: '@', crop: PROPS }] },
];

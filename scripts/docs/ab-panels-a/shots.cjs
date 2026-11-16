// Looks for the panels-a branch: Properties before and after the "Also here" block went, full height, and the Panels list
// with its new "Shows up when you ..." lines. Run once against the old build and once against the new one:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs \
//     --entries scripts/docs/ab-panels-a --renderer <abs dist/renderer> --out <dir>
const L = require('../help/_lib.cjs');
const clickText = (sel, text) =>
  L.js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); if (!el) throw new Error('clickText: ' + ${JSON.stringify(text)}); el.click(); return true; })()`);
// Focus the search box and type into it the way React notices.
const type = (sel, text) =>
  L.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const prefs = { reduceMotion: true };
// A tall window so the whole right side fits: a vector layer with nothing picked.
const ball = [L.template('bouncing-ball'), L.wait(900), L.key('v'), L.wait(300), L.wait(1200)];
const list = [L.template('bouncing-ball'), L.wait(800), clickText('[data-panels-button]', 'Panels'), L.wait(900)];
module.exports = [
  { name: 'props-full', size: [1280, 1750], width: 400, prefs, steps: [...ball, ...settle, { shot: '@', crop: [884, 0, 396, 1750] }] },
  { name: 'panels-list', size: [1280, 1000], width: 560, prefs, steps: [...list, ...settle, { shot: '@', crop: [740, 100, 540, 800] }] },
  {
    name: 'panels-find-pixel',
    size: [1280, 1000],
    width: 560,
    prefs,
    steps: [...list, type('input[aria-label="Find a panel"]', 'pixel'), L.wait(900), ...settle, { shot: '@', crop: [740, 100, 540, 800] }],
  },
];

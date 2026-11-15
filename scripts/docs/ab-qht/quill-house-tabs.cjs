// Looks for quill-house-tabs: Quill's panel as it was (him, the presents and the things stacked in one long panel) against
// the house with its three tabs. The same entries run on both builds; AB_SIDE names the files (before or after).
// Run: AB_SIDE=after SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-qht --out brand/ab/quill-house-tabs
const L = require('../help/_lib.cjs');
const side = process.env.AB_SIDE || 'after';
const CALM = { reduceMotion: true, firstDrawn: true, showTips: false };
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
// The whole right side: the panel rail and the Quill panel beside it.
const tagRail = L.js(`(() => { const b = document.querySelector('.qp-panel').closest('.rd-body'); const el = b.parentElement; el.setAttribute('data-shot', ''); return true; })()`);
// After: click the tab. Before: those parts were stacked in the one panel, so scroll to them.
const goTo = (tab, before) =>
  L.js(`(() => { const t = [...document.querySelectorAll('.qp-tabs .ui-seg')].find((e) => e.textContent.startsWith(${JSON.stringify(tab)}));
    if (t) { t.click(); return 'tab'; }
    const sc = document.querySelector('.rd-scroll'); const el = ${before}; if (el) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8; return 'scroll'; })()`);
const start = [
  L.template('bouncing-ball'), L.wait(800), L.panel('quill-pet'), L.wait(900),
  // Give him three frames (on His things, where the button is, once the tabs exist), then let him make one present.
  L.js(`(() => { const t = [...document.querySelectorAll('.qp-tabs .ui-seg')].find((e) => e.textContent.startsWith('His things')); if (t) t.click(); return true; })()`), L.wait(500),
  L.js(`(() => { const s = __frameling.store(); for (const f of [0, 6, 12]) { s.setUi({ frame: f }); document.querySelector('.qp-give').click(); } return true; })()`), L.wait(2200),
  L.js(`__framelingQuillPet.present()`), L.wait(1800),
  L.js(`(() => { const t = [...document.querySelectorAll('.qp-tabs .ui-seg')].find((e) => e.textContent.startsWith('Room')); if (t) t.click(); return true; })()`), L.wait(500),
];
const still = (name, tab, before) => ({
  name: `${side}-${name}`,
  prefs: CALM,
  size: [1280, 800],
  steps: [...start, goTo(tab, before), L.wait(700), ...settle, tagRail, { shot: '@', el: '[data-shot]', pad: 4 }],
});
module.exports = [
  still('room', 'Room', 'document.querySelector(".rd-scroll")'),
  still('things', 'His things', 'document.querySelector(\'[data-help="quill-things"]\')'),
  still('presents', 'Presents', 'document.querySelector(\'.qt-shelf\')'),
];

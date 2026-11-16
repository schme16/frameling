// Quill's room before and after it fills with what you made (brand/ab/quill-house-your-work): the same room empty, then
// with one drawing on the wall and one sprite on the floor, then the same with Stream-safe on. Once per theme. Names: <a|b|c>-<what>.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-quill-your-work --out <raw dir>
//   python3 scripts/docs/ab-quill-your-work/sheet.py <raw dir> brand/ab/quill-house-your-work
// The room is still (Reduce motion on) so both look the same but for what hangs and lies in it.
const L = require('../help/_lib.cjs');
const Q = 'window.__framelingQuillPet';
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const tag = L.js(`(() => { document.querySelectorAll('[data-shot]').forEach((e) => e.removeAttribute('data-shot')); document.querySelector('.qp-stage').setAttribute('data-shot', '1'); return true; })()`);
// Your drawing: the open bouncing ball. Your sprite: the open hero sprites. Made through the debug hook, because the
// real way (drawing in it and saving to a file) needs a file picker.
const mine = [
  L.js(`${Q}.made.clear()`),
  L.js(`${Q}.made.fromOpen('Bouncing ball', 6)`),
  L.template('hero-sprites'),
  L.wait(800),
  L.js(`${Q}.made.fromOpen('Hero', 0)`),
];
const entry = (name, steps, prefs = {}) => ({
  name,
  prefs: { reduceMotion: true, showQuill: true, ...prefs },
  steps: [L.template('bouncing-ball'), L.wait(800), L.js(`${Q}.made.clear()`), L.panel('quill-pet'), L.wait(900), ...steps, L.wait(900), ...settle, tag, { shot: '@', el: '[data-shot]', pad: 6 }],
});

module.exports = [
  entry('a-empty', []),
  entry('b-yours', mine),
  entry('c-stream-safe', [...mine, L.js('__frameling.prefs.set({ streamSafe: true })')]),
];

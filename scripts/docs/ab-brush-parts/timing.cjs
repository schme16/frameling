// How long each list takes to open, cold (the first time, pictures not drawn yet) and warm (the second time, pictures kept):
// the Brush, Tip, Stick and Paper lists. Click to the frame after the rows are on screen. Five fresh pages, so a median can be read.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-parts --only t1,t2,t3,t4,t5 --theme dark --renderer <dist/renderer> --out <dir>
// Nothing else should be running while it measures.
const L = require('../help/_lib.cjs');

// The window here is hidden, so animation frames come about once a second and say nothing about the work. So the rows draw at
// once (no IntersectionObserver, which only fires on a frame), and this waits on message ports, which are not held back, until
// the list is on screen and its pictures have stopped coming. What it times is the script work: building the rows and drawing.
const open = (sel, name) => `(async () => {
  const b = document.querySelector(${JSON.stringify(sel)});
  if (!b) return null;
  const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  const t0 = performance.now();
  b.click();
  let last = -1, same = 0;
  while (same < 4 && performance.now() - t0 < 4000) {
    await tick();
    const n = document.querySelectorAll('.pk-pop canvas').length;
    same = n > 0 && n === last ? same + 1 : 0;
    last = n;
  }
  const ms = performance.now() - t0;
  const n = document.querySelectorAll('.pk-pop canvas').length;
  b.click();
  await new Promise((r) => setTimeout(r, 400));
  return [${JSON.stringify(name)}, Math.round(ms * 10) / 10, n];
})()`;
const lists = [
  ['[data-testid="brush-presets"] .pk-btn', 'brush'],
  ['[data-testid="brush-tips"] .pk-btn', 'tip'],
  ['[data-testid="brush-stick"] .pk-btn', 'stick'],
  ['[data-control="paper-choice"] .pk-btn', 'paper'],
];
const entry = (n) => ({
  name: `t${n}`,
  prefs: { firstDrawn: true, showTips: false, showQuill: false },
  size: [1400, 1000],
  width: 400,
  steps: [
    L.js('window.IntersectionObserver = undefined'), L.template('blank-vector'), L.cmd('tools.brush'), L.wait(700), L.js(`__frameling.run('brush.pick.starter:sketch-pencil')`), L.wait(3500),
    ...lists.flatMap(([sel, name]) => [{ log: open(sel, name + ' cold') }]),
    L.wait(600),
    ...lists.flatMap(([sel, name]) => [{ log: open(sel, name + ' warm') }]),
    { shot: '@', crop: [0, 0, 8, 8] },
  ],
});
module.exports = [1, 2, 3, 4, 5].map(entry);

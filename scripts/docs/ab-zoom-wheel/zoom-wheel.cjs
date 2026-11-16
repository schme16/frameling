// One wheel click on a screen scaled to 1.75 (brand/ab/zoom-wheel). Such a screen reports 175 for a notch where a plain
// one reports 100. Before: that 175 went straight into the zoom (+47%), and Ctrl pressed out of habit made it +133%.
// After: the scaling is divided back out (+25% a click) and Ctrl on a zooming wheel is the same as the wheel alone.
// Run once per build, with --renderer pointing at that build and --out at brand/ab/zoom-wheel/<before|after>:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-zoom-wheel --renderer <dir> --out <dir>
const L = require('../help/_lib.cjs');
const { view: stageView, STAGE } = require('../help/_shapes.cjs');
const away = { move: [720, 28] };
const view = stageView(0.5);
// Where the wheel turns: a spot a little left of the stage's middle (65 pixels, as it was), found from the stage as it is now.
const SPOT = `const b = document.querySelector('.cv-layer').getBoundingClientRect(); const x = Math.round(b.x + b.width / 2 - 65), y = Math.round(b.y + b.height / 2 + 1);`;
// A wheel notch on a 1.75 screen, as the page receives it: 175 pixels, with or without Ctrl.
const click = (ctrl) =>
  L.js(`(() => {
    ${SPOT}
    const el = document.elementFromPoint(x, y);
    Object.defineProperty(window, 'devicePixelRatio', { get: () => 1.75, configurable: true });
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -175, deltaMode: 0, ctrlKey: ${ctrl}, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    delete window.devicePixelRatio;
  })()`);
module.exports = [
  {
    name: 'one-click',
    prefs: { firstDrawn: true, showTips: false, showWelcome: false, reduceMotion: true },
    steps: [L.template('bouncing-ball'), view, L.wait(800), away, { shot: 'warm', crop: [0, 0, 32, 32] }, { rec: '@', crop: STAGE, every: 50 }, L.wait(800),
      click(false), L.wait(1400), click(true), L.wait(1600), { rec: 'stop' }],
  },
];

// One wheel click on a screen scaled to 1.75 (brand/ab/zoom-wheel). Such a screen reports 175 for a notch where a plain
// one reports 100. Before: that 175 went straight into the zoom (+47%), and Ctrl pressed out of habit made it +133%.
// After: the scaling is divided back out (+25% a click) and Ctrl on a zooming wheel is the same as the wheel alone.
// Run once per build, with --renderer pointing at that build and --out at brand/ab/zoom-wheel/<before|after>:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-zoom-wheel --renderer <dir> --out <dir>
const L = require('../help/_lib.cjs');
const away = { move: [720, 28] };
const view = L.js('__frameling.store().setUi({ zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5 })');
// A wheel notch on a 1.75 screen, as the page receives it: 175 pixels, with or without Ctrl.
const click = (ctrl) =>
  L.js(`(() => {
    const el = document.elementFromPoint(430, 270);
    Object.defineProperty(window, 'devicePixelRatio', { get: () => 1.75, configurable: true });
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -175, deltaMode: 0, ctrlKey: ${ctrl}, clientX: 430, clientY: 270, bubbles: true, cancelable: true }));
    delete window.devicePixelRatio;
  })()`);
module.exports = [
  {
    name: 'one-click',
    prefs: { firstDrawn: true, showTips: false, showWelcome: false, reduceMotion: true },
    steps: [L.template('bouncing-ball'), view, L.wait(800), away, { shot: 'warm', crop: [0, 0, 32, 32] }, { rec: '@', crop: [113, 47, 764, 444], every: 50 }, L.wait(800),
      click(false), L.wait(1400), click(true), L.wait(1600), { rec: 'stop' }],
  },
];

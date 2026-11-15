// Four notches of a wheel that says 45 pixels a notch (brand/ab/zoom-notch). A plain wheel says 100, and the zoom was
// tuned for that, so on this wheel each notch zoomed about +10% where it should be about +25%.
// Before: the 45 goes straight in (+10% a notch). After: Frameling has learned this wheel's notch, so it is +25% a notch.
// The wheel gets a few turns first, off camera, as it would from anyone who has used it for a minute.
// Run once per build, with --renderer pointing at that build and --out at a folder to collect the clips in:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-zoom-notch --renderer <dir> --out <dir>
const L = require('../help/_lib.cjs');
const away = { move: [720, 28] };
const view = L.js('__frameling.store().setUi({ zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5 })');
// One notch of a 45 pixel wheel, as the page receives it.
const notch = L.js(`(() => {
    const el = document.elementFromPoint(430, 270);
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -45, deltaMode: 0, clientX: 430, clientY: 270, bubbles: true, cancelable: true }));
  })()`);
module.exports = [
  {
    name: 'one-notch',
    prefs: { firstDrawn: true, showTips: false, showWelcome: false, reduceMotion: true },
    steps: [L.template('bouncing-ball'), view, L.wait(600), notch, L.wait(300), notch, L.wait(300), notch, L.wait(300), notch, L.wait(300), view, L.wait(800), away,
      { shot: 'warm', crop: [0, 0, 32, 32] }, { rec: '@', crop: [113, 47, 764, 444], every: 50 }, L.wait(800),
      notch, L.wait(900), notch, L.wait(900), notch, L.wait(900), notch, L.wait(1500), { rec: 'stop' }],
  },
];

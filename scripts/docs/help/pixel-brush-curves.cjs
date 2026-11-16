// The help clip for the pen response curve: four strokes with the same press from light to hard, one with the pen straight, then a light touch,
// a firm hand, and a shape dragged by hand, the graph changing as the options show it. (The pictures are in scripts/docs/ab-brush-engine2.)
const C = require('../ab-brush-engine2/_curves.cjs');
const { L } = C;

module.exports = [
  {
    name: 'pixel-brush-curves',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    width: 800,
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...C.start(160), C.fill,
      C.whole(C.BRUSH), C.open('pixel-brush-dynamics'), L.wait(300), C.scrollTo('pixel-brush-dynamics'), C.open('pixel-brush-curve-size'), L.wait(500),
      { rec: '@', every: 80 }, L.wait(800),
      C.draw(C.ramp(24), C.pen), L.wait(900),
      C.feel('Light touch'), L.wait(900), C.draw(C.ramp(62), C.pen), L.wait(900),
      C.feel('Firm hand'), L.wait(900), C.draw(C.ramp(100), C.pen), L.wait(900),
      C.feel('Even'), L.wait(500), C.addDot(0.5), L.wait(400), C.dragDot(1, 0.5, 0.92), L.wait(500), C.draw(C.ramp(138), C.pen),
      C.away, L.wait(1500), { rec: 'stop' },
    ],
  },
];

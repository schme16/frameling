// The help picture for the Clone stamp: a hillside with dust and a hair in the sky, mostly cloned out, with the cross on the spot
// being copied and the ring showing where the copy comes from now. (The before and after, and the clip, are in scripts/docs/ab-clone-curves.)
const S = require('../ab-clone-curves/_scene.cjs');
const { L, paint, start, draw, hover, retouch, pick, away, line } = S;

module.exports = [
  {
    name: 'clone-stamp',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    choices: { 'clone.align': 'aligned' },
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(128),
      paint({ dirt: true }), L.wait(300),
      retouch('clone', { sample: 'layer', brush: { size: 11, hardness: 0.8 } }),
      pick('clone-stamp'), L.wait(200),
      // Choose clean sky 40 pixels to the right of the dirt, then paint over the specks and the hair.
      draw([[80, 14, 0.5]], { alt: true }),
      draw(line(41, 15, 34, 12, 8)), draw(line(30, 10, 52, 40, 40)), draw(line(49, 29, 52, 32, 4)),
      hover(22, 36),
      away, L.wait(3200), { shot: '@' },
    ],
  },
];

// Picture tips from the editor: three strokes, each stamped with a tip that came in a different way. From the top: a soft
// flower seeded into the editor, a smiley from a PNG file (ink on white, so the dark parts became the brush), and a red heart from a
// PNG with see-through corners, in its own colours. Each goes in through the editor and its "Use this tip" button.
const P = require('./_pics.cjs');
const { L, start, draw, whole, wave, away, shot } = P;
module.exports = [
  {
    name: 'tip',
    prefs: { firstDrawn: true, showTips: false },
    choices: { 'brush.imageTipReading': 'dark', 'brush.pixelStampColours': 'own' },
    width: 900,
    steps: [
      ...start(160),
      whole({ tip: 'round', size: 9, spacing: 1.3, aliased: true }),
      L.js(`__framelingDab.editor(${JSON.stringify(P.flower())})`), L.wait(400), P.useTip, L.wait(300),
      P.dabSet({ size: 11, spacing: 1.4, scatter: 0.1 }), draw(wave(24, 6, 14, 146, 24)),
      whole({ tip: 'round', size: 9, spacing: 1.3, aliased: true }),
      P.run(`await __framelingDab.editorFromBytes(await ${P.SMILEY})`), L.wait(500), P.useTip, L.wait(300),
      P.dabSet({ size: 15, spacing: 1.3 }), draw(wave(76, 6, 14, 146, 24)),
      whole({ tip: 'round', size: 9, spacing: 1.3, aliased: true }),
      P.run(`await __framelingDab.editorFromBytes(await ${P.HEART})`), L.wait(500), P.useTip, L.wait(300),
      P.dabSet({ size: 15, spacing: 1.3 }), draw(wave(128, 6, 14, 146, 24)),
      away, L.wait(500), shot,
    ],
  },
  {
    // The editor itself, drawn on: the flower in it, the real brush beside it.
    name: 'editor',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      ...start(160),
      L.js(`__framelingDab.editor(${JSON.stringify(P.flower())})`), L.wait(700), away, L.wait(500),
      { shot: '@', el: '.io-modal', pad: 10 },
    ],
  },
  {
    // The editor opened on a picture file: the smiley shrunk to fit, with the choice it asked once already answered.
    name: 'editor-file',
    prefs: { firstDrawn: true, showTips: false },
    choices: { 'brush.imageTipReading': 'dark' },
    width: 1000,
    steps: [
      ...start(160),
      P.run(`await __framelingDab.editorFromBytes(await ${P.SMILEY})`), L.wait(700), away, L.wait(500),
      { shot: '@', el: '.io-modal', pad: 10 },
    ],
  },
];

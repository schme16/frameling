// Help picture for diamond gradients: a card with a diamond gradient picked, the Colours panel saying Diamond.
const { T, view, put, away, rect, stroke, INK, WARM, dom } = require('./_shapes.cjs');

const CARD = [{ at: 0, color: '#c9d4ff' }, { at: 1, color: '#3a4a8c' }];
const GEM = [{ at: 0, color: '#fff7c2' }, { at: 0.5, color: '#ff7a90' }, { at: 1, color: '#4b4fd0' }];

module.exports = [
  {
    name: 'gradient-diamond',
    prefs: { showTips: false, firstDrawn: true, showQuill: false, reduceMotion: true },
    steps: [
      T('blank-vector'),
      view(1.12, 455, 250),
      put('Lines', [
        { ...rect(150, 110, 300, 200, CARD[0].color, stroke(INK, 5)), fillGradient: { kind: 'diamond', stops: CARD, from: { x: 300, y: 210 }, to: { x: 450, y: 210 } } },
        { ...rect(520, 150, 140, 140, GEM[0].color, stroke(INK, 5)), fillGradient: { kind: 'diamond', stops: GEM, from: { x: 590, y: 220 }, to: { x: 660, y: 220 } } },
      ], [0]),
      away,
      dom('0'),
      dom(`__frameling.showPanel('colors')`),
      { wait: 900 },
      { move: [720, 28] },
      { shot: '@', crop: [0, 0, 1280, 660] },
    ],
  },
];

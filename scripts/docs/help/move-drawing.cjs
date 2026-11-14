// Help picture for Move a drawing without redrawing it: one mushroom drawing held on six keys that bob up and down by
// moving it, so the timeline shows six blocks with the corner mark and the library holds a single drawing (see scripts/docs/help-media.cjs).
const L = require('./_lib.cjs');
const { pixelMushroom } = require('./_convert-art.cjs');

// One drawing on six one-frame keys, each moved up or down by a pixel step or two (the layer's own pixel size).
const BOB = L.js(`(() => {
  const S = __frameling.store();
  S.update('bob', (d) => {
    const l = d.layers.find((x) => x.name === 'Sprite') ?? d.layers[0];
    const id = l.cels[0].drawingId;
    const step = l.pixelSize || 1;
    const ys = [0, -1, -2, -1, 0, 1];
    d.length = 6;
    l.cels = ys.map((y, i) => ({ id: 'bob' + i, start: i, length: 1, drawingId: id, ...(y ? { offset: { x: 0, y: y * step } } : {}) }));
  });
  const l = S.get().doc.layers.find((x) => x.name === 'Sprite') ?? S.get().doc.layers[0];
  S.setUi({ activeLayerId: l.id, frame: 2 });
})()`);

module.exports = [
  {
    name: 'timeline-move-drawing',
    size: [1280, 900],
    steps: [L.template('blank-pixel'), pixelMushroom, L.js(`__frameling.dock.applyWorkspace('animate')`), L.wait(1200), BOB, L.wait(1200), { click: [728, 811], after: 600 }, { move: [640, 20] }, L.wait(400), { shot: '@', crop: [144, 48, 736, 816] }],
  },
];

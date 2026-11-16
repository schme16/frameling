// Help clip for a symbol that holds a whole animation: a pixel slime with four squashing drawings on one layer becomes
// one looping symbol (Shift+F8), two smaller copies are placed out of step with it, and all three play.
// Window as in pixel-gaps.cjs: a 320 x 200 stage at zoom 1.8 sits at (207, 89).
const L = require('./_lib.cjs');

// A slime of four drawings: squashed, tall, stretched, tall again (width and height change), each held two frames.
const SLIME = String.raw`(() => {
  const st = window.__frameling.store;
  const gw = 40, gh = 25, PS = 8;
  const shapes = [[10, 5], [8, 7], [7, 9], [8, 7]];
  const drawings = {};
  const cels = [];
  shapes.forEach(([rx, ry], i) => {
    const px = new Uint8ClampedArray(gw * gh * 4);
    const put = (x, y, c) => { px.set(c, (y * gw + x) * 4); };
    const cx = 20, base = 17;
    const cy = base - ry;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (v <= 1) put(x, y, v > 0.72 ? [30, 90, 60, 255] : v > 0.35 ? [74, 190, 120, 255] : [120, 225, 150, 255]);
    }
    // Eyes and a mouth follow the body's height.
    const ey = cy - Math.round(ry * 0.2);
    for (const ex of [cx - 3, cx + 2]) { put(ex, ey, [255, 255, 255, 255]); put(ex + 1, ey, [255, 255, 255, 255]); put(ex + 1, ey + 1, [30, 30, 60, 255]); put(ex, ey + 1, [255, 255, 255, 255]); }
    for (let x = cx - 1; x <= cx + 2; x++) put(x, ey + 3, [30, 60, 40, 255]);
    const id = 'p-slime-' + i;
    drawings[id] = { id, kind: 'pixel', width: gw, height: gh, pixels: px };
    cels.push({ id: 'c-slime-' + i, start: i * 2, length: 2, drawingId: id });
  });
  st().update('setup', (d) => {
    d.width = gw * PS; d.height = gh * PS; d.length = 8; d.fps = 6; d.background = '#fdfaf3';
    d.drawings = drawings;
    d.layers = [{ id: 'l-slime', name: 'Slime', kind: 'pixel', pixelSize: PS, visible: true, locked: false, opacity: 1, cels }];
  });
  st().setUi({ activeLayerId: 'l-slime', frame: 0, tool: 'select', selection: [], zoom: 1.8, panX: 94, panY: 42 });
  return true;
})()
`;

// Two smaller copies on their own layers, turned and started on other frames so they bounce out of step.
const COPIES = String.raw`(() => {
  const st = window.__frameling.store;
  const { doc } = st().get();
  const src = doc.layers[0];
  const inst = doc.drawings[src.cels[0].drawingId].shapes.find((s) => s.type === 'instance');
  const mk = (n, x, y, s, rot, first) => {
    const vid = 'v-copy-' + n;
    const i2 = { ...JSON.parse(JSON.stringify(inst)), id: 'i-copy-' + n, firstFrame: first };
    i2.transform = { ...i2.transform, x, y, scaleX: s, scaleY: s, rotation: rot };
    return { vid, layer: { id: 'l-copy-' + n, name: 'Copy ' + n, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'c-copy-' + n, start: 0, length: 8, drawingId: vid }] }, drawing: { id: vid, kind: 'vector', shapes: [i2] } };
  };
  const a = mk(1, 62, 140, 0.6, -14, 2);
  const b = mk(2, 262, 140, 0.6, 14, 4);
  st().update('copies', (d) => {
    for (const c of [a, b]) { d.drawings[c.vid] = c.drawing; d.layers.push(c.layer); }
  });
  st().setUi({ frame: 0, selection: [] });
  return true;
})()
`;

const entries = [
  {
    name: 'symbols-frames',
    steps: [
      L.js(SLIME),
      L.wait(700),
      { rec: '@', crop: [108, 44, 1172, 716], every: 80 },
      L.wait(1500),
      L.cmd('symbols.makeFrames'),
      L.wait(2600),
      L.js(COPIES),
      L.wait(1800),
      L.cmd('timeline.play'),
      L.wait(5200),
      L.cmd('timeline.play'),
      L.wait(300),
      { rec: 'stop' },
    ],
  },
];

module.exports = Object.assign(
  entries.map((e) => ({ ...e, prefs: { firstDrawn: true, showTips: false, ...(e.prefs ?? {}) } })),
  // The scene, for the A/B entries in scripts/docs/ab.
  { SLIME, COPIES },
);

// The two documents the cel-offset looks use, as data both the Electron entries and the node scripts read (files starting with _ aren't entries).
const L = require('../help/_lib.cjs');

// ---- A sheet with folders: a ground, a folder that fades two overlapping orbs together, and a folder that multiplies a shadow.
const SIZE = 16; // art pixels each way
const PS = 4; // document pixels per art pixel
const block = (x0, y0, x1, y1, rgba) => {
  const dots = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dots.push([x, y, rgba]);
  return dots;
};
const LAYERS = [
  { id: 'ground', name: 'Ground', folder: null, dots: block(0, 9, 15, 15, [92, 128, 170, 255]) },
  { id: 'orbA', name: 'Orb A', folder: 'glow', dots: block(2, 2, 9, 9, [235, 64, 64, 255]) },
  { id: 'orbB', name: 'Orb B', folder: 'glow', dots: block(6, 5, 13, 12, [60, 90, 235, 255]) },
  { id: 'shade', name: 'Shadow', folder: 'shadow', dots: block(1, 8, 14, 14, [235, 210, 90, 255]) },
];
const FOLDERS = {
  glow: { id: 'glow', name: 'Glow', visible: true, opacity: 0.5 },
  shadow: { id: 'shadow', name: 'Shadow', visible: true, opacity: 1, blend: 'multiply' },
};

/** Page code that replaces the open document with the folder sheet document. */
const foldersInPage = L.js(`(() => {
  const S = __frameling.store(); const SIZE = ${SIZE}, PS = ${PS};
  const layers = ${JSON.stringify(LAYERS)}; const folders = ${JSON.stringify(FOLDERS)};
  S.update('setup', (d) => {
    d.width = SIZE * PS; d.height = SIZE * PS; d.length = 1; d.background = null; d.folders = folders; d.drawings = {}; d.layers = [];
    for (const l of layers) {
      const px = new Uint8ClampedArray(SIZE * SIZE * 4);
      for (const [x, y, c] of l.dots) px.set(c, (y * SIZE + x) * 4);
      const did = 'd-' + l.id;
      d.drawings[did] = { id: did, kind: 'pixel', width: SIZE, height: SIZE, pixels: px };
      d.layers.push({ id: l.id, name: l.name, kind: 'pixel', pixelSize: PS, visible: true, locked: false, opacity: 1, ...(l.folder ? { folder: l.folder } : {}), cels: [{ id: 'c-' + l.id, start: 0, length: 1, drawingId: did }] });
    }
  });
  S.setUi({ activeLayerId: 'ground', frame: 0 });
})()`);

// ---- A bob: one mushroom-ish drawing on six keys, drawn again for each position (before) or moved (after).
const BOB = [0, -1, -2, -1, 0, 1];
const bobDoc = (moved) => L.js(`(() => {
  const S = __frameling.store(); const ys = ${JSON.stringify(BOB)}; const moved = ${moved};
  S.update('bob', (d) => {
    const l = d.layers.find((x) => x.name === 'Sprite') ?? d.layers[0];
    const src = d.drawings[l.cels[0].drawingId];
    const step = l.pixelSize || 1;
    d.length = ys.length;
    l.cels = ys.map((y, i) => {
      let did = l.cels[0].drawingId;
      if (!moved) {
        // Drawn again at each position: a copy of the picture with its rows moved.
        const w = src.width, h = src.height; const px = new Uint8ClampedArray(src.pixels.length);
        for (let r = 0; r < h; r++) { const to = r + y; if (to < 0 || to >= h) continue; px.set(src.pixels.subarray(r * w * 4, (r + 1) * w * 4), to * w * 4); }
        did = 'bobp' + i; d.drawings[did] = { ...src, id: did, pixels: px };
      }
      return { id: 'bob' + i, start: i, length: 1, drawingId: did, ...(moved && y ? { offset: { x: 0, y: y * step } } : {}) };
    });
    if (!moved) delete d.drawings[src.id];
  });
  const l = S.get().doc.layers.find((x) => x.name === 'Sprite') ?? S.get().doc.layers[0];
  S.setUi({ activeLayerId: l.id, frame: 2 });
})()`);

module.exports = { LAYERS, FOLDERS, SIZE, PS, foldersInPage, bobDoc };

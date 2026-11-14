// Help picture for Pixel text: a small night scene on a pixel layer, with words typed in the Classic font and the
// Text tool's pixel options showing. Also used for the look in brand/ab/pixel-text.
const L = require('./_lib.cjs');
const F = '__frameling';

const W = 80;
const H = 40;
// Paints a sky with a few stars, a hill and a moon straight into the pixel layer (loads as a new document, no undo steps).
const scene = L.js(`(() => {
  const st = ${F}.store(); const d = structuredClone(st.get().doc);
  const lay = d.layers.find((l) => l.kind === 'pixel'); const cel = lay.cels[0]; const dr = d.drawings[cel.drawingId];
  const w = ${W}, h = ${H};
  d.width = w * lay.pixelSize; d.height = h * lay.pixelSize;
  const px = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, hex) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const n = parseInt(hex.slice(1), 16); px.set([n >> 16, (n >> 8) & 255, n & 255, 255], (y * w + x) * 4); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, y < 12 ? '#1d2b53' : y < 22 ? '#2b3f7a' : '#3b5ba5');
  for (let x = 0; x < w; x++) { const top = 26 + Math.round(2 * Math.sin(x / 6)); for (let y = top; y < h; y++) put(x, y, y === top ? '#6fb06a' : '#3d7a4a'); }
  for (const [x, y] of [[5, 3], [14, 8], [22, 2], [33, 6], [41, 3], [72, 9], [76, 2], [9, 14], [60, 15]]) put(x, y, '#fff1c9');
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 17 && (x - 2) * (x - 2) + (y + 1) * (y + 1) > 9) put(69 + x, 7 + y, '#ffe9a8');
  d.drawings[cel.drawingId] = { ...dr, width: w, height: h, pixels: px };
  st.load(d);
})()`);

const at = (cx, cy) => [Math.round(471 + (cx + 0.5) * 8), Math.round(208 + (cy + 0.5) * 8)];

// Puts the stage's top left at a known place on the screen, whatever the tool options bar did to the layout.
const pin = L.js(`(() => { const r = document.querySelector('.cv-layer').getBoundingClientRect(); ${F}.store().setUi({ panX: 471 - r.x, panY: 208 - r.y }); })()`);
const SCENE = { scene, at, pin };
module.exports = [
  {
    name: 'pixel-text',
    prefs: { showTips: false, firstDrawn: true },
    size: [1500, 900],
    width: 900,
    steps: [
      L.js(`${F}.dock.applyWorkspace('pixel')`),
      L.wait(500),
      L.template('blank-pixel'),
      L.wait(300),
      scene,
      L.wait(300),
      L.js(`${F}.store().setUi({ color: '#fff1c9', tool: 'text' })`),
      L.js(`${F}.run('view.zoom100')`),
      L.js(`${F}.run('view.center')`),
      L.wait(400),
      L.wait(300),
      { click: [1450, 80] },
      L.wait(400),
      L.js(`(() => { const r = document.querySelector('.cv-layer').getBoundingClientRect(); ${F}.store().setUi({ panX: 471 - r.x, panY: 208 - r.y }); })()`),
      L.wait(300),
      // Art pixel (cx, cy) on the screen, from where the canvas sits at 100% (measured with a log step in this entry).
      { click: at(4, 4) },
      L.wait(300),
      { type: 'Moon Hill' },
      L.wait(200),
      { key: 'Escape' },
      L.wait(300),
      L.js(`${F}.run('text.pixelFont.tiny')`),
      L.js(`${F}.store().setUi({ color: '#cfeaff' })`),
      { click: at(4, 17) },
      L.wait(300),
      { type: 'frogs welcome' },
      L.wait(200),
      { key: 'Escape' },
      L.wait(300),
      L.js(`${F}.run('text.pixelFont.classic')`),
      L.js(`${F}.store().setUi({ color: '#ffe9a8' })`),
      { click: at(4, 26) },
      L.wait(300),
      { type: 'Type here' },
      L.wait(500),
      { move: [1100, 800] },
      L.wait(300),
      { shot: '@', crop: [433, 47, 1067, 520] },
    ],
  },
];

module.exports.SCENE = SCENE;

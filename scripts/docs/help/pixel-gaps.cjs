// Help pictures for pixel layers under the paint bucket and in symbols. See help-media.cjs for the entry format.
const L = require('./_lib.cjs');

// A blob face drawn in ink on a pixel layer called Lines, with an empty pixel layer called Colour under it.
const FACE = String.raw`(() => {
  const st = window.__frameling.store;
  const gw = 80, gh = 50, PS = 4;
  const lines = new Uint8ClampedArray(gw * gh * 4);
  const put = (x, y, c) => { const i = (y * gw + x) * 4; lines.set(c, i); };
  // A rounded blob with an inner eye and mouth, in dark ink, one pixel wide.
  const ell = (cx, cy, rx, ry, c) => {
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (v <= 1 && v > 1 - 2.2 / Math.min(rx, ry)) put(x, y, c);
    }
  };
  const ink = [40, 30, 60, 255];
  ell(40, 25, 26, 20, ink);
  ell(31, 20, 4, 5, ink);
  ell(49, 20, 4, 5, ink);
  for (let x = 31; x <= 49; x++) { const y = 33 + Math.round(((x - 40) ** 2) / 22); put(x, y, ink); }
  const ids = { pc: 'p-colour', pl: 'p-lines' };
  st().update('setup', (d) => {
    d.width = gw * PS; d.height = gh * PS; d.length = 12; d.background = '#fdfaf3';
    d.drawings = { [ids.pl]: { id: ids.pl, kind: 'pixel', width: gw, height: gh, pixels: lines } };
    d.layers = [
      { id: 'l-colour', name: 'Colour', kind: 'pixel', pixelSize: PS, visible: true, locked: false, opacity: 1, cels: [] },
      { id: 'l-lines', name: 'Lines', kind: 'pixel', pixelSize: PS, visible: true, locked: false, opacity: 1, cels: [{ id: 'c-l', start: 0, length: 12, drawingId: ids.pl }] },
    ];
  });
  st().setUi({ activeLayerId: 'l-colour', frame: 0, tool: 'fill', fillColor: '#f2a33a', selection: [] });
  return true;
})()
`;
// A little slime on a pixel layer called Slime.
const SLIME = String.raw`(() => {
  const st = window.__frameling.store;
  const gw = 40, gh = 25, PS = 8;
  const art = [
    '....kkkkkk....',
    '..kkggggggkk..',
    '.kggggggggggk.',
    '.kgwwgggwwggk.',
    'kggwkgggwkgggk',
    'kggggggggggggk',
    'kgrrggggggrrgk',
    'kgggggkkgggggk',
    '.kggggggggggk.',
    '..kkkkkkkkkk..',
  ];
  const pal = { k: [38, 28, 58, 255], g: [92, 200, 120, 255], w: [255, 255, 255, 255], r: [240, 130, 140, 255] };
  const px = new Uint8ClampedArray(gw * gh * 4);
  art.forEach((row, y) => [...row].forEach((c, x) => { if (pal[c]) px.set(pal[c], ((y + 12) * gw + x + 5) * 4); }));
  st().update('setup', (d) => {
    d.width = gw * PS; d.height = gh * PS; d.length = 12; d.background = '#fdfaf3';
    d.drawings = { 'p-hero': { id: 'p-hero', kind: 'pixel', width: gw, height: gh, pixels: px } };
    d.layers = [{ id: 'l-hero', name: 'Slime', kind: 'pixel', pixelSize: PS, visible: true, locked: false, opacity: 1, cels: [{ id: 'c1', start: 0, length: 12, drawingId: 'p-hero' }] }];
  });
  st().setUi({ activeLayerId: 'l-hero', frame: 0, tool: 'select', selection: [], zoom: 2.1, panX: 164, panY: 12 });
  return true;
})()
`;

// The 1280 x 800 window: the canvas is x 113-877, y 47-491. A 320 x 200 stage at zoom 1.8 sits at (207, 89).
const view = L.js(`__frameling.store().setUi({ zoom: 1.8, panX: 94, panY: 42 })`);

const entries = [
  {
    name: 'fill-pixel',
    steps: [
      L.js(FACE),
      view,
      L.js(`__frameling.run('fill.allLayers')`),
      L.wait(400),
      { click: [495, 287] },
      L.wait(300),
      L.js(`__frameling.store().setUi({ fillColor: '#7ec8e3' })`),
      { click: [433, 237] },
      { click: [560, 237] },
      { move: [640, 600] },
      L.wait(700),
      { shot: '@', crop: [108, 44, 1164, 450] },
    ],
  },
  {
    name: 'symbols-pixel',
    steps: [
      L.js(SLIME),
      view,
      L.cmd('symbols.make'),
      L.wait(300),
      L.cmd('tween.make'),
      L.wait(300),
      L.js(`(() => { const st = __frameling.store; st().update('move', (d) => { const l = d.layers[0]; const c = l.cels[l.cels.length - 1]; const v = d.drawings[c.drawingId]; const i = v.shapes.find((s) => s.type === 'instance'); i.transform.x += 150; i.transform.y -= 20; i.transform.rotation = 25; }); st().setUi({ frame: 6, selection: [] }); })()`),
      // Let the two toasts fade so they do not cover the timeline.
      L.wait(9000),
      { shot: '@', crop: [108, 44, 1164, 700] },
    ],
  },
];

module.exports = entries.map((e) => ({ ...e, prefs: { showTips: false, ...(e.prefs ?? {}) } }));

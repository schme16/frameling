// Help pictures and clips for pixel art, tiles, saving and the web build. See help-media.cjs for the entry format.
const { js, wait, key } = require('./_lib.cjs');

const F = '__frameling';

// ---------------------------------------------------------------------------------------------------------------
// A small green slime on Cosy Sixteen colours. Built from a half (the left side) mirrored, so it is symmetrical.
// K ink, g body, d body shade, l body light, W light outline. Rows are listed by their left edge.
const INK = '#1d1b26';
const GREEN = '#4f9a45';
const DARK = '#1f4d3a';
const LIGHT = '#a8e070';
const WHITE = '#e8e3ee';
const LEGEND = { K: INK, g: GREEN, d: DARK, l: LIGHT, W: WHITE };

const W = 28;
const H = 24;

/** Rows (W by H) of the slime. Left half is built and mirrored. Each flag adds a part of the drawing. */
function slimeRows({ outline = true, shade = true, light = true, eyes = true, body = true, top = 5 } = {}) {
  const edge = [7, 5, 4, 3, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 2];
  const grid = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (x, y, c) => {
    grid[top + y][1 + x] = c;
    grid[top + y][1 + 25 - x] = c;
  };
  edge.forEach((x0, y) => {
    const last = y === edge.length - 1;
    for (let x = x0; x <= 12; x++) {
      const edgeCell = x === x0 || y === 0 || last;
      if (edgeCell) {
        if (outline) put(x, y, 'K');
      } else if (body) put(x, y, 'g');
    }
  });
  if (light) [[edge[2] + 2, 2], [edge[2] + 3, 2], [edge[3] + 2, 3], [edge[3] + 3, 3], [edge[4] + 2, 4]].forEach(([x, y]) => put(x, y, 'l'));
  if (shade) {
    const y1 = edge.length - 2;
    for (let x = edge[y1] + 1; x <= 12; x++) put(x, y1, x < edge[y1] + 4 ? 'd' : 'g');
    for (let x = edge[y1 - 1] + 1; x < edge[y1 - 1] + 2; x++) put(x, y1 - 1, 'd');
  }
  if (eyes) [[7, 7], [7, 8]].forEach(([x, y]) => put(x, y, 'K'));
  return grid.map((r) => r.join(''));
}

/**
 * Code that opens a blank pixel document of W by H art pixels and paints rows into its layer's frame (legend maps
 * characters to colours). Loads as a new document: no undo steps, nothing marked unsaved.
 */
function paintJs(rows, legend = LEGEND, o = {}) {
  const w = o.w ?? W;
  const h = o.h ?? H;
  return `(() => {
    const st = ${F}.store(); const d = structuredClone(st.get().doc);
    const L = d.layers.find((l) => l.kind === 'pixel');
    const cel = L.cels[0];
    const dr = d.drawings[cel.drawingId];
    const w = ${w}, h = ${h};
    d.width = w * L.pixelSize; d.height = h * L.pixelSize;
    const px = new Uint8ClampedArray(w * h * 4);
    const rows = ${JSON.stringify(rows)}; const legend = ${JSON.stringify(legend)};
    rows.forEach((r, y) => { for (let x = 0; x < w; x++) { const c = legend[r[x]]; if (!c) continue; const n = parseInt(c.slice(1, 7), 16); px.set([n >> 16, (n >> 8) & 255, n & 255, 255], (y * w + x) * 4); } });
    d.drawings[cel.drawingId] = { ...dr, width: w, height: h, pixels: px };
    ${o.background ? `d.background = ${JSON.stringify(o.background)};` : ''}
    st.load(d);
  })()`;
}

/** The Pixel workspace with a blank W by H pixel document (optionally holding a drawing), fitted and zoomed in. */
const pixelDoc = (rows, tool = ['p'], o = {}) => [
  js(`${F}.dock.applyWorkspace('pixel')`),
  wait(500),
  js(`${F}.template('blank-pixel')`),
  wait(300),
  js(paintJs(rows ?? Array((o.h ?? H)).fill('.'.repeat(o.w ?? W)), LEGEND, o)),
  wait(300),
  key(...tool),
  js(`${F}.run('view.zoom100')`),
  ...Array.from({ length: o.zoomIn ?? 1 }, () => js(`${F}.run('view.zoomIn')`)),
  js(`${F}.run('view.center')`),
  wait(300),
];

const pixelWorkspace = () => js(`${F}.dock.applyWorkspace('pixel')`);

/**
 * Screen positions on the stage once pixelDoc has fitted it (window 1280 x 800, Pixel workspace): `at(x, y)` is the
 * middle of art pixel (x, y). Tools whose bar wraps onto two rows (pencil, brush, shade, eraser, bucket) leave the
 * canvas area 20 px shorter (`tall`). The canvas area is 526 wide and reaches y = 491 in the 1280 x 800 window.
 */
function grid(w, h, cell, tall) {
  const top = tall ? 116 : 96;
  const height = tall ? 375 : 395;
  const ox = 403 + (526 - w * cell) / 2;
  const oy = top + (height - h * cell) / 2;
  return { ox, oy, at: (x, y) => [Math.round(ox + (x + 0.5) * cell), Math.round(oy + (y + 0.5) * cell)] };
}
/** A slow drag through art pixels. */
const stroke = (g, pts, o = {}) => ({ drag: pts.map(([x, y]) => g.at(x, y)), steps: o.steps ?? 3, delay: o.delay ?? 24, ...(o.mods ? { mods: o.mods } : {}), ...(o.after ? { after: o.after } : {}) });
const setUi = (o) => js(`${F}.store().setUi(${JSON.stringify(o)})`);
const away = { move: [640, 762] };
const properties = [{ click: [1232, 76] }, wait(300)];
const center = js(`${F}.run('view.center')`);

const canvasPane = [403, 47, 526, 418];

const measure = { log: `(() => { const b = (q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r && [r.x, r.y, r.width, r.height].map(Math.round); }; const u = ${F}.store().get().ui; return { cv: b('.cv-layer'), tool: u.tool, zoom: u.zoom, pan: [u.panX, u.panY] }; })()` };

module.exports = [
  {
    name: 'pixel-art',
    prefs: { showTips: false },
    steps: [...pixelDoc(slimeRows(), ['p']), ...properties, center, wait(300), away, wait(400), { shot: '@' }],
  },
  {
    name: 'pixel-dither',
    steps: [
      ...pixelDoc(slimeRows(), ['b', ['shift']]),
      ...properties,
      center,
      setUi({ color: '#2b4a9e', fillColor: '#6fb8ff' }),
      stroke(grid(28, 24, 12, false), [[0, 2], [27, 2]], { steps: 8 }),
      setUi({ color: DARK, fillColor: GREEN }),
      stroke(grid(28, 24, 12, false), [[3, 17], [22, 17]], { steps: 8 }),
      away,
      wait(500),
      { shot: '@', crop: [403, 47, 791, 418] },
    ],
  },
  {
    // Shapes with a 2 pixel outline: a filled box, an oval, a line and a star, and the thickness option beside them.
    name: 'pixel-shapes',
    prefs: { showTips: false, pixelThickOutlines: true, pixelOutlineWidth: 2 },
    steps: (() => {
      const g = grid(28, 24, 12, false);
      return [
        ...pixelDoc(null, ['r'], { background: '#fdf6e8' }),
        ...properties,
        center,
        setUi({ color: '#1d1b26', fillColor: '#8fd0ff', strokeOn: true, tool: 'rect' }),
        stroke(g, [[2, 2], [13, 11]], { steps: 4 }),
        setUi({ fillColor: '#ffd36b', tool: 'ellipse' }),
        stroke(g, [[15, 2], [26, 11]], { steps: 4 }),
        setUi({ color: '#c2410c', tool: 'line' }),
        stroke(g, [[2, 14], [13, 21]], { steps: 4 }),
        setUi({ color: '#1d1b26', fillColor: '#ff9db8', tool: 'star' }),
        stroke(g, [[15, 13], [26, 22]], { steps: 4 }),
        setUi({ tool: 'rect' }),
        away,
        wait(500),
        { shot: '@', crop: [403, 47, 791, 418] },
      ];
    })(),
  },
  {
    // Shapes on perspective guides in pixels: a wall on each side, a window and a round window drawn on them.
    name: 'perspective-shapes-pixel',
    prefs: { showTips: false },
    steps: (() => {
      const g = grid(28, 24, 12, false);
      return [
        ...pixelDoc(null, ['r'], { background: '#fdf6e8' }),
        ...properties,
        center,
        js(`${F}.run('view.perspective2')`),
        wait(600),
        // Two vanishing points on a horizon a third of the way down, off to each side of the picture.
        js(`${F}.store().update('Perspective', (d) => { d.perspective = { points: [{ x: -90, y: 64 }, { x: 314, y: 64 }] }; })`),
        wait(300),
        setUi({ color: '#1d1b26', fillColor: '#8fd0ff', strokeOn: true, tool: 'rect' }),
        stroke(g, [[1, 4], [12, 20]], { steps: 6 }),
        setUi({ fillColor: '#ff9db8' }),
        stroke(g, [[15, 4], [26, 20]], { steps: 6 }),
        setUi({ fillColor: '#fff2c8' }),
        stroke(g, [[4, 8], [8, 14]], { steps: 6 }),
        setUi({ fillColor: '#ffffff', tool: 'ellipse' }),
        stroke(g, [[19, 9], [24, 15]], { steps: 6 }),
        away,
        wait(5400),
        { shot: '@', crop: [403, 47, 791, 418] },
      ];
    })(),
  },
  {
    name: 'pixel-outline',
    steps: [
      ...pixelDoc(slimeRows(), ['p']),
      setUi({ color: '#ff6f91' }),
      js(`${F}.run('pixel.outline')`),
      away,
      wait(500),
      { shot: '@', crop: [403, 116, 526, 375] },
    ],
  },
  {
    name: 'pixel-rotate',
    steps: [
      ...pixelDoc(slimeRows(), ['p']),
      js(`${F}.run('pixel.rotate')`),
      wait(1500),
      { type: '-20' },
      wait(700),
      { shot: '@', el: '[role=dialog]', pad: 0 },
    ],
  },
  {
    name: 'palette-panel',
    size: [1280, 1000], // the panel grew a From a picture button
    steps: [...pixelDoc(slimeRows(), ['p']), away, wait(300), { shot: '@', el: '.px-palette', pad: 0 }],
  },
  {
    name: 'palette-lock',
    size: [1280, 1000],
    steps: [...pixelDoc(slimeRows(), ['p']), js(`${F}.run('pixel.paletteLock')`), away, wait(500), { shot: '@', el: '.px-palette', pad: 0 }],
  },
  {
    name: 'pixel-workspace',
    prefs: { showTips: false },
    steps: [
      js(`${F}.dock.applyWorkspace('pixel')`),
      wait(500),
      js(`${F}.template('hero-sprites')`),
      wait(600),
      key('p'),
      js(`${F}.run('view.fit')`),
      wait(600),
      away,
      { shot: '@' },
    ],
  },
  {
    name: 'pixel-bar',
    steps: [
      ...pixelDoc(slimeRows(), ['p']),
      js(`${F}.run('pixel.paletteLock')`),
      setUi({ color: '#ff6f91' }),
      js(`${F}.dock.toggleCollapsed('left', true); ${F}.dock.toggleCollapsed('right', true)`),
      setUi({ dirty: false }),
      wait(1000),
      center,
      away,
      wait(5000),
      { shot: '@', crop: [150, 47, 1044, 420] },
    ],
  },
  {
    // The Aseprite keys picked: the sprite at 800% (key 4), with the pixel units in the status bar.
    name: 'pixel-aseprite-habits',
    prefs: { showTips: false, keymapSet: 'pixel' },
    steps: [
      ...pixelDoc(slimeRows(), ['b']),
      js(`${F}.run('pixel.zoom4')`),
      js(`${F}.run('view.center')`),
      setUi({ dirty: false }),
      away,
      wait(800),
      { shot: '@' },
    ],
  },
  {
    name: 'tileset',
    prefs: { showTips: false },
    steps: [
      js(`${F}.template('tileset')`),
      wait(600),
      js(`${F}.showPanel('tileset')`),
      wait(500),
      js(`[...document.querySelectorAll('.rd-sec-toggle')].find((b) => b.textContent.includes('Colours'))?.click()`),
      wait(400),
      js(`document.querySelectorAll('.tz-tile')[3]?.click()`),
      away,
      wait(400),
      { shot: '@', crop: [194, 47, 1000, 335] },
    ],
  },
  {
    // The tile grid starting a few pixels in: the Tileset panel's size form with Grid starts at x, y, and the handle on the canvas.
    name: 'tile-grid',
    prefs: { showTips: false },
    steps: [
      js(`${F}.template('tileset')`),
      wait(600),
      js(`${F}.showPanel('tileset')`),
      wait(400),
      js(`(() => { const st = ${F}.store(); const l = st.get().doc.layers.find((x) => x.name === 'Ground'); st.setUi({ activeLayerId: l.id, tool: 'tile-brush' }); st.update('Grid', (d) => { d.tileset.gridX = 5; d.tileset.gridY = 7; }); })()`),
      js(`${F}.run('view.fit')`),
      wait(500),
      js(`document.querySelector('.tz-size')?.click()`),
      wait(500),
      { down: [214, 108] },
      { held: [217, 111] },
      { held: [219, 114], after: 300 },
      { shot: '@', crop: [120, 50, 1070, 680] },
      { up: [219, 114] },
    ],
  },
  {
    name: 'export-tileset',
    steps: [
      js(`${F}.template('tileset')`),
      wait(600),
      js(`${F}.run('tiles.export')`),
      wait(1500),
      away,
      { shot: '@', el: '[role=dialog]', pad: 0 },
    ],
  },
  {
    name: 'saving-and-opening',
    steps: [
      js(`${F}.template('bouncing-ball')`),
      wait(800),
      { click: [161, 22], after: 600 },
      away,
      wait(500),
      { shot: 'kick', crop: [0, 0, 8, 8] }, // the hidden window only paints on a shot, so let the menu's pop-in finish
      wait(600),
      { shot: '@', el: '[role=menu]', pad: 6 },
    ],
  },
  {
    name: 'autosave',
    steps: [
      js(`${F}.template('bouncing-ball')`),
      wait(500),
      js(`${F}.recovery.set({ name: 'Bouncing blob', savedAt: Date.now() - 12 * 60000, restore() {} })`),
      js(`${F}.run('help.welcome')`),
      wait(1500),
      away,
      { shot: '@', crop: [224, 121, 823, 84] },
    ],
  },
  {
    name: 'version-history',
    steps: [
      js(`${F}.template('bouncing-ball')`),
      wait(600),
      js(`(async () => {
        const io = __framelingIo; const st = ${F}.store(); const now = Date.now(); const min = 60000;
        const tint = (c) => st.update('Tint', (d) => { d.background = c; });
        const take = async (ago, o) => { await io.takeVersion({ now: now - ago, ...o }); };
        tint('#fde7ec'); await take(2 * 24 * 60 * min + 7 * 60 * min, { reason: 'timer' });
        tint('#fdf1d6'); await take(26 * 60 * min, { name: 'Ball on the floor' });
        tint('#e6e3fb'); await take(5 * 60 * min, { reason: 'timer' });
        tint('#e2f3ff'); await take(5 * 60 * min - 4 * min, { reason: 'save' });
        tint('#e5f9ea'); await take(60 * min + 5 * min, { reason: 'timer' });
        tint('#ffeadf'); await take(40 * min, { name: 'Before the squash' });
        tint('#fde7ec'); await take(12 * min, { reason: 'timer' });
        tint('#fff9e3'); await take(2 * min, { reason: 'save' });
        await io.versionsDialog();
      })()`),
      wait(2500),
      away,
      { shot: '@', el: '[role=dialog]', pad: 0 },
    ],
  },
  // ---------------------------------------------------------------------------------------------------- clips
  {
    // A heart drawn row by row on a white page, to show the grid between the pixels.
    name: 'pixel-heart',
    steps: (() => {
      const g = grid(20, 18, 16, true);
      const runs = [
        [[3, 3], [5, 3]], [[9, 3], [11, 3]],
        [[2, 4], [6, 4]], [[8, 4], [12, 4]],
        [[1, 5], [13, 5]], [[1, 6], [13, 6]], [[1, 7], [13, 7]],
        [[2, 8], [12, 8]], [[3, 9], [11, 9]], [[4, 10], [10, 10]], [[5, 11], [9, 11]], [[6, 12], [8, 12]], [[7, 13], [7, 13]],
      ].map(([a, b]) => [[a[0] + 3, a[1]], [b[0] + 3, b[1]]]);
      return [
        ...pixelDoc(null, ['p'], { w: 20, h: 18, zoomIn: 2, background: '#ffffff' }),
        setUi({ color: '#ff6f91' }),
        away,
        wait(500),
        { rec: '@', crop: [g.ox - 10, g.oy - 10, 20 * 16 + 20, 18 * 16 + 20], every: 70 },
        wait(700),
        ...runs.map((r) => (r[0][0] === r[1][0] && r[0][1] === r[1][1] ? { click: g.at(...r[0]), after: 250 } : stroke(g, r, { steps: Math.max(2, r[1][0] - r[0][0]), delay: 40, after: 250 }))),
        setUi({ color: '#ffc2cf' }),
        wait(300),
        { click: g.at(6, 4), after: 200 },
        { click: g.at(7, 4), after: 200 },
        { click: g.at(6, 5), after: 700 },
        wait(900),
        { rec: 'stop' },
      ];
    })(),
  },
  {
    // Lighter strokes along the top, then darker ones along the bottom, over a flat green slime.
    name: 'pixel-shade',
    steps: (() => {
      const g = grid(28, 24, 12, true);
      const mirror = (pts) => pts.map(([x, y]) => [27 - x, y]);
      const lightL = [[9, 6], [8, 6], [7, 6], [6, 7], [5, 8], [4, 9], [4, 10]];
      return [
        ...pixelDoc(slimeRows({ shade: false, light: false }), ['s']),
        { click: [1232, 76] },
        wait(500),
        center,
        wait(400),
        away,
        wait(500),
        { rec: '@', crop: [403, 116, 526, 375], every: 70 },
        wait(800),
        stroke(g, lightL, { steps: 3, delay: 40, after: 500 }),
        stroke(g, mirror(lightL), { steps: 3, delay: 40, after: 900 }),
        { click: [1124, 163], after: 700 },
        away,
        stroke(g, [[3, 20], [24, 20]], { steps: 4, delay: 40, after: 500 }),
        stroke(g, [[2, 19], [8, 19]], { steps: 3, delay: 40, after: 300 }),
        stroke(g, [[19, 19], [25, 19]], { steps: 3, delay: 40, after: 900 }),
        { rec: 'stop' },
      ];
    })(),
  },
  {
    // Mirror drawing on: one half of the outline and the other half follows, then the eyes.
    name: 'pixel-mirror',
    steps: (() => {
      const g = grid(28, 24, 12, true);
      const half = [[13, 5], [8, 5], [6, 6], [5, 7], [4, 8], [3, 9], [3, 10], [2, 11], [2, 12], [1, 13], [1, 19], [2, 20], [3, 21], [13, 21]];
      return [
        ...pixelDoc(null, ['p']),
        away,
        wait(600),
        { rec: '@', crop: [403, 116, 526, 375], every: 70 },
        wait(900),
        key('m', ['shift']),
        wait(1300),
        stroke(g, half, { steps: 3, delay: 36, after: 600 }),
        { click: g.at(8, 12), after: 250 },
        { drag: [g.at(8, 12), g.at(8, 13)], steps: 2, delay: 40, after: 900 },
        wait(900),
        { rec: 'stop' },
      ];
    })(),
  },
  {
    // A crown goes on Pip while the Preview keeps playing at real size.
    name: 'pixel-preview',
    steps: (() => {
      const g = grid(32, 32, 8, true);
      return [
        js(`${F}.dock.applyWorkspace('pixel')`),
        wait(500),
        js(`${F}.template('hero-sprites')`),
        wait(600),
        key('p'),
        js(`${F}.run('view.zoom100')`),
        center,
        setUi({ color: '#ffe066' }),
        // 2x, so Quill for scale has room to stand next to Pip.
        js(`document.querySelectorAll('.px-preview-zoom [role="radio"]')[1]?.click()`),
        away,
        wait(700),
        { rec: '@', crop: [403, 47, 790, 444], every: 70 },
        wait(1500),
        { click: [1067, 330], after: 900 },
        away,
        stroke(g, [[12, 16], [19, 16]], { steps: 3, delay: 60, after: 600 }),
        stroke(g, [[12, 15], [12, 14]], { steps: 2, delay: 60, after: 500 }),
        stroke(g, [[15, 15], [15, 14]], { steps: 2, delay: 60, after: 500 }),
        stroke(g, [[16, 15], [16, 14]], { steps: 2, delay: 60, after: 500 }),
        stroke(g, [[19, 15], [19, 14]], { steps: 2, delay: 60, after: 500 }),
        setUi({ color: '#ff6f91' }),
        { click: g.at(15, 16), after: 300 },
        { click: g.at(16, 16), after: 300 },
        away,
        wait(2500),
        { rec: 'stop' },
      ];
    })(),
  },
  {
    // Box select Pip, copy it with Alt+drag, then pick the scarf with the magic wand.
    name: 'pixel-select',
    steps: (() => {
      const g = grid(32, 32, 8, false);
      return [
        js(`${F}.dock.applyWorkspace('pixel')`),
        wait(500),
        js(`${F}.template('hero-sprites')`),
        wait(600),
        key('v'),
        { click: [1232, 76] },
        wait(600),
        js(`${F}.run('view.zoom100')`),
        center,
        wait(500),
        away,
        { rec: '@', crop: [403, 47, 790, 444], every: 70 },
        wait(1000),
        stroke(g, [[7, 14], [24, 30]], { steps: 10, delay: 40, after: 1000 }),
        stroke(g, [[15, 22], [23, 22]], { steps: 8, delay: 45, after: 1000 }),
        stroke(g, [[24, 22], [8, 22]], { steps: 16, delay: 45, mods: ['alt'], after: 1000 }),
        js(`${F}.run('select.none')`),
        wait(800),
        key('w'),
        wait(500),
        { click: g.at(5, 24), after: 1200 },
        away,
        wait(900),
        { rec: 'stop' },
      ];
    })(),
  },
  {
    // Painting a level: a row of bricks, a block of bricks with the rectangle, and a wider pool.
    name: 'tilemaps',
    steps: (() => {
      const at = (tx, ty) => [Math.round(205 + (tx + 0.5) * 29), Math.round(95 + (ty + 0.5) * 29)];
      const pick = (i) => js(`document.querySelectorAll('.tz-tile')[${i}]?.click()`);
      const drag = (pts, o = {}) => ({ drag: pts.map(([x, y]) => at(x, y)), steps: o.steps ?? 3, delay: o.delay ?? 30, after: o.after ?? 600 });
      return [
        js(`${F}.template('tileset')`),
        wait(600),
        js(`${F}.showPanel('tileset')`),
        wait(400),
        js(`(() => { const st = ${F}.store(); const l = st.get().doc.layers.find((x) => x.name === 'Ground'); st.setUi({ activeLayerId: l.id }); })()`),
        js(`${F}.run('view.fit')`),
        wait(600),
        pick(2),
        key('b'),
        away,
        wait(800),
        { log: `(() => { const b = (q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r && [r.x, r.y, r.width, r.height].map(Math.round); }; const u = ${F}.store().get().ui; return { cv: b('.cv-layer'), pan: [u.panX, u.panY, u.zoom], tool: u.tool }; })()` },
        { rec: '@', crop: [185, 85, 620, 368], every: 70 },
        wait(1000),
        drag([[2, 5], [11, 5]], { steps: 4, delay: 35 }),
        key('r'),
        drag([[14, 1], [17, 2]], { steps: 5, delay: 40 }),
        pick(3),
        key('b'),
        drag([[13, 8], [15, 8]], { steps: 4, delay: 40, after: 900 }),
        away,
        wait(1500),
        { rec: 'stop' },
      ];
    })(),
  },
  {
    name: 'tile-mode',
    steps: ((at) => [
      js(`${F}.template('tileset')`),
      wait(600),
      js(`${F}.showPanel('tileset')`),
      wait(400),
      js(`document.querySelectorAll('.tz-tile')[0]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`),
      wait(1200),
      // Editing a tile is a pixel drawing, so Frameling asks about the Pixel workspace: keep this layout.
      { click: [475, 445], after: 300 },
      { click: [805, 560], after: 1200 },
      key('p'),
      away,
      wait(500),
      setUi({ color: '#ffc94a' }),
      wait(500),
      { rec: '@', crop: [218, 50, 554, 400], every: 70 },
      wait(1200),
      ...[
        [[3, 7], [5, 7]],
        [[9, 10], [11, 10]],
        [[12, 6], [13, 6]],
        [[2, 12], [5, 12]],
        [[13, 14], [18, 14]],
        [[6, 3], [8, 3]],
      ].map(([a, b]) => ({ drag: [at(...a), at(...b)], steps: 5, delay: 50, after: 700 })),
      away,
      wait(2000),
      { rec: 'stop' },
    ])((cx, cy) => [Math.round(439 + (cx + 0.5) * 7), Math.round(213 + (cy + 0.5) * 7)]),
  },
  {
    // The same renderer in a frame: a subframe has no desktop bridge, so it starts up as the browser version does.
    // The frame is a plain drawn browser window (tab, back/forward/reload, address bar) in neutral greys, no real browser's look.
    name: 'web-browser',
    prefs: { showTips: false },
    size: [1280, 884],
    steps: [
      js(`(() => {
        const dark = (() => { const m = getComputedStyle(document.body).backgroundColor.match(/\\d+/g) || [0, 0, 0]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) < 128; })();
        const c = dark ? { strip: '#1c1b22', bar: '#2b2a33', tab: '#2b2a33', pill: '#1c1b22', text: '#d9d6e2', mute: '#8d8a99', line: '#3a3945' } : { strip: '#dcd8d0', bar: '#f4f1ea', tab: '#f4f1ea', pill: '#e6e2d8', text: '#2a2833', mute: '#7a7686', line: '#c9c4b8' };
        const svg = (d, w = 16) => '<svg width="' + w + '" height="' + w + '" viewBox="0 0 16 16" fill="none" stroke="' + c.mute + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
        const chrome = document.createElement('div');
        chrome.id = 'web-chrome';
        chrome.style.cssText = 'position:fixed;left:0;top:0;right:0;height:84px;z-index:99999;font:13px system-ui,sans-serif;color:' + c.text + ';background:' + c.strip + ';border-bottom:1px solid ' + c.line;
        chrome.innerHTML =
          '<div style="height:40px;display:flex;align-items:flex-end;padding:0 12px">' +
            '<div style="display:flex;align-items:center;gap:8px;width:220px;height:32px;padding:0 12px;border-radius:9px 9px 0 0;background:' + c.tab + '">' +
              '<span style="width:14px;height:14px;border-radius:4px;background:#ffc94a;display:inline-block"></span><span style="flex:1">Frameling</span>' + svg('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>', 12) +
            '</div>' +
            '<span style="margin:0 0 8px 10px">' + svg('<path d="M8 3.5v9M3.5 8h9"/>', 14) + '</span>' +
          '</div>' +
          '<div style="height:43px;display:flex;align-items:center;gap:10px;padding:0 14px;background:' + c.bar + '">' +
            svg('<path d="M10 3.5L5.5 8l4.5 4.5"/>', 18) + svg('<path d="M6 3.5L10.5 8 6 12.5"/>', 18) + svg('<path d="M12.5 8a4.5 4.5 0 11-1.4-3.3M12.5 3v2.4h-2.4"/>', 18) +
            '<div style="flex:1;height:28px;border-radius:14px;background:' + c.pill + ';display:flex;align-items:center;gap:8px;padding:0 14px">' +
              svg('<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 015 0V7"/>', 14) +
              '<span style="color:' + c.text + '">frameling.example/app</span>' +
            '</div>' +
            svg('<circle cx="8" cy="3.5" r="0.6"/><circle cx="8" cy="8" r="0.6"/><circle cx="8" cy="12.5" r="0.6"/>', 18) +
          '</div>';
        document.body.appendChild(chrome);
        const f = document.createElement('iframe');
        f.id = 'web-frame';
        f.src = new URL('index.html?debug=1', location.href).href;
        f.style.cssText = 'position:fixed;left:0;top:84px;width:100%;height:calc(100% - 84px);border:0;z-index:99999;background:#000';
        document.body.appendChild(f);
        return true;
      })()`),
      wait(4000),
      { click: [655, 106], after: 700 },
      { move: [726, 438], after: 2200 },
      { shot: '@' },
    ],
  },
];

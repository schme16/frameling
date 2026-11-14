// Before and after pictures for the finishing effects (film grain, wave, colour fringe, dark corners, motion blur), made by
// the real renderer in the app (the GPU path, in SwiftShader), one PNG per effect with the plain picture beside it.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/more-effects.cjs [outDir]   (default brand/ab/more-effects)
//
// A is the picture as it is, B has the effect on, and the wave also shows a rippling variant. The effect is on a folder
// that holds every layer (so it takes the whole picture), except motion blur, which is on the hero alone: the sky and
// hills do not move, the hero does.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software');
const fs = require('node:fs');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');
const { rect, ell, line, pathOf, stroke, INK } = require('../docs/help/_shapes.cjs');

const root = path.join(__dirname, '../..');
const outDir = path.resolve(process.argv.slice(2).find((a) => !a.endsWith('.cjs') && !a.startsWith('-')) ?? path.join(root, 'brand/ab/more-effects'));
const W = 480;
const H = 300;
const SCALE = 1.5;

const tri = (x1, y1, x2, y2, x3, y3, fill, st) => ({ id: 'tri' + x1 + y1, type: 'path', paths: [{ closed: true, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }] }], fill, stroke: st ?? null, opacity: 1 });
const OUT = stroke(INK, 3);

/** A small scene with big flat shapes, thin lines and a bold sign, so every effect shows. */
function scene(effects) {
  const sky = [rect(0, 0, W, H, '#bfe3f5'), ell(330, 30, 70, 70, '#ffd166', OUT), ell(60, 40, 90, 34, '#ffffff', OUT), ell(110, 52, 80, 30, '#ffffff', OUT)];
  const land = [ell(-60, 190, 360, 200, '#7cc576', OUT), ell(200, 210, 360, 200, '#5fae6b', OUT), rect(300, 120, 110, 90, '#f4a261', OUT), tri(290, 122, 355, 70, 420, 122, '#d1495b', OUT), rect(335, 160, 30, 50, '#5b3a29', OUT), rect(40, 80, 130, 56, '#22305a', OUT)];
  for (let i = 0; i < 4; i++) land.push(line(52, 94 + i * 10, 158, 94 + i * 10, stroke('#ffffff', 2.5, { cap: 'butt' })));
  const hero = [ell(190, 150, 70, 80, '#ef476f', OUT), ell(200, 115, 52, 52, '#ffd9b3', OUT), ell(214, 133, 8, 8, INK), ell(232, 133, 8, 8, INK), pathOf([{ x: 213, y: 148 }, { x: 226, y: 156, c1: { x: 218, y: 156 }, c2: { x: 222, y: 158 } }, { x: 240, y: 148 }], stroke(INK, 3))];
  const mk = (id, name, shapes, extra = {}) => ({ layer: { id, name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'c' + id, start: 0, length: 4, drawingId: 'd' + id }], folder: 'all', ...extra }, drawing: { id: 'd' + id, kind: 'vector', shapes } });
  const parts = [mk('sky', 'Sky', sky), mk('land', 'Land', land), mk('hero', 'Hero', hero, effects.hero ? { effects: effects.hero } : {})];
  const drawings = {};
  for (const p of parts) drawings[p.drawing.id] = p.drawing;
  return {
    format: 'frameling', version: 1, lineage: true, id: 'd', name: 'scene', width: W, height: H, fps: 12, length: 4, background: '#ffffff',
    layers: parts.map((p) => p.layer), drawings, clips: [], markers: [], swatches: [],
    folders: { all: { id: 'all', name: 'Everything', visible: true, opacity: 1, ...(effects.all ? { effects: effects.all } : {}) } },
  };
}

const fx = (kind, values) => [{ id: 'e', kind, values }];
const SHOTS = [
  { name: 'grain', note: 'A: as drawn. B: Film grain, strength 35, speck size 1.5.', variants: [['Plain', {}], ['Film grain', { all: fx('grain', { amount: 35, size: 1.5, colour: 0, change: 1, seed: 0 }) }]] },
  { name: 'wave', note: 'A: as drawn. B: Wave (heat shimmer, no ripple). C: Wave with rippling at 100%.', variants: [['Plain', {}], ['Wave, shimmer', { all: fx('wave', { amount: 5, length: 50, phase: 40, angle: 0, ripple: 0 }) }], ['Wave, rippling', { all: fx('wave', { amount: 5, length: 50, phase: 40, angle: 0, ripple: 100 }) }]] },
  { name: 'fringe', note: 'A: as drawn. B: Colour fringe, 4 px apart, sideways.', variants: [['Plain', {}], ['Colour fringe', { all: fx('fringe', { distance: 4, angle: 0 }) }]] },
  { name: 'vignette', note: 'A: as drawn. B: Dark corners at the defaults (strength 45, clear middle 65, softness 60).', variants: [['Plain', {}], ['Dark corners', { all: fx('vignette', { amount: 45, size: 65, softness: 60, color: '#000000' }) }]] },
  { name: 'motionblur', note: 'A: as drawn. B: Motion blur on the hero only, 36 px, trailing behind (moving right).', variants: [['Plain', {}], ['Motion blur', { hero: fx('motionblur', { length: 36, angle: 0, trail: 100 }) }]] },
];

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'NOTES.txt'), '');
  const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { preload: path.join(root, 'dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  await win.loadFile(path.join(root, 'dist/renderer/index.html'), { query: { debug: '1' } });
  const ev = (js) => win.webContents.executeJavaScript(js);
  await ev('new Promise((res) => { const t = () => (window.__framelingEffects ? res(true) : setTimeout(t, 50)); t(); })');
  for (const s of SHOTS) {
    const docs = s.variants.map(([, e]) => scene(e));
    const url = await ev(`(() => {
      const E = window.__framelingEffects;
      const docs = ${JSON.stringify(docs)};
      const labels = ${JSON.stringify(s.variants.map((v) => v[0]))};
      const w = Math.round(${W} * ${SCALE}), h = Math.round(${H} * ${SCALE}), gap = 16, top = 40;
      const c = document.createElement('canvas');
      c.width = docs.length * w + (docs.length + 1) * gap;
      c.height = h + top + gap;
      const g = c.getContext('2d');
      g.fillStyle = '#20222b'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#f2efe6'; g.font = 'bold 20px sans-serif'; g.textBaseline = 'middle';
      docs.forEach((d, i) => {
        const px = E.pixels(d, 0, ${SCALE});
        const img = new ImageData(new Uint8ClampedArray(px), w, h);
        g.putImageData(img, gap + i * (w + gap), top);
        g.fillText((i === 0 ? 'A  ' : i === 1 ? 'B  ' : 'C  ') + labels[i], gap + i * (w + gap), top / 2);
      });
      return c.toDataURL('image/png');
    })()`);
    const file = path.join(outDir, `${s.name}.png`);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    fs.appendFileSync(path.join(outDir, 'NOTES.txt'), `${s.name}.png: ${s.note}\n`);
    console.log(`wrote ${file}`);
  }
  console.log('gpu runs', await ev('window.__framelingEffects.effectsGpuRuns()'));
  app.exit(0);
});

// A/B for chalk and charcoal on paper in an SVG, through the real app and the real export flow:
//   A "Scale forever": tiny shapes (sharp at any size, the older grain)
//   B "Look right": the line baked as a picture (looks as the canvas does, but pixels)
// Writes both files, a side by side picture (with the canvas's own PNG for reference and a zoomed crop of each), the question
// as it appears at export time in both themes, and NOTE.txt with the file sizes. Also checks the flow: the question only
// comes up when the SVG has such a line, "Ask me every time" asks again, and a remembered answer does not.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/svg-tooth.cjs [outDir]   (default brand/ab/svg-tooth)
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const outDir = path.resolve(process.argv.slice(2).find((a) => !a.endsWith('.cjs') && !a.startsWith('--')) ?? path.join(root, 'brand/ab/svg-tooth'));
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gpu = require('../lib/gpu.cjs');
gpu.use('software');

let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const problems = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) problems.push(what);
};

const W = 480;
const H = 300;

// A charcoal sketch: a swoop, a loop, and hatching, with the pressure rising and falling along each line.
const DOC = `(() => {
  const line = (n, f) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); const [x, y] = f(t); return { x, y, p: 0.3 + 0.6 * Math.sin(Math.PI * t) }; });
  const tip = { kind: 'charcoal', amount: 0.35, grain: 1, dry: 'compressed-charcoal' };
  const tooth = (seed) => [{ id: 'fx' + seed, kind: 'tooth', values: { press: 80, tooth: 100, edge: 30, soft: 42, cover: 98, streak: 35, paper: 2, grain: 1, seed } }];
  const stroke = (id, size, pts, seed) => ({ id, type: 'stroke', points: pts, brush: { size, thinning: 0.4, smoothing: 0.4, streamline: 0.4, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true, tip }, color: '#1d1c21', opacity: 1, effects: tooth(seed) });
  const shapes = [
    stroke('s1', 30, line(50, (t) => [40 + t * 400, 210 - Math.sin(t * Math.PI) * 130]), 3),
    stroke('s2', 24, line(40, (t) => [190 + Math.cos(t * 6.3) * 60, 150 + Math.sin(t * 6.3) * 45]), 5),
  ];
  for (let i = 0; i < 6; i++) shapes.push(stroke('h' + i, 16, line(14, (t) => [60 + i * 14 + t * 90, 235 + t * 40 - i * 2]), 11 + i));
  const doc = { format: 'frameling', version: 1, lineage: true, id: 'doc', name: 'charcoal', width: ${W}, height: ${H}, fps: 12, length: 2, background: '#f2e9d6', layers: [], drawings: {}, clips: [], markers: [], swatches: [] };
  doc.drawings.d1 = { id: 'd1', kind: 'vector', shapes };
  doc.layers.push({ id: 'l1', name: 'Sketch', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'c1', start: 0, length: 2, drawingId: 'd1' }] });
  __frameling.store().load(doc);
  return true;
})()`;

const b64 = (s) => Buffer.from(s).toString('base64');
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  app.setPath('userData', path.join(outDir, '.userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  const saved = path.join(outDir, '.saved');
  fs.rmSync(saved, { recursive: true, force: true });
  fs.mkdirSync(saved, { recursive: true });
  process.env.FRAMELING_AUTOMATION_DIR = saved;
  require(path.join(root, 'dist/main/main.cjs'));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  win.setSize(1280, 800);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__framelingExport && window.__frameling)')) break;
    } catch {}
    await sleep(100);
  }
  await ev(DOC);
  await sleep(600);
  const get = (fmt, range, extra) => ev(`__framelingExport.fileBase64(${JSON.stringify(fmt)}, 0, ${JSON.stringify(range)}, ${JSON.stringify(extra)})`);

  // The files, both ways, through the real writers.
  const shapes = Buffer.from(await get('svg', 'frame', {}), 'base64').toString('utf8');
  const picture = Buffer.from(await get('svg', 'frame', { svgTooth: 'picture' }), 'base64').toString('utf8');
  const animShapes = Buffer.from(await get('svganim', 'all', {}), 'base64').toString('utf8');
  const animPicture = Buffer.from(await get('svganim', 'all', { svgTooth: 'picture' }), 'base64').toString('utf8');
  const png = Buffer.from(await get('png', 'frame', {}), 'base64');
  // And at scale 2, to see what baking costs when the file is bigger.
  const picture2 = Buffer.from(await get('svg', 'frame', { svgTooth: 'picture', scale: 2 }), 'base64').toString('utf8');
  fs.writeFileSync(path.join(outDir, 'charcoal-scale-forever.svg'), shapes);
  fs.writeFileSync(path.join(outDir, 'charcoal-look-right.svg'), picture);
  fs.writeFileSync(path.join(outDir, 'charcoal-moving-scale-forever.svg'), animShapes);
  fs.writeFileSync(path.join(outDir, 'charcoal-moving-look-right.svg'), animPicture);
  fs.writeFileSync(path.join(outDir, 'charcoal-canvas.png'), png);
  const imgs = picture.match(/<image /g) || [];
  check(imgs.length === 8 && !picture.includes('<path'), `look right: each of the 8 lines is one picture (${imgs.length} found), no tiny shapes left`);
  check(!shapes.includes('<image'), 'scale forever: no picture');
  check(animPicture.includes('<image') && !animShapes.includes('<image'), 'moving svg: same two ways');

  // The side by side, drawn by the browser from the files themselves: whole drawing, then a 4x zoom into the same corner.
  const uri = (s) => 'data:image/svg+xml;base64,' + b64(s);
  const png64 = png.toString('base64');
  const pane = (title, src, zoom) => `<div class="p"><h3>${title}</h3><div class="v ${zoom ? 'z' : ''}"><img src="${src}" ${zoom ? '' : `width="${W}"`}></div></div>`;
  const html = (zoom) => `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#20222b;color:#f2efe6;font:600 16px sans-serif;display:flex;gap:16px;padding:16px;width:max-content}
    .p h3{margin:0 0 8px;font-size:15px}.v{width:${W}px;height:${H}px;overflow:hidden;background:#f2e9d6}
    .z img{width:${W * 4}px;margin:-${zoom ? 4 * 120 : 0}px 0 0 -${zoom ? 4 * 40 : 0}px;image-rendering:auto}</style>
    ${pane('A  Scale forever', uri(shapes), zoom)}${pane('B  Look right', uri(picture), zoom)}${pane('On the canvas (PNG)', 'data:image/png;base64,' + png64, zoom)}`;
  const pw = new BrowserWindow({ show: true, width: 1600, height: 380, x: 0, y: 0, webPreferences: { backgroundThrottling: false } });
  for (const [name, zoom] of [['side-by-side', false], ['side-by-side-zoom-4x', true]]) {
    await pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html(zoom)));
    await sleep(700);
    fs.writeFileSync(path.join(outDir, `${name}.png`), (await pw.webContents.capturePage({ x: 0, y: 0, width: 16 + 3 * (W + 16), height: 36 + H + 32 })).toPNG());
  }
  pw.destroy();

  // The flow, in the real exporter: ask only when such a line is in the file; remember, and ask every time.
  await ev(`__framelingExport.setChoice('export.svgTooth', undefined)`);
  const run = (format = 'svg') => ev(`(async () => { const s = { ...__framelingExport.defaults(), format: ${JSON.stringify(format)}, range: 'frame', scale: 1, clipId: null }; return __framelingExport.run(s); })()`);
  const sheet = () => ev(`!!document.querySelector('[data-testid="choice.export.svgTooth.ok"]')`);
  const waitSheet = async () => { for (let i = 0; i < 80; i++) { if (await sheet()) return true; await sleep(100); } return false; };
  const options = () => ev(`[...document.querySelectorAll('[data-testid^="choice.export.svgTooth."]')].map((e) => e.dataset.testid.split('.').pop()).filter((x) => x !== 'ok' && x !== 'help')`);
  const click = (id) => ev(`document.querySelector('[data-testid="choice.export.svgTooth.${id}"]').click()`);
  const shot = async (name, theme) => {
    await ev(`__frameling.prefs.set({ theme: ${JSON.stringify(theme)} }); true`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 2, y: 2 });
    await sleep(700);
    const r = await ev(`(() => { const e = document.querySelector('.ui-choice'); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()`);
    const pad = 24;
    const rect = { x: Math.max(0, Math.round(r.x - pad)), y: Math.max(0, Math.round(r.y - pad)), width: Math.round(r.width + pad * 2), height: Math.round(r.height + pad * 2) };
    fs.writeFileSync(path.join(outDir, `${name}-${theme}.png`), (await win.webContents.capturePage(rect)).toPNG());
  };

  // 1. A drawing with no such line: nothing is asked.
  const withLine = await ev(`JSON.stringify(__framelingExport.doc())`);
  await ev(`(() => { const d = __framelingExport.doc(); return true; })()`);
  // 2. First time: the sheet with three answers. Pick Look right.
  let p = run();
  check(await waitSheet(), 'first time: the question comes up');
  check((await options()).join() === 'shapes,picture,ask,remember', `first time: three answers and the remember box (${(await options()).join()})`);
  await shot('question', 'dark');
  await shot('question', 'light');
  await click('picture');
  await ev(`document.querySelector('[data-testid="choice.export.svgTooth.ok"]').click()`);
  let r = await p;
  check(r && r.outcome === 'done', 'first time: the export finishes after the answer');
  const written = fs.readdirSync(saved).filter((f) => f.endsWith('.svg'));
  const file = written.length ? fs.readFileSync(path.join(saved, written[0]), 'utf8') : '';
  check(file.includes('<image'), 'first time: the file that was written has the baked pictures');
  fs.rmSync(path.join(saved, written[0] ?? 'x'), { force: true });
  // 3. Remembered: no question, same result.
  p = run();
  await sleep(1500);
  check(!(await sheet()), 'remembered: no question');
  r = await p;
  check(r && r.outcome === 'done', 'remembered: the export finishes without asking');
  // 4. Ask every time: remembered as "ask", and the question comes up on every export, with two answers and no remember box.
  await ev(`__framelingExport.setChoice('export.svgTooth', 'ask')`);
  for (let n = 1; n <= 2; n++) {
    p = run();
    check(await waitSheet(), `ask every time: the question comes up (export ${n})`);
    if (n === 1) {
      check((await options()).join() === 'shapes,picture', `ask every time: two answers and no remember box (${(await options()).join()})`);
      await shot('question-every-time', 'dark');
      await shot('question-every-time', 'light');
    }
    await click('shapes');
    await ev(`document.querySelector('[data-testid="choice.export.svgTooth.ok"]').click()`);
    r = await p;
    check(r && r.outcome === 'done', `ask every time: export ${n} finishes`);
  }
  check((await ev(`window.__framelingExport.setChoice && true`)) === true, 'still there');
  // 5. Moving SVG asks too.
  p = run('svganim');
  check(await waitSheet(), 'moving svg: the question comes up');
  await click('picture');
  await ev(`document.querySelector('[data-testid="choice.export.svgTooth.ok"]').click()`);
  r = await p;
  check(r && r.outcome === 'done', 'moving svg: finishes');
  // 6. A drawing with no chalk or charcoal on paper: nothing is asked, even asking every time.
  await ev(`(() => { const d = JSON.parse(${JSON.stringify(withLine)}); for (const dr of Object.values(d.drawings)) for (const s of dr.shapes) delete s.effects; __frameling.store().load(d); return true; })()`);
  await sleep(300);
  p = run();
  await sleep(1500);
  check(!(await sheet()), 'a drawing with no line on paper: nothing is asked');
  await p;
  await ev(`__framelingExport.setChoice('export.svgTooth', undefined)`);

  const note = [
    'Chalk and charcoal that catch on paper, written into an SVG. The same drawing (480 x 300, 8 charcoal lines) both ways.',
    '',
    'A  Scale forever (tiny shapes, the older grain):  charcoal-scale-forever.svg   ' + kb(Buffer.byteLength(shapes)),
    'B  Look right (a baked picture per line):         charcoal-look-right.svg       ' + kb(Buffer.byteLength(picture)) + `   (${(Buffer.byteLength(picture) / Buffer.byteLength(shapes)).toFixed(1)}x)`,
    'Moving SVG, A:                                    charcoal-moving-scale-forever.svg   ' + kb(Buffer.byteLength(animShapes)),
    'Moving SVG, B:                                    charcoal-moving-look-right.svg      ' + kb(Buffer.byteLength(animPicture)),
    'B at scale 2 (a 960 x 600 file):                  ' + kb(Buffer.byteLength(picture2)) + `   (${(Buffer.byteLength(picture2) / Buffer.byteLength(picture)).toFixed(1)}x the scale 1 file)`,
    'The canvas, as a PNG of the same drawing:         charcoal-canvas.png   ' + kb(png.length),
    '',
    'Baked at 2 pixels per SVG pixel, so a 480 x 300 file holds pictures that are up to 960 x 600 pixels, crisp on a screen with twice the density.',
    'The pictures are PNG inside the file (base64), one per line, only the box round the line, so empty paper costs nothing.',
    '',
    'side-by-side.png: A, B and the canvas at the same size. side-by-side-zoom-4x.png: the same three, zoomed 4x into one corner.',
    'question-dark.png / question-light.png: the question at export time (first time, three answers).',
    'question-every-time-dark.png / question-every-time-light.png: the question once "Ask me every time" is picked (two answers, nothing remembered).',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'NOTE.txt'), note + '\n');
  console.log('\n' + note);
  fs.rmSync(saved, { recursive: true, force: true });
  fs.rmSync(path.join(outDir, '.userdata'), { recursive: true, force: true });
  app.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  app.exit(1);
});

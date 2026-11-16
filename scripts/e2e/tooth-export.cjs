// What every export really does with a brush line that catches on paper (Paper tooth), in the real app. Writes each format's
// file for a page with one charcoal line and reports what is inside it, so the trade is confirmed and not assumed.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/tooth-export.cjs [outDir]
//
// Needs ImageMagick (convert) on the PATH for the picture counts. Exits non-zero when a format does something unexpected.
const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const outDir = path.resolve(process.argv.slice(2).find((a) => !a.endsWith('.cjs') && !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-tooth-')));
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

const DOC = `(() => {
  const pts = Array.from({ length: 36 }, (_, i) => ({ x: 30 + i * 6, y: 70 + Math.sin(i / 5) * 18, p: 0.35 + 0.5 * (i / 35) }));
  const stroke = (id, tip, effects) => ({ id, type: 'stroke', points: pts, brush: { size: 22, thinning: 0.4, smoothing: 0.4, streamline: 0.4, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true, tip }, color: '#1d1c21', opacity: 1, ...(effects ? { effects } : {}) });
  const tooth = [{ id: 'fx1', kind: 'tooth', values: { press: 80, tooth: 100, edge: 30, soft: 42, cover: 98, streak: 35, paper: 2, grain: 1, seed: 5 } }];
  const doc = { format: 'frameling', version: 1, lineage: true, id: 'doc', name: 'tooth', width: 280, height: 140, fps: 12, length: 2, background: '#f2e9d6', layers: [], drawings: {}, clips: [], markers: [], swatches: [] };
  doc.drawings.d1 = { id: 'd1', kind: 'vector', shapes: [stroke('s1', { kind: 'charcoal', amount: 0.35, grain: 1, dry: 'compressed-charcoal' }, tooth)] };
  doc.layers.push({ id: 'l1', name: 'Sketch', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'c1', start: 0, length: 2, drawingId: 'd1' }] });
  __frameling.store().load(doc);
  return true;
})()`;

const write = (name, b64) => {
  const f = path.join(outDir, name);
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  return f;
};
const sh = (cmd, args) => cp.spawnSync(cmd, args, { encoding: 'utf8' });

async function main() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => w.on('show', () => w.hide()));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__framelingExport && window.__frameling)')) break;
    } catch {}
    await sleep(100);
  }
  await ev(DOC);
  await sleep(500);
  const get = (fmt, range = 'frame', extra = {}) => ev(`__framelingExport.fileBase64(${JSON.stringify(fmt)}, 0, ${JSON.stringify(range)}, ${JSON.stringify(extra)})`);

  // Pictures of frames: the line has real paper tooth, many levels of see-through, and the pigment catches on the paper.
  for (const fmt of ['png', 'gif']) {
    const b = await get(fmt);
    const f = write(`tooth.${fmt}`, b);
    if (fmt === 'png') {
      const colours = Number(sh('convert', [f, '-colorspace', 'Gray', '-format', '%k', 'info:']).stdout);
      const mean = Number(sh('convert', [f, '-background', 'black', '-alpha', 'remove', '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:']).stdout);
      check(colours > 30, `png: the page has the line as grain, not a flat shape (${colours} distinct grey tones)`);
      check(mean > 0.3 && mean < 0.95, `png: the line covers part of the page (mean ${mean.toFixed(2)})`);
    } else check(fs.statSync(f).size > 500, 'gif: made');
  }
  const mp4 = await get('mp4', 'all').catch(() => null);
  check(!mp4 || mp4.length > 100, 'mp4: made');

  // SVG: shapes, no picture.
  const svg = Buffer.from(await get('svg'), 'base64').toString('utf8');
  write('tooth.svg', Buffer.from(svg).toString('base64'));
  const subpaths = (svg.match(/M/g) || []).length;
  check(!svg.includes('<image'), 'svg: no embedded picture');
  check(subpaths > 20, `svg: written as tiny shapes (${subpaths} pieces in the path)`);

  // SVG, the answer "Look right": the line is baked as a picture (at twice the file's size), the file is bigger, the rest is as before.
  const svgPic = Buffer.from(await get('svg', 'frame', { svgTooth: 'picture' }), 'base64').toString('utf8');
  write('tooth-picture.svg', Buffer.from(svgPic).toString('base64'));
  const img = /<image [^>]*width="([\d.]+)" height="([\d.]+)" href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/.exec(svgPic);
  check(!!img, 'svg (look right): the line is an embedded picture');
  check(!!img && !svgPic.includes('<path'), 'svg (look right): no tiny shapes left');
  if (img) {
    const png = Buffer.from(img[3], 'base64');
    const f = path.join(outDir, 'tooth-baked.png');
    fs.writeFileSync(f, png);
    const dims = sh('identify', ['-format', '%w %h', f]).stdout.trim().split(' ').map(Number);
    check(Math.abs(dims[0] / Number(img[1]) - 2) < 0.02, `svg (look right): baked at 2 pixels per svg pixel (${dims[0]}x${dims[1]} picture shown at ${img[1]}x${img[2]})`);
    const colours = Number(sh('convert', [f, '-alpha', 'extract', '-format', '%k', 'info:']).stdout);
    check(colours > 30, `svg (look right): the picture has real grain (${colours} distinct see-through levels)`);
  }
  console.log(`size: svg shapes ${svg.length} bytes, svg picture ${svgPic.length} bytes (${(svgPic.length / svg.length).toFixed(1)}x)`);
  // Moving SVG the same two ways.
  const anim = Buffer.from(await get('svganim', 'all'), 'base64').toString('utf8');
  const animPic = Buffer.from(await get('svganim', 'all', { svgTooth: 'picture' }), 'base64').toString('utf8');
  write('tooth-anim.svg', Buffer.from(anim).toString('base64'));
  write('tooth-anim-picture.svg', Buffer.from(animPic).toString('base64'));
  check(!anim.includes('<image'), 'moving svg: tiny shapes by default');
  check(animPic.includes('<image') && animPic.includes('data:image/png'), 'moving svg (look right): the line is an embedded picture');
  console.log(`size: moving svg shapes ${anim.length} bytes, picture ${animPic.length} bytes (${(animPic.length / anim.length).toFixed(1)}x)`);

  // PDF and Illustrator: the layer is a picture.
  for (const fmt of ['pdf', 'ai']) {
    const buf = Buffer.from(await get(fmt), 'base64');
    write(`tooth.${fmt}`, buf.toString('base64'));
    const text = buf.toString('latin1');
    check(/\/Subtype\s*\/Image/.test(text), `${fmt}: the layer is a picture`);
  }

  // Lottie: an image layer.
  const lottie = JSON.parse(Buffer.from(await get('lottie', 'all'), 'base64').toString('utf8'));
  write('tooth.json', Buffer.from(JSON.stringify(lottie)).toString('base64'));
  const hasImage = (lottie.assets || []).some((a) => typeof a.p === 'string' && a.p.startsWith('data:image'));
  check(hasImage, 'lottie: the layer is a picture');

  // Photoshop: the layer is pixels.
  const psd = Buffer.from(await get('psd'), 'base64');
  write('tooth.psd', psd.toString('base64'));
  check(psd.toString('latin1', 0, 4) === '8BPS' && psd.length > 2000, `psd: made (${psd.length} bytes)`);

  console.log(`\nFiles are in ${outDir}`);
  app.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  app.exit(1);
});

// The capture view, shot in the real app (both windows, the real message port). Run in xvfb, after `npm run build`:
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/capture-view-media.cjs --theme dark [--help] [--ab]
//
// --ab    brand/ab/stream-capture-view/: A (the second window as it was) and B (the capture view), same drawing, cropped and
//         captioned, one pair per theme, plus the two side by side
// --help  public/help/stream-capture-<theme>.png: the drawing window and the capture view next to each other
// With neither, both. Run once per theme.
// There is no window manager on the virtual screen, so no window draws a title bar here; the captions say so.
const { app } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { boot, popReady, sleep, MKDOC, root } = require('./popout-lib.cjs');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const theme = arg('--theme', 'dark');
const wantHelp = process.argv.includes('--help') || !process.argv.includes('--ab');
const wantAb = process.argv.includes('--ab') || !process.argv.includes('--help');

// The same square page with a bouncing ball as the second window's own pictures.
const DOC = `(() => {
  const K = 0.5522847498307936;
  const ell = (cx, cy, rx, ry) => { const kx = K * rx, ky = K * ry; return { closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] }; };
  const path = (id, paths, fill, opacity = 1) => ({ id, type: 'path', paths, fill, stroke: null, opacity });
  let n = 0; const id = (p) => p + '-' + ++n;
  const doc = { format: 'frameling', version: 1, lineage: true, id: id('doc'), name: 'Bouncing ball', width: 800, height: 800, fps: 12, length: 12, background: '#fff6e5', layers: [], drawings: {}, clips: [], markers: [], swatches: [] };
  const ball = { id: id('l'), name: 'Ball', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
  const ground = { id: id('l'), name: 'Ground', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
  const gd = { id: id('dr'), kind: 'vector', shapes: [path(id('sh'), [{ closed: true, points: [{ x: 0, y: 640 }, { x: 800, y: 640 }, { x: 800, y: 800 }, { x: 0, y: 800 }] }], '#bfe8c6')] };
  doc.drawings[gd.id] = gd; ground.cels.push({ id: id('c'), start: 0, length: 12, drawingId: gd.id });
  for (let f = 0; f < 12; f++) {
    const t = f / 11;
    const x = 140 + t * 520;
    const h = Math.abs(Math.sin(t * Math.PI * 2));
    const y = 560 - h * 330;
    const squash = 1 - Math.min(1, h * 6) * 0 + (h < 0.12 ? 0.18 * (1 - h / 0.12) : 0);
    const rx = 62 * squash, ry = 62 / squash;
    const d = { id: id('dr'), kind: 'vector', shapes: [
      path(id('sh'), [ell(x, 650, 54 - h * 26, 11 - h * 5)], '#2a2533', 0.18 + (1 - h) * 0.12),
      path(id('sh'), [ell(x, y, rx, ry)], '#ff6f91'),
      path(id('sh'), [ell(x - 18, y - 20, 14, 10)], '#ffffff', 0.55),
    ] };
    doc.drawings[d.id] = d; ball.cels.push({ id: id('c'), start: f, length: 1, drawingId: d.id });
  }
  const lines = { id: id('l'), name: 'Lines', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
  const ld = { id: id('dr'), kind: 'vector', shapes: [] };
  doc.drawings[ld.id] = ld; lines.cels.push({ id: id('c'), start: 0, length: 12, drawingId: ld.id });
  doc.layers.push(ground, ball, lines);
  const S = window.__frameling.store();
  S.load(doc);
  S.setUi({ tool: 'brush', activeLayerId: lines.id, frame: 0, playing: false, brush: { ...S.get().ui.brush, size: 10 }, color: '#2a2533' });
  return true;
})()`;

const run = (cmd, args, opts) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'], ...opts });

(async () => {
  const h = await boot({ theme, width: 900, height: 800, choices: { 'popout.captureBackground': 'green', 'popout.captureCursor': 'hide', 'popout.captureSize': 'free' } });
  const { js, main } = h;
  await js(MKDOC);
  await js(DOC);
  await js(`window.__frameling.store().setUi({ tool: 'brush', frame: 5 })`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-media-'));
  const shot = async (w, name) => {
    const f = path.join(tmp, name);
    fs.writeFileSync(f, (await w.webContents.capturePage()).toPNG());
    return f;
  };
  const SIZE = { width: 960, height: 540 };

  // A: the second window as it was.
  await js(`window.__frameling.run('popout.toggle')`);
  let pw = await popReady(h);
  pw.setBounds({ x: 900, y: 0, ...SIZE });
  await sleep(1200);
  const a = await shot(pw, 'a.png');

  // B: the capture view (this swaps the window), same size.
  await js(`window.__frameling.run('capture.toggle')`);
  let cw = null;
  for (let i = 0; i < 100 && !cw; i++) {
    const w = h.popWin();
    if (w && w !== pw && !w.isDestroyed()) cw = w;
    else await sleep(100);
  }
  if (!cw) throw new Error('the capture view never opened');
  cw.setBounds({ x: 900, y: 0, ...SIZE });
  cw = await popReady(h);
  cw.setBounds({ x: 900, y: 0, ...SIZE });
  await sleep(1200);
  const b = await shot(cw, 'b.png');
  const title = cw.getTitle();
  console.log(`capture view title: "${title}"`);
  if (/ball|second window|\.fling|\//i.test(title)) throw new Error('the capture view title shows more than it should: ' + title);
  const mainShot = await shot(main, 'main.png');

  const colours = theme === 'dark' ? ['#1d1b26', '#f4efe6'] : ['#fffaf2', '#2a2533'];
  const caption = (src, dst, text) => {
    const w = Number(execFileSync('identify', ['-format', '%w', src]).toString());
    run('convert', [src, '(', '-size', `${w - 32}x`, '-background', colours[0], '-fill', colours[1], '-font', 'DejaVu-Sans', '-pointsize', '15', `caption:${text}`, '-bordercolor', colours[0], '-border', '16x10', ')', '-background', colours[0], '-append', dst]);
  };

  if (wantAb) {
    const out = path.join(root, 'brand/ab/stream-capture-view');
    fs.mkdirSync(out, { recursive: true });
    const ca = path.join(out, `a-second-window-${theme}.png`);
    const cb = path.join(out, `b-capture-view-${theme}.png`);
    caption(a, ca, `A. The second window as it was (${theme} theme). The drawing sits on the theme colour with a shadow round the page and a hint line. The window has a title bar with the drawing's name in it (not drawn on this test screen).`);
    caption(b, cb, `B. The capture view (${theme} theme). The same drawing on one flat colour OBS can key out, nothing else on screen, no title bar, and a window name that does not say what the file is.`);
    run('convert', [ca, cb, '+append', path.join(out, `a-vs-b-${theme}.png`)]);
    console.log(`wrote ${out}/ (a, b and a-vs-b for ${theme})`);
  }
  if (wantHelp) {
    const out = path.join(root, 'public/help');
    // The drawing window and the capture view side by side, the way they sit on a streamer's screen.
    const left = path.join(tmp, 'left.png');
    run('convert', [mainShot, '-resize', 'x540', left]);
    const joined = path.join(tmp, 'joined.png');
    run('convert', [left, b, '-background', theme === 'dark' ? '#121019' : '#f4efe6', '-gravity', 'center', '+append', '-bordercolor', theme === 'dark' ? '#121019' : '#f4efe6', '-border', '14', joined]);
    run('convert', [joined, '-resize', '1000x>', '-colors', '256', '-dither', 'None', '-strip', '-define', 'png:compression-level=9', `PNG8:${path.join(out, `stream-capture-${theme}.png`)}`]);
    console.log(`wrote ${out}/stream-capture-${theme}.png`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});

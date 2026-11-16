// The picture and the clip for the second window: the real app, both windows on screen at once, drawing in one while the
// other follows, then playing an animation. Records the whole virtual screen with ffmpeg (so it is what two windows
// really look like), then encodes the A/B clip and the help clip.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/popout-media.cjs --theme dark [--help] [--ab]
//
// --ab    writes brand/ab/canvas-popout/canvas-popout-<theme>.mp4 and rest-<theme>.png (the window at rest, cropped, captioned)
// --help  writes public/help/canvas-popout-<theme>.mp4 and -poster.png (the clip the help topic shows)
// With neither, both. Run once per theme.
const { app } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { boot, popReady, sleep, MKDOC, root } = require('./popout-lib.cjs');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const theme = arg('--theme', 'dark');
const wantHelp = process.argv.includes('--help') || !process.argv.includes('--ab');
const wantAb = process.argv.includes('--ab') || !process.argv.includes('--help');
const SCREEN = { w: 1600, h: 800 };

// A square page with a ball that bounces across it, and an empty layer on top to draw on.
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
  const h = await boot({ theme, width: 900, height: 800 });
  const { js, main } = h;
  await js(MKDOC);
  await js(DOC);
  await js(`window.__frameling.store().setUi({ tool: 'brush' })`);
  await js(`window.__frameling.run('popout.toggle')`);
  const pw = await popReady(h);
  pw.setBounds({ x: 900, y: 0, width: 700, height: 800 });
  main.setBounds({ x: 0, y: 0, width: 900, height: 800 });
  await sleep(1200);

  const send = (e) => main.webContents.sendInputEvent(e);
  const view = await js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); const u = window.__frameling.store().get().ui; return { x: r.left, y: r.top, zoom: u.zoom, panX: u.panX, panY: u.panY }; })()`);
  const scr = (x, y) => ({ x: Math.round(view.x + view.panX + x * view.zoom), y: Math.round(view.y + view.panY + y * view.zoom) });
  async function draw(points, step = 22) {
    const p0 = scr(...points[0]);
    send({ type: 'mouseMove', ...p0 });
    send({ type: 'mouseDown', ...p0, button: 'left', clickCount: 1 });
    for (const q of points.slice(1)) {
      send({ type: 'mouseMove', ...scr(...q), modifiers: ['leftButtonDown'] });
      await sleep(step);
    }
    const last = scr(...points[points.length - 1]);
    send({ type: 'mouseUp', ...last, button: 'left', clickCount: 1 });
    await sleep(350);
  }
  const wave = (x0, x1, y, amp, n = 46) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y + Math.sin(i / 3.2) * amp]);
  const spiral = (cx, cy, r, n = 54) => Array.from({ length: n }, (_, i) => { const a = (i / 7) * 1; const rr = (r * i) / n; return [cx + Math.cos(a * 2.2) * rr, cy + Math.sin(a * 2.2) * rr]; });
  const flourish = Array.from({ length: 40 }, (_, i) => { const t = i / 39; return [110 + t * 260, 150 + Math.sin(t * Math.PI) * -70 + t * 40]; });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'popout-media-'));
  const raw = path.join(tmp, 'raw.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', `${SCREEN.w}x${SCREEN.h}`, '-i', `${process.env.DISPLAY}+0,0`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'ignore', 'inherit'] });
  await sleep(600);
  // The picture at rest, before anything is drawn.
  const rest = path.join(tmp, 'rest.png');
  fs.writeFileSync(rest, (await pw.webContents.capturePage()).toPNG());
  await sleep(1800);
  await draw(wave(80, 720, 600, 16));
  await sleep(500);
  await draw(spiral(620, 140, 90));
  await sleep(500);
  await draw(flourish);
  await sleep(900);
  await js(`window.__frameling.store().setUi({ frame: 0 })`);
  await js(`window.__frameling.run('timeline.play')`);
  await sleep(4200);
  await js(`window.__frameling.run('timeline.play')`);
  await sleep(1200);
  const finalPng = path.join(tmp, 'last.png');
  const lastShot = (await h.popWin().webContents.capturePage()).toPNG();
  fs.writeFileSync(finalPng, lastShot);
  ff.stdin.write('q');
  await new Promise((r) => ff.once('exit', r));

  const captionColour = theme === 'dark' ? ['#1d1b26', '#f4efe6'] : ['#fffaf2', '#2a2533'];
  // A strip under the picture with a line saying what it is, as wide as the picture (wrapped to fit).
  const caption = (src, dst, text) => {
    const w = Number(execFileSync('identify', ['-format', '%w', src]).toString());
    run('convert', [src, '(', '-size', `${w - 32}x`, '-background', captionColour[0], '-fill', captionColour[1], '-font', 'DejaVu-Sans', '-pointsize', '15', `caption:${text}`, '-bordercolor', captionColour[0], '-border', '16x12', ')', '-background', captionColour[0], '-gravity', 'center', '-append', dst]);
  };

  if (wantAb) {
    const out = path.join(root, 'brand/ab/canvas-popout');
    fs.mkdirSync(out, { recursive: true });
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-movflags', '+faststart', '-an', path.join(out, `canvas-popout-${theme}.mp4`)]);
    caption(rest, path.join(out, `rest-${theme}.png`), `The second window at rest (${theme} theme): just the picture, as big as the window allows. Nothing here can change the drawing.`);
    console.log(`wrote ${out}/canvas-popout-${theme}.mp4 and rest-${theme}.png`);
  }
  if (wantHelp) {
    const out = path.join(root, 'public/help');
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'fps=20,scale=1000:-2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-movflags', '+faststart', '-an', path.join(out, `canvas-popout-${theme}.mp4`)]);
    // The poster: both windows after the drawing is done, taken from the end of the recording.
    const lastFrame = path.join(tmp, 'poster-full.png');
    run('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-1.5', '-i', raw, '-frames:v', '1', lastFrame]);
    run('convert', [lastFrame, '-resize', '1000x>', '-colors', '256', '-dither', 'None', '-strip', '-define', 'png:compression-level=9', `PNG8:${path.join(out, `canvas-popout-${theme}-poster.png`)}`]);
    console.log(`wrote ${out}/canvas-popout-${theme}.mp4 and -poster.png`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});

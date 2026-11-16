// The clip for live review: the real app, two windows on screen at once. The sharer draws while a reviewer's window follows,
// the reviewer points (their dot shows on the sharer's drawing), circles something and leaves a note, and it is in the sharer's drawing with no press.
// Records the whole virtual screen with ffmpeg, then encodes the board clip and the help clip (always H.264).
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/review-media.cjs --theme dark [--help] [--ab]
//
// --ab    writes brand/ab/live-review/live-review-<theme>.mp4 (the board's look)
// --help  writes public/help/live-review-<theme>.mp4 and -poster.png (the clip the help topic shows)
// With neither, both. Run once per theme.
const { app } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { boot, sleep, DOC, startReview, joinAndAdmit, root } = require('./review-lib.cjs');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const theme = arg('--theme', 'dark');
const wantHelp = process.argv.includes('--help') || !process.argv.includes('--ab');
const wantAb = process.argv.includes('--ab') || !process.argv.includes('--help');
const SCREEN = { w: 1600, h: 800 };
const run = (cmd, args, opts) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'], ...opts });

(async () => {
  const h = await boot({ theme, width: 900, height: 800 });
  const { js, main } = h;
  await js(DOC);
  await js(`window.__frameling.store().setUi({ tool: 'brush' })`);
  await sleep(500);
  const send = (e) => main.webContents.sendInputEvent(e);
  const view = await js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); const u = window.__frameling.store().get().ui; return { x: r.left, y: r.top, zoom: u.zoom, panX: u.panX, panY: u.panY }; })()`);
  const scr = (x, y) => ({ x: Math.round(view.x + view.panX + x * view.zoom), y: Math.round(view.y + view.panY + y * view.zoom) });
  async function draw(points, step = 22) {
    send({ type: 'mouseMove', ...scr(...points[0]) });
    send({ type: 'mouseDown', ...scr(...points[0]), button: 'left', clickCount: 1 });
    for (const q of points.slice(1)) {
      send({ type: 'mouseMove', ...scr(...q), modifiers: ['leftButtonDown'] });
      await sleep(step);
    }
    send({ type: 'mouseUp', ...scr(...points[points.length - 1]), button: 'left', clickCount: 1 });
    await sleep(350);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-media-'));
  const raw = path.join(tmp, 'raw.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', `${SCREEN.w}x${SCREEN.h}`, '-i', `${process.env.DISPLAY}+0,0`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'ignore', 'inherit'] });
  await sleep(700);

  // Start: the card with its code, then Sam joins and is let in.
  const code = await startReview(h);
  await sleep(1600);
  await h.js(`window.frameling.review.join(${JSON.stringify(code)}, 'Sam')`);
  for (let i = 0; i < 100 && !(await js(`!!document.querySelector('[data-testid="review.letIn"]')`)); i++) await sleep(100);
  const { reviewWin } = require('./review-lib.cjs');
  const rwEarly = reviewWin(h);
  if (rwEarly) rwEarly.setBounds({ x: 900, y: 0, width: 700, height: 800 });
  await sleep(1800);
  await js(`document.querySelector('[data-testid="review.letIn"]').click()`);
  let rw = null;
  for (let i = 0; i < 150 && !rw; i++) {
    const w = reviewWin(h);
    if (w && (await js(`document.querySelector('[data-testid="review.win"]')?.dataset.link === 'in' && !!document.querySelector('[data-testid="popout.root"][data-ready]')`, w).catch(() => false))) rw = w;
    else await sleep(100);
  }
  if (!rw) throw new Error('the reviewer never got the picture');
  rw.setBounds({ x: 900, y: 0, width: 700, height: 800 });
  main.setBounds({ x: 0, y: 0, width: 900, height: 800 });
  await sleep(1600);

  // The sharer draws; the reviewer's window follows every stroke.
  const wave = (x0, x1, y, amp, n = 46) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y + Math.sin(i / 3.2) * amp]);
  await draw(wave(80, 720, 600, 16));
  await sleep(300);
  await draw(Array.from({ length: 40 }, (_, i) => { const t = i / 39; return [110 + t * 260, 150 + Math.sin(t * Math.PI) * -70 + t * 40]; }));
  await sleep(900);

  // The reviewer points at the ball, circles it and leaves a note.
  const rsend = (e) => rw.webContents.sendInputEvent(e);
  const rbox = await js(`(() => { const s = document.querySelector('[data-testid="popout.root"] .po-stage').getBoundingClientRect(); return { x: s.left, y: s.top, w: s.width, h: s.height }; })()`, rw);
  const at = (fx, fy) => ({ x: Math.round(rbox.x + rbox.w * fx), y: Math.round(rbox.y + rbox.h * fy) });
  const glide = async (pts, step = 30, down = false) => {
    for (const p of pts) {
      rsend({ type: 'mouseMove', ...at(...p), ...(down ? { modifiers: ['leftButtonDown'] } : {}) });
      await sleep(step);
    }
  };
  const path1 = Array.from({ length: 28 }, (_, i) => [0.2 + (i / 27) * 0.3, 0.7 - (i / 27) * 0.22 + Math.sin(i / 2) * 0.01]);
  await glide(path1, 38);
  await sleep(700);
  await js(`document.querySelector('[data-testid="review.tool.circle"]').click()`, rw);
  await sleep(300);
  rsend({ type: 'mouseMove', ...at(0.4, 0.4) });
  rsend({ type: 'mouseDown', ...at(0.4, 0.4), button: 'left', clickCount: 1 });
  await glide(Array.from({ length: 10 }, (_, i) => [0.4 + (i / 9) * 0.22, 0.4 + (i / 9) * 0.22]), 45, true);
  rsend({ type: 'mouseUp', ...at(0.62, 0.62), button: 'left', clickCount: 1 });
  await sleep(700);
  await js(`document.querySelector('[data-testid="review.tool.note"]').click()`, rw);
  await sleep(300);
  rsend({ type: 'mouseMove', ...at(0.66, 0.36) });
  rsend({ type: 'mouseDown', ...at(0.66, 0.36), button: 'left', clickCount: 1 });
  rsend({ type: 'mouseUp', ...at(0.66, 0.36), button: 'left', clickCount: 1 });
  await sleep(500);
  await rw.webContents.insertText('Squash it a bit more on the landing?');
  await sleep(900);
  rsend({ type: 'keyDown', keyCode: 'Enter' });
  rsend({ type: 'keyUp', keyCode: 'Enter' });
  await sleep(1800);
  // The sharer's pointer goes over the picture, and shows on the reviewer's.
  const sh = (x, y) => ({ ...scr(x, y) });
  for (let i = 0; i < 24; i++) {
    send({ type: 'mouseMove', ...sh(250 + i * 14, 430 - i * 6) });
    await sleep(40);
  }
  await sleep(900);
  // Nothing to press: the circle and the note are already in the sharer's drawing, with the reviewer's name on.
  await sleep(2600);

  const finalPng = path.join(tmp, 'last.png');
  fs.writeFileSync(finalPng, (await main.webContents.capturePage()).toPNG());
  ff.stdin.write('q');
  await new Promise((r) => ff.once('exit', r));

  if (wantAb) {
    const out = path.join(root, 'brand/ab/live-review');
    fs.mkdirSync(out, { recursive: true });
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-movflags', '+faststart', '-an', path.join(out, `live-review-${theme}.mp4`)]);
    console.log(`wrote ${out}/live-review-${theme}.mp4`);
  }
  if (wantHelp) {
    const out = path.join(root, 'public/help');
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'fps=20,scale=1000:-2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-movflags', '+faststart', '-an', path.join(out, `live-review-${theme}.mp4`)]);
    const lastFrame = path.join(tmp, 'poster-full.png');
    run('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-4', '-i', raw, '-frames:v', '1', lastFrame]);
    run('convert', [lastFrame, '-resize', '1000x>', '-colors', '256', '-dither', 'None', '-strip', '-define', 'png:compression-level=9', `PNG8:${path.join(out, `live-review-${theme}-poster.png`)}`]);
    console.log(`wrote ${out}/live-review-${theme}.mp4 and -poster.png`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});

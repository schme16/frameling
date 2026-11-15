// Clips for the capture-live look: the drawing window and the capture view side by side while a tool draws, so how far
// behind the capture view is can be seen. One clip per kind of tool. Records the whole virtual screen with ffmpeg, so it is
// what two windows really look like, then encodes H.264 (yuv420p, even sizes) with a label burned in.
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/capture-live-media.cjs --when after [--only vector-brush,move]
//   POPOUT_ROOT=<other checkout> ... --when before     the same clips from another checkout's build
//
// Writes brand/ab/capture-live/<kind>-<when>.mp4.
const { app } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { boot, popReady, sleep, MKDOC, root } = require('./popout-lib.cjs');
const { docScript } = require('../perf/capture-live-lib.cjs');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const when = arg('--when', 'after');
const only = arg('--only', '')?.split(',').filter(Boolean);
const SCREEN = { w: 1600, h: 800 };
const OUT = path.join(__dirname, '../../brand/ab/capture-live');

// Points are fractions of the canvas area.
const wave = (x0, x1, y, amp, n = 90) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y + Math.sin(i / 8) * amp]);
const spiral = (cx, cy, r, n = 100) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 7; const rr = (r * i) / n; return [cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr]; });
const drag = (a, b, n = 70) => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)]);

const KINDS = {
  'vector-brush': { label: 'Brush on a vector layer', doc: 'vector', steps: [{ tool: 'brush', pts: wave(0.26, 0.74, 0.38, 0.05) }, { tool: 'brush', pts: spiral(0.5, 0.56, 0.12) }] },
  'pixel-brush': { label: 'Brush and pencil on a pixel layer', doc: 'pixel', steps: [{ tool: 'brush', pts: wave(0.26, 0.74, 0.38, 0.05) }, { tool: 'pencil', pts: wave(0.26, 0.74, 0.6, 0.06), color: '#1d6fd6' }] },
  'pixel-eraser': { label: 'Eraser on a pixel layer', doc: 'pixel', steps: [{ tool: 'eraser', pts: wave(0.26, 0.74, 0.42, 0.06) }, { tool: 'eraser', pts: wave(0.26, 0.74, 0.58, 0.05) }] },
  'vector-shapes': { label: 'Rectangle, ellipse and star dragged out on a vector layer', doc: 'vector', steps: [{ tool: 'rect', pts: drag([0.27, 0.32], [0.45, 0.46]) }, { tool: 'ellipse', pts: drag([0.52, 0.32], [0.72, 0.5]) }, { tool: 'star', pts: drag([0.36, 0.5], [0.56, 0.7]) }] },
  'pixel-shapes': { label: 'Rectangle, line and ellipse dragged out on a pixel layer', doc: 'pixel', steps: [{ tool: 'rect', pts: drag([0.27, 0.32], [0.45, 0.46], 40) }, { tool: 'line', pts: drag([0.5, 0.34], [0.74, 0.66], 40) }, { tool: 'ellipse', pts: drag([0.3, 0.52], [0.5, 0.7], 40) }] },
  'vector-move': { label: 'Moving everything on a vector layer (Transform)', doc: 'vector', steps: [{ tool: 'transform', selectAll: true, pts: drag([0.38, 0.38], [0.58, 0.5], 80), hold: 900 }] },
  'pixel-move': { label: 'Moving everything on a pixel layer (Transform)', doc: 'pixel', steps: [{ tool: 'transform', selectAll: true, pts: drag([0.38, 0.38], [0.58, 0.5], 40), hold: 900 }] },
};

(async () => {
  const h = await boot({ theme: 'dark', width: 900, height: 800, choices: { 'popout.captureBackground': 'green', 'popout.captureCursor': 'hide', 'popout.captureSize': 'free' } });
  const { js, main, wc } = h;
  await js(MKDOC);
  const send = (e) => wc.sendInputEvent(e);
  const box = () => js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  await js(`window.__frameling.run('capture.toggle')`);
  const pw = await popReady(h);
  pw.setBounds({ x: 900, y: 0, width: 700, height: 800 });
  await sleep(800);
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-live-'));
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

  for (const [kind, spec] of Object.entries(KINDS)) {
    if (only.length && !only.includes(kind)) continue;
    process.stdout.write(`${kind} ... `);
    // Leave any transform session from the last clip first (it would otherwise be dropped with a hint on screen).
    await js(`window.__frameling.store().setUi({ tool: 'brush', selection: [] })`);
    await sleep(300);
    await js(docScript(spec.doc));
    await js('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    await sleep(600);
    main.focus();
    const raw = path.join(tmp, `${kind}.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', `${SCREEN.w}x${SCREEN.h}`, '-i', `${process.env.DISPLAY}+0,0`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'ignore', 'inherit'] });
    await sleep(900);
    for (const st of spec.steps) {
      await js(`window.__frameling.store().setUi({ tool: '${st.tool}', selection: []${st.color ? `, color: '${st.color}'` : ''} })`);
      if (st.selectAll) await js(`window.__frameling.run('select.all')`);
      await sleep(250);
      const b = await box();
      const pts = st.pts.map(([fx, fy]) => ({ x: Math.round(b.x + b.w * fx), y: Math.round(b.y + b.h * fy) }));
      send({ type: 'mouseMove', x: pts[0].x, y: pts[0].y });
      await sleep(150);
      send({ type: 'mouseDown', x: pts[0].x, y: pts[0].y, button: 'left', clickCount: 1 });
      for (let i = 1; i < pts.length; i++) {
        send({ type: 'mouseMove', x: pts[i].x, y: pts[i].y, modifiers: ['leftButtonDown'] });
        await sleep(22);
      }
      send({ type: 'mouseUp', x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, button: 'left', clickCount: 1 });
      await sleep(st.hold ?? 600);
      if (st.selectAll) {
        // Put the move back (Escape), so the next clip starts clean.
        send({ type: 'keyDown', keyCode: 'Escape' });
        send({ type: 'keyUp', keyCode: 'Escape' });
        await sleep(400);
      }
    }
    await sleep(900);
    ff.stdin.write('q');
    await new Promise((r) => ff.once('exit', r));
    const label = `${when === 'before' ? 'BEFORE' : 'AFTER'} - ${spec.label}`.replace(/'/g, '');
    const mp4 = path.join(OUT, `${kind}-${when}.mp4`);
    const vf = [
      'scale=1280:640:flags=lanczos',
      `drawbox=x=0:y=0:w=1280:h=30:color=black@0.65:t=fill`,
      `drawtext=fontfile=${font}:text='${label}':x=10:y=6:fontsize=18:fontcolor=white`,
      `drawtext=fontfile=${font}:text='Drawing window':x=10:y=608:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=5`,
      `drawtext=fontfile=${font}:text='Capture view':x=730:y=608:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=5`,
      'format=yuv420p',
    ].join(',');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-movflags', '+faststart', '-an', mp4]);
    console.log('wrote ' + path.relative(root, mp4));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});

// The clip and stills for the remote door, from the real app and a real program driving it: the switch off with nothing
// answering, the switch on, then docs/examples/remote-door.py (a separate Python process) driving the drawing while the app
// shows the door is open. Two real windows on the virtual screen: Frameling on the left, a plain "terminal" on the right that
// shows what the other program really printed. Records the screen with ffmpeg, then encodes H.264 (yuv420p, even sizes).
//
//   npm run build
//   for t in dark light; do xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/remote-door-media.cjs --theme $t; done
//
// Writes brand/ab/remote-door/remote-door-<theme>.mp4, stills of the Preferences switch (off, on) and the log, and the
// help clip public/help/remote-door-<theme>.mp4 with its poster. The key never appears on the screen.
const { app, BrowserWindow } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start, sleep, root } = require('./remote-door-lib.cjs');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const theme = arg('--theme', 'dark');
const AB = path.join(root, 'brand/ab/remote-door');
const HELP = path.join(root, 'public/help');
const W = { app: 1000, term: 600, h: 800 };
const DARK = theme === 'dark';
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';

const TERM = (bg, fg, dim, bar) => `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset=utf-8><body style="margin:0;background:${bg};color:${fg};font:15px/1.45 ui-monospace,'DejaVu Sans Mono',monospace;height:100vh;display:flex;flex-direction:column">
<div style="background:${bar};color:${dim};padding:8px 14px;font-size:13px;border-bottom:1px solid ${dim}33">Terminal: another program, on this computer</div>
<pre id=t style="margin:0;padding:14px;white-space:pre-wrap;word-break:break-all;overflow:hidden;flex:1"></pre></body>`)}`;

(async () => {
  fs.mkdirSync(AB, { recursive: true });
  fs.mkdirSync(HELP, { recursive: true });
  const h = await start({ theme, width: W.app, height: W.h });
  const { js, main } = h;
  main.setBounds({ x: 0, y: 0, width: W.app, height: W.h });
  const term = new BrowserWindow({ x: W.app, y: 0, width: W.term, height: W.h, frame: false, resizable: false, show: true, webPreferences: { backgroundThrottling: false } });
  await term.loadURL(DARK ? TERM('#1b1a22', '#e6e3ee', '#9a96a8', '#25232e') : TERM('#fbf6ea', '#2a2533', '#756f80', '#efe6d2'));
  const say = (text, cls) => term.webContents.executeJavaScript(`(() => { const t = document.getElementById('t'); t.textContent += ${JSON.stringify(text)}; t.parentElement.scrollTop = t.scrollHeight; })()`);
  const typeCmd = async (cmd) => {
    await say('$ ');
    for (const ch of cmd) { await say(ch); await sleep(28); }
    await say('\n');
    await sleep(350);
  };
  const lines = (s) => s.split('\n');

  await js(`window.__frameling.template('bouncing-ball')`);
  await sleep(600);
  // Preferences on the Remote door block, switch off.
  await js(`window.__frameling.overlays.openPrefs('plugins', undefined, 'Remote door')`);
  await sleep(900);
  await js(`(() => { const el = document.querySelector('[data-testid="remote.prefs"]'); el.scrollIntoView({ block: 'start' }); return true; })()`);
  await sleep(700);

  const crop = async (sel, file, pad = 12) => {
    const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const b = e.getBoundingClientRect(); return { x: Math.floor(b.left), y: Math.floor(b.top), width: Math.ceil(b.width), height: Math.ceil(b.height) }; })()`);
    const img = await main.webContents.capturePage({ x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2 });
    fs.writeFileSync(file, img.toPNG());
  };
  await crop('[data-testid="remote.prefs"]', path.join(AB, `prefs-switch-off-${theme}.png`));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-door-media-'));
  const raw = path.join(tmp, 'raw.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '20', '-video_size', `${W.app + W.term}x${W.h}`, '-i', `${process.env.DISPLAY}+0,0`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'inherit', 'inherit'] });
  await sleep(1200);

  // 1. Off, and nothing answers: a real curl to the usual port is refused.
  await typeCmd('curl http://127.0.0.1:47231/v1');
  const curl = (args) => new Promise((resolve) => { const p = spawn('curl', ['-sS', '--max-time', '5', ...args]); let o = ''; p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (o += d)); p.on('close', () => resolve(o.trim())); });
  await say((await curl(['http://127.0.0.1:47231/v1'])) + '\n\n');
  await sleep(2200);

  // 2. The person switches it on: a real click on the switch.
  const sw = await js(`(() => { const b = document.querySelector('[data-testid="remote.switch"]').getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
  main.webContents.sendInputEvent({ type: 'mouseMove', x: sw.x, y: sw.y });
  await sleep(500);
  main.webContents.sendInputEvent({ type: 'mouseDown', x: sw.x, y: sw.y, button: 'left', clickCount: 1 });
  main.webContents.sendInputEvent({ type: 'mouseUp', x: sw.x, y: sw.y, button: 'left', clickCount: 1 });
  let found = null;
  for (let i = 0; i < 50 && !found; i++) {
    await sleep(100);
    if (fs.existsSync(h.dataFile('remote-door.json'))) found = JSON.parse(fs.readFileSync(h.dataFile('remote-door.json'), 'utf8'));
  }
  if (!found) throw new Error('the door did not open');
  const key = fs.readFileSync(h.dataFile('remote-door-key.txt'), 'utf8').trim();
  await sleep(1400);
  await crop('[data-testid="remote.prefs"]', path.join(AB, `prefs-switch-on-${theme}.png`));
  await typeCmd('curl http://127.0.0.1:47231/v1');
  await say((await curl([`http://127.0.0.1:${found.port}/v1`])) + '\n\n');
  await sleep(1500);
  await typeCmd('curl -H "Authorization: Bearer $FRAMELING_KEY" http://127.0.0.1:47231/v1');
  await say(lines(await curl(['-H', `Authorization: Bearer ${key}`, `http://127.0.0.1:${found.port}/v1`])).join('\n').slice(0, 200) + '\n\n');
  await sleep(2000);

  // 3. Close Preferences, and another program drives the drawing.
  main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await sleep(1200);
  await typeCmd('python3 docs/examples/remote-door.py');
  const py = spawn('python3', [path.join(root, 'docs/examples/remote-door.py')], { env: { ...process.env, FRAMELING_KEY: key, FRAMELING_URL: found.address } });
  let pending = '';
  const printed = new Promise((resolve) => {
    py.stdout.on('data', async (d) => { pending += d; });
    py.on('close', resolve);
  });
  // Show each line a moment after the one before, so the drawing changes can be seen between them.
  let shown = 0;
  while (true) {
    const ls = pending.split('\n');
    while (shown < ls.length - 1) { await say(ls[shown].slice(0, 400) + '\n'); shown++; await sleep(1500); }
    if (py.exitCode !== null) break;
    await sleep(200);
  }
  await printed;
  await sleep(800);
  await say('\n$ ');

  // 4. The pill and its log.
  await js(`document.querySelector('[data-testid="remote.badge"]').click()`);
  await sleep(900);
  await crop('[data-testid="remote.card"]', path.join(AB, `log-${theme}.png`), 6);
  await sleep(3500);

  ff.stdin.write('q');
  await new Promise((r) => ff.once('exit', r));

  // Encode: the board clip (1280 wide) and the help clip (smaller, under a megabyte).
  const enc = (out, width, crf, fps) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `fps=${fps},scale=${width}:-2:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', '-an', out]);
  enc(path.join(AB, `remote-door-${theme}.mp4`), 1280, 24, 20);
  enc(path.join(HELP, `remote-door-${theme}.mp4`), 960, 32, 12);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-1.5', '-i', raw, '-frames:v', '1', '-vf', 'scale=800:-2', path.join(tmp, 'poster.png')]);
  execFileSync('convert', [path.join(tmp, 'poster.png'), '-colors', '256', '-dither', 'None', '-strip', '-define', 'png:compression-level=9', `PNG8:${path.join(HELP, `remote-door-${theme}-poster.png`)}`]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('wrote', theme);
  app.exit(0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});

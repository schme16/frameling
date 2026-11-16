// The clip for the stream overlay: the REAL app with its REAL actions door, and the overlay page loaded the way OBS
// loads it (a transparent, offscreen browser window pointed at the overlay address, so this also proves that a browser
// source gets through the door's server). Its frames, with their see-through background, are laid over a still of a
// drawing by ffmpeg, the way OBS lays a browser source over the capture view. The audience does things through the real
// gate: a countdown and a challenge, a grey view, Quill cheering and snacking, and a prompt pulled out of the jar.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/overlay-clip.cjs --drawing light|dark [--out <dir>]
//
// Writes <out>/overlay-over-<drawing>-drawing.mp4 (H.264, captioned) and a still of every piece showing together.
const { app, BrowserWindow } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { boot, sleep, root } = require('./popout-lib.cjs');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const drawing = arg('--drawing', 'light');
const outDir = path.resolve(arg('--out', path.join(root, 'brand/ab/stream-overlay')));
const W = 1280;
const H = 720;
const FPS = 30;
const BAND = 56;

// A little landscape, light (day) or dark (night), 1280 x 720, so both a bright and a dim drawing sit under the overlay.
const SCENE = (night) => `(() => {
  const K = 0.5522847498307936;
  const ell = (cx, cy, rx, ry) => { const kx = K * rx, ky = K * ry; return { closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] }; };
  const poly = (pts) => ({ closed: true, points: pts.map(([x, y]) => ({ x, y })) });
  let n = 0; const id = (p) => p + '-' + ++n;
  const sh = (paths, fill, opacity = 1) => ({ id: id('sh'), type: 'path', paths, fill, stroke: null, opacity });
  const N = ${night ? 'true' : 'false'};
  const c = N
    ? { sky: '#16143a', body: '#f6f1cf', far: '#26406b', near: '#1c5f5a', front: '#12403f', wall: '#3b3350', roof: '#7a3b5e', win: '#ffd35a', trunk: '#2a2033', leaf: '#1a5a4a', flower: '#ff7aa8' }
    : { sky: '#bfe8ff', body: '#ffd35a', far: '#a9dcb0', near: '#7fcf93', front: '#5bb877', wall: '#fff0d6', roof: '#e0607e', win: '#7cc6ff', trunk: '#8a6a4f', leaf: '#3fa764', flower: '#ff6f91' };
  const shapes = [
    sh([poly([[0, 0], [1280, 0], [1280, 720], [0, 720]])], c.sky),
    sh([ell(1010, 170, 78, 78)], c.body),
    ...(N ? [[120, 90], [300, 160], [520, 70], [700, 130], [860, 60], [180, 250], [440, 230]].map(([x, y]) => sh([ell(x, y, 4, 4)], '#ffffff', 0.9)) : [[260, 160, 120, 34], [330, 140, 70, 30], [760, 110, 110, 30], [830, 95, 60, 26]].map(([x, y, rx, ry]) => sh([ell(x, y, rx, ry)], '#ffffff', 0.95))),
    sh([ell(300, 760, 700, 280)], c.far),
    sh([ell(1000, 790, 620, 300)], c.near),
    sh([ell(640, 900, 900, 300)], c.front),
    sh([poly([[420, 470], [640, 470], [640, 600], [420, 600]])], c.wall),
    sh([poly([[400, 470], [530, 380], [660, 470]])], c.roof),
    sh([poly([[455, 505], [505, 505], [505, 555], [455, 555]])], c.win),
    sh([poly([[560, 520], [610, 520], [610, 600], [560, 600]])], c.roof),
    sh([poly([[880, 520], [900, 520], [900, 620], [880, 620]])], c.trunk),
    sh([ell(890, 480, 70, 80)], c.leaf),
    ...[[150, 640], [210, 665], [90, 670], [760, 650], [980, 675], [1100, 640]].map(([x, y]) => sh([ell(x, y, 9, 9)], c.flower)),
  ];
  const doc = { format: 'frameling', version: 1, lineage: true, id: id('doc'), name: 'Overlay clip', width: 1280, height: 720, fps: 12, length: 1, background: c.sky, layers: [], drawings: {}, clips: [], markers: [], swatches: [] };
  const layer = { id: id('l'), name: 'Scene', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
  const d = { id: id('dr'), kind: 'vector', shapes };
  doc.drawings[d.id] = d; layer.cels.push({ id: id('c'), start: 0, length: 1, drawingId: d.id });
  doc.layers.push(layer);
  const S = window.__frameling.store();
  S.load(doc);
  S.setUi({ tool: 'brush', activeLayerId: layer.id, frame: 0, playing: false });
  return true;
})()`;

const run = (cmd, args, opts) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'], ...opts });

(async () => {
  const theme = drawing === 'dark' ? 'dark' : 'light';
  const h = await boot({ theme, width: 1500, height: 900, choices: { 'dares.length': 'short', 'streamoverlay.prompt': 'ask', 'quillreacts.signs': 'ask' } });
  const { js, main } = h;
  // Quill on (the harness turns him off by default), then a reload so it is in force from the start.
  await js(`(() => { const k = 'frameling.prefs.v1'; const p = JSON.parse(localStorage.getItem(k)); p.showQuill = true; localStorage.setItem(k, JSON.stringify(p)); location.reload(); })()`);
  await sleep(600);
  await h.ready();
  await js(SCENE(drawing === 'dark'));
  await js(`window.__frameling.run('view.fit')`);
  await sleep(900);

  // The drawing, as the capture view would show it: just the picture. A still of it is the backdrop.
  const view = await js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); const u = window.__frameling.store().get().ui; return { x: r.left, y: r.top, zoom: u.zoom, panX: u.panX, panY: u.panY }; })()`);
  const rect = { x: Math.round(view.x + view.panX), y: Math.round(view.y + view.panY), width: Math.round(1280 * view.zoom), height: Math.round(720 * view.zoom) };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-clip-'));
  const bg = path.join(tmp, 'bg.png');
  fs.writeFileSync(bg, (await main.webContents.capturePage(rect)).toPNG());

  // The audience switch on (relaxed, so cooldowns are short enough for one clip), which opens the real door.
  await js(`__framelingAudience.on(0, 'relaxed')`);
  let url = '';
  for (let i = 0; i < 60 && !url; i++) {
    url = await js(`window.frameling.overlay.url()`).catch(() => '');
    if (!url) await sleep(150);
  }
  if (!url) throw new Error('the door never opened, so there is no overlay address');
  console.log('overlay address found (token hidden):', url.replace(/overlay\/[^/]+\//, 'overlay/<token>/'));
  await sleep(500);

  // The overlay, loaded the way OBS loads a browser source: transparent, nothing else on it.
  const ov = new BrowserWindow({ width: W, height: H, useContentSize: true, show: false, frame: false, transparent: true, backgroundColor: '#00000000', webPreferences: { offscreen: true, backgroundThrottling: false } });
  ov.webContents.setFrameRate(FPS);
  let latest = null;
  let size = null;
  ov.webContents.on('paint', (_e, _dirty, image) => {
    size = image.getSize();
    latest = image.toBitmap();
  });
  await ov.loadURL(url);
  for (let i = 0; i < 50 && !latest; i++) await sleep(100);
  if (!latest) throw new Error('the overlay never painted');
  // It sent no Origin and no cross-site mark, so the server let it in: check the page really loaded, not an error.
  const title = await ov.webContents.executeJavaScript('document.title');
  if (title !== 'Frameling overlay') throw new Error('the overlay page did not load: ' + title);

  const raw = path.join(tmp, 'raw.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', String(FPS), '-i', bg, '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${size.width}x${size.height}`, '-framerate', String(FPS), '-i', 'pipe:0',
    '-filter_complex', `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=rgba[bg];[1:v]format=rgba,unpremultiply=inplace=1[fg];[bg][fg]overlay=format=auto:shortest=1,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-an', raw], { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = new Promise((r) => ff.once('exit', r));
  // One frame for every 1/30 s of real time, however late a timer fires, so the clip runs at the speed things really happened.
  let draining = false;
  let written = 0;
  const t0 = Date.now();
  const pump = setInterval(() => {
    const due = Math.floor(((Date.now() - t0) / 1000) * FPS);
    while (!draining && latest && written < due) {
      written++;
      if (!ff.stdin.write(latest)) {
        draining = true;
        ff.stdin.once('drain', () => (draining = false));
      }
    }
  }, 10);
  const at = () => written / FPS;
  const marks = [];
  const mark = (text) => marks.push({ t: at(), text });
  const gate = (id, body) => js(`__framelingAudience.submit(${JSON.stringify(id)}${body ? ', ' + JSON.stringify(body) : ''})`);

  // The gate leaves a short gap between one thing and the next, so a caption goes up once the thing has really appeared.
  const GAP = 1700;
  const doAndSay = async (id, body, text, rest) => {
    await gate(id, body);
    await sleep(GAP);
    mark(text);
    await sleep(rest);
  };
  mark('Nothing is happening, so the overlay is empty (see-through).');
  await sleep(2000);
  await doAndSay('dare.challenge', { text: 'Draw the next thing with your other hand.' }, 'The audience starts a challenge: a banner with its bar.', 1000);
  await doAndSay('dare.grey', undefined, 'A dare that changes the view shows as a chip, with its seconds.', 1000);
  await doAndSay('quill.cheer', undefined, 'Chat makes Quill cheer.', 2200);
  mark('The streamer pulls a prompt from the jar and presses Show on stream.');
  await js(`(() => { __framelingJar.add('a hedgehog in a tiny hat'); window.__frameling.run('promptjar.open'); return true; })()`);
  await sleep(400);
  await js(`document.querySelector('[data-testid="promptjar.pull"]').click()`);
  await sleep(600);
  await js(`document.querySelector('[data-testid="promptjar.onStream"]').click()`);
  await sleep(2400);
  await doAndSay('dare.countdown', { seconds: 6, text: 'Beat the clock' }, 'A countdown...', 100);
  await doAndSay('quill.snack', undefined, '...and Quill has a snack from chat.', 100);
  const stillAt = at();
  await sleep(1200);
  mark('Each piece goes by itself. The prompt comes off when the streamer takes it off.');
  await js(`document.querySelector('[data-testid="promptjar.onStream"]').click()`);
  await sleep(6000);
  mark('');
  await sleep(800);

  clearInterval(pump);
  ff.stdin.end();
  await done;
  ov.destroy();

  fs.mkdirSync(outDir, { recursive: true });
  const colours = drawing === 'dark' ? ['#1d1b26', 'white'] : ['#fffaf2', '#2a2533'];
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019').replace(/%/g, '\\%');
  const texts = marks
    .map((m, i) => (m.text ? `drawtext=fontfile=${font}:text='${esc(m.text)}':fontcolor=${colours[1]}:fontsize=22:x=(w-text_w)/2:y=${H}+(${BAND}-text_h)/2:enable='between(t,${m.t.toFixed(2)},${((marks[i + 1] ? marks[i + 1].t : m.t + 99)).toFixed(2)})'` : null))
    .filter(Boolean);
  const finalName = `overlay-over-${drawing}-drawing`;
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `pad=${W}:${H + BAND}:0:0:color=${colours[0]},${texts.join(',')},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-movflags', '+faststart', '-an', path.join(outDir, `${finalName}.mp4`)]);
  // One still with the most pieces showing at once.
  run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', stillAt.toFixed(2), '-i', path.join(outDir, `${finalName}.mp4`), '-frames:v', '1', path.join(outDir, `${finalName}.png`)]);
  console.log(`wrote ${outDir}/${finalName}.mp4 and .png (${at().toFixed(1)}s)`);
  app.exit(0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});

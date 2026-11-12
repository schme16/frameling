// Loads the slices of Frameling's Phaser, PixiJS and CSS sprite sheet exports in the real engines (the pinned builds of
// scripts/e2e/web-engines) inside a hidden Electron window. Used by test/export/slices-web-e2e.test.ts (WEB_ENGINES=1):
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/web-slices.cjs <folder with the exported files>
// Prints one line, "RESULT {json}". The folder holds hero.png, hero.json (phaser/ and pixi/ subfolders hold their json) and
// css/hero.css with its 9-patch picture.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { ensureEngines } = require('./web-engines/engines.cjs');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const dir = path.resolve(process.argv.find((a, i) => i > 1 && !a.startsWith('-') && !a.endsWith('.cjs')) ?? '.');

const pages = {
  phaser: (v) => `<!doctype html><body><script src="/engines/${v}.min.js"></script><script>
window.run = () => new Promise((resolve) => {
  const g = new Phaser.Game({ type: Phaser.CANVAS, width: 64, height: 64, audio: { noAudio: true }, banner: false,
    scene: { preload() { this.load.atlas('hero', '/phaser/hero.png', '/phaser/hero.json'); },
      create() {
        const t = this.textures.get('hero');
        const out = {};
        for (const n of t.getFrameNames()) { const f = t.get(n); out[n] = { x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight, pivot: f.customPivot ? [f.pivotX, f.pivotY] : null }; }
        // The animations file (a slice that moves has one): what the engine makes of it.
        const anims = {};
        fetch('/phaser/hero-anims.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
          if (j) { this.anims.fromJSON(j); for (const a of this.anims.anims.values()) anims[a.key] = { frameRate: a.frameRate, frames: a.frames.map((f) => f.textureFrame) }; }
          resolve({ version: Phaser.VERSION, frames: out, anims });
        });
      } } });
});</script></body>`,
  pixi: () => `<!doctype html><body><script src="/engines/pixi.min.js"></script><script>
window.run = async () => {
  const app = new PIXI.Application();
  await app.init({ width: 64, height: 64, preference: 'canvas' });
  const sheet = await PIXI.Assets.load('/pixi/hero.json');
  const out = {};
  for (const [n, t] of Object.entries(sheet.textures)) out[n] = { x: t.frame.x, y: t.frame.y, w: t.frame.width, h: t.frame.height, anchor: t.defaultAnchor ? [t.defaultAnchor.x, t.defaultAnchor.y] : null };
  // The animations: the frame region of each texture in each.
  const anims = {};
  for (const [n, list] of Object.entries(sheet.animations || {})) anims[n] = list.map((t) => [t.frame.x, t.frame.y]);
  return { version: PIXI.VERSION, frames: out, anims };
};</script></body>`,
  css: () => `<!doctype html><html><head><link rel="stylesheet" href="/css/hero.css"><style>html,body{margin:0;background:#fff}
#nine{position:absolute;left:10px;top:10px;width:60px;height:40px}#plain{position:absolute;left:100px;top:10px}</style></head>
<body><div id="nine" class="hero-slice-panel"></div><div id="plain" class="hero-slice-block"></div></body></html>`,
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const rel = decodeURIComponent(url.pathname);
  let file = null;
  if (rel.startsWith('/page/')) {
    const [kind, v] = rel.slice(6).split('/');
    res.writeHead(200, { 'content-type': 'text/html' }).end(pages[kind](v));
    return;
  }
  if (rel.startsWith('/engines/')) file = engines[rel.slice(9).replace('.min.js', '')];
  else file = path.join(dir, rel);
  if (!file || !path.resolve(file).startsWith(path.resolve(file.startsWith(dir) ? dir : path.dirname(file))) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

let engines;
async function load(win, p) {
  await win.loadURL(`http://127.0.0.1:${server.address().port}/page/${p}`);
}

app.whenReady().then(async () => {
  engines = await ensureEngines();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const result = {};
  const win = new BrowserWindow({ show: true, width: 240, height: 160, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  for (const [label, p] of [['phaser3', 'phaser/phaser'], ['phaser4', 'phaser/phaser4'], ['pixi', 'pixi/x']]) {
    await load(win, p);
    result[label] = await win.webContents.executeJavaScript('window.run()', true).catch((e) => ({ error: String(e) }));
  }
  await load(win, 'css/x');
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage();
  const { width } = img.getSize();
  const bmp = img.toBitmap();
  // BGRA. Colours as #rrggbb at a point of the page (device pixels may be scaled, so ask for the factor).
  const scale = width / 240;
  const at = (x, y) => { const o = (Math.round(y * scale) * width + Math.round(x * scale)) * 4; return '#' + [bmp[o + 2], bmp[o + 1], bmp[o]].map((v) => v.toString(16).padStart(2, '0')).join(''); };
  result.css = {
    corner: at(11, 11), top: at(40, 11), middle: at(40, 30), insideBorder: at(10 + 5, 10 + 5), bottomRight: at(68, 48),
    outside: at(75, 30), plainTopLeft: at(101, 11), plainRect: await win.webContents.executeJavaScript('(() => { const r = document.getElementById("nine").getBoundingClientRect(); const p = document.getElementById("plain").getBoundingClientRect(); return [r.width, r.height, p.width, p.height]; })()'),
  };
  console.log('RESULT ' + JSON.stringify(result));
  server.close();
  app.exit(0);
});

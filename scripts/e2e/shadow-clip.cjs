// Checks that a Shadow shows in full in the Lottie players. A Lottie drop shadow is cut off at its layer's own box in
// lottie-web's SVG player, so each test document puts a shadow well past a small drawing. Renders the editor's frame and
// the frame from the Lottie file in lottie-web (SVG and canvas players) and, with DOTLOTTIE_DIR, the dotLottie web
// player (ThorVG), then prints the share of the editor's shadow ink each player shows and the RMSE against the editor.
// lottie-web's canvas player ignores effects, so it is reported only (use "Draw Soften and Shadow as pictures").
//
//   DOTLOTTIE_DIR=<unpacked @lottiefiles/dotlottie-web package> xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/shadow-clip.cjs [outDir]
//
// Saves editor-, svg-, canvas- and thorvg- PNGs per document and frame. ONLY=box,dot picks documents, FRAMES=1,6 the frames.
// Exits non-zero when the SVG player or the dotLottie player shows less than MIN of the editor's shadow ink or is
// further than MAX_RMSE from it.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('shadow-clip.cjs') && !a.startsWith('--'));
const outDir = path.resolve(argv[0] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-clip-')));
fs.mkdirSync(outDir, { recursive: true });
const FRAMES = (process.env.FRAMES ?? '1,6').split(',').map(Number);
const MIN = Number(process.env.MIN ?? 0.85);
const MAX_RMSE = Number(process.env.MAX_RMSE ?? 6);
const pkg = process.env.DOTLOTTIE_DIR && path.resolve(process.env.DOTLOTTIE_DIR);

const ink = (px) => {
  let s = 0;
  for (let i = 0; i < px.length; i += 4) s += 255 - (px[i] + px[i + 1] + px[i + 2]) / 3;
  return s;
};
const rmse = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) s += (a[i + k] - b[i + k]) ** 2;
  return Math.sqrt(s / ((a.length / 4) * 3));
};

app.whenReady().then(async () => {
  let failed = 0;
  let server;
  try {
    await require('esbuild').build({ entryPoints: [path.join(__dirname, 'shadow-clip-page.ts')], bundle: true, format: 'iife', outfile: path.join(outDir, 'page.js'), logLevel: 'error', loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty' } });
    fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"><script src="page.js"></script></body></html>');
    server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const dl = url.startsWith('/dl/');
      const base = dl ? path.join(pkg ?? '/nonexistent', 'dist') : outDir;
      const file = dl ? path.join(base, path.normalize(url.slice(4))) : path.join(base, path.normalize(url === '/' ? 'index.html' : url));
      if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return void res.writeHead(404).end();
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' }).end(fs.readFileSync(file));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const win = new BrowserWindow({ width: 600, height: 300, show: true, webPreferences: { backgroundThrottling: false } });
    await win.loadURL(origin + '/index.html');
    const ev = (js) => win.webContents.executeJavaScript(js);
    const only = process.env.ONLY?.split(',');
    const names = (await ev('clip.names()')).filter((n) => !only || only.includes(n));
    const players = ['svg', 'canvas', ...(pkg ? ['thorvg'] : [])];
    console.log(['document'.padEnd(14), ...players.map((p) => (p + ' ink').padStart(12)), ...players.map((p) => (p + ' rmse').padStart(12))].join(' '));
    for (const name of names) {
      for (const f of FRAMES) {
        const q = JSON.stringify(name);
        const editor = await ev(`clip.editor(${q}, ${f})`);
        fs.writeFileSync(path.join(outDir, `${name}-${f}-editor.png`), Buffer.from(editor.png.split(',')[1], 'base64'));
        const got = {
          svg: await ev(`clip.lottieSvg(${q}, ${f})`),
          canvas: await ev(`clip.lottieCanvas(${q}, ${f})`),
          ...(pkg ? { thorvg: await ev(`clip.thorvg(${q}, ${f}, ${JSON.stringify(origin + '/dl')})`) } : {}),
        };
        const e = ink(editor.px) || 1;
        const share = {};
        const err = {};
        for (const p of players) {
          fs.writeFileSync(path.join(outDir, `${name}-${f}-${p}.png`), Buffer.from(got[p].png.split(',')[1], 'base64'));
          share[p] = ink(got[p].px) / e;
          err[p] = rmse(editor.px, got[p].px);
        }
        console.log([`${name} ${f}`.padEnd(14), ...players.map((p) => share[p].toFixed(2).padStart(12)), ...players.map((p) => err[p].toFixed(2).padStart(12))].join(' '));
        for (const p of players.filter((x) => x !== 'canvas')) {
          if (share[p] < MIN || err[p] > MAX_RMSE) {
            failed++;
            console.log(`   OFF  ${p}: ${(share[p] * 100).toFixed(0)}% of the editor's ink, RMSE ${err[p].toFixed(2)}`);
          }
        }
      }
    }
  } catch (e) {
    console.error(e?.stack ?? e);
    failed++;
  }
  server?.close();
  console.log(failed ? `\n${failed} off` : '\nthe shadow shows in full');
  app.exit(failed ? 1 : 0);
});

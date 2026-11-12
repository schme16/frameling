// Plays a Lottie export as plain JSON and as a dotLottie (.lottie zip) in the dotLottie web player (ThorVG, in Chromium) and
// compares frames with Frameling's own renderer and with each other. The player isn't a dependency of the app: unpack a
// pinned copy somewhere and point DOTLOTTIE_DIR at its package folder.
//
//   npm pack @lottiefiles/dotlottie-web@0.83.1 && mkdir pkg && tar xzf lottiefiles-dotlottie-web-0.83.1.tgz -C pkg
//   DOTLOTTIE_DIR=$PWD/pkg/package ONLY=tpl:hero-sprites,tpl:bouncing-ball xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/dotlottie-check.cjs [outDir]
//
// Prints per document: the sizes, RMSE (0 to 255) of each player against Frameling over some frames, and how far the two
// players are from each other (should be 0: same animation, same pictures).
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const argv = process.argv.slice(2).filter((a) => !a.endsWith('dotlottie-check.cjs') && !a.startsWith('--'));
const outDir = path.resolve(argv[0] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-dotlottie-')));
fs.mkdirSync(outDir, { recursive: true });
const pkg = process.env.DOTLOTTIE_DIR && path.resolve(process.env.DOTLOTTIE_DIR);
if (!pkg || !fs.existsSync(path.join(pkg, 'dist', 'index.js'))) {
  console.error('Set DOTLOTTIE_DIR to the unpacked @lottiefiles/dotlottie-web package folder (see the top of this file).');
  process.exit(2);
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };

app.whenReady().then(async () => {
  let server;
  try {
    await require('esbuild').build({
      entryPoints: [path.join(__dirname, 'vector-check-page.ts')],
      bundle: true,
      format: 'iife',
      outfile: path.join(outDir, 'page.js'),
      logLevel: 'error',
      loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty' },
    });
    fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="svg"></div><div id="lsvg"></div><div id="lottie"></div><script src="page.js"></script></body></html>');
    // Served over http so the page can load the player's module and wasm like a website would.
    server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const file = url.startsWith('/dl/') ? path.join(pkg, 'dist', path.normalize(url.slice(4))) : path.join(outDir, path.normalize(url === '/' ? 'index.html' : url));
      const root = url.startsWith('/dl/') ? path.join(pkg, 'dist') : outDir;
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' }).end(fs.readFileSync(file));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const win = new BrowserWindow({ width: 1000, height: 700, show: true, webPreferences: { backgroundThrottling: false } });
    win.webContents.on('console-message', (_e, level, msg) => level >= 2 && console.log('page:', msg));
    await win.loadURL(origin + '/index.html');
    const ev = (js) => win.webContents.executeJavaScript(js);
    const names = (process.env.ONLY ?? 'frame-by-frame,tpl:hero-sprites,tpl:walk-cycle,heavy-effects,tpl:explosion-fx,tpl:puppet').split(',');
    // DOTLOTTIE_VERSION=1, 2 or 1,2 (default): which layouts to write and play.
    const versions = (process.env.DOTLOTTIE_VERSION ?? '2,1').split(',').map(Number);
    console.log('doc | layout | json bytes | .lottie bytes | frames | rmse json player | rmse .lottie player | json vs .lottie | drawn pixels');
    let bad = 0;
    for (const name of names) {
      const info = await ev(`check.load(${JSON.stringify(name)})`);
      const frames = [...new Set([0, 1, 2, 3, 4, 5, 6].map((k) => Math.floor((info.length - 1) * (k / 6))))];
      for (const v of versions) {
        try {
          const r = await ev(`check.dotLottie(${JSON.stringify(origin + '/dl')}, ${JSON.stringify(frames)}, ${v})`);
          console.log([name, 'v' + v, r.jsonBytes, r.lottieBytes, r.total, r.rJson.toFixed(2), r.rLottie.toFixed(2), r.between.toFixed(3), r.ink].join(' | '));
          if (r.between > 0.5 || !r.ink) bad++;
        } catch (e) {
          console.log(name, 'v' + v, 'FAILED', e.message);
          bad++;
        }
      }
    }
    console.log(bad ? `${bad} PROBLEM(S)` : 'dotLottie plays like the JSON');
    server.close();
    app.exit(bad ? 1 : 0);
  } catch (e) {
    console.error(e);
    server?.close();
    app.exit(1);
  }
});

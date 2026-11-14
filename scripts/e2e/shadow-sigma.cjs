// Measures how soft a Shadow and a Glow come out in the editor (native canvas filter and the JS fallback) and in every
// export that draws them, as the gaussian sigma of the blurred edge (pixels), so each format's softness can be compared
// with what the editor shows. Formats that bake the layer to a picture (PDF, .ai, PSD, PNG, video, Godot...) use the
// editor's own renderer; SVG, moving SVG and Lottie write the effect as their own blur, so those are the ones that can drift.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/shadow-sigma.cjs [outDir]
//
// Prints a table (expected sigma, then each format's) and exits non-zero when a format is more than TOL pixels off the editor.
// Needs pdftoppm and ImageMagick convert for the PDF, .ai and PSD rows; a missing tool skips them.
const { app, BrowserWindow } = require('electron');
// Software drawing with no GPU process (what a harness with no flags got under xvfb, so its pictures stay as they were), with
// the colour pinned to sRGB (scripts/lib/gpu.cjs).
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('shadow-sigma.cjs') && !a.startsWith('--'));
const outDir = path.resolve(argv[0] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-sigma-')));
fs.mkdirSync(outDir, { recursive: true });
const AMOUNTS = (process.env.AMOUNTS ?? '4,8,12,16').split(',').map(Number);
// A format is off when it is further from the editor than this many pixels of sigma and than 12 percent of it.
const TOL = Number(process.env.TOL ?? 0.6);
// DOTLOTTIE_DIR=<unpacked @lottiefiles/dotlottie-web package> also measures the dotLottie web player (ThorVG), see dotlottie-check.cjs.
const pkg = process.env.DOTLOTTIE_DIR && path.resolve(process.env.DOTLOTTIE_DIR);

const has = (bin) => cp.spawnSync('which', [bin]).status === 0;

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  let failed = 0;
  let server;
  try {
    await require('esbuild').build({ entryPoints: [path.join(__dirname, 'shadow-sigma-page.ts')], bundle: true, format: 'iife', outfile: path.join(outDir, 'page.js'), logLevel: 'error', loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty' } });
    fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"><script src="page.js"></script></body></html>');
    // Served over http so the page can load the player's module and wasm like a website would.
    server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const dl = url.startsWith('/dl/');
      const root = dl ? path.join(pkg ?? '/nonexistent', 'dist') : outDir;
      const file = dl ? path.join(root, path.normalize(url.slice(4))) : path.join(root, path.normalize(url === '/' ? 'index.html' : url));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return void res.writeHead(404).end();
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' }).end(fs.readFileSync(file));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const win = new BrowserWindow({ width: 600, height: 300, show: true, webPreferences: { backgroundThrottling: false } });
    await win.loadURL(origin + '/index.html');
    const ev = (js) => win.webContents.executeJavaScript(js);
    const { W, H, EDGE, SHIFT } = await ev('({ W: sig.W, H: sig.H, EDGE: sig.EDGE, SHIFT: sig.SHIFT })');
    const fitRow = (row, kind) => ev(`sig.fit(${JSON.stringify(row)}, sig.from(${JSON.stringify(kind)}))`);
    const tools = { pdftoppm: has('pdftoppm'), convert: has('convert'), rsvg: has('rsvg-convert') };

    // A gray row from a picture file made by ImageMagick (255 = white), as darkness.
    const fileRow = (file, index = '') => {
      const r = cp.spawnSync('convert', [file + index, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', '-colorspace', 'Gray', '-depth', '8', '-crop', `${W}x1+0+${H >> 1}`, '+repage', 'gray:-'], { maxBuffer: 1 << 24 });
      if (r.status !== 0) throw new Error(`convert failed: ${r.stderr}`);
      return Array.from(r.stdout, (v) => 1 - v / 255);
    };
    const tmp = (name, bytes) => {
      const f = path.join(outDir, name);
      fs.writeFileSync(f, bytes);
      return f;
    };

    const rows = [];
    for (const kind of ['shadow', 'glow']) {
      for (const amount of AMOUNTS) {
        const res = { kind, amount, sigma: {} };
        const put = async (name, row) => {
          (res.rows ??= {})[name] = row;
          const f = await fitRow(row, kind);
          res.sigma[name] = f.n >= 3 ? f.sigma : NaN;
        };
        await put('editor', await ev(`sig.editor(${JSON.stringify(kind)}, ${amount}, 'native')`));
        await put('fallback', await ev(`sig.editor(${JSON.stringify(kind)}, ${amount}, 'fallback')`));
        const svg = await ev(`sig.svg(${JSON.stringify(kind)}, ${amount})`);
        await put('svg', svg.row);
        tmp(`${kind}-${amount}.svg`, svg.svg);
        if (tools.rsvg && tools.convert) {
          const png = path.join(outDir, `${kind}-${amount}-rsvg.png`);
          cp.spawnSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-b', 'white', '-o', png, path.join(outDir, `${kind}-${amount}.svg`)]);
          await put('svg(rsvg)', fileRow(png));
        }
        const sa = await ev(`sig.svganim(${JSON.stringify(kind)}, ${amount})`);
        await put('svganim', sa.row);
        const lo = await ev(`sig.lottie(${JSON.stringify(kind)}, ${amount})`);
        await put('lottie', lo.row);
        tmp(`${kind}-${amount}-lottie.json`, lo.json);
        // Lottie players cut an effect off at the layer's bounds: how much of the shadow survives when the layer is only as big as its drawing.
        const tight = await ev(`sig.lottie(${JSON.stringify(kind)}, ${amount}, false)`);
        const ink = (row) => row.slice(EDGE).reduce((a, b) => a + b, 0);
        res.tight = ink(tight.row) / (ink(lo.row) || 1);
        if (pkg) res.tightThor = ink(await ev(`sig.thorvg(${JSON.stringify(kind)}, ${amount}, ${JSON.stringify(origin + '/dl')}, false)`)) / (ink(await ev(`sig.thorvg(${JSON.stringify(kind)}, ${amount}, ${JSON.stringify(origin + '/dl')})`)) || 1);
        if (pkg) await put('thorvg', await ev(`sig.thorvg(${JSON.stringify(kind)}, ${amount}, ${JSON.stringify(origin + '/dl')})`));
        tmp(`${kind}-${amount}-lottie.svg`, lo.svg);
        if (tools.pdftoppm && tools.convert) {
          for (const ai of [false, true]) {
            const name = ai ? 'ai' : 'pdf';
            const f = tmp(`${kind}-${amount}.${name}`, Buffer.from(await ev(`sig.pdf(${JSON.stringify(kind)}, ${amount}, ${ai})`), 'base64'));
            const out = path.join(outDir, `${kind}-${amount}-${name}`);
            cp.spawnSync('pdftoppm', ['-r', '72', '-png', '-singlefile', f, out]);
            await put(name, fileRow(out + '.png'));
          }
        }
        if (tools.convert) {
          const f = tmp(`${kind}-${amount}.psd`, Buffer.from(await ev(`sig.psd(${JSON.stringify(kind)}, ${amount})`), 'base64'));
          await put('psd', fileRow(f, '[0]'));
        }
        rows.push(res);
      }
    }

    fs.writeFileSync(path.join(outDir, 'rows.json'), JSON.stringify(rows));
    const names = ['editor', 'fallback', 'svg', 'svg(rsvg)', 'svganim', 'lottie', 'thorvg', 'pdf', 'ai', 'psd'].filter((n) => rows.some((r) => n in r.sigma));
    console.log(['effect'.padEnd(12), ...names.map((n) => n.padStart(10))].join(' '));
    for (const r of rows) {
      console.log([`${r.kind} ${r.amount}`.padEnd(12), ...names.map((n) => (Number.isNaN(r.sigma[n]) ? 'n/a' : r.sigma[n].toFixed(2)).padStart(10))].join(' '));
      for (const n of names) {
        if (n === 'editor' || Number.isNaN(r.sigma.editor)) continue;
        const d = Math.abs(r.sigma[n] - r.sigma.editor);
        if (!(d <= Math.max(TOL, 0.12 * r.sigma.editor))) {
          failed++;
          console.log(`   OFF  ${n}: sigma ${r.sigma[n]?.toFixed?.(2)} vs editor ${r.sigma.editor.toFixed(2)} (more than ${TOL}px apart)`);
        }
      }
    }
    console.log('\nShare of the shadow or glow beyond the box a Lottie layer only as big as its drawing keeps, in lottie-web (1 = all):');
    for (const r of rows) console.log(`  ${r.kind} ${r.amount}`.padEnd(14), r.tight.toFixed(2), r.tightThor === undefined ? '' : `(dotLottie player ${r.tightThor.toFixed(2)})`);
  } catch (e) {
    console.error(e?.stack ?? e);
    failed++;
  }
  server?.close();
  console.log(failed ? `\n${failed} off` : '\nall formats match the editor');
  app.exit(failed ? 1 : 0);
});

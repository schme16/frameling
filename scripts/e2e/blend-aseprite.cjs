// Compares blend modes three ways, per pixel: what the real Aseprite composites (batch mode), what Frameling's real
// renderer draws from the imported file (in Electron), and the W3C compositing maths in floats (blend-reference.cjs).
// Every blend mode at several layer opacities, over opaque and see-through backdrops and with see-through sources.
//
//   npm run build
//   ASEPRITE_BIN=/path/to/aseprite xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/blend-aseprite.cjs [outDir]
//
// Writes outDir/blend-report.md and blend-report.json (default: a fresh folder under the system temp dir) and prints the
// table. Exits non-zero only when the run itself breaks. Aseprite's settings go to a throwaway folder.
const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { composite } = require('./blend-reference.cjs');

// Software WebGL (SwiftShader) when there is no GPU, so the GPU path of Linear dodge, Subtract and Divide is the one measured.
if (process.env.BLEND_NO_SOFTWARE_GL !== '1') {
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
}

const root = path.resolve(__dirname, '../..');
const ASE = process.env.ASEPRITE_BIN;
const outDir = path.resolve(process.argv.slice(2).find((a) => !a.endsWith('blend-aseprite.cjs') && !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-blend-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);

// The modes Frameling has a blend for; the importer turns the rest into Normal.
const FRAMELING_HAS = new Set(['NORMAL', 'MULTIPLY', 'SCREEN', 'OVERLAY', 'DARKEN', 'LIGHTEN', 'COLOR_DODGE', 'COLOR_BURN', 'HARD_LIGHT', 'SOFT_LIGHT', 'DIFFERENCE', 'EXCLUSION', 'HSL_HUE', 'HSL_SATURATION', 'HSL_COLOR', 'HSL_LUMINOSITY', 'ADDITION', 'SUBTRACT', 'DIVIDE']);

/** Error between two straight RGBA pixels (0..255): the worst of the alpha and the premultiplied colour channels. */
function err(a, b) {
  let e = Math.abs(a[3] - b[3]);
  for (let i = 0; i < 3; i++) e = Math.max(e, Math.abs((a[i] * a[3]) / 255 - (b[i] * b[3]) / 255));
  return e;
}
const stat = () => ({ n: 0, sum: 0, max: 0, over3: 0, over8: 0 });
function add(s, e) {
  s.n++;
  s.sum += e;
  if (e > s.max) s.max = e;
  if (e > 3) s.over3++;
  if (e > 8) s.over8++;
}
const fin = (s) => ({ n: s.n, mean: s.n ? +(s.sum / s.n).toFixed(2) : 0, max: +s.max.toFixed(1), pct3: s.n ? +((100 * s.over3) / s.n).toFixed(1) : 0, pct8: s.n ? +((100 * s.over8) / s.n).toFixed(1) : 0 });

async function main() {
  if (!ASE || !fs.existsSync(ASE)) throw new Error('Set ASEPRITE_BIN to the aseprite program.');
  fs.mkdirSync(outDir, { recursive: true });
  const fx = path.join(outDir, 'fixtures');
  fs.mkdirSync(path.join(outDir, 'cfg'), { recursive: true });
  fs.mkdirSync(fx, { recursive: true });
  cp.execFileSync(ASE, ['-b', '--script-param', `out=${fx}`, '--script', path.join(__dirname, 'blend-aseprite.lua')], { env: { ...process.env, XDG_CONFIG_HOME: path.join(outDir, 'cfg'), XDG_DATA_HOME: path.join(outDir, 'cfg') }, timeout: 300000, stdio: 'pipe' });
  const inputs = JSON.parse(fs.readFileSync(path.join(fx, 'inputs.json'), 'utf8'));
  const { w, h, src, back, modes, opacities } = inputs;

  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, win2) => win2.on('show', () => win2.hide()));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  for (let i = 0; i < 200 && !(await ev('!!(window.__framelingEffects && window.__frameling && window.__framelingAseprite)').catch(() => false)); i++) await sleep(100);

  const rows = [];
  for (const mode of modes) {
    for (const op of opacities) {
      const name = `${mode}_${op}`;
      const ase = fs.readFileSync(path.join(fx, name + '.rgba'));
      await ev(`__frameling.store().setUi({ dirty: false })`);
      const bytes = JSON.stringify(Array.from(fs.readFileSync(path.join(fx, name + '.aseprite'))));
      await ev(`__framelingAseprite.open(${bytes}, ${JSON.stringify(name + '.aseprite')})`);
      const fr = await ev(`(() => { const d = __frameling.store().get().doc; return { px: __framelingEffects.pixels(d, 0), blend: d.layers.map((l) => l.blend || 'normal'), opacity: d.layers.map((l) => l.opacity) }; })()`);
      const o = { fa: { all: stat(), opaque: stat(), see: stat() }, fw: { all: stat(), opaque: stat(), see: stat() }, aw: { all: stat(), opaque: stat(), see: stat() } };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const s = src[x];
          const b = back[y];
          if (s[3] === 0 && b[3] === 0) continue;
          const A = [ase[i], ase[i + 1], ase[i + 2], ase[i + 3]];
          const F = [fr.px[i], fr.px[i + 1], fr.px[i + 2], fr.px[i + 3]];
          // Aseprite takes the layer's opacity as 0..255 whole numbers.
          const r = composite(mode, [b[0] / 255, b[1] / 255, b[2] / 255], b[3] / 255, [s[0] / 255, s[1] / 255, s[2] / 255], (s[3] / 255) * (op / 255));
          const W = [r[0] * 255, r[1] * 255, r[2] * 255, r[3] * 255];
          const kind = b[3] === 255 ? 'opaque' : 'see';
          for (const [k, p, q] of [['fa', F, A], ['fw', F, W], ['aw', A, W]]) {
            const e = err(p, q);
            add(o[k].all, e);
            add(o[k][kind], e);
          }
        }
      }
      rows.push({ mode, op, frameling: fr.blend[1], layerOpacity: fr.opacity[1], ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([kk, s]) => [kk, fin(s)]))])) });
    }
  }
  fs.writeFileSync(path.join(outDir, 'blend-report.json'), JSON.stringify(rows, null, 1));

  // One line per mode: the worst over the opacities, for each pair and for the two kinds of backdrop.
  const worst = (m, k, kind, f) => Math.max(...rows.filter((r) => r.mode === m).map((r) => r[k][kind][f]));
  const mean = (m, k, kind) => +(rows.filter((r) => r.mode === m).reduce((a, r) => a + r[k][kind].mean, 0) / opacities.length).toFixed(2);
  const lines = ['| Mode | In Frameling | Frameling vs Aseprite, solid backdrop (mean / max) | Frameling vs Aseprite, see-through backdrop (mean / max, % over 8) | Frameling vs W3C (mean / max, all) | Aseprite vs W3C, see-through backdrop (mean / max) |', '|---|---|---|---|---|---|'];
  for (const m of modes) {
    const has = FRAMELING_HAS.has(m);
    lines.push(`| ${m} | ${has ? rows.find((r) => r.mode === m).frameling : 'none (Normal)'} | ${mean(m, 'fa', 'opaque')} / ${worst(m, 'fa', 'opaque', 'max')} | ${mean(m, 'fa', 'see')} / ${worst(m, 'fa', 'see', 'max')}, ${worst(m, 'fa', 'see', 'pct8')}% | ${mean(m, 'fw', 'all')} / ${worst(m, 'fw', 'all', 'max')} | ${mean(m, 'aw', 'see')} / ${worst(m, 'aw', 'see', 'max')} |`);
  }
  fs.writeFileSync(path.join(outDir, 'blend-report.md'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nreport in ${outDir}`);
  app.exit(0);
}
main().catch((e) => {
  console.error(e);
  app.exit(1);
});

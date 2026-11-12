// Opens Frameling's .ai exports in a real Adobe Illustrator (under Wine) and compares what it finds with what Frameling
// wrote and with Frameling's own PNG of the same frame. Opt in: it only runs the Illustrator half when ILLUSTRATOR_PREFIX
// is set; without it, it writes the .ai files and PNGs and says so.
//
//   npm run build
//   ILLUSTRATOR_PREFIX=/path/to/wine/prefix xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/illustrator.cjs [outDir] [--only=a,b]
//
//   ILLUSTRATOR_PREFIX   the Wine prefix Illustrator is installed in (the folder with drive_c)
//   WINE_RUNNER          the Wine build to run it with (a folder with bin/wine). Found from the Lutris game file for the
//                        prefix when not set.
//   --only=a,b           only these cases (layers-folders nested-folders hidden-layers paths gradients masks text symbols frames scale2-transparent
//                        text-big artboards stress kitchen-sink bouncing-ball bouncing-logo)
//   --keep-going         do not refuse when Illustrator or Wine seems to be running for the prefix (never use this
//                        when someone may be working in Illustrator)
//
// Outputs in outDir: <case>/*.ai, <case>/*.png (Frameling), illustrator/*.png (Illustrator), side-by-side/*.png,
// report.json. Runs Illustrator in an xvfb screen inside a Wine virtual desktop, never on the real desktop. Exits non-zero on failure.
const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fixtures } = require('./illustrator-fixtures.cjs');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('illustrator.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-ai-')));
const ONLY = argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');
const PREFIX = process.env.ILLUSTRATOR_PREFIX;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const results = [];
let current = null;
const begin = (name) => (current = results[results.push({ name, failures: [], notes: [] }) - 1]);
const check = (cond, msg) => {
  if (!cond) current.failures.push(msg);
  return !!cond;
};
const note = (m) => current.notes.push(m);
const sh = (cmd, args, opts = {}) => cp.spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
const files = (d) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);

// ---------------------------------------------------------------- the app

let win;
const pageErrors = [];
const ev = (js) => win.webContents.executeJavaScript(js, true);
const setDir = (d) => {
  fs.mkdirSync(d, { recursive: true });
  process.env.FRAMELING_AUTOMATION_DIR = d;
  return d;
};

async function startApp() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  setDir(path.join(outDir, 'misc'));
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => {
    w.webContents.setBackgroundThrottling(false);
    w.webContents.on('console-message', (e) => {
      const lvl = e.level ?? e.severity;
      if (lvl === 'error' || lvl === 3) pageErrors.push(String(e.message ?? e));
    });
    w.on('show', () => w.hide());
  });
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('The app never opened a window');
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__framelingExport && window.__framelingArtboards && window.__frameling)')) return;
    } catch {
      // still loading
    }
    await sleep(100);
  }
  throw new Error('The page never became ready');
}

const settings = async (patch) => ({ ...(await ev('window.__framelingExport.defaults()')), ...patch });
const run = (s) => ev(`window.__framelingExport.run(${JSON.stringify(s)})`);

// Two artboards of different sizes, each written to its own file.
const ARTBOARDS = `(async () => {
  const E = window.__framelingExport, A = window.__framelingArtboards, S = window.__frameling.store();
  await E.load('blank-vector');
  const rect = (id, x, y, w, h, fill) => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity: 1 });
  const layer = (id, name, drawingId, len) => ({ id, name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: id + 'c', start: 0, length: len, drawingId }] });
  S.update('setup', (d) => {
    d.name = 'Film'; d.width = 320; d.height = 180; d.background = '#ff0000'; d.length = 1; d.fps = 12; d.clips = []; d.markers = [];
    d.drawings = { dA: { id: 'dA', kind: 'vector', shapes: [rect('sa', 100, 60, 120, 60, '#ffffff')] } };
    d.layers = [layer('LA', 'Layer A', 'dA', 1)];
    const id = A.model.addArtboard(d, { name: 'Square', width: 200, height: 200, length: 1, background: '#00aa00' });
    d.drawings.dB = { id: 'dB', kind: 'vector', shapes: [rect('sb1', 50, 50, 100, 100, '#ffff00'), rect('sb2', 190, 0, 70, 200, '#0000ff')] };
    d.artboards.find((a) => a.id === id).content.layers = [layer('LB', 'Layer B', 'dB', 1)];
    A.model.renameArtboard(d, d.artboards[0].id, 'Wide');
  });
  return true;
})()`;

// What each case holds: the page code that makes the document, the export settings, and what Illustrator should find.
const cases = [
  ...fixtures,
  { id: 'artboards', title: 'Two artboards, one file each', code: ARTBOARDS, artboards: true, expect: { layers: [], minPaths: 1, maxRmse: 0.05 } },
  // Several frames, the four ways an animation goes into .ai (see AiFrames in src/export/types.ts).
  ...['files', 'artboards'].map((how) => ({ ...fixtures.find((f) => f.id === 'frames'), id: `frames-${how}`, title: `Several frames, .ai as ${how}`, ai: how, expect: { size: [240, 120], layers: ['Mover'], minPaths: 1, maxRmse: 0.05 } })),
  { ...fixtures.find((f) => f.id === 'frames'), id: 'frames-one', title: 'Several frames, .ai as this frame', ai: 'one', frame: 1, frames: 3, expect: { size: [240, 120], layers: ['Mover'], minPaths: 1, maxRmse: 0.05 } },
  { ...fixtures.find((f) => f.id === 'gradients'), id: 'gradients-pdf', title: 'Gradients, .ai as a PDF page', ai: 'pages', frames: 1, expect: { size: [320, 180], layers: ['Dark patch', 'Gradients'], minPaths: 5, maxRmse: 0.06 } },
  { id: 'stress', title: 'Stress fixture', template: 'stress', expect: { layers: ['Art'], minPaths: 3, maxRmse: 0.1 } },
  { id: 'bouncing-ball', title: 'Bouncing ball template', template: 'bouncing-ball', expect: { layers: [], minPaths: 1, maxRmse: 0.1 } },
  { id: 'bouncing-logo', title: 'Bouncing logo template', template: 'bouncing-logo', expect: { layers: [], minPaths: 1, maxRmse: 0.1 } },
  { id: 'kitchen-sink', title: 'Kitchen sink fixture', template: 'kitchen-sink', expect: { layers: [], minPaths: 1, maxRmse: 0.2 } },
].filter((c) => !ONLY || ONLY.includes(c.id));

/** Makes the document for a case. */
async function loadCase(c) {
  if (c.code) return ev(c.code);
  const E = 'window.__framelingExport';
  if (c.template === 'stress') return ev(`${E}.loadStress()`);
  if (c.template === 'kitchen-sink') return ev(`${E}.loadKitchenSink()`);
  return ev(`${E}.load(${JSON.stringify(c.template)})`);
}

/** Writes the .ai file(s) and Frameling's own PNG of each frame. Returns the list of what to open in Illustrator. */
async function exportCase(c) {
  const r = begin(`export ${c.id}`);
  const dir = path.join(outDir, c.id);
  const todo = [];
  try {
    await loadCase(c);
    await ev(`window.__framelingArtboards.setExport({ mode: ${c.artboards ? "'each'" : "'one'"}, ids: null })`);
    if (c.artboards) await ev(`window.__framelingArtboards.setChoice('artboards.exportAs', 'folder')`);
    const frames = c.frames ?? 1;
    // How the frames go into .ai: 'one' (the current frame), 'files' (a zip), 'pages' (PDF pages), 'artboards'.
    const how = c.ai ?? (frames > 1 ? 'pages' : 'one');
    const base = { scale: c.scale ?? 1, transparent: !!c.transparent };
    const doc = await ev('window.__framelingExport.doc()');
    note(`${doc.width} x ${doc.height}, ${doc.layers.length} layers, .ai as ${how}`);
    const shown = c.frame ?? 0;
    await ev(`window.__framelingExport.setFrame(${shown})`);
    const aiDir = setDir(path.join(dir, 'ai'));
    let res = await run(await settings({ ...base, format: 'ai', aiFrames: how, range: how === 'one' ? 'frame' : frames > 1 ? 'all' : 'frame' }));
    if (!check(res.outcome === 'done', `.ai export did not finish: ${JSON.stringify(res)}`)) return [];
    let ais = files(aiDir).filter((f) => f.endsWith('.ai'));
    if (how === 'files') {
      const zips = files(aiDir).filter((f) => f.endsWith('.zip'));
      if (check(zips.length === 1, `expected one zip, found: ${files(aiDir)}`)) {
        const out = path.join(aiDir, 'unzipped');
        fs.mkdirSync(out, { recursive: true });
        sh('unzip', ['-o', path.join(aiDir, zips[0]), '-d', out]);
        ais = files(out).filter((f) => f.endsWith('.ai')).map((f) => path.join('unzipped', f));
        check(ais.length === frames, `the zip holds ${ais.length} .ai files, expected ${frames}`);
      }
    } else check(ais.length >= 1, `no .ai written: ${files(aiDir)}`);
    // Frameling's PNG of each frame, as the reference.
    const wantFrames = how === 'one' ? [shown] : Array.from({ length: frames }, (_, i) => i);
    for (const f of wantFrames) {
      await ev(`window.__framelingExport.setFrame(${f})`);
      const pngDir = setDir(path.join(dir, `png-${f}`));
      res = await run(await settings({ ...base, format: 'png', range: 'frame' }));
      check(res.outcome === 'done', `png export did not finish: ${JSON.stringify(res)}`);
      const pngs = files(pngDir).filter((x) => x.endsWith('.png'));
      const pngFor = (ai) => (pngs.length === 1 ? pngs[0] : pngs.find((p) => p.startsWith(path.basename(ai).replace(/\.ai$/, ''))));
      if (!pngs.length) {
        check(false, `no Frameling PNG for frame ${f}`);
        continue;
      }
      const png = pngFor(ais[0]);
      const mine = { frameling: path.join(pngDir, png ?? pngs[0]), transparent: !!c.transparent, expect: c.expect, caseId: c.id, label: c.title };
      if (how === 'files') {
        const ai = ais[f];
        todo.push({ ...mine, id: `${c.id}`, file: path.join(aiDir, ai), page: 1, frameIndex: f });
      } else if (how === 'artboards') todo.push({ ...mine, id: c.id, file: path.join(aiDir, ais[0]), page: 1, artboard: f, frameIndex: f, artboards: frames });
      else if (how === 'pages') for (const ai of ais) todo.push({ ...mine, id: ais.length > 1 ? `${c.id}/${ai.replace(/\.ai$/, '')}` : c.id, file: path.join(aiDir, ai), page: f + 1, frameIndex: f, pdfOnly: true });
      else for (const ai of ais) todo.push({ ...mine, frameling: path.join(pngDir, pngFor(ai) ?? pngs[0]), id: ais.length > 1 ? `${c.id}/${ai.replace(/\.ai$/, '')}` : c.id, file: path.join(aiDir, ai), page: 1, frameIndex: f });
    }
    note(`${ais.join(', ')}, ${ais.map((a) => fs.statSync(path.join(aiDir, a)).size).join('+')} bytes`);
    // The PDF inside: what is in the file before Illustrator reads it.
    for (const ai of ais) {
      const head = fs.readFileSync(path.join(aiDir, ai)).subarray(0, 8).toString('latin1');
      check(head.startsWith('%PDF-'), `${ai} does not start with %PDF-`);
      const text = fs.readFileSync(path.join(aiDir, ai)).toString('latin1');
      if (how === 'pages') check(!text.includes('/AIPrivateData1'), `${ai} has Illustrator data, but pages should stay a plain PDF`);
      else check(text.includes('/AIPrivateData1') && text.includes('/RoundtripVersion'), `${ai} has no Illustrator data`);
      // The PDF part read by a program that is not Illustrator (poppler's pdftoppm): hidden layers are off there, so its page matches Frameling's picture.
      if (c.expect.pdfReader && how !== 'pages') {
        const base = path.join(dir, `reader-${path.basename(ai, '.ai')}`);
        const r = sh('pdftoppm', ['-r', '72', '-png', '-singlefile', path.join(aiDir, ai), base]);
        if (check(r.status === 0 && fs.existsSync(`${base}.png`), `pdftoppm could not read ${ai}: ${r.stderr || r.error}`)) {
          const d = rmse(path.join(dir, `png-${wantFrames[0]}`, files(path.join(dir, `png-${wantFrames[0]}`)).find((x) => x.endsWith('.png'))), `${base}.png`);
          if (check(d.rmse !== null, `the PDF reader's picture differs in size: ${d.size}`)) {
            note(`pdftoppm RMSE vs Frameling ${d.rmse.toFixed(4)}`);
            check(d.rmse <= c.expect.pdfReader, `the PDF part drawn by pdftoppm is ${d.rmse.toFixed(3)} away from Frameling's (limit ${c.expect.pdfReader}): hidden art may show`);
          }
        }
      }
    }
  } catch (e) {
    check(false, String(e?.stack ?? e));
  }
  if (c.artboards) await ev(`window.__framelingArtboards.setChoice('artboards.exportAs', undefined)`).catch(() => undefined);
  return todo;
}

// ---------------------------------------------------------------- Illustrator

/** Is anything of this Wine prefix running? Looks at every process's environment. */
function prefixBusy(prefix) {
  const busy = [];
  for (const pid of fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n))) {
    try {
      const env = fs.readFileSync(`/proc/${pid}/environ`, 'latin1').split('\0');
      if (!env.includes(`WINEPREFIX=${prefix}`)) continue;
      busy.push(`${pid} ${fs.readFileSync(`/proc/${pid}/cmdline`, 'latin1').split('\0').join(' ').slice(0, 100)}`);
    } catch {
      // gone, or not ours
    }
  }
  return busy;
}

/** The Wine build Lutris runs this prefix with (its game file says which). */
function findRunner(prefix) {
  if (process.env.WINE_RUNNER) return process.env.WINE_RUNNER;
  const lutrisDirs = [path.join(os.homedir(), '.var/app/net.lutris.Lutris/data/lutris'), path.join(os.homedir(), '.local/share/lutris')];
  for (const dir of lutrisDirs) {
    const games = path.join(dir, 'games');
    for (const f of files(games).filter((x) => x.endsWith('.yml'))) {
      const text = fs.readFileSync(path.join(games, f), 'utf8');
      if (!text.includes(prefix)) continue;
      const m = /^wine:\n(?:[ ]+.*\n)*?[ ]+version:\s*(\S+)/m.exec(text);
      if (m && fs.existsSync(path.join(dir, 'runners/wine', m[1], 'bin/wine'))) return path.join(dir, 'runners/wine', m[1]);
    }
  }
  return null;
}

function runIllustrator(todo) {
  const work = path.join(outDir, 'illustrator');
  fs.mkdirSync(work, { recursive: true });
  const win = (p) => 'Z:' + p; // ExtendScript takes Z:/tmp/x for a Linux path under Wine
  const entries = todo.map((t, i) => ({ id: t.id, file: win(t.file), page: t.page, artboard: t.artboard ?? null, png: win(path.join(work, `${i}-${t.id.replace(/\W+/g, '_')}-p${t.page}.png`)), transparent: t.transparent }));
  const manifest = path.join(work, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({ files: entries }));
  const jsx = path.join(work, 'run.jsx');
  fs.writeFileSync(jsx, `var MANIFEST = ${JSON.stringify(win(manifest))};\n` + fs.readFileSync(path.join(__dirname, 'illustrator-check.jsx'), 'utf8'));
  const doneFile = manifest + '.done';
  const r = sh(path.join(__dirname, 'illustrator-run.sh'), [jsx, doneFile, '900', path.join(work, 'shots')], {
    env: { ...process.env, ILLUSTRATOR_PREFIX: PREFIX, WINE_RUNNER: findRunner(PREFIX) },
    timeout: 1000000,
  });
  fs.writeFileSync(path.join(work, 'runner.log'), `${r.stdout}\n${r.stderr}`);
  const resultFile = manifest + '.result.json';
  if (!fs.existsSync(resultFile)) return { error: `Illustrator did not finish the script (see ${path.join(work, 'shots')})`, entries };
  return { ...JSON.parse(fs.readFileSync(resultFile, 'utf8')), entries };
}

// ---------------------------------------------------------------- comparing

/** Normalised RMSE (0 to 1) between two pictures, both flattened on magenta so see-through counts. */
function rmse(a, b) {
  const flat = (f, o) => sh('convert', [f, '-background', '#ff00ff', '-alpha', 'remove', '-alpha', 'off', o]);
  const fa = path.join(os.tmpdir(), `fl-ai-${process.pid}-a.png`);
  const fb = path.join(os.tmpdir(), `fl-ai-${process.pid}-b.png`);
  flat(a, fa);
  flat(b, fb);
  const sa = sh('identify', ['-format', '%w %h', fa]).stdout.trim();
  const sb = sh('identify', ['-format', '%w %h', fb]).stdout.trim();
  if (sa !== sb) return { size: [sa, sb], rmse: null };
  const r = sh('compare', ['-metric', 'RMSE', fa, fb, 'null:']);
  const m = /\(([\d.e+-]+)\)/.exec(r.stderr);
  return { size: [sa, sb], rmse: m ? Number(m[1]) : null };
}

function walkLayers(list, fn) {
  for (const l of list) {
    fn(l);
    walkLayers(l.sub ?? [], fn);
  }
}

/** The layer called `name` anywhere in the tree (or null). */
function findLayer(list, name) {
  for (const l of list) {
    if (l.name === name) return l;
    const x = findLayer(l.sub ?? [], name);
    if (x) return x;
  }
  return null;
}

/** The layers Illustrator found, indented, top first (the way its Layers panel lists them), as a picture. */
function layerTreePicture(t, found) {
  const lines = [{ text: `${t.label}: the layers Illustrator found`, depth: 0 }, { text: ' ', depth: 0 }];
  const walk = (list, depth) => {
    for (const l of list) {
      lines.push({ text: `${depth ? '> ' : ''}${l.name}${l.opacity < 99.5 ? `   ${Math.round(l.opacity)}%` : ''}${l.visible ? '' : '   (hidden)'}`, depth });
      walk(l.sub ?? [], depth + 1);
    }
  };
  walk(found.layers, 0);
  const dir = path.join(outDir, 'side-by-side');
  fs.mkdirSync(dir, { recursive: true });
  const w = Math.max(280, ...lines.map((l) => l.text.length * 9 + 30 + l.depth * 28));
  const args = ['-size', `${w}x${lines.length * 21 + 16}`, 'xc:#2b2b2b', '-fill', 'white', '-pointsize', '15'];
  lines.forEach((l, i) => args.push('-annotate', `+${12 + l.depth * 28}+${22 + i * 21}`, l.text));
  sh('convert', [...args, path.join(dir, `${t.id.replace(/\W+/g, '-')}-layers.png`)]);
}

function judge(t, got, entry) {
  const label = t.id + (t.pdfOnly ? ` page ${t.page}` : t.artboard !== undefined ? ` artboard ${t.artboard + 1}` : t.frameIndex ? ` frame ${t.frameIndex + 1}` : '');
  begin(`illustrator ${label}`);
  if (!check(got && got.ok, `Illustrator could not open it: ${got?.error ?? 'no result'}`)) return;
  const f = got.found;
  const ex = t.expect;
  note(`artboards ${f.artboards.map((a) => `${a.w}x${a.h}`).join(',')}, layers ${f.layers.map((l) => l.name).join(' | ')}, paths ${f.counts.paths}, compound ${f.counts.compound}, groups ${f.counts.groups}, text ${f.counts.texts}, rasters ${f.counts.rasters}, fills ${JSON.stringify(f.fills)}`);
  if (!t.pdfOnly && (t.caseId === 'layers-folders' || t.caseId === 'nested-folders' || t.caseId === 'frames-artboards')) layerTreePicture(t, f);
  const boards = t.artboards ?? 1;
  check(f.artboards.length === boards, `expected ${boards} artboard${boards === 1 ? '' : 's'}, found ${f.artboards.length}`);
  const sizeWanted = ex.size ?? null;
  if (sizeWanted) for (const [i, ab] of f.artboards.entries()) check(Math.abs(ab.w - sizeWanted[0]) < 0.5 && Math.abs(ab.h - sizeWanted[1]) < 0.5, `artboard ${i + 1} is ${ab.w} x ${ab.h}, expected ${sizeWanted.join(' x ')}`);
  const names = [];
  walkLayers(f.layers, (l) => names.push({ name: l.name, visible: l.visible }));
  // A plain PDF page (the "Pages" way) has no Illustrator data, so Illustrator drops the layer names and asks which
  // page; the names are only expected from the files that carry Illustrator's own data.
  const missing = (ex.layers ?? []).filter((n) => !names.some((x) => x.name === n));
  if (t.pdfOnly) {
    if (missing.length) note(`as expected for a PDF page: layer names not kept (${missing.length} of ${ex.layers.length})`);
  } else {
    check(!missing.length, `layers missing: ${missing.join(', ')} (found: ${names.map((x) => x.name).join(' | ')})`);
    for (const [parent, kids] of ex.tree ?? []) {
      const p = findLayer(f.layers, parent);
      if (!check(!!p, `layer "${parent}" is missing`)) continue;
      check(JSON.stringify((p.sub ?? []).map((k) => k.name)) === JSON.stringify(kids), `"${parent}" holds ${JSON.stringify((p.sub ?? []).map((k) => k.name))}, expected ${JSON.stringify(kids)}`);
    }
    for (const [name, pct] of Object.entries(ex.opacity ?? {})) {
      const l = findLayer(f.layers, name);
      check(!!l && Math.abs(l.opacity - pct) < 0.5, `layer "${name}" has opacity ${l?.opacity}, expected ${pct}`);
    }
  }
  // Hidden layers come across as hidden layers that still hold their art; layers inside a hidden folder keep their own state.
  const artOf = (l) => l.paths + l.groups + l.texts + l.rasters + l.compound + (l.sub ?? []).reduce((n, k) => n + artOf(k), 0);
  if (!t.pdfOnly) {
    for (const n of ex.hiddenWithArt ?? []) {
      const l = findLayer(f.layers, n);
      if (check(!!l, `hidden layer "${n}" is missing (found: ${names.map((x) => x.name).join(' | ')})`)) {
        check(l.visible === false, `layer "${n}" should be hidden but is visible`);
        check(artOf(l) > 0, `hidden layer "${n}" holds no art`);
      }
    }
    for (const n of ex.shown ?? []) {
      const l = findLayer(f.layers, n);
      if (check(!!l, `layer "${n}" is missing`)) check(l.visible === true, `layer "${n}" should be on but is hidden`);
    }
  }
  for (const n of ex.hidden ?? []) check(!names.some((x) => x.name === n) || names.some((x) => x.name === n && !x.visible), `layer "${n}" should be hidden`);
  if (t.pdfOnly) check(f.counts.groups >= (ex.minGroups ?? 0), `only ${f.counts.groups} groups, expected at least ${ex.minGroups} (one per layer or folder)`);
  check(f.counts.paths + f.counts.compound >= (ex.minPaths ?? 0), `only ${f.counts.paths} paths and ${f.counts.compound} compound paths, expected at least ${ex.minPaths}`);
  // The picture
  const png = entry.png.replace(/^Z:/, '');
  if (check(fs.existsSync(png), 'Illustrator wrote no PNG')) {
    const d = rmse(t.frameling, png);
    t.illustratorPng = png;
    if (d.rmse === null) check(false, `the pictures differ in size: Frameling ${d.size[0]}, Illustrator ${d.size[1]}`);
    else {
      note(`RMSE vs Frameling ${d.rmse.toFixed(4)}`);
      t.rmse = d.rmse;
      check(d.rmse <= (ex.maxRmse ?? 0.08), `the picture is ${d.rmse.toFixed(3)} away from Frameling's (limit ${ex.maxRmse ?? 0.08})`);
    }
  }
}

function sideBySide(todo) {
  const dir = path.join(outDir, 'side-by-side');
  fs.mkdirSync(dir, { recursive: true });
  for (const t of todo) {
    if (!t.illustratorPng || !fs.existsSync(t.illustratorPng)) continue;
    const name = `${t.id.replace(/\W+/g, '-')}${t.pdfOnly ? `-p${t.page}` : t.artboard !== undefined ? `-a${t.artboard + 1}` : t.frameIndex ? `-f${t.frameIndex + 1}` : ''}.png`;
    const flat = (f, o) => sh('convert', [f, '-background', '#ff00ff', '-alpha', 'remove', '-alpha', 'off', o]);
    const a = path.join(dir, '.a.png');
    const b = path.join(dir, '.b.png');
    flat(t.frameling, a);
    flat(t.illustratorPng, b);
    const framed = (f) => ['(', f, '-bordercolor', '#444444', '-border', '2', ')'];
    sh('convert', ['-background', '#2b2b2b', ...framed(a), ...framed(b), '+append', '+repage', '-gravity', 'north', '-splice', '0x28', '-fill', 'white', '-pointsize', '16', '-annotate', '+8+6', `${t.label}     left: Frameling     right: Illustrator`, path.join(dir, name)]);
    fs.rmSync(a, { force: true });
    fs.rmSync(b, { force: true });
  }
}

function report() {
  const bad = results.filter((r) => r.failures.length);
  for (const r of results) {
    console.log(`${r.failures.length ? 'FAIL' : 'ok  '} ${r.name}${r.notes.length ? `  (${r.notes.join(' | ')})` : ''}`);
    for (const f of r.failures) console.log(`       - ${f}`);
  }
  if (pageErrors.length) console.log(`\nconsole errors in the page (${pageErrors.length}):\n  ${[...new Set(pageErrors)].slice(0, 8).join('\n  ')}`);
  console.log(`\n${results.length - bad.length} of ${results.length} checks passed. Output: ${outDir}`);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
  return bad.length === 0;
}

(async () => {
  const guard = setTimeout(() => process.exit(2), 40 * 60 * 1000);
  try {
    await startApp();
    const todo = [];
    for (const c of cases) todo.push(...(await exportCase(c)));
    if (!PREFIX) {
      begin('illustrator');
      note('ILLUSTRATOR_PREFIX is not set, so only the .ai files and PNGs were written');
    } else {
      begin('illustrator start');
      const runner = findRunner(PREFIX);
      check(!!runner, 'could not find the Wine build for this prefix; set WINE_RUNNER');
      const busy = prefixBusy(PREFIX);
      if (busy.length && !argv.includes('--keep-going')) {
        check(false, `something is already running in this Wine prefix, not sharing it:\n         ${busy.join('\n         ')}`);
      } else if (runner) {
        const out = runIllustrator(todo);
        if (out.error) check(false, out.error);
        else {
          note(`Illustrator ${out.version}`);
          out.results.forEach((got, i) => judge(todo[i], got, out.entries[i]));
          sideBySide(todo);
        }
      }
    }
  } catch (e) {
    begin('harness').failures.push(String(e?.stack ?? e));
  }
  clearTimeout(guard);
  process.exit(report() ? 0 : 1);
})();

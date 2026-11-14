// A contact sheet of every panel, in one document state, in both themes: the browsable gallery a component library
// would give, built on the harness the help pictures use (scripts/docs/steps.cjs), with nothing new to install.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/panels-sheet.cjs <outDir> [options]
//
//   --themes dark,light   which themes (default both); a sheet per theme, plus panels-both.png with them side by side
//   --doc <template id>   show every panel in this template (default: Bouncing ball, and the template a panel needs
//                         when that would leave it empty, from scripts/lib/sheet-layout.cjs)
//   --select              select everything first (most panels show their controls only then); on by default,
//                         --no-select leaves nothing selected
//   --right tabs          the right side layout to show them in: tabs (default, a body per panel), rail or inspector
//   --full                keep each panel as tall as its dock zone (by default the empty space under a short panel is cut)
//   --only a,b            just these panels      --skip a,b   all but these
//   --width 1800          sheet width in pixels (default 1800)
//   --renderer <dir>      a private `vite build --outDir`, like record.cjs
//
// The list of panels comes from the app's own registry (`__frameling.panelList()`), so a new panel appears without
// anyone remembering to add it. A panel that cannot be shown (not on screen, its own error screen, drew nothing, a
// call that threw) is not left out: it gets a red box on the sheet saying why, and the run exits 1 after listing them.
// Needs `npm run build` first. Writes <outDir>/panels-<theme>.png, panels-both.png and panels.json (one entry per panel
// per theme, with its problem or null).
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('./lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { issues, mockMain, makeWindow, runSteps, sleep } = require('./docs/steps.cjs');
const { SEEDS, docFor, panelList, packRows, judgePixels, trimmedHeight, problemOf } = require('./lib/sheet-layout.cjs');

const argv = process.argv.slice(2).filter((a) => !a.endsWith('panels-sheet.cjs'));
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) argv.splice(i, 1);
  return i >= 0;
};
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const rendererDir = opt('renderer', path.join(__dirname, '../dist/renderer'));
const themes = opt('themes', 'dark,light').split(',');
const forcedDoc = opt('doc', undefined);
const only = opt('only', '')?.split(',').filter(Boolean);
const skip = opt('skip', '')?.split(',').filter(Boolean);
const sheetWidth = Number(opt('width', 1800));
// The default right side folds most panels into one Properties pane, where there is no panel of their own to crop.
// Tabs gives every panel its own tab body, which is what the sheet shows.
const rightSide = opt('right', 'tabs');
const noSelect = flag('no-select');
const full = flag('full');
flag('select');
const [outDir] = argv;
if (!outDir) {
  console.error('usage: electron scripts/panels-sheet.cjs <outDir> [--themes dark,light] [--doc id] [--only a,b] [--skip a,b] [--width n]');
  process.exit(2);
}
const width = Number(process.env.SHOT_W || 1600);
const height = Number(process.env.SHOT_H || 1000);
const js = (win, code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);

process.on('unhandledRejection', (e) => {
  console.error(`panels-sheet failed: ${e?.stack ?? e}`);
  app.exit(2);
});

/** Loads the app in a theme, with no welcome screen or first-run hello in the way. */
async function load(win, theme) {
  await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1' } });
  const prefs = { theme, look: 'cosy', darkTheme: 'midnight-sketchbook', showWelcome: false, onboarded: true, rightSide: rightSide };
  await js(win, `localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); return true;`);
  await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1' } });
  await sleep(Number(process.env.SHOT_WAIT || 3000));
}

/** Puts a panel on screen in its document and waits for it (lazy panels load on first show). Gives what was seen. */
async function show(win, id, doc) {
  const seed = SEEDS[id];
  return js(
    win,
    `
    const f = __frameling;
    f.overlays.state.set((o) => ({ ...o, palette: false, prefs: null, help: null, sheet: null, about: false, onboarding: false }));
    if (!f.template(${JSON.stringify(doc)})) return { error: 'no template called ${doc}' };
    f.store().setUi({ tool: 'select' });
    document.activeElement?.blur?.();
    // A first-time question some templates ask (opening pixel art) takes the suggested answer, so it is not in the picture.
    await new Promise((r) => setTimeout(r, 150));
    if (document.querySelector('.ui-choice')) { document.querySelector('.ui-choice')?.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await new Promise((r) => setTimeout(r, 200)); }
    ${seed ? `if (f.seed.${seed}() === false) return { error: 'the seeding hook for ${seed} found nothing to seed' };` : ''}
    f.showPanel(${JSON.stringify(id)});
    ${noSelect || seed ? '' : `f.run('select.all');`}
    const sel = '#ui-panel-' + ${JSON.stringify(id)};
    let el = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      el = document.querySelector(sel);
      if (el && !el.querySelector('[aria-busy="true"], .ui-help-loading, .au-loading') && el.getBoundingClientRect().height > 8) break;
    }
    await new Promise((r) => setTimeout(r, 250));
    el = document.querySelector(sel);
    return { found: !!el, broken: el?.querySelector('.ui-panel-broken') ? 'the panel crashed' : null };
  `,
  );
}

/** One panel's crop, as a file in `tmp`, and what was seen. A throw becomes the panel's problem, never a missing box. */
async function capture(win, id, doc, tmp, theme, logs) {
  const mark = logs.length;
  const facts = { id, theme, doc };
  try {
    Object.assign(facts, await show(win, id, doc));
    if (facts.found && !facts.broken) {
      const name = `${theme}-${id}`;
      await runSteps(win, [{ shot: name, el: `#ui-panel-${id}`, pad: 0 }], { outDir: tmp, width, height });
      const png = path.join(tmp, `${name}.png`);
      const img = require('electron').nativeImage.createFromPath(png);
      const size = img.getSize();
      const bitmap = img.toBitmap();
      facts.pixels = judgePixels(bitmap);
      // Cut the empty space under a short panel, unless asked for the whole zone (--full).
      const keep = full ? size.height : trimmedHeight(bitmap, size.width, size.height);
      if (keep < size.height) fs.writeFileSync(png, img.crop({ x: 0, y: 0, width: size.width, height: keep }).toPNG());
      facts.file = png;
      facts.w = size.width;
      facts.h = keep;
    }
  } catch (err) {
    facts.error = `could not render: ${err.message}`;
  }
  // Errors the page logged while this panel was up (a missing bridge call, a thrown render) are named on the sheet too.
  const logged = logs.slice(mark).filter((l) => !/Autofill|favicon/.test(l));
  facts.logged = logged;
  facts.problem = problemOf(facts) ?? (logged.length ? `console error: ${logged[0].slice(0, 140)}` : null);
  return facts;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The sheet's web page: a box per panel (its crops, then its name), a red one for each that did not render. */
function sheetHtml(rows, colours, pageWidth, title) {
  const CAP = 38;
  const boxes = rows.map((r) => {
    const imgs = r.shots.filter((s) => s.file);
    const picW = imgs.length ? imgs.reduce((n, s) => n + s.w, 0) + (imgs.length - 1) * 10 : 0;
    const picH = imgs.length ? Math.max(...imgs.map((s) => s.h)) : 0;
    const bad = r.shots.filter((s) => s.problem);
    const noteH = bad.length ? 18 * (bad.length + 1) : 0;
    const w = Math.max(picW, 220);
    return { w, h: Math.max(picH, 0) + noteH + CAP + (imgs.length ? 0 : 96), picH, bad, imgs, r };
  });
  const { placed, width, height } = packRows(boxes, { width: pageWidth });
  const cells = boxes
    .map((b, i) => {
      const { x, y } = placed[i];
      const images = b.imgs.map((s) => `<img src="file://${s.file}" width="${s.w}" height="${s.h}" alt="">`).join('');
      const missing = b.imgs.length ? '' : `<div class="gone"><b>No picture</b></div>`;
      const notes = b.bad.map((s) => `<div class="note">${esc(s.theme)}: ${esc(s.problem)}</div>`).join('');
      return `<figure style="left:${x}px;top:${y}px;width:${b.w}px"><div class="pics">${images}${missing}</div>${notes}<figcaption><b>${esc(b.r.title)}</b><span>${esc(b.r.id)} &middot; ${esc(b.r.zone)}</span></figcaption></figure>`;
    })
    .join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:${colours.bg};color:${colours.fg};font:13px system-ui,sans-serif}
    body{width:${width}px;height:${height + 50}px;position:relative;overflow:hidden}
    h1{position:absolute;left:20px;top:8px;margin:0;font-size:12px;font-weight:600;opacity:.6}
    figure{position:absolute;margin:0;transform:translateY(30px)}
    .pics{display:flex;gap:10px;align-items:flex-start}
    img{display:block;outline:1px solid ${colours.line}}
    .gone{width:220px;height:80px;border:2px dashed #d33;color:#d33;display:flex;align-items:center;justify-content:center}
    .note{margin-top:4px;color:#d33;font-size:12px;line-height:14px;max-width:100%}
    figcaption{margin-top:6px;display:flex;flex-direction:column;gap:1px}
    figcaption b{font-size:14px}figcaption span{opacity:.6;font-size:11px}
  </style><h1>${esc(title)}</h1>${cells}`;
  return { html, width, height: height + 50 };
}

/** Draws a sheet: its page in a hidden window of the sheet's own size, then a picture of it. */
async function drawSheet(file, rows, colours, title) {
  const { html, width: w, height: h } = sheetHtml(rows, colours, sheetWidth, title);
  const page = path.join(os.tmpdir(), `frameling-sheet-${process.pid}.html`);
  fs.writeFileSync(page, html);
  const win = new BrowserWindow({ width: Math.min(w, 1600), height: 900, show: true, x: 0, y: 0, skipTaskbar: true, webPreferences: { sandbox: true, backgroundThrottling: false } });
  await win.loadFile(page);
  await win.webContents.executeJavaScript(`Promise.all([...document.images].map((i) => i.decode().catch(() => {})))`);
  await sleep(200);
  // The whole page in one go, however tall: a window cannot be bigger than the screen, the debugger's screenshot can.
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  const shot = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  win.destroy();
  fs.rmSync(page, { force: true });
}

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  mockMain(ipcMain);
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-panels-'));
  const win = makeWindow(BrowserWindow, width, height);
  const logs = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) logs.push(String(e.message ?? e));
  });

  /** theme -> id -> what was seen */
  const seen = {};
  let list = null;
  let info = [];
  const colours = {};
  for (const theme of themes) {
    await load(win, theme);
    if (!list) {
      const all = await js(win, `return __frameling.panelList()`);
      info = all;
      list = panelList(all.map((p) => p.id), { only, skip });
      if (list.missing.length) console.log(`  no such panel: ${list.missing.join(', ')}`);
    }
    await js(win, `__frameling.dock.resetLayout(); return true;`);
    await sleep(300);
    colours[theme] = await js(win, `const s = getComputedStyle(document.body); const l = getComputedStyle(document.documentElement).getPropertyValue('--line') || ''; return { bg: s.backgroundColor, fg: s.color, line: l.trim() || 'rgba(128,128,128,.4)' };`);
    seen[theme] = {};
    for (const id of list.ids) {
      seen[theme][id] = await capture(win, id, docFor(id, forcedDoc), tmp, theme, logs);
      const s = seen[theme][id];
      console.log(`${s.problem ? 'x' : '.'} ${theme} ${id}${s.problem ? `: ${s.problem}` : ''}`);
    }
  }

  const rows = list.ids.map((id) => {
    const p = info.find((x) => x.id === id);
    return { id, title: p?.title ?? id, zone: p?.zone ?? '?', shots: themes.map((t) => seen[t][id]) };
  });
  for (const theme of themes) {
    const one = rows.map((r) => ({ ...r, shots: [seen[theme][r.id]] }));
    await drawSheet(path.join(outDir, `panels-${theme}.png`), one, colours[theme], `Every panel, ${theme} theme, ${list.ids.length} panels`);
  }
  if (themes.length > 1) await drawSheet(path.join(outDir, 'panels-both.png'), rows, colours[themes[0]], `Every panel, ${themes.join(' and ')} side by side, ${list.ids.length} panels`);

  const report = Object.values(seen).flatMap((per) => Object.values(per).map((s) => ({ id: s.id, theme: s.theme, doc: s.doc, w: s.w ?? null, h: s.h ?? null, problem: s.problem })));
  fs.writeFileSync(path.join(outDir, 'panels.json'), JSON.stringify(report, null, 2));
  const bad = report.filter((r) => r.problem);
  console.log(`\n${list.ids.length} panels x ${themes.length} theme${themes.length > 1 ? 's' : ''}: ${report.length - bad.length} rendered, ${bad.length} with a problem`);
  for (const b of bad) console.log(`  ${b.theme} ${b.id}: ${b.problem}`);
  if (issues.size) console.log(`  also seen: ${[...issues].join('; ')}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  win.destroy();
  app.exit(bad.length || list.missing.length ? 1 : 0);
});

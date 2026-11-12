// Captures every help picture and clip in both the dark and the light version, from the built renderer.
//
//   npm run help:media                           everything, both themes
//   npm run help:media -- --only select,tour     just those names (base names, as a topic's `media` says, no extension)
//   npm run help:media -- --theme light          one theme only
//   npm run help:media -- --list                 print the names and what each makes
//   [--renderer <dir>]  [--out <dir>]            a private `vite build --outDir`; write somewhere other than public/help
//
// Run it inside xvfb, never on the desktop: SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron ...
// (the npm script does the Electron part; wrap it in xvfb-run).
//
// The capture steps live in scripts/docs/help/*.cjs. Each file exports an array of entries:
//   { name: 'select',            // the topic's `media` without its extension: select.png or tour.mp4 -> 'select', 'tour'
//     prefs: {...},              // extra preferences on top of the defaults (showWelcome off, the default theme for the mode)
//     size: [1280, 800],         // window size, default 1280 x 800
//     steps: [...],              // the record.cjs steps. {"shot": "@"} saves the picture, {"rec": "@", ...} starts the clip.
//     width: 800,                // widest the output gets (default 800)
//     poster: 12 }               // clips: the poster frame (default the last one)
// An entry that records ({"rec": "@"}) makes `<name>-dark.mp4` + `<name>-dark-poster.png` (and -light); one that shoots
// makes `<name>-dark.png` (and -light). The steps run once per theme, in a fresh page, with the mode's default theme
// (the dark one and the light one the app starts with), so the two versions match except for the colours.
const { app, BrowserWindow, ipcMain } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runSteps, sleep, stopActiveRec, mockMain, makeWindow } = require('./steps.cjs');

const root = path.join(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('help-media.cjs'));
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
};
const rendererDir = opt('renderer', path.join(root, 'dist/renderer'));
const outDir = opt('out', path.join(root, 'public/help'));
const onlyArg = opt('only', '');
const only = onlyArg ? onlyArg.split(',') : null;
const themeArg = opt('theme', 'both');
const listOnly = flag('list');
const THEMES = themeArg === 'both' ? ['dark', 'light'] : [themeArg];
// The app's own defaults for the two modes (src/ui/themes/builtIn.ts), so the help shows what a new person sees.
const DEFAULT_THEME = { dark: 'midnight-sketchbook', light: 'paper-and-honey' };

/** Every entry from scripts/docs/help/*.cjs, with the file it came from. */
function loadEntries() {
  const dir = path.join(__dirname, 'help');
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.cjs') && !x.startsWith('_')).sort()) {
    for (const e of require(path.join(dir, f))) out.push({ ...e, file: f });
  }
  return out;
}

const isClip = (e) => e.steps.some((s) => s.rec && s.rec !== 'stop');

async function capture(win, e, mode, tmp, lib) {
  const [w, h] = e.size ?? [1280, 800];
  win.setContentSize(w, h);
  lib();
  const prefs = {
    theme: mode,
    look: 'cosy',
    darkTheme: DEFAULT_THEME.dark,
    lightTheme: DEFAULT_THEME.light,
    showWelcome: false,
    ...(e.prefs ?? {}),
  };
  await win.webContents.executeJavaScript(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); true;`);
  await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1' } });
  await sleep(e.wait ?? Number(process.env.SHOT_WAIT || 2000));
  const work = path.join(tmp, `${e.name}-${mode}`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  await runSteps(win, e.steps, { outDir: work, width: w, height: h, name: e.name });
  await stopActiveRec();
  const width = e.width ?? 800;
  const out = `${e.name}-${mode}`;
  if (isClip(e)) {
    execFileSync(path.join(__dirname, 'encode.sh'), [path.join(work, e.name), out, e.poster ?? 'last', String(width)], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, HELP_OUT: outDir } });
  } else {
    const src = path.join(work, `${e.name}.png`);
    if (!fs.existsSync(src)) throw new Error('no {"shot": "@"} step ran');
    execFileSync('convert', [src, '-resize', `${width}x>`, '-strip', '-define', 'png:compression-level=9', path.join(outDir, `${out}.png`)]);
  }
  return out;
}

app.whenReady().then(async () => {
  const entries = loadEntries();
  const names = new Set();
  for (const e of entries) {
    if (names.has(e.name)) console.log(`duplicate entry ${e.name} (${e.file})`);
    names.add(e.name);
  }
  if (listOnly) {
    for (const e of entries) console.log(`${e.name}\t${isClip(e) ? 'clip' : 'picture'}\t${e.file}`);
    app.quit();
    return;
  }
  const picked = entries.filter((e) => !only || only.includes(e.name));
  if (only) for (const n of only) if (!names.has(n)) console.log(`no entry named ${n}`);
  fs.mkdirSync(outDir, { recursive: true });
  const lib = mockMain(ipcMain);
  const win = makeWindow(BrowserWindow, 1280, 800);
  const logs = [];
  win.webContents.on('console-message', (ev) => {
    if (ev.level === 'error' || ev.level === 3) logs.push(String(ev.message ?? ev));
  });
  await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1' } });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'help-media-'));
  const failed = [];
  let made = 0;
  for (const e of picked) {
    for (const mode of THEMES) {
      logs.length = 0;
      try {
        const out = await capture(win, e, mode, tmp, lib);
        made++;
        console.log(`ok ${out}${logs.length ? `  (console errors: ${logs.slice(0, 2).join(' | ')})` : ''}`);
      } catch (err) {
        failed.push(`${e.name} (${mode}): ${err.message}`);
        console.log(`FAILED ${e.name} (${mode}): ${err.message}`);
        await stopActiveRec().catch(() => undefined);
      }
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${made} made, ${failed.length} failed${failed.length ? `:\n  ${failed.join('\n  ')}` : ''}`);
  win.destroy();
  process.exitCode = failed.length ? 1 : 0;
  app.quit();
});

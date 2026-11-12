// Captures the pictures and short videos used in the in-app help, from the built renderer, in a hidden Electron window.
// Modelled on scripts/shoot.cjs (same steps, real input events) with cropping and frame recording added.
//
//   npx electron scripts/docs/record.cjs <outDir> <steps.json> [--renderer <dir>] [--look cosy] [--theme dark]
//
// The renderer defaults to dist/renderer. Pass --renderer to point at a private `vite build --outDir` so a
// capture never races someone else's build. The steps file is a JSON array:
//   {"eval": "js"}  {"log": "js"} (prints the result)  {"wait": ms}  {"click": [x, y]}  {"key": "g", "mods": ["control"]}
//   {"down": [x, y]} {"held": [x, y]} {"up": [x, y]}      press, move with the button held, release (for a shot mid-drag)
//   {"drag": [[x, y], ...], "steps": 6, "delay": 8, "mods": ["shift"]}   delay is the ms between mouse moves, so slow
//                                                       strokes look drawn; mods are held down through the drag
//   {"shot": "name", "crop": [x, y, w, h]}              PNG of the window (cropped if asked), or "el": "css selector", "pad": 12
//   {"type": "text"}                                    sets the focused input's text (then fires input)
//   {"rec": "name", "crop": [x, y, w, h], "every": 60}  start recording frames in the background
//   {"rec": "stop"}                                     stop, and write frames + a timing list into <outDir>/<name>/
// Frames are stamped as they are captured; encode.sh turns each folder into an H.264 MP4 at the real pace.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2).filter((a) => !a.endsWith('record.cjs'));
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const rendererDir = opt('renderer', path.join(__dirname, '../../dist/renderer'));
const look = opt('look', 'cosy');
const theme = opt('theme', 'dark');
// Extra preferences, as JSON, e.g. --prefs '{"showTips":false}'. The theme and look above are always set, and the
// Welcome screen and first-run hello are off (they would swallow the first click) unless asked for.
const extraPrefs = JSON.parse(opt('prefs', '{}'));
const [outDir, stepsFile] = argv;
const width = Number(process.env.SHOT_W || 1280);
const height = Number(process.env.SHOT_H || 800);
const { runSteps: run, sleep, stopActiveRec, mockMain, makeWindow } = require('./steps.cjs');
const runSteps = (win, steps) => run(win, steps, { outDir, width, height });

app.whenReady().then(async () => {
  mockMain(ipcMain);
  fs.mkdirSync(outDir, { recursive: true });
  const win = makeWindow(BrowserWindow, width, height);
  const logs = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) logs.push(String(e.message ?? e));
  });
  await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1' } });
  // Preferences live in localStorage, so write them and load again for the app to pick them up.
  const prefs = { theme, look, darkTheme: 'midnight-sketchbook', showWelcome: false, onboarded: true, ...extraPrefs };
  await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); true;`);
  await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1' } });
  await sleep(Number(process.env.SHOT_WAIT || 3000));
  try {
    await runSteps(win, JSON.parse(fs.readFileSync(stepsFile, 'utf8')));
  } catch (err) {
    console.log(`step failed: ${err.message}`);
    process.exitCode = 1;
  }
  await stopActiveRec();
  console.log(`done ${path.basename(stepsFile)}${logs.length ? `\n  console errors:\n  ${logs.join('\n  ')}` : ''}`);
  win.destroy();
  app.quit();
});

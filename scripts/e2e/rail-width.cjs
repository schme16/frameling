// Checks the tool rail's width and its group names in the real app: at the interface sizes people use (100, 125, 150 and
// 200 per cent), at all three tool sizes, in both looks, in the draw, animate and pixel workspaces. For each it reports the
// rail's width, which names sit on two lines, which are cut short, and the room the canvas keeps on a 1280 x 720 screen.
// Exits 1 when a built-in name is cut short while the rail has its starting width, a name of your own does not drop to two lines before it is cut, or the canvas has less than 280 x 190.
//
//   npm run build && SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/rail-width.cjs
//
// RAILW_DIST=<dir> checks another copy of dist/ (a copy made before a change, for the before numbers).
// RAILW_SHOTS=<dir> saves a picture of the rail and its neighbourhood for each pass (dark and light).
// RAILW_SIZE=<w>x<h> sets the window (default 1280x720). RAILW_QUICK=1 runs one look and one workspace.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (why) => {
  console.error(`rail-width run failed: ${why?.stack ?? why}`);
  app.exit(2);
};
process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);
setTimeout(() => fail(new Error('timed out')), 15 * 60_000).unref();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-railw-')));

const DIST = process.env.RAILW_DIST || path.join(__dirname, '../../dist');
const [W, H] = (process.env.RAILW_SIZE || '1280x720').split('x').map(Number);
const SCALES = [1, 1.25, 1.5, 2];
const SIZES = ['small', 'medium', 'large'];
const LOOKS = process.env.RAILW_QUICK ? ['cosy'] : ['cosy', 'crisp'];
const WORKSPACES = process.env.RAILW_QUICK ? ['draw'] : ['draw', 'animate', 'pixel'];
const shots = process.env.RAILW_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });

// Runs in the page: the rail, each group name (how many lines it takes, whether it is cut) and the canvas.
const MEASURE = `(() => {
  const nav = document.querySelector('nav.ui-tools');
  if (!nav) return null;
  const r = nav.getBoundingClientRect();
  const heads = [...nav.querySelectorAll('.ui-tool-head')].map((h) => {
    const range = document.createRange();
    range.selectNodeContents(h);
    const box = h.getBoundingClientRect();
    // Only the lines that show: a third line the box clips away is not one.
    const lines = new Set([...range.getClientRects()].filter((q) => q.bottom <= box.bottom + 1).map((q) => Math.round(q.top))).size;
    const cut = h.scrollWidth > h.clientWidth + 1 || h.scrollHeight > h.clientHeight + 1;
    return { text: h.textContent, lines, cut };
  });
  const cv = document.querySelector('.ui-canvas')?.getBoundingClientRect();
  const cols = getComputedStyle(nav.querySelector('.ui-tool-group') ?? nav).getPropertyValue('--tool-cols') || '';
  return { rail: Math.round(r.width * 10) / 10, railH: Math.round(r.height), scrolls: nav.scrollHeight > nav.clientHeight + 1, heads, canvas: cv ? { w: Math.round(cv.width), h: Math.round(cv.height) } : null, cols: cols.trim(), x: Math.round(r.left), y: Math.round(r.top) };
})()`;

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain, {});
  const win = new BrowserWindow({
    width: W,
    height: H,
    useContentSize: true,
    show: true,
    x: 0,
    y: 0,
    paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=rail-width'], backgroundThrottling: false },
  });
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const index = path.join(DIST, 'renderer/index.html');
  await win.loadFile(index, { query: { debug: '1' } });
  await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme: 'dark', showWelcome: false, onboarded: true }))}); return true`);
  await win.loadFile(index, { query: { debug: '1' } });
  await sleep(1200);

  const rows = [];
  let bad = 0;
  for (const look of LOOKS) {
    for (const ws of WORKSPACES) {
      for (const size of SIZES) {
        for (const scale of SCALES) {
          await js(`__frameling.prefs.set({ look: '${look}', toolSize: '${size}', uiScale: ${scale}, toolNames: true, toolRail: 'two' }); __frameling.dock.applyWorkspace('${ws}'); __frameling.template('${ws === 'pixel' ? 'blank-pixel' : 'bouncing-ball'}'); document.querySelector('.ui-choice') && document.querySelector('.ui-choice').click(); return true`);
          await sleep(350);
          const m = await js(`return ${MEASURE}`);
          if (!m) {
            console.log(`${look} ${ws} ${size} ${scale * 100}%: no rail`);
            continue;
          }
          const two = m.heads.filter((h) => h.lines > 1).map((h) => h.text);
          const cut = m.heads.filter((h) => h.cut).map((h) => h.text);
          const roomBad = !m.canvas || m.canvas.w < 280 || m.canvas.h < 190;
          if (cut.length || roomBad) bad++;
          rows.push({ look, ws, size, scale, ...m });
          console.log(`${look} ${ws} ${size} ${Math.round(scale * 100)}%: rail ${m.rail}px, ${m.cols || '?'} across${m.scrolls ? ', SCROLLS' : ''}, canvas ${m.canvas ? m.canvas.w + ' x ' + m.canvas.h : 'none'}${two.length ? `, two lines: ${two.join(' | ')}` : ''}${cut.length ? `, CUT: ${cut.join(' | ')}` : ''}${roomBad ? ', NOT ENOUGH ROOM' : ''}`);
          if (shots && ws === 'draw' && look === 'cosy' && size === 'medium') {
            for (const theme of ['dark', 'light']) {
              await js(`__frameling.prefs.set({ theme: '${theme}' }); return true`);
              await sleep(250);
              const img = await win.webContents.capturePage();
              fs.writeFileSync(path.join(shots, `${look}-${size}-${Math.round(scale * 100)}-${theme}-full.png`), img.toPNG());
            }
            await js(`__frameling.prefs.set({ theme: 'dark' }); return true`);
          }
        }
      }
    }
  }
  // A name of your own that does not fit: two lines before it is cut, dots only after that (one long word is cut on its line).
  await js(`__frameling.prefs.set({ look: 'cosy', toolSize: 'medium', uiScale: 1, toolNames: true, toolRail: 'two' }); __frameling.dock.applyWorkspace('draw'); __frameling.template('bouncing-ball'); return true`);
  await sleep(300);
  const names = [
    ['My drawing tools', 2, false],
    ['One two three four five six seven eight nine', 2, true],
    ['Supercalifragilisticexpialidocious', 1, true],
  ];
  await js(`__frameling.dock.setToolGroups(${JSON.stringify(names.map(([name], i) => ({ id: ['draw', 'extras', 'shapes'][i], name, tools: [['pencil', 'brush'], ['gradient', 'eyedropper'], ['line', 'rect']][i] })))}); return true`);
  await sleep(400);
  const custom = await js(`return ${MEASURE}`);
  names.forEach(([name, lines, cut], i) => {
    const h = custom.heads[i];
    const ok = h && h.lines === lines && h.cut === cut;
    if (!ok) bad++;
    console.log(`custom name "${name}": ${h ? `${h.lines} line(s), ${h.cut ? 'cut with dots' : 'whole'}` : 'missing'}, wanted ${lines} line(s), ${cut ? 'cut with dots' : 'whole'}${ok ? '' : '  <-- WRONG'}`);
  });
  if (process.env.RAILW_JSON) fs.writeFileSync(process.env.RAILW_JSON, JSON.stringify(rows, null, 1));
  console.log(bad ? `${bad} pass(es) with a cut name or too little room` : 'every name fits and the canvas keeps its room');
  app.exit(bad ? 1 : 0);
});

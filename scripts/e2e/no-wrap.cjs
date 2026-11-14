// Finds every control whose words break onto a second line, in the real app. The rule it checks: a button's words stay on
// one line (see "Buttons keep their words on one line" in docs/testing.md). It walks every panel, every tool's options,
// every dialog and Preferences page, and the main window with a vector and a pixel drawing, at the narrow widths people
// really use: a 1280 laptop with the right side at its smallest and at its usual width, and the interface size slider at
// 150% and 200% (where the window holds fewer, bigger pixels), plus a wide screen. In each view every visible control
// (button, radio, tab, chip, switch, label, select) is checked: a short piece of its text that sits on two or more lines
// is a wrap. It also drags the right side wider one step at a time on a few busy views, and reports any that wraps on the
// way or grows taller as the panel gets wider (the layout jumping about).
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/no-wrap.cjs
//
// NOWRAP_JSON=<file> saves every finding. NOWRAP_SHOTS=<dir> saves a picture of each view that has a wrap.
// NOWRAP_EXPLAIN=on runs with the explanations on show (a new person's view; the default run has them tucked away behind the ? icons).
// NOWRAP_SIZE=<w>x<h> runs the passes at that window size. NOWRAP_ROOM_ONLY=1 runs only the room check (canvas size, top bar fits).
// NOWRAP_ONLY=<text> runs only the views whose name starts with it. NOWRAP_PASSES=a,b runs only those passes.
// It also looks for a control sitting on top of another one (an overlap is not a wrap: words that will not wrap run under the
// next column). Mark a stack that is meant with data-overlaps.
// Exits 1 when anything wraps, overlaps or jumps.
const { app, BrowserWindow, ipcMain } = require('electron');
// Software drawing with no GPU process (what a harness with no flags got under xvfb, so its pictures stay as they were), with
// the colour pinned to sRGB (scripts/lib/gpu.cjs).
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (why) => {
  console.error(`no-wrap run failed: ${why?.stack ?? why}`);
  app.exit(2);
};
process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);
setTimeout(() => fail(new Error('timed out')), Number(process.env.NOWRAP_TIMEOUT || 40) * 60_000).unref();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-nowrap-')));

// The widths and sizes. `right` is the right side's width in pixels (200 is as small as it goes); 0 leaves it as it is.
const PASSES = [
  { name: 'laptop 1280, right side smallest', w: 1280, h: 800, scale: 1, right: 200 },
  { name: 'laptop 1280, right side usual', w: 1280, h: 800, scale: 1, right: 0 },
  { name: 'laptop 1280, interface 150%', w: 1280, h: 800, scale: 1.5, right: 0 },
  { name: 'laptop 1280, interface 200%', w: 1280, h: 800, scale: 2, right: 0 },
  { name: 'wide 1920, interface 100%', w: 1920, h: 1000, scale: 1, right: 0 },
];

// NOWRAP_SIZE=1280x720 runs every pass at that window size instead (for checking one screen, such as the hello at 720 high).
if (process.env.NOWRAP_SIZE) {
  const [w, h] = process.env.NOWRAP_SIZE.split('x').map(Number);
  for (const p of PASSES) Object.assign(p, { w, h, name: `${p.name.replace(/^\w+ \d+, /, '')} at ${w}x${h}` });
}

// Documents that give each panel something to show (the same ones scripts/a11y.cjs uses).
const DOCS = { default: 'bouncing-ball', text: 'bouncing-logo', effects: 'bouncing-logo', rig: 'puppet', 'lip-sync': 'lip-sync', particles: 'sparkle-fx', tileset: 'tileset', palette: 'blank-pixel', 'symbol-props': 'bouncing-logo', camera: 'camera-parallax', 'clip-flow': 'hero-sprites', library: 'bouncing-logo' };
const tpl = (id) => `__frameling.template(${JSON.stringify(id)});`;
const run = (id) => `__frameling.run(${JSON.stringify(id)});`;
const picture = (file) => `void __framelingPicture.open(${JSON.stringify(Array.from(fs.readFileSync(path.join(__dirname, '../docs/help/assets', file))))}, ${JSON.stringify(file)}); true`;
const HELLO_NEXT = `document.querySelector('.ob-next')?.click()`;
const HELLO_PICK = `for (const t of ['Sketches and cartoons', 'Game sprites and pixel art', 'Tiles and levels']) [...document.querySelectorAll('.ob-card')].find((c) => c.textContent.includes(t))?.click()`;
const DIALOGS = [
  ['palette', run('view.commandPalette')],
  ['help', run('help.contents')],
  ['help topic', `__frameling.overlays.openHelp('keyboard-shortcuts')`],
  ['new drawing', run('file.new')],
  ['examples', run('file.openExample')],
  ['themes', run('view.themes')],
  ['welcome', run('help.welcome')],
  ['about', run('help.about')],
  ['onboarding', run('help.meetQuill')],
  // The other pages of the hello (each needs the one before it): what to make with three picked, colours, settings, the last page.
  ['onboarding make', [run('help.meetQuill'), HELLO_NEXT, HELLO_PICK]],
  ['onboarding colours', [run('help.meetQuill'), HELLO_NEXT, HELLO_NEXT]],
  ['onboarding settings', [run('help.meetQuill'), HELLO_NEXT, HELLO_NEXT, HELLO_NEXT]],
  ['onboarding last page', [run('help.meetQuill'), HELLO_NEXT, HELLO_PICK, HELLO_NEXT, HELLO_NEXT, HELLO_NEXT]],
  ['prefs general', `__frameling.overlays.openPrefs('general')`],
  ['prefs themes', `__frameling.overlays.openPrefs('themes')`],
  ['prefs behaviour', `__frameling.overlays.openPrefs('behaviour')`],
  ['prefs keyboard', `__frameling.overlays.openPrefs('keyboard')`],
  ['prefs snapping', `__frameling.overlays.openPrefs('snapping')`],
  ['prefs workspaces', `__frameling.overlays.openPrefs('workspaces')`],
  ['prefs plugins', `__frameling.overlays.openPrefs('plugins')`],
  ['prefs features', `__frameling.overlays.openPrefs('features')`],
  ['prefs pen', `__frameling.overlays.openPrefs('pen')`],
  ['prefs diagnostics', `__frameling.overlays.openPrefs('diagnostics')`],
  // The ask-the-first-time questions: each option's detail is a sentence, so these are where words run off an edge.
  // The four here carry the longest details of any question in the app.
  ...['versions.restore', 'export.clipEngineBounce', 'effects.maskStart', 'timeline.newKeyHold'].map((id) => [`question ${id}`, `void __frameling.choices.ask('${id}')`]),
  ['pen check offer', `__frameling.overlays.state.set((o) => ({ ...o, penCheck: 'offer' }))`],
  ['pen check', run('pen.check')],
  ['canvas size', run('document.settings')],
  ['export', run('file.export')],
  // Every format brings its own options, so the window's height and the second column change with each: look at them all.
  ...Array.from({ length: 16 }, (_, n) => [
    `export format ${n + 1}`,
    [run('file.export'), `document.querySelector('.ex-more[aria-expanded=false]')?.click()`, `[...document.querySelectorAll('.ex-card')][${n}]?.click()`],
  ]),
  ['export artboards', [`__framelingArtboards.load('variations')`, run('file.export')]],
  ['export tileset', [tpl('tileset'), run('tiles.export')]],
  ['rotate', [tpl('hero-sprites'), run('pixel.rotate')]],
  ['import picture', [tpl('hero-sprites'), picture('slime-sheet.png')]],
  ['import picture gif', [tpl('hero-sprites'), picture('slime-bounce.gif')]],
  ['lipsync name', [tpl('lip-sync'), run('lipsync.nameFrames')]],
  ['save template', run('file.saveAsTemplate')],
  ['recent', run('file.openRecent')],
  ['recover', run('file.recover')],
  ['grid settings', run('view.gridSettings')],
  ['snap options', run('view.snapOptions')],
  ['versions', `__framelingIo.versionsDialog('list')`],
  ['versions strip', `__framelingIo.versionsDialog('strip')`],
  ['workspaces manage', run('view.manageWorkspaces')],
];

// Runs in the page. Walks the visible controls under `scope` and returns each one whose own words sit on two or more lines.
// Only a short piece of text counts (a sentence inside a card is a paragraph, which is meant to wrap).
const FIND = `((scopeSel) => {
  const scope = scopeSel ? document.querySelector(scopeSel) : document.body;
  if (!scope) return { missing: true, found: [] };
  const CLASS = /(^|[-_])(btn|button|chip|pill|tab|tabs|seg|segmented|badge|toggle|tag|swatch|choice|opt|option|action|cut|preset)([-_]|$)/;
  const ROLE = /^(button|tab|radio|checkbox|switch|menuitem|menuitemradio|menuitemcheckbox|option|link)$/;
  const isCandidate = (el) => {
    const t = el.tagName;
    if (el.hasAttribute('data-one-line')) return true;
    if (t === 'BUTTON' || t === 'LABEL' || t === 'SELECT' || t === 'SUMMARY' || t === 'A') return true;
    if (ROLE.test(el.getAttribute('role') || '')) return true;
    return typeof el.className === 'string' && el.className.split(/\\s+/).some((c) => CLASS.test(c));
  };
  const visible = (el) => {
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // A switch or tick box with its words beside it is not a button: the words may wrap beside the knob, which stays put.
  const tickBox = (el) => el.tagName === 'LABEL' && !!el.querySelector('input[type=checkbox], input[type=radio]');
  const all = [...scope.querySelectorAll('*')].filter((el) => isCandidate(el) && !tickBox(el) && !tickBox(el.closest('label') || document.body));
  // A candidate that holds another candidate is a container; the inner one is measured instead.
  const leaves = all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
  const found = [];
  let squeezedCount = 0;
  const lineCount = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    const tops = [];
    for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) < r.height * 0.5)) tops.push(r.top);
    return tops.length;
  };
  for (const el of leaves) {
    if (!visible(el) || el.closest('[data-wraps]')) continue;
    // Text in a scrolled-away or clipped box is judged where it is shown; skip ones with no room at all.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let worst = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent || '').replace(/\\s+/g, ' ').trim();
      // A line marked data-one-line (a status line that is cut with an ellipsis) may be any length.
      if (!text || (text.length > 48 && !el.hasAttribute('data-one-line')) || !n.parentElement || !visible(n.parentElement)) continue;
      const lines = lineCount(n);
      if (lines > 1 && (!worst || lines > worst.lines)) worst = { text, lines };
    }
    const r = el.getBoundingClientRect();
    if (!worst) {
      // Words that stay on one line must not poke out of the box that holds them, or the row must scroll on purpose
      // (data-scrolls). A box that clips a control, or a panel that gains a sideways scroll bar, is a failure too.
      const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text || text.length > 48) continue;
      let out = null;
      let squeezed = false;
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        const box = a.getBoundingClientRect();
        if (a.hasAttribute('data-scrolls')) break;
        // The window's own edge is the layout's business (the dock), not a control row's.
        if (a === document.body) break;
        if (/^(hidden|clip)$/.test(cs.overflowX) && (r.right > box.right + 1.5 || r.left < box.left - 1.5) && box.width > 0 && cs.textOverflow !== 'ellipsis') {
          squeezed = box.width < 120;
          out = 'clipped by ' + a.tagName.toLowerCase() + (typeof a.className === 'string' && a.className ? '.' + a.className.trim().split(/\\s+/)[0] : '');
          break;
        }
        if (/^(auto|scroll)$/.test(cs.overflowX) && a.scrollWidth > a.clientWidth + 1.5 && (r.right > box.right + 1.5 || r.left < box.left - 1.5)) {
          squeezed = box.width < 120;
          out = 'scrolls sideways in ' + a.tagName.toLowerCase() + (typeof a.className === 'string' && a.className ? '.' + a.className.trim().split(/\\s+/)[0] : '');
          break;
        }
      }
      if (!out) continue;
      // A box squeezed to almost nothing (the dock gave the canvas no room at 200% on a laptop) is the layout's problem, not
      // the control's: it is counted and printed, not failed.
      if (squeezed) {
        squeezedCount++;
        continue;
      }
      worst = { text, lines: 1, out };
    }
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    const par = el.parentElement;
    const pcls = par && typeof par.className === 'string' ? par.className.trim().split(/\\s+/).slice(0, 1).join('.') : '';
    found.push({
      sig: (worst.out ? '[pokes out: ' + worst.out + '] ' : '') + (par ? par.tagName.toLowerCase() + (pcls ? '.' + pcls : '') + ' > ' : '') + el.tagName.toLowerCase() + (cls ? '.' + cls : '') + ' "' + worst.text + '"',
      text: worst.text,
      lines: worst.lines,
      out: worst.out || null,
      w: Math.round(r.width),
      h: Math.round(r.height),
    });
  }
  // A control sitting on top of another one is not a wrap, so the check above never sees it: words that will not wrap run
  // under the next column, and a button covers its neighbour. For each pair of visible controls that do not contain each
  // other, the part with words is the box the words fill (a card's sentence pokes out of the card), the rest is the box.
  // Marked data-overlaps for a stack that is meant (a badge on a thumbnail).
  const SOLID = 'button, input:not([type=hidden]), select, textarea, summary, [role=tab], [role=radio], [role=checkbox], [role=switch], [role=menuitem], [role=option], [data-one-line]';
  const ctrls = [...scope.querySelectorAll(SOLID)].filter((el) => visible(el) && !el.closest('[data-overlaps]') && getComputedStyle(el).pointerEvents !== 'none');
  // A box cut to every scrolling or clipping box from the starting box upward: only what shows counts, so a control scrolled out of
  // sight (or text cut off with an ellipsis) is not "on top of" anything.
  const clipBy = (start, b) => {
    let box = b;
    for (let a = start; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const r = a.getBoundingClientRect();
      box = {
        l: cs.overflowX === 'visible' ? box.l : Math.max(box.l, r.left),
        r: cs.overflowX === 'visible' ? box.r : Math.min(box.r, r.right),
        t: cs.overflowY === 'visible' ? box.t : Math.max(box.t, r.top),
        b: cs.overflowY === 'visible' ? box.b : Math.min(box.b, r.bottom),
      };
      if (box.r <= box.l || box.b <= box.t) return null;
    }
    return box;
  };
  // The box a control fills: its own box, and every piece of its words (which may poke out of it), each cut to what shows.
  const spans = (el) => {
    const r = el.getBoundingClientRect();
    let box = clipBy(el.parentElement, { l: r.left, t: r.top, r: r.right, b: r.bottom });
    if (!box || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return box;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent || '').trim() || !n.parentElement) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) {
        if (q.width < 0.5 || q.height < 0.5) continue;
        const c = clipBy(n.parentElement, { l: q.left, t: q.top, r: q.right, b: q.bottom });
        if (c) box = { l: Math.min(box.l, c.l), t: Math.min(box.t, c.t), r: Math.max(box.r, c.r), b: Math.max(box.b, c.b) };
      }
    }
    return box;
  };
  const name = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    const t = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('value') || '').replace(/\\s+/g, ' ').trim().slice(0, 28);
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (t ? ' "' + t + '"' : '');
  };
  const stuck = (el) => {
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) if (/^(sticky|fixed)$/.test(getComputedStyle(a).position)) return true;
    return false;
  };
  const boxes = ctrls.map((el) => ({ el, b: spans(el) })).filter((x) => x.b);
  const seen = new Set();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const c = boxes[j];
      if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
      // A sticky heading is meant to lie over what scrolls under it.
      if (stuck(a.el) !== stuck(c.el)) continue;
      const w = Math.min(a.b.r, c.b.r) - Math.max(a.b.l, c.b.l);
      const h = Math.min(a.b.b, c.b.b) - Math.max(a.b.t, c.b.t);
      if (w < 3 || h < 3) continue;
      // Boxes that only touch because one is a thin overlay (a resize handle, a focus ring) are not controls on top of controls.
      const ra = a.el.getBoundingClientRect();
      const rc = c.el.getBoundingClientRect();
      if (Math.min(ra.width, ra.height, rc.width, rc.height) < 6) continue;
      const sig = '[overlaps] ' + name(a.el) + ' <> ' + name(c.el);
      if (seen.has(sig)) continue;
      seen.add(sig);
      found.push({ sig, text: name(a.el) + ' <> ' + name(c.el), lines: 1, out: 'overlap', overlap: true, w: Math.round(w), h: Math.round(h) });
    }
  }
  return { found, squeezed: squeezedCount };
})`;

// Does the main window have room: the canvas keeps a usable size, nothing in the top bar sits past the window's edge, and the page
// has no sideways scroll. Reads the real layout (see src/ui/dockFit.ts for the rule: the canvas keeps at least 280 x 190).
const ROOM = `(() => {
  const win = { w: window.innerWidth, h: window.innerHeight };
  const cv = document.querySelector('.ui-canvas')?.getBoundingClientRect();
  const out = [];
  for (const el of document.querySelectorAll('.ui-topbar *, .ui-status *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.right > win.w + 1) out.push((el.getAttribute('aria-label') || el.textContent || String(el.className?.baseVal ?? el.className)).toString().trim().slice(0, 24));
  }
  return { win, canvas: cv ? { w: Math.round(cv.width), h: Math.round(cv.height) } : null, pastTheEdge: [...new Set(out)].slice(0, 12), scrolls: document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1 };
})()`;
const rooms = []; // { pass, view, win, canvas, pastTheEdge, scrolls }
const CANVAS_LEAST = { w: 280, h: 190 };

// A panel is a section of Properties (the right side's usual look) or a panel of its own (the right side's other looks, the bottom).
const SCOPE = (id) => `#rd-sec-${id}, [data-panel-id="${id}"]`;

// The height of the thing under test, for the jump check.
const HEIGHT = `((sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().height) : -1; })`;

const findings = []; // { pass, view, sig, text, lines, w, h }
const jumps = [];
let squeezed = 0; // controls in a box the dock squeezed under 120px: counted, not failed
const missing = []; // views whose scope was not on screen, so nothing was checked there
const viewsRun = [];
const shotsDir = process.env.NOWRAP_SHOTS;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

async function makeWindow(p) {
  const win = new BrowserWindow({
    width: p.w,
    height: p.h,
    useContentSize: true,
    show: true,
    x: 0,
    y: 0,
    paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(process.env.NOWRAP_DIST || path.join(__dirname, '../../dist'), 'preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=no-wrap'], backgroundThrottling: false },
  });
  return win;
}

// NOWRAP_DIST points at another build (a copy of dist/ made before a change, for the before numbers).
const DIST = process.env.NOWRAP_DIST || path.join(__dirname, '../../dist');
const index = () => path.join(DIST, 'renderer/index.html');

async function runPass(p) {
  const win = await makeWindow(p);
  const js = (code) =>
    Promise.race([win.webContents.executeJavaScript(`(async () => { ${code} })()`), new Promise((_, no) => setTimeout(() => no(new Error('page call timed out: ' + code.trim().slice(0, 100))), 20000))]);
  // Settings live in localStorage: no Welcome screen, no first-run hello. Light theme first, the other theme is the same shapes.
  await win.loadFile(index(), { query: { debug: '1' } });
  await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme: 'dark', showWelcome: false, onboarded: true, showTips: true, showExplanations: process.env.NOWRAP_EXPLAIN === 'on' }))}); return true`);
  await win.loadFile(index(), { query: { debug: '1' } });
  await sleep(1200);
  await js(`__frameling.prefs.set({ uiScale: ${p.scale} }); return true`);
  await sleep(300);

  const reset = async (doc = 'bouncing-ball') => {
    await js(`
      const f = __frameling;
      f.overlays.state.set((o) => ({ ...o, palette: false, prefs: null, help: null, sheet: null, about: false, onboarding: false, penCheck: undefined }));
      f.template(${JSON.stringify(doc)});
      f.store().setUi({ tool: 'select' });
      ${p.right ? `f.dock.resizeZone('right', ${p.right});` : ''}
      document.activeElement?.blur?.();
    `);
    await sleep(150);
    // A first-time question (a pixel template asks one) is the app working: take the suggested answer.
    if (await js(`return !!document.querySelector('.ui-choice')`)) {
      await js(`document.querySelector('.ui-choice')?.focus()`);
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await sleep(200);
    }
  };

  const view = async (name, scope) => {
    if (process.env.NOWRAP_ONLY && !name.startsWith(process.env.NOWRAP_ONLY)) return;
    const r = await js(`return (${FIND})(${JSON.stringify(scope)})`);
    viewsRun.push(`${p.name}: ${name}`);
    squeezed += r.squeezed || 0;
    if (r.missing) {
      missing.push(`${p.name}: ${name}`);
      return;
    }
    for (const f of r.found) findings.push({ pass: p.name, view: name, ...f });
    if (r.found.length && shotsDir) {
      const img = await Promise.race([win.webContents.capturePage(), sleep(6000).then(() => null)]);
      if (img) fs.writeFileSync(path.join(shotsDir, `${p.name}__${name}`.replace(/\W+/g, '-') + '.png'), img.toPNG());
    }
  };

  // Room in each of the three workspaces: the canvas keeps its least size, the top bar fits, nothing scrolls sideways.
  const room = async (name) => {
    const r = await js(`return ${ROOM}`);
    rooms.push({ pass: p.name, view: name, ...r });
    const bad = !r.canvas || r.canvas.w < CANVAS_LEAST.w || r.canvas.h < CANVAS_LEAST.h || r.pastTheEdge.length || r.scrolls;
    if (bad) findings.push({ pass: p.name, view: `room ${name}`, sig: `[room] ${name}: canvas ${r.canvas ? r.canvas.w + ' x ' + r.canvas.h : 'missing'}${r.pastTheEdge.length ? ', past the edge: ' + r.pastTheEdge.join(' | ') : ''}${r.scrolls ? ', sideways scroll' : ''}`, text: name, lines: 1 });
  };
  for (const ws of ['draw', 'animate', 'pixel']) {
    await reset(ws === 'pixel' ? 'blank-pixel' : 'bouncing-ball');
    await js(`__frameling.dock.applyWorkspace(${JSON.stringify(ws)}); return true`).catch(() => {});
    await sleep(400);
    await room(`${ws} workspace`);
  }
  await js(`__frameling.dock.applyWorkspace('draw'); return true`).catch(() => {});
  // NOWRAP_ROOM_ONLY=1 stops here: just the room check, in a minute instead of half an hour.
  if (process.env.NOWRAP_ROOM_ONLY) {
    win.destroy();
    return;
  }

  // The main window, with a vector drawing and a pixel drawing, nothing selected and then everything selected.
  await reset('bouncing-ball');
  await sleep(300);
  await view('window vector', null);
  await js(run('select.all') + ' return true');
  await sleep(200);
  await view('window vector selected', null);
  await reset('blank-pixel');
  await sleep(300);
  await view('window pixel', null);
  await js(`__frameling.store().setUi({ tool: 'pixel-select' }); return true`).catch(() => {});

  // Every panel.
  const panels = await js(`return __frameling.panels()`);
  for (const id of panels) {
    await reset(DOCS[id] ?? DOCS.default);
    await js(`__frameling.showPanel(${JSON.stringify(id)}); return true`);
    await sleep(220);
    await view(`panel ${id}`, SCOPE(id));
    await js(`__frameling.run('select.all'); return true`);
    await sleep(220);
    await view(`panel ${id} selected`, SCOPE(id));
  }

  // The Artboards panel with several boards and variations, beside the Layers panel it is built like (a board's row has its
  // size and a variation tag that a layer's does not).
  for (const id of ['artboards', 'layers']) {
    await reset('bouncing-ball');
    await js(`__framelingArtboards.load('variations'); return true`);
    await js(`__frameling.showPanel(${JSON.stringify(id)}); return true`);
    await sleep(300);
    await view(`panel ${id} with several boards`, SCOPE(id));
  }

  // Every tool's options, on a vector drawing and a pixel drawing, with something selected (selection options show then).
  const tools = await js(`return __frameling.tools()`);
  for (const t of tools) {
    const docs = /^tile/.test(t) ? ['tileset'] : /pose|bone|weights/.test(t) ? ['puppet'] : t === 'camera' ? ['camera-parallax'] : ['bouncing-ball', 'blank-pixel'];
    for (const doc of docs) {
      await reset(doc);
      await js(`__frameling.showPanel('tool-options'); __frameling.store().setUi({ tool: ${JSON.stringify(t)} }); return true`);
      await sleep(180);
      await view(`tool ${t} (${doc === 'blank-pixel' ? 'pixel' : doc === 'bouncing-ball' ? 'vector' : doc})`, SCOPE('tool-options'));
    }
  }

  // Every dialog and Preferences page.
  for (const [n, setup] of DIALOGS) {
    if (process.env.NOWRAP_ONLY && !`dialog ${n}`.startsWith(process.env.NOWRAP_ONLY)) continue;
    await reset();
    for (const step of Array.isArray(setup) ? setup : [setup]) {
      await js(step.includes('return') ? step : step + '; return true').catch(() => {});
      await sleep(260);
      if (await js(`return !!document.querySelector('.ui-choice')`)) {
        await js(`document.querySelector('.ui-choice')?.focus()`);
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
        await sleep(200);
      }
    }
    await sleep(900);
    const has = await js(`return !!document.querySelector('[role=dialog]')`);
    await view(`dialog ${n}`, has ? '[role=dialog]' : null);
    // A dialog with tabs or pages: walk through them too.
    if (has) {
      const tabs = await js(`return [...document.querySelectorAll('[role=dialog] [role=tab], [role=dialog] .ui-prefs-nav button, [role=dialog] .io-tabs button')].map((b, i) => i)`);
      for (const i of tabs.slice(0, 14)) {
        await js(`const b = [...document.querySelectorAll('[role=dialog] [role=tab], [role=dialog] .ui-prefs-nav button, [role=dialog] .io-tabs button')][${i}]; b?.click(); return true`);
        await sleep(300);
        await view(`dialog ${n}, tab ${i + 1}`, '[role=dialog]');
      }
    }
    await js(`__frameling.overlays.closeSheet(); __frameling.overlays.state.set((o) => ({ ...o, palette: false, prefs: null, help: null, sheet: null, about: false, onboarding: false })); return true`).catch(() => {});
    await sleep(120);
  }

  // Dragging the right side wider: nothing wraps on the way and the content never grows taller as the panel gets wider.
  if (p.right === 200) {
    const SWEEP = [
      ['select tool', 'bouncing-ball', 'select', 'tool-options'],
      ['pixel select tool', 'blank-pixel', 'pixel-select', 'tool-options'],
      ['pixel brush', 'blank-pixel', 'pencil', 'tool-options'],
      ['pen tool', 'bouncing-ball', 'pen', 'tool-options'],
      ['text tool', 'bouncing-logo', 'text', 'tool-options'],
      ['colors', 'bouncing-ball', 'select', 'colors'],
      ['effects', 'bouncing-logo', 'select', 'effects'],
      // The Preview panel's frame line as the playhead goes from one digit to two to three (a 150 frame drawing).
      ['preview frame line', 'blank-pixel', 'pencil', 'preview'],
    ];
    for (const [name, doc, tool, panel] of SWEEP) {
      if (process.env.NOWRAP_ONLY && !`sweep ${name}`.startsWith(process.env.NOWRAP_ONLY)) continue;
      await reset(doc);
      await js(`__frameling.showPanel(${JSON.stringify(panel)}); __frameling.store().setUi({ tool: ${JSON.stringify(tool)} }); __frameling.run('select.all'); return true`).catch(() => {});
      let last = null;
      for (let width = 200; width <= 480; width += 10) {
        await js(`__frameling.dock.resizeZone('right', ${width}); return true`);
        await sleep(90);
        // The panel keeps its height on every frame number: one digit, two, three.
        if (name === 'preview frame line') {
          // The preview plays on its own; pause it so it shows the playhead's frame.
          await js(`const b = document.querySelector('.px-preview-play'); if (b?.getAttribute('aria-pressed') === 'true') b.click(); __frameling.store().update('long', (d) => { d.length = 150; }); return true`);
          const hs = [];
          for (const frame of [0, 8, 9, 98, 99, 149]) {
            await js(`__frameling.store().setUi({ frame: ${frame} }); return true`);
            await sleep(60);
            hs.push(await js(`return (${HEIGHT})('.px-preview-info')`));
          }
          if (Math.max(...hs) - Math.min(...hs) > 1) jumps.push({ pass: p.name, view: `sweep ${name}`, text: `at ${width}px the frame line is ${hs.join(', ')} tall on frames 1, 9, 10, 99, 100, 150` });
          await js(`__frameling.store().setUi({ frame: 0 }); return true`);
        }
        const h = await js(`return (${HEIGHT})(${JSON.stringify(SCOPE(panel))})`);
        const r = await js(`return (${FIND})(${JSON.stringify(SCOPE(panel))})`);
        for (const f of r.found || []) findings.push({ pass: p.name, view: `sweep ${name} at ${width}px`, ...f });
        if (last && h > last.h + 2) jumps.push({ pass: p.name, view: `sweep ${name}`, text: `taller (${last.h} to ${h}) when widened from ${last.width} to ${width}px` });
        last = { h, width };
      }
      viewsRun.push(`${p.name}: sweep ${name}`);
    }
  }
  win.destroy();
}

// Each pass closes its window before the next opens; without this Electron quits when the first one closes.
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain);
  const only = process.env.NOWRAP_PASSES?.split(',');
  for (const p of PASSES) {
    if (only && !only.some((o) => p.name.includes(o))) continue;
    const before = findings.length;
    await runPass(p);
    console.log(`${findings.length === before ? 'ok  ' : 'FAIL'} ${p.name}: ${findings.length - before} wrapping or overlapping`);
  }
  // One line per distinct control, with where it wrapped.
  const bySig = new Map();
  for (const f of findings) {
    const e = bySig.get(f.sig) ?? { sig: f.sig, lines: f.lines, views: new Set(), passes: new Set() };
    e.views.add(f.view);
    e.passes.add(f.pass);
    bySig.set(f.sig, e);
  }
  for (const e of [...bySig.values()].sort((a, b) => b.views.size - a.views.size)) {
    console.log(`     ${e.sig}  (${e.sig.startsWith('[overlaps]') ? 'on top of each other' : e.lines === 1 ? 'one line, pokes out' : e.lines + ' lines'}; ${e.views.size} views: ${[...e.views].slice(0, 3).join(', ')}${e.views.size > 3 ? ', ...' : ''}; ${[...e.passes].map((x) => x.replace(/^.*?, /, '')).join(' / ')})`);
  }
  // The room the canvas had, per pass: the smallest it got across the three workspaces.
  for (const p of PASSES) {
    const mine = rooms.filter((r) => r.pass === p.name && r.canvas);
    if (mine.length) console.log(`room ${p.name}: canvas at least ${Math.min(...mine.map((r) => r.canvas.w))} x ${Math.min(...mine.map((r) => r.canvas.h))} of a ${mine[0].win.w} x ${mine[0].win.h} window`);
  }
  for (const j of jumps) console.log(`JUMP ${j.pass}: ${j.view}: ${j.text}`);
  if (missing.length) console.log(`${missing.length} views had nothing on screen to check: ${missing.slice(0, 12).join('; ')}${missing.length > 12 ? '; ...' : ''}`);
  if (squeezed) console.log(`${squeezed} control sightings sat in a box the dock layout squeezed under 120px (the canvas at 200% on a laptop): counted, not failed.`);
  const instances = new Set(findings.map((f) => `${f.pass}|${f.view}|${f.sig}`)).size;
  console.log(`\n${viewsRun.length} views checked: ${bySig.size} distinct wrapping controls (${instances} instances across the views), ${jumps.length} jumps.`);
  if (process.env.NOWRAP_JSON) fs.writeFileSync(process.env.NOWRAP_JSON, JSON.stringify({ views: viewsRun.length, distinct: bySig.size, instances, findings, jumps }, null, 2));
  app.exit(findings.length || jumps.length ? 1 : 0);
}).catch(fail);

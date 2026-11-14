// An artist's journey through Quill's file in the real app: open brand/mascot/mascot.frameling (a scratch copy), see only
// one animation's timeline, move between artboards, draw on a layer, save through the app and rebuild the sheet. Checks
// that the saved file builds the very same sheet as the one that ships, until the drawing is made, and again once it is
// undone. Also takes the pictures of the file before (every clip on one timeline) and after (an artboard per animation).
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/quill-artboards.cjs <outDir> [--theme dark|light] [--file path] [--shots]
//
// --file opens another file (the old one-timeline Quill, for the "before" picture). --shots writes the pictures into outDir.
// Exits non-zero when anything fails. Uses a throwaway profile and a scratch copy, so the repo's file is never changed.
const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const argv = process.argv.slice(2).filter((a) => !a.endsWith('quill-artboards.cjs'));
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i < 0 ? d : (argv[i + 1] ?? true);
};
const outDir = path.resolve(argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1] ?? '').startsWith('--')) ?? 'quill-artboards-out');
const theme = flag('theme', 'dark');
const source = path.resolve(flag('file', path.join(root, 'brand/mascot/mascot.frameling')));
const shots = argv.includes('--shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let win;
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails.push(what);
};
const ev = (js) => win.webContents.executeJavaScript(js, true);
const shot = async (name, rect) => {
  const img = await win.webContents.capturePage(rect);
  fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
};
const mouse = (type, x, y, extra = {}) => win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
const doc = () => ev(`(() => { const d = window.__frameling.store().get().doc; return { name: d.name, length: d.length, clips: d.clips.map((c) => [c.name, c.start, c.end]), boards: (d.artboards || []).map((a) => a.name), active: d.activeArtboard, fps: d.fps }; })()`);

async function start() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'auto');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  await gpu.confirmOrExit(win);
  const prefs = { theme, look: 'cosy', darkTheme: 'midnight-sketchbook', showWelcome: false, onboarded: true, showTips: false };
  await ev(`localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); true`);
  win.setBounds({ x: 0, y: 0, width: 1500, height: 940 });
  win.webContents.reload();
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__frameling && window.__framelingIo)')) break;
    } catch {}
    await sleep(100);
  }
  await sleep(1500);
}

const center = (sel, text) =>
  ev(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})]; const el = ${text ? `els.find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))` : 'els[0]'}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const click = async (p) => {
  mouse('mouseMove', p.x, p.y);
  mouse('mouseDown', p.x, p.y);
  mouse('mouseUp', p.x, p.y);
  await sleep(500);
};

const ROOT_MASCOT = path.join(root, 'brand/mascot/mascot.mjs');
// The same check an artist runs after saving: build the sheet from the file and compare it, frame by frame, with the shipped one.
const rebuild = (file) => {
  const r = cp.spawnSync('node', [ROOT_MASCOT, 'check', file], { encoding: 'utf8', cwd: root });
  return { same: r.status === 0, text: (r.stdout + r.stderr).trim() };
};
const onBoard = (name) => `(() => { const d = window.__frameling.store().get().doc; const a = window.__framelingArtboards.model.contentOf(d, d.artboards.find((x) => x.name === ${JSON.stringify(name)}).id); return a; })()`;
// Which animations show a drawing, over every artboard.
const usedBy = (drawingId) =>
  ev(`(() => { const d = window.__frameling.store().get().doc; const M = window.__framelingArtboards.model; return M.artboardsOf(d).filter((a) => M.contentOf(d, a.id).layers.some((l) => l.cels.some((c) => c.drawingId === ${JSON.stringify(drawingId)}))).map((a) => a.name); })()`);
// The element whose own text is exactly `text` (a layer's name), scrolled into view.
const nameOf = (text) =>
  ev(`(() => { const el = [...document.querySelectorAll('.tl-layer-name, .tl-layer span, [data-layer] span')].find((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(text)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const pick = (sel, text) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))?.scrollIntoView({ block: 'center' })`).then(() => sleep(250)).then(() => center(sel, text));

// Closes Quill's "Switched workspace" note, which covers the timeline, with a real click.
const dismissToasts = async () => {
  for (let i = 0; i < 3; i++) {
    const p = await ev(`(() => { const t = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^Switched workspace/.test(e.textContent)); const b = t && [...t.closest('div').parentElement.querySelectorAll('button')].pop(); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) return;
    await click(p);
  }
};

// The Animate workspace, where the timeline has room.
const animate = async () => {
  const p = await center('button, [role=tab], [role=radio]', 'Animate');
  if (p) await click(p);
  await sleep(800);
};

// Makes the timeline tall by dragging the bar between the canvas and the timeline up, as a hand would.
const tallTimeline = async () => {
  const bar = await ev(`(() => { const t = document.querySelector('.tl-body, [data-panel="timeline"], .tl-root'); const el = t && t.closest('[data-dock-group], .dock-group, section, [class*=dock]'); const r = (el || t)?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y - 4 } : null; })()`);
  console.log('divider', bar);
  if (!bar) return;
  mouse('mouseMove', bar.x, bar.y);
  mouse('mouseDown', bar.x, bar.y);
  for (let i = 1; i <= 8; i++) mouse('mouseMove', bar.x, bar.y - i * 50);
  mouse('mouseUp', bar.x, bar.y - 400);
  await sleep(600);
};

async function main() {
  await start();
  const mine = path.join(outDir, 'quill.frameling');
  fs.copyFileSync(source, mine);
  await ev(`window.__framelingIo.openPath(${JSON.stringify(mine)})`);
  await sleep(2500);
  let d = await doc();
  if (argv.includes('--before') || argv.includes('--after')) {
    // The pictures of an animation being edited: before (every clip on one timeline) and after (its own artboard).
    const clip = flag('clip', 'oops');
    const at = d.clips.find((c) => c[0] === clip);
    await animate();
    await tallTimeline();
    await dismissToasts();
    if (argv.includes('--before')) {
      check(d.boards.length === 0 && d.clips.length === 13, `before: ${d.boards.length} artboards, ${d.clips.length} clips`);
      await ev(`window.__frameling.store().setUi({ frame: ${at[1]} })`);
      await ev(`window.__frameling.run('timeline.zoomFit')`);
      await sleep(500);
      // Scroll so the animation's first frame is a third of the way across: what comes before it is on the same timeline.
      await ev(`(() => { const el = document.querySelector('.tl-body'); el.scrollLeft = Math.max(0, ${at[1]} * 5 - el.clientWidth * 0.3); })()`);
    } else {
      check(d.boards.length === 13, `after: ${d.boards.length} artboards`);
      await ev(`window.__framelingArtboards.ops.goToArtboard(window.__frameling.store().get().doc.artboards.find((a) => a.name === ${JSON.stringify(clip)}).id)`);
      await ev(`window.__frameling.run('artboards.zoomTo')`);
      await sleep(600);
      await ev(`window.__frameling.store().setUi({ frame: 0 })`);
      await ev(`window.__frameling.run('timeline.zoomFit')`);
    }
    await sleep(700);
    console.log(JSON.stringify(await doc()));
    await shot(argv.includes('--before') ? 'before' : 'after');
    app.exit(fails.length ? 1 : 0);
    return;
  }

  // 1. Opening the file: thirteen artboards, one per animation, the first one open with only its own timeline.
  check(d.boards.length === 13 && d.active === 'artboard-idle', `opens on ${d.boards.length} artboards, "${d.active}" open`);
  check(d.length === 419 && d.clips.length === 1 && d.clips[0][0] === 'idle', `the timeline is idle's alone: ${d.length} frames, clips ${JSON.stringify(d.clips)}`);
  await shot('opened');

  // 2. Opened and saved with nothing drawn: the app's own writer keeps every tile, hold and pixel.
  check(await ev(`window.__framelingIo.saveDocument()`), 'saved through the app');
  let r = rebuild(mine);
  check(r.same, 'opened and saved through the app, the sheet is still the one that ships. ' + r.text.split('\n')[0]);

  // 3. Pick another animation's artboard: only its timeline.
  const row = await pick('[data-artboard]', 'wake');
  await click(row);
  d = await doc();
  check(d.active === 'artboard-wake' && d.length === 136 && d.clips.length === 1 && d.clips[0][0] === 'wake', `"wake" open: ${d.length} frames, clips ${JSON.stringify(d.clips)}`);
  await ev(`window.__frameling.run('timeline.zoomFit')`);
  await sleep(300);
  await shot('wake-open');
  const dirty = await ev(`window.__frameling.store().get().ui.dirty`);
  console.log('note: switching artboards left the file dirty =', dirty);

  // 4. Zoom to it, pick the Eyes layer and a frame, draw.
  await ev(`window.__frameling.store().setUi({ frame: 40 })`);
  await ev(`[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Dismiss' || b.textContent.trim() === '' && b.closest('[role=status]'))?.click()`);
  await sleep(300);
  const eyes = await nameOf('Eyes');
  console.log('eyes row', eyes);
  if (eyes) await click(eyes);
  console.log('layer', await ev(`window.__frameling.store().get().ui.activeLayerId`));
  // Zoom to the artboard so a pixel is big enough to hit.
  await ev(`window.__frameling.run('artboards.zoomTo')`);
  await sleep(800);
  const cel = () => ev(`(() => { const S = window.__frameling.store().get(); const l = S.doc.layers.find((x) => x.id === S.ui.activeLayerId); const c = l.cels.find((k) => k.start <= S.ui.frame && S.ui.frame < k.start + k.length); const d = S.doc.drawings[c.drawingId]; return { id: c.drawingId, ink: Array.from(d.pixels).filter((v, i) => i % 4 === 3 && v).length, sum: Array.from(d.pixels).reduce((t, v, i) => (t * 31 + v + i) % 1000003, 7) }; })()`);
  const eyesBefore = await cel();
  const sharedWith = await usedBy(eyesBefore.id);
  console.log('the eyes drawing on frame 41 of wake is', eyesBefore.id, 'and is shown by', sharedWith.join(', '));

  // 5. Draw one pixel with the pencil, as a hand would.
  const at = { x: 830, y: 446 };
  mouse('mouseMove', at.x, at.y);
  mouse('mouseDown', at.x, at.y);
  mouse('mouseMove', at.x + 1, at.y);
  mouse('mouseUp', at.x + 1, at.y);
  await sleep(500);
  const eyesAfter = await cel();
  check(eyesAfter.ink > eyesBefore.ink, `drew on the Eyes layer: ${eyesBefore.ink} painted pixels became ${eyesAfter.ink}`);
  check(eyesAfter.id === eyesBefore.id, 'the same drawing took the pixel');
  await shot('drawn');

  // 6. Save through the app and rebuild: the sheet now differs, and only where that drawing is shown.
  check(await ev(`window.__framelingIo.saveDocument()`), 'saved through the app');
  r = rebuild(mine);
  console.log(r.text);
  check(!r.same, 'the sheet changed once a pixel was drawn (so the check can see a change)');
  const hit = new Set([...r.text.matchAll(/^  "([^"]+)"/gm)].map((m) => m[1]));
  console.log('animations that changed:', [...hit].join(', '), ' animations that show that drawing:', sharedWith.join(', '));
  check([...hit].every((n) => sharedWith.includes(n)), 'only animations that show that drawing changed');
  check(hit.has('wake'), 'the animation that was drawn on changed');

  // 7. Take it back, save: identical to the shipped sheet again.
  await ev(`window.__frameling.run('edit.undo')`);
  await sleep(400);
  const back = await cel();
  check(back.sum === eyesBefore.sum, 'undo took the pixel back');
  check(await ev(`window.__framelingIo.saveDocument()`), 'saved through the app again');
  r = rebuild(mine);
  check(r.same, 'after the undo and a save, the sheet is the one that ships again. ' + r.text.split('\n')[0]);
  await shot('after-undo');

  // 8. A part drawn once and shown in many animations (Body): painting it on one artboard paints it on all. Frameling gives
  // no sign of this, so it is written up as a gap rather than fixed here. Told, not failed.
  await click(await pick('[data-artboard]', 'idle'));
  await ev(`window.__frameling.run('artboards.zoomTo')`);
  await sleep(600);
  await ev(`window.__frameling.store().setUi({ frame: 0 })`);
  const body = await nameOf('Body');
  if (body) await click(body);
  await ev(`window.__frameling.store().setUi({ activeLayerId: 'layer-body' })`);
  const bodyBefore = await cel();
  const bodyUsers = await usedBy(bodyBefore.id);
  console.log(`the Body drawing on frame 1 of idle is ${bodyBefore.id} and is shown by ${bodyUsers.length} animations: ${bodyUsers.join(', ')}`);
  await shot('shared-part');
  mouse('mouseMove', 800, 520);
  mouse('mouseDown', 800, 520);
  mouse('mouseUp', 801, 520);
  await sleep(500);
  check((await cel()).sum !== bodyBefore.sum, 'drew on the Body layer');
  await ev(`window.__framelingIo.saveDocument()`);
  r = rebuild(mine);
  const hit2 = [...new Set([...r.text.matchAll(/^  "([^"]+)"/gm)].map((m) => m[1]))];
  console.log(`one pixel on Body in "idle" changed ${hit2.length} animations: ${hit2.join(', ')}`);
  check(hit2.length > 1, 'a shared drawing changes every animation that shows it (known gap, see the report)');
  await ev(`window.__frameling.run('edit.undo')`);
  await sleep(400);
  await ev(`window.__framelingIo.saveDocument()`);
  check(rebuild(mine).same, 'and undone, the sheet is the one that ships again');
  console.log(fails.length ? `FAILED: ${fails.join('; ')}` : 'every check held');
  app.exit(fails.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  app.exit(1);
});

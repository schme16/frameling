// What the capture view (the second window) costs the drawing window while you are drawing, and how live the capture view is,
// in the real app: both windows, the real message port, real mouse events. Alternates the window closed and open so the two are
// comparable on a busy machine. For each tool, on a vector document and on a pixel document:
//
//   cost:  the drawing window's main-thread time over the stroke (DevTools "TaskDuration"), its frame gaps, and what the
//          second window painted meanwhile (closed vs open; the difference is what drawing pays for the window)
//   live:  with the window open, how much of the finished picture it already shows 25, 50 and 75 percent of the way through
//          the stroke (a screenshot of the second window against its picture before the stroke)
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/capture-live.cjs [--reps 5] [--only pencil,rect] [--out file.json]
//   POPOUT_ROOT=<another checkout> ... measures that checkout's dist/ (the before, say) with this script.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { boot, popReady, sleep, MKDOC } = require('../e2e/popout-lib.cjs');
const { docScript, PATHS } = require('./capture-live-lib.cjs');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const REPS = Number(arg('--reps', 5));
const only = arg('--only', '')?.split(',').filter(Boolean);
const outFile = arg('--out', null);
const MOVES = Number(arg('--moves', 150));
const GAP = Number(arg('--gap', 8));

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const r1 = (v) => (v === null ? null : Math.round(v * 10) / 10);

const CASES = [
  { name: 'brush', docs: ['vector', 'pixel'], tool: 'brush', path: 'curve' },
  { name: 'pencil', docs: ['pixel'], tool: 'pencil', path: 'curve' },
  { name: 'eraser', docs: ['vector', 'pixel'], tool: 'eraser', path: 'curve' },
  { name: 'rect', docs: ['vector', 'pixel'], tool: 'rect', path: 'drag' },
  { name: 'line', docs: ['pixel'], tool: 'line', path: 'drag' },
  { name: 'ellipse', docs: ['vector'], tool: 'ellipse', path: 'drag' },
  { name: 'star', docs: ['vector'], tool: 'star', path: 'drag' },
  { name: 'move', docs: ['vector', 'pixel'], tool: 'transform', path: 'move', selectAll: true },
];

(async () => {
  const h = await boot({ theme: 'dark', width: 1000, height: 800, choices: { 'popout.captureBackground': 'green', 'popout.captureCursor': 'hide', 'popout.captureSize': 'free' } });
  const { js, main, wc } = h;
  await js(MKDOC);
  const send = (e) => wc.sendInputEvent(e);
  const box = () => js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('Performance.enable');
  const metrics = async () => Object.fromEntries((await wc.debugger.sendCommand('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

  const loadDoc = async (kind) => {
    await js(docScript(kind));
    await js('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    await sleep(300);
  };
  const setOpen = async (open) => {
    const w = h.popWin();
    if (open && !w) {
      await js(`window.__frameling.run('capture.toggle')`);
      const pw = await popReady(h);
      pw.setBounds({ x: 1000, y: 0, width: 600, height: 700 });
      await sleep(600);
    } else if (!open && w) {
      w.close();
      await sleep(500);
    }
  };
  const setTool = async (c) => {
    await js(`window.__frameling.store().setUi({ tool: '${c.tool}', selection: [] })`);
    if (c.selectAll) await js(`window.__frameling.run('select.all')`);
    await sleep(150);
  };
  const grab = async (w) => {
    const img = await w.webContents.capturePage();
    return img.resize({ width: 300 }).toBitmap();
  };
  const differing = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
    return n;
  };

  // Plays the stroke. `at` is called after the given fractions of the moves (to look at the second window mid-stroke).
  async function stroke(c, b, checkpoints = []) {
    const pts = PATHS[c.path](b, MOVES);
    send({ type: 'mouseMove', x: pts[0].x, y: pts[0].y });
    await sleep(40);
    send({ type: 'mouseDown', x: pts[0].x, y: pts[0].y, button: 'left', clickCount: 1 });
    const seen = [];
    for (let i = 1; i < pts.length; i++) {
      send({ type: 'mouseMove', x: pts[i].x, y: pts[i].y, modifiers: ['leftButtonDown'] });
      await sleep(GAP);
      for (const cp of checkpoints) if (i === Math.floor(pts.length * cp.at)) seen.push(await cp.fn(cp.at));
    }
    send({ type: 'mouseUp', x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, button: 'left', clickCount: 1 });
    return seen;
  }

  const out = { env: { reps: REPS, moves: MOVES, gapMs: GAP, root: process.env.POPOUT_ROOT || 'this checkout', electron: process.versions.electron, when: new Date().toISOString() }, cases: [] };

  for (const kind of ['vector', 'pixel']) {
    await loadDoc(kind);
    for (const c of CASES) {
      if (!c.docs.includes(kind) || (only.length && !only.includes(c.name) && !only.includes(kind + ':' + c.name))) continue;
      process.stdout.write(`${kind} ${c.name} ... `);
      const rows = { closed: [], open: [] };
      const live = [];
      for (let rep = -1; rep < REPS; rep++) {
        for (const open of [false, true]) {
          await setOpen(open);
          await loadDoc(kind);
          await setTool(c);
          main.focus();
          await js('window.__doc0 = window.__frameling.store().get().doc; true');
          const b = await box();
          // Frame gaps in the drawing window over the stroke.
          await js(`window.__gaps = []; window.__last = 0; window.__stop = false; (function l(t) { if (window.__last) window.__gaps.push(t - window.__last); window.__last = t; if (!window.__stop) requestAnimationFrame(l); })(performance.now())`);
          let popBefore = 0;
          if (open) popBefore = await js('__popout.paints', h.popWin());
          const m0 = await metrics();
          const t0 = Date.now();
          await stroke(c, b);
          const m1 = await metrics();
          const wall = Date.now() - t0;
          await js('window.__stop = true');
          const gaps = await js('window.__gaps');
          const row = { taskMs: (m1.TaskDuration - m0.TaskDuration) * 1000, scriptMs: (m1.ScriptDuration - m0.ScriptDuration) * 1000, wallMs: wall, gapP95: [...gaps].sort((x, y) => x - y)[Math.floor(gaps.length * 0.95)] || 0, gapMax: Math.max(0, ...gaps) };
          row.edited = await js('window.__frameling.store().get().doc !== window.__doc0');
          if (!row.edited && !c.selectAll) console.log(`  (no edit made: ${c.name} on ${kind}, open=${open})`);
          if (open) row.popPaints = (await js('__popout.paints', h.popWin())) - popBefore;
          // The first round only warms things up (compiling, caches) and is not counted.
          if (rep >= 0) rows[open ? 'open' : 'closed'].push(row);
          if (process.env.CL_DEBUG) console.log(JSON.stringify(row));
          await sleep(300);
        }
      }
      // How live the open window is: a separate pass, because looking at the second window costs the drawing window too.
      await setOpen(true);
      for (let rep = 0; rep < Math.min(3, REPS); rep++) {
        await loadDoc(kind);
        await setTool(c);
        const pw = h.popWin();
        main.focus();
        await sleep(1500);
        const base = await grab(pw);
        const b = await box();
        const seen = await stroke(c, b, [25, 50, 75].map((p) => ({ at: p / 100, fn: async () => differing(await grab(pw), base) })));
        await sleep(1200);
        if (process.env.CL_DEBUG) console.log('state', JSON.stringify(await js(`(() => { const u = window.__frameling.store().get().ui; return { tool: u.tool, sel: u.selection, layer: u.activeLayerId }; })()`)));
        const fin = await grab(pw);
        const final = differing(fin, base);
        if (process.env.CL_DEBUG) require('node:fs').writeFileSync('/tmp/claude-1000/pop-final.png', (await pw.webContents.capturePage()).toPNG()), require('node:fs').writeFileSync('/tmp/claude-1000/main-final.png', (await main.webContents.capturePage()).toPNG());
        if (process.env.CL_DEBUG) console.log('live', JSON.stringify({ seen, final, paints: await js('__popout.paints', pw) }));
        live.push({ seen, final });
      }
      const med = (k, which) => r1(median(rows[which].map((r) => r[k])));
      const row = {
        doc: kind,
        tool: c.name,
        closed: { taskMs: med('taskMs', 'closed'), scriptMs: med('scriptMs', 'closed'), gapP95: med('gapP95', 'closed'), gapMax: med('gapMax', 'closed') },
        open: { taskMs: med('taskMs', 'open'), scriptMs: med('scriptMs', 'open'), gapP95: med('gapP95', 'open'), gapMax: med('gapMax', 'open'), popPaints: med('popPaints', 'open') },
        // Share of the finished picture's changed pixels the second window already shows a quarter, half and three quarters of the way through.
        liveShare: [0, 1, 2].map((i) => r1(median(live.map((l) => (l.final ? Math.min(1, l.seen[i] / l.final) : 0))) * 100)),
        liveFinal: median(live.map((l) => l.final)),
      };
      row.costMs = r1(row.open.taskMs - row.closed.taskMs);
      out.cases.push(row);
      console.log(`task ${row.closed.taskMs} -> ${row.open.taskMs} ms (${row.costMs >= 0 ? '+' : ''}${row.costMs}), live share at 25/50/75%: ${row.liveShare.join('/')}%`);
    }
  }
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n' + [pad('doc', 7), pad('tool', 8), pad('task closed', 12), pad('task open', 10), pad('cost', 7), pad('gap p95 c/o', 13), pad('gap max c/o', 13), 'popout paints', ' live 25/50/75%'].join(' '));
  for (const r of out.cases) console.log([pad(r.doc, 7), pad(r.tool, 8), pad(r.closed.taskMs, 12), pad(r.open.taskMs, 10), pad(r.costMs, 7), pad(`${r.closed.gapP95}/${r.open.gapP95}`, 13), pad(`${r.closed.gapMax}/${r.open.gapMax}`, 13), pad(r.open.popPaints, 13), ' ' + r.liveShare.join('/')].join(' '));
  if (outFile) {
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
    console.log('wrote ' + outFile);
  }
  app.exit(0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});

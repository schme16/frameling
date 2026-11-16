// Frame rate with and without the second window open, in the real app (both windows, the real message port), in one run so
// the two are comparable even on a busy machine. Playback of a heavy drawing, alternating closed / open / closed / open...
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/popout.cjs [--rounds 3] [--out file.json]
//
// For each round it plays 8 seconds and reports, for the drawing window, the frames it painted (and how many it skipped),
// the gap between paints and the time one paint takes; for the second window, how many pictures it painted and how long each took.
// What it means is in scripts/perf/README.md ("The second window"). Numbers from a shared machine are rough: compare the
// rows of one run with each other, not with another day's.
const { app } = require('electron');
const fs = require('node:fs');
const { boot, popReady, sleep, MKDOC } = require('../e2e/popout-lib.cjs');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const rounds = Number(arg('--rounds', 3));
const outFile = arg('--out', null);
const SECONDS = Number(arg('--seconds', 8));

const stats = (xs) => {
  if (!xs.length) return { n: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const r = (v) => Math.round(v * 100) / 100;
  return { n: s.length, mean: r(s.reduce((a, b) => a + b, 0) / s.length), p50: r(q(0.5)), p95: r(q(0.95)), max: r(s[s.length - 1]) };
};
const deltas = (ts) => ts.slice(1).map((t, i) => t - ts[i]);

(async () => {
  const h = await boot({ theme: 'dark', width: 1000, height: 800 });
  const { js, main } = h;
  await js(MKDOC);
  const loadDoc = async (fps) => {
    await js(`(() => { const f = window.__frameling; f.store().load(window.__mkDoc({ frames: 240, layers: 5, strokesPer: 50, pts: 10, fps: ${fps} })); f.store().setUi({ tool: 'brush', playing: false, frame: 0, onion: { ...f.store().get().ui.onion, enabled: false } }); return true; })()`);
    await js('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    await sleep(300);
  };
  // A control: a plain second window with a still page. If it costs the drawing window as much as the real one does, the cost is
  // the machine drawing two windows (a software display), not the work the second window does.
  let blank = null;
  const setBlank = async (on, animated = false) => {
    if (on && !blank) {
      blank = new h.electron.BrowserWindow({ x: 1000, y: 0, width: 600, height: 800, show: true, frame: false, webPreferences: { backgroundThrottling: false } });
      // The animated one changes its whole picture every screen frame and does nothing else: the cheapest second window that is as busy as ours.
      const page = animated ? '<body style="margin:0"><script>let n=0;(function f(){document.body.style.background="hsl("+(n++*7%360)+",40%,40%)";requestAnimationFrame(f)})()</script></body>' : '<body style="margin:0;background:%23445566">still</body>';
      await blank.loadURL('data:text/html,' + encodeURIComponent(page));
      await sleep(500);
    } else if (!on && blank) {
      blank.destroy();
      blank = null;
      await sleep(300);
    }
  };
  const setOpen = async (open) => {
    const w = h.popWin();
    if (open && !w) {
      await js(`window.__frameling.run('popout.toggle')`);
      const pw = await popReady(h);
      pw.setBounds({ x: 1000, y: 0, width: 600, height: 800 });
      await sleep(500);
    } else if (!open && w) {
      w.close();
      await sleep(500);
    }
  };
  await js(`window.__raf = null; window.__startRaf = () => { const ts = []; const loop = (t) => { ts.push(t); window.__raf.id = requestAnimationFrame(loop); }; window.__raf = { ts, id: requestAnimationFrame(loop) }; }; window.__stopRaf = () => { cancelAnimationFrame(window.__raf.id); const o = window.__raf.ts; window.__raf = null; return o; }; true`);

  const result = { env: { engine: 'see the first line of the log', rounds, seconds: SECONDS }, runs: [] };
  async function once(fps, open, still = false, paused = false) {
    await setBlank(still === 'animated' || still === true, still === 'animated');
    await setOpen(open);
    if (open) await js(`__popout.paused = ${paused}`, h.popWin());
    await js(`window.__frameling.store().setUi({ frame: 0, playing: false })`);
    await sleep(300);
    // The second window's pictures are counted over the same seconds.
    if (open) await js(`(() => { __popout.paints = 0; __popout.paintMsTotal = 0; __popout.trace = []; __popout.record = true; return true; })()`, h.popWin());
    await js('window.__framelingPerf.reset(); window.__startRaf()');
    const t0 = Date.now();
    await js(`window.__frameling.run('timeline.play')`);
    await sleep(SECONDS * 1000);
    await js(`window.__frameling.run('timeline.play')`);
    const secs = (Date.now() - t0) / 1000;
    const raf = await js('window.__stopRaf()');
    const bag = await js(`(() => { const b = window.__framelingPerf; return { painted: b.painted, mainMs: b.mainMs }; })()`);
    const dt = deltas(bag.painted.map((p) => p.t));
    const skipped = bag.painted.slice(1).reduce((n, p, i) => n + Math.max(0, p.frame - bag.painted[i].frame - 1), 0);
    const row = {
      fps,
      secondWindow: open ? (paused ? 'open, messages only (never paints)' : 'open') : still === 'animated' ? 'animated control window' : still ? 'still control window' : 'closed',
      seconds: Math.round(secs * 10) / 10,
      drawingWindow: {
        framesPainted: bag.painted.length,
        paintedPerSecond: Math.round((bag.painted.length / secs) * 10) / 10,
        framesSkipped: skipped,
        paintGapMs: stats(dt),
        paintMs: stats(bag.mainMs),
        rafGapMs: stats(deltas(raf)),
      },
    };
    if (open) {
      const pop = await js(`(() => { __popout.record = false; return { paints: __popout.paints, trace: __popout.trace }; })()`, h.popWin());
      const frames = new Set(pop.trace.map((x) => x.frame)).size;
      row.pictureWindow = {
        picturesPainted: pop.paints,
        paintedPerSecond: Math.round((pop.paints / secs) * 10) / 10,
        distinctFramesShown: frames,
        paintMs: stats(pop.trace.map((x) => x.ms)),
        paintGapMs: stats(deltas(pop.trace.map((x) => x.t))),
      };
    }
    result.runs.push(row);
    console.log(`${fps} fps doc, second window ${open ? (paused ? 'OPEN msgs only' : 'OPEN  ') : still === 'animated' ? 'ANIMATED' : still ? 'STILL ' : 'closed'}: drawing window ${row.drawingWindow.paintedPerSecond}/s painted, ${skipped} skipped, paint ${row.drawingWindow.paintMs.mean} ms mean / ${row.drawingWindow.paintMs.p95} p95` + (open ? `; picture window ${row.pictureWindow.paintedPerSecond}/s, ${row.pictureWindow.paintMs.mean} ms mean` : ''));
  }

  for (const fps of [24, 60]) {
    await loadDoc(fps);
    // One lap to warm the caches before anything is counted.
    await setOpen(false);
    await js(`window.__frameling.run('timeline.play')`);
    await sleep(4500);
    await js(`window.__frameling.run('timeline.play')`);
    for (let i = 0; i < rounds; i++) {
      await once(fps, false);
      await once(fps, false, 'animated');
      await once(fps, true, false, true);
      await once(fps, true);
    }
  }
  // The middle value of each condition across the rounds (one slow round from a busy machine does not decide it).
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  result.summary = [];
  for (const fps of [24, 60]) {
    for (const cond of ['closed', 'animated control window', 'open, messages only (never paints)', 'open']) {
      const rows = result.runs.filter((r) => r.fps === fps && r.secondWindow === cond);
      const row = {
        fps, secondWindow: cond, rounds: rows.length,
        drawingPaintedPerSecond: median(rows.map((r) => r.drawingWindow.paintedPerSecond)),
        drawingFramesSkipped: median(rows.map((r) => r.drawingWindow.framesSkipped)),
        drawingPaintMsMean: median(rows.map((r) => r.drawingWindow.paintMs.mean)),
        drawingPaintGapP95Ms: median(rows.map((r) => r.drawingWindow.paintGapMs.p95)),
        ...(cond.startsWith('open') ? { pictureWindowPaintedPerSecond: median(rows.map((r) => r.pictureWindow.paintedPerSecond)), pictureWindowPaintMsMean: median(rows.map((r) => r.pictureWindow.paintMs.mean)) } : {}),
      };
      result.summary.push(row);
      console.log('median', JSON.stringify(row));
    }
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  app.exit(0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});

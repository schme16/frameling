// Lines two run.cjs result files up: node scripts/perf/compare.cjs before.json after.json
const fs = require('node:fs');

const [aFile, bFile] = process.argv.slice(2);
if (!aFile || !bFile) {
  console.error('usage: node scripts/perf/compare.cjs before.json after.json');
  process.exit(1);
}
const a = JSON.parse(fs.readFileSync(aFile, 'utf8'));
const b = JSON.parse(fs.readFileSync(bFile, 'utf8'));
const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

// [label, path, lower is better]
const rows = [
  ['draw 2000pt, 300 strokes: latency p50 (ms)', 'draw.strokes300.latencyAll.p50'],
  ['  latency p95', 'draw.strokes300.latencyAll.p95'],
  ['  latency, last quarter of stroke p95', 'draw.strokes300.latencyLastQuarter.p95'],
  ['  overlay draw JS p95', 'draw.strokes300.overlayDrawMs.p95'],
  ['  overlay draw JS, last quarter p95', 'draw.strokes300.overlayDrawMsLastQuarter.p95'],
  ['  frame delta p99', 'draw.strokes300.rafDelta.p99'],
  ['  frame delta max', 'draw.strokes300.rafDelta.max'],
  ['  repaint on pen lift (ms)', 'draw.strokes300.mainDrawMsMax'],
  ['  repaint on pen lift, 3000 strokes (ms)', 'draw.strokes3000.mainDrawMsMax'],
  ['  steady one-event-per-frame latency p95', 'draw.steadyLatencyStrokes300.p95'],
  ['playback 24fps, onion off: paint interval p95', 'playback.onionOff.paintIntervalMs.p95'],
  ['  late paints', 'playback.onionOff.latePaints'],
  ['  frames skipped', 'playback.onionOff.framesSkipped'],
  ['  paint JS p95', 'playback.onionOff.paintMs.p95'],
  ['  paint JS max', 'playback.onionOff.paintMs.max'],
  ['  long tasks', 'playback.onionOff.longTasks'],
  ['  bitmap builds', 'playback.onionOff.bitmapBuilds'],
  ['playback, onion on: paint interval p95', 'playback.onionOn.paintIntervalMs.p95'],
  ['  late paints', 'playback.onionOn.latePaints'],
  ['  frames skipped', 'playback.onionOn.framesSkipped'],
  ['scrub 60 frames with onion: paint JS p95', 'playback.scrubWithOnion60.paintMs.p95'],
  ['  bitmap builds', 'playback.scrubWithOnion60.bitmapBuilds'],
  ['step through 60 frames, paused: paint JS p95', 'playback.stepPaused60.paintMs.p95'],
  ['  paint JS max', 'playback.stepPaused60.paintMs.max'],
  ['playhead move, store listeners + React (ms) p95', 'playback.storeFrameUpdateMs.p95'],
  ['templates: bouncing ball first paint (ms)', 'templates.bouncing-ball.firstPaintMs'],
  ['  flour sack first paint (ms)', 'templates.flour-sack-hop.firstPaintMs'],
  ['  hero sprites first paint (ms)', 'templates.hero-sprites.firstPaintMs'],
  ['zoom, 300 strokes: frame delta p95', 'zoompan.strokes300_zoom.rafDelta.p95'],
  ['  main draw p95', 'zoompan.strokes300_zoom.mainDrawMs.p95'],
  ['zoom, 5 layers: frame delta p95', 'zoompan.layers5x50_zoom.rafDelta.p95'],
  ['  main draw p95', 'zoompan.layers5x50_zoom.mainDrawMs.p95'],
  ['  bitmap builds', 'zoompan.layers5x50_zoom.bitmapBuilds'],
  ['pan, 5 layers: frame delta p95', 'zoompan.layers5x50_pan.rafDelta.p95'],
  ['pan at 400%, 5 layers: frame delta p95', 'zoompan.layers5x50_pan400.rafDelta.p95'],
  ['  main draw p95', 'zoompan.layers5x50_pan400.mainDrawMs.p95'],
  ['memory: heap growth after 200 strokes, 100 undos (MB)', 'memory.growthMB'],
];

const w = Math.max(...rows.map((r) => r[0].length));
console.log(`${'metric'.padEnd(w)}  ${String(a.env?.label ?? 'a').padStart(10)}  ${String(b.env?.label ?? 'b').padStart(10)}  change`);
for (const [label, path] of rows) {
  const x = get(a, path);
  const y = get(b, path);
  if (x === undefined && y === undefined) continue;
  const f = (v) => (v === undefined ? '-' : String(v));
  const pct = typeof x === 'number' && typeof y === 'number' && x !== 0 ? `${y < x ? '' : '+'}${Math.round(((y - x) / x) * 100)}%` : '';
  console.log(`${label.padEnd(w)}  ${f(x).padStart(10)}  ${f(y).padStart(10)}  ${pct}`);
}

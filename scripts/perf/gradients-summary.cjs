// Reads one or more gradients.cjs result files and prints the table: for each case, the least disturbed (lowest) time over
// all the runs given, and the ratio to radial taken from the same minimums.
//
//   node scripts/perf/gradients-summary.cjs scripts/perf/results/gradients-before-1.json scripts/perf/results/gradients-before-3.json
const fs = require('node:fs');
const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/perf/gradients-summary.cjs <result.json> [more.json ...]');
  process.exit(1);
}
const runs = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
console.log(`${runs.length} run(s); load average before each: ${runs.map((r) => r.env.loadAvgBefore.join('/')).join(' | ')}`);
const pad = (v, n) => String(v).padStart(n);
const min = (xs) => Math.min(...xs);

console.log('\nrender: ms to draw one frame (minimum over all reps and runs), ratio to radial in brackets');
console.log(`${pad('canvas', 10)} ${pad('shapes', 6)} ${pad('radial', 7)} ${pad('angular', 14)} ${pad('diamond', 14)} ${pad('diamond line', 16)}`);
const renders = runs.map((r) => r.render).filter(Array.isArray);
for (const row of renders[0] || []) {
  const same = renders.map((rs) => rs.find((x) => x.canvas === row.canvas && x.shapes === row.shapes)).filter(Boolean);
  const m = (k) => min(same.map((x) => x[k].min));
  const rad = m('radial');
  const cell = (k) => `${pad(m(k).toFixed(2), 6)} (${(m(k) / rad).toFixed(1)}x)`;
  console.log(`${pad(row.canvas, 10)} ${pad(row.shapes, 6)} ${pad(rad.toFixed(2), 7)} ${cell('angular')} ${cell('diamond')} ${cell('diamondline')}`);
}

console.log('\nlive: playback at 24 fps, a different drawing on every frame. Build = main thread ms to paint one drawing (lowest over runs).');
console.log('late = frames that took over 2.5 display frames; skipped = playback frames never shown (lowest over runs)');
console.log(`${pad('canvas', 10)} ${pad('shapes', 6)}   build ms radial/angular/diamond   late r/a/d   skipped r/a/d`);
const lives = runs.map((r) => r.live).filter(Array.isArray);
for (const row of lives[0] || []) {
  const same = lives.map((rs) => rs.find((x) => x.canvas === row.canvas && x.shapes === row.shapes)).filter(Boolean);
  const m = (k, f) => min(same.map((x) => f(x[k])));
  const trio = (f) => ['radial', 'angular', 'diamond'].map((k) => m(k, f));
  console.log(
    `${pad(row.canvas, 10)} ${pad(row.shapes, 6)}   ${trio((x) => x.buildPaintMsEach).join(' / ')}   ${trio((x) => x.lateFrames).join('/')}   ${trio((x) => x.framesSkipped).join('/')}`,
  );
}

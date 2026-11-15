// Lines two sweep.cjs result files up: busy time per document and action, before and after. Actions that also report
// the page's wall clock (the saves, which wait on workers) get a second table for that.
//
//   node scripts/perf/compare-sweep.cjs before.json after.json
const fs = require('node:fs');

const [a, b] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
if (!a || !b) { console.error('usage: node scripts/perf/compare-sweep.cjs before.json after.json'); process.exit(1); }
const at = new Map(b.results.map((r) => [r.doc + '/' + r.action, r]));
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('document', 16) + pad('action', 17) + pad('before ms', 11) + pad('after ms', 11) + 'change');
for (const r of a.results) {
  const o = at.get(r.doc + '/' + r.action);
  if (r.error || !o || o.error) { console.log(pad(r.doc, 16) + pad(r.action, 17) + 'n/a'); continue; }
  const pct = r.busyMs ? Math.round(((o.busyMs - r.busyMs) / r.busyMs) * 100) : 0;
  console.log(pad(r.doc, 16) + pad(r.action, 17) + pad(r.busyMs.toFixed(0), 11) + pad(o.busyMs.toFixed(0), 11) + (pct > 0 ? '+' : '') + pct + '%');
}

// Wall clock (the whole awaited call, worker time included), for the actions that report it.
const walled = a.results.filter((r) => !r.error && r.wallMs !== undefined);
if (walled.length) {
  console.log('\n' + pad('document', 16) + pad('action', 17) + pad('before wall', 13) + pad('after wall', 13) + 'change');
  for (const r of walled) {
    const o = at.get(r.doc + '/' + r.action);
    if (!o || o.error || o.wallMs === undefined) { console.log(pad(r.doc, 16) + pad(r.action, 17) + 'n/a'); continue; }
    const pct = r.wallMs ? Math.round(((o.wallMs - r.wallMs) / r.wallMs) * 100) : 0;
    console.log(pad(r.doc, 16) + pad(r.action, 17) + pad(r.wallMs.toFixed(0), 13) + pad(o.wallMs.toFixed(0), 13) + (pct > 0 ? '+' : '') + pct + '%');
  }
}

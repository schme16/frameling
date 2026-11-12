// Summarises a Chromium trace written by launch.cjs (STARTUP_TRACE=file): the renderer main thread from navigation
// to the frameling:interactive mark. node scripts/perf/tracesum.cjs trace.json
const raw = require('node:fs').readFileSync(process.argv[2]);
const t = JSON.parse(raw.toString('utf8'));
const events = t.traceEvents || t;
const inter = events.filter((e) => e.name === 'frameling:interactive').pop();
const pid = inter.pid;
const mainT = inter.tid;
// The trace starts just before the page is asked to load, so its first event is the start.
const t0 = Math.min(...events.filter((e) => e.pid === pid && e.ts > 0).map((e) => e.ts));
const mine = events.filter((e) => e.pid === pid && e.tid === mainT && e.ph === 'X' && e.ts >= t0 && e.ts <= inter.ts + 1).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
console.log(`navigationStart to interactive ${((inter.ts - t0) / 1000).toFixed(0)} ms`);
const ms = (u) => (u / 1000).toFixed(1).padStart(6);
const by = new Map();
for (const e of mine) if (!/^(RunTask|V8\.GC)/.test(e.name)) { const k = e.name; const v = by.get(k) || [0, 0]; v[0] += e.dur; v[1]++; by.set(k, v); }
console.log('\nevents by name (inclusive, nested, so do not add up)');
for (const [k, v] of [...by].sort((a, b) => b[1][0] - a[1][0]).slice(0, 25)) console.log(ms(v[0]), `x${v[1]}`.padEnd(5), k);
console.log('\ntimeline (events over 2 ms)');
for (const e of mine.filter((e) => e.dur > 2000 && !/^RunTask/.test(e.name))) console.log(((e.ts - t0) / 1000).toFixed(0).padStart(5), ms(e.dur), e.name, e.args?.data?.url?.split('/').pop() ?? '', e.args?.data?.functionName ?? '');

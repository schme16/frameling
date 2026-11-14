// Start-up trace: where the main thread's time goes between navigation and the first interactive frame, by kind of
// work (fetch, compile, evaluate, style, layout, paint...). Run on a build:
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/perf/starttrace.cjs [--cpu 1]
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const args = process.argv.slice(2);
const cpu = Number(args[args.indexOf('--cpu') + 1]) || 1;
const root = path.join(__dirname, '../..');
const electronBin = require(path.join(root, 'node_modules/electron'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const port = 9400 + Math.floor(Math.random() * 400);
  const child = spawn(electronBin, [path.join(__dirname, 'launch.cjs'), 'app', `--remote-debugging-port=${port}`], { env: { ...process.env, STARTUP_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-st-')) }, stdio: 'ignore' });
  let target;
  for (let i = 0; i < 1000 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!target) await sleep(20);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) (pending.get(d.id)(d), pending.delete(d.id));
    if (d.method === 'Tracing.dataCollected') events.push(...d.params.value);
    if (d.method === 'Tracing.tracingComplete') done();
  };
  let done;
  const finished = new Promise((r) => (done = r));
  const send = (method, params = {}) => new Promise((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;
  const marked = () => ev(`performance.getEntriesByName('frameling:interactive').length`).catch(() => 0);
  while (!(await marked())) await sleep(20);
  await send('Page.enable');
  if (cpu > 1) await send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-devtools.timeline', 'loading'] }, transferMode: 'ReportEvents' });
  await send('Page.reload', { ignoreCache: args.includes('--cold') });
  await sleep(300);
  while (!(await marked())) await sleep(20);
  await sleep(400);
  await send('Tracing.end');
  await finished;
  child.kill('SIGKILL');
  const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
  const mine = events.filter((e) => e.pid === main.pid && e.tid === main.tid && e.ph === 'X' && e.dur);
  const nav = events.filter((e) => e.name === 'navigationStart' && e.pid === main.pid).pop();
  const inter = events.find((e) => e.name === 'frameling:interactive' && e.pid === main.pid);
  const t0 = nav.ts;
  const end = inter ? inter.ts : Infinity;
  console.log(`navigation start to interactive: ${((end - t0) / 1000).toFixed(0)} ms`);
  // top-level (non-nested) slices only, to avoid double counting
  const slices = mine.filter((e) => e.ts >= t0 && e.ts <= end).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const top = [];
  let until = 0;
  for (const s of slices) if (s.ts >= until) (top.push(s), (until = s.ts + s.dur));
  const by = new Map();
  for (const s of top) by.set(s.name, (by.get(s.name) || 0) + s.dur);
  console.log('top-level main-thread slices, ms');
  for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log((v / 1000).toFixed(1).padStart(7), k);
  console.log('\ntimeline');
  for (const s of top.filter((s) => s.dur > 3000)) console.log(((s.ts - t0) / 1000).toFixed(0).padStart(5), (s.dur / 1000).toFixed(1).padStart(6), s.name, s.args?.data?.url ? s.args.data.url.split('/').pop() : '');
  console.log('\nv8 compile/eval/parse inside window');
  const v8 = new Map();
  for (const s of mine.filter((e) => e.ts >= t0 && e.ts <= end && /^(v8\.|V8\.|EvaluateScript|FunctionCall|v8\.compile|v8\.run|ParseHTML|CompileCode|ScriptCompiler)/i.test(e.name))) v8.set(s.name, (v8.get(s.name) || 0) + s.dur);
  for (const [k, v] of [...v8].sort((a, b) => b[1] - a[1])) console.log((v / 1000).toFixed(1).padStart(7), k);
  process.exit(0);
})();

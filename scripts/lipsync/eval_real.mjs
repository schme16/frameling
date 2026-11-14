// Scores the mouth guesser on real recordings, per mouth shape (see real_voice.py for making the references).
//   node scripts/lipsync/eval_real.mjs <real_dir> [--src src/lipsync/analysis.ts] [--text] [--fps 24] [--hold a,b,c] [--json out.json]
// <real_dir> holds real-N.wav / real-N.json from real_refs.py and a kinds.json saying which clip is normal, faster or
// whispered. Nothing here belongs in the repository's data: the recordings stay outside it.
// --hold names the clip numbers a model was NOT trained on; the rest count as "fitted" (it was trained on them).
// --unseen says the model never saw any of the clips (the original model), so all count as held out.
// --model <model.ts> scores a different set of classifier numbers (train.mjs --out). --cv <dir> is cross-validation:
// <dir>/folds.json is {"0": [clip numbers], ...} and <dir>/m0.ts, m1.ts... are models trained without those clips, so
// every clip is scored by a model that never saw it, and all clips count as held out.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readWav, resample, truthFrames } from './wav.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dir = resolve(args[0]);
const src = resolve(flag('--src', 'src/lipsync/analysis.ts'));
const fps = Number(flag('--fps', 24));
const useText = args.includes('--text');
const RATE = 44100;
const kinds = JSON.parse(readFileSync(join(dir, 'kinds.json'), 'utf8'));
const held = new Set(flag('--hold', '').split(',').filter(Boolean).map(Number));
const tune = Object.fromEntries(flag('--tune', '').split(',').filter(Boolean).map((kv) => kv.split('=')).map(([k, v]) => [k, Number(v)]));

const tmp = mkdtempSync(join(tmpdir(), 'lipreal-'));
const load = async (entry, name, model) => {
  const alias = model ? [{ name: 'alias-model', setup: (b) => b.onResolve({ filter: /\/model$/ }, () => ({ path: resolve(model) })) }] : [];
  await build({ entryPoints: [resolve(entry)], bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, name), logLevel: 'error', plugins: alias });
  return import(pathToFileURL(join(tmp, name)).href);
};
const cvDir = flag('--cv', '');
const folds = cvDir ? JSON.parse(readFileSync(join(resolve(cvDir), 'folds.json'), 'utf8')) : null;
const mods = {};
if (folds) for (const k of Object.keys(folds)) mods[k] = await load(src, `a${k}.mjs`, join(resolve(cvDir), `m${k}.ts`));
const mod = folds ? null : await load(src, 'a.mjs', flag('--model', ''));
const foldOf = (i) => Object.keys(folds).find((k) => folds[k].includes(i));
let dict, wordsMod;
if (useText) {
  wordsMod = await load('src/lipsync/words.ts', 'w.mjs');
  dict = wordsMod.parseDictionary((await load('src/lipsync/dict-data.ts', 'data.mjs')).default);
}

const CL = ['rest', 'A', 'E', 'O', 'U', 'MBP', 'FV', 'L', 'WQ', 'etc'];
const near = (a, i, m) => [i - 1, i, i + 1].some((k) => a[k] === m);
const groups = {};
const add = (g, truth, guess) => {
  const s = (groups[g] ??= { n: 0, exact: 0, spoken: 0, spokenExact: 0, spokenNear: 0, per: Object.fromEntries(CL.map((c) => [c, { t: 0, hit: 0, near: 0, g: 0, gok: 0 }])), mbpT: 0, mbpHit: 0, mbpG: 0, mbpTrue: 0 });
  for (let i = 0; i < truth.length; i++) {
    s.n++;
    if (truth[i] === guess[i]) s.exact++;
    s.per[guess[i]].g++;
    if (truth[i] === guess[i]) s.per[guess[i]].gok++;
    if (truth[i] !== 'rest') {
      s.spoken++;
      if (truth[i] === guess[i]) s.spokenExact++;
      if (near(guess, i, truth[i])) s.spokenNear++;
    }
    s.per[truth[i]].t++;
    if (truth[i] === guess[i]) s.per[truth[i]].hit++;
    if (near(guess, i, truth[i])) s.per[truth[i]].near++;
    if (truth[i] === 'MBP') (s.mbpT++, near(guess, i, 'MBP') && s.mbpHit++);
    if (guess[i] === 'MBP') (s.mbpG++, near(truth, i, 'MBP') && s.mbpTrue++);
  }
};
const only = new Set(flag('--ids', '').split(',').filter(Boolean).map(Number));
// Closure events: each b, p or m the reading says is a lip closure, and whether the guess has a closed-lips frame at it
// (within one frame); and each run of guessed closed lips, and whether a real closure is near it.
const closure = {};
const addClosures = (tag, phonemes, truth, guess) => {
  for (const g of [tag, 'every clip']) {
    const c = (closure[g] ??= { real: {}, runs: 0, runsOk: 0 });
    for (const p of phonemes) {
      if (p.mouth !== 'MBP') continue;
      const f0 = Math.floor(p.start * fps), f1 = Math.max(f0, Math.ceil(p.end * fps) - 1);
      const key = p.ph === 'b' ? 'B' : p.ph === 'p' ? 'P' : p.ph === 'm' ? 'M' : null;
      if (!key) continue;
      const e = (c.real[key] ??= { n: 0, hit: 0 });
      e.n++;
      if (guess.slice(Math.max(0, f0 - 1), f1 + 2).includes('MBP')) e.hit++;
    }
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] !== 'MBP' || guess[i - 1] === 'MBP') continue;
      let j = i;
      while (guess[j + 1] === 'MBP') j++;
      c.runs++;
      if (truth.slice(Math.max(0, i - 1), j + 2).includes('MBP')) c.runsOk++;
    }
  }
};
const perClip = [];
for (const k of kinds) {
  if (only.size && !only.has(k.i)) continue;
  const meta = JSON.parse(readFileSync(join(dir, `real-${k.i}.json`), 'utf8'));
  const wav = readWav(join(dir, `real-${k.i}.wav`));
  const samples = resample(wav.samples, wav.rate, RATE);
  const frames = Math.ceil((samples.length / RATE) * fps);
  const truth = truthFrames(meta.phonemes, fps, frames);
  const o = { tune, minHold: 2 };
  if (useText) (o.text = meta.text, dict && (o.expected = wordsMod.lineExpected(meta.text, dict)));
  const guess = (folds ? mods[foldOf(k.i)] : mod).guessMouths(samples, RATE, fps, frames, o);
  const where = folds || args.includes('--unseen') || held.has(k.i) ? 'held out' : 'fitted';
  addClosures(k.kind, meta.phonemes, truth, guess);
  add(`all`, truth, guess);
  add(`${where}`, truth, guess);
  add(`kind ${k.kind}`, truth, guess);
  add(`${where} ${k.kind}`, truth, guess);
  let ok = 0, sp = 0;
  truth.forEach((t, i) => t !== 'rest' && (sp++, t === guess[i] && ok++));
  perClip.push({ i: k.i, kind: k.kind, shapeAcc: ok / sp });
}
const pct = (x) => (x * 100).toFixed(0).padStart(3) + '%';
const ratio = (a, b) => (b ? a / b : NaN);
const out = {};
for (const [g, s] of Object.entries(groups)) {
  out[g] = { frames: s.n, shapeAcc: ratio(s.spokenExact, s.spoken), shapeAccWithin1: ratio(s.spokenNear, s.spoken), frameAcc: ratio(s.exact, s.n), mbpRecall: ratio(s.mbpHit, s.mbpT), mbpPrecision: ratio(s.mbpTrue, s.mbpG), perShape: Object.fromEntries(CL.map((c) => [c, { frames: s.per[c].t, recall: ratio(s.per[c].hit, s.per[c].t), recallWithin1: ratio(s.per[c].near, s.per[c].t), precision: ratio(s.per[c].gok, s.per[c].g) }])) };
}
console.log(`src ${src}  text ${useText}  held out clips: ${[...held].join(',') || 'none'}`);
console.log('group'.padEnd(22), 'frames  shape  (+-1)  frame   MBPrec MBPpre');
for (const [g, s] of Object.entries(out)) console.log(g.padEnd(22), String(s.frames).padStart(6), pct(s.shapeAcc), pct(s.shapeAccWithin1), pct(s.frameAcc), pct(s.mbpRecall), pct(s.mbpPrecision));
for (const g of args.includes('--shapes') ? ['all', 'kind normal', 'kind whispered', 'kind faster'] : []) {
  if (!out[g]) continue;
  console.log(`\nper shape, ${g}: recall (within one frame) precision`);
  for (const c of CL) { const p = out[g].perShape[c]; console.log(' ', c.padEnd(5), String(p.frames).padStart(5), pct(p.recall), `(${pct(p.recallWithin1)})`, pct(p.precision)); }
}
if (args.includes('--closures')) {
  console.log('\nlip closures found (within one frame), and guessed closed-lips runs that are real');
  for (const [g, c] of Object.entries(closure)) {
    const tot = Object.values(c.real).reduce((a, e) => ({ n: a.n + e.n, hit: a.hit + e.hit }), { n: 0, hit: 0 });
    console.log(' ', g.padEnd(10), ['M', 'B', 'P'].map((k) => `${k} ${c.real[k]?.hit ?? 0}/${c.real[k]?.n ?? 0}`).join('  '), ` all ${pct(tot.hit / tot.n)}  runs ${c.runsOk}/${c.runs} real (${pct(c.runsOk / c.runs)})`);
  }
}
const jp = flag('--json', '');
if (jp) writeFileSync(jp, JSON.stringify({ groups: out, perClip }, null, 1));

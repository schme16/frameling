// Scores the lip sync guesser against reference speech with known phoneme timing (see make_refs.py).
//   node scripts/lipsync/eval.mjs <refs_dir> [--src src/lipsync/analysis.ts] [--fps 24] [--text] [--no-dict] [--json out.json]
// --src can point at another copy of the analysis module (for before/after). --text hands the typed line to the guesser, with the pronunciation list (src/lipsync/dict-data.ts) unless --no-dict.
import { build } from 'esbuild';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readWav, resample, addNoise, truthFrames } from './wav.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dir = resolve(args[0]);
const src = resolve(flag('--src', 'src/lipsync/analysis.ts'));
const fps = Number(flag('--fps', 24));
const useText = args.includes('--text');
const RATE = Number(flag('--rate', 44100));

const tmp = mkdtempSync(join(tmpdir(), 'lipeval-'));
await build({ entryPoints: [src], bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'a.mjs'), logLevel: 'error' });
const mod = await import(pathToFileURL(join(tmp, 'a.mjs')).href);
let dict;
let wordsMod;
if (useText && !args.includes('--no-dict')) {
  const load = async (entry, name) => {
    await build({ entryPoints: [resolve(entry)], bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, name), logLevel: 'error' });
    return import(pathToFileURL(join(tmp, name)).href);
  };
  wordsMod = await load('src/lipsync/words.ts', 'w.mjs');
  dict = wordsMod.parseDictionary((await load('src/lipsync/dict-data.ts', 'data.mjs')).default);
}

const transitions = (a) => a.map((m, i) => (i > 0 && m !== a[i - 1] ? i : -1)).filter((i) => i >= 0);

function score(truth, guess) {
  const n = truth.length;
  let exact = 0, speechOk = 0, spoken = 0, spokenExact = 0;
  for (let i = 0; i < n; i++) {
    if (truth[i] === guess[i]) exact++;
    if ((truth[i] === 'rest') === (guess[i] === 'rest')) speechOk++;
    if (truth[i] !== 'rest') (spoken++, truth[i] === guess[i] && spokenExact++);
  }
  // Mouth changes: how far is each true change from the nearest guessed one (frames)?
  const tt = transitions(truth);
  const gt = transitions(guess);
  const errs = tt.map((t) => (gt.length ? Math.min(...gt.map((g) => Math.abs(g - t))) : 99));
  // Onset: the first speaking frame, and the first rest after the last speaking frame.
  const first = (a) => a.findIndex((m) => m !== 'rest');
  const last = (a) => a.length - 1 - [...a].reverse().findIndex((m) => m !== 'rest');
  // Closures: MBP frames in truth found in the guess within one frame, and guessed MBP frames that are real.
  const near = (a, i, m) => [i - 1, i, i + 1].some((k) => a[k] === m);
  let mbpT = 0, mbpHit = 0, mbpG = 0, mbpTrue = 0;
  for (let i = 0; i < n; i++) {
    if (truth[i] === 'MBP') (mbpT++, near(guess, i, 'MBP') && mbpHit++);
    if (guess[i] === 'MBP') (mbpG++, near(truth, i, 'MBP') && mbpTrue++);
  }
  return { n, exact, speechOk, spoken, spokenExact, errs, tt: tt.length, gt: gt.length, onset: Math.abs(first(truth) - first(guess)), offset: Math.abs(last(truth) - last(guess)), mbpT, mbpHit, mbpG, mbpTrue };
}

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
function summarise(rows) {
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const errs = rows.flatMap((r) => r.errs);
  return {
    clips: rows.length,
    frameAcc: sum('exact') / sum('n'),
    speechAcc: sum('speechOk') / sum('n'),
    shapeAcc: sum('spokenExact') / sum('spoken'),
    changeErrMedian: median(errs),
    changeWithin1: errs.filter((e) => e <= 1).length / Math.max(1, errs.length),
    changeRatio: sum('gt') / Math.max(1, sum('tt')),
    onsetErr: rows.reduce((s, r) => s + r.onset, 0) / rows.length,
    offsetErr: rows.reduce((s, r) => s + r.offset, 0) / rows.length,
    mbpRecall: sum('mbpHit') / Math.max(1, sum('mbpT')),
    mbpPrecision: sum('mbpTrue') / Math.max(1, sum('mbpG')),
  };
}

const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const groups = {};
const CL = ['rest', 'A', 'E', 'O', 'U', 'MBP', 'FV', 'L', 'WQ', 'etc'];
const conf = Object.fromEntries(CL.map((c) => [c, Object.fromEntries(CL.map((d) => [d, 0]))]));
const tune = Object.fromEntries(flag('--tune', '').split(',').filter(Boolean).map((kv) => kv.split('=')).map(([k, v]) => [k, Number(v)]));
const minHold = Number(flag('--min-hold', 2));
const t0 = performance.now();
let audioSeconds = 0;
const only = new Set(flag('--voices', '').split(',').filter(Boolean));
for (const f of files) {
  const meta = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  if (only.size && !only.has(meta.voice)) continue;
  const wav = readWav(join(dir, f.replace('.json', '.wav')));
  const rate = RATE;
  const samples = resample(wav.samples, wav.rate, rate);
  const frames = Math.ceil((samples.length / rate) * fps);
  const truth = truthFrames(meta.phonemes, fps, frames);
  const variants = [['clean', samples]];
  if (meta.split === 'held' || meta.split === 'real') variants.push(['noisy', addNoise(samples, 15)]);
  for (const [vname, audio] of variants) {
    audioSeconds += audio.length / rate;
    const guess = mod.guessMouths(audio, rate, fps, frames, { ...(useText ? { text: meta.text, ...(dict ? { expected: wordsMod.lineExpected(meta.text, dict) } : {}) } : {}), tune, minHold });
    if (vname === 'clean' && meta.split === 'held') truth.forEach((t, i) => conf[t][guess[i]]++);
    const r = score(truth, guess);
    const keys = [];
    keys.push(`${meta.split === 'held' ? 'held-out' : meta.split === 'real' ? 'real speech' : 'train lines'} ${vname}`);
    keys.push(`${meta.engine} ${vname}`);
    for (const k of keys) (groups[k] ??= []).push(r);
    (groups['ALL clean'] ??= []);
    if (vname === 'clean') groups['ALL clean'].push(r);
  }
}
const ms = performance.now() - t0;
const result = {};
for (const [k, rows] of Object.entries(groups)) result[k] = summarise(rows);
const pct = (x) => (x * 100).toFixed(1).padStart(5) + '%';
console.log(`fps ${fps}  src ${src}  text-assisted ${useText}  (${(ms / audioSeconds).toFixed(1)} ms per second of audio)`);
console.log('group'.padEnd(18), 'clips frame  shape speech chg<=1 chgMed ratio onset offset  MBPrec MBPpre');
for (const [k, s] of Object.entries(result).sort()) {
  console.log(k.padEnd(18), String(s.clips).padStart(5), pct(s.frameAcc), pct(s.shapeAcc), pct(s.speechAcc), pct(s.changeWithin1), String(s.changeErrMedian).padStart(6), s.changeRatio.toFixed(2).padStart(5), s.onsetErr.toFixed(2).padStart(5), s.offsetErr.toFixed(2).padStart(6), pct(s.mbpRecall), pct(s.mbpPrecision));
}
if (args.includes('--confusion')) {
  console.log('\nconfusion on held-out clean (rows = truth, columns = guess)');
  console.log(''.padEnd(5), CL.map((c) => c.padStart(5)).join(''));
  for (const t of CL) console.log(t.padEnd(5), CL.map((c) => String(conf[t][c]).padStart(5)).join(''));
}
const outPath = flag('--json', '');
if (outPath) writeFileSync(outPath, JSON.stringify(result, null, 1));

// Trains the small mouth classifier from reference speech (see make_refs.py) and writes src/lipsync/model.ts.
//   node scripts/lipsync/train.mjs <refs_dir> [--out src/lipsync/model.ts] [--exclude-voices slt,kal] [--epochs 60] [--hidden 40]
// Only the training lines are used (the held-out ones are for eval.mjs). Each clip is trained clean and with noise, a duller
// microphone and other sample rates, so the model copes with a real recording.
// Real recordings (scripts/lipsync/real_voice.py makes the folder; it stays outside the repository):
//   --real <dir>  mix them in, --hold 3,7 leave those clip numbers out, --real-weight 2 counts each real step that many times,
//   --synth-keep 0.3 uses only that share of the synthetic steps, --init <model.ts> starts from existing numbers
//   (fine-tuning, with --lr 0.001), --cache <file> keeps the synthetic measurements so reruns skip the slow part.
import { build } from 'esbuild';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readWav, resample, addNoise, dull, mouthAt } from './wav.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dir = resolve(args[0]);
const out = resolve(flag('--out', 'src/lipsync/model.ts'));
const exclude = new Set(flag('--exclude-voices', '').split(',').filter(Boolean));
const EPOCHS = Number(flag('--epochs', 60));
const HID = Number(flag('--hidden', 40));
const realDir = flag('--real', '');
const hold = new Set(flag('--hold', '').split(',').filter(Boolean).map(Number));
const REAL_W = Number(flag('--real-weight', 1));
const SYNTH_KEEP = Number(flag('--synth-keep', 1));
const LR = Number(flag('--lr', 0.003));
const initPath = flag('--init', '');
const cachePath = flag('--cache', '');
let REAL_COUNT = 0;

const tmp = mkdtempSync(join(tmpdir(), 'liptrain-'));
await build({ entryPoints: [resolve('src/lipsync/dsp.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'd.mjs'), logLevel: 'error' });
const dsp = await import(pathToFileURL(join(tmp, 'd.mjs')).href);
const CLASSES = ['rest', 'A', 'E', 'O', 'U', 'MBP', 'FV', 'L', 'WQ', 'etc'];
const NC = CLASSES.length;
const NF = dsp.FEATURE_COUNT;

// ---- data ----
const X = [];
const Y = [];
const VX = [];
const VY = [];
const VARIANTS = [
  { rate: 44100, noise: Infinity, dull: 0 },
  { rate: 44100, noise: 25, dull: 0 },
  { rate: 48000, noise: 15, dull: 0 },
  { rate: 44100, noise: 20, dull: 0.5 },
  { rate: 22050, noise: Infinity, dull: 0.3 },
  // Other voices: stretching the sound moves the pitch and the vowel resonances together, as a different head does.
  { rate: 44100, noise: Infinity, dull: 0, warp: 0.88 },
  { rate: 44100, noise: 25, dull: 0, warp: 1.14 },
  { rate: 48000, noise: 20, dull: 0.3, warp: 0.94 },
  { rate: 44100, noise: Infinity, dull: 0, warp: 1.07 },
];
const dspHash = createHash('sha1').update(readFileSync('src/lipsync/dsp.ts')).update(JSON.stringify(VARIANTS)).update([...exclude].join()).digest('hex').slice(0, 10);
const cacheFile = cachePath ? `${cachePath}.${dspHash}.json` : '';
let cached = false;
if (cacheFile && existsSync(cacheFile)) {
  const c = JSON.parse(readFileSync(cacheFile, 'utf8'));
  const flat = new Float32Array(Buffer.from(c.x, 'base64').buffer.slice(0));
  for (let i = 0; i < c.n; i++) X.push(flat.subarray(i * NF, (i + 1) * NF));
  for (const y of c.y) Y.push(y);
  const vflat = new Float32Array(Buffer.from(c.vx, 'base64').buffer.slice(0));
  for (let i = 0; i < c.vn; i++) VX.push(vflat.subarray(i * NF, (i + 1) * NF));
  for (const y of c.vy) VY.push(y);
  cached = true;
}
if (!cached) {
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  for (const f of files) {
    const meta = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const isTrain = meta.split === 'train' && !exclude.has(meta.voice);
    const isVal = meta.split === 'held';
    if (!isTrain && !isVal) continue;
    const wav = readWav(join(dir, f.replace('.json', '.wav')));
    // Silence either side, like a real recording.
    const pad = Math.round(wav.rate * 0.25);
    const padded = new Float32Array(wav.samples.length + 2 * pad);
    padded.set(wav.samples, pad);
    const phon = meta.phonemes.map((p) => ({ ...p, start: p.start + 0.25, end: p.end + 0.25 }));
    for (const [vi, v] of (isTrain ? VARIANTS : VARIANTS.slice(0, 2)).entries()) {
      const warp = v.warp ?? 1;
      let s = resample(padded, wav.rate * warp, v.rate);
      if (v.dull) s = dull(s, v.dull);
      if (Number.isFinite(v.noise)) s = addNoise(s, v.noise, 100 + vi);
      const rows = dsp.stepFeatures(s, v.rate);
      for (let h = 0; h < rows.length; h++) {
        const y = CLASSES.indexOf(mouthAt(phon, ((h + 0.5) * dsp.HOP) * warp));
        (isTrain ? X : VX).push(rows[h]);
        (isTrain ? Y : VY).push(y);
      }
    }
  }

  if (cacheFile) {
    const pack = (rows) => { const f = new Float32Array(rows.length * NF); rows.forEach((r, i) => f.set(r, i * NF)); return Buffer.from(f.buffer).toString('base64'); };
    writeFileSync(cacheFile, JSON.stringify({ n: X.length, vn: VX.length, x: pack(X), y: Y, vx: pack(VX), vy: VY }));
  }
}
// Keep only some of the synthetic steps if asked (every k-th, so the lines stay spread out).
const SW = [];
if (SYNTH_KEEP < 1) {
  const keepX = [], keepY = [];
  for (let i = 0; i < X.length; i++) if (Math.floor((i + 1) * SYNTH_KEEP) !== Math.floor(i * SYNTH_KEEP)) (keepX.push(X[i]), keepY.push(Y[i]));
  X.length = 0; Y.length = 0;
  for (let i = 0; i < keepX.length; i++) (X.push(keepX[i]), Y.push(keepY[i]));
}
for (let i = 0; i < X.length; i++) SW.push(1);
// Real recordings: each is used clean and with a few stand-ins for another voice or microphone.
if (realDir) {
  const REAL_VARIANTS = [
    { noise: Infinity, dull: 0, warp: 1 },
    { noise: 25, dull: 0, warp: 0.92 },
    { noise: 20, dull: 0.3, warp: 1.08 },
    { noise: Infinity, dull: 0, warp: 0.85 },
    { noise: 20, dull: 0, warp: 1.15 },
  ];
  const kinds = JSON.parse(readFileSync(join(resolve(realDir), 'kinds.json'), 'utf8'));
  let n = 0;
  for (const k of kinds) {
    if (hold.has(k.i)) continue;
    const meta = JSON.parse(readFileSync(join(resolve(realDir), `real-${k.i}.json`), 'utf8'));
    const wav = readWav(join(resolve(realDir), `real-${k.i}.wav`));
    for (const [vi, v] of REAL_VARIANTS.entries()) {
      let sm = resample(wav.samples, wav.rate * v.warp, 44100);
      if (v.dull) sm = dull(sm, v.dull);
      if (Number.isFinite(v.noise)) sm = addNoise(sm, v.noise, 200 + vi);
      const rows = dsp.stepFeatures(sm, 44100);
      for (let h = 0; h < rows.length; h++) {
        X.push(rows[h]);
        Y.push(CLASSES.indexOf(mouthAt(meta.phonemes, (h + 0.5) * dsp.HOP * v.warp)));
        SW.push(REAL_W);
        n++;
      }
    }
  }
  REAL_COUNT = kinds.length - hold.size;
  console.log('real steps', n, 'from', kinds.length - hold.size, 'clips (held out:', [...hold].join(',') || 'none', ')');
}
console.log('train steps', X.length, 'validation steps', VX.length);

// ---- a small neural net: one hidden layer, trained with Adam ----
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
let W1 = Float32Array.from({ length: NF * HID }, () => gauss() * Math.sqrt(1 / NF));
let B1 = new Float32Array(HID);
let W2 = Float32Array.from({ length: HID * NC }, () => gauss() * Math.sqrt(1 / HID));
let B2 = new Float32Array(NC);
if (initPath) {
  await build({ entryPoints: [resolve(initPath)], bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'init.mjs'), logLevel: 'error' });
  const init = await import(pathToFileURL(join(tmp, 'init.mjs')).href);
  if (init.MODEL_HIDDEN !== HID || init.MODEL_FEATURES !== NF) throw new Error('--init has other sizes; use --hidden ' + init.MODEL_HIDDEN);
  W1 = Float32Array.from(init.W1); B1 = Float32Array.from(init.B1); W2 = Float32Array.from(init.W2); B2 = Float32Array.from(init.B2);
}
const params = [W1, B1, W2, B2];
const m = params.map((p) => new Float32Array(p.length));
const v = params.map((p) => new Float32Array(p.length));
const counts = new Float64Array(NC);
for (const y of Y) counts[y]++;
// Mild class weights so the rare lip shapes are not drowned out.
const cw = Array.from(counts, (c) => Math.min(3, Math.pow(Math.max(...counts) / Math.max(1, c), 0.4)));
console.log('class share', CLASSES.map((c, i) => `${c} ${(counts[i] / Y.length * 100).toFixed(1)}%`).join('  '));

function forward(x, h, z) {
  for (let j = 0; j < HID; j++) {
    let s = B1[j];
    for (let i = 0; i < NF; i++) s += x[i] * W1[i * HID + j];
    h[j] = Math.tanh(s);
  }
  let mx = -1e9;
  for (let c = 0; c < NC; c++) {
    let s = B2[c];
    for (let j = 0; j < HID; j++) s += h[j] * W2[j * NC + c];
    z[c] = s;
    if (s > mx) mx = s;
  }
  let sum = 0;
  for (let c = 0; c < NC; c++) sum += z[c] = Math.exp(z[c] - mx);
  for (let c = 0; c < NC; c++) z[c] /= sum;
}

const idx = Array.from({ length: X.length }, (_, i) => i);
const BATCH = 256;
let t = 0;
const h = new Float32Array(HID);
const p = new Float32Array(NC);
const grads = params.map((q) => new Float32Array(q.length));
const dh = new Float32Array(HID);
function evalSet(XS, YS) {
  let ok = 0;
  for (let i = 0; i < XS.length; i++) {
    forward(XS[i], h, p);
    let b = 0;
    for (let c = 1; c < NC; c++) if (p[c] > p[b]) b = c;
    if (b === YS[i]) ok++;
  }
  return ok / XS.length;
}
for (let ep = 0; ep < EPOCHS; ep++) {
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const lr = LR * (1 - ep / EPOCHS * 0.9);
  for (let s0 = 0; s0 < idx.length; s0 += BATCH) {
    for (const g of grads) g.fill(0);
    const n = Math.min(BATCH, idx.length - s0);
    for (let b = 0; b < n; b++) {
      const k = idx[s0 + b];
      const x = X[k];
      forward(x, h, p);
      const y = Y[k];
      const w = cw[y] * SW[k];
      for (let c = 0; c < NC; c++) p[c] = (p[c] - (c === y ? 1 : 0)) * w;
      dh.fill(0);
      for (let c = 0; c < NC; c++) {
        grads[3][c] += p[c];
        for (let j = 0; j < HID; j++) {
          grads[2][j * NC + c] += h[j] * p[c];
          dh[j] += W2[j * NC + c] * p[c];
        }
      }
      for (let j = 0; j < HID; j++) {
        const d = dh[j] * (1 - h[j] * h[j]);
        grads[1][j] += d;
        for (let i = 0; i < NF; i++) grads[0][i * HID + j] += x[i] * d;
      }
    }
    t++;
    for (let q = 0; q < 4; q++) {
      const P = params[q], G = grads[q], M = m[q], V = v[q];
      for (let i = 0; i < P.length; i++) {
        const g = G[i] / n + (q % 2 === 0 ? 1e-5 * P[i] : 0);
        M[i] = 0.9 * M[i] + 0.1 * g;
        V[i] = 0.999 * V[i] + 0.001 * g * g;
        P[i] -= (lr * (M[i] / (1 - 0.9 ** t))) / (Math.sqrt(V[i] / (1 - 0.999 ** t)) + 1e-8);
      }
    }
  }
  if (ep % 10 === 9 || ep === EPOCHS - 1) console.log(`epoch ${ep + 1}: train ${(evalSet(X.slice(0, 20000), Y.slice(0, 20000)) * 100).toFixed(1)}%  held-out lines ${(evalSet(VX, VY) * 100).toFixed(1)}%`);
}

const fmt = (a) => '[' + Array.from(a, (x) => +x.toFixed(3)).join(',') + ']';
writeFileSync(
  out,
  `/**
 * The mouth classifier's numbers: a tiny neural net (${NF} measurements in, ${HID} hidden, ${NC} mouths out).
 * Made by scripts/lipsync/train.mjs from speech this computer's own synthesisers say, with the true mouth timing known${realDir ? `,
 * then adjusted on ${REAL_COUNT} real recordings of one voice (cut up into steps and mixed in; none of the sound is kept here)` : ''}.
 * Do not edit by hand: run the script again.
 */
export const MODEL_CLASSES = ${JSON.stringify(CLASSES)} as const;
export const MODEL_HIDDEN = ${HID};
export const MODEL_FEATURES = ${NF};
export const W1 = ${fmt(W1)};
export const B1 = ${fmt(B1)};
export const W2 = ${fmt(W2)};
export const B2 = ${fmt(B2)};
`,
);
console.log('wrote', out);

// Makes the data for the before/after clip: two spoken lines joined into one wav, with the true mouths, the old guesses
// and the new guesses (with and without the typed words) for every frame.
//   node scripts/lipsync/ab_data.mjs <refs_dir> <out_dir> --before <old analysis.ts> [--lines flt0-032,flt0-033] [--fps 24]
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readWav, resample, truthFrames } from './wav.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dir = resolve(args[0]);
const out = resolve(args[1]);
const fps = Number(flag('--fps', 24));
const RATE = 44100;
const names = flag('--lines', 'flt0-032,flt0-033').split(',');
mkdirSync(out, { recursive: true });

async function load(src, tag) {
  const tmp = mkdtempSync(join(tmpdir(), 'lipab-'));
  await build({ entryPoints: [resolve(src)], bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, tag + '.mjs'), logLevel: 'error' });
  return import(pathToFileURL(join(tmp, tag + '.mjs')).href);
}
const before = await load(flag('--before'), 'before');
const after = await load('src/lipsync/analysis.ts', 'after');

// Join the lines with a short gap.
const parts = [];
const phon = [];
let t = 0.3;
let text = '';
parts.push(new Float32Array(Math.round(RATE * 0.3)));
for (const n of names) {
  const meta = JSON.parse(readFileSync(join(dir, n + '.json'), 'utf8'));
  const wav = readWav(join(dir, n + '.wav'));
  const s = resample(wav.samples, wav.rate, RATE);
  for (const p of meta.phonemes) phon.push({ ...p, start: p.start + t, end: p.end + t });
  parts.push(s, new Float32Array(Math.round(RATE * 0.4)));
  t += s.length / RATE + 0.4;
  text += (text ? ' ' : '') + meta.text;
}
const total = parts.reduce((n, p) => n + p.length, 0);
const all = new Float32Array(total);
let o = 0;
for (const p of parts) (all.set(p, o), (o += p.length));
const frames = Math.ceil((total / RATE) * fps);

// 16 bit wav out.
const buf = Buffer.alloc(44 + total * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + total * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(total * 2, 40);
for (let i = 0; i < total; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(all[i] * 32767))), 44 + i * 2);
writeFileSync(join(out, 'line.wav'), buf);

const data = {
  fps, text, frames,
  truth: truthFrames(phon, fps, frames),
  before: before.guessMouths(all, RATE, fps, frames),
  after: after.guessMouths(all, RATE, fps, frames),
  afterText: after.guessMouths(all, RATE, fps, frames, { text }),
};
writeFileSync(join(out, 'frames.json'), JSON.stringify(data));
const acc = (g) => (g.filter((m, i) => m === data.truth[i]).length / frames) * 100;
console.log(`${frames} frames; before ${acc(data.before).toFixed(1)}%, after ${acc(data.after).toFixed(1)}%, after + words ${acc(data.afterText).toFixed(1)}%`);

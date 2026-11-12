// Shared bits for the lip sync scripts: read a wav, resample, add noise or a duller microphone, label frames.
import { readFileSync } from 'node:fs';

export function readWav(path) {
  const b = readFileSync(path);
  const rate = b.readUInt32LE(24);
  const n = (b.length - 44) / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = b.readInt16LE(44 + i * 2) / 32768;
  return { samples: out, rate };
}

/** Cubic resample (Catmull-Rom). Good enough to stand in for a recording made at another rate. */
export function resample(s, from, to) {
  if (from === to) return s;
  const n = Math.floor((s.length * to) / from);
  const out = new Float32Array(n);
  const at = (i) => s[Math.max(0, Math.min(s.length - 1, i))];
  for (let i = 0; i < n; i++) {
    const x = (i * from) / to;
    const k = Math.floor(x);
    const t = x - k;
    const p0 = at(k - 1), p1 = at(k), p2 = at(k + 1), p3 = at(k + 2);
    out[i] = p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  }
  return out;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

/** Room-hum-like noise at the given signal-to-noise ratio (dB). */
export function addNoise(s, snrDb, seed = 7) {
  const r = rng(seed);
  let p = 0;
  for (const v of s) p += v * v;
  p /= s.length;
  const amp = Math.sqrt(p / 10 ** (snrDb / 10));
  let lp = 0;
  const out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const w = (r() - 0.5) * 3.46;
    lp = 0.97 * lp + 0.03 * w;
    out[i] = s[i] + amp * (0.5 * w + 4 * lp);
  }
  return out;
}

/** A duller microphone: a one-pole low-pass. `a` near 0 is bright, near 0.7 is dull. */
export function dull(s, a) {
  const out = new Float32Array(s.length);
  let y = 0;
  for (let i = 0; i < s.length; i++) out[i] = y = (1 - a) * s[i] + a * y;
  return out;
}

const WEIGHT = { MBP: 1.8, FV: 1.4 };
/** The mouth for each of `frames` frames at `fps`: the phoneme that covers most of the frame, lip closures counting extra. */
export function truthFrames(phonemes, fps, frames) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const a = f / fps;
    const b = (f + 1) / fps;
    const score = {};
    for (const p of phonemes) {
      const o = Math.min(b, p.end) - Math.max(a, p.start);
      if (o > 0) score[p.mouth] = (score[p.mouth] ?? 0) + o * (WEIGHT[p.mouth] ?? 1);
    }
    let best = 'rest';
    let bv = 0;
    for (const [m, v] of Object.entries(score)) if (v > bv) ((bv = v), (best = m));
    out.push(best);
  }
  return out;
}

/** The mouth at one moment. */
export function mouthAt(phonemes, t) {
  for (const p of phonemes) if (t >= p.start && t < p.end) return p.mouth;
  return 'rest';
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedFromText } from '../../src/lipsync/dict';
import { guessMouths, guessMouthsAsync, holdAtLeast, poolSteps, smoothPath } from '../../src/lipsync/analysis';
import { fft, hopFeatures, levinson, stepFeatures, FEATURE_COUNT } from '../../src/lipsync/dsp';
import type { Mouth } from '../../src/lipsync/chart';

const RATE = 44100;
const FPS = 24;
const PER = RATE / FPS;

/** A voice-like sound: a 120 Hz buzz shaped by two resonances (formants), from `a` to `b` seconds. */
function vowel(total: number, a: number, b: number, f1: number, f2: number, amp = 0.4): Float32Array {
  const out = new Float32Array(Math.round(total * RATE));
  const f0 = 120;
  for (let h = 1; h * f0 < 5000; h++) {
    const f = h * f0;
    const g = Math.exp(-(((f - f1) / 130) ** 2)) + 0.7 * Math.exp(-(((f - f2) / 180) ** 2));
    if (g < 0.01) continue;
    for (let i = Math.floor(a * RATE); i < Math.min(out.length, Math.floor(b * RATE)); i++) out[i] += (amp * g * Math.sin((2 * Math.PI * f * i) / RATE)) / 2;
  }
  return out;
}

function noise(total: number, a: number, b: number, amp = 0.3): Float32Array {
  const out = new Float32Array(Math.round(total * RATE));
  let seed = 12345;
  for (let i = Math.floor(a * RATE); i < Math.min(out.length, Math.floor(b * RATE)); i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    out[i] = (seed / 0xffffffff - 0.5) * 2 * amp;
  }
  return out;
}

const add = (...x: Float32Array[]) => {
  const out = new Float32Array(Math.max(...x.map((a) => a.length)));
  for (const a of x) for (let i = 0; i < a.length; i++) out[i] += a[i];
  return out;
};

const OPEN = new Set<Mouth>(['A', 'E', 'O', 'U', 'WQ']);

describe('fft', () => {
  it('puts a pure tone in the right bin', () => {
    const n = 1024;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 32 * i) / n);
    fft(re, im);
    let best = 0;
    for (let k = 1; k < n / 2; k++) if (re[k] ** 2 + im[k] ** 2 > re[best] ** 2 + im[best] ** 2) best = k;
    expect(best).toBe(32);
  });
});

describe('guessMouths', () => {
  it('gives rest for silence, one entry per frame', () => {
    const m = guessMouths(new Float32Array(RATE * 2), RATE, FPS, 48);
    expect(m).toHaveLength(48);
    expect(new Set(m)).toEqual(new Set(['rest']));
  });

  it('gives rest for frames past the end of the sound', () => {
    const m = guessMouths(vowel(0.5, 0, 0.5, 700, 1200), RATE, FPS, 24);
    expect(m.slice(14)).toEqual(Array(10).fill('rest'));
  });

  it('opens the mouth on the frame where a vowel starts, within one frame', () => {
    // Speech from 0.5 s: frame 12 at 24 fps.
    const s = vowel(2, 0.5, 1.5, 700, 1200);
    const m = guessMouths(s, RATE, FPS, 48);
    const first = m.findIndex((x) => x !== 'rest');
    expect(Math.abs(first - 12)).toBeLessThanOrEqual(1);
    expect(OPEN.has(m[first + 2])).toBe(true);
    const lastOpen = m.map((x, i) => (x !== 'rest' ? i : -1)).reduce((a, b) => Math.max(a, b));
    expect(Math.abs(lastOpen - 35)).toBeLessThanOrEqual(1);
    expect(m[0]).toBe('rest');
    expect(m[47]).toBe('rest');
  });

  it('keeps every mouth for at least the minimum hold (lips-closed beats excepted)', () => {
    // A mix of everything, to give it plenty of reasons to flicker.
    const s = add(vowel(3, 0.1, 0.6, 700, 1200), noise(3, 0.6, 0.8), vowel(3, 0.8, 1.2, 420, 2200), vowel(3, 1.25, 1.7, 320, 800), noise(3, 1.9, 2.2, 0.1));
    for (const min of [2, 3]) {
      const m = guessMouths(s, RATE, FPS, 72, { minHold: min });
      let i = 0;
      while (i < m.length) {
        let j = i;
        while (j + 1 < m.length && m[j + 1] === m[i]) j++;
        if (m[i] !== 'MBP' && !(i === 0 || j === m.length - 1)) expect(j - i + 1, `${m[i]} at ${i} (min ${min})`).toBeGreaterThanOrEqual(min);
        i = j + 1;
      }
    }
  });

  it('can lead the sound by a frame', () => {
    const s = vowel(2, 0.5, 1.5, 700, 1200);
    const a = guessMouths(s, RATE, FPS, 48);
    const b = guessMouths(s, RATE, FPS, 48, { lead: 1 });
    expect(b.findIndex((x) => x !== 'rest')).toBe(a.findIndex((x) => x !== 'rest') - 1);
  });
});

describe('holdAtLeast', () => {
  it('folds a one frame blip into the longer neighbour, and opens early rather than late', () => {
    expect(holdAtLeast(['A', 'A', 'A', 'E', 'A', 'A'] as Mouth[], 2)).toEqual(['A', 'A', 'A', 'A', 'A', 'A']);
    expect(holdAtLeast(['rest', 'rest', 'O', 'A', 'A', 'A'] as Mouth[], 2)).toEqual(['rest', 'rest', 'A', 'A', 'A', 'A']);
  });
  it('leaves lips-closed beats alone', () => {
    expect(holdAtLeast(['A', 'A', 'MBP', 'A', 'A'] as Mouth[], 2)).toEqual(['A', 'A', 'MBP', 'A', 'A']);
  });
});

// ---- real speech with known timing ----

interface Phoneme {
  mouth: Mouth;
  start: number;
  end: number;
}
function fixture(name: string): { samples: Float32Array; rate: number; text: string; phonemes: Phoneme[] } {
  const b = readFileSync(new URL(`./fixtures/${name}.wav`, import.meta.url));
  const rate = b.readUInt32LE(24);
  const n = (b.length - 44) / 2;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = b.readInt16LE(44 + i * 2) / 32768;
  const meta = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as { text: string; phonemes: Phoneme[] };
  return { samples, rate, ...meta };
}
const WEIGHT: Partial<Record<Mouth, number>> = { MBP: 1.8, FV: 1.4 };
function truthFrames(ph: Phoneme[], fps: number, frames: number): Mouth[] {
  return Array.from({ length: frames }, (_, f) => {
    const score = new Map<Mouth, number>();
    for (const p of ph) {
      const o = Math.min((f + 1) / fps, p.end) - Math.max(f / fps, p.start);
      if (o > 0) score.set(p.mouth, (score.get(p.mouth) ?? 0) + o * (WEIGHT[p.mouth] ?? 1));
    }
    return [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'rest';
  });
}
const accuracy = (a: Mouth[], b: Mouth[]) => a.filter((m, i) => m === b[i]).length / a.length;

describe.each(['moon-slt', 'moon-espeak'])('a spoken line (%s)', (name) => {
  const f = fixture(name);
  // Play it at the rate a recording is usually decoded at.
  const frames = Math.ceil((f.samples.length / f.rate) * FPS);
  const truth = truthFrames(f.phonemes, FPS, frames);

  it('puts most frames on the right mouth (the old guesser managed about one in three)', () => {
    const guess = guessMouths(f.samples, f.rate, FPS, frames);
    expect(accuracy(guess, truth)).toBeGreaterThan(0.65);
  });

  it('knows when the voice starts and stops, and rests either side', () => {
    const guess = guessMouths(f.samples, f.rate, FPS, frames);
    const firstTrue = truth.findIndex((m) => m !== 'rest');
    const firstGuess = guess.findIndex((m) => m !== 'rest');
    expect(Math.abs(firstGuess - firstTrue)).toBeLessThanOrEqual(1);
    const speechAgree = guess.filter((m, i) => (m === 'rest') === (truth[i] === 'rest')).length / frames;
    expect(speechAgree).toBeGreaterThan(0.9);
  });

  it('does not flicker: no mouth but a lip closure lasts under two frames', () => {
    const guess = guessMouths(f.samples, f.rate, FPS, frames);
    let i = 0;
    while (i < guess.length) {
      let j = i;
      while (j + 1 < guess.length && guess[j + 1] === guess[i]) j++;
      if (guess[i] !== 'MBP' && i > 0 && j < guess.length - 1) expect(j - i + 1).toBeGreaterThanOrEqual(2);
      i = j + 1;
    }
  });

  it('is at least as good when the words are typed in', async () => {
    const plain = accuracy(guessMouths(f.samples, f.rate, FPS, frames), truth);
    const typed = accuracy(guessMouths(f.samples, f.rate, FPS, frames, { text: f.text, expected: await expectedFromText(f.text) }), truth);
    expect(typed).toBeGreaterThan(plain - 0.1);
    expect(typed).toBeGreaterThan(0.6);
  });

  it('gives the same answer the page-friendly way', async () => {
    const a = guessMouths(f.samples, f.rate, FPS, frames);
    const b = await guessMouthsAsync(f.samples, f.rate, FPS, frames);
    expect(b).toEqual(a);
  });

  it('copes with the recording at another sample rate', () => {
    // Nearest-sample resample to 44.1 kHz, as a stand-in for a recording made at that rate.
    const to = 44100;
    const up = new Float32Array(Math.floor((f.samples.length * to) / f.rate));
    for (let i = 0; i < up.length; i++) up[i] = f.samples[Math.min(f.samples.length - 1, Math.floor((i * f.rate) / to))];
    expect(accuracy(guessMouths(up, to, FPS, frames), truth)).toBeGreaterThan(0.6);
  });
});

describe('dsp', () => {
  it('finds the filter of a decaying signal with levinson', () => {
    // Autocorrelation of an AR(1) process x[n] = 0.7 x[n-1] + noise is 0.7^k.
    const r = [1, 0.7, 0.49, 0.343];
    const a = levinson(r, 3)!;
    expect(a[1]).toBeCloseTo(-0.7, 6);
    expect(Math.abs(a[2])).toBeLessThan(1e-9);
    expect(levinson([0, 0, 0], 2)).toBeNull();
  });

  it('measures the vowel resonances of a buzz shaped by two formants', () => {
    const s = vowel(1, 0, 1, 700, 1500).subarray(0, 1323);
    const h = hopFeatures(s, RATE)!;
    expect(h.f1).toBeGreaterThan(560);
    expect(h.f1).toBeLessThan(860);
    expect(h.f2).toBeGreaterThan(1250);
    expect(h.f2).toBeLessThan(1800);
    expect(h.voicing).toBeGreaterThan(0.6);
  });

  it('finds noise unvoiced and bright', () => {
    const h = hopFeatures(noise(1, 0, 1).subarray(0, 1323), RATE)!;
    const v = hopFeatures(vowel(1, 0, 1, 700, 1500).subarray(0, 1323), RATE)!;
    expect(h.voicing).toBeLessThan(0.4);
    expect(h.centroid).toBeGreaterThan(v.centroid);
  });

  it('gives one row of the same width for every 10 ms', () => {
    const rows = stepFeatures(vowel(1, 0.2, 0.8, 700, 1200), RATE);
    expect(rows).toHaveLength(100);
    expect(rows.every((r) => r.length === FEATURE_COUNT)).toBe(true);
    expect(rows.every((r) => Array.from(r).every(Number.isFinite))).toBe(true);
  });
});

describe('smoothPath and poolSteps', () => {
  const row = (...p: number[]) => Float32Array.from(p);
  it('smooths a one frame wobble away, but a clear change stays', () => {
    const odds = [row(0.9, 0.1), row(0.9, 0.1), row(0.4, 0.6), row(0.9, 0.1), row(0.9, 0.1), row(0.1, 0.9), row(0.1, 0.9), row(0.1, 0.9)];
    expect(smoothPath(odds, 1.5)).toEqual([0, 0, 0, 0, 0, 1, 1, 1]);
    expect(smoothPath(odds, 0)[2]).toBe(1);
  });
  it('never makes a run shorter than the hold, except the free mouth', () => {
    const odds = [row(0.9, 0.1, 0), row(0.2, 0.8, 0), row(0.9, 0.1, 0), row(0.9, 0.1, 0), row(0.1, 0.1, 0.8), row(0.9, 0.1, 0), row(0.9, 0.1, 0), row(0.9, 0.1, 0)];
    const path = smoothPath(odds, 0.1, 2, 2);
    expect(path[4]).toBe(2);
    expect(path.slice(0, 4).every((c, i, a) => i === 0 || c === a[i - 1] || i >= 2)).toBe(true);
    let i = 0;
    while (i < path.length) {
      let j = i;
      while (j + 1 < path.length && path[j + 1] === path[i]) j++;
      if (path[i] !== 2 && i > 0 && j < path.length - 1) expect(j - i + 1).toBeGreaterThanOrEqual(2);
      i = j + 1;
    }
  });
  it('pools the steps inside each frame, and boosts a short closure', () => {
    // 100 steps a second, 10 fps: ten steps a frame.
    const steps = Array.from({ length: 20 }, (_, h) => (h >= 5 && h < 8 ? row(0.1, 0.9) : row(0.9, 0.1)));
    const plain = poolSteps(steps, 10, 2, {}, ['A', 'MBP']);
    expect(plain[0][0]).toBeGreaterThan(plain[0][1]);
    const boosted = poolSteps(steps, 10, 2, { MBP: 3 }, ['A', 'MBP']);
    expect(boosted[0][1]).toBeGreaterThan(plain[0][1]);
    expect(plain.every((r) => Math.abs(r[0] + r[1] - 1) < 1e-5)).toBe(true);
  });
});

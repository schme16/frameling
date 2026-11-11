import { describe, expect, it } from 'vitest';
import { fft, frameFeatures, guessMouths, holdAtLeast, vowelFor } from '../../src/lipsync/analysis';
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

const OPEN = new Set<Mouth>(['A', 'E', 'O', 'U']);

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

  it('tells the vowels apart roughly: wide A, smiling E, round O, small U', () => {
    const pick = (f1: number, f2: number) => {
      const m = guessMouths(vowel(1, 0, 1, f1, f2), RATE, FPS, 24);
      const counts = new Map<Mouth, number>();
      for (const x of m.slice(2, 22)) counts.set(x, (counts.get(x) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };
    expect(pick(750, 1200)).toBe('A');
    expect(pick(420, 2200)).toBe('E');
    expect(pick(500, 900)).toBe('O');
    expect(pick(320, 800)).toBe('U');
  });

  it('gives a consonant mouth for a burst of hiss', () => {
    const s = noise(2, 0.5, 1.0);
    const m = guessMouths(s, RATE, FPS, 48);
    const mid = m.slice(14, 22);
    expect(mid.every((x) => x === 'etc' || x === 'FV')).toBe(true);
    expect(mid).toContain('etc');
  });

  it('closes the lips for a short gap between words, and rests for a long one', () => {
    const word = (a: number, b: number) => vowel(3, a, b, 700, 1200);
    // Gap of 1 frame (0.042 s) after frame 10, and a 12 frame gap later.
    const short = 10 / FPS + 0.5;
    const s = add(word(0, 10 / FPS), word(11 / FPS, 2), word(2.5, 3));
    const m = guessMouths(s, RATE, FPS, 72);
    expect(m[10]).toBe('MBP');
    expect(m[12]).not.toBe('rest');
    expect(m.slice(52, 60).every((x) => x === 'rest')).toBe(true);
    expect(short).toBeGreaterThan(0);
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

describe('frameFeatures', () => {
  it('is silent for nothing and tiny slices', () => {
    expect(frameFeatures(new Float32Array(2000), RATE).rms).toBe(0);
    expect(frameFeatures(new Float32Array(10).fill(0.5), RATE).rms).toBe(0);
  });
  it('reads the vowel resonances', () => {
    const f = frameFeatures(vowel(1, 0, 1, 750, 1200).subarray(0, 1837), RATE);
    expect(vowelFor(f)).toBe('A');
  });
});

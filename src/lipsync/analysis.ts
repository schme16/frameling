/**
 * Guessing mouth shapes from a recording. No cloud and no AI: for every frame it measures how loud the sound is, how
 * hissy it is and where the energy sits in the spectrum (a rough guide to the vowel), then tidies the guesses so the
 * mouth does not flicker. It is a starting point you can fix by hand, not a speech recogniser.
 */
import type { Mouth } from './chart';

export interface FrameFeatures {
  /** Loudness (root mean square, 0 to 1). */
  rms: number;
  /** Share of the energy above 3 kHz: high for "s" and "f", low for vowels. */
  hiss: number;
  /** Share of the energy above 4 kHz among the high part: sharp sounds like "s" are high. */
  sharp: number;
  /** Rough positions of the first two resonances, in Hz (0 = none found). */
  f1: number;
  f2: number;
}

export interface MouthOptions {
  /** The fewest frames a mouth stays before changing (default 2). Lips-closed beats are allowed to be shorter. */
  minHold?: number;
  /** Frames to look further ahead: the mouth leads the sound by this many frames (default 0). */
  lead?: number;
}

/** In-place radix-2 FFT. `re` and `im` must be a power of two long. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const MAX_FFT = 4096;

/** Loudness and spectrum of one slice of the recording. */
export function frameFeatures(seg: Float32Array, sampleRate: number): FrameFeatures {
  const none: FrameFeatures = { rms: 0, hiss: 0, sharp: 0, f1: 0, f2: 0 };
  if (seg.length < 32) return none;
  let sum = 0;
  for (let i = 0; i < seg.length; i++) sum += seg[i] * seg[i];
  const rms = Math.sqrt(sum / seg.length);
  if (rms < 1e-6) return none;

  // Window the middle of the slice (at most 4096 samples), so a long frame costs no more than a short one.
  const len = Math.min(seg.length, MAX_FFT);
  let n = 64;
  while (n < len) n <<= 1;
  const off = Math.floor((seg.length - len) / 2);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < len; i++) re[i] = seg[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1)));
  fft(re, im);
  const half = n / 2;
  const power = new Float64Array(half);
  for (let k = 1; k < half; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  const hz = sampleRate / n;
  const nyq = sampleRate / 2;
  const band = (a: number, b: number) => {
    let s = 0;
    const from = Math.max(1, Math.ceil(a / hz));
    const to = Math.min(half - 1, Math.floor(b / hz));
    for (let k = from; k <= to; k++) s += power[k];
    return s;
  };
  const top = Math.min(8000, nyq);
  const total = band(80, top);
  if (total <= 0) return { ...none, rms };
  const hiFrom = Math.min(3000, top * 0.6);
  const hiTotal = band(hiFrom, top);
  const sharpFrom = Math.min(4000, top * 0.75);
  const hiss = hiTotal / total;
  const sharp = hiTotal > 0 ? band(sharpFrom, top) / hiTotal : 0;

  // A smoothed spectrum, to find where the vowel resonances sit (the harmonics of the voice are smoothed over).
  const w = Math.max(1, Math.round(150 / hz));
  const pre = new Float64Array(half + 1);
  for (let k = 0; k < half; k++) pre[k + 1] = pre[k] + power[k];
  const smooth = new Float64Array(half);
  for (let k = 1; k < half; k++) smooth[k] = pre[Math.min(half, k + w + 1)] - pre[Math.max(0, k - w)];
  const peak = (a: number, b: number) => {
    let best = 0;
    let at = 0;
    for (let k = Math.max(1, Math.ceil(a / hz)); k <= Math.min(half - 1, Math.floor(b / hz)); k++) {
      if (smooth[k] > best) {
        best = smooth[k];
        at = k;
      }
    }
    return { at: at * hz, level: best };
  };
  const p1 = peak(250, 1000);
  const p2 = peak(Math.max(800, p1.at + 300), Math.min(3200, nyq));
  return { rms, hiss, sharp, f1: p1.level > 0 ? p1.at : 0, f2: p2.level > 0.04 * p1.level ? p2.at : 0 };
}

/** The vowel a voiced frame sounds most like, from its two resonances. */
export function vowelFor(f: FrameFeatures): Mouth {
  // Front vowels have a high second resonance (E), back ones a low one (O, U), and the open "ah" sits in between.
  if (f.f2 >= 1700) return f.f1 >= 620 ? 'A' : 'E';
  if (f.f2 < 1000) return f.f1 > 0 && f.f1 < 420 ? 'U' : 'O';
  if (f.f1 >= 560) return 'A';
  return f.f1 > 0 && f.f1 < 400 ? 'U' : 'O';
}

type Kind = 'sil' | 'hiss' | 'voiced';

/** Turns runs shorter than `min` frames into part of a neighbour, so nothing flickers. */
export function holdAtLeast(mouths: Mouth[], min: number, exempt: Mouth = 'MBP'): Mouth[] {
  const out = mouths.slice();
  if (min <= 1 || out.length < 2) return out;
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    let i = 0;
    while (i < out.length) {
      let j = i;
      while (j + 1 < out.length && out[j + 1] === out[i]) j++;
      const len = j - i + 1;
      if (len < min && out[i] !== exempt) {
        const prev = i > 0 ? out[i - 1] : null;
        const next = j + 1 < out.length ? out[j + 1] : null;
        let to: Mouth | null;
        if (prev && next) {
          // Prefer a neighbour that is not rest (the mouth should open early rather than late), then the longer one.
          const lenOf = (at: number, dir: 1 | -1) => {
            let k = at;
            while (k + dir >= 0 && k + dir < out.length && out[k + dir] === out[at]) k += dir;
            return Math.abs(k - at) + 1;
          };
          if (prev === 'rest' && next !== 'rest') to = next;
          else if (next === 'rest' && prev !== 'rest') to = prev;
          else to = lenOf(j + 1, 1) > lenOf(i - 1, -1) ? next : prev;
        } else to = prev ?? next;
        if (to && to !== out[i]) {
          for (let k = i; k <= j; k++) out[k] = to;
          changed = true;
        }
      }
      i = j + 1;
    }
    if (!changed) break;
  }
  return out;
}

/**
 * One mouth shape for each of `frames` frames, from a mono recording. Frame `i` covers the sound from `i / fps` to
 * `(i + 1) / fps` seconds. Silence is rest, a very short gap between sounds is lips closed (M B P), hissy sounds are
 * F V or etc, voiced sounds are a vowel (A, E, O, U) or L when quiet.
 */
export function guessMouths(samples: Float32Array, sampleRate: number, fps: number, frames: number, opts: MouthOptions = {}): Mouth[] {
  const minHold = opts.minHold ?? 2;
  const lead = Math.max(0, Math.round(opts.lead ?? 0));
  const feats: FrameFeatures[] = [];
  const perFrame = sampleRate / fps;
  for (let i = 0; i < frames; i++) {
    const a = Math.round(i * perFrame);
    const b = Math.min(samples.length, Math.round((i + 1) * perFrame));
    feats.push(a >= samples.length ? { rms: 0, hiss: 0, sharp: 0, f1: 0, f2: 0 } : frameFeatures(samples.subarray(a, b), sampleRate));
  }
  const peak = feats.reduce((m, f) => Math.max(m, f.rms), 0);
  const floor = Math.max(0.004, peak * 0.06);
  const kinds: Kind[] = feats.map((f) => (f.rms < floor ? 'sil' : f.hiss > 0.5 ? 'hiss' : 'voiced'));

  const mouths: Mouth[] = feats.map((f, i) => {
    if (kinds[i] === 'sil') return 'rest';
    if (kinds[i] === 'hiss') return f.sharp > 0.6 ? 'etc' : 'FV';
    // Quiet voiced frames (the "l" and "n" between vowels) are L.
    if (f.rms < peak * 0.22) return 'L';
    return vowelFor(f);
  });

  // Lips close for a plosive: a gap of one or two silent frames between speech, or a sudden quiet frame inside voiced speech.
  for (let i = 0; i < frames; ) {
    if (kinds[i] !== 'sil') {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < frames && kinds[j + 1] === 'sil') j++;
    if (j - i + 1 <= 2 && i > 0 && j < frames - 1) for (let k = i; k <= j; k++) mouths[k] = 'MBP';
    i = j + 1;
  }
  for (let i = 1; i < frames - 1; i++) {
    if (kinds[i] !== 'voiced' || kinds[i - 1] !== 'voiced' || kinds[i + 1] !== 'voiced') continue;
    const side = Math.min(feats[i - 1].rms, feats[i + 1].rms);
    if (side > peak * 0.25 && feats[i].rms < side * 0.35) mouths[i] = 'MBP';
  }

  let out = holdAtLeast(mouths, minHold);
  if (lead > 0) out = out.slice(lead).concat(Array<Mouth>(Math.min(lead, out.length)).fill('rest'));
  return out;
}

/** Folds channels into one (the average), for analysis. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels.reduce((m, c) => Math.max(m, c.length), 0);
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < c.length; i++) out[i] += c[i] / channels.length;
  return out;
}

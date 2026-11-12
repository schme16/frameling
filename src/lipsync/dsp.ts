/**
 * The listening part of lip sync: slices a recording into 10 ms steps and measures each one (loudness, how the energy is
 * spread across the spectrum, the vowel resonances found with linear prediction, how voiced it is), then adds how those
 * numbers move around it. Pure functions, no audio API, so it runs in a worker or a test.
 */

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

/** Linear prediction by Levinson-Durbin from autocorrelation `r` (length order + 1). Returns a[0..order] with a[0] = 1, or null if flat. */
export function levinson(r: ArrayLike<number>, order: number): Float64Array | null {
  if (!(r[0] > 0)) return null;
  const a = new Float64Array(order + 1);
  const tmp = new Float64Array(order + 1);
  a[0] = 1;
  let err = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;
    for (let j = 1; j < i; j++) tmp[j] = a[j] + k * a[i - j];
    for (let j = 1; j < i; j++) a[j] = tmp[j];
    a[i] = k;
    err *= 1 - k * k;
    if (!(err > 1e-12 * r[0])) break;
  }
  return a;
}

/** The step between measurements, in seconds. */
export const HOP = 0.01;
const WINDOW = 0.03;
/** Number of log-spaced bands that describe the spectrum's shape. */
export const BANDS = 12;
const BAND_EDGES = (() => {
  const e: number[] = [];
  const lo = 80;
  const hi = 7600;
  for (let i = 0; i <= BANDS; i++) e.push(lo * Math.pow(hi / lo, i / BANDS));
  return e;
})();
const LPC_BINS = 128;
const LPC_TOP = 5500;
const LPC_ORDER = 12;

/** What is measured at one step. */
export interface HopFeatures {
  /** Loudness in dB (mean square). */
  level: number;
  /** Spectrum shape: energy in each band in dB, minus the average of the bands. */
  bands: number[];
  /** Spectral centroid, log2 of Hz. */
  centroid: number;
  /** Vowel resonances from linear prediction, in Hz (a guess is filled in when none is found), and the first one's strength. */
  f1: number;
  f2: number;
  f3: number;
  /** How regular the sound is at voice pitches: 0 (noise) to 1 (a clean tone). */
  voicing: number;
}

const DB_FLOOR = -100;
const db = (x: number) => (x > 1e-10 ? 10 * Math.log10(x) : DB_FLOOR);

/** Measures one slice of a recording. `seg` is the window, already cut out. */
export function hopFeatures(seg: Float32Array, sampleRate: number): HopFeatures | null {
  const len = seg.length;
  if (len < 32) return null;
  let ms = 0;
  for (let i = 0; i < len; i++) ms += seg[i] * seg[i];
  ms /= len;
  const level = db(ms);
  let n = 64;
  while (n < len) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < len; i++) re[i] = seg[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1)));
  fft(re, im);
  const half = n / 2;
  const power = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  const hz = sampleRate / n;
  const nyq = sampleRate / 2;
  const sumBins = (a: number, b: number): number => {
    let s = 0;
    const from = Math.max(1, Math.ceil(a / hz));
    const to = Math.min(half - 1, Math.floor(b / hz));
    for (let k = from; k <= to; k++) s += power[k];
    return s;
  };
  // Band shape.
  const bandDb: number[] = [];
  let total = 0;
  let wsum = 0;
  for (let b = 0; b < BANDS; b++) {
    const e = BAND_EDGES[b] < nyq ? sumBins(BAND_EDGES[b], Math.min(BAND_EDGES[b + 1], nyq)) : 0;
    total += e;
    wsum += e * Math.sqrt(BAND_EDGES[b] * BAND_EDGES[b + 1]);
    bandDb.push(db(e / n / n));
  }
  const mean = bandDb.reduce((s, v) => s + v, 0) / BANDS;
  const bands = bandDb.map((v) => Math.max(-40, Math.min(40, v - mean)));
  const centroid = total > 0 ? Math.log2(wsum / total) : 9;

  // Spectral envelope by linear prediction on the band-limited, pre-emphasised power spectrum.
  const top = Math.min(LPC_TOP, nyq * 0.98);
  const bw = top / LPC_BINS;
  const ac = new Float64Array(2 * LPC_BINS);
  const acIm = new Float64Array(2 * LPC_BINS);
  for (let j = 0; j < LPC_BINS; j++) {
    const f0 = j * bw;
    const f1 = f0 + bw;
    const k0 = Math.max(0, Math.floor(f0 / hz));
    const k1 = Math.max(k0, Math.min(half, Math.ceil(f1 / hz) - 1));
    let p = 0;
    for (let k = k0; k <= k1; k++) p += power[k];
    p /= k1 - k0 + 1;
    const w = (Math.PI * (j + 0.5) * bw) / nyq;
    p *= 1.9409 - 1.94 * Math.cos(w);
    ac[j] = p;
    ac[2 * LPC_BINS - 1 - j] = p;
  }
  fft(ac, acIm);
  const r = new Float64Array(LPC_ORDER + 1);
  for (let i = 0; i <= LPC_ORDER; i++) r[i] = ac[i] * (1 - 0.0004 * i * i);
  r[0] *= 1.0001;
  let f1 = 0;
  let f2 = 0;
  let f3 = 0;
  const lpc = levinson(r, LPC_ORDER);
  if (lpc) {
    const pr = new Float64Array(2 * LPC_BINS);
    const pi = new Float64Array(2 * LPC_BINS);
    for (let i = 0; i <= LPC_ORDER; i++) pr[i] = lpc[i];
    fft(pr, pi);
    const env = new Float64Array(LPC_BINS + 1);
    for (let j = 0; j <= LPC_BINS; j++) env[j] = 1 / (pr[j] * pr[j] + pi[j] * pi[j] + 1e-12);
    const peaks: number[] = [];
    const binHz = top / LPC_BINS;
    for (let j = 2; j < LPC_BINS - 1; j++) {
      if (env[j] > env[j - 1] && env[j] >= env[j + 1]) {
        // Parabolic refinement of the peak position.
        const a = Math.log(env[j - 1]);
        const b = Math.log(env[j]);
        const c = Math.log(env[j + 1]);
        const d = a - 2 * b + c;
        const off = d < 0 ? (0.5 * (a - c)) / d : 0;
        peaks.push((j + off) * binHz);
      }
    }
    const inRange = peaks.filter((f) => f >= 180);
    f1 = inRange.find((f) => f < 1200) ?? 0;
    f2 = inRange.find((f) => f > f1 + 200) ?? 0;
    f3 = inRange.find((f) => f > f2 + 300) ?? 0;
  }

  // Voicing: the strongest regular repeat at voice pitches in the low part of the spectrum.
  let voicing = 0;
  {
    const lowTop = Math.min(1000, nyq);
    const kTop = Math.min(half, Math.floor(lowTop / hz));
    const cr = new Float64Array(n);
    const ci = new Float64Array(n);
    for (let k = 1; k <= kTop; k++) {
      cr[k] = power[k];
      cr[n - k] = power[k];
    }
    fft(cr, ci);
    const lagMin = Math.max(2, Math.floor(sampleRate / 400));
    const lagMax = Math.min(n / 2 - 1, Math.ceil(sampleRate / 70));
    let best = 0;
    for (let lag = lagMin; lag <= lagMax; lag++) if (cr[lag] > best) best = cr[lag];
    voicing = cr[0] > 0 ? Math.max(0, Math.min(1, best / cr[0])) : 0;
  }
  return { level, bands, centroid, f1: f1 || 500, f2: f2 || 1500, f3: f3 || 2600, voicing };
}

/** The number of numbers `stepFeatures` gives for each step. */
export const FEATURE_COUNT = 1 + 1 + BANDS + 1 + 3 + 1 + 6 + 2 + 2 + 2;
const DELTAS = [-6, -4, -2, 2, 4, 6];

const SILENT: HopFeatures = { level: DB_FLOOR, bands: Array<number>(BANDS).fill(0), centroid: 9, f1: 500, f2: 1500, f3: 2600, voicing: 0 };

/** How many 10 ms steps a recording has. */
export const stepCount = (length: number, sampleRate: number): number => Math.max(0, Math.ceil(length / (HOP * sampleRate)));

/** Measures steps `from` up to (not including) `to`. Split a long recording into ranges to keep a page responsive. */
export function measureSteps(samples: Float32Array, sampleRate: number, from: number, to: number): HopFeatures[] {
  const win = Math.round(WINDOW * sampleRate);
  const hopSamples = HOP * sampleRate;
  const out: HopFeatures[] = [];
  for (let h = from; h < to; h++) {
    const centre = Math.round((h + 0.5) * hopSamples);
    const a = Math.max(0, centre - (win >> 1));
    const b = Math.min(samples.length, a + win);
    out.push((centre >= samples.length ? null : hopFeatures(samples.subarray(a, b), sampleRate)) ?? SILENT);
  }
  return out;
}

/** Same as `measureSteps` for the whole recording at once, then `stepRows`. */
export function stepFeatures(samples: Float32Array, sampleRate: number): Float32Array[] {
  return stepRows(measureSteps(samples, sampleRate, 0, stepCount(samples.length, sampleRate)));
}

/**
 * One row of numbers for every step, ready for the classifier: the step's own measurements, how it compares with the
 * loudest and quietest parts of the whole recording, and how loudness, voicing and brightness move around it (the dips
 * that mean lips closing).
 */
export function stepRows(feats: HopFeatures[]): Float32Array[] {
  const levels = feats.map((f) => f.level).filter((v) => v > DB_FLOOR);
  levels.sort((x, y) => x - y);
  const pick = (q: number) => (levels.length ? levels[Math.min(levels.length - 1, Math.floor(q * levels.length))] : DB_FLOOR);
  const loud = pick(0.95);
  const quiet = Math.min(pick(0.05), loud - 3);
  const out: Float32Array[] = [];
  const at = (i: number) => feats[Math.max(0, Math.min(feats.length - 1, i))];
  for (let h = 0; h < feats.length; h++) {
    const f = feats[h];
    const row: number[] = [];
    row.push(Math.max(-60, f.level - loud) / 20);
    row.push(Math.max(0, Math.min(60, f.level - quiet)) / 20);
    for (const b of f.bands) row.push(b / 10);
    row.push((f.centroid - 9) / 1.5);
    row.push(Math.log2(f.f1 / 500));
    row.push(Math.log2(f.f2 / 1500));
    row.push(Math.log2(f.f3 / 2600));
    row.push(f.voicing);
    for (const d of DELTAS) row.push(Math.max(-60, Math.min(60, at(h + d).level - f.level)) / 20);
    row.push(at(h - 3).voicing, at(h + 3).voicing);
    row.push((at(h - 3).centroid - f.centroid) / 1.5, (at(h + 3).centroid - f.centroid) / 1.5);
    // The loudest of the sound just before and just after: a dip between two loud parts is a closure.
    let before = DB_FLOOR;
    let after = DB_FLOOR;
    for (let k = 3; k <= 10; k++) {
      before = Math.max(before, at(h - k).level);
      after = Math.max(after, at(h + k).level);
    }
    row.push(Math.max(0, Math.min(60, Math.min(before, after) - f.level)) / 20);
    row.push(Math.max(0, Math.min(60, Math.max(before, after) - f.level)) / 20);
    out.push(Float32Array.from(row));
  }
  return out;
}

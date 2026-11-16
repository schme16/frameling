/**
 * Guessing mouth shapes from a recording. No cloud: it listens in 10 ms steps (loudness, spectrum shape, vowel resonances,
 * how voiced it is, and how those move), a tiny classifier turns each step into odds for each mouth, the odds are pooled
 * into animation frames, and a smoothing pass keeps the mouth from flickering. It is a starting point you can fix by
 * hand, not a speech recogniser.
 */
import type { Mouth } from './chart';
import { HOP, measureSteps, stepCount, stepRows, type HopFeatures } from './dsp';
import { classifySteps } from './classify';
import { alignLine, blendAligned } from './align';
import { lineMouths, type Expected } from './text';

export { fft } from './dsp';

export interface MouthOptions {
  /** The fewest frames a mouth stays before changing (default 2). Lips-closed beats are allowed to be shorter. */
  minHold?: number;
  /** Frames to look further ahead: the mouth leads the sound by this many frames (default 0). */
  lead?: number;
  /** What is said, typed in. Lines the sounds up with the words, which fixes many wrong guesses. */
  text?: string;
  /** The sounds of the typed words, already worked out (expectedFromText in dict.ts, which knows how words are said); used instead of `text` when given. */
  expected?: Expected[];
  /** Settings for the pooling and smoothing steps (the defaults were tuned on the reference set; scripts/lipsync/eval.mjs takes overrides). */
  tune?: Partial<Tuning>;
}

export interface Tuning {
  /** How much more a lip-closing frame counts when pooling the steps in a frame (a short closure is easy to lose). */
  mbpBoost: number;
  fvBoost: number;
  /** The cost of changing mouth between frames, in log-odds. Higher is steadier. */
  switchCost: number;
  /** How far to trust the typed line over the sound, 0 to 1 (only when a line is given). */
  textWeight: number;
}

/** Below this loudness (dB, mean square; about 0.00016 rms) a step is silence. */
const SILENT_DB = -76;

export const DEFAULT_TUNING: Tuning = { mbpBoost: 2, fvBoost: 1.2, switchCost: 0.8, textWeight: 0.4 };

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
 * Picks one mouth per frame from per-frame odds, by the best path through the frames where every change of mouth costs
 * `switchCost` and no mouth stays for fewer than `minHold` frames (the `free` mouth may be shorter: a lip closure is brief).
 */
export function smoothPath(odds: Float32Array[], switchCost: number, minHold = 1, free = -1): number[] {
  const n = odds.length;
  if (!n) return [];
  const k = odds[0].length;
  const hold = Math.max(1, Math.round(minHold));
  // State (c, r): mouth c, having been on for r frames (r stops counting at `hold`).
  const S = k * hold;
  const at = (c: number, r: number) => c * hold + (r - 1);
  let score = new Float64Array(S).fill(-Infinity);
  for (let c = 0; c < k; c++) score[at(c, 1)] = Math.log(odds[0][c] + 1e-6);
  const from: Int16Array[] = [];
  const settled = (c: number) => (c === free ? 1 : hold);
  for (let i = 1; i < n; i++) {
    const next = new Float64Array(S).fill(-Infinity);
    const back = new Int16Array(S);
    // The best settled state of each mouth is where a change can start from.
    let bestA = -1;
    let bestB = -1;
    for (let c = 0; c < k; c++) {
      for (let r = settled(c); r <= hold; r++) {
        const st = at(c, r);
        if (bestA < 0 || score[st] > score[bestA]) {
          bestB = bestA;
          bestA = st;
        } else if (bestB < 0 || score[st] > score[bestB]) bestB = st;
      }
    }
    const mouthOf = (st: number) => Math.floor(st / hold);
    for (let c = 0; c < k; c++) {
      const e = Math.log(odds[i][c] + 1e-6);
      // A new run starts from the best settled state of a different mouth.
      const origin = bestA >= 0 && mouthOf(bestA) !== c ? bestA : bestB;
      if (origin >= 0 && mouthOf(origin) !== c && score[origin] > -Infinity) {
        next[at(c, 1)] = score[origin] - switchCost + e;
        back[at(c, 1)] = origin;
      }
      // A run goes on: one frame longer, and once at the cap it stays there.
      for (let r = 2; r <= hold; r++) {
        let bv = score[at(c, r - 1)];
        let bs = at(c, r - 1);
        if (r === hold && score[at(c, r)] > bv) ((bv = score[at(c, r)]), (bs = at(c, r)));
        if (bv > -Infinity) {
          next[at(c, r)] = bv + e;
          back[at(c, r)] = bs;
        }
      }
      if (hold === 1 && score[at(c, 1)] > -Infinity && score[at(c, 1)] + e > next[at(c, 1)]) {
        next[at(c, 1)] = score[at(c, 1)] + e;
        back[at(c, 1)] = at(c, 1);
      }
    }
    score = next;
    from.push(back);
  }
  let end = 0;
  for (let st = 1; st < S; st++) if (score[st] > score[end]) end = st;
  const path = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    path[i] = Math.floor(end / hold);
    if (i > 0) end = from[i - 1][end];
  }
  return path;
}

/** Pools the per-step odds into per-frame odds: the average over the steps whose middle falls inside the frame. */
export function poolSteps(steps: Float32Array[], fps: number, frames: number, boosts: Partial<Record<Mouth, number>> = {}, classes: readonly Mouth[]): Float32Array[] {
  const out: Float32Array[] = [];
  const mult = classes.map((c) => boosts[c] ?? 1);
  for (let i = 0; i < frames; i++) {
    const a = Math.ceil((i / fps) / HOP - 0.5);
    const b = Math.ceil(((i + 1) / fps) / HOP - 0.5) - 1;
    const row = new Float32Array(classes.length);
    let cnt = 0;
    for (let h = Math.max(0, a); h <= Math.min(steps.length - 1, Math.max(a, b)); h++) {
      for (let c = 0; c < row.length; c++) row[c] += steps[h][c];
      cnt++;
    }
    if (!cnt) row[classes.indexOf('rest')] = 1;
    else {
      let sum = 0;
      for (let c = 0; c < row.length; c++) sum += row[c] = (row[c] / cnt) * mult[c];
      for (let c = 0; c < row.length; c++) row[c] /= sum;
    }
    out.push(row);
  }
  return out;
}

/** From the measurements of every step to one mouth per frame: classify, line up the typed line, pool, smooth. */
function mouthsFromSteps(feats: HopFeatures[], fps: number, frames: number, opts: MouthOptions): Mouth[] {
  const minHold = opts.minHold ?? 2;
  const lead = Math.max(0, Math.round(opts.lead ?? 0));
  const tune = { ...DEFAULT_TUNING, ...opts.tune };
  let { odds, classes } = classifySteps(stepRows(feats));
  // Nothing but a whisper of sound is rest, however quiet the rest of the recording is.
  const restAt = classes.indexOf('rest');
  odds = odds.map((p, t) => (feats[t].level < SILENT_DB ? Float32Array.from(p, (_, c) => (c === restAt ? 1 : 0)) : p));
  const expected = opts.expected ?? (opts.text ? lineMouths(opts.text) : []);
  if (expected.length) {
    const aligned = alignLine(odds, classes, expected);
    if (aligned) odds = blendAligned(odds, classes, aligned, tune.textWeight);
  }
  const pooled = poolSteps(odds, fps, frames, { MBP: tune.mbpBoost, FV: tune.fvBoost }, classes);
  const mouths = smoothPath(pooled, tune.switchCost, minHold, classes.indexOf('MBP')).map((c) => classes[c]);
  let out = holdAtLeast(mouths, minHold);
  if (lead > 0) out = out.slice(lead).concat(Array<Mouth>(Math.min(lead, out.length)).fill('rest'));
  return out;
}

/**
 * One mouth shape for each of `frames` frames, from a mono recording. Frame `i` covers the sound from `i / fps` to
 * `(i + 1) / fps` seconds. Silence is rest, closed lips are M B P, hissy sounds are F V or etc, voiced sounds are a vowel
 * (A, E, O, U) or L.
 */
export function guessMouths(samples: Float32Array, sampleRate: number, fps: number, frames: number, opts: MouthOptions = {}): Mouth[] {
  return mouthsFromSteps(measureSteps(samples, sampleRate, 0, stepCount(samples.length, sampleRate)), fps, frames, opts);
}

/** Same as `guessMouths`, but hands control back to the page every few milliseconds so a long sound does not freeze it. */
export async function guessMouthsAsync(samples: Float32Array, sampleRate: number, fps: number, frames: number, opts: MouthOptions = {}, onProgress?: (done: number) => void): Promise<Mouth[]> {
  const total = stepCount(samples.length, sampleRate);
  const feats: HopFeatures[] = [];
  const chunk = 200;
  for (let from = 0; from < total; from += chunk) {
    feats.push(...measureSteps(samples, sampleRate, from, Math.min(total, from + chunk)));
    onProgress?.(Math.min(1, (from + chunk) / total));
    await new Promise<void>((r) => setTimeout(r, 0));
  }
  return mouthsFromSteps(feats, fps, frames, opts);
}

/** Folds channels into one (the average), for analysis. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels.reduce((m, c) => Math.max(m, c.length), 0);
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < c.length; i++) out[i] += c[i] / channels.length;
  return out;
}

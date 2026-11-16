import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guessMouths, DEFAULT_TUNING } from '../../src/lipsync/analysis';
import { MODEL_CLASSES, MODEL_FEATURES, MODEL_HIDDEN, W1, B1, W2, B2 } from '../../src/lipsync/model';
import { FEATURE_COUNT } from '../../src/lipsync/dsp';
import { expectedFromText } from '../../src/lipsync/dict';
import type { Mouth } from '../../src/lipsync/chart';

describe('the classifier numbers', () => {
  it('fit the measurements and the mouths', () => {
    expect(MODEL_FEATURES).toBe(FEATURE_COUNT);
    expect(MODEL_CLASSES).toEqual(['rest', 'A', 'E', 'O', 'U', 'MBP', 'FV', 'L', 'WQ', 'etc']);
    expect(W1.length).toBe(MODEL_FEATURES * MODEL_HIDDEN);
    expect(B1.length).toBe(MODEL_HIDDEN);
    expect(W2.length).toBe(MODEL_HIDDEN * MODEL_CLASSES.length);
    expect(B2.length).toBe(MODEL_CLASSES.length);
    for (const a of [W1, B1, W2, B2]) expect(a.every((x) => Number.isFinite(x) && Math.abs(x) < 50)).toBe(true);
  });

  it('weigh a closed-lips step double when pooling a frame', () => {
    expect(DEFAULT_TUNING.mbpBoost).toBe(2);
  });
});

// Real recordings are somebody's own voice, so they are never in the repository. When LIPSYNC_REAL_DIR points at the
// folder scripts/lipsync/real_voice.py made (real-N.wav, real-N.json, kinds.json), the guesser is scored on them; with
// no folder the whole block is skipped.
const dir = process.env.LIPSYNC_REAL_DIR ?? '';
const haveReal = !!dir && existsSync(join(dir, 'kinds.json'));

function readWav(path: string): { samples: Float32Array; rate: number } {
  const b = readFileSync(path);
  const out = new Float32Array((b.length - 44) / 2);
  for (let i = 0; i < out.length; i++) out[i] = b.readInt16LE(44 + i * 2) / 32768;
  return { samples: out, rate: b.readUInt32LE(24) };
}

/** The mouth for each frame: the phoneme covering most of it, lip closures counting extra (as scripts/lipsync/wav.mjs does). */
function truthFrames(phonemes: { mouth: Mouth; start: number; end: number }[], fps: number, frames: number): Mouth[] {
  const weight: Partial<Record<Mouth, number>> = { MBP: 1.8, FV: 1.4 };
  const out: Mouth[] = [];
  for (let f = 0; f < frames; f++) {
    const score = new Map<Mouth, number>();
    for (const p of phonemes) {
      const o = Math.min((f + 1) / fps, p.end) - Math.max(f / fps, p.start);
      if (o > 0) score.set(p.mouth, (score.get(p.mouth) ?? 0) + o * (weight[p.mouth] ?? 1));
    }
    let best: Mouth = 'rest';
    let bv = 0;
    for (const [m, v] of score) if (v > bv) ((bv = v), (best = m));
    out.push(best);
  }
  return out;
}

describe.skipIf(!haveReal)('real recordings (only when LIPSYNC_REAL_DIR is set)', () => {
  it('are guessed well above chance, whispered ones too', async () => {
    const kinds = JSON.parse(readFileSync(join(dir, 'kinds.json'), 'utf8')) as { i: number; kind: string; text: string }[];
    const hit: Record<string, [number, number]> = {};
    for (const k of kinds) {
      const meta = JSON.parse(readFileSync(join(dir, `real-${k.i}.json`), 'utf8'));
      const wav = readWav(join(dir, `real-${k.i}.wav`));
      const frames = Math.ceil((wav.samples.length / wav.rate) * 24);
      const truth = truthFrames(meta.phonemes, 24, frames);
      const guess = guessMouths(wav.samples, wav.rate, 24, frames, { expected: await expectedFromText(k.text) });
      for (const tag of [k.kind, 'all']) {
        const e = (hit[tag] ??= [0, 0]);
        truth.forEach((t, i) => t !== 'rest' && (e[1]++, t === guess[i] && e[0]++));
      }
    }
    const acc = (t: string) => hit[t][0] / hit[t][1];
    // The classifier was adjusted on these clips, so this is a floor against breaking it, not a measure of how it copes with new voices.
    expect(acc('all')).toBeGreaterThan(0.5);
    expect(acc('whispered')).toBeGreaterThan(0.4);
  });
});

/** Runs the tiny mouth classifier (src/lipsync/model.ts) over the measurements of each 10 ms step. */
import type { Mouth } from './chart';
import { B1, B2, MODEL_CLASSES, MODEL_FEATURES, MODEL_HIDDEN, W1, W2 } from './model';

export interface StepOdds {
  /** For each step, the odds of each mouth in `classes` (they add up to 1). */
  odds: Float32Array[];
  classes: readonly Mouth[];
}

export function classifySteps(rows: Float32Array[]): StepOdds {
  const nc = MODEL_CLASSES.length;
  const nh = MODEL_HIDDEN;
  const nf = MODEL_FEATURES;
  const hidden = new Float64Array(nh);
  const odds: Float32Array[] = [];
  for (const x of rows) {
    for (let j = 0; j < nh; j++) {
      let s = B1[j];
      for (let i = 0; i < nf; i++) s += x[i] * W1[i * nh + j];
      hidden[j] = Math.tanh(s);
    }
    const z = new Float32Array(nc);
    let mx = -Infinity;
    for (let c = 0; c < nc; c++) {
      let s = B2[c];
      for (let j = 0; j < nh; j++) s += hidden[j] * W2[j * nc + c];
      z[c] = s;
      if (s > mx) mx = s;
    }
    let sum = 0;
    for (let c = 0; c < nc; c++) sum += z[c] = Math.exp(z[c] - mx);
    for (let c = 0; c < nc; c++) z[c] /= sum;
    odds.push(z);
  }
  return { odds, classes: MODEL_CLASSES as unknown as readonly Mouth[] };
}

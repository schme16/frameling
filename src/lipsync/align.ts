/**
 * Lining up a typed line with a recording. The expected mouths (src/lipsync/text.ts) become a chain of states and the
 * recording's step-by-step odds say how well each state fits each moment; the best path through the chain, with
 * sounds that last about as long as speech sounds do, tells when each one is said. Pure functions.
 */
import type { Mouth } from './chart';
import type { Expected } from './text';

const VOWEL_GROUP: Mouth[] = ['A', 'E', 'O', 'U', 'WQ'];
const CONSONANT_GROUP: Mouth[] = ['FV', 'L', 'etc'];

interface State {
  mouth: Mouth;
  /** Chance of staying in this state for another 10 ms step. */
  stay: number;
  /** A pause between words, which may be skipped. */
  pause?: boolean;
}

function groupOf(m: Mouth): Mouth[] {
  if (VOWEL_GROUP.includes(m)) return VOWEL_GROUP;
  if (CONSONANT_GROUP.includes(m)) return CONSONANT_GROUP;
  return [m];
}

/**
 * The mouth the line says at each step (or `rest`), found by aligning `expected` to `odds`. Returns null when there is
 * nothing to line up.
 */
export function alignLine(odds: Float32Array[], classes: readonly Mouth[], expected: Expected[]): Mouth[] | null {
  const T = odds.length;
  if (!T || !expected.length) return null;
  const states: State[] = [{ mouth: 'rest', stay: 0.97 }];
  for (const e of expected) {
    if (e.word && states.length > 1) states.push({ mouth: 'rest', stay: 0.9, pause: true });
    const vowel = VOWEL_GROUP.includes(e.mouth) && e.mouth !== 'WQ';
    states.push({ mouth: e.mouth, stay: vowel ? 0.88 : 0.78 });
  }
  states.push({ mouth: 'rest', stay: 0.97 });
  const S = states.length;
  const idx = (m: Mouth) => classes.indexOf(m);
  const restIx = idx('rest');
  // Emission (log) for a mouth state at a step: its own odds mostly, plus the odds of its kind (a wrong vowel is a smaller miss).
  const groupIx = states.map((s) => groupOf(s.mouth).map(idx));
  const emit = (s: number, t: number): number => {
    const st = states[s];
    const p = odds[t];
    if (st.mouth === 'rest') return Math.log(0.9 * p[restIx] + 0.02);
    let g = 0;
    for (const c of groupIx[s]) g += p[c];
    return Math.log(0.4 * p[idx(st.mouth)] + 0.5 * g + 0.01);
  };
  const stayCost = states.map((s) => Math.log(s.stay));
  const leaveCost = states.map((s) => Math.log(1 - s.stay));
  let score = new Float64Array(S).fill(-Infinity);
  score[0] = emit(0, 0);
  if (S > 1) score[1] = emit(1, 0) - 2;
  const back: Int8Array[] = [];
  for (let t = 1; t < T; t++) {
    const next = new Float64Array(S).fill(-Infinity);
    const bk = new Int8Array(S);
    for (let s = 0; s < S; s++) {
      let best = score[s] + stayCost[s];
      let from = 0;
      if (s > 0 && score[s - 1] + leaveCost[s - 1] > best) {
        best = score[s - 1] + leaveCost[s - 1];
        from = 1;
      }
      // Skip over an optional pause.
      if (s > 1 && states[s - 1].pause && score[s - 2] + leaveCost[s - 2] - 0.5 > best) {
        best = score[s - 2] + leaveCost[s - 2] - 0.5;
        from = 2;
      }
      if (best > -Infinity) next[s] = best + emit(s, t);
      bk[s] = from;
    }
    score = next;
    back.push(bk);
  }
  // The line may end in the last sound or in the final rest.
  let end = S - 1;
  if (S > 1 && score[S - 2] > score[end]) end = S - 2;
  const path = new Array<number>(T);
  for (let t = T - 1; t >= 0; t--) {
    path[t] = end;
    if (t > 0) end -= back[t - 1][end];
  }
  return path.map((s) => states[s].mouth);
}

/** Blends the recording's odds with the aligned line: `weight` of the line's mouth, the rest from the recording. */
export function blendAligned(odds: Float32Array[], classes: readonly Mouth[], aligned: Mouth[], weight: number): Float32Array[] {
  return odds.map((p, t) => {
    const row = new Float32Array(p.length);
    const a = classes.indexOf(aligned[t]);
    for (let c = 0; c < p.length; c++) row[c] = (1 - weight) * p[c] + (c === a ? weight : 0);
    return row;
  });
}

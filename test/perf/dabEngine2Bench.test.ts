// What the second brush engine round costs: pressure curves, a blend mode and wet paint, against the same strokes without them,
// and the plain strokes against an older copy of src/ (DAB_SRC=<folder holding that src>), so a change to the shared path shows.
// Skipped unless DAB_BENCH2=1 (it measures time, so it never asserts on it). Runs are interleaved and the fastest of each is kept,
// which is steadier than a median on a machine other agents are using; read the ratios, not the milliseconds.
//   DAB_BENCH2=1 DAB_BENCH2_OUT=file.json npx vitest run test/perf/dabEngine2Bench.test.ts
//   DAB_BENCH2=1 DAB_SRC=/path/to/old/src DAB_BENCH2_OUT=old.json npx vitest run test/perf/dabEngine2Bench.test.ts
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';

const W = 1024;
const H = 512;
const wave = (n: number) => Array.from({ length: n }, (_, i) => ({ x: 60 + (i / (n - 1)) * (W - 120), y: H / 2 + Math.sin((i / (n - 1)) * Math.PI * 6) * 150, p: 0.1 + 0.9 * Math.abs(Math.sin((i / (n - 1)) * Math.PI * 3)) }));
const PTS = wave(120);

describe.skipIf(!process.env.DAB_BENCH2)('second brush engine round: cost', () => {
  it('times the strokes', async () => {
    const root = process.env.DAB_SRC ?? '../../src';
    const { bufferSurface, DabStroke } = await import(/* @vite-ignore */ `${root}/dab/stroke`);
    const { DEFAULT_DAB } = await import(/* @vite-ignore */ `${root}/dab/maths`);
    // Three points on the diagonal: the same marks as no curve, so the time difference is the curve and nothing else.
    const FEEL = [[0, 0], [0.5, 0.5], [1, 1]];
    const press = (curve?: number[][]) => [{ from: 'pressure', to: 'size', amount: 0.9, invert: false, ...(curve ? { curve } : {}) }];
    const base = { ...DEFAULT_DAB, spacing: 0.1, aliased: false, hardness: 0.8 };
    const cases: Record<string, { brush: Record<string, unknown>; size: number; needs?: string }> = {
      'plain-40': { brush: base, size: 40 },
      'plain-hard-300': { brush: { ...base, hardness: 1 }, size: 300 },
      'pressure-40': { brush: { ...base, dynamics: press() }, size: 40 },
      'pressure-curve-40': { brush: { ...base, dynamics: press(FEEL) }, size: 40, needs: 'curve' },
      'multiply-40': { brush: { ...base, blend: 'multiply' }, size: 40, needs: 'blend' },
      'wet-40': { brush: { ...base, wet: 0.7 }, size: 40 },
    };
    const run = (c: (typeof cases)[string]): number => {
      const px = new Uint8ClampedArray(W * H * 4);
      for (let i = 0; i < W * H; i++) px.set([240, 220, 120, 255], i * 4);
      const t0 = performance.now();
      const s = new DabStroke(bufferSurface(px, W, H), { brush: c.brush, color: [60, 90, 200, 255], edge: 'smooth', seed: 1 });
      for (const p of PTS) s.moveTo(p, c.size, 1, { pressure: p.p });
      s.finish();
      return performance.now() - t0;
    };
    const names = Object.keys(cases).filter((n) => !cases[n].needs || !process.env.DAB_SRC);
    const best: Record<string, number> = {};
    for (const n of names) run(cases[n]);
    for (let r = 0; r < Number(process.env.DAB_BENCH2_REPS ?? 7); r++) for (const n of names) best[n] = Math.min(best[n] ?? Infinity, run(cases[n]));
    for (const n of names) best[n] = Math.round(best[n] * 10) / 10;
    const ratios: Record<string, number> = {};
    const r2 = (a: string, b: string) => {
      if (best[a] && best[b]) ratios[`${a} / ${b}`] = Math.round((best[a] / best[b]) * 100) / 100;
    };
    r2('pressure-curve-40', 'pressure-40');
    r2('multiply-40', 'plain-40');
    r2('wet-40', 'plain-40');
    const out = { best, ratios };
    if (process.env.DAB_BENCH2_OUT) writeFileSync(process.env.DAB_BENCH2_OUT, JSON.stringify(out, null, 2));
    // eslint-disable-next-line no-console
    process.stderr.write(JSON.stringify(out) + '\n');
  });
});

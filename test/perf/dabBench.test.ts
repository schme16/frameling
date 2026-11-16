// Speed of one stroke through a real pixel session: the soft paint engine against the dab engine, for the same wave across a
// big sprite. Skipped unless DAB_BENCH=1 (it measures time, so it never asserts on it); DAB_BENCH_OUT=<file> saves the numbers.
//   DAB_BENCH=1 DAB_BENCH_OUT=scripts/perf/results/dab-after.json npx vitest run test/perf/dabBench.test.ts
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { PixelLayer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { setPixelSettings } from '../../src/pixel/settings';
import { PixelSession } from '../../src/tools/pixelSession';
import { SoftStroke } from '../../src/soft/stroke';
import { DEFAULT_DAB } from '../../src/dab/maths';
import { sessionStroke } from '../../src/dab/stroke';

const W = 2048;
const H = 512;
const wave = (n: number) => Array.from({ length: n }, (_, i) => ({ x: 80 + (i / (n - 1)) * (W - 160), y: H / 2 + Math.sin((i / (n - 1)) * Math.PI * 6) * 120 }));
const PTS = wave(120);

function session() {
  resetStore(newDoc({ width: W, height: H, pixel: { pixelSize: 1 } }));
  setPixelSettings({ symmetry: 'off' });
  const { doc, ui } = store().get();
  const layer = doc.layers[0] as PixelLayer;
  return { doc, layer, s: new PixelSession(doc, layer, ui.frame, { adds: true }) };
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

function time(run: () => void, reps = 5): number {
  run();
  const t: number[] = [];
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    run();
    t.push(performance.now() - t0);
  }
  return Math.round(median(t) * 10) / 10;
}

describe.skipIf(!process.env.DAB_BENCH)('dab engine speed', () => {
  it('times a stroke at several sizes', () => {
    const out: Record<string, number> = {};
    for (const size of [8, 40, 120, 300]) {
      for (const hardness of [0.5, 1]) {
        const key = `${size}px-h${hardness}`;
        out[`soft:${key}`] = time(() => {
          const { doc, layer, s } = session();
          const st = new SoftStroke(s, doc, layer, { kind: 'soft-brush', color: [220, 40, 40, 255], hardness, edge: 'smooth' });
          for (const p of PTS) st.moveTo(p, size, 1);
        });
        out[`dab:${key}`] = time(() => {
          const { doc, layer, s } = session();
          const st = sessionStroke(s, doc, layer, { brush: { ...DEFAULT_DAB, size, hardness, aliased: false, spacing: 0.1 }, color: [220, 40, 40, 255], edge: 'smooth' });
          for (const p of PTS) st.moveTo(p, size, 1);
          st.finish();
        });
        out[`dab-sharp:${key}`] = time(() => {
          const { doc, layer, s } = session();
          const st = sessionStroke(s, doc, layer, { brush: { ...DEFAULT_DAB, size, hardness, aliased: true, spacing: 0.25 }, color: [220, 40, 40, 255], edge: 'crisp' });
          for (const p of PTS) st.moveTo(p, size, 1);
          st.finish();
        });
      }
    }
    const text = JSON.stringify(out, null, 2);
    process.stdout.write(`\n${text}\n`);
    if (process.env.DAB_BENCH_OUT) writeFileSync(process.env.DAB_BENCH_OUT, text);
  }, 600_000);
});

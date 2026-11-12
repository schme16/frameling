import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, PathShape, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { aliasId, makeVariation } from '../../src/artboards/variations';
import { activeId, findArtboard, switchArtboard } from '../../src/artboards/model';

const rect = (id: string, fill: string): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }] }], fill, stroke: null, opacity: 1 });

/** 40 layers of 240 keys each (9,600 keys), one drawing per key. */
export function big(layers = 40, keys = 240): Doc {
  const doc = newDoc({ name: 'Big', width: 200, height: 100, length: keys, fps: 12 });
  doc.layers = [];
  for (let l = 0; l < layers; l++) {
    const layer = { ...newVectorLayer(`L${l}`), id: `L${l}` };
    for (let k = 0; k < keys; k++) {
      const id = `d${l}_${k}`;
      doc.drawings[id] = { id, kind: 'vector', shapes: [rect(`s${l}_${k}`, '#ff0000')] } as VectorDrawing;
      layer.cels.push({ id: `c${l}_${k}`, start: k, length: 1, drawingId: id });
    }
    doc.layers.push(layer);
  }
  return doc;
}

const update = (label: string, fn: (d: Doc) => void) => store().update(label, (d) => fn(d as Doc));
const time = (fn: () => void, n = 30): number => {
  fn();
  const t = performance.now();
  for (let i = 0; i < n; i++) fn();
  return (performance.now() - t) / n;
};

function measure(count: number): string {
  resetStore(big());
  let n = 0;
  const edit = () =>
    update('Nudge', (d) => {
      ((d.drawings['d5_7'] as VectorDrawing).shapes[0] as PathShape).opacity = (n++ % 2) / 4 + 0.5;
    });
  const plain = time(edit);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) update('Make', (d) => void ids.push(makeVariation(d, activeId(d))!));
  const original = time(edit);
  // Opening a variation gives every key its own drawing; going back drops the copies it does not override.
  const home = activeId(store().get().doc);
  const switching = time(() => {
    update('Open', (d) => void switchArtboard(d, ids[0]));
    update('Back', (d) => void switchArtboard(d, home));
  }, 5);
  update('Open', (d) => void switchArtboard(d, ids[0]));
  const v = aliasId('d5_7', ids[0]);
  let m = 0;
  const inVariation = time(() =>
    update('Nudge', (d) => {
      ((d.drawings[v] as VectorDrawing).shapes[0] as PathShape).opacity = (m++ % 2) / 4 + 0.5;
    }),
  );
  let q = 0;
  const layerEdit = time(() =>
    update('Layer', (d) => {
      d.layers[3].opacity = (q++ % 2) / 4 + 0.5;
    }),
  );
  expect(findArtboard(store().get().doc, ids[0])!.overrides).toBeTruthy();
  return `${count} variation(s), 9,600 keys: no variations ${plain.toFixed(2)} ms | edit a drawing of the original ${original.toFixed(2)} ms | edit a drawing in the open variation ${inVariation.toFixed(2)} ms | layer look in the open variation ${layerEdit.toFixed(2)} ms | open and close it ${switching.toFixed(2)} ms`;
}

// A benchmark, not a check: it only prints timings, and on a busy machine it can outlast the usual test timeout.
// Run it with VARIATIONS_PERF=1 npx vitest run test/artboards/variationsPerf.test.ts.
describe.runIf(process.env.VARIATIONS_PERF)('variations: cost of an edit (prints ms, asserts nothing about time)', () => {
  it('one variation', () => void console.log('PERF', measure(1)), 120_000);
  it('four variations', () => void console.log('PERF', measure(4)), 120_000);
});

// A stroke's commit on a big canvas: only the touched rectangle and the old block are copied and trimmed, not the whole grid.
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { setGridPixels } from '../../src/core/pixelBounds';
import { resetStore, store } from '../../src/core/store';
import { newBlankKey } from '../../src/timeline/edit-core';
import { PixelSession } from '../../src/tools/pixelSession';

const SIZE = 4000;
const RED = [255, 0, 0, 255] as const;

function paintBlock(doc: ReturnType<ReturnType<typeof store>['get']>, x0: number, y0: number, n: number) {
  const sess = new PixelSession(doc.doc, doc.doc.layers[0] as PixelLayer, 0);
  for (let i = 0; i < n; i++) sess.set(x0 + i, y0 + (i % 7), [...RED]);
  return sess;
}

describe(`a stroke commit on a ${SIZE} x ${SIZE} canvas`, () => {
  it('writes the same drawing as trimming the whole grid, from a small rectangle', () => {
    const doc0 = newDoc({ width: SIZE, height: SIZE, length: 1, pixel: { pixelSize: 1 } });
    newBlankKey(doc0, doc0.layers[0].id, 0);
    const s = resetStore(doc0);
    paintBlock(s.get(), 1000, 1000, 40).commit('First');
    let t = performance.now();
    const sess = paintBlock(s.get(), 1500, 2500, 30);
    const startMs = performance.now() - t;
    const work = new Uint8ClampedArray(sess.work);
    t = performance.now();
    expect(sess.commit('Second')).toBe('ok');
    const rectMs = performance.now() - t;
    const doc = store().get().doc;
    const d = Object.values(doc.drawings)[0] as PixelDrawing;
    expect([d.x, d.y, d.width, d.height]).toEqual([1000, 1000, 530, 1507]);
    // The old way: copy the whole grid and trim it.
    const old = { width: 0, height: 0, pixels: new Uint8ClampedArray(0) } as PixelDrawing;
    t = performance.now();
    setGridPixels(old, new Uint8ClampedArray(work), SIZE, SIZE);
    const wholeMs = performance.now() - t;
    expect([old.x, old.y, old.width, old.height]).toEqual([d.x, d.y, d.width, d.height]);
    expect(Buffer.from(old.pixels).equals(Buffer.from(d.pixels))).toBe(true);
    // And a stroke inside the old block, which is the common case: the work is the old rectangle plus nothing.
    const s2 = resetStore(doc);
    const sess2 = new PixelSession(s2.get().doc, s2.get().doc.layers[0] as PixelLayer, 0);
    sess2.set(1100, 1100, [...RED]);
    t = performance.now();
    sess2.commit('Third');
    const smallMs = performance.now() - t;
    // eslint-disable-next-line no-console
    console.log(`PIXEL-COMMIT ${SIZE}x${SIZE}: stroke commit ${rectMs.toFixed(1)} ms (touched rectangle + old block), whole-grid copy and trim ${wholeMs.toFixed(1)} ms, one-pixel commit ${smallMs.toFixed(1)} ms, session start (whole-grid copy, not changed) ${startMs.toFixed(1)} ms`);
  }, 120_000);
});

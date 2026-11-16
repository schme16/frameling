// A feathered selection and the brush: paint stays inside it and fades out along the soft edge.
import { describe, expect, it } from 'vitest';
import { resetStore, store } from '../../src/core/store';
import { newSpriteDoc } from '../../src/pixel/way';
import type { PixelLayer } from '../../src/core/format';
import { PixelSession } from '../../src/tools/pixelSession';
import { setPixelSelection } from '../../src/select/pixel-state';
import { featherMask, rectMask } from '../../src/select/mask';
import { edgeOf } from '../../src/select/edge';

function session() {
  resetStore(newSpriteDoc({ way: 'picture', width: 40, height: 40, name: 'T' }));
  const s = store().get();
  return () => new PixelSession(s.doc, s.doc.layers[0] as PixelLayer, 0);
}

describe('painting inside a feathered selection', () => {
  it('lays full colour in the middle, part colour along the edge and none outside', () => {
    const make = session();
    setPixelSelection(featherMask(rectMask(40, 40, 8, 8, 31, 31), 6));
    const sess = make();
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) sess.set(x, y, [255, 0, 0, 255]);
    expect(sess.get(20, 20)[3]).toBeGreaterThan(250);
    expect(sess.get(1, 1)[3]).toBe(0);
    const edge = sess.get(8, 20)[3];
    expect(edge).toBeGreaterThan(60);
    expect(edge).toBeLessThan(200);
    // Steadily more colour from outside to inside along a row.
    let last = 0;
    for (let x = 0; x < 20; x++) {
      const a = sess.get(x, 20)[3];
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
  });

  it('a plain selection still paints crisply: all or nothing', () => {
    const make = session();
    setPixelSelection(rectMask(40, 40, 8, 8, 31, 31));
    const sess = make();
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) sess.set(x, y, [255, 0, 0, 255]);
    expect(sess.get(8, 20)[3]).toBe(255);
    expect(sess.get(7, 20)[3]).toBe(0);
  });
});

describe('the three edge changes', () => {
  const box = rectMask(30, 30, 10, 10, 19, 19);
  it('grow reaches further, shrink less, feather keeps about the same size', () => {
    const count = (m: { bits: Uint8Array }) => m.bits.reduce((a, b) => a + b, 0);
    expect(count(edgeOf(box, 'grow', 2))).toBeGreaterThan(count(box));
    expect(count(edgeOf(box, 'shrink', 2))).toBeLessThan(count(box));
    expect(Math.abs(count(edgeOf(box, 'feather', 3)) - count(box))).toBeLessThan(12);
    expect(edgeOf(box, 'feather', 3).soft).toBeDefined();
    expect(edgeOf(box, 'grow', 2).soft).toBeUndefined();
  });
});

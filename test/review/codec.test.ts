// The wire codec: any message comes back equal, a pixel edit goes as a rectangle and comes back whole, and what cannot be
// followed is refused so the other side asks for the whole drawing again.
import { describe, expect, it } from 'vitest';
import { deflateSync, inflateSync } from 'node:zlib';
import { newDoc, newPixelDrawing, newPixelLayer } from '../../src/core/doc';
import type { Doc, PixelDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { Decoder, Encoder, changedRect, cutRect, pasteRect } from '../../src/review/codec';
import { ReviewOut } from '../../src/review/forReviewer';
import type { ToPopout } from '../../src/popout/protocol';

function pixelDoc(w = 200, h = 150): { doc: Doc; id: string } {
  const doc = newDoc({ width: w, height: h, length: 4, pixel: { pixelSize: 1 } });
  const layer = doc.layers[0] ?? newPixelLayer('Pixels', 1);
  if (!doc.layers.length) doc.layers.push(layer);
  const d: PixelDrawing = { ...newPixelDrawing(w, h) };
  doc.drawings[d.id] = d;
  layer.cels.push({ id: 'c1', start: 0, length: 4, drawingId: d.id });
  return { doc, id: d.id };
}

const roundTrip = (e: Encoder, d: Decoder, m: ToPopout) => d.decode(inflateSync(deflateSync(e.encode(m as never))));

describe('changedRect and its friends', () => {
  it('finds the smallest rectangle, and nothing when nothing changed', () => {
    const a = new Uint8Array(10 * 6);
    const b = a.slice();
    expect(changedRect(a, b, 10)).toBeNull();
    b[2 * 10 + 3] = 9;
    b[4 * 10 + 7] = 1;
    expect(changedRect(a, b, 10)).toEqual({ x: 3, w: 5, y: 2, h: 3 });
  });
  it('cuts a rectangle and pastes it back onto a copy', () => {
    const a = Uint8Array.from({ length: 60 }, (_, i) => i);
    const b = a.slice();
    b[25] = 200;
    b[36] = 201;
    const r = changedRect(a, b, 10)!;
    const pasted = pasteRect(a, 10, r, cutRect(b, 10, r));
    expect([...pasted]).toEqual([...b]);
    expect([...a]).not.toEqual([...b]);
  });
});

describe('the codec', () => {
  it('carries typed arrays of every kind through a message', () => {
    const e = new Encoder();
    const d = new Decoder();
    const m = { t: 'pixels', patch: { layerId: 'l', width: 2, height: 1, start: true, base: false, x: 0, y: 0, w: 2, h: 1, data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]) } } as const;
    const out = roundTrip(e, d, m as never) as unknown as typeof m;
    expect(out.patch.data).toBeInstanceOf(Uint8ClampedArray);
    expect([...out.patch.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const cells = roundTrip(e, d, { t: 'live', live: { layerId: 'l', drawing: { id: 'x', kind: 'tilemap', columns: 2, rows: 1, cells: new Uint32Array([5, 0xffffffff]) } } } as never) as unknown as { live: { drawing: { cells: Uint32Array } } };
    expect(cells.live.drawing.cells).toBeInstanceOf(Uint32Array);
    expect([...cells.live.drawing.cells]).toEqual([5, 0xffffffff]);
  });

  it('sends a pixel edit as a rectangle, and the other end ends up with the same picture', () => {
    const { doc, id } = pixelDoc();
    resetStore(doc);
    const e = new Encoder();
    const dec = new Decoder();
    const seen = roundTrip(e, dec, { t: 'doc', seq: 1, doc }) as unknown as { doc: Doc };
    expect(Object.keys(seen.doc.drawings)).toEqual([id]);
    const whole = e.encode({ t: 'doc', seq: 1, doc } as never).byteLength;
    // A stroke: a few pixels change, and the whole array is replaced, as the tools do.
    store().update('stroke', (d) => {
      const px = (d.drawings[id] as PixelDrawing).pixels.slice();
      for (let i = 0; i < 40; i++) px[(60 + (i >> 3)) * 200 * 4 + (30 + (i & 7)) * 4 + 3] = 255;
      (d.drawings[id] as PixelDrawing).pixels = px;
    });
    const change = store().lastChange()!;
    const msg: ToPopout = { t: 'patch', seq: 2, patches: change.patches };
    const bytes = e.encode(msg as never);
    expect(e.rects).toBe(1);
    expect(bytes.byteLength).toBeLessThan(whole / 20);
    const out = dec.decode(bytes) as unknown as { patches: typeof change.patches };
    const before = (seen.doc.drawings[id] as PixelDrawing).pixels;
    const after = (out.patches[0].value as Uint8ClampedArray);
    expect(after).toHaveLength(before.length);
    expect([...after]).toEqual([...(store().get().doc.drawings[id] as PixelDrawing).pixels]);
    // The decoder's copy follows: a second edit builds on the first.
    store().update('stroke 2', (d) => {
      const px = (d.drawings[id] as PixelDrawing).pixels.slice();
      px[3] = 255;
      (d.drawings[id] as PixelDrawing).pixels = px;
    });
    const out2 = dec.decode(e.encode({ t: 'patch', seq: 3, patches: store().lastChange()!.patches } as never)) as unknown as { patches: { value: Uint8ClampedArray }[] };
    expect([...out2.patches[0].value]).toEqual([...(store().get().doc.drawings[id] as PixelDrawing).pixels]);
  });

  it('sends the whole array when the change is big or the size differs', () => {
    const { doc, id } = pixelDoc();
    resetStore(doc);
    const e = new Encoder();
    const dec = new Decoder();
    roundTrip(e, dec, { t: 'doc', seq: 1, doc });
    store().update('fill', (d) => void ((d.drawings[id] as PixelDrawing).pixels = new Uint8ClampedArray((d.drawings[id] as PixelDrawing).pixels.length).fill(7)));
    const out = dec.decode(e.encode({ t: 'patch', seq: 2, patches: store().lastChange()!.patches } as never)) as unknown as { patches: { value: Uint8ClampedArray }[] };
    expect(e.rects).toBe(0);
    expect(out.patches[0].value.every((v) => v === 7)).toBe(true);
  });

  it('refuses a rectangle with nothing to go on, and a message that is not one', () => {
    const { doc, id } = pixelDoc();
    resetStore(doc);
    const e = new Encoder();
    const first = new Decoder();
    roundTrip(e, first, { t: 'doc', seq: 1, doc });
    store().update('edit', (d) => {
      const px = (d.drawings[id] as PixelDrawing).pixels.slice();
      px[10] = 1;
      (d.drawings[id] as PixelDrawing).pixels = px;
    });
    const bytes = e.encode({ t: 'patch', seq: 2, patches: store().lastChange()!.patches } as never);
    expect(() => new Decoder().decode(bytes)).toThrow();
    expect(() => new Decoder().decode(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => new Decoder().decode(new Uint8Array([0, 0, 0, 9, 1]))).toThrow();
  });

  it('follows a drawing through the reviewer filter: withheld fields never appear on the other end', () => {
    const { doc } = pixelDoc();
    doc.notes = [{ id: 'n', x: 1, y: 1, text: 'private' }];
    doc.marks = [{ id: 'm', kind: 'arrow', pts: [0, 0, 5, 5] }];
    doc.ext = { secret: 1 } as never;
    const out = new ReviewOut();
    const m = out.map({ t: 'doc', seq: 1, doc })!;
    const dec = new Decoder();
    const got = dec.decode(new Encoder().encode(m as never)) as unknown as { doc: Doc };
    expect(got.doc.notes).toBeUndefined();
    expect(got.doc.marks).toBeUndefined();
    expect(got.doc.ext).toBeUndefined();
    expect(got.doc.layers).toHaveLength(doc.layers.length);
  });
});

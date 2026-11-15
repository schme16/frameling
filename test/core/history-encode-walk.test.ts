// Saving the history again (every autosave) must not run every step against the drawing: a step already encoded comes
// from its cache and only the steps that are new, or that an older new step needs, are run. The bytes are the same either way.
import { describe, expect, it, vi } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer } from '../../src/core/doc';
import type { Doc, PixelDrawing } from '../../src/core/format';
import { encodeHistory, HISTORY_DATA_ENTRY, HISTORY_STEPS_ENTRY } from '../../src/core/historyFile';
import { gridPixels, setGridPixels } from '../../src/core/pixelBounds';
import * as storeModule from '../../src/core/store';
import { resetStore, type Store } from '../../src/core/store';

const runs = vi.spyOn(storeModule, 'runStep');

const W = 64;
const H = 48;

function pixelDoc(): { doc: Doc; id: string } {
  const doc = newDoc({ width: W, height: H, length: 4 });
  const layer = newPixelLayer('Pixels', 1);
  const d = newPixelDrawing(W, H);
  for (let i = 0; i < d.pixels.length; i += 4) d.pixels.set([90, 90, 90, 255], i);
  doc.drawings[d.id] = d;
  layer.cels.push({ id: 'c1', start: 0, length: 4, drawingId: d.id });
  doc.layers.push(layer);
  return { doc, id: d.id };
}

function paint(s: Store, id: string, n: number): void {
  s.update('Draw', (doc) => {
    const d = doc.drawings[id] as PixelDrawing;
    const grid = gridPixels(d, W, H).slice();
    const x = (n * 7) % (W - 6);
    const y = (n * 5) % (H - 6);
    for (let yy = y; yy < y + 5; yy++) for (let xx = x; xx < x + 5; xx++) grid.set([n * 11, 200 - n, n * 3, 255], (yy * W + xx) * 4);
    setGridPixels(d, grid, W, H);
  });
}

const bytesOf = (saved: ReturnType<typeof encodeHistory>) => ({
  steps: Array.from(saved!.files[HISTORY_STEPS_ENTRY]),
  data: Array.from(saved!.files[HISTORY_DATA_ENTRY] ?? []),
});

/** The same steps as new objects, so nothing about them is remembered. */
function cold(src: NonNullable<ReturnType<Store['historyForSave']>>) {
  return { doc: src.doc, undo: src.undo.map((e) => ({ ...e })), redo: src.redo.map((e) => ({ ...e })) };
}

function build(steps: number, undone = 0): { s: Store; id: string } {
  const { doc, id } = pixelDoc();
  const s = resetStore(doc);
  for (let i = 1; i <= steps; i++) paint(s, id, i);
  for (let i = 0; i < undone; i++) s.undo();
  return { s, id };
}

describe('saving the history again', () => {
  it('runs only the new steps once the older ones are encoded', () => {
    const { s, id } = build(40);
    encodeHistory(s.historyForSave()!);
    const first = runs.mock.calls.length;
    expect(first).toBeGreaterThanOrEqual(40);
    paint(s, id, 41);
    runs.mockClear();
    const again = encodeHistory(s.historyForSave()!);
    // One step is new (and the newest one is copied each time, so it is encoded again): a couple of runs, not forty.
    expect(runs.mock.calls.length).toBeLessThanOrEqual(2);
    expect(again!.kept.undo).toBe(41);
  });

  it('gives the same bytes as encoding every step from scratch', () => {
    const { s, id } = build(30, 5);
    const warm1 = encodeHistory(s.historyForSave()!);
    paint(s, id, 99);
    const warm2 = encodeHistory(s.historyForSave()!);
    const fresh = encodeHistory(cold(s.historyForSave()!));
    expect(bytesOf(warm2)).toEqual(bytesOf(fresh));
    expect(warm1!.kept.redo).toBe(5);
  });

  it('copes with steps cached only partway down: the older ones still see the right drawing', () => {
    const { s } = build(30, 4);
    const src = s.historyForSave()!;
    // A small cap encodes (and remembers) only the newest steps; the big cap then needs the older ones too.
    const small = encodeHistory(src, 1500);
    expect(small!.kept.undo).toBeLessThan(26);
    const warm = encodeHistory(src);
    const fresh = encodeHistory(cold(src));
    expect(warm!.kept).toEqual(fresh!.kept);
    expect(bytesOf(warm)).toEqual(bytesOf(fresh));
  });

  it('keeps the same steps when the cap cuts the history short', () => {
    const { s } = build(30, 3);
    const src = s.historyForSave()!;
    encodeHistory(src);
    const warm = encodeHistory(src, 3000);
    const fresh = encodeHistory(cold(src), 3000);
    expect(warm!.kept).toEqual(fresh!.kept);
    expect(warm!.dropped).toBe(fresh!.dropped);
    expect(bytesOf(warm)).toEqual(bytesOf(fresh));
  });
});

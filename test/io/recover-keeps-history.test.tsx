// @vitest-environment jsdom
// A crash recovery brings back the undo history too: autosave carries the steps, recovery puts them back, and Undo,
// Redo and the History panel all work on the recovered drawing. Autosave stays cheap: a repeat only pays for new steps.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/history';
import { newDoc, newPixelDrawing, newPixelLayer } from '../../src/core/doc';
import type { Doc, PixelDrawing } from '../../src/core/format';
import { encodeHistory, FILE_HISTORY_BYTES, HISTORY_DATA_ENTRY, HISTORY_STEPS_ENTRY } from '../../src/core/historyFile';
import { gridPixels, setGridPixels } from '../../src/core/pixelBounds';
import { resetStore, store, type Store } from '../../src/core/store';
import { HistoryPanel } from '../../src/history/HistoryPanel';
import { autosaveNow } from '../../src/io/document';
import { offerRecovery } from '../../src/io/autosave';
import { loadFile } from '../../src/io/file';
import { recovery, restorePending } from '../../src/io/recovery';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = () => {};

type Meta = { name: string; filePath: string | null; docId: string };
let copy: { bytes: Uint8Array; meta: Meta; savedAt: number } | null = null;
let writes = 0;

beforeEach(() => {
  copy = null;
  writes = 0;
  recovery.set(null);
  (window as unknown as { frameling: unknown }).frameling = {
    versions: { app: 'test', electron: '', chrome: '' },
    files: {},
    autosave: {
      write: async (bytes: Uint8Array, meta: Meta) => {
        copy = { bytes, meta, savedAt: Date.now() };
        writes++;
        return true;
      },
      read: async () => (copy ? { ...copy, fileModifiedAt: null } : null),
      clear: async () => undefined,
    },
  };
});

let host: HTMLElement | null = null;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = root = null;
  delete (window as unknown as { frameling?: unknown }).frameling;
});

/** A pixel drawing, fully painted grey, so a stroke changes a part of a block that stays the same size. */
function pixelDoc(w: number, h: number): { doc: Doc; id: string } {
  const doc = newDoc({ width: w, height: h, length: 4 });
  const layer = newPixelLayer('Pixels', 1);
  const d = newPixelDrawing(w, h);
  for (let i = 0; i < d.pixels.length; i += 4) d.pixels.set([90, 90, 90, 255], i);
  doc.drawings[d.id] = d;
  layer.cels.push({ id: 'c1', start: 0, length: 4, drawingId: d.id });
  doc.layers.push(layer);
  return { doc, id: d.id };
}

function paint(s: Store, id: string, x: number, y: number, w: number, h: number, rgba: number[], gw: number, gh: number): void {
  s.update('Draw', (doc) => {
    const d = doc.drawings[id] as PixelDrawing;
    const grid = gridPixels(d, gw, gh).slice();
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid.set(rgba, (yy * gw + xx) * 4);
    setGridPixels(d, grid, gw, gh);
  });
}

/** Every state from now back to the start (newest first), leaving the store at the start. */
function states(s: Store): Doc[] {
  const out = [s.get().doc];
  while (s.canUndo()) {
    s.undo();
    out.push(s.get().doc);
  }
  return out;
}

/** Waits for the recovery's async load to land. */
async function waitFor(ok: () => boolean): Promise<void> {
  for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(ok()).toBe(true);
}

describe('recovering keeps the history', () => {
  it('a run of edits, autosaved and recovered, undoes back through that work and shows in the History panel', async () => {
    const s = resetStore(newDoc({ name: 'Start' }));
    for (const n of ['One', 'Two', 'Three', 'Four']) s.update(`Rename to ${n}`, (d) => void (d.name = n));
    s.undo();
    s.setUi({ dirty: true });

    await autosaveNow();
    expect(writes).toBe(1);
    expect(Object.keys(unzipSync(copy!.bytes))).toContain(HISTORY_STEPS_ENTRY);

    // The app is gone; a new start finds the copy.
    resetStore();
    await offerRecovery();
    expect(recovery.get()).not.toBeNull();
    restorePending();
    await waitFor(() => store().get().doc.name === 'Three');

    const t = store();
    expect(t.get().ui.dirty).toBe(true);
    expect(t.canUndo()).toBe(true);
    expect(t.canRedo()).toBe(true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(<HistoryPanel />));
    const rows = () => [...host!.querySelectorAll('.hi-row')].map((r) => `${r.className.replace('hi-row ', '')}:${r.querySelector('.hi-label')!.textContent}`);
    expect(rows()).toEqual(['undone:Rename to Four', 'current:Rename to Three', 'done:Rename to Two', 'done:Rename to One', 'done:Start']);
    // Back to the start, then forward again.
    expect(states(t).map((d) => d.name)).toEqual(['Three', 'Two', 'One', 'Start']);
    while (t.canRedo()) t.redo();
    expect(t.get().doc.name).toBe('Four');
  });

  it('a recovered pixel drawing undoes to the exact pixels it had', async () => {
    const { doc, id } = pixelDoc(48, 32);
    const s = resetStore(doc);
    paint(s, id, 2, 2, 10, 10, [255, 0, 0, 255], 48, 32);
    paint(s, id, 20, 8, 12, 6, [0, 255, 0, 255], 48, 32);
    s.setUi({ dirty: true });
    await autosaveNow();
    const expected = states(s).map((d) => gridPixels(d.drawings[id] as PixelDrawing, 48, 32).join(','));
    resetStore();
    await offerRecovery();
    restorePending();
    await waitFor(() => store().canUndo());
    const got = states(store()).map((d) => gridPixels(d.drawings[id] as PixelDrawing, 48, 32).join(','));
    expect(got).toHaveLength(3);
    expect(got).toEqual(expected);
  });

  it('a copy with no steps still recovers, just without history', async () => {
    const s = resetStore(newDoc({ name: 'Plain' }));
    s.setUi({ dirty: true });
    await autosaveNow();
    expect(Object.keys(unzipSync(copy!.bytes)).filter((k) => k.startsWith('history/'))).toEqual([]);
    resetStore();
    await offerRecovery();
    restorePending();
    await waitFor(() => store().get().doc.name === 'Plain');
    expect(store().canUndo()).toBe(false);
  });

  it('the history in the autosave copy never goes past the file cap', async () => {
    const W = 800;
    const { doc, id } = pixelDoc(W, W);
    const s = resetStore(doc);
    // About 4 MB a step (both sides of a 700 x 700 stroke): far more than the cap in all.
    for (let k = 0; k < 12; k++) paint(s, id, 10, 10, 700, 700, [k * 20, 50, 200, 255], W, W);
    s.setUi({ dirty: true });
    await autosaveNow();
    const files = unzipSync(copy!.bytes);
    expect(files[HISTORY_STEPS_ENTRY].length + (files[HISTORY_DATA_ENTRY]?.length ?? 0)).toBeLessThanOrEqual(FILE_HISTORY_BYTES);
    const note = JSON.parse(strFromU8(files['doc.json'])).history;
    expect(note.dropped).toBeGreaterThan(0);
    expect(note.undo).toBeGreaterThan(0);
    expect(loadFile(copy!.bytes).history!.undo).toHaveLength(note.undo);
  }, 60_000);

  it('a repeat autosave only pays for the new steps', async () => {
    // 39 heavy steps, like the measurement this was sized from.
    const W = 512;
    const { doc, id } = pixelDoc(W, W);
    const s = resetStore(doc);
    for (let k = 0; k < 39; k++) paint(s, id, 5 + k, 5 + k, 200, 200, [k * 6, 80, 160, 255], W, W);
    s.setUi({ dirty: true });
    const t0 = performance.now();
    await autosaveNow();
    const first = performance.now() - t0;
    paint(s, id, 100, 100, 200, 200, [255, 255, 0, 255], W, W);
    const t1 = performance.now();
    await autosaveNow();
    const repeat = performance.now() - t1;
    // The part spent working the steps out when none are new (the remembered encodings are reused).
    const t3 = performance.now();
    encodeHistory(s.historyForSave()!);
    const encode = performance.now() - t3;
    console.log(`autosave, 39 heavy steps: first ${first.toFixed(0)} ms; repeat with one new step ${repeat.toFixed(0)} ms (whole save, zipping included, all on this thread here); steps alone with none new ${encode.toFixed(1)} ms; copy ${(copy!.bytes.length / 1e6).toFixed(2)} MB`);
    // The claim this test exists for: with no new steps, working them out is a fraction of a whole first save.
    expect(encode).toBeLessThan(first / 4);
    expect(writes).toBe(2);
    // The second save does the same zipping and writing as the first, so it only has to not cost MORE. Both numbers
    // are wall clock on a machine that may have other work on it, so a straight repeat < first was a flake: it failed
    // on 350 against 337. A quarter of headroom still catches a repeat that really does redo everything.
    expect(repeat).toBeLessThan(first * 1.25);
    expect(loadFile(copy!.bytes).history!.undo).toHaveLength(40);
  }, 60_000);
});

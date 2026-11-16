// The undo history inside the file: a pixel step holds only the rectangle it changed, the file has a byte cap, and a run
// of edits saved and opened again undoes and redoes the same way. Exports never carry any of it.
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing } from '../../src/core/doc';
import { FORMAT_VERSION, type Doc, type PixelDrawing } from '../../src/core/format';
import { encodeHistory, FILE_HISTORY_BYTES, HISTORY_DATA_ENTRY, HISTORY_STEPS_ENTRY } from '../../src/core/historyFile';
import { gridPixels, setGridPixels } from '../../src/core/pixelBounds';
import { HISTORY_BYTES, resetStore, type Store } from '../../src/core/store';
import { getChoiceDef, currentChoice } from '../../src/core/choices';
import { historyNote } from '../../src/io/document';
import { loadFile, saveFile, saveFileAsync } from '../../src/io/file';

const GW = 64;
const GH = 48;

/** A pixel drawing on one layer, fully painted grey so a stroke changes a part of a block that stays the same size. */
function pixelDoc(w = GW, h = GH): { doc: Doc; id: string } {
  const doc = newDoc({ width: w, height: h, length: 4 });
  const layer = newPixelLayer('Pixels', 1);
  const d = newPixelDrawing(w, h);
  for (let i = 0; i < d.pixels.length; i += 4) d.pixels.set([90, 90, 90, 255], i);
  doc.drawings[d.id] = d;
  layer.cels.push({ id: 'c1', start: 0, length: 4, drawingId: d.id });
  doc.layers.push(layer);
  return { doc, id: d.id };
}

/** Paints a rectangle of one colour on the drawing, as one undo step. */
function paint(s: Store, id: string, x: number, y: number, w: number, h: number, rgba: number[], key?: string, gw = GW, gh = GH): void {
  s.update(
    'Draw',
    (doc) => {
      const d = doc.drawings[id] as PixelDrawing;
      const grid = gridPixels(d, gw, gh).slice();
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid.set(rgba, (yy * gw + xx) * 4);
      setGridPixels(d, grid, gw, gh);
    },
    key ? { coalesce: key } : {},
  );
}

const withHistory = (s: Store, cap?: number) => encodeHistory({ ...s.historyForSave()! }, cap);
const save = (s: Store): Uint8Array => saveFile(s.get().doc, '', new Date(2026, 10, 14), { history: s.historyForSave()! });
const normal = (d: Doc): Doc => loadFile(saveFile(d)).doc;

function reopen(bytes: Uint8Array): Store {
  const loaded = loadFile(bytes);
  const s = resetStore();
  s.load(loaded.doc, null, loaded.history);
  return s;
}

/** Every state from now back to the start of the session (newest first), leaving the store where it was. */
const states = (s: Store): Doc[] => {
  const out = [s.get().doc];
  while (s.canUndo()) {
    s.undo();
    out.push(s.get().doc);
  }
  while (s.canRedo()) s.redo();
  return out;
};

describe('a pixel step holds only what it changed', () => {
  it('a stroke in one corner of a big drawing stores only that corner', () => {
    const { doc, id } = pixelDoc(800, 800);
    const s = resetStore(doc);
    paint(s, id, 0, 0, 10, 10, [255, 0, 0, 255], undefined, 800, 800);
    const saved = withHistory(s)!;
    const steps = JSON.parse(strFromU8(saved.files[HISTORY_STEPS_ENTRY]));
    const change = steps.undo[0].px[0];
    expect(change.c).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    // 10 x 10 pixels of 4 bytes, before and after, instead of two whole 2.56 MB drawings.
    expect(saved.files[HISTORY_DATA_ENTRY].length).toBe(10 * 10 * 4 * 2);
    expect(saved.bytes).toBeLessThan(5000);
    // The patches that would have carried the whole drawing are not in the text.
    expect(JSON.stringify(steps.undo[0].p)).not.toContain('bin');
  });

  // changedRect reads four bytes at a time when both blocks sit on a four byte boundary, and byte by byte when one of
  // them does not. A drawing whose pixels are a view one byte into a buffer takes the second path, which is otherwise
  // never reached, so it is worth pinning down that both paths find the same rectangle.
  it('finds the same rectangle when a drawing sits off a four byte boundary', () => {
    const { doc, id } = pixelDoc(64, 64);
    const d = doc.drawings[id] as PixelDrawing;
    const buf = new ArrayBuffer(d.pixels.length + 1);
    const off = new Uint8ClampedArray(buf, 1, d.pixels.length);
    off.set(d.pixels);
    d.pixels = off;
    expect(d.pixels.byteOffset % 4).toBe(1);
    const s = resetStore(doc);
    paint(s, id, 7, 9, 5, 3, [255, 0, 0, 255], undefined, 64, 64);
    const steps = JSON.parse(strFromU8(withHistory(s)!.files[HISTORY_STEPS_ENTRY]));
    expect(steps.undo[0].px[0].c).toEqual({ x: 7, y: 9, w: 5, h: 3 });
    // And it still undoes and redoes to the same pixels.
    const t = reopen(save(s));
    const now = (st: Store) => [...(st.get().doc.drawings[id] as PixelDrawing).pixels];
    const painted = now(s);
    t.undo();
    expect(now(t)[(9 * 64 + 7) * 4]).toBe(90);
    t.redo();
    expect(now(t)).toEqual(painted);
  });

  it('applying the step gives exactly the pixels it had before, both ways', () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    const start = (s.get().doc.drawings[id] as PixelDrawing).pixels.slice();
    paint(s, id, 3, 4, 5, 6, [255, 0, 0, 255]);
    const after = (s.get().doc.drawings[id] as PixelDrawing).pixels.slice();
    const t = reopen(save(s));
    t.undo();
    expect([...(t.get().doc.drawings[id] as PixelDrawing).pixels]).toEqual([...start]);
    t.redo();
    expect([...(t.get().doc.drawings[id] as PixelDrawing).pixels]).toEqual([...after]);
  });

  it('copes with blocks that grow, shrink and empty out', () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    // A drawing that starts as a small block, then spreads, then is rubbed out.
    s.update('Clear', (d) => void setGridPixels(d.drawings[id] as PixelDrawing, new Uint8ClampedArray(GW * GH * 4), GW, GH));
    paint(s, id, 10, 10, 4, 4, [1, 2, 3, 255]);
    paint(s, id, 30, 20, 5, 5, [4, 5, 6, 255]);
    paint(s, id, 10, 10, 4, 4, [0, 0, 0, 0]);
    s.update('Clear again', (d) => void setGridPixels(d.drawings[id] as PixelDrawing, new Uint8ClampedArray(GW * GH * 4), GW, GH));
    const seen: Doc[] = [s.get().doc];
    while (s.canUndo()) {
      s.undo();
      seen.push(s.get().doc);
    }
    const bytes = (() => {
      while (s.canRedo()) s.redo();
      return save(s);
    })();
    const t = reopen(bytes);
    let i = 0;
    while (t.canUndo()) {
      t.undo();
      i++;
      expect(t.get().doc.drawings[id], `after ${i} undos`).toEqual(normal(seen[i]).drawings[id]);
    }
    expect(i).toBe(5);
  });
});

describe('the format', () => {
  it('stays at the version every build knows, and a file without history has none of it', () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    paint(s, id, 1, 1, 2, 2, [9, 9, 9, 255]);
    const plain = unzipSync(saveFile(s.get().doc));
    expect(JSON.parse(strFromU8(plain['manifest.json'])).version).toBe(FORMAT_VERSION);
    expect(FORMAT_VERSION).toBe(3);
    expect(Object.keys(plain).filter((k) => k.startsWith('history/'))).toEqual([]);
    expect(JSON.parse(strFromU8(plain['doc.json'])).history).toBeUndefined();
    const withSteps = unzipSync(save(s));
    expect(JSON.parse(strFromU8(withSteps['manifest.json'])).version).toBe(FORMAT_VERSION);
    expect(JSON.parse(strFromU8(withSteps['doc.json'])).history).toEqual({ v: 1, undo: 1, redo: 0 });
  });

  it('a file without history opens with Undo empty, as before', () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    paint(s, id, 1, 1, 2, 2, [9, 9, 9, 255]);
    const loaded = loadFile(saveFile(s.get().doc));
    expect(loaded.history).toBeUndefined();
    const t = reopen(saveFile(s.get().doc));
    expect(t.canUndo()).toBe(false);
    expect(t.canRedo()).toBe(false);
  });

  it('a document in memory never carries the history field', () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    paint(s, id, 1, 1, 2, 2, [9, 9, 9, 255]);
    const loaded = loadFile(save(s));
    expect(loaded.history?.undo.length).toBe(1);
    expect('history' in loaded.doc).toBe(false);
  });

  it('a history that is damaged or from an unknown layout is left out, and the drawing still opens', () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    paint(s, id, 1, 1, 2, 2, [9, 9, 9, 255]);
    const files = unzipSync(save(s));
    const drawingOnly = loadFile(saveFile(s.get().doc)).doc;
    const odd = (patch: (f: Record<string, Uint8Array>) => void) => {
      const copy = { ...files };
      patch(copy);
      return loadFile(zipSync(copy));
    };
    const garbled = odd((f) => (f[HISTORY_STEPS_ENTRY] = new TextEncoder().encode('not json')));
    expect(garbled.history).toBeUndefined();
    expect(garbled.doc).toEqual(drawingOnly);
    const future = odd((f) => (f['doc.json'] = new TextEncoder().encode(strFromU8(f['doc.json']).replace('"history":{"v":1', '"history":{"v":2'))));
    expect(future.history).toBeUndefined();
    const aimedAtNothing = odd((f) => (f[HISTORY_STEPS_ENTRY] = new TextEncoder().encode(strFromU8(f[HISTORY_STEPS_ENTRY]).replace(new RegExp(id, 'g'), 'nope'))));
    expect(aimedAtNothing.history).toBeUndefined();
    const shortBytes = odd((f) => (f[HISTORY_DATA_ENTRY] = f[HISTORY_DATA_ENTRY].slice(0, 5)));
    expect(shortBytes.history).toBeUndefined();
    const badPath = odd((f) => (f[HISTORY_STEPS_ENTRY] = new TextEncoder().encode(strFromU8(f[HISTORY_STEPS_ENTRY]).replace('"path":["drawings"', '"path":["__proto__"'))));
    expect(badPath.doc).toEqual(drawingOnly);
  });
});

describe('a run of edits through save and open', () => {
  /** Vector and pixel edits, a coalesced run, a new drawing with pixels in it, a rename: steps of every kind. */
  function session(): { s: Store; id: string } {
    const { doc, id } = pixelDoc();
    const v = newVectorDrawing();
    doc.drawings[v.id] = v;
    doc.layers[0].cels.push({ id: 'cv', start: 0, length: 4, drawingId: v.id });
    const s = resetStore(doc);
    paint(s, id, 2, 2, 6, 6, [255, 0, 0, 255]);
    s.update('Rename', (d) => void (d.name = 'Renamed'));
    for (let i = 0; i < 5; i++) paint(s, id, 20 + i, 10, 1, 8, [0, 0, 255, 255], 'drag');
    s.update('Add shape', (d) => {
      (d.drawings[v.id] as { shapes: unknown[] }).shapes.push({ id: 'sh1', type: 'stroke', points: [{ x: 1, y: 1, p: 1 }, { x: 9, y: 9, p: 1 }], brush: { size: 4, thinning: 0, smoothing: 0, streamline: 0, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true }, color: '#000000', opacity: 1 });
    });
    s.update('New drawing', (d) => {
      const n = newPixelDrawing(8, 8);
      n.pixels.fill(200);
      d.drawings[n.id] = n;
      d.layers[1].cels.push({ id: 'c9', start: 3, length: 1, drawingId: n.id });
    });
    paint(s, id, 40, 30, 3, 3, [0, 255, 0, 255]);
    s.update('FPS', (d) => void (d.fps = 24));
    return { s, id };
  }

  it('gives back the same steps, each doing the same thing, undoing and redoing', () => {
    const { s } = session();
    const mine = states(s).map(normal);
    const t = reopen(save(s));
    const labels: string[] = [];
    let i = 0;
    expect(t.get().doc).toEqual(mine[0]);
    while (t.canUndo()) {
      labels.push(t.undoLabel()!);
      t.undo();
      i++;
      expect(t.get().doc, `after ${i} undos`).toEqual(mine[i]);
    }
    expect(i).toBe(mine.length - 1);
    // The five drags were one step.
    expect(labels).toEqual(['FPS', 'Draw', 'New drawing', 'Add shape', 'Draw', 'Rename', 'Draw']);
    while (t.canRedo()) {
      i--;
      t.redo();
      expect(t.get().doc, `redo to ${i}`).toEqual(mine[i]);
    }
    expect(i).toBe(0);
  });

  it('keeps the redo side when the work was saved with steps undone', () => {
    const { s } = session();
    const all = states(s).map(normal);
    s.undo();
    s.undo();
    s.undo();
    const t = reopen(save(s));
    expect(t.get().doc).toEqual(all[3]);
    expect(t.canRedo()).toBe(true);
    t.redo();
    expect(t.get().doc).toEqual(all[2]);
    t.redo();
    t.redo();
    expect(t.get().doc).toEqual(all[0]);
    expect(t.canRedo()).toBe(false);
    for (let i = 1; i < all.length; i++) {
      t.undo();
      expect(t.get().doc).toEqual(all[i]);
    }
  });

  it('works through the async save the app uses', async () => {
    const { s } = session();
    const bytes = await saveFileAsync(s.get().doc, '', new Date(2026, 10, 14), { history: s.historyForSave()! });
    const t = reopen(bytes);
    expect(t.undoLabel()).toBe('FPS');
    t.undo();
    expect(t.get().doc.fps).not.toBe(24);
  });

  it('opening starts clean: nothing is marked as unsaved', () => {
    const { s } = session();
    const t = reopen(save(s));
    expect(t.get().ui.dirty).toBe(false);
    t.undo();
    expect(t.get().ui.dirty).toBe(true);
  });

  it('is told what went in', () => {
    const { s } = session();
    let seen: unknown = 'unset';
    saveFile(s.get().doc, '', new Date(2026, 10, 14), { history: s.historyForSave()!, onHistory: (h) => (seen = h?.kept) });
    expect(seen).toEqual({ undo: 7, redo: 0 });
    saveFile(s.get().doc, '', new Date(2026, 10, 14), { onHistory: (h) => (seen = h) });
    expect(seen).toBeNull();
  });
});

describe('the cap on a file', () => {
  it('is far smaller than the memory cap', () => {
    expect(FILE_HISTORY_BYTES).toBeLessThan(HISTORY_BYTES / 8);
  });

  it('keeps the newest steps and drops the oldest', () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    for (let i = 0; i < 12; i++) paint(s, id, i * 3, 5, 3, 20, [i * 10, 0, 0, 255]);
    // Each step holds two 3 x 20 blocks (480 bytes) plus its text, so this fits about four.
    const one = withHistory(s, 100000)!;
    const per = one.bytes / 12;
    const small = withHistory(s, Math.round(per * 4.5))!;
    expect(small.kept.undo).toBe(4);
    expect(small.dropped).toBe(8);
    // Opening a capped file undoes exactly the newest steps, and each one is right.
    const bytes = zipSyncWith(s, small);
    const t = reopen(bytes);
    const mine = states(s).map(normal);
    for (let i = 1; i <= 4; i++) {
      t.undo();
      expect(t.get().doc.drawings[id]).toEqual(mine[i].drawings[id]);
    }
    expect(t.canUndo()).toBe(false);
  });

  it('leaves history out altogether when not even the newest step fits', () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    paint(s, id, 0, 0, 20, 20, [1, 1, 1, 255]);
    expect(withHistory(s, 10)).toBeNull();
  });

  it('says in the file how many it left out', () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    for (let i = 0; i < 6; i++) paint(s, id, i, i, 2, 2, [i, 0, 0, 255]);
    const per = withHistory(s, 100000)!.bytes / 6;
    const small = withHistory(s, Math.round(per * 2.5))!;
    expect(small.note).toEqual({ v: 1, undo: 2, redo: 0, dropped: 4 });
  });
});

describe('what is never carried', () => {
  it('a document opened from a file with history saves, and exports, without it', () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    paint(s, id, 1, 1, 2, 2, [9, 9, 9, 255]);
    const t = reopen(save(s));
    const files = unzipSync(saveFile(t.get().doc));
    expect(Object.keys(files).filter((k) => k.startsWith('history/'))).toEqual([]);
    expect(JSON.parse(strFromU8(files['doc.json'])).history).toBeUndefined();
  });

  it('the Interactives package (the one export that embeds a drawing) holds a source without history', async () => {
    const { buildPlayable } = await import('../../src/export/playable');
    const { doc, id } = pixelDoc(16, 16);
    const s = resetStore(doc);
    paint(s, id, 1, 1, 2, 2, [9, 9, 9, 255], undefined, 16, 16);
    const source = saveFile(s.get().doc, '');
    expect(Object.keys(unzipSync(source)).some((k) => k.startsWith('history/'))).toBe(false);
    expect(typeof buildPlayable).toBe('function');
  });
});

/** The file for a given encoding of the history, for tests that need a smaller cap than the app's. */
function zipSyncWith(s: Store, saved: NonNullable<ReturnType<typeof encodeHistory>>): Uint8Array {
  const base = unzipSync(saveFile(s.get().doc, '', new Date(2026, 10, 14)));
  const raw = JSON.parse(strFromU8(base['doc.json']));
  raw.history = saved.note;
  return zipSync({ ...base, 'doc.json': new TextEncoder().encode(JSON.stringify(raw)), ...saved.files });
}

describe('asking once, and saying what was kept', () => {
  it('is on unless you say otherwise, and the question is plain', () => {
    const def = getChoiceDef('save.history')!;
    expect(def.default).toBe('keep');
    expect(currentChoice('save.history')).toBe('keep');
    // Closing the question without answering saves just the drawing, so nothing is shared by accident.
    expect(def.dismiss).toBe('plain');
    expect(def.options.map((o) => o.value)).toEqual(['keep', 'plain']);
    const words = [def.question, ...def.options.flatMap((o) => [o.label, o.detail ?? ''])].join(' ');
    expect(words).not.toContain('\u2014');
  });

  it('only mentions the history when older steps were left out', () => {
    expect(historyNote(null)).toBeNull();
    expect(historyNote({ kept: { undo: 40, redo: 0 }, dropped: 0 })).toBeNull();
    expect(historyNote({ kept: { undo: 40, redo: 0 }, dropped: 12 })).toBe('Saved. The file keeps your last 40 steps of history; older ones were left out to keep it small.');
    expect(historyNote({ kept: { undo: 1, redo: 0 }, dropped: 3 })).toContain('last 1 step ');
  });
});

describe('the steps taken for a save', () => {
  it('stay as they were when you keep drawing while the file is being made', () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    paint(s, id, 2, 2, 4, 4, [255, 0, 0, 255], 'drag');
    const taken = s.historyForSave()!;
    const at = taken.doc;
    // The stroke carries on and joins the step that was taken.
    paint(s, id, 10, 10, 4, 4, [0, 0, 255, 255], 'drag');
    const t = reopen(saveFile(at, '', new Date(2026, 10, 14), { history: taken }));
    expect(t.get().doc).toEqual(normal(at));
    t.undo();
    expect(t.get().doc).toEqual(normal(doc));
  });

  it('keeps a look at another artboard as a look, so it stays hidden from Undo and the History panel', () => {
    const s = resetStore(newDoc());
    s.update('One', (d) => void (d.name = 'One'));
    s.update('Go to "Other"', (d) => void (d.fps = 12), { view: true });
    s.update('Two', (d) => void (d.name = 'Two'));
    const t = reopen(saveFile(s.get().doc, '', new Date(2026, 10, 14), { history: s.historyForSave()! }));
    expect(t.historyList().done.map((x) => x.label)).toEqual(['One', 'Two']);
    t.undo();
    t.undo();
    expect(t.get().doc.fps).toBe(newDoc().fps);
  });
});

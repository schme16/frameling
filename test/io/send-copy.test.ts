// @vitest-environment jsdom
// Send a copy: the copy opens again, with or without the undo history (and is smaller without), the question says the
// real sizes, and the drawing you are working on is left exactly as it was.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer } from '../../src/core/doc';
import type { Doc, PixelDrawing } from '../../src/core/format';
import { gridPixels, setGridPixels } from '../../src/core/pixelBounds';
import { getChoiceDef, resetChoices, setChoice, setChoiceAsker, type ChoiceDef } from '../../src/core/choices';
import { resetStore, store, type Store } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';
import { sendCopy } from '../../src/io/sendCopy';
import { extraBytes, packCopy, sizeWords } from '../../src/io/sendCopyPlan';
import { setStreamSafe } from '../../src/core/streamSafe';

const GW = 160;
const GH = 120;

function pixelDoc(): { doc: Doc; id: string } {
  const doc = newDoc({ width: GW, height: GH, length: 4 });
  const layer = newPixelLayer('Pixels', 1);
  const d = newPixelDrawing(GW, GH);
  doc.drawings[d.id] = d;
  layer.cels.push({ id: 'c1', start: 0, length: 4, drawingId: d.id });
  doc.layers.push(layer);
  return { doc, id: d.id };
}

/** A stroke of noisy colour, so the steps do not squash down to nothing when zipped. */
function scribble(s: Store, id: string, n: number): void {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    s.update('Draw', (doc) => {
      const d = doc.drawings[id] as PixelDrawing;
      const grid = gridPixels(d, GW, GH).slice();
      const x = Math.floor(rnd() * (GW - 40));
      const y = Math.floor(rnd() * (GH - 40));
      for (let yy = y; yy < y + 40; yy++) for (let xx = x; xx < x + 40; xx++) grid.set([rnd() * 255, rnd() * 255, rnd() * 255, 255], (yy * GW + xx) * 4);
      setGridPixels(d, grid, GW, GH);
    });
  }
}

const drawing = (id: string, d: Doc) => [...(d.drawings[id] as PixelDrawing).pixels];

describe('making the copy', () => {
  it('opens again, with the same drawing and its own id', async () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    scribble(s, id, 3);
    const bytes = await packCopy(s.rootDoc(), 'test');
    const back = loadFile(bytes);
    expect(back.doc.layers.length).toBe(doc.layers.length);
    expect(back.doc.id).not.toBe(s.rootDoc().id);
    expect(drawing(id, back.doc)).toEqual(drawing(id, loadFile(saveFile(s.rootDoc())).doc));
    expect(back.history).toBeUndefined();
  });

  it('with the history opens again, can undo, and is bigger than without it', async () => {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    scribble(s, id, 8);
    const plain = await packCopy(s.rootDoc(), 'test');
    const full = await packCopy(s.rootDoc(), 'test', { history: s.historyForSave() });
    const back = loadFile(full);
    expect(back.history?.undo.length).toBe(8);
    expect(loadFile(plain).history).toBeUndefined();
    expect(full.length).toBeGreaterThan(plain.length);
    // The history is what makes it big: the difference is what the question tells people.
    expect(extraBytes({ plain: plain.length, full: full.length })).toBe(full.length - plain.length);
    const t = resetStore();
    t.load(back.doc, null, back.history);
    t.undo();
    expect(drawing(id, t.get().doc)).not.toEqual(drawing(id, back.doc));
  });
});

describe('sizes in plain words', () => {
  it('says KB under a megabyte and MB above, never zero', () => {
    expect(sizeWords(0)).toBe('1 KB');
    expect(sizeWords(850 * 1024)).toBe('850 KB');
    expect(sizeWords(3.4 * 1024 * 1024)).toBe('3.4 MB');
    expect(sizeWords(48 * 1024 * 1024)).toBe('48 MB');
  });
});

describe('Send a copy, the whole thing', () => {
  let saves: { bytes: Uint8Array; copy?: { avoid: string | null } }[] = [];
  let shown: string[] = [];
  let recent = 0;
  beforeEach(() => {
    saves = [];
    shown = [];
    recent = 0;
    resetChoices();
    setStreamSafe(false);
    (window as unknown as { frameling: unknown }).frameling = {
      versions: { app: 'test', electron: '', chrome: '' },
      files: {
        save: async (o: { bytes: Uint8Array; copy?: { avoid: string | null } }) => {
          saves.push(o);
          return { path: '/home/me/art/copy.frameling' };
        },
        showInFolder: async (p: string) => void shown.push(p),
      },
      recent: { add: async () => void recent++ },
      autosave: { clear: async () => undefined, removeKept: async () => undefined },
    };
  });
  afterEach(() => {
    setChoiceAsker(null);
    setStreamSafe(false);
    delete (window as unknown as { frameling?: unknown }).frameling;
  });

  /** The copy's size with and without history, and the open drawing before and after. */
  async function run(answer: 'plain' | 'keep' | 'ask') {
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    scribble(s, id, 8);
    s.markSaved('/home/me/art/mine.frameling');
    scribble(s, id, 1);
    const before = { doc: s.rootDoc(), filePath: s.get().ui.filePath, dirty: s.get().ui.dirty, undo: s.canUndo(), px: drawing(id, s.rootDoc()), docId: s.rootDoc().id };
    let shownDetails: string[] = [];
    if (answer === 'ask') {
      setChoiceAsker(async (def: ChoiceDef) => {
        shownDetails = def.options.map((o) => o.detail ?? '');
        return { value: 'keep', remember: true };
      });
    } else setChoice('send.history', answer);
    const ok = await sendCopy();
    const after = store();
    return { ok, before, after, id, shownDetails };
  }

  it('leaves the drawing exactly as it was: the memory, the file, the unsaved mark and the recent list', async () => {
    const { ok, before, after, id } = await run('plain');
    expect(ok).toBe(true);
    expect(after.rootDoc()).toBe(before.doc);
    expect(after.rootDoc().id).toBe(before.docId);
    expect(drawing(id, after.rootDoc())).toEqual(before.px);
    expect(after.get().ui.filePath).toBe(before.filePath);
    expect(after.get().ui.dirty).toBe(before.dirty);
    expect(after.canUndo()).toBe(true);
    expect(recent).toBe(0);
    // The desktop is told the original's file so the copy can never replace it.
    expect(saves[0].copy).toEqual({ avoid: '/home/me/art/mine.frameling' });
  });

  it('the answer decides the file: plain is smaller and has no history, keep carries it', async () => {
    const a = await run('plain');
    const plain = saves.pop()!.bytes;
    const b = await run('keep');
    const full = saves.pop()!.bytes;
    expect(a.ok && b.ok).toBe(true);
    expect(loadFile(plain).history).toBeUndefined();
    expect(loadFile(full).history?.undo.length).toBeGreaterThan(0);
    expect(plain.length).toBeLessThan(full.length);
  });

  it('is plain by default when nothing can ask', async () => {
    expect(getChoiceDef('send.history')?.default).toBe('plain');
    const { doc, id } = pixelDoc();
    const s = resetStore(doc);
    scribble(s, id, 3);
    await sendCopy();
    expect(loadFile(saves[0].bytes).history).toBeUndefined();
  });

  it('asks once with the real sizes in the answers, and remembers', async () => {
    const r = await run('ask');
    const full = saves.pop()!.bytes;
    expect(r.shownDetails[0]).toMatch(/\d+(\.\d)? (KB|MB)/);
    expect(r.shownDetails[1]).toMatch(/instead of/);
    expect(loadFile(full).history).toBeDefined();
    // Remembered: a second copy does not ask again.
    let asked = 0;
    setChoiceAsker(async () => (asked++, null));
    await sendCopy();
    expect(asked).toBe(0);
  });

  it('shows the file in the file manager, but not while Stream-safe is on', async () => {
    await run('plain');
    expect(shown).toEqual(['/home/me/art/copy.frameling']);
    shown.length = 0;
    setStreamSafe(true);
    await run('plain');
    expect(shown).toEqual([]);
  });

  it('a drawing with no history asks nothing', async () => {
    let asked = 0;
    setChoiceAsker(async () => (asked++, null));
    resetStore(pixelDoc().doc);
    await sendCopy();
    expect(asked).toBe(0);
    expect(saves.length).toBe(1);
  });
});

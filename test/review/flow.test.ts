// @vitest-environment jsdom
// Send for review and bring in comments, the whole thing on the real store: what goes into the page and what does not,
// the comments merging as one undo step, the question when frames have moved, and junk being refused.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { CanvasMark, CanvasNote, Doc } from '../../src/core/format';
import { resetChoices, setChoice, setChoiceAsker, type ChoiceDef } from '../../src/core/choices';
import { resetStore, store } from '../../src/core/store';
import { setStreamSafe } from '../../src/core/streamSafe';
import { toasts } from '../../src/ui/toast';
import { bringInReview } from '../../src/review/bring';
import { sendForReview } from '../../src/review/send';
import { structureSig } from '../../src/review/model';

vi.mock('../../src/review/frames', () => ({
  renderReviewPictures: async (d: Doc) => ({ images: ['data:image/png;base64,AAAA'], frames: Array.from({ length: d.length }, () => 0), bytes: 3, pixelated: false, tooBig: false }),
}));

const make = (): Doc => {
  const d = newDoc({ name: 'Sunny day', width: 200, height: 100, length: 6 });
  d.id = 'doc1';
  const l = Object.assign(newVectorLayer('Lines'), { id: 'L1' });
  l.cels = [{ id: 'c', start: 0, length: 6, drawingId: 'dx' }];
  d.layers = [l];
  d.notes = [{ id: 'a', x: 1, y: 2, text: 'private to-do: ask the boss', by: 'Shane', at: 5 }] as CanvasNote[];
  d.marks = [{ id: 'k', kind: 'arrow', pts: [1, 2, 30, 40] }] as CanvasMark[];
  return d;
};

const comments = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 'frameling-review', doc: 'doc1', from: 'Anna', sent: Date.UTC(2026, 10, 12, 5, 4), made: Date.UTC(2026, 10, 12, 8, 0), length: 6, sig: structureSig(make()),
    notes: [{ id: 'n1', x: 5, y: 6, text: 'too dark', pin: 'frame', frame: 2 }], replies: [{ note: 'a', id: 'r1', text: 'done it' }], marks: [{ id: 'm1', kind: 'circle', pts: [1, 1, 9, 9] }], done: ['a'], ...over,
  });
const said = () => toasts.get().map((t) => t.message);

describe('Send for review', () => {
  let writes: { path: string; bytes: Uint8Array }[] = [];
  let picked: { suggestedName: string }[] = [];
  beforeEach(() => {
    writes = [];
    picked = [];
    resetChoices();
    setStreamSafe(false);
    toasts.set([]);
    (window as unknown as { frameling: unknown }).frameling = {
      versions: { app: 'test', electron: '', chrome: '' },
      files: {
        pickExportFile: async (o: { suggestedName: string }) => (picked.push(o), '/home/shane/secret-project/Sunny day review.html'),
        write: async (path: string, bytes: Uint8Array) => (writes.push({ path, bytes }), { ok: true }),
        showInFolder: async () => undefined,
      },
    };
  });
  afterEach(() => {
    setChoiceAsker(null);
    setStreamSafe(false);
    delete (window as unknown as { frameling?: unknown }).frameling;
  });

  it('saves one page with the drawing, the notes and no file path, and says how big it is', async () => {
    resetStore(make());
    setChoice('review.own', 'show');
    expect(await sendForReview()).toBe(true);
    expect(picked[0].suggestedName).toBe('Sunny day review.html');
    const html = new TextDecoder().decode(writes[0].bytes);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('private to-do: ask the boss');
    expect(html).not.toContain('/home/shane');
    expect(html).not.toContain('secret-project');
    expect(said().some((m) => /Saved the review page as Sunny day review\.html \(\d+ KB\)/.test(m))).toBe(true);
  });

  it('a clean page leaves your notes and marks out, and the drawing is untouched either way', async () => {
    const doc = make();
    const s = resetStore(doc);
    setChoice('review.own', 'clean');
    await sendForReview();
    const html = new TextDecoder().decode(writes[0].bytes);
    expect(html).not.toContain('private to-do');
    expect(html).not.toContain('"kind":"arrow"');
    expect(s.rootDoc()).toBe(doc);
    expect(s.canUndo()).toBe(false);
  });

  it('asks about your notes once, and only when there are some', async () => {
    let asked: ChoiceDef | null = null;
    setChoiceAsker(async (def: ChoiceDef) => ((asked = def), { value: 'clean', remember: true }));
    const bare = make();
    delete bare.notes;
    delete bare.marks;
    resetStore(bare);
    await sendForReview();
    expect(asked).toBeNull();
    resetStore(make());
    await sendForReview();
    expect(asked!.id).toBe('review.own');
    asked = null;
    await sendForReview();
    expect(asked).toBeNull();
    expect(new TextDecoder().decode(writes[2].bytes)).not.toContain('private to-do');
  });

  it('while stream-safe, the message hides where it went', async () => {
    resetStore(make());
    setChoice('review.own', 'show');
    setStreamSafe(true);
    await sendForReview();
    expect(said().join(' ')).not.toContain('Sunny day review.html');
    expect(said().join(' ')).not.toContain('secret-project');
    expect(said().join(' ')).toMatch(/My file|A file/);
  });

  it('does nothing when the save is cancelled', async () => {
    (window as unknown as { frameling: { files: { pickExportFile: () => Promise<null> } } }).frameling.files.pickExportFile = async () => null;
    resetStore(make());
    setChoice('review.own', 'show');
    expect(await sendForReview()).toBe(false);
    expect(writes).toHaveLength(0);
  });
});

describe('Bring in comments', () => {
  beforeEach(() => {
    resetChoices();
    setStreamSafe(false);
    toasts.set([]);
  });
  afterEach(() => setChoiceAsker(null));

  it('merges in as one undo step, with who and when, and says what came in', async () => {
    const s = resetStore(make());
    expect(await bringInReview(comments())).toBe(true);
    const d = s.rootDoc();
    expect(d.notes!.map((n) => n.id)).toEqual(['a', 'n1']);
    expect(d.notes![0].done).toBe(true);
    expect(d.notes![0].replies![0]).toMatchObject({ text: 'done it', by: 'Anna' });
    expect(d.notes![1]).toMatchObject({ by: 'Anna', pin: 'frame', frame: 2 });
    expect(d.marks!.map((m) => m.id)).toEqual(['k', 'm1']);
    expect(d.marks![1].by).toBe('Anna');
    expect(said()[0]).toMatch(/Brought in 1 note, 1 answer, 1 mark and 1 ticked off from Anna\. It was made on the version you sent on \d+ Nov/);
    s.undo();
    expect(s.rootDoc().notes).toHaveLength(1);
    expect(s.rootDoc().notes![0].done).toBeUndefined();
    expect(s.rootDoc().marks).toHaveLength(1);
  });

  it('the same file twice changes nothing the second time', async () => {
    const s = resetStore(make());
    await bringInReview(comments());
    const once = s.rootDoc();
    toasts.set([]);
    expect(await bringInReview(comments())).toBe(false);
    expect(s.rootDoc()).toBe(once);
    expect(said()[0]).toMatch(/Nothing new/);
  });

  it('the owner can untick a note afterwards', async () => {
    const s = resetStore(make());
    await bringInReview(comments());
    s.update('Reopen note', (d) => void delete d.notes![0].done);
    expect(s.rootDoc().notes![0].done).toBeUndefined();
  });

  it('refuses another drawing\'s comments and junk, and leaves the drawing alone', async () => {
    const doc = make();
    const s = resetStore(doc);
    expect(await bringInReview(comments({ doc: 'someone-elses' }))).toBe(false);
    expect(said()[0]).toMatch(/different drawing/);
    for (const junk of ['', 'hello', '{', '{"format":"frameling-review"}', '[1,2]', new Uint8Array([0, 1, 2]), null, 42]) expect(await bringInReview(junk)).toBe(false);
    expect(await bringInReview(comments({ notes: [], replies: [], marks: [], done: [] }))).toBe(false);
    expect(s.rootDoc()).toBe(doc);
    expect(s.canUndo()).toBe(false);
  });

  it('when frames have moved it asks, with the version it was reviewed at, and warns after', async () => {
    const doc = make();
    doc.layers[0].cels[0].start = 1;
    doc.layers[0].cels[0].length = 5;
    const s = resetStore(doc);
    let seen: ChoiceDef | null = null;
    let details: string[] = [];
    setChoiceAsker(async (def: ChoiceDef) => {
      seen = def;
      details = def.options.map((o) => o.detail ?? '');
      return { value: 'bring', remember: false };
    });
    expect(await bringInReview(comments())).toBe(true);
    expect(seen!.id).toBe('review.drift');
    expect(details[0]).toMatch(/12 Nov, .* \(6 frames; now 6\)/);
    expect(said()[0]).toMatch(/frames have moved since/);
    expect(toasts.get()[0].kind).toBe('warn');
    expect(s.rootDoc().notes).toHaveLength(2);
  });

  it('"Not now" brings nothing in', async () => {
    const doc = make();
    doc.length = 9;
    const s = resetStore(doc);
    setChoiceAsker(async () => ({ value: 'skip', remember: false }));
    expect(await bringInReview(comments())).toBe(false);
    expect(s.rootDoc()).toBe(doc);
  });

  it('a remembered answer is used without asking, and the warning still shows', async () => {
    const doc = make();
    doc.length = 9;
    resetStore(doc);
    setChoice('review.drift', 'bring');
    let asked = 0;
    setChoiceAsker(async () => (asked++, null));
    expect(await bringInReview(comments())).toBe(true);
    expect(asked).toBe(0);
    expect(said()[0]).toMatch(/frames have moved/);
  });
});

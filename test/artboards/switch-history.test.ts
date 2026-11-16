// Looking at another artboard is kept in the history as just its two artboard ids, run again for Undo and Redo, not as a
// copy of the artboard's content. These pin that it stays a look, that Undo and Redo land where they did before, what
// happens when the artboard changed in between, and how little a look now weighs.
import { beforeEach, describe, expect, it } from 'vitest';
import { produce, produceWithPatches } from 'immer';
import { newDoc, newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { RERUN_WEIGHT, resetStore, store, weighPatches } from '../../src/core/store';
import { goToArtboard, newArtboard, resetArtboardView } from '../../src/artboards/ops';
import { activeId, artboardsOf, findArtboard, switchArtboard } from '../../src/artboards/model';
import { loadFile, saveFile } from '../../src/io/file';
import * as ops from '../../src/timeline/ops';

const doc = () => store().get().doc;
const clips = () => doc().clips.map((c) => c.name);
const storedClips = (id: string) => findArtboard(doc(), id)!.content!.clips.map((c) => c.name);
const aClip = (name: string) => ({ id: `x-${name}`, name, start: 6, length: 1 }) as never;

function setup(layers = 1, keys = 0) {
  resetArtboardView();
  const d = newDoc({ name: 'F', width: 16, height: 16, length: Math.max(8, keys) });
  const v = newVectorDrawing();
  d.drawings[v.id] = v;
  d.layers = Array.from({ length: layers }, (_, i) => {
    const l = newVectorLayer(`L${i}`);
    for (let k = 0; k < keys; k++) l.cels.push({ id: `c${i}-${k}`, start: k, length: 1, drawingId: v.id });
    return l;
  });
  resetStore(d);
  const a = activeId(doc());
  const b = newArtboard({ name: 'Second' }, false)!;
  return { a, b };
}

/** Changes the open store's document with no history step behind it (nothing in the app does, which is why it's a test). */
function roundHistory(recipe: (d: Doc) => void): void {
  const s = store() as unknown as { state: { doc: Doc } };
  s.state.doc = produce(s.state.doc, (d) => void recipe(d as Doc));
}

describe('a look at another artboard, kept as two ids', () => {
  beforeEach(() => void resetArtboardView());

  it('weighs next to nothing, where its patches used to weigh a copy of the artboards', () => {
    const { a, b } = setup(40, 240);
    // What the step held before: the patches and the inverse of the switch itself.
    const [, patches, inverse] = produceWithPatches(doc(), (d) => void switchArtboard(d as Doc, b));
    const before = weighPatches(patches) + weighPatches(inverse);

    const was = store().historyWeight();
    goToArtboard(b);
    const after = store().historyWeight() - was;
    goToArtboard(a);
    const back = store().historyWeight() - was - after;

    console.info(`switch step weight, 40 layers x 240 keys: before ${before} bytes, after ${after} bytes`);
    expect(after).toBe(RERUN_WEIGHT);
    expect(back).toBe(RERUN_WEIGHT);
    expect(before).toBeGreaterThan(100 * after);
  });

  it('stays a look: no step in the list, never what Undo stops on, the file stays as clean as it was', () => {
    const { a, b } = setup();
    store().setUi({ dirty: false });
    const listed = store().historyList().done.length;
    goToArtboard(b);
    goToArtboard(a);
    expect(store().get().ui.dirty).toBe(false);
    expect(store().historyList().done).toHaveLength(listed);
    expect(store().undoLabel()).not.toMatch(/^Go to/);
    expect(store().lastChangeWasView()).toBe(true);
    // Only looks above the artboard being added: Undo takes the add, and the looks with it.
    store().undo();
    expect(artboardsOf(doc())).toHaveLength(1);
    expect(store().canUndo()).toBe(false);
  });

  it('Undo goes back to the artboard it came from, Redo goes there again', () => {
    const { a, b } = setup();
    const start = doc();
    ops.addClip(0, 3, 'one');
    const atA = doc();
    goToArtboard(b);
    const atB = doc();
    ops.addClip(0, 2, 'two');
    const end = doc();

    store().undo();
    expect(doc()).toEqual(atB);
    store().undo(); // the look goes with the step before it
    expect(activeId(doc())).toBe(a);
    expect(doc()).toEqual(start);
    store().redo();
    expect(doc()).toEqual(atA);
    store().redo(); // the look first, then the step
    expect(activeId(doc())).toBe(b);
    expect(doc()).toEqual(end);
  });

  it('a mix of looks and edits undoes all the way back to the start and redoes all the way forward', () => {
    const { a, b } = setup();
    const start = doc();
    const base = store().historyList().done.length;
    ops.addClip(0, 3, 'a1');
    goToArtboard(b);
    goToArtboard(a);
    goToArtboard(b);
    ops.addClip(0, 2, 'b1');
    goToArtboard(a);
    ops.addClip(4, 2, 'a2');
    goToArtboard(b);
    ops.addClip(4, 2, 'b2');
    const end = doc();
    expect(store().historyList().done).toHaveLength(base + 4);

    while (store().historyList().done.length > base) store().undo();
    expect(doc()).toEqual(start);
    expect(store().canRedo()).toBe(true);
    while (store().canRedo()) store().redo();
    expect(doc()).toEqual(end);
    expect(activeId(doc())).toBe(b);
    expect(clips()).toEqual(['b1', 'b2']);
    expect(storedClips(a)).toEqual(['a1', 'a2']);
  });

  it('jumping to any step and reading the drawing at a step agree with each other', () => {
    const { a, b } = setup();
    const baseId = store().historyList().done.slice(-1)[0].id;
    ops.addClip(0, 3, 'a1');
    goToArtboard(b);
    ops.addClip(0, 2, 'b1');
    goToArtboard(a);
    ops.addClip(4, 2, 'a2');
    const end = doc();
    const ids = store().historyList().done.slice(-3).map((s) => s.id);
    const at = [baseId, ...ids].map((id) => store().docAtStep(id)!);
    expect(at[3]).toEqual(end);
    for (const k of [0, 2, 3, 1, 3, 0]) {
      store().jumpToStep(k === 0 ? baseId : ids[k - 1]);
      expect(doc()).toEqual(at[k]);
    }
  });

  describe('when the artboard changed in between', () => {
    // The step holds ids, not content, so Undo runs the switch again on the drawing as it is at that moment. In the app
    // history is a stack, so anything done since is taken back first and the drawing is exactly as the switch left it:
    // identical to restoring a copy. These pin that, and the one case where they differ: a change that went round
    // history, which a copy would have wiped and the ids leave alone. Going back to an artboard is what you asked for,
    // not undoing somebody else's edit to it.

    it('a change made to the closed artboard since is a step of its own, taken back before the look is', () => {
      const { a, b } = setup();
      ops.addClip(0, 3, 'on a');
      goToArtboard(b);
      const whileOnB = doc();
      // Something edits the artboard that is closed (as a variation following its original does).
      store().update('Edit the first from afar', (d) => void findArtboard(d as Doc, a)!.content!.clips.push(aClip('afar')));
      goToArtboard(a);
      expect(clips()).toEqual(['on a', 'afar']);

      store().undo(); // the look back, and the edit from afar under it
      expect(activeId(doc())).toBe(b);
      expect(storedClips(a)).toEqual(['on a']);
      expect(doc()).toEqual(whileOnB);
      store().undo(); // the look at the second, and the first's own edit
      expect(activeId(doc())).toBe(a);
      expect(clips()).toEqual([]);

      store().redo();
      expect(clips()).toEqual(['on a']);
      store().redo();
      expect(activeId(doc())).toBe(b);
      expect(storedClips(a)).toEqual(['on a', 'afar']);
    });

    it('a change that went round history is kept by Undo, not written over with the old content', () => {
      const { a, b } = setup();
      store().update('Rename', (d) => void (d.name = 'Renamed'));
      goToArtboard(b);
      expect(storedClips(a)).toEqual([]);
      // The closed artboard gains a clip with no step behind it. A copy taken at the look would not have it.
      roundHistory((d) => void findArtboard(d, a)!.content!.clips.push(aClip('sneaky')));

      store().undo(); // the look back to the first artboard, and the rename
      expect(activeId(doc())).toBe(a);
      expect(doc().name).toBe('F');
      expect(clips()).toEqual(['sneaky']);
      expect(storedClips(b)).toEqual([]);
      // Nothing was lost on the way: Redo does the rename again and the clip is still there.
      store().redo();
      expect(doc().name).toBe('Renamed');
      expect(clips()).toEqual(['sneaky']);
    });

    it('a look whose artboard is gone does nothing, and does not throw', () => {
      const { a, b } = setup();
      ops.addClip(0, 3, 'one');
      goToArtboard(b);
      roundHistory((d) => void (d.artboards = d.artboards!.filter((x) => x.id !== a)));
      expect(() => store().undo()).not.toThrow();
      expect(activeId(doc())).toBe(b);
    });
  });

  it('a file saved with looks in its history opens with the same Undo and Redo', () => {
    const { a, b } = setup();
    const base = store().historyList().done.length;
    ops.addClip(0, 3, 'one');
    goToArtboard(b);
    ops.addClip(0, 2, 'two');
    goToArtboard(a);
    const bytes = saveFile(doc(), '', new Date(2026, 10, 14), { history: store().historyForSave()! });
    const loaded = loadFile(bytes);
    expect(loaded.history).toBeTruthy();
    expect(loaded.history!.undo.filter((x) => x.view)).toHaveLength(2);
    // The file carries ordinary patches for them, so it reads the way it always did.
    expect(loaded.history!.undo.filter((x) => x.view).every((x) => x.patches.length > 0)).toBe(true);

    const reopened = resetStore();
    reopened.load(loaded.doc, null, loaded.history);
    expect(reopened.historyList().done.map((x) => x.label).slice(base)).toEqual(['Add clip', 'Add clip']);
    reopened.undo();
    expect(reopened.get().doc.clips.map((c) => c.name)).toEqual([]);
    expect(activeId(reopened.get().doc)).toBe(b);
    reopened.redo();
    expect(reopened.get().doc.clips.map((c) => c.name)).toEqual(['two']);
    while (reopened.historyList().done.length > base) reopened.undo();
    expect(activeId(reopened.get().doc)).toBe(a);
    expect(artboardsOf(reopened.get().doc)).toHaveLength(2);
  });
});

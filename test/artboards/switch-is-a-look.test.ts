import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { goToArtboard, newArtboard, resetArtboardView } from '../../src/artboards/ops';
import { activeId, artboardsOf } from '../../src/artboards/model';
import * as ops from '../../src/timeline/ops';

const clips = () => store().get().doc.clips.map((c) => c.name);

function setup() {
  resetArtboardView();
  const d = newDoc({ name: 'F', width: 16, height: 16, length: 8 });
  d.layers = [newVectorLayer('V')];
  resetStore(d);
  const a = activeId(store().get().doc);
  const b = newArtboard({ name: 'Second' }, false)!;
  store().setUi({ dirty: false });
  return { a, b };
}

describe('looking at another artboard', () => {
  beforeEach(() => void resetArtboardView());

  it('does not mark the file as changed', () => {
    const { b } = setup();
    goToArtboard(b);
    expect(activeId(store().get().doc)).toBe(b);
    expect(store().get().ui.dirty).toBe(false);
  });

  it('is not something Undo stops on, and shows no step', () => {
    const { a, b } = setup();
    expect(store().canUndo()).toBe(true); // adding the artboard
    const before = store().historyList().done.length;
    goToArtboard(b);
    expect(store().historyList().done).toHaveLength(before);
    expect(store().undoLabel()).not.toMatch(/^Go to/);
    goToArtboard(a);
    expect(store().undoLabel()).not.toMatch(/^Go to/);
  });

  it('with nothing but looks done, Undo has nothing to undo', () => {
    resetArtboardView();
    const d = newDoc({ name: 'F', width: 16, height: 16, length: 8 });
    resetStore(d);
    const b = newArtboard({}, false)!;
    // Loading a fresh store again leaves only the look.
    const doc = store().get().doc;
    resetStore(doc);
    goToArtboard(b);
    expect(store().canUndo()).toBe(false);
    expect(store().canRedo()).toBe(false);
  });

  it('an edit still marks the file as changed', () => {
    const { b } = setup();
    goToArtboard(b);
    expect(store().get().ui.dirty).toBe(false);
    ops.addClip(0, 3, 'on second');
    expect(store().get().ui.dirty).toBe(true);
  });

  it('Undo and Redo put each edit back on the artboard it was made on', () => {
    const { a, b } = setup();
    ops.addClip(0, 3, 'on first');
    goToArtboard(b);
    ops.addClip(0, 2, 'on second');
    expect(clips()).toEqual(['on second']);

    store().undo(); // the second artboard's edit
    expect(activeId(store().get().doc)).toBe(b);
    expect(clips()).toEqual([]);

    store().undo(); // the look is taken back with the first artboard's edit
    expect(activeId(store().get().doc)).toBe(a);
    expect(clips()).toEqual([]);
    expect(artboardsOf(store().get().doc).find((x) => x.id === b)!.content!.clips).toEqual([]);

    store().redo(); // lands on the first artboard, edit back
    expect(activeId(store().get().doc)).toBe(a);
    expect(clips()).toEqual(['on first']);

    store().redo(); // looks first, then the second artboard's edit
    expect(activeId(store().get().doc)).toBe(b);
    expect(clips()).toEqual(['on second']);
    expect(artboardsOf(store().get().doc).find((x) => x.id === a)!.content!.clips.map((c) => c.name)).toEqual(['on first']);
  });

  it('the history list skips the looks, and jumping to a step is consistent', () => {
    const { a, b } = setup();
    ops.addClip(0, 3, 'one');
    goToArtboard(b);
    ops.addClip(0, 2, 'two');
    const labels = store().historyList().done.map((s) => s.label);
    expect(labels.some((l) => l.startsWith('Go to'))).toBe(false);
    const first = store().historyList().done.find((s) => s.label === 'Add clip')!;
    store().jumpToStep(first.id);
    expect(activeId(store().get().doc)).toBe(a);
    expect(clips()).toEqual(['one']);
  });
});

// @vitest-environment jsdom
// Undo grouping in the store: everything in a group is one step, or none.
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';

const setName = (n: string, coalesce?: string) => store().update(`Name ${n}`, (d) => void (d.name = n), coalesce ? { coalesce } : {});
const done = () => store().historyList().done.map((s) => s.label);

beforeEach(() => void resetStore(newDoc({ name: 'start' })));

describe('a group of changes', () => {
  it('becomes one step with the name it is given, and one Undo takes all of it back', () => {
    const mark = store().startGroup();
    for (const n of ['a', 'b', 'c']) setName(n);
    expect(done()).toHaveLength(3);
    expect(store().endGroup(mark, 'Script: Rename')).toBe(3);
    expect(done()).toEqual(['Script: Rename']);
    expect(store().get().doc.name).toBe('c');
    store().undo();
    expect(store().get().doc.name).toBe('start');
    store().redo();
    expect(store().get().doc.name).toBe('c');
  });

  it('leaves the step before it alone, even when a change in the group would have merged into it', () => {
    setName('before', 'nudge');
    const mark = store().startGroup();
    setName('during', 'nudge');
    store().endGroup(mark, 'Group');
    expect(done()).toEqual(['Name before', 'Group']);
    store().undo();
    expect(store().get().doc.name).toBe('before');
  });

  it('is nothing at all when nothing changed', () => {
    const mark = store().startGroup();
    expect(store().endGroup(mark, 'Nothing')).toBe(0);
    expect(done()).toEqual([]);
  });

  it('can be taken back whole: the drawing is as it was, and there is no Redo for it', () => {
    setName('kept');
    const before = store().get().doc;
    const mark = store().startGroup();
    for (const n of ['a', 'b', 'c']) setName(n);
    expect(store().abortGroup(mark)).toBe(3);
    expect(store().get().doc).toEqual(before);
    expect(done()).toEqual(['Name kept']);
    expect(store().canRedo()).toBe(false);
  });

  it('keeps the Redo the person had, when a group is taken back', () => {
    setName('one');
    setName('two');
    store().undo();
    expect(store().canRedo()).toBe(true);
    const mark = store().startGroup();
    setName('script');
    store().abortGroup(mark);
    expect(store().get().doc.name).toBe('one');
    expect(store().canRedo()).toBe(true);
    store().redo();
    expect(store().get().doc.name).toBe('two');
  });

  it('taking back a group that changed nothing changes nothing', () => {
    setName('x');
    const mark = store().startGroup();
    expect(store().abortGroup(mark)).toBe(0);
    expect(done()).toEqual(['Name x']);
  });
});

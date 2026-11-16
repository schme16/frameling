import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { Store } from '../../src/core/store';
import { BIG_JUMP, buildRows, clockWords, jumpWords, START_LABEL, stepsFrom, targetByOffset, versionName, whenWords } from '../../src/history/model';

function made(n: number): Store {
  const s = new Store(newDoc());
  for (let i = 1; i <= n; i++) s.update(`Step ${i}`, (d) => void (d.name = `n${i}`));
  return s;
}
const rowsOf = (s: Store) => {
  const { done, undone } = s.historyList();
  return buildRows(done, undone);
};

describe('history list in the store', () => {
  it('lists done steps oldest first and undone steps in redo order', () => {
    const s = made(4);
    s.undo();
    s.undo();
    const { done, undone } = s.historyList();
    expect(done.map((x) => x.label)).toEqual(['Step 1', 'Step 2']);
    expect(undone.map((x) => x.label)).toEqual(['Step 3', 'Step 4']);
  });

  it('jumps back to a step in one go and keeps the later steps for redo', () => {
    const s = made(5);
    const ids = s.historyList().done.map((x) => x.id);
    let emitted = 0;
    s.subscribe(() => emitted++);
    expect(s.jumpToStep(ids[1])).toBe(true);
    expect(emitted).toBe(1);
    expect(s.get().doc.name).toBe('n2');
    expect(s.historyList().undone.map((x) => x.label)).toEqual(['Step 3', 'Step 4', 'Step 5']);
    s.redo();
    expect(s.get().doc.name).toBe('n3');
  });

  it('jumps forward into the undone steps', () => {
    const s = made(5);
    const ids = s.historyList().done.map((x) => x.id);
    s.jumpToStep(null);
    expect(s.get().doc.name).toBe('Untitled');
    expect(s.canUndo()).toBe(false);
    s.jumpToStep(ids[3]);
    expect(s.get().doc.name).toBe('n4');
    expect(s.historyList().done).toHaveLength(4);
    expect(s.historyList().undone.map((x) => x.label)).toEqual(['Step 5']);
    s.undo();
    expect(s.get().doc.name).toBe('n3');
  });

  it('does nothing for the step you are at, or one that is not there', () => {
    const s = made(3);
    const ids = s.historyList().done.map((x) => x.id);
    let emitted = 0;
    s.subscribe(() => emitted++);
    expect(s.jumpToStep(ids[2])).toBe(true);
    expect(s.jumpToStep(9999)).toBe(false);
    expect(emitted).toBe(0);
    expect(s.get().doc.name).toBe('n3');
  });

  it('drawing after a jump drops the greyed steps', () => {
    const s = made(4);
    s.jumpToStep(s.historyList().done[1].id);
    s.update('New road', (d) => void (d.name = 'road'));
    expect(s.historyList().undone).toEqual([]);
    expect(s.historyList().done.map((x) => x.label)).toEqual(['Step 1', 'Step 2', 'New road']);
  });

  it('gives the document at a step without changing anything', () => {
    const s = made(4);
    const { done } = s.historyList();
    const before = s.get().doc;
    expect(s.docAtStep(done[1].id)!.name).toBe('n2');
    expect(s.docAtStep(null)!.name).toBe('Untitled');
    expect(s.docAtStep(done[3].id)).toBe(before);
    expect(s.get().doc).toBe(before);
    s.undo();
    s.undo();
    const redoId = s.historyList().undone[1].id;
    expect(s.docAtStep(redoId)!.name).toBe('n4');
    expect(s.docAtStep(12345)).toBeNull();
    expect(s.get().doc.name).toBe('n2');
  });

  it('works after the history has been trimmed', () => {
    const s = made(3);
    const first = s.historyList().done[0].id;
    s.jumpToStep(null);
    s.update('Other', (d) => void (d.name = 'o'));
    expect(s.jumpToStep(first)).toBe(false);
  });
});

describe('history rows', () => {
  it('puts the newest on top, greyed steps above the current one, and Start at the bottom', () => {
    const s = made(4);
    s.undo();
    s.undo();
    const rows = rowsOf(s);
    expect(rows.map((r) => [r.label, r.state])).toEqual([
      ['Step 4', 'undone'],
      ['Step 3', 'undone'],
      ['Step 2', 'current'],
      ['Step 1', 'done'],
      [START_LABEL, 'done'],
    ]);
    expect(rows[rows.length - 1].id).toBeNull();
  });

  it('marks Start as the current row when nothing is done', () => {
    expect(rowsOf(new Store(newDoc()))).toEqual([{ id: null, label: START_LABEL, state: 'current' }]);
    const s = made(2);
    s.jumpToStep(null);
    expect(rowsOf(s).find((r) => r.state === 'current')!.id).toBeNull();
  });

  it('counts steps from where you are', () => {
    const s = made(5);
    s.undo();
    const rows = rowsOf(s);
    expect(stepsFrom(rows, null)).toBe(-4);
    expect(stepsFrom(rows, rows[0].id)).toBe(1);
    expect(stepsFrom(rows, rows[1].id)).toBe(0);
  });

  it('says what a click does', () => {
    expect(jumpWords(0)).toBe('You are here');
    expect(jumpWords(-1)).toBe('Go back 1 step');
    expect(jumpWords(-3)).toBe('Go back 3 steps');
    expect(jumpWords(2)).toBe('Go forward 2 steps');
  });

  it('picks the target of a ten-step jump, stopping at the ends', () => {
    const s = made(25);
    const rows = rowsOf(s);
    expect(targetByOffset(rows, -BIG_JUMP)).toBe(s.historyList().done[14].id);
    expect(targetByOffset(rows, BIG_JUMP)).toBeUndefined();
    s.jumpToStep(s.historyList().done[3].id);
    expect(targetByOffset(rowsOf(s), -BIG_JUMP)).toBeNull();
    expect(targetByOffset(rowsOf(s), BIG_JUMP)).toBe(s.historyList().undone[9].id);
  });

  it('names a version from a step', () => {
    const rows = rowsOf(made(3));
    expect(versionName(rows[0], 0)).toBe('Step 3');
    expect(versionName(rows[2], -2)).toBe('Step 1 (2 steps back)');
    expect(versionName(rows[1], -1)).toBe('Step 2 (1 step back)');
    expect(versionName(rows[3], -3)).toBe('Start of this session');
    expect(versionName({ id: 1, label: 'Fill', state: 'undone' }, 2)).toBe('Fill (2 steps ahead)');
  });
});

describe('history times', () => {
  const now = 1_000_000_000_000;
  it('says it in plain words', () => {
    expect(whenWords(now - 3000, now)).toBe('just now');
    expect(whenWords(now - 42_000, now)).toBe('42 s ago');
    expect(whenWords(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(whenWords(now - 2 * 3600_000, now)).toBe('2 h ago');
    expect(whenWords(now - 9 * 3600_000, now)).toBe(clockWords(now - 9 * 3600_000));
    expect(whenWords(now + 5000, now)).toBe('just now');
  });
});

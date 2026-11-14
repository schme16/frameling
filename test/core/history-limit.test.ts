// How many undo steps are kept: the number you set, and a memory budget so a long history of pixel art stays light.
import { afterEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { DEFAULT_HISTORY_STEPS, HISTORY_BYTES, historyStepsNow, resetStore, setHistorySteps, weighValue } from '../../src/core/store';

const doc = () => newDoc({ width: 8, height: 8 });
const edits = (s: ReturnType<typeof resetStore>, n: number) => {
  for (let i = 0; i < n; i++) s.update(`Rename ${i}`, (d) => void (d.name = `name ${i}`));
};
const undoCount = (s: ReturnType<typeof resetStore>) => {
  let n = 0;
  while (s.canUndo()) {
    s.undo();
    n++;
  }
  return n;
};

afterEach(() => setHistorySteps(DEFAULT_HISTORY_STEPS));

describe('how many steps are kept', () => {
  it('starts generous', () => {
    expect(DEFAULT_HISTORY_STEPS).toBe(300);
    expect(historyStepsNow()).toBe(300);
  });

  it('keeps the number you ask for, oldest dropped first', () => {
    const s = resetStore(doc());
    setHistorySteps(25);
    edits(s, 60);
    expect(undoCount(s)).toBe(25);
    expect(s.get().doc.name).toBe('name 34');
  });

  it('lowering it in Preferences drops the extra steps straight away', () => {
    const s = resetStore(doc());
    setHistorySteps(100);
    edits(s, 80);
    setHistorySteps(20);
    expect(undoCount(s)).toBe(20);
  });

  it('stays inside its own limits', () => {
    setHistorySteps(5);
    expect(historyStepsNow()).toBe(20);
    setHistorySteps(99999);
    expect(historyStepsNow()).toBe(2000);
  });
});

describe('how heavy the history is allowed to get', () => {
  it('weighs a step by what it really holds', () => {
    expect(weighValue(new Uint8ClampedArray(1024))).toBe(1024);
    expect(weighValue({ pixels: new Uint8ClampedArray(2048) })).toBeGreaterThan(2048);
    expect(weighValue(5)).toBeLessThan(32);
  });

  it('drops the oldest steps once the history is holding a lot, whatever the step count says', () => {
    const s = resetStore(doc());
    setHistorySteps(2000);
    // Each step carries about 8 MB of pixels, so the budget bites long before 2000 steps.
    const heavy = Math.ceil(HISTORY_BYTES / (8 * 1024 * 1024)) + 12;
    for (let i = 0; i < heavy; i++) s.update(`Heavy ${i}`, (d) => void ((d as unknown as { big: Uint8ClampedArray }).big = new Uint8ClampedArray(8 * 1024 * 1024)));
    const kept = undoCount(s);
    expect(kept).toBeLessThan(heavy);
    expect(kept).toBeGreaterThanOrEqual(10);
  });
});

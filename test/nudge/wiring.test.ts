import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { PathShape } from '../../src/core/format';
import { resetStore } from '../../src/core/store';
import { resetChoices, setChoice } from '../../src/core/choices';
import { DRAWN_CHOICE, PAGE_CHOICE, _resetNudges, installNudges } from '../../src/nudge';
import { lines } from '../../src/ui/mascot/lines';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { clearToasts, toasts } from '../../src/ui/toast';

const box: PathShape = { id: 's1', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }], fill: '#f00', stroke: null, opacity: 1 };

/** The first stroke: a drawing with a shape on frame 1. */
function draw(s: ReturnType<typeof resetStore>): void {
  s.update('Draw', (d) => {
    const dr = newVectorDrawing();
    dr.shapes.push(box);
    d.drawings[dr.id] = dr;
    d.layers[0].cels.push({ id: 'c1', start: 0, length: d.length, drawingId: dr.id });
  });
}

describe('the first-drawing watcher', () => {
  let stop: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    _resetNudges();
    resetChoices();
    resetPrefs();
    clearToasts();
    try {
      localStorage.removeItem('frameling.nudges');
    } catch {
      // no storage here
    }
  });
  afterEach(() => {
    stop?.();
    vi.useRealTimers();
  });

  it("Quill speaks once after the first stroke, with Play it and Not now", () => {
    const s = resetStore(newDoc());
    stop = installNudges(s, 100);
    s.setUi({ dirty: false });
    draw(s);
    expect(toasts.get().length).toBe(0);
    vi.advanceTimersByTime(150);
    const t = toasts.get();
    expect(t.length).toBe(1);
    // One of his first-drawing lines, picked at random each time it shows.
    expect(lines('nudge.drawn')).toContain(t[0].message);
    expect(t[0].action?.label).toBe('Play it');
    expect(t[0].decline?.label).toBe('Not now');
    // A second stroke in the same file says nothing more.
    s.update('More', (d) => void d.drawings[Object.keys(d.drawings)[0]]);
    vi.advanceTimersByTime(500);
    expect(toasts.get().length).toBe(1);
  });

  it('says nothing when a file with a drawing is opened', () => {
    const doc = newDoc();
    const dr = newVectorDrawing();
    dr.shapes.push(box);
    doc.drawings[dr.id] = dr;
    const s = resetStore(doc);
    stop = installNudges(s, 100);
    s.update('Nudge', () => {});
    vi.advanceTimersByTime(500);
    expect(toasts.get().length).toBe(0);
  });

  it('says nothing with Show Quill off, and again once it is back on for the next file', () => {
    setPrefs({ showQuill: false });
    let s = resetStore(newDoc());
    stop = installNudges(s, 100);
    draw(s);
    vi.advanceTimersByTime(500);
    expect(toasts.get().length).toBe(0);
    stop();
    setPrefs({ showQuill: true });
    s = resetStore(newDoc());
    stop = installNudges(s, 100);
    draw(s);
    vi.advanceTimersByTime(500);
    expect(toasts.get().length).toBe(1);
  });

  it('Not now is remembered: the next file gets nothing', () => {
    let s = resetStore(newDoc());
    stop = installNudges(s, 100);
    draw(s);
    vi.advanceTimersByTime(150);
    toasts.get()[0].decline!.run();
    clearToasts();
    stop();
    s = resetStore(newDoc());
    stop = installNudges(s, 100);
    draw(s);
    vi.advanceTimersByTime(500);
    expect(toasts.get().length).toBe(0);
  });

  it('is said at most three times across files, and never when its choice is off', () => {
    for (let i = 0; i < 4; i++) {
      const s = resetStore(newDoc());
      const off = installNudges(s, 100);
      draw(s);
      vi.advanceTimersByTime(150);
      off();
    }
    expect(toasts.get().length).toBe(3);
    clearToasts();
    stop = () => {};
    setChoice(DRAWN_CHOICE, 'off');
    const s = resetStore(newDoc());
    stop = installNudges(s, 100);
    draw(s);
    vi.advanceTimersByTime(500);
    expect(toasts.get().length).toBe(0);
    expect(PAGE_CHOICE).toBe('nudge.page');
  });
});

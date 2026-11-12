import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import { EventGate, EVENT_GAP, MAX_EVENTS_PER_SECOND, summarize } from '../../src/plugins/events';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('event gate', () => {
  it('sends the first at once, folds a burst into the newest, and sends that when the gap is over', () => {
    const got: unknown[] = [];
    const g = new EventGate((_n, p) => got.push(p));
    g.offer('document.changed', 1);
    g.offer('document.changed', 2);
    g.offer('document.changed', 3);
    expect(got).toEqual([1]);
    vi.advanceTimersByTime(EVENT_GAP['document.changed'] + 5);
    expect(got).toEqual([1, 3]);
    g.stop();
  });

  it('keeps the kinds apart and never holds export events', () => {
    const got: string[] = [];
    const g = new EventGate((n) => got.push(n));
    g.offer('frame.changed', 0);
    g.offer('selection.changed', 0);
    g.offer('export.started', 0);
    g.offer('export.finished', 0);
    expect(got).toEqual(['frame.changed', 'selection.changed', 'export.started', 'export.finished']);
  });

  it('drops past its budget in a second', () => {
    let n = 0;
    const g = new EventGate(() => n++);
    for (let i = 0; i < MAX_EVENTS_PER_SECOND + 30; i++) g.offer('export.started', i);
    expect(n).toBe(MAX_EVENTS_PER_SECOND);
    expect(g.dropped).toBe(30);
    vi.advanceTimersByTime(1100);
    g.offer('export.started', 0);
    expect(n).toBe(MAX_EVENTS_PER_SECOND + 1);
  });
});

describe('document summary', () => {
  it('is counts only, never content', () => {
    const doc = newDoc();
    const d = { ...newVectorDrawing(), id: 'd1', shapes: [{ id: 's', type: 'path' as const, paths: [], fill: '#ff0000', stroke: null, opacity: 1 }] };
    doc.drawings = { d1: d };
    expect(summarize(doc, 3, 'Draw')).toEqual({ label: 'Draw', frame: 3, length: 24, layers: 1, drawings: 1, shapes: 1 });
    expect(JSON.stringify(summarize(doc, 0, null))).not.toContain('#ff0000');
  });
});

// What the heartbeat tells about a plugin: round trips and requests over the last minute (src/plugins/diagnostics.ts).
import { describe, expect, it } from 'vitest';
import { diagLine, Diagnostics } from '../../src/plugins/diagnostics';
import { diagnosticsAvailableNote } from '../../src/plugins/manager';

describe('plugin diagnostics', () => {
  it('counts requests and drawing items over the last minute only', () => {
    const d = new Diagnostics();
    d.op(1_000_000);
    d.op(1_010_000, 30);
    d.op(1_020_000, 12);
    expect(d.snapshot(1_030_000)).toMatchObject({ opsPerMin: 3, drawItemsPerMin: 42 });
    // 55 seconds later the first one has aged out.
    expect(d.snapshot(1_065_000)).toMatchObject({ opsPerMin: 2, drawItemsPerMin: 42 });
    expect(d.snapshot(1_200_000)).toMatchObject({ opsPerMin: 0, drawItemsPerMin: 0 });
  });

  it('keeps the average and worst answer time of the last minute and the latest one', () => {
    const d = new Diagnostics();
    expect(d.snapshot(0)).toMatchObject({ latencyMs: null, latencyAvgMs: null, latencyMaxMs: null });
    d.latency(10_000, 2);
    d.latency(11_000, 10);
    d.latency(12_000, 6);
    expect(d.snapshot(13_000)).toMatchObject({ latencyMs: 6, latencyAvgMs: 6, latencyMaxMs: 10 });
    // The old ones age out, the latest stays.
    expect(d.snapshot(200_000)).toMatchObject({ latencyMs: 6, latencyAvgMs: null, latencyMaxMs: null });
  });

  it('writes plain lines, and says when memory is not measured', () => {
    const d = new Diagnostics();
    d.latency(1000, 3);
    d.op(1000, 5);
    expect(diagLine(d.snapshot(2000))).toBe('Memory: not measured. Answers in 3 ms (worst 3 ms). 1 requests a minute. 5 drawing items a minute.');
    expect(diagLine(d.snapshot(2000, 94 * 2 ** 20))).toContain('Memory 94 MB.');
    expect(diagLine(new Diagnostics().snapshot(0))).toContain('waiting for the first check');
  });

  it('explains what the switch does in each state, with no dashes', () => {
    const notes = [
      diagnosticsAvailableNote(true, true, true),
      diagnosticsAvailableNote(true, true, false),
      diagnosticsAvailableNote(false, true, true),
      diagnosticsAvailableNote(false, true, false),
      diagnosticsAvailableNote(true, false, false),
      diagnosticsAvailableNote(false, false, false),
    ];
    expect(new Set(notes).size).toBe(6);
    expect(notes[1]).toMatch(/Restart Frameling/);
    expect(notes[2]).toMatch(/Restart Frameling/);
    for (const n of notes) expect(n).not.toMatch(/[\u2013\u2014]/);
  });
});

// Spotting a crash: a marker written at start and taken away on a proper quit. The tests hold the rule that matters:
// it never claims a crash when there wasn't one, and a hard kill or a window crash is always found next time.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beat, BEAT_MS, endRun, factsOf, judge, LAST_FILE, markOffered, MARKER_FILE, noteEvent, parseMarker, parseNotes, pidAlive, readLast, startRun, windowStopLine, type Marker } from '../../src/main/crashMarker';

let dir = '';
beforeEach(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-crash-'))));
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const start = (pid: number, o: { alive?: (p: number) => boolean; now?: number } = {}) => startRun({ dir, pid, version: '1.4.0', platform: 'linux x64', now: o.now ?? 1000, alive: o.alive ?? (() => false) });
const marker = (): Marker | null => parseMarker(fs.readFileSync(path.join(dir, MARKER_FILE), 'utf8'));
const has = (f: string) => fs.existsSync(path.join(dir, f));

describe('judging what the last run left behind', () => {
  const running: Marker = { v: 1, state: 'running', pid: 500, startedAt: 7, version: '1', platform: 'linux', events: [] };

  it('nothing left means a clean last run', () => {
    expect(judge(null, 600)).toEqual({ kind: 'clean' });
  });

  it('a run still marked as running whose process is gone was killed or fell over', () => {
    const v = judge(running, 600, () => false);
    expect(v.kind).toBe('crash');
    if (v.kind === 'crash') expect(v.notes).toMatchObject({ how: 'killed', startedAt: 7, version: '1', platform: 'linux', events: [] });
  });

  it('a run whose process is still alive is another copy, never a crash', () => {
    expect(judge(running, 600, () => true)).toEqual({ kind: 'other-running' });
  });

  it('a marker with our own process id is not another copy (the id came round again after a restart)', () => {
    expect(judge(running, 500, () => true).kind).toBe('crash');
  });

  it('a window crash is a crash even when the app was then closed properly', () => {
    const v = judge({ ...running, state: 'closed', events: ['The drawing window stopped (crashed, exit code 139).'] }, 600, () => false);
    expect(v.kind === 'crash' && v.notes.how).toBe('window');
  });

  it('a window crash and then a hard stop says both', () => {
    const v = judge({ ...running, events: ['x'] }, 600, () => false);
    expect(v.kind === 'crash' && v.notes.how).toBe('both');
  });

  it('a closed marker with no events is not a crash', () => {
    expect(judge({ ...running, state: 'closed' }, 600, () => false)).toEqual({ kind: 'clean' });
  });
});

describe('reading the file', () => {
  it('only our own well-formed marker counts', () => {
    for (const bad of ['', '{', 'null', '[]', '{"v":2}', '{"v":1,"state":"x","pid":1,"startedAt":1}', '{"v":1,"state":"running","pid":-3,"startedAt":1}', '{"v":1,"state":"running","pid":1}']) expect(parseMarker(bad), bad).toBeNull();
    expect(parseMarker('{"v":1,"state":"running","pid":4,"startedAt":9}')).toMatchObject({ pid: 4, events: [] });
  });

  it('keeps the last few events, cut to a sensible length', () => {
    const events = Array.from({ length: 30 }, (_, i) => `${i} ${'x'.repeat(500)}`);
    const m = parseMarker(JSON.stringify({ v: 1, state: 'running', pid: 4, startedAt: 9, events }))!;
    expect(m.events).toHaveLength(10);
    expect(m.events[9].startsWith('29 ')).toBe(true);
    expect(m.events.every((e) => e.length <= 300)).toBe(true);
  });

  it('notes from disk are checked too', () => {
    expect(parseNotes(null)).toBeNull();
    expect(parseNotes({ how: 'exploded', startedAt: 1, events: [] })).toBeNull();
    expect(parseNotes({ how: 'killed', startedAt: 1, events: ['a', 3] })).toMatchObject({ events: ['a'] });
  });

  it('this very process is alive, and a made-up one is not', () => {
    expect(pidAlive(process.pid)).toBe(true);
    expect(pidAlive(2 ** 22 + 12345)).toBe(false);
  });
});

describe('a run from start to quit', () => {
  it('the first ever start finds no crash and writes its marker', () => {
    expect(start(100)).toEqual({ kind: 'clean' });
    expect(marker()).toMatchObject({ state: 'running', pid: 100, startedAt: 1000, version: '1.4.0', events: [] });
    expect(has(LAST_FILE)).toBe(false);
  });

  it('a proper quit takes the marker away, so the next start is clean', () => {
    start(100);
    endRun(dir, 100);
    expect(has(MARKER_FILE)).toBe(false);
    expect(start(101)).toEqual({ kind: 'clean' });
    expect(readLast(dir)).toBeNull();
  });

  it('a fast restart (quit, then straight away start) is clean', () => {
    start(100);
    endRun(dir, 100);
    expect(start(101, { alive: (p) => p === 100 })).toEqual({ kind: 'clean' });
  });

  it('a hard kill leaves the marker, and the next start keeps the notes for Quill', () => {
    start(100, { now: 5 });
    const v = start(101);
    expect(v.kind).toBe('crash');
    expect(readLast(dir)).toMatchObject({ offered: false, notes: { how: 'killed', startedAt: 5, version: '1.4.0' } });
    expect(marker()).toMatchObject({ pid: 101, events: [] });
  });

  it('a crash during start-up is found too (the marker is written first thing)', () => {
    start(100);
    expect(start(101).kind).toBe('crash');
  });

  it('a window crash is noted, survives a proper quit, and is found next time', () => {
    start(100);
    noteEvent(dir, 100, 'The drawing window stopped (crashed, exit code 139).');
    endRun(dir, 100);
    expect(marker()).toMatchObject({ state: 'closed' });
    expect(start(101).kind).toBe('crash');
    expect(readLast(dir)!.notes).toMatchObject({ how: 'window', events: ['The drawing window stopped (crashed, exit code 139).'] });
  });

  it('only the next start after a crash sees it: the one after that is clean', () => {
    start(100);
    expect(start(101).kind).toBe('crash');
    endRun(dir, 101);
    expect(start(102)).toEqual({ kind: 'clean' });
  });

  it('a second copy still running is left alone: its marker stays, and it is not called a crash', () => {
    start(100);
    const before = fs.readFileSync(path.join(dir, MARKER_FILE), 'utf8');
    expect(start(200, { alive: (p) => p === 100 })).toEqual({ kind: 'other-running' });
    expect(fs.readFileSync(path.join(dir, MARKER_FILE), 'utf8')).toBe(before);
    expect(has(LAST_FILE)).toBe(false);
  });

  it("a copy that quits never clears or changes another copy's marker", () => {
    start(100);
    endRun(dir, 999);
    noteEvent(dir, 999, 'not mine');
    expect(marker()).toMatchObject({ pid: 100, events: [] });
  });

  it('events after the quit are ignored, and a missing or broken file is no trouble', () => {
    start(100);
    endRun(dir, 100);
    noteEvent(dir, 100, 'late');
    expect(has(MARKER_FILE)).toBe(false);
    fs.writeFileSync(path.join(dir, MARKER_FILE), '{ half a file');
    expect(start(101)).toEqual({ kind: 'clean' });
    expect(marker()).toMatchObject({ pid: 101 });
  });

  it('a folder it cannot write to never stops the app', () => {
    const blocked = path.join(dir, 'file-not-folder');
    fs.writeFileSync(blocked, '');
    expect(startRun({ dir: blocked, pid: 1, version: '', platform: '' })).toEqual({ kind: 'clean' });
    expect(() => endRun(blocked, 1)).not.toThrow();
    expect(() => noteEvent(blocked, 1, 'x')).not.toThrow();
  });
});

describe('Quill has offered it', () => {
  it('is remembered, so he turns up once, and a newer crash starts fresh', () => {
    start(100);
    start(101);
    expect(readLast(dir)!.offered).toBe(false);
    markOffered(dir);
    expect(readLast(dir)!.offered).toBe(true);
    start(102);
    expect(readLast(dir)!.offered).toBe(false);
  });

  it('an unreadable notes file is just no crash', () => {
    fs.writeFileSync(path.join(dir, LAST_FILE), 'nope');
    expect(readLast(dir)).toBeNull();
    expect(() => markOffered(dir)).not.toThrow();
  });
});

const MIN = 60_000;
const sample = (now: number, appMB: number, freeMB: number) => ({ now, appMB, freeMB });

describe('a sign of life every so often', () => {
  it('keeps the latest time, the most Frameling used and the least the computer had free', () => {
    start(100, { now: 0 });
    beat(dir, 100, sample(30_000, 800, 4000));
    beat(dir, 100, sample(60_000, 2400, 900));
    beat(dir, 100, sample(90_000, 1200, 3000));
    expect(marker()!.alive).toEqual({ at: 90_000, peakMB: 2400, lowestFreeMB: 900 });
  });

  it('only ever touches its own run, and not after the quit', () => {
    start(100);
    beat(dir, 999, sample(5, 1, 1));
    expect(marker()!.alive).toBeUndefined();
    endRun(dir, 100);
    beat(dir, 100, sample(5, 1, 1));
    expect(has(MARKER_FILE)).toBe(false);
  });

  it('is cheap: one small file, no log that grows', () => {
    start(100);
    for (let i = 0; i < 500; i++) beat(dir, 100, sample(i * BEAT_MS, 1000 + i, 5000 - i));
    expect(fs.statSync(path.join(dir, MARKER_FILE)).size).toBeLessThan(400);
  });

  it('a made-up or half-written sign of life is ignored, not trusted', () => {
    const m = (alive: unknown) => parseMarker(JSON.stringify({ v: 1, state: 'running', pid: 4, startedAt: 9, alive }));
    expect(m({ at: 'x', peakMB: 1, lowestFreeMB: 1 })!.alive).toBeUndefined();
    expect(m({ at: 1, peakMB: -5, lowestFreeMB: 1 })!.alive).toBeUndefined();
    expect(m({ at: 1, peakMB: 5, lowestFreeMB: 1 })!.alive).toEqual({ at: 1, peakMB: 5, lowestFreeMB: 1 });
  });
});

describe('telling a stop apart from the notes', () => {
  const base: Marker = { v: 1, state: 'running', pid: 500, startedAt: 0, version: '1', platform: 'linux', events: [], alive: { at: 50 * MIN, peakMB: 2430, lowestFreeMB: 212 } };

  it('says how long it ran and rounds the memory, so nothing is more exact than it needs to be', () => {
    expect(factsOf(base)).toEqual({ ranMinutes: 50, peakMB: 2450, lowestFreeMB: 200 });
  });

  it('a computer that started again after the last sign of life says so', () => {
    expect(factsOf(base, 50 * MIN + 10 * MIN).restarted).toBe(true);
    expect(factsOf(base, 50 * MIN + MIN).restarted).toBeUndefined();
    expect(factsOf(base, -1 * MIN).restarted).toBeUndefined();
    expect(factsOf(base).restarted).toBeUndefined();
  });

  it('a run that was closed properly after a window crash is never put down to a restart', () => {
    expect(factsOf({ ...base, state: 'closed' }, 10 * 60 * MIN).restarted).toBeUndefined();
  });

  it('a run that died before its first sign of life still has what is known', () => {
    expect(factsOf({ ...base, alive: undefined }, 600 * MIN)).toEqual({ restarted: true });
    expect(factsOf({ ...base, alive: undefined })).toEqual({});
  });

  it('judging carries the facts into the notes, and parsing keeps them', () => {
    const v = judge(base, 600, () => false, 80 * MIN);
    expect(v.kind === 'crash' && v.notes).toMatchObject({ how: 'killed', facts: { ranMinutes: 50, peakMB: 2450, lowestFreeMB: 200, restarted: true } });
    const back = parseNotes(JSON.parse(JSON.stringify(v.kind === 'crash' ? v.notes : null)));
    expect(back?.facts).toEqual({ ranMinutes: 50, peakMB: 2450, lowestFreeMB: 200, restarted: true });
  });

  it('notes from an older version, with no facts, still read', () => {
    expect(parseNotes({ how: 'killed', startedAt: 1, events: [] })).not.toHaveProperty('facts');
    expect(parseNotes({ how: 'killed', startedAt: 1, events: [], facts: { ranMinutes: 'x', peakMB: -1, restarted: 'yes' } })).not.toHaveProperty('facts');
  });
});

describe('the line for a window that stopped', () => {
  it('says it in words first, with the reason and code after, for whoever reads the report', () => {
    const l = windowStopLine({ reason: 'killed', exitCode: 61696 }, 50, 312);
    expect(l).toBe('The drawing window stopped: it was stopped from outside, often by the system to free memory (killed, exit code 61696), 50 minutes in, 300 MB free on the computer.');
    expect(windowStopLine({ reason: 'oom', exitCode: 0 }, 1)).toContain('ran out of memory');
    expect(windowStopLine({ reason: 'something-new', exitCode: 3 })).toBe('The drawing window stopped: (something-new, exit code 3).');
    expect(windowStopLine({ reason: 'crashed', exitCode: 1 }, 5, 100).length).toBeLessThan(300);
  });
});

describe('a whole run, to the report', () => {
  it('a window crash, a quit, a start: the notes carry the event and the run says how long it lasted', () => {
    start(100, { now: 0 });
    beat(dir, 100, sample(20 * MIN, 1500, 2000));
    noteEvent(dir, 100, windowStopLine({ reason: 'oom', exitCode: 0 }, 20, 2000));
    endRun(dir, 100);
    expect(start(101).kind).toBe('crash');
    const n = readLast(dir)!.notes;
    expect(n.how).toBe('window');
    expect(n.events).toHaveLength(1);
    expect(n.facts).toEqual({ ranMinutes: 20, peakMB: 1500, lowestFreeMB: 2000 });
  });

  it('a window crash and then a hard stop keeps both, as both', () => {
    start(100, { now: 0 });
    noteEvent(dir, 100, 'The drawing window stopped: x.');
    beat(dir, 100, sample(10 * MIN, 900, 150));
    const v = start(101, { now: 12 * MIN });
    expect(v.kind === 'crash' && v.notes.how).toBe('both');
    expect(readLast(dir)!.notes.events).toEqual(['The drawing window stopped: x.']);
    expect(readLast(dir)!.notes.facts?.lowestFreeMB).toBe(150);
  });
});

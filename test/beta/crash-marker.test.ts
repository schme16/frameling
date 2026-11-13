// Spotting a crash: a marker written at start and taken away on a proper quit. The tests hold the rule that matters:
// it never claims a crash when there wasn't one, and a hard kill or a window crash is always found next time.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { endRun, judge, LAST_FILE, markOffered, MARKER_FILE, noteEvent, parseMarker, parseNotes, pidAlive, readLast, startRun, type Marker } from '../../src/main/crashMarker';

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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import * as pb from '../../src/timeline/playback';
import { clearInOut, setIn, setInOut, setOut, withEnd } from '../../src/timeline/range';
import { setTl, tl } from '../../src/timeline/state';
import { defaultSettings, planExport, resolveRange } from '../../src/export/plan';
import { loadFile, saveFile } from '../../src/io/file';
import { onionFrames } from '../../src/canvas/onion';
import { docWith, addCel } from './helpers';

function manual() {
  let t = 1000;
  let cb: ((n: number) => void) | null = null;
  pb.setScheduler({ now: () => t, request: (fn) => ((cb = fn), 1), cancel: () => void (cb = null) });
  return {
    run(ms: number) {
      for (let left = ms; left > 0; left -= 20) {
        t += Math.min(20, left);
        const f = cb;
        cb = null;
        f?.(t);
      }
    },
  };
}

let off: () => void = () => {};
beforeEach(() => setTl({ clipId: null }));
afterEach(() => {
  off();
  pb.setScheduler(null);
});

describe('stepPosition', () => {
  it('loops and stops like before without ping-pong', () => {
    expect(pb.stepPosition(5, 4, true, false)).toEqual({ pos: 1, done: false });
    expect(pb.stepPosition(4, 4, false, false)).toEqual({ pos: 3, done: true });
  });
  it('goes forward then back with ping-pong, showing each end once a turn', () => {
    const seq = Array.from({ length: 9 }, (_, i) => pb.stepPosition(i, 4, true, true).pos);
    expect(seq).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 2]);
  });
  it('ping-pong without looping stops back at the start', () => {
    expect(pb.stepPosition(5, 4, false, true)).toEqual({ pos: 1, done: false });
    expect(pb.stepPosition(6, 4, false, true)).toEqual({ pos: 0, done: false });
    expect(pb.stepPosition(7, 4, false, true)).toEqual({ pos: 0, done: true });
  });
  it('copes with a one frame range', () => {
    expect(pb.stepPosition(3, 1, true, true)).toEqual({ pos: 0, done: false });
  });
});

describe('ping-pong playback', () => {
  it('plays back and forth', () => {
    const doc = docWith([[0, 1]], 4);
    doc.fps = 10;
    const s = resetStore(doc);
    off = pb.installPlayback(s);
    s.setUi({ pingPong: true });
    const clock = manual();
    pb.play();
    clock.run(450); // step 4: 0 1 2 3 2
    expect(s.get().ui.frame).toBe(2);
    clock.run(200); // step 6: back to 0
    expect(s.get().ui.frame).toBe(0);
    expect(s.get().ui.playing).toBe(true);
  });
  it('warms the frames it will play next, in ping-pong order', () => {
    const doc = docWith([[0, 1]], 4);
    expect(pb.upcomingFrames(doc, 2, 4, true, null, true)).toEqual([3, 1, 0]);
  });
});

describe('play range (in and out)', () => {
  it('withEnd keeps the range the right way round and drops a range that covers everything', () => {
    expect(withEnd(undefined, 10, 'in', 3)).toEqual({ start: 3, end: 9 });
    expect(withEnd({ start: 3, end: 9 }, 10, 'out', 6)).toEqual({ start: 3, end: 6 });
    expect(withEnd({ start: 3, end: 6 }, 10, 'in', 8)).toEqual({ start: 8, end: 9 });
    expect(withEnd({ start: 3, end: 6 }, 10, 'out', 1)).toEqual({ start: 0, end: 1 });
    expect(withEnd({ start: 3, end: 9 }, 10, 'in', 0)).toBeUndefined();
  });
  it('plays and loops only the range, and a picked clip still wins', () => {
    const doc = docWith([[0, 1]], 12);
    doc.fps = 10;
    const s = resetStore(doc);
    off = pb.installPlayback(s);
    setInOut(4, 6);
    expect(s.get().doc.inOut).toEqual({ start: 4, end: 6 });
    expect(pb.playRange(s.get().doc, null)).toMatchObject({ start: 4, end: 6, clipLoops: true });
    const clock = manual();
    pb.play();
    expect(s.get().ui.frame).toBe(4);
    clock.run(350); // 4 5 6 4
    expect(s.get().ui.frame).toBe(4);
    s.setUi({ playing: false });
    s.update('clip', (d) => void d.clips.push({ id: 'c1', name: 'run', start: 0, end: 2, loop: true }));
    expect(pb.playRange(s.get().doc, 'c1').end).toBe(2);
  });
  it('set in, set out and clear are undoable document changes; setting one lets go of a picked clip', () => {
    const s = resetStore(docWith([[0, 1]], 10));
    setTl({ clipId: 'x' });
    s.setUi({ frame: 2 });
    setIn();
    expect(tl().clipId).toBeNull();
    s.setUi({ frame: 5 });
    setOut();
    expect(s.get().doc.inOut).toEqual({ start: 2, end: 5 });
    clearInOut();
    expect(s.get().doc.inOut).toBeUndefined();
    s.undo();
    expect(s.get().doc.inOut).toEqual({ start: 2, end: 5 });
  });
  it('is ignored once it no longer fits a shorter animation', () => {
    const doc = docWith([[0, 1]], 10);
    doc.inOut = { start: 2, end: 8 };
    doc.length = 5;
    expect(pb.inOutRange(doc)).toEqual({ start: 2, end: 4 });
    doc.inOut = { start: 0, end: 8 };
    expect(pb.inOutRange(doc)).toBeNull();
  });
  it('export can use just the play range, and falls back to everything without one', () => {
    const doc = docWith([[0, 1]], 10);
    doc.inOut = { start: 3, end: 6 };
    const s = { ...defaultSettings(doc), format: 'gif' as const, range: 'inOut' as const };
    expect(resolveRange(doc, s, 0)).toEqual({ start: 3, end: 6 });
    expect(planExport(doc, s, 0).name).toMatch(/-frames-4-7$/);
    delete doc.inOut;
    expect(resolveRange(doc, s, 0)).toEqual({ start: 0, end: 9 });
  });
  it('is saved in the file', async () => {
    const doc = docWith([[0, 1]], 10);
    doc.inOut = { start: 7, end: 2 };
    const back = await loadFile(await saveFile(doc));
    expect(back.doc.inOut).toEqual({ start: 2, end: 7 });
    const plain = await loadFile(await saveFile(docWith([[0, 1]], 10)));
    expect(plain.doc.inOut).toBeUndefined();
  });
});

describe('onion skin, keys only', () => {
  const base = { before: 2, after: 2 };
  it('counts frames normally', () => {
    const doc = docWith([[0, 2], [2, 2], [4, 2], [6, 2]], 8);
    expect(onionFrames(doc, 4, base).map((f) => f.frame).sort()).toEqual([2, 3, 5, 6]);
  });
  it('skips held frames: the poses before and after', () => {
    const doc = docWith([[0, 2], [2, 2], [4, 2], [6, 2]], 8);
    const got = onionFrames(doc, 5, { ...base, keysOnly: true });
    expect(got.filter((f) => f.side === 'before').map((f) => [f.frame, f.dist])).toEqual([[0, 2], [2, 1]]);
    expect(got.filter((f) => f.side === 'after').map((f) => f.frame)).toEqual([6]);
    // Furthest first, so the nearest is painted on top.
    expect(got[got.length - 1].dist).toBe(1);
  });
  it('uses keys from every layer that takes part, and leaves out layers that do not', () => {
    const doc = docWith([[0, 4], [4, 4]], 8);
    const extra = { ...doc.layers[0], id: 'L2', name: 'two', cels: [] as typeof doc.layers[0]['cels'] };
    doc.layers.push(extra);
    addCel(doc, extra, 0, 2);
    addCel(doc, extra, 2, 6);
    expect(onionFrames(doc, 4, { before: 3, after: 0, keysOnly: true }).map((f) => f.frame).sort()).toEqual([0, 2]);
    extra.onion = false;
    expect(onionFrames(doc, 4, { before: 3, after: 0, keysOnly: true }).map((f) => f.frame)).toEqual([0]);
  });
  it('works from an empty document', () => {
    expect(onionFrames(newDoc({ length: 3 }), 0, { before: 2, after: 2, keysOnly: true })).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  bakedPositions,
  bakeFrames,
  clipDirection,
  clipOrder,
  clipPlays,
  cycleLength,
  cyclePositions,
  directedPosition,
  entryFrame,
  holdFrame,
  indexOfPosition,
  playWords,
  readClip,
} from '../../src/core/clipPlay';
import { loadFile, saveFile } from '../../src/io/file';
import { docWith } from '../timeline/helpers';

describe('one pass of a clip', () => {
  it('goes forward, backward, and back and forth with the ends shown once per turn', () => {
    expect(cyclePositions(4, 'forward')).toEqual([0, 1, 2, 3]);
    expect(cyclePositions(4, 'reverse')).toEqual([3, 2, 1, 0]);
    expect(cyclePositions(4, 'pingpong')).toEqual([0, 1, 2, 3, 2, 1]);
    expect(cyclePositions(4, 'pingpong-reverse')).toEqual([3, 2, 1, 0, 1, 2]);
    expect(cycleLength(4, 'pingpong')).toBe(6);
  });
  it('copes with one and two frames', () => {
    expect(cyclePositions(1, 'pingpong')).toEqual([0]);
    expect(cyclePositions(2, 'pingpong')).toEqual([0, 1]);
    expect(cyclePositions(2, 'pingpong-reverse')).toEqual([1, 0]);
    expect(cycleLength(1, 'pingpong')).toBe(1);
  });
});

describe('where it is after some steps', () => {
  it('holds the end frame once the last pass is done', () => {
    expect(directedPosition(2, 3, 'forward', 1)).toEqual({ pos: 2, done: false });
    expect(directedPosition(3, 3, 'forward', 1)).toEqual({ pos: 2, done: true });
    expect(directedPosition(3, 3, 'reverse', 1)).toEqual({ pos: 0, done: true });
  });
  it('a back and forth clip that plays once ends where it started', () => {
    const seen = [0, 1, 2, 3].map((i) => directedPosition(i, 3, 'pingpong', 1));
    expect(seen.map((s) => s.pos)).toEqual([0, 1, 2, 1]);
    expect(directedPosition(4, 3, 'pingpong', 1)).toEqual({ pos: 0, done: true });
    expect(directedPosition(4, 3, 'pingpong-reverse', 1)).toEqual({ pos: 2, done: true });
  });
  it('plays N times, then holds', () => {
    const order = [];
    for (let i = 0; i < 6; i++) order.push(directedPosition(i, 2, 'forward', 3).pos);
    expect(order).toEqual([0, 1, 0, 1, 0, 1]);
    expect(directedPosition(5, 2, 'forward', 3).done).toBe(false);
    expect(directedPosition(6, 2, 'forward', 3)).toEqual({ pos: 1, done: true });
  });
  it('loops forever', () => {
    expect(directedPosition(1000, 4, 'pingpong', Infinity).done).toBe(false);
    expect(directedPosition(6, 4, 'pingpong', Infinity).pos).toBe(0);
  });
  it('finds the step that shows a frame, going the way the clip plays', () => {
    expect(indexOfPosition(1, 4, 'forward')).toBe(1);
    expect(indexOfPosition(1, 4, 'reverse')).toBe(2);
    expect(directedPosition(indexOfPosition(1, 4, 'reverse'), 4, 'reverse', Infinity).pos).toBe(1);
  });
});

describe('the whole order, for formats with no direction of their own', () => {
  it('bakes one pass for a loop and every pass for a repeat', () => {
    expect(bakedPositions(3, 'pingpong', Infinity)).toEqual([0, 1, 2, 1]);
    expect(bakedPositions(3, 'forward', 2)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(bakedPositions(3, 'pingpong', 2)).toEqual([0, 1, 2, 1, 0, 1, 2, 1, 0]);
    expect(bakedPositions(3, 'reverse', 1)).toEqual([2, 1, 0]);
  });
  it('maps frames through the order', () => {
    expect(bakeFrames(['a', 'b', 'c'], 'pingpong', 1)).toEqual(['a', 'b', 'c', 'b', 'a']);
  });
  it('works on a clip', () => {
    const c = { start: 4, end: 6, loop: false, direction: 'reverse' as const, repeat: 2 };
    expect(clipOrder(c)).toEqual([6, 5, 4, 6, 5, 4]);
    expect(holdFrame(c)).toBe(4);
    expect(entryFrame(c)).toBe(6);
    expect(clipOrder({ start: 4, end: 6, loop: true })).toEqual([4, 5, 6]);
  });
  it('baked order and stepping agree', () => {
    for (const dir of ['forward', 'reverse', 'pingpong', 'pingpong-reverse'] as const) {
      for (const plays of [1, 2, 3]) {
        const baked = bakedPositions(4, dir, plays);
        const stepped: number[] = [];
        for (let i = 0; i < baked.length; i++) stepped.push(directedPosition(i, 4, dir, plays).pos);
        expect(stepped).toEqual(baked);
      }
    }
  });
});

describe('what a clip says about itself', () => {
  it('reads no direction as forward and a loop as forever', () => {
    expect(clipDirection({})).toBe('forward');
    expect(clipPlays({ loop: true, repeat: 4 })).toBe(Infinity);
    expect(clipPlays({ loop: false })).toBe(1);
    expect(clipPlays({ loop: false, repeat: 3 })).toBe(3);
  });
  it('says it in words', () => {
    expect(playWords({ loop: true })).toBe('loops');
    expect(playWords({ loop: false })).toBe('');
    expect(playWords({ loop: false, direction: 'pingpong', repeat: 3 })).toBe('back and forth, 3 times');
  });
});

describe('reading a clip from a file', () => {
  it('keeps a good direction and repeat and drops nonsense', () => {
    expect(readClip({ id: 'a', loop: false, direction: 'pingpong', repeat: 3 })).toMatchObject({ direction: 'pingpong', repeat: 3 });
    const bad = readClip({ id: 'a', loop: false, direction: 'sideways', repeat: -2 });
    expect('direction' in bad).toBe(false);
    expect('repeat' in bad).toBe(false);
    expect('repeat' in readClip({ id: 'a', loop: false, repeat: 1.2 })).toBe(false);
    expect(readClip({ id: 'a', loop: false, repeat: 2.6 })).toMatchObject({ repeat: 3 });
    expect('direction' in readClip({ id: 'a', loop: false, direction: 'forward' })).toBe(false);
  });
  it('leaves an old clip exactly as it was', () => {
    const old = { id: 'k', name: 'idle', start: 0, end: 2, loop: true };
    expect(readClip(old)).toEqual(old);
  });
  it('saves and loads the settings, and an old file opens unchanged', () => {
    const doc = docWith([[0, 1]], 8);
    doc.clips.push({ id: 'k1', name: 'idle', start: 0, end: 2, loop: true });
    doc.clips.push({ id: 'k2', name: 'bounce', start: 2, end: 5, loop: false, direction: 'pingpong', repeat: 3 });
    const back = loadFile(saveFile(doc, '1.2.3')).doc;
    expect(back.clips).toEqual(doc.clips);
    expect(back.clips[0]).toEqual({ id: 'k1', name: 'idle', start: 0, end: 2, loop: true });
  });
  it('drops a bad direction when opening a file', () => {
    const doc = docWith([[0, 1]], 8);
    doc.clips.push({ id: 'k2', name: 'x', start: 2, end: 5, loop: false, direction: 'upside-down' as never, repeat: 0 });
    const back = loadFile(saveFile(doc, '1.2.3')).doc;
    expect(back.clips[0]).toEqual({ id: 'k2', name: 'x', start: 2, end: 5, loop: false });
  });
});

describe('the pixel Preview panel follows the clip too', () => {
  it('steps back and forth, backward and a set number of times', async () => {
    const { previewFrames, previewPosition, previewIndex } = await import('../../src/pixel/preview');
    const doc = docWith([[0, 1]], 10);
    doc.clips.push({ id: 'a', name: 'bounce', start: 2, end: 4, loop: true, direction: 'pingpong' });
    doc.clips.push({ id: 'b', name: 'twice', start: 6, end: 7, loop: false, repeat: 2 });
    const r = previewFrames(doc, 'clip', 3);
    expect(Array.from({ length: 5 }, (_, i) => previewPosition(i, r, true).frame)).toEqual([2, 3, 4, 3, 2]);
    expect(previewIndex(4, r)).toBe(2);
    const t = previewFrames(doc, 'clip', 6);
    // The clip's own count beats the Loop switch.
    expect(previewPosition(3, t, true)).toEqual({ frame: 7, done: false });
    expect(previewPosition(4, t, true)).toEqual({ frame: 7, done: true });
    // With no clip it is the plain loop (or one play-through).
    const all = previewFrames(doc, 'all', 0);
    expect(previewPosition(10, all, true)).toEqual({ frame: 0, done: false });
    expect(previewPosition(10, all, false)).toEqual({ frame: 9, done: true });
  });
});

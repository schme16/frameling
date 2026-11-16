// The onion skin stays inside the clip you are in, unless the choice says to carry on.
import { describe, expect, it } from 'vitest';
import { onionFrames, onionKeys, onionShading, onionSpan, onionTrimmed } from '../../src/canvas/onion';
import type { Clip, Doc } from '../../src/core/format';
import { docWith } from '../timeline/helpers';

const clip = (id: string, start: number, end: number): Clip => ({ id, name: id, start, end, loop: true });
const look = { before: 2, after: 2 };

// Two clips back to back: run is frames 0 to 9, jump is 10 to 19. One drawing per frame.
function twoClips(): Doc {
  const doc = docWith(Array.from({ length: 20 }, (_, f) => [f, 1] as [number, number]), 20);
  doc.clips = [clip('run', 0, 9), clip('jump', 10, 19)];
  return doc;
}
const frames = (doc: Doc, f: number, o: object = look) => onionFrames(doc, f, { ...look, ...o }).map((x) => x.frame).sort((a, b) => a - b);

describe('onion skin and clip edges', () => {
  it('shows no ghost from the next clip on the last frame of a clip', () => {
    expect(frames(twoClips(), 9)).toEqual([7, 8]);
  });
  it('shows no ghost from the clip before on the first frame of a clip', () => {
    expect(frames(twoClips(), 10)).toEqual([11, 12]);
  });
  it('is unchanged in the middle of a clip', () => {
    expect(frames(twoClips(), 5)).toEqual([3, 4, 6, 7]);
  });
  it('carries on over the edge when the choice says so', () => {
    expect(frames(twoClips(), 9, { acrossClips: true })).toEqual([7, 8, 10, 11]);
  });
  it('has no edge in a file with no clips, or on a frame in no clip', () => {
    const none = twoClips();
    none.clips = [];
    expect(frames(none, 9)).toEqual([7, 8, 10, 11]);
    const gap = twoClips();
    gap.clips = [clip('run', 0, 5)];
    expect(frames(gap, 8)).toEqual([6, 7, 9, 10]);
  });
  it('keeps keys only inside the clip too, and skips holds as before', () => {
    const doc = docWith([[0, 2], [2, 2], [4, 2], [6, 2], [8, 2]], 10);
    doc.clips = [clip('a', 0, 5), clip('b', 6, 9)];
    expect(frames(doc, 4, { keysOnly: true })).toEqual([0, 2]);
    expect(frames(doc, 6, { keysOnly: true })).toEqual([8]);
    expect(frames(doc, 6, { keysOnly: true, acrossClips: true })).toEqual([2, 4, 8]);
  });
  it('the span of a frame is its clip, or nothing when crossing', () => {
    const doc = twoClips();
    expect(onionSpan(doc, 12)).toEqual({ start: 10, end: 19 });
    expect(onionSpan(doc, 12, true)).toBeNull();
    expect(onionKeys(doc, { start: 10, end: 12 })).toEqual([10, 11, 12]);
  });
  it('says when an edge is hiding a ghost, so the first time can be told', () => {
    const doc = twoClips();
    expect(onionTrimmed(doc, 9, look)).toBe(true);
    expect(onionTrimmed(doc, 5, look)).toBe(false);
    expect(onionTrimmed(doc, 9, { ...look, acrossClips: true })).toBe(false);
  });
  it('shades the ruler only where there are ghosts', () => {
    expect(onionShading(twoClips(), 9, look)).toEqual([{ side: 'before', from: 7, to: 8 }]);
    expect(onionShading(twoClips(), 5, look)).toEqual([{ side: 'before', from: 3, to: 4 }, { side: 'after', from: 6, to: 7 }]);
  });
});

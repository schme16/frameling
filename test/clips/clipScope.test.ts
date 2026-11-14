// What you are working on: the clip around the playhead, and a clip's distinct drawings, once each.
import { describe, expect, it } from 'vitest';
import { clipAtFrame, clipSpan, keyFrames, keyHolds, keyLabel, keyMatches, namedDrawings, workingClip } from '../../src/core/clipScope';
import { newVectorLayer } from '../../src/core/doc';
import type { Clip, Doc } from '../../src/core/format';
import { addCel, docWith } from '../timeline/helpers';

const clip = (id: string, start: number, end: number): Clip => ({ id, name: id, start, end, loop: true });

describe('which clip a frame is in', () => {
  const doc = { clips: [clip('run', 0, 9), clip('jump', 10, 19), clip('all', 0, 19)] };
  it('is the shortest one that holds it, so the most specific', () => {
    expect(clipAtFrame(doc, 3)?.id).toBe('run');
    expect(clipAtFrame(doc, 10)?.id).toBe('jump');
  });
  it('is nothing outside every clip', () => {
    expect(clipAtFrame(doc, 20)).toBeUndefined();
    expect(clipAtFrame({ clips: [] }, 0)).toBeUndefined();
  });
  it('prefers the one picked on the timeline when it holds the frame', () => {
    expect(clipAtFrame(doc, 3, 'all')?.id).toBe('all');
    expect(clipAtFrame(doc, 3, 'jump')?.id).toBe('run');
  });
  it('reads a clip whose ends were stored the wrong way round', () => {
    expect(clipSpan({ start: 9, end: 4 })).toEqual({ start: 4, end: 9 });
    expect(clipAtFrame({ clips: [clip('x', 9, 4)] }, 6)?.id).toBe('x');
  });
  it('working clip: the picked one wins even when the playhead is elsewhere', () => {
    expect(workingClip(doc, 3, 'jump')?.id).toBe('jump');
    expect(workingClip(doc, 3, null)?.id).toBe('run');
    expect(workingClip(doc, 3, 'gone')?.id).toBe('run');
  });
});

describe('the distinct drawings of a clip', () => {
  // Frame:   0  1  2  3  4  5  6  7  8  9
  // Body:    [--------]  [-----]  [--]  [-]   (starts 0, 3, 6, 9 ... held on each)
  const make = (): Doc => {
    const doc = docWith([[0, 3], [3, 3], [6, 3], [9, 1]], 10);
    const eyes = newVectorLayer('Eyes');
    doc.layers.push(eyes);
    addCel(doc, eyes, 0, 5);
    addCel(doc, eyes, 5, 5);
    return doc;
  };

  it('lists each moment once, whatever is held: a key is any frame where a layer starts a drawing', () => {
    expect(keyFrames(make()).map((k) => k.frame)).toEqual([0, 3, 5, 6, 9]);
  });
  it('says how long each picture stays, up to the next one', () => {
    expect(keyFrames(make()).map((k) => [k.frame, k.end])).toEqual([[0, 2], [3, 4], [5, 5], [6, 8], [9, 9]]);
    expect(keyHolds({ frame: 3, end: 4 }, 4)).toBe(true);
    expect(keyHolds({ frame: 3, end: 4 }, 5)).toBe(false);
  });
  it('stays inside a span, and counts a drawing held in from before as a picture at the first frame', () => {
    expect(keyFrames(make(), { start: 4, end: 8 }).map((k) => k.frame)).toEqual([4, 5, 6]);
    expect(keyFrames(make(), { start: 4, end: 8 })[0].starts).toEqual([]);
  });
  it('is a handful of pictures at 100 fps, not one per frame', () => {
    const doc = docWith([[0, 150], [150, 150]], 300);
    doc.fps = 100;
    expect(keyFrames(doc)).toHaveLength(2);
  });
  it('leaves out hidden layers and the camera', () => {
    const doc = make();
    doc.layers[1].visible = false;
    expect(keyFrames(doc).map((k) => k.frame)).toEqual([0, 3, 6, 9]);
    doc.layers[1].visible = true;
    doc.layers[1].kind = 'camera' as never;
    expect(keyFrames(doc).map((k) => k.frame)).toEqual([0, 3, 6, 9]);
  });
  it('is nothing for an empty span', () => {
    expect(keyFrames(make(), { start: 8, end: 3 })).toEqual([]);
  });
});

describe('names on the pictures', () => {
  const make = (): Doc => {
    const doc = docWith([[0, 3], [3, 3]], 6);
    const eyes = newVectorLayer('Eyes');
    doc.layers.push(eyes);
    addCel(doc, eyes, 3, 3);
    doc.layers[0].cels[1].name = 'body lean';
    eyes.cels[0].name = 'eyes sad';
    return doc;
  };
  it('lists named drawings in time order, topmost layer first within a frame', () => {
    expect(namedDrawings(make()).map((n) => n.name)).toEqual(['eyes sad', 'body lean']);
  });
  it('labels a picture with the active layer name, else the topmost', () => {
    const doc = make();
    const k = keyFrames(doc)[1];
    expect(keyLabel(k)).toBe('eyes sad');
    expect(keyLabel(k, doc.layers[0].id)).toBe('body lean');
    expect(keyLabel(keyFrames(doc)[0])).toBe('');
  });
  it('finds by the start of any word of a name or its layer', () => {
    const k = keyFrames(make())[1];
    expect(keyMatches(k, 'sad')).toBe(true);
    expect(keyMatches(k, 'eyes sa')).toBe(true);
    expect(keyMatches(k, 'ad')).toBe(false);
    expect(keyMatches(k, '')).toBe(true);
    expect(keyMatches(keyFrames(make())[0], 'sad')).toBe(false);
  });
});

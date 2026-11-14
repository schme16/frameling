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
  holdPosition,
  stillPositions,
  repeatWords,
  indexOfPosition,
  playWords,
  readClip,
} from '../../src/core/clipPlay';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { loadFile, migrate, saveFile } from '../../src/io/file';
import { FORMAT_VERSION } from '../../src/core/format';
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
  it('back and forth counts each direction as one: 1 is there only, 2 there and back, 3 there, back, there', () => {
    const run = (plays: number, dir: 'pingpong' | 'pingpong-reverse' = 'pingpong') => bakedPositions(4, dir, plays);
    expect(run(1)).toEqual([0, 1, 2, 3]);
    expect(run(2)).toEqual([0, 1, 2, 3, 2, 1, 0]);
    expect(run(3)).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 2, 3]);
    expect(run(1, 'pingpong-reverse')).toEqual([3, 2, 1, 0]);
    expect(run(2, 'pingpong-reverse')).toEqual([3, 2, 1, 0, 1, 2, 3]);
    expect(run(3, 'pingpong-reverse')).toEqual([3, 2, 1, 0, 1, 2, 3, 2, 1, 0]);
  });
  it('holds where the last direction ends', () => {
    expect(directedPosition(3, 4, 'pingpong', 1)).toEqual({ pos: 3, done: false });
    expect(directedPosition(4, 4, 'pingpong', 1)).toEqual({ pos: 3, done: true });
    expect(directedPosition(7, 4, 'pingpong', 2)).toEqual({ pos: 0, done: true });
    expect(directedPosition(10, 4, 'pingpong', 3)).toEqual({ pos: 3, done: true });
    expect(directedPosition(4, 4, 'pingpong-reverse', 1)).toEqual({ pos: 0, done: true });
    expect(directedPosition(7, 4, 'pingpong-reverse', 2)).toEqual({ pos: 3, done: true });
    expect(holdPosition(4, 'pingpong', 2)).toBe(0);
    expect(holdPosition(4, 'pingpong-reverse', 3)).toBe(0);
  });
  it('two frames and one frame still bounce', () => {
    expect(bakedPositions(2, 'pingpong', 3)).toEqual([0, 1, 0, 1]);
    expect(bakedPositions(1, 'pingpong', 3)).toEqual([0, 0, 0]);
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
    expect(bakedPositions(3, 'pingpong', 2)).toEqual([0, 1, 2, 1, 0]);
    expect(bakedPositions(3, 'reverse', 1)).toEqual([2, 1, 0]);
  });
  it('maps frames through the order', () => {
    expect(bakeFrames(['a', 'b', 'c'], 'pingpong', 2)).toEqual(['a', 'b', 'c', 'b', 'a']);
    expect(bakeFrames(['a', 'b', 'c'], 'pingpong', 1)).toEqual(['a', 'b', 'c']);
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
      for (const plays of [1, 2, 3, 4, 5]) {
        const baked = bakedPositions(4, dir, plays);
        const stepped: number[] = [];
        for (let i = 0; i < baked.length; i++) stepped.push(directedPosition(i, 4, dir, plays).pos);
        expect(stepped).toEqual(baked);
      }
    }
  });
});

describe('stills hold each frame once', () => {
  it('keeps the direction and drops the repeat and the way back', () => {
    expect(stillPositions(4, 'forward')).toEqual([0, 1, 2, 3]);
    expect(stillPositions(4, 'reverse')).toEqual([3, 2, 1, 0]);
    expect(stillPositions(4, 'pingpong')).toEqual([0, 1, 2, 3]);
    expect(stillPositions(4, 'pingpong-reverse')).toEqual([3, 2, 1, 0]);
  });
});

describe('what a clip says about itself', () => {
  it('counts back and forth by direction in words', () => {
    expect(repeatWords('forward', 3)).toBe('3 times');
    expect(repeatWords('pingpong', 1)).toBe('There only');
    expect(repeatWords('pingpong', 2)).toBe('There and back');
    expect(repeatWords('pingpong-reverse', 3)).toBe('3 ways (there, back, there)');
    expect(repeatWords('pingpong', Infinity)).toBe('Forever');
  });
  it('reads no direction as forward and a loop as forever', () => {
    expect(clipDirection({})).toBe('forward');
    expect(clipPlays({ loop: true, repeat: 4 })).toBe(Infinity);
    expect(clipPlays({ loop: false })).toBe(1);
    expect(clipPlays({ loop: false, repeat: 3 })).toBe(3);
  });
  it('says it in words', () => {
    expect(playWords({ loop: true })).toBe('loops');
    expect(playWords({ loop: false })).toBe('');
    expect(playWords({ loop: false, direction: 'pingpong', repeat: 3 })).toBe('back and forth, 3 ways');
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

describe('old files: a back and forth repeat counted whole trips, now it counts each direction', () => {
  /** A saved file turned back into one an older Frameling (format 1) wrote. */
  const asVersion1 = (bytes: Uint8Array): Uint8Array => {
    const entries = unzipSync(bytes);
    entries['manifest.json'] = strToU8(JSON.stringify({ ...JSON.parse(strFromU8(entries['manifest.json'])), version: 1 }));
    return zipSync(entries);
  };
  const oldDoc = () => {
    const doc = docWith([[0, 1]], 12);
    doc.clips.push(
      { id: 'a', name: 'trips3', start: 0, end: 3, loop: false, direction: 'pingpong', repeat: 3 },
      { id: 'b', name: 'once', start: 0, end: 3, loop: false, direction: 'pingpong' },
      { id: 'c', name: 'backwards', start: 4, end: 7, loop: false, direction: 'pingpong-reverse', repeat: 2 },
      { id: 'd', name: 'loops', start: 0, end: 3, loop: true, direction: 'pingpong' },
      { id: 'e', name: 'fwd3', start: 0, end: 3, loop: false, repeat: 3 },
      { id: 'f', name: 'rev', start: 0, end: 3, loop: false, direction: 'reverse' },
    );
    return doc;
  };

  it('doubles the repeat so an old clip plays the same frames', () => {
    const old = oldDoc();
    // What an old file's clips played (whole trips, the turn frames once, ending where they started).
    const oldOrder = (len: number, trips: number) => {
      const trip = [...Array(len).keys(), ...[...Array(len).keys()].reverse().slice(1, -1)];
      return [...Array.from({ length: trips }, () => trip).flat(), 0];
    };
    const back = loadFile(asVersion1(saveFile(old, '1.0.0'))).doc;
    const by = (n: string) => back.clips.find((c) => c.name === n)!;
    expect(by('trips3').repeat).toBe(6);
    expect(clipOrder(by('trips3'))).toEqual(oldOrder(4, 3));
    expect(by('once').repeat).toBe(2);
    expect(clipOrder(by('once'))).toEqual(oldOrder(4, 1));
    expect(by('backwards').repeat).toBe(4);
    expect(clipOrder(by('backwards')).map((f) => f - 4)).toEqual([3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3]);
  });

  it('leaves loops, forward and backward clips alone', () => {
    const back = loadFile(asVersion1(saveFile(oldDoc(), '1.0.0'))).doc;
    const by = (n: string) => back.clips.find((c) => c.name === n)!;
    expect('repeat' in by('loops')).toBe(false);
    expect(by('fwd3').repeat).toBe(3);
    expect('repeat' in by('rev')).toBe(false);
  });

  it('does it once: a file saved now is not changed when it opens again', () => {
    const doc = oldDoc();
    const now = saveFile(doc, '1.2.3');
    expect(JSON.parse(strFromU8(unzipSync(now)['manifest.json'])).version).toBe(FORMAT_VERSION);
    expect(loadFile(now).doc.clips).toEqual(doc.clips);
  });

  it('migrates the clips of artboards too', () => {
    const raw = { clips: [], artboards: [{ id: 'x', content: { clips: [{ id: 'k', loop: false, direction: 'pingpong', repeat: 2 }] } }, { id: 'y' }] };
    const out = migrate(raw, 1);
    expect(out.artboards[0].content.clips[0].repeat).toBe(4);
    expect(out.version).toBe(FORMAT_VERSION);
  });

  it('migrates the clips a variation overrides too', () => {
    const raw = { clips: [], artboards: [{ id: 'v', variationOf: 'x', overrides: { stage: { set: { clips: [{ id: 'k', loop: false, direction: 'pingpong', repeat: 3 }, { id: 'j', loop: false, direction: 'pingpong-reverse' }, { id: 'f', loop: false, direction: 'forward', repeat: 3 }] } } } }] };
    const c = migrate(raw, 1).artboards[0].overrides.stage.set.clips;
    expect(c.map((x: { repeat?: number }) => x.repeat)).toEqual([6, 2, 3]);
  });
});

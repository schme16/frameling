import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { addArtboard, artboardsOf, duplicateArtboard, renameArtboard, switchArtboard, wholeBoardClip } from '../../src/artboards/model';

/** A document whose first artboard is "wave", with one clip across all of it. */
function wave(clipName = 'wave', end = 9): Doc {
  const doc = newDoc({ name: 'Quill', length: 10 });
  renameArtboard(doc, artboardsOf(doc)[0].id, 'wave');
  doc.clips.push({ id: 'k1', name: clipName, start: 0, end, loop: true });
  return doc;
}

describe('an artboard and its only clip share a name', () => {
  it('finds the clip that is just the artboard said again', () => {
    expect(wholeBoardClip([{ name: 'a', start: 0, end: 9 }], 10)?.name).toBe('a');
    expect(wholeBoardClip([{ name: 'a', start: 0, end: 4 }], 10)).toBeUndefined();
    expect(wholeBoardClip([{ name: 'a', start: 1, end: 9 }], 10)).toBeUndefined();
    expect(wholeBoardClip([{ name: 'a', start: 0, end: 9 }, { name: 'b', start: 0, end: 9 }], 10)).toBeUndefined();
    expect(wholeBoardClip([], 10)).toBeUndefined();
  });

  it('renaming the open artboard renames its clip too', () => {
    const doc = wave();
    renameArtboard(doc, artboardsOf(doc)[0].id, 'wave hello');
    expect(artboardsOf(doc)[0].name).toBe('wave hello');
    expect(doc.clips.map((c) => c.name)).toEqual(['wave hello']);
  });

  it('renaming an artboard that is not open renames its clip too', () => {
    const doc = wave();
    const other = duplicateArtboard(doc, artboardsOf(doc)[0].id)!;
    expect(artboardsOf(doc).find((a) => a.id === other)!.content).toBeTruthy();
    renameArtboard(doc, other, 'goodbye');
    expect(artboardsOf(doc).find((a) => a.id === other)!.content!.clips.map((c) => c.name)).toEqual(['goodbye']);
    // The open one is untouched.
    expect(doc.clips.map((c) => c.name)).toEqual(['wave']);
  });

  it('leaves a clip with a name of its own alone', () => {
    const doc = wave('hello-cycle');
    renameArtboard(doc, artboardsOf(doc)[0].id, 'wave 2');
    expect(doc.clips.map((c) => c.name)).toEqual(['hello-cycle']);
  });

  it('leaves clips alone when there are several or one covers only part', () => {
    const part = wave('wave', 4);
    renameArtboard(part, artboardsOf(part)[0].id, 'x');
    expect(part.clips[0].name).toBe('wave');
    const two = wave();
    two.clips.push({ id: 'k2', name: 'other', start: 2, end: 3, loop: false });
    renameArtboard(two, artboardsOf(two)[0].id, 'x');
    expect(two.clips.map((c) => c.name)).toEqual(['wave', 'other']);
  });

  it('stays out of the way of an artboard with no clip, and of a blank name', () => {
    const doc = newDoc({ length: 10 });
    renameArtboard(doc, artboardsOf(doc)[0].id, 'idle');
    expect(doc.clips).toEqual([]);
    const d2 = wave();
    renameArtboard(d2, artboardsOf(d2)[0].id, '   ');
    expect(artboardsOf(d2)[0].name).toBe('wave');
    expect(d2.clips[0].name).toBe('wave');
  });

  it('a duplicate is "wave 2" with a clip called "wave 2", and the original keeps its own', () => {
    const doc = wave();
    const copy = duplicateArtboard(doc, artboardsOf(doc)[0].id)!;
    const board = artboardsOf(doc).find((a) => a.id === copy)!;
    expect(board.name).toBe('wave 2');
    expect(board.content!.clips.map((c) => c.name)).toEqual(['wave 2']);
    expect(doc.clips.map((c) => c.name)).toEqual(['wave']);
    // No two clips share a name, on either side.
    const all = [...doc.clips, ...board.content!.clips].map((c) => c.name);
    expect(new Set(all).size).toBe(all.length);
  });

  it('a duplicate keeps a clip that has a name of its own', () => {
    const doc = wave('hello-cycle');
    const copy = duplicateArtboard(doc, artboardsOf(doc)[0].id)!;
    expect(artboardsOf(doc).find((a) => a.id === copy)!.content!.clips.map((c) => c.name)).toEqual(['hello-cycle']);
  });

  it('keeps following after the artboard is opened and renamed again', () => {
    const doc = wave();
    const id2 = addArtboard(doc, { name: 'talk' });
    switchArtboard(doc, id2);
    // "wave" is now the one set aside
    renameArtboard(doc, artboardsOf(doc)[0].id, 'wave big');
    expect(artboardsOf(doc)[0].content!.clips.map((c) => c.name)).toEqual(['wave big']);
    switchArtboard(doc, artboardsOf(doc)[0].id);
    expect(doc.clips.map((c) => c.name)).toEqual(['wave big']);
    renameArtboard(doc, artboardsOf(doc)[0].id, 'wave bigger');
    expect(doc.clips.map((c) => c.name)).toEqual(['wave bigger']);
  });
});

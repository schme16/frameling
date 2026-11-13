// @vitest-environment jsdom
// The four ways to build a sprite: stored in the file, worked out for old ones, started ready, and converted both ways.
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { artboardsOf, contentOf } from '../../src/artboards/model';
import type { Doc, PixelLayer } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { newDoc, newPixelDrawing } from '../../src/core/doc';
import { boardCount, chipLabel, convertWay, inferWay, isPixelDoc, newSpriteDoc, pixelSizeFor, sheetSentence, totalFrames, wayChoices, wayOf } from '../../src/pixel/way';

const px = (doc: Doc, layer: PixelLayer, start: number, rgba: number[]) => {
  const d = newPixelDrawing(4, 4);
  for (let p = 0; p < 16; p++) d.pixels.set(rgba, p * 4);
  doc.drawings[d.id] = d;
  layer.cels.push({ id: `c${doc.length}-${start}-${Math.random()}`, start, length: 1, drawingId: d.id });
};

/** An animation of n frames, each a different solid red. */
function anim(n = 4): Doc {
  const doc = newDoc({ name: 'Hero', width: 32, height: 32, length: n, pixel: { pixelSize: 8 } });
  for (let i = 0; i < n; i++) px(doc, doc.layers[0] as PixelLayer, i, [10 + i * 20, 5, 5, 255]);
  doc.clips.push({ id: 'q1', name: 'idle', start: 0, end: n - 1, loop: true });
  return doc;
}
const redOf = (doc: Doc, layerIndex: number, frame: number): number => {
  const layer = doc.layers[layerIndex];
  const c = layer.cels.find((x) => frame >= x.start && frame < x.start + x.length)!;
  return (doc.drawings[c.drawingId] as { pixels: Uint8ClampedArray }).pixels[0];
};
const change = (doc: Doc, to: Parameters<typeof convertWay>[1]) => {
  let r!: ReturnType<typeof convertWay>;
  const next = produce(doc, (d) => {
    r = convertWay(d as Doc, to);
  });
  return { r, next };
};

describe('which way a file is', () => {
  it('works it out for a file that does not say', () => {
    expect(inferWay(newDoc({ length: 1, pixel: { pixelSize: 8 } }))).toBe('picture');
    expect(inferWay(anim(5))).toBe('animation');
    expect(wayOf(anim(5))).toBe('animation');
    expect(isPixelDoc(anim())).toBe(true);
  });
  it('several boards with plain names and one frame each are frames on boards, else sprites on a sheet', () => {
    const boards = newSpriteDoc({ way: 'boards', width: 16, height: 16 });
    delete boards.sprite;
    expect(inferWay(boards)).toBe('boards');
    const cast = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    delete cast.sprite;
    expect(inferWay(cast)).toBe('sheet');
    // named boards with one frame each are still a cast, not frames
    const named = newSpriteDoc({ way: 'boards', width: 16, height: 16 });
    delete named.sprite;
    artboardsOf(named)[0].name = 'Hero';
    expect(inferWay(named)).toBe('sheet');
  });
  it('believes what the file says until it stops being true', () => {
    const doc = anim(3);
    doc.sprite = { way: 'picture' };
    expect(wayOf(doc)).toBe('animation');
    const one = newDoc({ length: 1, pixel: { pixelSize: 8 } });
    one.sprite = { way: 'animation' };
    expect(wayOf(one)).toBe('animation');
    one.sprite = { way: 'sheet' };
    expect(wayOf(one)).toBe('sheet');
  });
  it('says it on the chip', () => {
    expect(chipLabel(anim(23))).toBe('Animation, 23 frames');
    expect(chipLabel(newSpriteDoc({ way: 'picture', width: 16, height: 16 }))).toBe('One picture');
    expect(chipLabel(newSpriteDoc({ way: 'boards', width: 16, height: 16 }))).toBe('Frames on boards');
    expect(chipLabel(newSpriteDoc({ way: 'sheet', width: 16, height: 16 }))).toBe('Sprites on a sheet');
  });
});

describe('saving and opening', () => {
  it('keeps the way in the file', () => {
    const doc = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    const back = loadFile(saveFile(doc)).doc;
    expect(back.sprite).toEqual({ way: 'sheet' });
  });
  it('an old file has none and opens unchanged', () => {
    const doc = anim(3);
    const bytes = saveFile(doc);
    const back = loadFile(bytes).doc;
    expect(back.sprite).toBeUndefined();
    expect(wayOf(back)).toBe('animation');
  });
  it('ignores a way it does not know', () => {
    const doc = anim(3);
    (doc as { sprite?: unknown }).sprite = { way: 'nonsense' };
    expect(loadFile(saveFile(doc)).doc.sprite).toBeUndefined();
  });
});

describe('ready documents', () => {
  it('one picture: one board, one frame, no clip', () => {
    const d = newSpriteDoc({ way: 'picture', width: 32, height: 32 });
    expect(d.length).toBe(1);
    expect(boardCount(d)).toBe(1);
    expect(d.clips).toEqual([]);
    expect(d.width).toBe(32 * pixelSizeFor(32, 32));
    expect(d.sprite?.way).toBe('picture');
  });
  it('an animation: four frames and a first clip, idle', () => {
    const d = newSpriteDoc({ way: 'animation', width: 24, height: 24 });
    expect(d.length).toBe(4);
    expect(d.clips.map((c) => [c.name, c.start, c.end])).toEqual([['idle', 0, 3]]);
    expect(d.layers[0].cels).toHaveLength(4);
  });
  it('frames on boards: four boards named Frame 1 to 4', () => {
    const d = newSpriteDoc({ way: 'boards', width: 16, height: 16 });
    expect(artboardsOf(d).map((a) => a.name)).toEqual(['Frame 1', 'Frame 2', 'Frame 3', 'Frame 4']);
    expect(totalFrames(d)).toBe(4);
  });
  it('sprites on a sheet: Hero, Enemy and Item', () => {
    const d = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    expect(artboardsOf(d).map((a) => a.name)).toEqual(['Hero', 'Enemy', 'Item']);
    expect(artboardsOf(d).every((a) => (a.content ?? d).length === 4)).toBe(true);
    for (const a of artboardsOf(d)) expect((contentOf(d, a.id)!.clips)).toHaveLength(1);
  });
  it('every way makes a size from the grid', () => {
    expect(pixelSizeFor(16, 16)).toBe(32);
    expect(pixelSizeFor(64, 48)).toBe(8);
    expect(pixelSizeFor(1000, 10)).toBe(1);
  });
});

describe('timeline frames to boards, and back', () => {
  it('each frame becomes a board, in order, with its own copy of the picture', () => {
    const { r, next } = change(anim(4), 'boards');
    expect(r.ok).toBe(true);
    expect(wayOf(next)).toBe('boards');
    const boards = artboardsOf(next);
    expect(boards.map((a) => a.name)).toEqual(['Frame 1', 'Frame 2', 'Frame 3', 'Frame 4']);
    expect(next.length).toBe(1);
    expect(next.clips).toEqual([]);
    boards.forEach((a, i) => {
      const c = contentOf(next, a.id)!;
      expect(c.length).toBe(1);
      const cel = c.layers[0].cels[0];
      expect((next.drawings[cel.drawingId] as { pixels: Uint8ClampedArray }).pixels[0]).toBe(10 + i * 20);
    });
    // every drawing belongs to exactly one board
    const ids = boards.map((a) => contentOf(next, a.id)!.layers[0].cels[0].drawingId);
    expect(new Set(ids).size).toBe(4);
    expect(Object.keys(next.drawings)).toHaveLength(4);
    // side by side, not on top of each other
    expect(new Set(boards.map((a) => a.x)).size).toBe(4);
  });
  it('a held frame is copied to each board it covers', () => {
    const doc = anim(2);
    doc.length = 4;
    doc.layers[0].cels[1].length = 3; // frame 2 held for 3 frames
    const { next } = change(doc, 'boards');
    expect(artboardsOf(next)).toHaveLength(4);
    const reds = artboardsOf(next).map((a) => (next.drawings[contentOf(next, a.id)!.layers[0].cels[0].drawingId] as { pixels: Uint8ClampedArray }).pixels[0]);
    expect(reds).toEqual([10, 30, 30, 30]);
  });
  it('boards go back to frames in order, and the round trip keeps every picture', () => {
    const there = change(anim(4), 'boards').next;
    const { r, next } = change(there, 'animation');
    expect(r.ok).toBe(true);
    expect(wayOf(next)).toBe('animation');
    expect(next.artboards).toBeUndefined();
    expect(next.length).toBe(4);
    expect([0, 1, 2, 3].map((f) => redOf(next, 0, f))).toEqual([10, 30, 50, 70]);
    expect(next.layers).toHaveLength(1);
  });
  it('boards of several frames go on one timeline end to end, with a clip each for a sheet', () => {
    const sheet = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    const { r, next } = change(sheet, 'animation');
    expect(r.ok).toBe(true);
    expect(next.length).toBe(12);
    expect(next.clips.map((c) => [c.name, c.start, c.end])).toEqual([['idle', 0, 3], ['idle', 4, 7], ['idle', 8, 11]]);
  });
  it('layers are matched by name across boards', () => {
    // A result of produce may be frozen under test, so edit a copy.
    const doc = structuredClone(change(anim(2), 'boards').next);
    const second = artboardsOf(doc)[1].content!;
    const extra = { ...second.layers[0], id: 'extra', name: 'Shadow', cels: [] } as PixelLayer;
    second.layers.push(extra);
    const { next } = change(doc, 'animation');
    expect(next.layers.map((l) => l.name)).toEqual(['Layer 1', 'Shadow']);
  });
  it('says which board is the odd one out when sizes differ', () => {
    const doc = structuredClone(change(anim(3), 'boards').next);
    artboardsOf(doc)[2].content!.width = 64;
    const { r, next } = change(doc, 'animation');
    expect(r.ok).toBe(false);
    expect((r as { problem: string }).problem).toMatch(/Frame 3 is a different size \(64 x 32\)/);
    expect(next).toBe(doc);
  });
  it('refuses variations and non-pixel layers with a reason', () => {
    const doc = structuredClone(change(anim(2), 'boards').next);
    artboardsOf(doc)[1].variationOf = artboardsOf(doc)[0].id;
    expect((change(doc, 'animation').r as { problem: string }).problem).toMatch(/variations/);
    const vec = anim(3);
    vec.layers.push({ id: 'v', name: 'Ink', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] });
    expect((change(vec, 'boards').r as { problem: string }).problem).toMatch(/pixel layers/);
  });
});

describe('the other changes', () => {
  it('a picture becomes an animation with room for four frames and a first clip', () => {
    const { r, next } = change(newSpriteDoc({ way: 'picture', width: 16, height: 16 }), 'animation');
    expect(r.ok).toBe(true);
    expect(next.length).toBe(4);
    expect(next.clips[0].name).toBe('idle');
    expect(wayOf(next)).toBe('animation');
  });
  it('an animation cannot be one picture while it has frames, and says so', () => {
    const { r } = change(anim(5), 'picture');
    expect(r.ok).toBe(false);
    expect((r as { problem: string }).problem).toMatch(/5 frames/);
  });
  it('frames on boards and sprites on a sheet swap by changing what they are called', () => {
    const boards = newSpriteDoc({ way: 'boards', width: 16, height: 16 });
    const { r, next } = change(boards, 'sheet');
    expect(r.ok).toBe(true);
    expect(wayOf(next)).toBe('sheet');
    expect(artboardsOf(next)).toHaveLength(4);
    expect(wayOf(change(next, 'boards').next)).toBe('boards');
  });
  it('lists what each way would do and why one is off', () => {
    const choices = wayChoices(anim(5));
    expect(choices.map((c) => c.way)).toEqual(['picture', 'animation', 'boards', 'sheet']);
    expect(choices.find((c) => c.current)?.way).toBe('animation');
    expect(choices.find((c) => c.way === 'picture')?.off).toMatch(/5 frames/);
    expect(choices.find((c) => c.way === 'boards')?.off).toBeUndefined();
  });
  it('the dry run changes nothing', () => {
    const doc = anim(4);
    const before = JSON.stringify(doc.layers);
    wayChoices(doc);
    expect(JSON.stringify(doc.layers)).toBe(before);
    expect(doc.artboards).toBeUndefined();
  });
});

describe('Quill sums up the sheet', () => {
  it('names a cast of sprites', () => {
    const d = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    expect(sheetSentence(d, 'atlas')).toBe('This sheet has 3 sprites (wow!), one per board, 12 frames in all.');
  });
  it('names frames on boards', () => {
    const d = newSpriteDoc({ way: 'boards', width: 16, height: 16 });
    expect(sheetSentence(d, 'joined')).toBe('This sheet is 4 boards played as frames of a single sprite, 4 frames in all.');
  });
  it('an animation and a picture', () => {
    expect(sheetSentence(anim(6), 'one')).toBe('This sheet has 1 sprite with 6 frames.');
    expect(sheetSentence(newSpriteDoc({ way: 'picture', width: 16, height: 16 }), 'one')).toMatch(/one picture/);
  });
  it('tells the truth when only the open board is going', () => {
    const d = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    expect(sheetSentence(d, 'one')).toBe('This sheet has 1 sprite, just the board you have open, with 4 frames.');
  });
});

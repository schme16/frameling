// @vitest-environment jsdom
// One stack of layers for the whole drawing (frames on boards): the document owns the layers, each board holds only its
// own cels on them. Switching, adding, deleting, duplicating and reordering a layer, saving and opening, old files, and
// putting the boards of an older file on one stack.
import { produce } from 'immer';
import { resetStore, store } from '../../src/core/store';
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, pruneDrawings } from '../../src/core/doc';
import type { Doc, Id, Layer, PixelLayer } from '../../src/core/format';
import { activeId, addArtboard, artboardDoc, artboardsOf, contentOf, deleteArtboard, duplicateArtboard, ensureArtboards, switchArtboard, takeContent } from '../../src/artboards/model';
import { shareLayers, unshareLayers, whyNoVariation, whyNotShare } from '../../src/artboards/shared';
import { makeVariation } from '../../src/artboards/variations';
import { allLayerLists } from '../../src/core/symbols';
import { loadFile, saveFile } from '../../src/io/file';
import { convertWay, framesToBoards, boardsToFrames, newSpriteDoc, wayOf } from '../../src/pixel/way';
import { addPixelLayer, deleteLayer, duplicateLayer, reorderLayer } from '../../src/timeline/edit-core';

const red = (doc: Doc, cels: PixelLayer['cels'], start: number, r: number) => {
  const d = newPixelDrawing(4, 4);
  for (let p = 0; p < 16; p++) d.pixels.set([r, 0, 0, 255], p * 4);
  doc.drawings[d.id] = d;
  cels.push({ id: `c${Math.random()}`, start, length: 1, drawingId: d.id });
};
const redOf = (doc: Doc, layer: Layer, frame = 0): number | null => {
  const c = layer.cels.find((x) => frame >= x.start && frame < x.start + x.length);
  return c ? (doc.drawings[c.drawingId] as { pixels: Uint8ClampedArray }).pixels[0] : null;
};

/** Frames on boards, 4 frames, one stack ("Sprite"), each board painted a different red. */
function sprite(n = 4): Doc {
  const d = newSpriteDoc({ way: 'boards', width: 16, height: 16 });
  const doc = produce(d, (x) => {
    const boards = artboardsOf(x as Doc);
    for (let i = n; i < boards.length; i++) boards.pop();
  });
  return paint(doc);
}
/** Gives every board a red on the first layer: board i is red 10 * (i + 1). */
function paint(doc: Doc): Doc {
  return produce(doc, (d) => {
    const root = d as Doc;
    artboardsOf(root).forEach((a, i) => {
      const cels = a.content ? (a.content.cels![root.layers[0].id] ??= []) : root.layers[0].cels;
      cels.length = 0;
      red(root, cels, 0, 10 * (i + 1));
    });
    // The blank pictures the new sprite started with are not used any more.
    pruneDrawings(root);
  });
}
/** What board `id` shows on layer `layerId`. */
const seen = (doc: Doc, id: Id, layerId: Id) => {
  const v = artboardDoc(doc, id);
  const l = v.layers.find((x) => x.id === layerId);
  return l ? redOf(v, l) : undefined;
};
const ids = (doc: Doc) => artboardsOf(doc).map((a) => a.id);

describe('a document that shares its layers', () => {
  it('frames on boards start sharing: closed boards hold cels and no layers', () => {
    const doc = sprite();
    expect(doc.sharedLayers).toBe(true);
    expect(doc.layers).toHaveLength(1);
    for (const a of artboardsOf(doc).slice(1)) {
      expect(a.content!.layers).toEqual([]);
      expect(Object.keys(a.content!.cels!)).toEqual([doc.layers[0].id]);
    }
    expect(artboardsOf(doc)).toHaveLength(4);
  });

  it('sprites on a sheet keep their own stacks', () => {
    const doc = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    expect(doc.sharedLayers).toBeUndefined();
    expect(artboardsOf(doc)[1].content!.layers).toHaveLength(1);
    expect(artboardsOf(doc)[1].content!.cels).toBeUndefined();
  });

  it('switching boards swaps the drawing and keeps the layers', () => {
    const doc = sprite();
    const layer = doc.layers[0].id;
    const [a, b, c] = ids(doc);
    expect(seen(doc, a, layer)).toBe(10);
    const next = produce(doc, (d) => void switchArtboard(d as Doc, c));
    expect(activeId(next)).toBe(c);
    expect(next.layers[0].id).toBe(layer);
    expect(redOf(next, next.layers[0])).toBe(30);
    // The board we left now holds its own cels.
    expect(artboardsOf(next).find((x) => x.id === a)!.content!.cels![layer]).toHaveLength(1);
    expect(seen(next, a, layer)).toBe(10);
    expect(seen(next, b, layer)).toBe(20);
    // And back.
    const back = produce(next, (d) => void switchArtboard(d as Doc, a));
    expect(redOf(back, back.layers[0])).toBe(10);
    expect(artboardsOf(back).every((x) => !x.content || x.content.layers.length === 0)).toBe(true);
  });

  it('switching on a plain object (not a draft) does not touch the layers it was given', () => {
    const doc = structuredClone(sprite());
    const before = doc.layers[0];
    const copy = { ...doc, layers: [...doc.layers] } as Doc;
    const c = ids(doc)[2];
    switchArtboard(copy, c);
    expect(doc.layers[0]).toBe(before);
    expect(redOf(copy, copy.layers[0])).toBe(30);
  });

  it('a layer added on the open board is on every board, empty there', () => {
    const doc = sprite();
    let added!: Id;
    const next = produce(doc, (d) => void (added = addPixelLayer(d as Doc, null, 'Lines', 8)));
    for (const id of ids(next)) {
      const v = artboardDoc(next, id);
      expect(v.layers.map((l) => l.name)).toEqual(['Sprite', 'Lines']);
      expect(v.layers[1].id).toBe(added);
    }
    // After going to another board it is still the same layer, and drawing there puts cels only there.
    const there = produce(next, (d) => void switchArtboard(d as Doc, ids(next)[2]));
    expect(there.layers.map((l) => l.id)).toEqual(next.layers.map((l) => l.id));
    expect(there.layers[1].cels).toEqual([]);
    const drawn = produce(there, (d) => void red(d as Doc, d.layers[1].cels, 0, 200));
    expect(seen(drawn, ids(drawn)[0], added)).toBeNull();
    expect(redOf(drawn, drawn.layers[1])).toBe(200);
  });

  it('hiding, locking, renaming and reordering a layer is the same on every board', () => {
    let doc = produce(sprite(), (d) => void addPixelLayer(d as Doc, null, 'Lines', 8));
    const [sp, lines] = doc.layers.map((l) => l.id);
    doc = produce(doc, (d) => {
      (d as Doc).layers[1].visible = false;
      (d as Doc).layers[1].name = 'Ink';
      reorderLayer(d as Doc, lines, 0);
    });
    for (const id of ids(doc)) {
      const v = artboardDoc(doc, id);
      expect(v.layers.map((l) => l.id)).toEqual([lines, sp]);
      expect(v.layers[0].visible).toBe(false);
      expect(v.layers[0].name).toBe('Ink');
    }
  });

  it('deleting a layer takes its cels and drawings from every board', () => {
    let doc = produce(sprite(), (d) => void addPixelLayer(d as Doc, null, 'Lines', 8));
    const lines = doc.layers[1].id;
    doc = produce(doc, (d) => {
      const root = d as Doc;
      artboardsOf(root).forEach((a, i) => {
        const cels = a.content ? (a.content.cels![lines] ??= []) : root.layers[1].cels;
        red(root, cels, 0, 100 + i);
      });
    });
    const before = Object.keys(doc.drawings).length;
    const next = produce(doc, (d) => void deleteLayer(d as Doc, lines));
    expect(next.layers).toHaveLength(1);
    for (const a of artboardsOf(next).slice(1)) expect(Object.keys(a.content!.cels!)).toEqual([next.layers[0].id]);
    expect(Object.keys(next.drawings).length).toBe(before - 4);
  });

  it('duplicating a layer copies it, with its own drawings, on every board', () => {
    const doc = sprite();
    const sp = doc.layers[0].id;
    let copy!: Id;
    const next = produce(doc, (d) => void (copy = duplicateLayer(d as Doc, sp)!));
    expect(next.layers.map((l) => l.id)).toEqual([sp, copy]);
    const drawingsOf = new Set<string>();
    for (const id of ids(next)) {
      expect(seen(next, id, copy)).toBe(seen(next, id, sp));
      const v = artboardDoc(next, id);
      const a = v.layers[0].cels[0].drawingId;
      const b = v.layers[1].cels[0].drawingId;
      expect(a).not.toBe(b);
      drawingsOf.add(a);
      drawingsOf.add(b);
    }
    expect(drawingsOf.size).toBe(8);
  });

  it('keeps the drawings that only a closed board uses when it tidies up', () => {
    const doc = sprite();
    const before = Object.keys(doc.drawings).length;
    const next = produce(doc, (d) => void pruneDrawings(d as Doc));
    expect(Object.keys(next.drawings).length).toBe(before);
    expect(Object.keys(artboardDoc(next, ids(next)[3]).drawings)).toHaveLength(1);
  });

  it('a new board is the same stack with nothing drawn; a duplicate gets its own drawings', () => {
    const doc = sprite();
    const sp = doc.layers[0].id;
    let made!: Id;
    let dup!: Id;
    const next = produce(doc, (d) => {
      made = addArtboard(d as Doc, { name: 'Frame 5' });
      dup = duplicateArtboard(d as Doc, ids(doc)[1])!;
    });
    expect(artboardsOf(next).find((a) => a.id === made)!.content!.layers).toEqual([]);
    expect(seen(next, made, sp)).toBeNull();
    expect(seen(next, dup, sp)).toBe(20);
    const orig = artboardDoc(next, ids(doc)[1]).layers[0].cels[0].drawingId;
    expect(artboardDoc(next, dup).layers[0].cels[0].drawingId).not.toBe(orig);
  });

  it('what the open board has, taken aside, goes back the same', () => {
    const doc = sprite();
    const c = takeContent(doc);
    expect(c.layers).toEqual([]);
    expect(c.cels![doc.layers[0].id]).toBe(doc.layers[0].cels);
    const resolved = contentOf(doc, ids(doc)[2])!;
    expect(resolved.layers.map((l) => l.id)).toEqual([doc.layers[0].id]);
    expect(redOf(doc, resolved.layers[0])).toBe(30);
    expect(allLayerLists(doc).every((list) => list.length <= 1)).toBe(true);
  });

  it('variations are off while the layers are shared', () => {
    const doc = sprite();
    expect(whyNoVariation(doc)).toMatch(/own layers/);
    const next = produce(doc, (d) => void expect(makeVariation(d as Doc, ids(doc)[0])).toBeNull());
    expect(artboardsOf(next)).toHaveLength(4);
  });
});

/** A tiny seeded random, so a failure can be replayed. */
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

describe('a long run of changes keeps every board on the one stack', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}`, () => {
      const rand = rng(seed);
      const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
      let doc = sprite();
      const check = (what: string) => {
        const want = doc.layers.map((l) => l.id);
        const used = new Set<string>();
        for (const a of artboardsOf(doc)) {
          const v = artboardDoc(doc, a.id);
          expect(v.layers.map((l) => l.id), what).toEqual(want);
          if (a.content) {
            expect(a.content.layers, what).toEqual([]);
            for (const k of Object.keys(a.content.cels ?? {})) expect(want, what).toContain(k);
          }
          for (const l of v.layers) for (const c of l.cels) {
            expect(doc.drawings[c.drawingId], what).toBeTruthy();
            used.add(c.drawingId);
          }
        }
        // Nothing is kept that no board uses.
        expect(Object.keys(doc.drawings).sort(), what).toEqual([...used].sort());
      };
      for (let step = 0; step < 60; step++) {
        const op = pick(['go', 'go', 'add', 'delete', 'duplicate', 'reorder', 'paint', 'paint', 'dupBoard', 'newBoard', 'delBoard', 'save']);
        doc = produce(doc, (d) => {
          const root = d as Doc;
          if (op === 'go') switchArtboard(root, pick(artboardsOf(root)).id);
          else if (op === 'add') addPixelLayer(root, pick([null, ...root.layers.map((l) => l.id)]), undefined, 8);
          else if (op === 'delete') deleteLayer(root, pick(root.layers).id);
          else if (op === 'duplicate') duplicateLayer(root, pick(root.layers).id);
          else if (op === 'reorder') reorderLayer(root, pick(root.layers).id, Math.floor(rand() * root.layers.length));
          else if (op === 'paint') {
            const l = pick(root.layers);
            l.cels.length = 0;
            red(root, l.cels, 0, 1 + Math.floor(rand() * 250));
            pruneDrawings(root);
          } else if (op === 'dupBoard') duplicateArtboard(root, pick(artboardsOf(root)).id);
          else if (op === 'newBoard') addArtboard(root, {});
          else if (op === 'delBoard' && artboardsOf(root).length > 2) deleteArtboard(root, pick(artboardsOf(root)).id);
        });
        if (op === 'save') doc = loadFile(saveFile(doc, '1.0.0')).doc;
        expect(doc.sharedLayers).toBe(true);
        check(`step ${step} ${op}`);
      }
    });
  }
});

describe('in the app', () => {
  it('going to another board, adding a layer and deleting it are all undoable, and the boards follow', () => {
    resetStore(sprite());
    const first = ids(store().get().doc)[0];
    const third = ids(store().get().doc)[2];
    store().update('Go', (d) => void switchArtboard(d as Doc, third));
    expect(redOf(store().get().doc, store().get().doc.layers[0])).toBe(30);
    let lines!: Id;
    store().update('Add', (d) => void (lines = addPixelLayer(d as Doc, null, 'Lines', 8)));
    for (const id of ids(store().get().doc)) expect(artboardDoc(store().get().doc, id).layers.map((l) => l.id)).toContain(lines);
    store().update('Delete', (d) => void deleteLayer(d as Doc, lines));
    for (const id of ids(store().get().doc)) expect(artboardDoc(store().get().doc, id).layers.map((l) => l.id)).not.toContain(lines);
    store().undo();
    for (const id of ids(store().get().doc)) expect(artboardDoc(store().get().doc, id).layers.map((l) => l.id)).toContain(lines);
    store().undo();
    store().undo();
    expect(activeId(store().get().doc)).toBe(first);
    expect(redOf(store().get().doc, store().get().doc.layers[0])).toBe(10);
    expect(seenIn(third)).toBe(30);
  });
});

const seenIn = (id: Id): number | null | undefined => {
  const doc = store().get().doc;
  return seen(doc, id, doc.layers[0].id);
};

describe('saving and opening', () => {
  it('a shared document comes back the same, with no layers copied onto the boards', () => {
    let doc = produce(sprite(), (d) => void addPixelLayer(d as Doc, null, 'Lines', 8));
    doc = produce(doc, (d) => void switchArtboard(d as Doc, ids(doc)[2]));
    const back = loadFile(saveFile(doc, '1.0.0')).doc;
    expect(back.sharedLayers).toBe(true);
    expect(activeId(back)).toBe(ids(doc)[2]);
    expect(back.layers.map((l) => l.name)).toEqual(['Sprite', 'Lines']);
    for (const a of artboardsOf(back)) if (a.content) expect(a.content.layers).toEqual([]);
    for (const id of ids(doc)) for (const l of doc.layers) expect(seen(back, id, l.id)).toBe(seen(doc, id, l.id));
    expect(Object.keys(back.drawings).sort()).toEqual(Object.keys(doc.drawings).sort());
  });

  it('a cel pointing at a drawing that is gone is left out with a warning, not a crash', () => {
    const doc = sprite();
    const broken = produce(doc, (d) => {
      const c = artboardsOf(d as Doc)[2].content!;
      c.cels![doc.layers[0].id][0].drawingId = 'nope';
    });
    const { doc: back, warnings } = loadFile(saveFile(broken, '1.0.0'));
    expect(warnings.length).toBeGreaterThan(0);
    expect(seen(back, ids(doc)[2], doc.layers[0].id)).toBeNull();
    expect(seen(back, ids(doc)[1], doc.layers[0].id)).toBe(20);
  });

  it('an old file, with a stack on every board, opens as it always did', () => {
    const doc = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    const back = loadFile(saveFile(doc, '1.0.0')).doc;
    expect(back.sharedLayers).toBeUndefined();
    const board = artboardsOf(back)[1];
    expect(board.content!.cels).toBeUndefined();
    expect(board.content!.layers).toHaveLength(1);
    expect(board.content!.layers[0].id).not.toBe(back.layers[0].id);
    expect(wayOf(back)).toBe('sheet');
  });

  it('a document with variations opens as it was saved, without sharing', () => {
    const doc = produce(newSpriteDoc({ way: 'sheet', width: 16, height: 16 }), (d) => void makeVariation(d as Doc, artboardsOf(d as Doc)[0].id));
    const bytes = saveFile(doc, '1.0.0');
    const back = loadFile(bytes).doc;
    expect(back.sharedLayers).toBeUndefined();
    expect(artboardsOf(back).some((a) => a.variationOf)).toBe(true);
  });
});

describe('frames and boards', () => {
  it('timeline frames to boards keep one stack, and each board gets its frame', () => {
    let doc = newSpriteDoc({ way: 'animation', width: 16, height: 16 });
    doc = produce(doc, (d) => {
      const root = d as Doc;
      root.layers[0].cels.length = 0;
      for (let i = 0; i < root.length; i++) red(root, root.layers[0].cels, i, 10 * (i + 1));
      addPixelLayer(root, null, 'Lines', 8);
    });
    const n = doc.length;
    const sp = doc.layers[0].id;
    const next = produce(doc, (d) => {
      const r = framesToBoards(d as Doc);
      expect(r.ok).toBe(true);
    });
    expect(next.sharedLayers).toBe(true);
    expect(artboardsOf(next)).toHaveLength(n);
    expect(next.layers.map((l) => l.name)).toEqual(['Sprite', 'Lines']);
    ids(next).forEach((id, i) => expect(seen(next, id, sp)).toBe(10 * (i + 1)));
    for (const a of artboardsOf(next).slice(1)) expect(a.content!.layers).toEqual([]);
  });

  it('boards back to timeline frames merge by layer id', () => {
    const doc = produce(sprite(), (d) => void addPixelLayer(d as Doc, null, 'Lines', 8));
    const back = produce(doc, (d) => {
      const r = convertWay(d as Doc, 'animation');
      expect(r.ok).toBe(true);
    });
    expect(back.sharedLayers).toBeUndefined();
    expect(back.artboards).toBeUndefined();
    expect(back.layers.map((l) => l.name)).toEqual(['Sprite', 'Lines']);
    expect(back.length).toBe(4);
    for (let i = 0; i < 4; i++) expect(redOf(back, back.layers[0], i)).toBe(10 * (i + 1));
    expect(back.layers[1].cels).toEqual([]);
    void boardsToFrames;
  });

  it('sprites on a sheet from shared boards give each board a stack of its own', () => {
    const doc = sprite();
    const next = produce(doc, (d) => {
      const r = convertWay(d as Doc, 'sheet');
      expect(r.ok).toBe(true);
    });
    expect(next.sharedLayers).toBeUndefined();
    const [, b, c] = artboardsOf(next);
    expect(b.content!.layers).toHaveLength(1);
    expect(b.content!.cels).toBeUndefined();
    expect(b.content!.layers[0].id).not.toBe(c.content!.layers[0].id);
    expect(redOf(next, b.content!.layers[0])).toBe(20);
    expect(redOf(next, c.content!.layers[0])).toBe(30);
  });
});

/** An older file: frames on boards, each with a stack of its own. `per` lists each board's layer names. */
function oldBoards(per: string[][]): Doc {
  const doc = newDoc({ name: 'Old', width: 32, height: 32, length: 1, pixel: { pixelSize: 8 } });
  doc.layers.length = 0;
  const mk = (name: string, kind: 'pixel' = 'pixel'): PixelLayer => ({ id: `${name}-${Math.random().toString(36).slice(2)}`, name, kind, pixelSize: 8, visible: true, locked: false, opacity: 1, cels: [] });
  per[0].forEach((n) => doc.layers.push(mk(n)));
  ensureArtboards(doc);
  artboardsOf(doc)[0].name = 'Frame 1';
  per.slice(1).forEach((names, i) => {
    const id = addArtboard(doc, { name: `Frame ${i + 2}`, width: 32, height: 32, length: 1 });
    artboardsOf(doc).find((a) => a.id === id)!.content!.layers = names.map((n) => mk(n));
  });
  // Every layer on every board has a red of its own.
  let r = 1;
  for (const layers of allLayerLists(doc)) for (const l of layers) red(doc, l.cels, 0, r++);
  doc.sprite = { way: 'boards' };
  return doc;
}

describe('putting the boards of an older file on one stack', () => {
  it('layers with the same name and kind join up, so 23 frames are not 23 layers', () => {
    const per = Array.from({ length: 6 }, () => ['Sketch', 'Lines', 'Colour']);
    const doc = oldBoards(per);
    const drawings = Object.keys(doc.drawings).length;
    expect(whyNotShare(doc)).toBeNull();
    let note = '';
    const next = produce(doc, (d) => {
      const r = shareLayers(d as Doc);
      if (r.ok) note = r.note;
    });
    expect(note).toMatch(/6 boards/);
    expect(next.sharedLayers).toBe(true);
    expect(next.layers.map((l) => l.name)).toEqual(['Sketch', 'Lines', 'Colour']);
    // Nothing lost, and each board shows exactly what it showed.
    expect(Object.keys(next.drawings)).toHaveLength(drawings);
    for (const [bi, a] of artboardsOf(next).entries()) {
      const was = bi === 0 ? doc.layers : artboardsOf(doc)[bi].content!.layers;
      const v = artboardDoc(next, a.id);
      was.forEach((l, li) => expect(redOf(v, v.layers[li])).toBe(redOf(doc, l)));
      if (a.content) expect(a.content.layers).toEqual([]);
    }
  });

  it('a layer only some boards have joins the stack near the layer under it, and others are empty there', () => {
    const doc = oldBoards([['Sketch', 'Colour'], ['Sketch', 'Lines', 'Colour'], ['Colour', 'Shade']]);
    const next = produce(doc, (d) => void shareLayers(d as Doc));
    expect(next.layers.map((l) => l.name)).toEqual(['Sketch', 'Lines', 'Colour', 'Shade']);
    const [first, second, third] = ids(next);
    const named = (id: Id, name: string) => artboardDoc(next, id).layers.find((l) => l.name === name)!;
    expect(named(first, 'Lines').cels).toEqual([]);
    expect(named(second, 'Lines').cels).toHaveLength(1);
    expect(named(third, 'Sketch').cels).toEqual([]);
    expect(named(third, 'Shade').cels).toHaveLength(1);
  });

  it('same names but a different kind or pixel size stay apart', () => {
    const doc = oldBoards([['Sprite'], ['Sprite']]);
    const odd = produce(doc, (d) => void ((artboardsOf(d as Doc)[1].content!.layers[0] as PixelLayer).pixelSize = 4));
    const next = produce(odd, (d) => void shareLayers(d as Doc));
    expect(next.layers).toHaveLength(2);
  });

  it('the first stack the person made wins for settings of layers that match', () => {
    const doc = oldBoards([['Lines'], ['Lines']]);
    const odd = produce(doc, (d) => {
      (d as Doc).layers[0].opacity = 0.5;
      artboardsOf(d as Doc)[1].content!.layers[0].opacity = 0.2;
    });
    const next = produce(odd, (d) => void shareLayers(d as Doc));
    expect(next.layers[0].opacity).toBe(0.5);
  });

  it('it can be taken back: each board has its own layers again, with its own pictures', () => {
    const doc = oldBoards([['Sketch', 'Lines'], ['Sketch', 'Lines'], ['Sketch', 'Lines']]);
    const shared = produce(doc, (d) => void shareLayers(d as Doc));
    const apart = produce(shared, (d) => void expect(unshareLayers(d as Doc).ok).toBe(true));
    expect(apart.sharedLayers).toBeUndefined();
    const [a, b, c] = artboardsOf(apart);
    expect(b.content!.layers.map((l) => l.name)).toEqual(['Sketch', 'Lines']);
    expect(b.content!.cels).toBeUndefined();
    expect(b.content!.layers[0].id).not.toBe(c.content!.layers[0].id);
    expect(b.content!.layers[0].id).not.toBe(a.id);
    expect(redOf(apart, b.content!.layers[1])).toBe(redOf(doc, artboardsOf(doc)[1].content!.layers[1]));
  });

  it('is refused while a board is a variation', () => {
    const doc = produce(oldBoards([['Sprite'], ['Sprite']]), (d) => void makeVariation(d as Doc, artboardsOf(d as Doc)[0].id));
    expect(artboardsOf(doc).some((a) => a.variationOf)).toBe(true);
    expect(whyNotShare(doc)).toMatch(/variations/);
    produce(doc, (d) => void expect(shareLayers(d as Doc).ok).toBe(false));
  });

  it('a board made a moment ago, with nothing drawn, joins without adding a layer of its own', () => {
    const doc = oldBoards([['Sprite'], ['Layer 1']]);
    const blank = produce(doc, (d) => {
      artboardsOf(d as Doc)[1].content!.layers[0].cels.length = 0;
    });
    const next = produce(blank, (d) => void shareLayers(d as Doc, { fresh: true }));
    expect(next.layers.map((l) => l.name)).toEqual(['Sprite']);
    const plain = produce(blank, (d) => void shareLayers(d as Doc));
    expect(plain.layers.map((l) => l.name)).toEqual(['Layer 1', 'Sprite']);
  });
});

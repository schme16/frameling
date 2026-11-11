import { unzipSync } from 'fflate';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, pruneDrawings } from '../../src/core/doc';
import type { Doc, PixelLayer } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import {
  activeId,
  addArtboard,
  allBounds,
  arrangeArtboards,
  artboardAt,
  artboardDoc,
  artboardsOf,
  contentOf,
  deleteArtboard,
  duplicateArtboard,
  exportNames,
  joinShots,
  reorderArtboard,
  shotAt,
  switchArtboard,
} from '../../src/artboards/model';

/** A pixel document with one painted key, on a 4 px art grid. */
function pixelDoc(name = 'Sprites'): Doc {
  const doc = newDoc({ name, width: 32, height: 16, length: 4, pixel: { pixelSize: 4 } });
  const layer = doc.layers[0] as PixelLayer;
  const d = newPixelDrawing(8, 4);
  d.pixels[0] = 255;
  d.pixels[3] = 255;
  doc.drawings[d.id] = d;
  layer.cels.push({ id: 'c1', start: 0, length: 4, drawingId: d.id });
  return doc;
}

describe('artboards: the model', () => {
  it('a document without artboards is one artboard', () => {
    const doc = pixelDoc();
    expect(artboardsOf(doc)).toHaveLength(1);
    expect(activeId(doc)).toBe(artboardsOf(doc)[0].id);
    expect(artboardDoc(doc, activeId(doc)).layers).toBe(doc.layers);
  });

  it('adds an artboard beside the first, sized and coloured like it, with a pixel layer', () => {
    const doc = pixelDoc();
    const id = addArtboard(doc, { name: 'Walk' });
    const list = artboardsOf(doc);
    expect(list.map((a) => a.name)).toEqual(['Artboard 1', 'Walk']);
    const b = list[1];
    expect(b.x).toBeGreaterThanOrEqual(32);
    expect(b.content!.width).toBe(32);
    expect(b.content!.layers[0].kind).toBe('pixel');
    expect((b.content!.layers[0] as PixelLayer).pixelSize).toBe(4);
    expect(artboardAt(doc, b.x + 1, 1)).toBe(id);
    expect(artboardAt(doc, 1, 1)).toBe(list[0].id);
    expect(allBounds(doc).w).toBe(b.x + 32);
  });

  it('switching swaps the content in and out, and back again', () => {
    const doc = pixelDoc();
    const first = doc.layers;
    const id = addArtboard(doc, { width: 64, height: 64, background: null, length: 2 });
    const next = produce(doc, (d) => void switchArtboard(d, id));
    expect(activeId(next)).toBe(id);
    expect(next.width).toBe(64);
    expect(next.background).toBeNull();
    expect(next.length).toBe(2);
    expect(next.layers).not.toBe(first);
    expect(contentOf(next, artboardsOf(next)[0].id)!.layers).toEqual(first);
    const back = produce(next, (d) => void switchArtboard(d, artboardsOf(d)[0].id));
    expect(back.width).toBe(32);
    expect(back.layers).toEqual(first);
    expect(artboardsOf(back)[1].content!.width).toBe(64);
  });

  it('keeps every artboard\'s drawings when pruning', () => {
    const doc = pixelDoc();
    const drawingId = doc.layers[0].cels[0].drawingId;
    const id = addArtboard(doc);
    switchArtboard(doc, id);
    pruneDrawings(doc);
    expect(doc.drawings[drawingId]).toBeDefined();
  });

  it('duplicates with its own drawings and ids', () => {
    const doc = pixelDoc();
    const src = artboardsOf(doc)[0].id;
    const copy = duplicateArtboard(doc, src)!;
    const c = artboardsOf(doc).find((a) => a.id === copy)!;
    expect(c.name).toBe('Artboard 2');
    const orig = doc.layers[0];
    const dup = c.content!.layers[0];
    expect(dup.id).not.toBe(orig.id);
    expect(dup.cels[0].drawingId).not.toBe(orig.cels[0].drawingId);
    expect(doc.drawings[dup.cels[0].drawingId].kind).toBe('pixel');
    // Painting the copy leaves the original alone.
    const dp = doc.drawings[dup.cels[0].drawingId];
    expect(dp.kind === 'pixel' && dp.pixels).not.toBe((doc.drawings[orig.cels[0].drawingId] as { pixels: Uint8ClampedArray }).pixels);
  });

  it('deletes, opening a neighbour, and drops drawings only it used', () => {
    const doc = pixelDoc();
    const first = artboardsOf(doc)[0].id;
    const drawing = doc.layers[0].cels[0].drawingId;
    const id = addArtboard(doc);
    expect(deleteArtboard(doc, first)).toBe(true);
    expect(activeId(doc)).toBe(id);
    expect(doc.drawings[drawing]).toBeUndefined();
    expect(deleteArtboard(doc, id)).toBe(false);
  });

  it('reorders and lays out in a row', () => {
    const doc = pixelDoc();
    const a = artboardsOf(doc)[0].id;
    const b = addArtboard(doc, { width: 16 });
    const c = addArtboard(doc, { width: 8, x: 900, y: 300 });
    reorderArtboard(doc, c, 0);
    expect(artboardsOf(doc).map((x) => x.id)).toEqual([c, a, b]);
    arrangeArtboards(doc);
    const xs = artboardsOf(doc).map((x) => x.x);
    expect(xs[1]).toBeGreaterThan(xs[0]);
    expect(xs[2]).toBeGreaterThan(xs[1]);
    expect(new Set(artboardsOf(doc).map((x) => x.y)).size).toBe(1);
  });

  it('gives each artboard a unique, file-safe export name', () => {
    const doc = pixelDoc();
    addArtboard(doc, { name: 'Run/1' });
    addArtboard(doc, { name: 'Artboard 1' });
    const names = [...exportNames(doc).values()];
    expect(names).toEqual(['Artboard 1', 'Run1', 'Artboard 1-2']);
  });

  it('an artboard as a document has only its own drawings and its export name', () => {
    const doc = pixelDoc();
    const id = addArtboard(doc, { name: 'Idle' });
    artboardsOf(doc)[1].exportName = 'hero-idle';
    const v = artboardDoc(doc, id);
    expect(v.name).toBe('hero-idle');
    expect(Object.keys(v.drawings)).toEqual([]);
    expect(v.artboards).toBeUndefined();
    expect(v.width).toBe(32);
  });
});

describe('artboards: shots in order', () => {
  it('joins shots end to end, a clip each, with their own colours underneath', () => {
    const doc = pixelDoc('Film');
    const a = artboardsOf(doc)[0].id;
    const b = addArtboard(doc, { name: 'Shot 2', length: 3, background: '#112233' });
    doc.markers.push({ id: 'm', name: 'hit', frame: 2 });
    const r = joinShots(doc, [a, b]);
    if ('problem' in r) throw new Error(r.problem);
    expect(r.starts).toEqual([0, 4]);
    expect(r.doc.length).toBe(7);
    expect(r.doc.clips.map((c) => [c.name, c.start, c.end])).toEqual([['Artboard 1', 0, 3], ['Shot 2', 4, 6]]);
    expect(r.doc.background).toBeNull();
    expect(r.doc.layers.filter((l) => l.name.endsWith('background'))).toHaveLength(2);
    expect(r.doc.markers[0].frame).toBe(2);
    expect(new Set(r.doc.layers.map((l) => l.id)).size).toBe(r.doc.layers.length);
    expect(shotAt(r.starts, 5)).toEqual({ shot: 1, frame: 1 });
  });

  it('joins shots of different sizes instead of refusing', () => {
    const doc = pixelDoc();
    const b = addArtboard(doc, { width: 10 });
    const r = joinShots(doc, [artboardsOf(doc)[0].id, b]);
    expect('problem' in r).toBe(false);
  });
});

describe('artboards in the file', () => {
  it('round trips every artboard, its content and which one is open', () => {
    const doc = pixelDoc();
    const id = addArtboard(doc, { name: 'Jump', width: 16, height: 16, background: null });
    const dup = duplicateArtboard(doc, artboardsOf(doc)[0].id)!;
    artboardsOf(doc).find((a) => a.id === dup)!.exportName = 'jump-copy';
    artboardsOf(doc).find((a) => a.id === id)!.content!.audio = [{ id: 'snd', name: 'Boing', start: 1, data: new Uint8Array([1, 2, 3]), mime: 'audio/wav' }];
    switchArtboard(doc, dup);
    const bytes = saveFile(doc);
    const zip = unzipSync(bytes);
    expect(zip['audio/snd.wav']).toBeDefined();
    const { doc: back, warnings } = loadFile(bytes);
    expect(warnings).toEqual([]);
    expect(activeId(back)).toBe(dup);
    expect(artboardsOf(back).map((a) => a.name)).toEqual(artboardsOf(doc).map((a) => a.name));
    expect(artboardsOf(back).map((a) => [a.x, a.y])).toEqual(artboardsOf(doc).map((a) => [a.x, a.y]));
    expect(artboardsOf(back).find((a) => a.id === dup)!.exportName).toBe('jump-copy');
    const jump = artboardsOf(back).find((a) => a.id === id)!.content!;
    expect(jump.width).toBe(16);
    expect(jump.background).toBeNull();
    expect([...jump.audio![0].data]).toEqual([1, 2, 3]);
    // The first artboard's pixels came through, set aside.
    const first = artboardsOf(back)[0].content!;
    const d = back.drawings[first.layers[0].cels[0].drawingId];
    expect(d.kind === 'pixel' && d.pixels[0]).toBe(255);
    // And the open one is the document's own content.
    expect(back.layers[0].cels[0].drawingId).toBe(doc.layers[0].cels[0].drawingId);
  });

  it('opens a file without artboards as before', () => {
    const doc = pixelDoc();
    const back = loadFile(saveFile(doc)).doc;
    expect(back.artboards).toBeUndefined();
    expect(artboardsOf(back)).toHaveLength(1);
  });

  it('repairs a file whose open artboard is missing, keeping the document\'s own content', () => {
    const doc = pixelDoc();
    addArtboard(doc, { name: 'Other' });
    // Every entry holding content: none is the open one.
    doc.artboards = doc.artboards!.filter((a) => a.content);
    delete doc.activeArtboard;
    const { doc: back } = loadFile(saveFile(doc));
    expect(artboardsOf(back)).toHaveLength(2);
    expect(artboardsOf(back)[0].content).toBeUndefined();
    expect(back.layers[0].kind).toBe('pixel');
  });

  it('leaves out an artboard that cannot be read, with a warning', () => {
    const doc = pixelDoc();
    addArtboard(doc, { name: 'Broken' });
    doc.artboards![1].content!.width = 0;
    const { doc: back, warnings } = loadFile(saveFile(doc));
    expect(artboardsOf(back)).toHaveLength(1);
    expect(warnings.join(' ')).toMatch(/Broken/);
  });
});

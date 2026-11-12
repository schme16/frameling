import { unzipSync, strFromU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorLayer } from '../../src/core/doc';
import type { CameraDrawing, Doc, Layer, PathShape, PixelDrawing, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';
import { activeId, artboardDoc, artboardsOf, deleteArtboard, duplicateArtboard, exportNames, findArtboard, joinShots, switchArtboard, takeContent } from '../../src/artboards/model';
import {
  aliasId,
  detachVariation,
  deepEqual,
  diffContent,
  familyIds,
  listDifferences,
  makeVariation,
  resetDifference,
  resetVariation,
  resolveContent,
  setVariationSize,
  splitAlias,
  variationsOf,
} from '../../src/artboards/variations';

const rect = (id: string, fill: string, x = 0): PathShape => ({
  id,
  type: 'path',
  paths: [{ closed: true, points: [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }] }],
  fill,
  stroke: null,
  opacity: 1,
});

/** Two vector layers, one with two keys, shapes in each. */
function sample(): Doc {
  const doc = newDoc({ name: 'Hero', width: 200, height: 100, length: 8, fps: 12 });
  const body = { ...newVectorLayer('Body'), id: 'L1' };
  const sky = { ...newVectorLayer('Sky'), id: 'L2' };
  const d1: VectorDrawing = { id: 'd1', kind: 'vector', shapes: [rect('s1', '#ff0000'), rect('s2', '#00ff00', 20)] };
  const d2: VectorDrawing = { id: 'd2', kind: 'vector', shapes: [rect('s3', '#0000ff')] };
  const d3: VectorDrawing = { id: 'd3', kind: 'vector', shapes: [rect('s4', '#cccccc')] };
  doc.drawings = { d1, d2, d3 };
  body.cels = [
    { id: 'c1', start: 0, length: 4, drawingId: 'd1' },
    { id: 'c2', start: 4, length: 4, drawingId: 'd2' },
  ];
  sky.cels = [{ id: 'c3', start: 0, length: 8, drawingId: 'd3' }];
  doc.layers = [sky, body];
  return doc;
}

const doc = () => store().get().doc;
const update = (label: string, fn: (d: Doc) => void) => store().update(label, (d) => fn(d as Doc));
const root = () => artboardsOf(doc())[0].id;
function make(o: Parameters<typeof makeVariation>[2] = {}, from?: string): string {
  let id: string | null = null;
  update('Make a variation', (d) => {
    id = makeVariation(d, from ?? activeId(d), o);
  });
  return id!;
}
const open = (id: string) => update('Go', (d) => void switchArtboard(d, id));
const shape = (d: Doc, drawing: string, sid: string) => ((d.drawings[drawing] as VectorDrawing).shapes.find((s) => s.id === sid) as PathShape);
const layerOf = (c: { layers: Layer[] }, id: string) => c.layers.find((l) => l.id === id)!;

beforeEach(() => {
  resetStore(sample());
});

describe('variations: making one', () => {
  it('is a linked artboard that shows the original and stores no changes yet', () => {
    const v = make();
    const a = findArtboard(doc(), v)!;
    expect(a.variationOf).toBe(root());
    expect(a.overrides).toEqual({});
    expect(a.name).toBe('Artboard 1, variation 1');
    const c = a.content!;
    expect(c.layers.map((l) => l.id)).toEqual(['L2', 'L1']);
    expect(c.width).toBe(200);
    // Its keys point at its own drawing ids, which are the original's drawings until something changes.
    const cel = layerOf(c, 'L1').cels[0];
    expect(cel.drawingId).toBe(aliasId('d1', v));
    const own = doc().drawings[cel.drawingId] as VectorDrawing;
    expect(own.id).toBe(cel.drawingId);
    expect(own.shapes).toBe((doc().drawings.d1 as VectorDrawing).shapes);
    expect(variationsOf(doc(), root())).toHaveLength(1);
    expect(familyIds(doc(), v)).toEqual([root(), v]);
  });

  it('numbers the names and sits beside the original', () => {
    const v = make();
    const w = make();
    expect(findArtboard(doc(), w)!.name).toBe('Artboard 1, variation 2');
    expect(findArtboard(doc(), v)!.x).toBeGreaterThanOrEqual(200);
  });
});

describe('variations: edits in the variation become overrides', () => {
  it('a recolour is a patch of the shapes it touched, and leaves the original alone', () => {
    const v = make();
    open(v);
    const alias = aliasId('d1', v);
    update('Recolour', (d) => {
      (d.drawings[alias] as VectorDrawing).shapes[0].type === 'path' && ((d.drawings[alias] as VectorDrawing).shapes[0] as PathShape).fill !== undefined && (((d.drawings[alias] as VectorDrawing).shapes[0] as PathShape).fill = '#ff00ff');
    });
    const a = findArtboard(doc(), v)!;
    expect(a.overrides).toEqual({ drawings: { d1: { shapes: { items: { s1: { patch: { set: { fill: '#ff00ff' } } } } } } } });
    // The original's drawing is untouched (its shapes object is the same).
    expect(shape(doc(), 'd1', 's1').fill).toBe('#ff0000');
    expect(shape(doc(), alias, 's1').fill).toBe('#ff00ff');
    // The other shape still follows.
    expect((doc().drawings[alias] as VectorDrawing).shapes[1]).toBe((doc().drawings.d1 as VectorDrawing).shapes[1]);
  });

  it('is one undo step, with the overrides in it', () => {
    const v = make();
    open(v);
    const before = findArtboard(doc(), v)!.overrides;
    update('Recolour', (d) => void (((d.drawings[aliasId('d1', v)] as VectorDrawing).shapes[0] as PathShape).fill = '#123456'));
    expect(Object.keys(findArtboard(doc(), v)!.overrides!)).toEqual(['drawings']);
    store().undo();
    expect(findArtboard(doc(), v)!.overrides).toEqual(before);
    expect(shape(doc(), aliasId('d1', v), 's1').fill).toBe('#ff0000');
    store().redo();
    expect(shape(doc(), aliasId('d1', v), 's1').fill).toBe('#123456');
    expect(findArtboard(doc(), v)!.overrides!.drawings!.d1).toBeTruthy();
  });

  it('layer look, key timing, a removed layer, an added layer and the order are each an override', () => {
    const v = make();
    open(v);
    update('Edit', (d) => {
      const body = d.layers.find((l) => l.id === 'L1')!;
      body.opacity = 0.5;
      body.cels[1].start = 5;
      body.cels[1].length = 3;
      d.layers = d.layers.filter((l) => l.id !== 'L2');
      d.layers.push({ ...newVectorLayer('Extra'), id: 'LX' });
      d.length = 10;
    });
    const ov = findArtboard(doc(), v)!.overrides!;
    expect(ov.stage).toEqual({ set: { length: 10 } });
    expect(ov.layers!.removed).toEqual(['L2']);
    expect(ov.layers!.added!.map((l) => l.id)).toEqual(['LX']);
    expect(ov.layers!.items!.L1.patch).toEqual({ set: { opacity: 0.5 } });
    expect(ov.layers!.items!.L1.sub!.items!.c2.patch).toEqual({ set: { start: 5, length: 3 } });
    expect(ov.layers!.order).toBeUndefined();
    // Reordering by itself is recorded as the whole order.
    update('Order', (d) => void d.layers.reverse());
    expect(findArtboard(doc(), v)!.overrides!.layers!.order).toEqual(['LX', 'L1']);
  });

  it('a new key made in the variation keeps its own drawing', () => {
    const v = make();
    open(v);
    update('Key', (d) => {
      d.drawings.vNew = { id: 'vNew', kind: 'vector', shapes: [rect('sn', '#abcdef')] };
      d.layers.find((l) => l.id === 'L2')!.cels.push({ id: 'cNew', start: 0, length: 1, drawingId: 'vNew' });
      d.layers.find((l) => l.id === 'L2')!.cels[0].start = 1;
      d.layers.find((l) => l.id === 'L2')!.cels[0].length = 7;
      d.layers.find((l) => l.id === 'L2')!.cels.sort((a, b) => a.start - b.start);
    });
    const sub = findArtboard(doc(), v)!.overrides!.layers!.items!.L2.sub!;
    expect(sub.added!.map((c) => c.id)).toEqual(['cNew']);
    expect(sub.added![0].drawingId).toBe('vNew');
    expect(sub.items!.c3.patch).toEqual({ set: { start: 1, length: 7 } });
  });
});

describe('variations: edits to the original flow in', () => {
  it('geometry edits arrive, overridden things stay', () => {
    const v = make();
    open(v);
    update('Recolour', (d) => void (((d.drawings[aliasId('d1', v)] as VectorDrawing).shapes[0] as PathShape).fill = '#ff00ff'));
    update('Fade', (d) => void (d.layers.find((l) => l.id === 'L1')!.opacity = 0.25));
    open(root());
    // Move the first shape, change the second one's colour, and add a layer to the original.
    update('Edit original', (d) => {
      const s1 = (d.drawings.d1 as VectorDrawing).shapes[0] as PathShape;
      s1.paths[0].points[0].x = 3;
      ((d.drawings.d1 as VectorDrawing).shapes[1] as PathShape).fill = '#111111';
      d.layers.find((l) => l.id === 'L1')!.name = 'Hero body';
      d.layers.push({ ...newVectorLayer('Top'), id: 'L3' });
    });
    const a = findArtboard(doc(), v)!;
    const alias = aliasId('d1', v);
    const s1 = shape(doc(), alias, 's1');
    expect(s1.fill).toBe('#ff00ff');
    expect(s1.paths[0].points[0].x).toBe(3);
    expect(shape(doc(), alias, 's2').fill).toBe('#111111');
    const l1 = layerOf(a.content!, 'L1');
    expect(l1.opacity).toBe(0.25);
    expect(l1.name).toBe('Hero body');
    expect(a.content!.layers.map((l) => l.id)).toEqual(['L2', 'L1', 'L3']);
  });

  it('timing edits to the original reach the variation, except where it moved that key', () => {
    const v = make();
    open(v);
    update('Move', (d) => void (d.layers.find((l) => l.id === 'L1')!.cels[1].start = 6));
    open(root());
    update('Longer', (d) => {
      const l = d.layers.find((x) => x.id === 'L1')!;
      l.cels[0].length = 3;
      d.length = 12;
    });
    const c = findArtboard(doc(), v)!.content!;
    expect(layerOf(c, 'L1').cels.map((k) => [k.start, k.length])).toEqual([[0, 3], [6, 4]]);
    expect(c.length).toBe(12);
  });

  it('a variation that is not open is exported and played as the resolved artboard', () => {
    const v = make();
    open(v);
    update('Recolour', (d) => void (((d.drawings[aliasId('d1', v)] as VectorDrawing).shapes[0] as PathShape).fill = '#ff00ff'));
    open(root());
    const view = artboardDoc(doc(), v);
    expect(view.name).toBe('Artboard 1, variation 1');
    const cel = layerOf(view, 'L1').cels[0];
    expect(((view.drawings[cel.drawingId] as VectorDrawing).shapes[0] as PathShape).fill).toBe('#ff00ff');
    // The original is exported as itself.
    expect(shape(artboardDoc(doc(), root()), 'd1', 's1').fill).toBe('#ff0000');
    expect(exportNames(doc()).get(v)).toBe('Artboard 1, variation 1');
    // And joins with the others like any shot.
    const j = joinShots(doc(), [root(), v]);
    expect('doc' in j && j.doc.length).toBe(16);
  });
});

describe('variations: sizes', () => {
  it('a square cut keeps the animation and frames it with a camera it adds', () => {
    const v = make({ size: { width: 100, height: 100 }, frame: 'fill' });
    const a = findArtboard(doc(), v)!;
    expect(a.content!.width).toBe(100);
    expect(a.overrides!.stage).toEqual({ set: { width: 100 } });
    const cam = a.overrides!.layers!.added!.find((l) => l.kind === 'camera')!;
    expect(cam).toBeTruthy();
    const d = doc().drawings[cam.cels[0].drawingId] as CameraDrawing;
    expect(d.view).toMatchObject({ x: 100, y: 50, zoom: 1 });
    // Taller than wide: fills 100 x 100 from 200 x 100, so the picture is the original's height.
    const tall = make({ size: { width: 100, height: 200 }, frame: 'fill' });
    const t = doc().drawings[findArtboard(doc(), tall)!.overrides!.layers!.added![0].cels[0].drawingId] as CameraDrawing;
    expect(t.view.zoom).toBeCloseTo(2);
    // "Fit" shows the whole original instead.
    const wide = make({ size: { width: 400, height: 100 }, frame: 'bars' });
    const w = doc().drawings[findArtboard(doc(), wide)!.overrides!.layers!.added![0].cels[0].drawingId] as CameraDrawing;
    expect(w.view.zoom).toBeCloseTo(1);
    const narrow = make({ size: { width: 100, height: 50 }, frame: 'bars' });
    expect((doc().drawings[findArtboard(doc(), narrow)!.overrides!.layers!.added![0].cels[0].drawingId] as CameraDrawing).view.zoom).toBeCloseTo(0.5);
  });

  it('going back to the original size takes the framing off', () => {
    const v = make({ size: { width: 100, height: 100 } });
    update('Size', (d) => void setVariationSize(d, v, 200, 100));
    expect(findArtboard(doc(), v)!.overrides).toEqual({});
    expect(findArtboard(doc(), v)!.content!.layers.some((l) => l.kind === 'camera')).toBe(false);
  });

  it("zooms the original's own camera instead of adding one", () => {
    const d0 = sample();
    const cam: Layer = { id: 'LC', name: 'Camera', kind: 'camera', visible: true, locked: false, opacity: 1, cels: [{ id: 'cc', start: 0, length: 8, drawingId: 'k1' }] };
    d0.drawings.k1 = { id: 'k1', kind: 'camera', view: { x: 100, y: 50, zoom: 1.5, rotation: 0 } };
    d0.layers.push(cam);
    resetStore(d0);
    const v = make({ size: { width: 100, height: 200 }, frame: 'fill' });
    const a = findArtboard(doc(), v)!;
    expect(a.overrides!.layers?.added).toBeUndefined();
    expect(a.overrides!.drawings!.k1.view).toEqual({ set: { zoom: 3 } });
    // The original's camera moves; the variation keeps its own zoom (it overrides it).
    expect((doc().drawings[aliasId('k1', v)] as CameraDrawing).view.zoom).toBe(3);
  });
});

describe('variations: differences and resets', () => {
  function messy(): string {
    const v = make();
    open(v);
    update('Edit', (d) => {
      ((d.drawings[aliasId('d1', v)] as VectorDrawing).shapes[0] as PathShape).fill = '#ff00ff';
      d.layers.find((l) => l.id === 'L1')!.opacity = 0.5;
      d.layers.find((l) => l.id === 'L1')!.cels[1].start = 5;
      d.background = '#000000';
    });
    return v;
  }

  it('lists what changed in plain words, with where to jump', () => {
    const v = messy();
    const list = listDifferences(doc(), v);
    expect(list.map((x) => x.label)).toEqual(
      expect.arrayContaining(['Background colour', 'Layer: opacity changed', 'Key at frame 6: moved', 'Drawing at frame 1: 1 shape recoloured']),
    );
    const drawing = list.find((x) => x.reset.t === 'drawing')!;
    expect(drawing).toMatchObject({ layer: 'L1', frame: 0, group: 'Body', shapes: ['s1'] });
  });

  it('resets one thing and the rest stay (variation open)', () => {
    const v = messy();
    const item = listDifferences(doc(), v).find((x) => x.reset.t === 'drawing')!;
    update('Reset', (d) => void resetDifference(d, v, item.reset));
    expect(shape(doc(), aliasId('d1', v), 's1').fill).toBe('#ff0000');
    expect(doc().background).toBe('#000000');
    const ov = findArtboard(doc(), v)!.overrides!;
    expect(ov.drawings).toBeUndefined();
    expect(ov.stage).toBeTruthy();
    // One undo brings the colour back.
    store().undo();
    expect(shape(doc(), aliasId('d1', v), 's1').fill).toBe('#ff00ff');
  });

  it('resets one thing (variation not open)', () => {
    const v = messy();
    open(root());
    const item = listDifferences(doc(), v).find((x) => x.reset.t === 'layer')!;
    update('Reset', (d) => void resetDifference(d, v, item.reset));
    expect(layerOf(findArtboard(doc(), v)!.content!, 'L1').opacity).toBe(1);
    expect(findArtboard(doc(), v)!.content!.background).toBe('#000000');
  });

  it('resets the whole variation, open or not', () => {
    const v = messy();
    update('Reset all', (d) => void resetVariation(d, v));
    expect(doc().background).toBe('#ffffff');
    expect(findArtboard(doc(), v)!.overrides).toEqual({});
    expect(listDifferences(doc(), v)).toEqual([]);
    expect(layerOf({ layers: doc().layers }, 'L1').opacity).toBe(1);
    store().undo();
    expect(doc().background).toBe('#000000');
  });

  it('after a reset the variation follows the original again', () => {
    const v = messy();
    update('Reset all', (d) => void resetVariation(d, v));
    open(root());
    update('Edit original', (d) => void (d.layers.find((l) => l.id === 'L1')!.opacity = 0.1));
    expect(layerOf(findArtboard(doc(), v)!.content!, 'L1').opacity).toBe(0.1);
  });
});

describe('variations: detaching and deleting', () => {
  it('detach keeps what it shows and stops following', () => {
    const v = make();
    open(v);
    update('Recolour', (d) => void (((d.drawings[aliasId('d1', v)] as VectorDrawing).shapes[0] as PathShape).fill = '#ff00ff'));
    open(root());
    update('Detach', (d) => void detachVariation(d, v));
    const a = findArtboard(doc(), v)!;
    expect(a.variationOf).toBeUndefined();
    expect(a.overrides).toBeUndefined();
    update('Edit original', (d) => void (d.layers.find((l) => l.id === 'L1')!.opacity = 0.2));
    expect(layerOf(a.content!, 'L1').opacity).toBe(1);
    // It is a plain artboard now: the colour it had is still there, and it can be opened and edited alone.
    expect(shape(doc(), a.content!.layers.find((l) => l.id === 'L1')!.cels[0].drawingId, 's1').fill).toBe('#ff00ff');
    open(v);
    update('Edit detached', (d) => void (d.layers.find((l) => l.id === 'L1')!.opacity = 0.3));
    expect(findArtboard(doc(), v)!.overrides).toBeUndefined();
    expect(layerOf(findArtboard(doc(), root())!.content!, 'L1').opacity).toBe(0.2);
  });

  it('deleting the original leaves its variations as plain artboards', () => {
    const v = make();
    update('Delete', (d) => void deleteArtboard(d, root()));
    expect(findArtboard(doc(), v)!.variationOf).toBeUndefined();
    expect(artboardsOf(doc())).toHaveLength(1);
    expect(doc().layers.map((l) => l.id)).toEqual(['L2', 'L1']);
  });

  it('a duplicate of a variation is a plain copy with its own drawings', () => {
    const v = make();
    let copy: string | null = null;
    update('Duplicate', (d) => void (copy = duplicateArtboard(d, v)));
    const c = findArtboard(doc(), copy!)!;
    expect(c.variationOf).toBeUndefined();
    expect(c.content!.layers[1].cels[0].drawingId).not.toBe(aliasId('d1', v));
  });

  it('a variation of a variation starts with the same changes, linked to the original', () => {
    const v = make();
    open(v);
    update('Edit', (d) => {
      ((d.drawings[aliasId('d1', v)] as VectorDrawing).shapes[0] as PathShape).fill = '#ff00ff';
      d.drawings.vNew = { id: 'vNew', kind: 'vector', shapes: [rect('sn', '#abcdef')] };
      d.layers.push({ ...newVectorLayer('Extra'), id: 'LX', cels: [{ id: 'cx', start: 0, length: 2, drawingId: 'vNew' }] });
    });
    const w = make({}, v);
    const a = findArtboard(doc(), w)!;
    expect(a.variationOf).toBe(root());
    expect(a.overrides!.drawings!.d1.shapes!.items!.s1.patch!.set).toEqual({ fill: '#ff00ff' });
    // Its extra layer has its own copy of the drawing, so editing one leaves the other.
    const own = a.overrides!.layers!.added![0].cels[0].drawingId;
    expect(own).not.toBe('vNew');
    expect(doc().drawings[own]).toBeTruthy();
  });
});

describe('variations: round trip', () => {
  it('resolving then diffing gives the overrides back', () => {
    const v = make();
    open(v);
    update('Edit', (d) => {
      ((d.drawings[aliasId('d1', v)] as VectorDrawing).shapes[0] as PathShape).fill = '#ff00ff';
      d.layers.find((l) => l.id === 'L1')!.opacity = 0.5;
      d.layers.find((l) => l.id === 'L1')!.cels.splice(0, 1);
      d.layers = d.layers.filter((l) => l.id !== 'L2');
      d.width = 80;
      d.markers.push({ id: 'm1', frame: 2, name: 'hit' });
    });
    const ov = findArtboard(doc(), v)!.overrides!;
    const base = findArtboard(doc(), root())!.content!;
    const r = resolveContent(base, doc().drawings, ov, v);
    const back = diffContent(base, doc().drawings, r.content, { ...doc().drawings, ...r.drawings }, v);
    expect(deepEqual(back, ov)).toBe(true);
    expect(splitAlias(aliasId('a~b', v))).toEqual({ orig: 'a~b', vid: v });
  });

  it('saves only the changes, and opens to the same artboards', () => {
    const v = make();
    open(v);
    update('Edit', (d) => {
      ((d.drawings[aliasId('d1', v)] as VectorDrawing).shapes[0] as PathShape).fill = '#ff00ff';
      d.layers.find((l) => l.id === 'L1')!.opacity = 0.5;
    });
    const before = findArtboard(doc(), v)!.overrides;
    for (const openOne of [true, false]) {
      if (!openOne) open(root());
      const bytes = saveFile(doc());
      const raw = JSON.parse(strFromU8(unzipSync(bytes)['doc.json']));
      const saved = raw.artboards.find((a: { id: string }) => a.id === v);
      expect(saved.variationOf).toBe(root());
      expect(saved.content).toBeUndefined();
      expect(saved.overrides).toEqual(JSON.parse(JSON.stringify(before)));
      // Its own, worked-out drawings are not stored.
      expect(Object.keys(raw.drawings).some((k) => k.includes('~'))).toBe(false);
      expect(raw.activeArtboard).toBe(root());
      expect(raw.variationOpen).toBe(openOne ? v : undefined);
      const loaded = loadFile(bytes);
      expect(loaded.warnings).toEqual([]);
      const d = loaded.doc;
      expect(activeId(d)).toBe(openOne ? v : root());
      const a = findArtboard(d, v)!;
      expect(a.variationOf).toBe(root());
      expect(deepEqual(a.overrides, before)).toBe(true);
      const c = openOne ? takeContent(d) : a.content!;
      expect(layerOf(c, 'L1').opacity).toBe(0.5);
      expect(shape(d, c.layers.find((l) => l.id === 'L1')!.cels[0].drawingId, 's1').fill).toBe('#ff00ff');
      // And it still follows: edit the original in the opened file.
      resetStore(d);
      open(root());
      update('Edit original', (x) => void (x.layers.find((l) => l.id === 'L2')!.opacity = 0.4));
      expect(layerOf(findArtboard(doc(), v)!.content!, 'L2').opacity).toBe(0.4);
      resetStore(doc());
    }
  });

  it('keeps pixels a variation redrew, and nothing it only shares', () => {
    const d0 = newDoc({ name: 'Px', width: 16, height: 16, length: 2, pixel: { pixelSize: 1 } });
    const layer = d0.layers[0];
    const p = newPixelDrawing(16, 16);
    p.pixels[0] = 255;
    p.pixels[3] = 255;
    d0.drawings[p.id] = p;
    layer.cels.push({ id: 'pc', start: 0, length: 2, drawingId: p.id });
    resetStore(d0);
    const v = make();
    open(v);
    update('Paint', (d) => {
      const a = d.drawings[aliasId(p.id, v)] as PixelDrawing;
      const px = new Uint8ClampedArray(a.pixels);
      px[4] = 255;
      px[7] = 255;
      a.pixels = px;
    });
    const ov = findArtboard(doc(), v)!.overrides!;
    expect(ov.drawings![p.id]).toEqual({ replaced: true });
    const bytes = saveFile(doc());
    const files = unzipSync(bytes);
    expect(Object.keys(files).filter((n) => n.startsWith('pixels/'))).toHaveLength(2);
    const loaded = loadFile(bytes).doc;
    const alias = aliasId(p.id, v);
    expect((loaded.drawings[alias] as PixelDrawing).pixels[4]).toBe(255);
    expect((loaded.drawings[p.id] as PixelDrawing).pixels[4]).toBe(0);
    // Reset puts the original's pixels back and drops the copy.
    resetStore(loaded);
    update('Reset', (d) => void resetVariation(d, v));
    expect((doc().drawings[alias] as PixelDrawing).pixels).toBe((doc().drawings[p.id] as PixelDrawing).pixels);
  });

  it('a damaged variation does not stop the file opening', () => {
    const v = make();
    open(root());
    const bytes = saveFile(doc());
    const files = unzipSync(bytes);
    const raw = JSON.parse(strFromU8(files['doc.json']));
    const a = raw.artboards.find((x: { id: string }) => x.id === v);
    a.overrides = { stage: { set: { width: 'wide', length: -4, __proto__: 1 }, del: ['__proto__'] }, layers: { items: { L1: { patch: { set: { opacity: 'lots', visible: false } } }, __proto__: {} }, removed: [4, 'L2'], added: [{ kind: 'nope' }] }, drawings: 5 };
    const broken = { ...files, 'doc.json': new TextEncoder().encode(JSON.stringify(raw)) };
    const d = loadFile(zipSync(broken)).doc;
    const c = findArtboard(d, v)!.content!;
    expect(c.width).toBe(200);
    expect(layerOf(c, 'L1').opacity).toBe(1);
    expect(layerOf(c, 'L1').visible).toBe(false);
    expect(c.layers.map((l) => l.id)).toEqual(['L1']);
  });

  it('an old file without artboards still opens, and a file whose original is missing drops the variation', () => {
    const plain = loadFile(saveFile(sample())).doc;
    expect(plain.artboards).toBeUndefined();
    const v = make();
    const bytes = saveFile(doc());
    const files = unzipSync(bytes);
    const raw = JSON.parse(strFromU8(files['doc.json']));
    raw.artboards.find((x: { id: string }) => x.id === v).variationOf = 'gone';
    const r = loadFile(zipSync({ ...files, 'doc.json': new TextEncoder().encode(JSON.stringify(raw)) }));
    expect(r.warnings.join(' ')).toContain('lost the artboard it followed');
    expect(artboardsOf(r.doc)).toHaveLength(1);
  });
});

describe('variations: exporting', () => {
  it('the export picker can pick an artboard and all its variations', () => {
    const v = make();
    const w = make();
    expect(familyIds(doc(), v)).toEqual([root(), v, w]);
    expect(familyIds(doc(), root())).toEqual([root(), v, w]);
    resetStore(sample());
    expect(familyIds(doc(), root())).toEqual([]);
  });
});

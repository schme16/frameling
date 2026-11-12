import { unzipSync, strFromU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newTilemapDrawing, newVectorLayer } from '../../src/core/doc';
import type { AudioClip, CameraDrawing, Doc, Layer, PathShape, PixelDrawing, TilemapDrawing, VectorDrawing } from '../../src/core/format';
import { onBlocked, resetStore, store } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';
import { defaultSettings } from '../../src/export/plan';
import { artboardExport, planArtboards, setArtboardExport } from '../../src/artboards/export';
import { followSelection } from '../../src/core/followSelection';
import { changePaletteColor } from '../../src/pixel/commands';
import { docPalette } from '../../src/pixel/palette';
import { resizeArtboard, setArtboardBackgroundById } from '../../src/artboards/ops';
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
  setVariationPalette,
  setVariationSize,
  settleVariations,
  touchOf,
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

describe('variations: more', () => {
  function walk(): Doc {
    // One layer with a shape that carries lineage through four keys, each its own drawing.
    const d0 = newDoc({ name: 'Walk', width: 100, height: 100, length: 4, fps: 12 });
    const layer = { ...newVectorLayer('Hero'), id: 'H' };
    for (let f = 0; f < 4; f++) {
      const sh = { ...rect(`s${f}`, '#ff0000', f * 5), origin: f ? 's0' : undefined };
      d0.drawings[`k${f}`] = { id: `k${f}`, kind: 'vector', shapes: [sh] };
      layer.cels.push({ id: `c${f}`, start: f, length: 1, drawingId: `k${f}` });
    }
    d0.layers = [layer];
    return d0;
  }

  it('a recolour across a layer\'s keys is one line with one reset', () => {
    resetStore(walk());
    const v = make();
    open(v);
    update('Recolour all', (d) => {
      for (let f = 0; f < 4; f++) ((d.drawings[aliasId(`k${f}`, v)] as VectorDrawing).shapes[0] as PathShape).fill = '#00ffff';
    });
    const list = listDifferences(doc(), v);
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('Drawings on 4 keys: 4 shapes recoloured');
    expect(list[0]).toMatchObject({ group: 'Hero', layer: 'H', frame: 0 });
    update('Reset', (d) => void resetDifference(d, v, list[0].reset));
    expect(listDifferences(doc(), v)).toEqual([]);
    expect(shape(doc(), aliasId('k2', v), 's2').fill).toBe('#ff0000');
  });

  it('the selection follows a shape from key to key inside a variation', () => {
    resetStore(walk());
    const v = make();
    open(v);
    const r = followSelection(doc(), 'H', ['s0'], 0, 2);
    expect(r?.selection).toEqual(['s2']);
  });

  it('an edit that changes nothing adds no undo step and no overrides', () => {
    const v = make();
    open(v);
    const steps = store().canUndo();
    update('Nothing', (d) => void (d.layers.find((l) => l.id === 'L1')!.opacity = 1));
    expect(store().canUndo()).toBe(steps);
    expect(findArtboard(doc(), v)!.overrides).toEqual({});
  });

  it('typing a size on a variation changes only its picture and frames the original', () => {
    const v = make();
    open(v);
    resizeArtboard(v, 100, 100);
    const a = findArtboard(doc(), v)!;
    expect(doc().width).toBe(100);
    expect(a.overrides!.stage).toEqual({ set: { width: 100 } });
    expect(doc().layers.some((l) => l.kind === 'camera')).toBe(true);
    // The original keeps its size and layers.
    expect(findArtboard(doc(), root())!.content!.width).toBe(200);
    expect(findArtboard(doc(), root())!.content!.layers.some((l) => l.kind === 'camera')).toBe(false);
  });

  it('the background of a variation that is not open is an override too', () => {
    const v = make();
    setArtboardBackgroundById(v, '#123456');
    expect(findArtboard(doc(), v)!.overrides).toEqual({ stage: { set: { background: '#123456' } } });
    expect(findArtboard(doc(), v)!.content!.background).toBe('#123456');
    expect(doc().background).toBe('#ffffff');
    // And the original's background still flows to variations that do not override it.
    setArtboardBackgroundById(root(), null);
    expect(findArtboard(doc(), v)!.content!.background).toBe('#123456');
    store().undo();
    store().undo();
    expect(findArtboard(doc(), v)!.overrides).toEqual({});
  });

  it('exports plan one file per picked artboard, variations included, at their own sizes', () => {
    const v = make({ size: { width: 100, height: 100 } });
    const w = make();
    open(root());
    setArtboardExport({ mode: 'each', ids: familyIds(doc(), root()) });
    const settings = { ...defaultSettings(doc()), format: 'png' as const };
    const plan = planArtboards(doc(), settings, 0)!;
    expect(plan.files).toBe(3);
    expect(plan.problem).toBeNull();
    expect(artboardDoc(doc(), v).width).toBe(100);
    expect(artboardDoc(doc(), w).width).toBe(200);
    setArtboardExport({ mode: 'one', ids: null });
    expect(artboardExport.get().mode).toBe('one');
  });
});

describe('variations: settling only what an edit touched', () => {
  /** Nothing is left for a full check to do: the incremental settle kept everything in step. */
  const inStep = () => expect(settleVariations(doc())).toBeNull();

  it('stays in step through a mix of edits to the original and to the open variation', () => {
    const a = make();
    const b = make();
    open(a);
    const A = (id: string) => aliasId(id, a);
    update('recolour in the variation', (d) => void (shape(d, A('d1'), 's1').fill = '#abcdef'));
    inStep();
    update('layer look', (d) => void (d.layers.find((l) => l.id === 'L1')!.opacity = 0.4));
    inStep();
    update('length and background', (d) => {
      d.length = 12;
      d.background = '#111111';
    });
    inStep();
    update('a key', (d) => void d.layers.find((l) => l.id === 'L2')!.cels.push({ id: 'c9', start: 8, length: 2, drawingId: A('d3') }));
    inStep();
    open(root());
    update('original drawing', (d) => void (shape(d, 'd2', 's3').fill = '#222222'));
    inStep();
    expect(shape(doc(), aliasId('d2', b), 's3').fill).toBe('#222222');
    expect(shape(doc(), aliasId('d2', a), 's3').fill).toBe('#222222');
    update('original key', (d) => void d.layers.find((l) => l.id === 'L1')!.cels.push({ id: 'c8', start: 8, length: 1, drawingId: 'd1' }));
    inStep();
    expect(findArtboard(doc(), b)!.content!.layers.find((l) => l.id === 'L1')!.cels.some((c) => c.id === 'c8')).toBe(true);
    update('original layer look', (d) => void (d.layers.find((l) => l.id === 'L2')!.opacity = 0.7));
    inStep();
    expect(findArtboard(doc(), b)!.content!.layers.find((l) => l.id === 'L2')!.opacity).toBe(0.7);
    // The variation's recolour is still its own.
    expect(shape(doc(), A('d1'), 's1').fill).toBe('#abcdef');
    expect(shape(doc(), 'd1', 's1').fill).toBe('#ff0000');
  });

  it('leaves a variation alone when its original did not change', () => {
    const a = make();
    const b = make();
    const before = findArtboard(doc(), b)!.content;
    open(a);
    update('recolour', (d) => void (shape(d, aliasId('d1', a), 's1').fill = '#00ffff'));
    update('look', (d) => void (d.layers[0].opacity = 0.5));
    expect(findArtboard(doc(), b)!.content).toBe(before);
    expect(findArtboard(doc(), a)!.overrides!.drawings!.d1).toBeTruthy();
  });

  it('reads patches: drawings, layer keys and artboards', () => {
    const t = touchOf([
      { op: 'replace', path: ['drawings', 'd1', 'shapes', 0, 'fill'], value: 1 },
      { op: 'replace', path: ['layers', 1, 'opacity'], value: 1 },
      { op: 'add', path: ['layers', 1, 'cels', 2], value: 1 },
      { op: 'replace', path: ['artboards', 0, 'content', 'background'], value: null },
      { op: 'replace', path: ['artboards', 2, 'overrides'], value: {} },
    ]);
    expect(t).toMatchObject({ full: false, content: true, cels: true });
    expect([...t.drawings]).toEqual(['d1']);
    expect([...t.closed]).toEqual([0]);
    expect([...t.own]).toEqual([2]);
    expect(touchOf([{ op: 'replace', path: ['drawings'], value: {} }]).full).toBe(true);
    expect(touchOf([{ op: 'replace', path: ['layers', 1, 'opacity'], value: 1 }]).cels).toBe(false);
  });
});

describe('variations: sound, palette and what stays shared', () => {
  const clip = (id: string, start: number, volume?: number): AudioClip => ({ id, name: `Sound ${id}`, start, data: new Uint8Array([1, 2, 3, id.length]), mime: 'audio/wav', ...(volume === undefined ? {} : { volume }) });
  const withSound = () => {
    const d0 = sample();
    d0.audio = [clip('a1', 0), clip('a2', 4)];
    resetStore(d0);
  };
  const blocked: string[] = [];
  beforeEach(() => {
    blocked.length = 0;
    onBlocked((m) => void blocked.push(m));
  });

  it('a variation can change the volume, mute and start of a sound without touching the original', () => {
    withSound();
    const v = make();
    open(v);
    update('Sound', (d) => {
      d.audio![0].volume = 0.3;
      d.audio![1].muted = true;
      d.audio![1].start = 6;
    });
    const ov = findArtboard(doc(), v)!.overrides!;
    expect(ov.audio!.items).toEqual({ a1: { patch: { set: { volume: 0.3 } } }, a2: { patch: { set: { muted: true, start: 6 } } } });
    // It is the same bytes, not a copy.
    expect(ov.audio!.items!.a1).not.toHaveProperty('data');
    open(root());
    expect(doc().audio![0].volume).toBeUndefined();
    expect(artboardDoc(doc(), v).audio![0].volume).toBe(0.3);
    expect(artboardDoc(doc(), v).audio![1]).toMatchObject({ muted: true, start: 6 });
    expect(artboardDoc(doc(), v).audio![0].data).toBe(doc().audio![0].data);
    inStepNow();
  });

  const inStepNow = () => expect(settleVariations(doc())).toBeNull();

  it('a sound change is not lost on the next edit, and the original still flows in', () => {
    withSound();
    const v = make();
    open(v);
    update('Sound', (d) => void (d.audio![0].volume = 0.3));
    update('Something else', (d) => void (d.layers[0].opacity = 0.8));
    expect(doc().audio![0].volume).toBe(0.3);
    open(root());
    update('Original sound', (d) => {
      d.audio![1].volume = 0.5;
      d.audio![0].name = 'Renamed';
    });
    const a = findArtboard(doc(), v)!.content!.audio!;
    expect(a[0]).toMatchObject({ volume: 0.3, name: 'Renamed' });
    expect(a[1].volume).toBe(0.5);
  });

  it('leaving a sound out and adding one are overrides too', () => {
    withSound();
    const v = make();
    open(v);
    update('Remove and add', (d) => {
      d.audio = [d.audio![0], clip('a9', 2)];
    });
    const ov = findArtboard(doc(), v)!.overrides!;
    expect(ov.audio!.removed).toEqual(['a2']);
    expect(ov.audio!.added!.map((c) => c.id)).toEqual(['a9']);
    open(root());
    expect(doc().audio!.map((c) => c.id)).toEqual(['a1', 'a2']);
    expect(findArtboard(doc(), v)!.content!.audio!.map((c) => c.id)).toEqual(['a1', 'a9']);
    const list = listDifferences(doc(), v);
    expect(list.map((i) => i.label)).toEqual(['Sound a2: left out of this variation', 'Sound a9: a sound only this variation has']);
    update('Reset one', (d) => void resetDifference(d, v, list[0].reset));
    expect(findArtboard(doc(), v)!.content!.audio!.map((c) => c.id)).toEqual(['a1', 'a2', 'a9']);
  });

  it('the sound changes are saved and opened again, new sounds with their bytes', () => {
    withSound();
    const v = make();
    open(v);
    update('Sound', (d) => {
      d.audio![0].volume = 0.25;
      d.audio!.push(clip('a7', 1, 0.5));
    });
    open(root());
    const bytes = saveFile(doc());
    const files = unzipSync(bytes);
    expect(Object.keys(files).filter((n) => n.startsWith('audio/')).sort()).toEqual(['audio/a1.wav', 'audio/a2.wav', 'audio/a7.wav']);
    const raw = JSON.parse(strFromU8(files['doc.json']));
    expect(raw.artboards.find((a: { id: string }) => a.id === v).overrides.audio.added[0].data).toBe('audio/a7.wav');
    const loaded = loadFile(bytes);
    expect(loaded.warnings).toEqual([]);
    const a = findArtboard(loaded.doc, v)!;
    expect(a.overrides!.audio!.items!.a1.patch).toEqual({ set: { volume: 0.25 } });
    expect(a.overrides!.audio!.added![0].data).toEqual(new Uint8Array([1, 2, 3, 2]));
    expect(a.content!.audio!.map((c) => [c.id, c.volume])).toEqual([['a1', 0.25], ['a2', undefined], ['a7', 0.5]]);
  });

  it('a variation gets its own palette; the original and the other variations keep theirs', () => {
    const d0 = sample();
    d0.palette = { name: 'Mine', colors: ['#ff0000', '#00ff00', '#0000ff'] };
    resetStore(d0);
    const v = make();
    const w = make();
    open(v);
    expect(docPalette(doc()).colors).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    update('Palette', (d) => void setVariationPalette(d, { name: 'Night', colors: ['#220000', '#002200', '#000022'] }));
    expect(docPalette(doc()).name).toBe('Night');
    expect(doc().palette!.name).toBe('Mine');
    expect(findArtboard(doc(), v)!.overrides!.palette!.name).toBe('Night');
    // Edits after it do not drop it.
    update('Look', (d) => void (d.layers[0].opacity = 0.5));
    expect(findArtboard(doc(), v)!.overrides!.palette!.name).toBe('Night');
    expect(artboardDoc(doc(), v).palette!.name).toBe('Night');
    expect(artboardDoc(doc(), w).palette!.name).toBe('Mine');
    open(w);
    expect(docPalette(doc()).name).toBe('Mine');
    open(root());
    expect(listDifferences(doc(), v).map((i) => i.label)).toContain('Palette: its own colours (3), the original\'s stay as they are');
    update('Reset', (d) => void resetDifference(d, v, { t: 'palette' }));
    expect(findArtboard(doc(), v)!.overrides!.palette).toBeUndefined();
  });

  it('a colourway: changing a palette colour in a variation recolours only its pixels', () => {
    const d0 = newDoc({ name: 'Px', width: 4, height: 4, length: 2, pixel: { pixelSize: 1 } });
    const p = newPixelDrawing(4, 4);
    p.pixels.set([255, 0, 0, 255], 0);
    d0.drawings[p.id] = p;
    d0.layers[0].cels.push({ id: 'pc', start: 0, length: 2, drawingId: p.id });
    d0.palette = { name: 'P', colors: ['#ff0000', '#00ff00'] };
    resetStore(d0);
    const v = make();
    open(v);
    changePaletteColor(0, '#0000ff');
    expect(findArtboard(doc(), v)!.overrides!.palette!.colors[0]).toBe('#0000ff');
    expect(doc().palette!.colors[0]).toBe('#ff0000');
    const mine = doc().drawings[aliasId(p.id, v)] as PixelDrawing;
    expect([...mine.pixels.slice(0, 4)]).toEqual([0, 0, 255, 255]);
    expect([...(doc().drawings[p.id] as PixelDrawing).pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    open(root());
    // Changing the original's palette later does not reach the variation's own colours.
    changePaletteColor(1, '#ffff00');
    expect([...(doc().drawings[aliasId(p.id, v)] as PixelDrawing).pixels.slice(0, 4)]).toEqual([0, 0, 255, 255]);
    expect(findArtboard(doc(), v)!.overrides!.palette!.colors).toEqual(['#0000ff', '#00ff00']);
    // The palette is saved with the variation and opens again.
    const loaded = loadFile(saveFile(doc())).doc;
    expect(findArtboard(loaded, v)!.overrides!.palette!.colors).toEqual(['#0000ff', '#00ff00']);
  });

  it('shared things are not edited from a variation: the change is refused with a plain note and nothing is recorded', () => {
    const v = make();
    open(v);
    const steps = store().canUndo();
    update('Swatch', (d) => void d.swatches.push({ id: 'sw', name: 'x', color: '#123456' } as never));
    update('Folder', (d) => void (d.folders = { f1: { id: 'f1', name: 'F' } as never }));
    update('Palette', (d) => void (d.palette = { name: 'x', colors: ['#000000'] }));
    update('Symbol', (d) => void (d.symbols = { s1: { id: 's1', name: 'S', layers: [], length: 1 } as never }));
    expect(blocked).toEqual([
      'Swatches are shared with the original. Change them there, or detach this variation.',
      'Layer folders are shared with the original. Change them there, or detach this variation.',
      'The palette is shared with the original. Change it there, or detach this variation.',
      'Symbols are shared with the original. Change them there, or detach this variation.',
    ]);
    expect(store().canUndo()).toBe(steps);
    expect(doc().swatches.some((x) => x.id === 'sw')).toBe(false);
    expect(doc().folders).toBeUndefined();
    // On the original they are plain edits, shared by everyone.
    open(root());
    update('Swatch', (d) => void d.swatches.push({ id: 'sw', name: 'x', color: '#123456' } as never));
    expect(doc().swatches.some((x) => x.id === 'sw')).toBe(true);
    expect(blocked).toHaveLength(4);
  });
});

describe('variations: redrawn pictures are stored as what changed', () => {
  /** A pixel animation: `frames` keys of 64 x 64 noise (so each one costs real bytes in a file). */
  function animation(frames: number): Doc {
    const d0 = newDoc({ name: 'Walk', width: 64, height: 64, length: frames, pixel: { pixelSize: 1 } });
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >>> 8;
    for (let f = 0; f < frames; f++) {
      const p = newPixelDrawing(64, 64);
      for (let i = 0; i < p.pixels.length; i++) p.pixels[i] = rnd() & 255;
      d0.drawings[p.id] = p;
      d0.layers[0].cels.push({ id: `k${f}`, start: f, length: 1, drawingId: p.id });
    }
    return d0;
  }

  it('a few pixels painted on every key of a long animation add a few bytes, not another animation', () => {
    const d0 = animation(60);
    resetStore(d0);
    const alone = saveFile(doc()).length;
    const v = make();
    open(v);
    update('Paint a scar on every key', (d) => {
      for (const c of d.layers[0].cels) {
        const a = d.drawings[c.drawingId] as PixelDrawing;
        const px = new Uint8ClampedArray(a.pixels);
        for (let y = 10; y < 13; y++) for (let x = 20; x < 23; x++) px.set([255, 0, 0, 255], (y * 64 + x) * 4);
        a.pixels = px;
      }
    });
    open(root());
    const bytes = saveFile(doc());
    const grown = bytes.length - alone;
    expect(grown).toBeLessThan(alone * 0.05);
    // Each key's change is a small rectangle in the zip.
    const files = unzipSync(bytes);
    const diffs = Object.keys(files).filter((n) => n.startsWith('pixels/diff_'));
    expect(diffs).toHaveLength(60);
    expect(files[diffs[0]].length).toBeLessThan(200);
    // It opens to exactly the same pictures.
    const loaded = loadFile(bytes);
    expect(loaded.warnings).toEqual([]);
    for (const c of findArtboard(loaded.doc, v)!.content!.layers[0].cels) {
      const mine = loaded.doc.drawings[c.drawingId] as PixelDrawing;
      const was = doc().drawings[aliasId(c.drawingId.split('~')[0], v)] as PixelDrawing;
      expect(mine.pixels).toEqual(was.pixels);
    }
    expect((loaded.doc.drawings[d0.layers[0].cels[0].drawingId] as PixelDrawing).pixels[(10 * 64 + 20) * 4]).not.toBe(255);
  });

  it('a drawing changed nearly everywhere is stored whole, and the file still round trips', () => {
    resetStore(animation(2));
    const v = make();
    open(v);
    update('Repaint', (d) => {
      const c = d.layers[0].cels[0];
      const a = d.drawings[c.drawingId] as PixelDrawing;
      a.pixels = new Uint8ClampedArray(a.pixels.map((n) => 255 - n));
    });
    open(root());
    const files = unzipSync(saveFile(doc()));
    expect(Object.keys(files).filter((n) => n.startsWith('pixels/diff_'))).toHaveLength(0);
    const loaded = loadFile(saveFile(doc())).doc;
    const k = findArtboard(loaded, v)!.content!.layers[0].cels[0].drawingId;
    expect((loaded.drawings[k] as PixelDrawing).pixels).toEqual((doc().drawings[k] as PixelDrawing).pixels);
  });

  it('a pixel key the variation redrew but left the same costs nothing extra', () => {
    resetStore(animation(2));
    const v = make();
    open(v);
    update('Same again', (d) => {
      const a = d.drawings[d.layers[0].cels[0].drawingId] as PixelDrawing;
      a.pixels = new Uint8ClampedArray(a.pixels);
    });
    open(root());
    const loaded = loadFile(saveFile(doc())).doc;
    const k = findArtboard(loaded, v)!.content!.layers[0].cels[0].drawingId;
    expect((loaded.drawings[k] as PixelDrawing).pixels).toEqual((doc().drawings[k] as PixelDrawing).pixels);
  });

  it('a tile map a variation changed is stored as the slots that changed', () => {
    const d0 = newDoc({ name: 'Map', width: 64, height: 64, length: 2 });
    const t: TilemapDrawing = newTilemapDrawing(20, 20);
    t.cells.fill(5);
    d0.drawings[t.id] = t;
    d0.layers = [{ id: 'T', name: 'Tiles', kind: 'tilemap', pixelSize: 1, visible: true, locked: false, opacity: 1, cels: [{ id: 'tc', start: 0, length: 2, drawingId: t.id }] } as Layer];
    resetStore(d0);
    const v = make();
    open(v);
    update('Paint tiles', (d) => {
      const a = d.drawings[aliasId(t.id, v)] as TilemapDrawing;
      const cells = new Uint32Array(a.cells);
      cells[3] = 9;
      cells[41] = 7;
      a.cells = cells;
    });
    expect(findArtboard(doc(), v)!.overrides!.drawings![t.id]).toEqual({ replaced: true });
    open(root());
    const bytes = saveFile(doc());
    const raw = JSON.parse(strFromU8(unzipSync(bytes)['doc.json']));
    expect(raw.artboards.find((a: { id: string }) => a.id === v).overrides.drawings[t.id].diff).toEqual({ cells: [3, 9, 41, 7] });
    expect(Object.keys(raw.drawings).some((k) => k.includes('~'))).toBe(false);
    const loaded = loadFile(bytes).doc;
    const mine = loaded.drawings[aliasId(t.id, v)] as TilemapDrawing;
    expect([mine.cells[3], mine.cells[41], mine.cells[4]]).toEqual([9, 7, 5]);
    expect((loaded.drawings[t.id] as TilemapDrawing).cells[3]).toBe(5);
    expect(findArtboard(loaded, v)!.overrides!.drawings![t.id]).toEqual({ replaced: true });
  });
});

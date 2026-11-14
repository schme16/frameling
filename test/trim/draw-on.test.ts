import { describe, expect, it } from 'vitest';
import type { Doc, Id, PathShape, StrokeShape, Trim } from '../../src/core/format';
import { newDoc, uid } from '../../src/core/doc';
import { poseAt } from '../../src/core/symbols';
import { trimOf } from '../../src/core/trimTween';
import { loadFile, saveFile } from '../../src/io/file';
import { addVectorLayer, hold, linePath, pathShape, rectPath, stroke, vectorDrawing } from '../../src/templates/build';
import { clearTrims, drawLineOn, setTrimAt, trimLines, trimView } from '../../src/trim/model';
import { layerTracks } from '../../src/timeline/tracks';
import { retimeKeys } from '../../src/timeline/keys';
import { outlineLength, trimSubPaths } from '../../src/geometry/trim';
import { expandStroke, hasLineStyle } from '../../src/geometry/lineStyle';
import { strokeOutline, strokeOutlineWhole } from '../../src/core/render';
import { hitShape, shapeBounds } from '../../src/canvas/geometry';

const open = (): PathShape => pathShape([linePath([[100, 100], [500, 100]])], null, { color: '#222222', width: 8 });

/** A document with one layer holding one line on a one frame drawing, frames 0 to 47. */
function lineDoc(shape: PathShape | StrokeShape = open()) {
  const doc = newDoc({ length: 48, fps: 24 });
  const layer = addVectorLayer(doc, 'Line');
  doc.layers = [layer];
  const d = vectorDrawing(doc, [shape]);
  hold(layer, d.id, 0, 48);
  return { doc, layer, shape };
}

const trims = (doc: Doc, frame: number): (Trim | undefined)[] => {
  const d = poseAt(doc, doc.layers[0], frame);
  return d?.kind === 'vector' ? d.shapes.map(trimOf) : [];
};

describe('drawing a line on', () => {
  it('makes a second key, a second later, and glides the end from nothing to the whole line', () => {
    const { doc, layer, shape } = lineDoc();
    const r = drawLineOn(doc, layer.id, 0, trimLines([shape], [shape.id]), 'on', 24);
    expect(r).toEqual({ startFrame: 0, endFrame: 24 });
    expect(layer.cels.map((c) => [c.start, c.length])).toEqual([[0, 24], [24, 24]]);
    expect(layer.cels[0].tween).toMatchObject({ ease: 'easeInOut' });
    expect(trims(doc, 0)[0]).toMatchObject({ start: 0, end: 0 });
    expect(trims(doc, 24)[0]).toBeUndefined();
    // Halfway in time is halfway in the easing, which is halfway in the line.
    expect(trims(doc, 12)[0]!.end).toBeCloseTo(50, 3);
    const quarter = trims(doc, 6)[0]!.end;
    expect(quarter).toBeGreaterThan(0);
    expect(quarter).toBeLessThan(50);
  });

  it('gives the second key its own copy of the drawing, kept in step by `origin`', () => {
    const { doc, layer, shape } = lineDoc();
    drawLineOn(doc, layer.id, 0, [shape.id], 'on', 24);
    const [a, b] = layer.cels.map((c) => doc.drawings[c.drawingId]);
    expect(a).not.toBe(b);
    if (a.kind !== 'vector' || b.kind !== 'vector') throw new Error('vector');
    expect(b.shapes[0].id).not.toBe(a.shapes[0].id);
    expect(b.shapes[0].origin).toBe(a.shapes[0].id);
  });

  it('rubs a line out the other way', () => {
    const { doc, layer, shape } = lineDoc();
    drawLineOn(doc, layer.id, 0, [shape.id], 'off', 24);
    expect(trims(doc, 0)[0]).toBeUndefined();
    expect(trims(doc, 24)[0]).toMatchObject({ start: 100, end: 100 });
    expect(trims(doc, 12)[0]!.start).toBeCloseTo(50, 3);
  });

  it('reaches the next key when there is one, and closes a gap to it', () => {
    const { doc, layer, shape } = lineDoc();
    layer.cels[0].length = 10;
    const copy = vectorDrawing(doc, [structuredClone(shape)]);
    layer.cels.push({ id: uid('c'), start: 30, length: 10, drawingId: copy.id });
    const r = drawLineOn(doc, layer.id, 0, [shape.id], 'on', 24) as { endFrame: number };
    expect(r.endFrame).toBe(30);
    expect(layer.cels[0].length).toBe(30);
  });

  it('starts at the playhead when it is partway through a hold', () => {
    const { doc, layer, shape } = lineDoc();
    const r = drawLineOn(doc, layer.id, 10, [shape.id], 'on', 12) as { startFrame: number; endFrame: number };
    expect(r).toEqual({ startFrame: 10, endFrame: 22 });
    expect(layer.cels.map((c) => c.start)).toEqual([0, 10, 22]);
    // Before it, the line is as it was.
    expect(trims(doc, 5)[0]).toBeUndefined();
  });

  it('says why not, and changes nothing, for a locked layer, no line, or a morph', () => {
    const { doc, layer, shape } = lineDoc();
    layer.locked = true;
    expect(drawLineOn(doc, layer.id, 0, [shape.id], 'on', 24)).toMatch(/locked/);
    layer.locked = false;
    expect(drawLineOn(doc, layer.id, 0, ['nothing'], 'on', 24)).toMatch(/None of the picked/);
    layer.cels[0].length = 24;
    layer.cels.push({ id: uid('c'), start: 24, length: 24, drawingId: layer.cels[0].drawingId });
    layer.cels[0].tween = { kind: 'shape', ease: 'linear' };
    expect(drawLineOn(doc, layer.id, 0, [shape.id], 'on', 24)).toMatch(/morph/);
    expect(layer.cels).toHaveLength(2);
  });

  it('remembers how several outlines go', () => {
    const two = pathShape([linePath([[0, 0], [100, 0]]), linePath([[0, 50], [100, 50]])], null, { color: '#000000', width: 4 });
    const { doc, layer } = lineDoc(two);
    drawLineOn(doc, layer.id, 0, [two.id], 'on', 24, 'inOrder');
    expect(trims(doc, 0)[0]).toMatchObject({ order: 'inOrder' });
  });
});

describe('setting a trim at a frame', () => {
  it('changes the key it is on', () => {
    const { doc, layer, shape } = lineDoc();
    const r = setTrimAt(doc, layer.id, 0, [shape.id], { end: 40 });
    expect(r).toMatchObject({ cut: false });
    expect(trims(doc, 0)[0]).toEqual({ start: 0, end: 40, offset: 0 });
    expect(layer.cels).toHaveLength(1);
  });

  it('cuts a key at a frame that is not one, so the change is a key on the timeline', () => {
    const { doc, layer, shape } = lineDoc();
    const r = setTrimAt(doc, layer.id, 10, [shape.id], { start: 20, end: 60 });
    if (typeof r === 'string') throw new Error(r);
    expect(r.cut).toBe(true);
    expect(layer.cels.map((c) => [c.start, c.length])).toEqual([[0, 10], [10, 38]]);
    expect(trims(doc, 9)[0]).toBeUndefined();
    expect(trims(doc, 10)[0]).toEqual({ start: 20, end: 60, offset: 0 });
    // The shapes on the new key are the ones it hands back.
    const d = doc.drawings[layer.cels[1].drawingId];
    expect(d.kind === 'vector' && d.shapes.map((s) => s.id)).toEqual(r.ids);
  });

  it('holds the amount drawn so far when it cuts a key in the middle of a glide', () => {
    const { doc, layer, shape } = lineDoc();
    drawLineOn(doc, layer.id, 0, [shape.id], 'on', 24);
    const was = trims(doc, 12)[0]!.end;
    const r = setTrimAt(doc, layer.id, 12, [shape.id], { offset: 0 });
    if (typeof r === 'string') throw new Error(r);
    // The new key keeps what the glide had reached, and the glide carries on from it.
    expect(trims(doc, 12)[0]!.end).toBeCloseTo(was, 6);
    expect(trims(doc, 6)[0]!.end).toBeCloseTo(drawnAt6(), 6);
    expect(trims(doc, 24)[0]).toBeUndefined();

    function drawnAt6(): number {
      const fresh = lineDoc();
      drawLineOn(fresh.doc, fresh.layer.id, 0, [fresh.shape.id], 'on', 24);
      return trims(fresh.doc, 6)[0]!.end;
    }
  });

  it('works on a drawing shared by two keys without changing the other', () => {
    const { doc, layer, shape } = lineDoc();
    layer.cels[0].length = 24;
    layer.cels.push({ id: uid('c'), start: 24, length: 24, drawingId: layer.cels[0].drawingId });
    setTrimAt(doc, layer.id, 24, [shape.id], { end: 10 });
    expect(trims(doc, 0)[0]).toBeUndefined();
    expect(trims(doc, 24)[0]).toMatchObject({ end: 10 });
  });

  it('refuses nicely', () => {
    const { doc, layer, shape } = lineDoc();
    expect(setTrimAt(doc, 'missing', 0, [shape.id], { end: 1 })).toMatch(/drawing layers/);
    expect(setTrimAt(doc, layer.id, 99, [shape.id], { end: 1 })).toMatch(/no drawing/);
    expect(setTrimAt(doc, layer.id, 0, ['nope'], { end: 1 })).toMatch(/None/);
  });

  it('takes the trim off every key', () => {
    const { doc, layer, shape } = lineDoc();
    drawLineOn(doc, layer.id, 0, [shape.id], 'on', 24);
    expect(clearTrims(doc, layer.id, [shape.id])).toBe(1);
    expect(trims(doc, 0)[0]).toBeUndefined();
    expect(trims(doc, 12)[0]).toBeUndefined();
    expect(clearTrims(doc, layer.id, [shape.id])).toBe(0);
  });
});

describe('what the panel is told', () => {
  it('describes the picked line at the frame', () => {
    const { doc, layer, shape } = lineDoc();
    drawLineOn(doc, layer.id, 0, [shape.id], 'on', 24);
    const at = (f: number) => trimView(doc, layer.id, f, [layer.cels[f < 24 ? 0 : 1] && ((doc.drawings[layer.cels[f < 24 ? 0 : 1].drawingId] as { shapes: { id: Id }[] }).shapes[0].id)])!;
    expect(at(0)).toMatchObject({ onKey: true, glides: true, nextKey: 24, outlines: 1, loops: false });
    expect(at(12)).toMatchObject({ onKey: false, glides: true });
    expect(at(12).now.end).toBeCloseTo(50, 3);
    expect(trimView(doc, layer.id, 0, [])).toBeNull();
  });

  it('knows a loop from an open line', () => {
    const ring = pathShape([rectPath(0, 0, 50, 50)], null, { color: '#000000', width: 4 });
    const { doc, layer } = lineDoc(ring);
    expect(trimView(doc, layer.id, 0, [ring.id])).toMatchObject({ loops: true, outlines: 1 });
  });
});

describe('the Draw on row on the timeline', () => {
  it('shows a key on each drawing key where the line changes, and none when nothing is trimmed', () => {
    const { doc, layer, shape } = lineDoc();
    expect(layerTracks(structuredClone(doc), structuredClone(layer)).find((t) => t.id === 'trim')).toBeUndefined();
    drawLineOn(doc, layer.id, 0, [shape.id], 'on', 24);
    const copy = structuredClone(doc);
    const row = layerTracks(copy, copy.layers[0]).find((t) => t.id === 'trim')!;
    expect(row.label).toBe('Draw on');
    expect(row.keys.map((k) => k.frame)).toEqual([0, 24]);
    expect(row.keys[0].value).toBe('draws nothing yet');
    expect(row.spans).toEqual([expect.objectContaining({ from: 0, to: 24, kind: 'tween' })]);
  });

  it('moves a key on its own, the way the other rows do', () => {
    const { doc, layer, shape } = lineDoc();
    drawLineOn(doc, layer.id, 0, [shape.id], 'on', 24);
    const copy = structuredClone(doc);
    const key = layerTracks(copy, copy.layers[0]).find((t) => t.id === 'trim')!.keys[1].ref;
    const out = retimeKeys(copy, [key], (f) => f + 6);
    expect(out).toHaveLength(1);
    const after = structuredClone(copy);
    expect(layerTracks(after, after.layers[0]).find((t) => t.id === 'trim')!.keys.map((k) => k.frame)).toEqual([0, 30]);
  });
});

describe('what shows', () => {
  it('a trimmed outline is a line plus its fill, and the fill stays whole', () => {
    const ring = pathShape([rectPath(0, 0, 100, 100)], '#ff0000', { color: '#000000', width: 4 });
    const t: PathShape = { ...ring, stroke: { ...ring.stroke!, trim: { start: 0, end: 50, offset: 0 } } };
    expect(hasLineStyle(t.stroke)).toBe(true);
    const parts = expandStroke(t);
    expect(parts.map((p) => p.role)).toEqual(['fill', 'line']);
    expect(parts[0].shape.paths).toBe(t.paths);
    expect(parts[0].shape.stroke).toBeNull();
    expect(parts[1].shape.fill).toBeNull();
    expect(outlineLength(parts[1].shape.paths)).toBeCloseTo(200, 3);
    expect(parts[1].shape.stroke!.trim).toBeUndefined();
  });

  it('a line still gets its dashes and arrow heads after it is trimmed, and the head rides the cut end', () => {
    const base = open();
    const t: PathShape = { ...base, stroke: { ...base.stroke!, arrowEnd: 'triangle', trim: { start: 0, end: 50, offset: 0 } } };
    const parts = expandStroke(t);
    expect(parts.map((p) => p.role)).toEqual(['line', 'head-e0']);
    const head = parts[1].shape.paths[0].points;
    const maxX = Math.max(...head.map((p) => p.x));
    // The line is 400 long from x 100; half of it ends at 300 and the head is there, not at 500.
    expect(maxX).toBeGreaterThan(290);
    expect(maxX).toBeLessThan(340);
  });

  it('shows nothing, not a dot, at End 0%', () => {
    const base = open();
    const t: PathShape = { ...base, stroke: { ...base.stroke!, trim: { start: 0, end: 0, offset: 0 } } };
    const parts = expandStroke(t);
    expect(parts.map((p) => p.role)).toEqual(['line']);
    expect(parts[0].shape.paths).toEqual([]);
  });

  it('a brush line outlines only what shows, but picks and measures as the whole line', () => {
    const line = stroke([[0, 0], [200, 0]], '#000000', 10);
    const t: StrokeShape = { ...line, trim: { start: 0, end: 25, offset: 0 } };
    const xs = (o: number[][]) => o.map((p) => p[0]);
    expect(Math.max(...xs(strokeOutline(t)))).toBeLessThan(80);
    expect(Math.max(...xs(strokeOutlineWhole(t)))).toBeGreaterThan(190);
    expect(strokeOutlineWhole(line)).toBe(strokeOutline(line));
    expect(shapeBounds(t).w).toBeGreaterThan(190);
    expect(hitShape(t, 180, 0, 3)).toBe(true);
    expect(strokeOutline({ ...line, trim: { start: 0, end: 0, offset: 0 } })).toEqual([]);
  });

  it('a brush line draws a round tip where it is cut, even if its end tapers', () => {
    const line = { ...stroke([[0, 0], [200, 0]], '#000000', 20, { taperEnd: 100 }), trim: { start: 0, end: 50, offset: 0 } } as StrokeShape;
    const tall = (o: number[][]) => Math.max(...o.map((p) => Math.abs(p[1])));
    // A taper would thin the cut end to a point; the pen tip keeps the full width right to the end.
    const whole = { ...line, trim: undefined } as StrokeShape;
    const ys = strokeOutline(line).filter((p) => p[0] > 80 && p[0] < 100).map((p) => Math.abs(p[1]));
    expect(Math.max(...ys)).toBeGreaterThan(8);
    expect(tall(strokeOutline(whole))).toBeGreaterThan(8);
  });

  it('trimming shapes for a path leaves the original object alone', () => {
    const base = open();
    const before = JSON.stringify(base);
    trimSubPaths(base.paths, { start: 10, end: 30, offset: 0 });
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('in the file', () => {
  const roundTrip = (d: Doc) => loadFile(saveFile(d, 'test')).doc;

  it('keeps a trim, on a path outline and on a brush line, through save and open', () => {
    const p = open();
    p.stroke!.trim = { start: 5, end: 70, offset: 10, order: 'inOrder' };
    const k = { ...stroke([[0, 0], [100, 0]], '#000', 4), trim: { start: 0, end: 30, offset: 0 } } as StrokeShape;
    const doc = lineDoc(p).doc;
    const layer = doc.layers[0];
    const d2 = vectorDrawing(doc, [k]);
    layer.cels = [{ id: uid('c'), start: 0, length: 24, drawingId: layer.cels[0].drawingId }, { id: uid('c'), start: 24, length: 24, drawingId: d2.id }];
    const back = roundTrip(doc);
    const shapes = back.layers[0].cels.map((c) => (back.drawings[c.drawingId] as { shapes: (PathShape | StrokeShape)[] }).shapes[0]);
    expect(trimOf(shapes[0])).toEqual({ start: 5, end: 70, offset: 10, order: 'inOrder' });
    expect(trimOf(shapes[1])).toEqual({ start: 0, end: 30, offset: 0 });
  });

  it('opens a file with no trims, and drops damaged ones', () => {
    const p = open();
    const k = stroke([[0, 0], [100, 0]], '#000', 4) as StrokeShape;
    (p.stroke as { trim?: unknown }).trim = { start: 'x', end: 'y' };
    (k as { trim?: unknown }).trim = 'junk';
    const doc = lineDoc(p).doc;
    const d2 = vectorDrawing(doc, [k]);
    doc.layers[0].cels.push({ id: uid('c'), start: 48, length: 1, drawingId: d2.id });
    const back = roundTrip(doc);
    const [a, b] = back.layers[0].cels.map((c) => (back.drawings[c.drawingId] as { shapes: (PathShape | StrokeShape)[] }).shapes[0]);
    expect(trimOf(a)).toBeUndefined();
    expect('trim' in b).toBe(false);
    expect(a.type === 'path' && 'trim' in a.stroke!).toBe(false);
  });
});

describe('blending between keys', () => {
  it('works on brush lines, and holds when the next key has no such line', () => {
    const k = stroke([[0, 0], [300, 0]], '#000000', 6) as StrokeShape;
    const { doc, layer } = lineDoc(k);
    drawLineOn(doc, layer.id, 0, [k.id], 'on', 20);
    expect(trims(doc, 10)[0]!.end).toBeCloseTo(50, 3);
    // Take the partner off the end key: the line holds what the first key says.
    const last = doc.drawings[layer.cels[1].drawingId];
    if (last.kind === 'vector') last.shapes = [];
    expect(trims(structuredClone(doc), 10)[0]).toMatchObject({ end: 0 });
  });

  it('also blends the shapes of a morph', async () => {
    const { morphShapes } = await import('../../src/core/shape-tween');
    const a = open();
    const b = open();
    a.stroke!.trim = { start: 0, end: 0, offset: 0 };
    const mid = morphShapes({ id: 'a', kind: 'vector', shapes: [a] }, { id: 'b', kind: 'vector', shapes: [{ ...b, origin: a.id }] }, 0.5, [], (x) => x, (x) => x as never);
    expect((mid[0] as PathShape).stroke!.trim?.end).toBeCloseTo(50, 3);
  });

  it('is the very same drawing, untouched, for a layer with no trims', () => {
    const plain = open();
    const { doc, layer } = lineDoc(plain);
    layer.cels[0].length = 24;
    const copy = vectorDrawing(doc, [{ ...structuredClone(plain), origin: plain.id }]);
    layer.cels.push({ id: uid('c'), start: 24, length: 24, drawingId: copy.id });
    layer.cels[0].tween = { ease: 'linear' };
    expect(poseAt(doc, layer, 12)).toBe(doc.drawings[layer.cels[0].drawingId]);
  });
});

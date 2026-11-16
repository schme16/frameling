// Recolour limited to this layer, this frame or the selection: which drawings it visits, what it leaves alone, and the
// dialog's words.
import { describe, expect, it } from 'vitest';
import type { Doc, FillShape, PixelLayer, VectorDrawing, VectorLayer } from '../../src/core/format';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorLayer } from '../../src/core/doc';
import { applyRecolour, hasRecolourSelection, recolourDoc, scopeOf, usedColours, type RecolourPlace } from '../../src/tools/recolour';
import { whereNote } from '../../src/tools/RecolourDialog';
import { rectMask } from '../../src/select/mask';

const fill = (id: string, color: string): FillShape => ({ id, type: 'fill', paths: [], color, opacity: 1 });
const vec = (id: string, ...shapes: FillShape[]): VectorDrawing => ({ id, kind: 'vector', shapes });
const colourOf = (d: Doc, drawing: string, shape = 0) => ((d.drawings[drawing] as VectorDrawing).shapes[shape] as FillShape).color;

/**
 * Shirt and Wall layers. Shirt has red on frame 0 (held two frames) and red on frame 2; Wall has red on both. A pixel layer
 * has a red pixel and a blue one on frame 0.
 */
function sample(): { doc: Doc; shirt: VectorLayer; wall: VectorLayer; dots: PixelLayer } {
  const doc = newDoc({ width: 8, height: 8, length: 4 });
  const shirt = { ...newVectorLayer('Shirt'), id: 'shirt' };
  const wall = { ...newVectorLayer('Wall'), id: 'wall' };
  const dots = { ...newPixelLayer('Dots', 1), id: 'dots' };
  const px = { ...newPixelDrawing(8, 8), id: 'px' };
  px.pixels.set([255, 0, 0, 255, 0, 0, 255, 255]);
  doc.drawings = { s0: vec('s0', fill('a', '#ff0000'), fill('b', '#ff0000')), s2: vec('s2', fill('c', '#ff0000')), w0: vec('w0', fill('d', '#ff0000')), w2: vec('w2', fill('e', '#ff0000')), px };
  shirt.cels = [{ id: 'c1', start: 0, length: 2, drawingId: 's0' }, { id: 'c2', start: 2, length: 2, drawingId: 's2' }];
  wall.cels = [{ id: 'c3', start: 0, length: 2, drawingId: 'w0' }, { id: 'c4', start: 2, length: 2, drawingId: 'w2' }];
  dots.cels = [{ id: 'c5', start: 0, length: 4, drawingId: px.id }];
  doc.layers = [wall, shirt, dots];
  wall.effects = [{ id: 'fx1', kind: 'glow', values: { color: '#ff0000', size: 4 } }];
  shirt.effects = [{ id: 'fx2', kind: 'shadow', values: { color: '#ff0000', size: 2 } }];
  doc.swatches = [{ id: 'sw', name: 'red', color: '#ff0000' }];
  doc.background = '#ff0000';
  return { doc, shirt, wall, dots };
}

const place = (o: Partial<RecolourPlace> = {}): RecolourPlace => ({ frame: 0, layerId: 'shirt', selection: [], pixelMask: null, ...o });
const run = (doc: Doc, where: Parameters<typeof scopeOf>[1], p: RecolourPlace, opts: Parameters<typeof recolourDoc>[3] = {}) => recolourDoc(doc, '#ff0000', '#00ff00', { ...opts, scope: scopeOf(doc, where, p) });

describe('recolour: where it reaches', () => {
  it('everything is as it always was: no scope, every drawing, swatches, stage and effects', () => {
    const { doc } = sample();
    expect(scopeOf(doc, 'all', place())).toBeNull();
    const r = run(doc, 'all', place(), { background: true });
    expect(r.drawings.sort()).toEqual(['px', 's0', 's2', 'w0', 'w2']);
    expect(r.doc.swatches[0].color).toBe('#00ff00');
    expect(r.doc.background).toBe('#00ff00');
    expect(r.doc.layers.slice(0, 2).map((l) => l.effects![0].values.color)).toEqual(['#00ff00', '#00ff00']);
  });

  it('this layer: every frame of that layer and its effects, nothing else', () => {
    const { doc } = sample();
    const r = run(doc, 'layer', place({ layerId: 'shirt' }), { background: true });
    expect(r.drawings.sort()).toEqual(['s0', 's2']);
    expect(colourOf(r.doc, 's0')).toBe('#00ff00');
    expect(colourOf(r.doc, 's2')).toBe('#00ff00');
    expect(colourOf(r.doc, 'w0')).toBe('#ff0000');
    expect(r.doc.layers.find((l) => l.id === 'shirt')!.effects![0].values.color).toBe('#00ff00');
    expect(r.doc.layers.find((l) => l.id === 'wall')!.effects![0].values.color).toBe('#ff0000');
    // The whole animation's own things stay.
    expect(r.doc.swatches[0].color).toBe('#ff0000');
    expect(r.doc.background).toBe('#ff0000');
  });

  it('this layer on a pixel layer changes its pixels', () => {
    const { doc } = sample();
    const r = run(doc, 'layer', place({ layerId: 'dots' }));
    expect(r.drawings).toEqual(['px']);
    expect([...(r.doc.drawings.px as { pixels: Uint8ClampedArray }).pixels.slice(0, 8)]).toEqual([0, 255, 0, 255, 0, 0, 255, 255]);
  });

  it('this frame: the drawing showing on each layer at that frame, a held drawing changing on all its frames', () => {
    const { doc } = sample();
    const r = run(doc, 'frame', place({ frame: 3 }));
    expect(r.drawings.sort()).toEqual(['px', 's2', 'w2']);
    expect(colourOf(r.doc, 's0')).toBe('#ff0000');
    // Frame 2 and 3 share one key, so frame 2 changes too: that is what a key is.
    expect(colourOf(r.doc, 's2')).toBe('#00ff00');
    expect(r.doc.swatches[0].color).toBe('#ff0000');
  });

  it('the selection: only the selected shapes', () => {
    const { doc } = sample();
    const p = place({ selection: ['b'] });
    const r = run(doc, 'selection', p);
    expect(r.drawings).toEqual(['s0']);
    expect(colourOf(r.doc, 's0', 0)).toBe('#ff0000');
    expect(colourOf(r.doc, 's0', 1)).toBe('#00ff00');
    expect(colourOf(r.doc, 'w0')).toBe('#ff0000');
  });

  it('the selection finds shapes on any layer, but only at this frame', () => {
    const { doc } = sample();
    const r = run(doc, 'selection', place({ frame: 0, selection: ['d', 'e'] }));
    expect(r.drawings).toEqual(['w0']);
  });

  it('the selection: only the selected pixels of the pixel layer you are on', () => {
    const { doc } = sample();
    // Both pixels are painted; only the first is in the selection.
    const mask = rectMask(8, 8, 0, 0, 0, 0);
    const r = recolourDoc(doc, '#0000ff', '#00ff00', { scope: scopeOf(doc, 'selection', place({ layerId: 'dots', pixelMask: mask })) });
    expect(r.pixels).toBe(0);
    const both = rectMask(8, 8, 0, 0, 1, 0);
    const r2 = recolourDoc(doc, '#0000ff', '#00ff00', { scope: scopeOf(doc, 'selection', place({ layerId: 'dots', pixelMask: both })) });
    expect(r2.pixels).toBe(1);
    const r3 = recolourDoc(doc, '#ff0000', '#00ff00', { scope: scopeOf(doc, 'selection', place({ layerId: 'dots', pixelMask: mask })) });
    expect([...(r3.doc.drawings.px as { pixels: Uint8ClampedArray }).pixels.slice(0, 8)]).toEqual([0, 255, 0, 255, 0, 0, 255, 255]);
  });

  it('the selection with a block of pixels that does not start at the corner', () => {
    const { doc, dots } = sample();
    const block = newPixelDrawing(2, 1);
    block.id = 'blk';
    block.x = 3;
    block.y = 2;
    block.pixels.set([255, 0, 0, 255, 255, 0, 0, 255]);
    doc.drawings.blk = block;
    dots.cels = [{ id: 'c5', start: 0, length: 4, drawingId: 'blk' }];
    // Selects only the second pixel of the block, which sits at (4, 2) on the grid.
    const r = recolourDoc(doc, '#ff0000', '#00ff00', { scope: scopeOf(doc, 'selection', place({ layerId: 'dots', pixelMask: rectMask(8, 8, 4, 2, 4, 2) })) });
    expect(r.pixels).toBe(1);
    expect([...(r.doc.drawings.blk as { pixels: Uint8ClampedArray }).pixels]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it('applies as one change that only touches what the scope reached', () => {
    const { doc } = sample();
    const r = run(doc, 'layer', place({ layerId: 'shirt' }), { background: true });
    const target = structuredClone(doc);
    applyRecolour(target, r);
    expect(colourOf(target, 's0')).toBe('#00ff00');
    expect(colourOf(target, 'w0')).toBe('#ff0000');
    expect(target.background).toBe('#ff0000');
    expect(target.swatches[0].color).toBe('#ff0000');
    expect(target.layers.find((l) => l.id === 'wall')!.effects![0].values.color).toBe('#ff0000');
  });

  it('close colours still count inside a scope', () => {
    const { doc } = sample();
    (doc.drawings.s0 as VectorDrawing).shapes.push(fill('n', '#fa0a00'));
    const r = recolourDoc(doc, '#ff0000', '#00ff00', { closeness: 30, scope: scopeOf(doc, 'layer', place()) });
    expect(colourOf(r.doc, 's0', 2)).not.toBe('#fa0a00');
    expect(colourOf(r.doc, 'w0')).toBe('#ff0000');
  });
});

describe('recolour: what the dialog offers', () => {
  it('lists only the colours in that part', () => {
    const { doc } = sample();
    (doc.drawings.w0 as VectorDrawing).shapes.push(fill('z', '#123456'));
    expect(usedColours(doc)).toContain('#123456');
    expect(usedColours(doc, 32, scopeOf(doc, 'layer', place({ layerId: 'shirt' })))).not.toContain('#123456');
    expect(usedColours(doc, 32, scopeOf(doc, 'layer', place({ layerId: 'wall' })))).toContain('#123456');
    expect(usedColours(doc, 32, scopeOf(doc, 'selection', place({ selection: ['z'] })))).toEqual(['#123456']);
  });

  it('knows when there is a selection to use', () => {
    expect(hasRecolourSelection(place())).toBe(false);
    expect(hasRecolourSelection(place({ selection: ['a'] }))).toBe(true);
    expect(hasRecolourSelection(place({ pixelMask: rectMask(4, 4, 1, 1, 2, 2) }))).toBe(true);
  });

  it('says what will change in plain words', () => {
    const { doc } = sample();
    expect(whereNote('all', doc, place())).toBe('Every frame and every layer, and the swatches.');
    expect(whereNote('layer', doc, place(), 'Shirt')).toBe('Every frame of Shirt, and its effects.');
    expect(whereNote('frame', doc, place({ frame: 0 }))).toBe('Frame 1, on every layer. A drawing held for several frames changes on all of them.');
    expect(whereNote('selection', doc, place())).toBe('Only the shapes or pixels you have selected.');
  });
});

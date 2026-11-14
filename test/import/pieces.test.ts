import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelLayer, uid } from '../../src/core/doc';
import type { PathShape, PixelDrawing, TextShape } from '../../src/core/format';
import { addPieces, centreOn, docFromPieces, fitScale, mapShape, shiftDrawing, vectorPieces, MAX_SIDE, STILL_LENGTH, type Pieces } from '../../src/import/pieces';
import { hasDrawing } from '../../src/import/where';

const path = (x: number, y: number): PathShape => ({ id: 's', type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + 10, y, c1: { x: x + 3, y: y - 4 }, c2: { x: x + 7, y: y - 4 } }] }], fill: '#ff0000', stroke: { color: '#000000', width: 2, join: 'round', cap: 'butt' }, opacity: 1, fillGradient: { kind: 'linear', stops: [{ at: 0, color: '#fff' }, { at: 1, color: '#000' }], from: { x, y }, to: { x: x + 10, y: y + 10 } } });

describe('fitting a drawing onto a stage', () => {
  it('only makes it smaller, never bigger', () => {
    expect(fitScale(100, 50, { width: 400, height: 400 })).toBe(1);
    expect(fitScale(800, 400, { width: 400, height: 400 })).toBe(0.5);
    expect(fitScale(400, 1000, { width: 400, height: 500 })).toBe(0.5);
  });

  it('moves and scales points, curves, line width, gradients and text together', () => {
    const s = mapShape(path(10, 20), 2, 5, 7) as PathShape;
    expect(s.paths[0].points[1]).toMatchObject({ x: 45, y: 47, c1: { x: 31, y: 39 }, c2: { x: 39, y: 39 } });
    expect(s.stroke!.width).toBe(4);
    expect(s.fillGradient!.from).toEqual({ x: 25, y: 47 });
    expect(s.fillGradient!.to).toEqual({ x: 45, y: 67 });
    const t = mapShape({ id: 't', type: 'text', text: 'a', font: 'x', size: 10, weight: 400, color: '#000', align: 'left', opacity: 1, transform: { x: 10, y: 10, scaleX: 1, scaleY: 1.5, rotation: 0, skew: 0 } } as TextShape, 2, 1, 1) as TextShape;
    expect(t.transform).toMatchObject({ x: 21, y: 21, scaleX: 2, scaleY: 3 });
  });

  it('puts vector layers on a drawing of their own at the size they were drawn', () => {
    const p = vectorPieces([{ name: 'A', visible: true, shapes: [path(0, 0)] }, { name: 'B', visible: false, shapes: [] }], { width: 300, height: 200 }, { length: 12 });
    expect([p.width, p.height, p.scale]).toEqual([300, 200, undefined]);
    expect(p.layers.map((l) => [l.name, l.kind, l.visible])).toEqual([['A', 'vector', true], ['B', 'vector', false]]);
    expect(p.layers[0].cels[0]).toMatchObject({ start: 0, length: 12 });
    expect(Object.keys(p.drawings)).toHaveLength(2);
  });

  it('makes a huge drawing smaller for a drawing of its own, and says how much', () => {
    const p = vectorPieces([{ name: 'A', visible: true, shapes: [path(0, 0)] }], { width: 8192, height: 4096 }, { length: 1 });
    expect([p.width, p.height]).toEqual([MAX_SIDE, 2048]);
    expect(p.scale).toBe(0.5);
    const d = Object.values(p.drawings)[0];
    expect(d.kind === 'vector' && (d.shapes[0] as PathShape).paths[0].points[1].x).toBe(5);
  });

  it('centres on the open drawing, and fits it in when it is bigger', () => {
    const p = vectorPieces([{ name: 'A', visible: true, shapes: [path(0, 0)] }], { width: 100, height: 100 }, { stage: { width: 300, height: 200 }, length: 24 });
    expect([p.width, p.height]).toEqual([300, 200]);
    const d = Object.values(p.drawings)[0];
    expect(d.kind === 'vector' && (d.shapes[0] as PathShape).paths[0].points[0]).toEqual({ x: 100, y: 50 });
    const big = vectorPieces([{ name: 'A', visible: true, shapes: [path(0, 0)] }], { width: 600, height: 400 }, { stage: { width: 300, height: 200 }, length: 24 });
    expect(big.scale).toBe(0.5);
  });
});

describe('pixel pieces on a stage', () => {
  const drawing = (x: number, y: number, w: number, h: number): PixelDrawing => ({ id: uid('p'), kind: 'pixel', x, y, width: w, height: h, pixels: new Uint8ClampedArray(w * h * 4).fill(255) });

  it('shifts a drawing and cuts it at the edge, dropping it when nothing is left', () => {
    const d = drawing(0, 0, 4, 4);
    expect(shiftDrawing(d, 2, 2, 10, 10)).toMatchObject({ x: 2, y: 2, width: 4, height: 4 });
    const cut = shiftDrawing(d, -2, -2, 10, 10)!;
    expect([cut.x, cut.y, cut.width, cut.height]).toEqual([undefined, undefined, 2, 2]);
    expect(shiftDrawing(d, 20, 0, 10, 10)).toBeNull();
    const edge = shiftDrawing(d, 8, 8, 10, 10)!;
    expect([edge.x, edge.y, edge.width, edge.height]).toEqual([8, 8, 2, 2]);
  });

  it('centres layers on the stage, and notices when edges were cut off', () => {
    const l = newPixelLayer('L', 1);
    const d = drawing(0, 0, 4, 4);
    l.cels.push({ id: 'c', start: 0, length: 5, drawingId: d.id });
    const pieces: Pieces = { width: 4, height: 4, layers: [l], drawings: { [d.id]: d }, folders: {} };
    const c = centreOn(pieces, { width: 10, height: 8 });
    expect(c.cutOff).toBe(false);
    expect(Object.values(c.pieces.drawings)[0]).toMatchObject({ x: 3, y: 2, width: 4, height: 4 });
    const small = centreOn(pieces, { width: 2, height: 2 });
    expect(small.cutOff).toBe(true);
    expect(Object.values(small.pieces.drawings)[0]).toMatchObject({ width: 2, height: 2 });
  });
});

describe('becoming a drawing', () => {
  it('makes a new drawing the size of the pieces, with their layers', () => {
    const p = vectorPieces([{ name: 'A', visible: true, shapes: [path(0, 0)] }], { width: 300, height: 200 }, { length: STILL_LENGTH });
    const doc = docFromPieces(p, 'logo');
    expect([doc.name, doc.width, doc.height, doc.length, doc.background]).toEqual(['logo', 300, 200, STILL_LENGTH, null]);
    expect(doc.layers.map((l) => l.name)).toEqual(['A']);
    expect(Object.keys(doc.drawings)).toHaveLength(1);
    expect(hasDrawing(doc)).toBe(true);
  });

  it('adds layers on top of an open drawing, leaving what was there', () => {
    const base = newDoc({ width: 300, height: 200 });
    expect(hasDrawing(base)).toBe(false);
    const p = vectorPieces([{ name: 'New', visible: true, shapes: [path(0, 0)] }], { width: 100, height: 100 }, { stage: { width: 300, height: 200 }, length: base.length });
    const next = produce(base, (d) => addPieces(d, p));
    expect(next.layers.map((l) => l.name)).toEqual(['Layer 1', 'New']);
    expect(Object.keys(next.drawings)).toHaveLength(1);
    expect(base.layers).toHaveLength(1);
  });
});

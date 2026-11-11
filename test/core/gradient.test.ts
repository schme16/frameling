import { describe, expect, it } from 'vitest';
import type { Gradient } from '../../src/core/format';
import { blendGradient, cleanGradients, colorAt, mapGradient, placeGradient, readGradient, recolourGradient, styleOf } from '../../src/core/gradient';

const g: Gradient = { kind: 'linear', stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }], from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };

describe('gradients', () => {
  it('finds the colour part way along, alpha included', () => {
    expect(colorAt(g.stops, 0.5)).toBe('#808080');
    expect(colorAt(g.stops, -1)).toBe('#000000');
    expect(colorAt([{ at: 0, color: '#ff000000' }, { at: 1, color: '#ff0000' }], 0.5)).toBe('#ff000080');
  });

  it('lays a style over a box edge to edge, linear and radial', () => {
    const lin = placeGradient({ kind: 'linear', stops: g.stops, angle: 0 }, { x0: 10, y0: 20, x1: 110, y1: 60 });
    expect(lin.from).toEqual({ x: 10, y: 40 });
    expect(lin.to).toEqual({ x: 110, y: 40 });
    const down = placeGradient({ kind: 'linear', stops: g.stops, angle: 90 }, { x0: 10, y0: 20, x1: 110, y1: 60 });
    expect(down.from.y).toBeCloseTo(20);
    expect(down.to.y).toBeCloseTo(60);
    const rad = placeGradient({ kind: 'radial', stops: g.stops, angle: 0 }, { x0: 0, y0: 0, x1: 100, y1: 40 });
    expect(rad.from).toEqual({ x: 50, y: 20 });
    expect(rad.to).toEqual({ x: 100, y: 20 });
    expect(styleOf(down).angle).toBe(90);
  });

  it('moves with the shape and keeps its colours', () => {
    const m = mapGradient(g, (p) => ({ x: p.x * 2 + 5, y: p.y }));
    expect(m.to).toEqual({ x: 205, y: 0 });
    expect(m.stops).toEqual(g.stops);
  });

  it('reads only sound gradients from a file', () => {
    expect(readGradient(g)).toEqual(g);
    expect(readGradient({ ...g, kind: 'conic' })).toBeUndefined();
    expect(readGradient({ ...g, stops: [] })).toBeUndefined();
    expect(readGradient({ ...g, from: { x: 'a', y: 0 } })).toBeUndefined();
    expect(readGradient({ ...g, stops: [{ at: 2, color: '#fff' }, { at: 0.5, color: '#000' }] })!.stops.map((s) => s.at)).toEqual([0.5, 1]);
    const bad = cleanGradients({ type: 'path', fillGradient: { kind: 'nope' }, strokeGradient: g } as Record<string, unknown>);
    expect('fillGradient' in bad).toBe(false);
    expect(bad.strokeGradient).toEqual(g);
  });

  it('blends matching gradients in a tween, and swaps unmatched ones halfway', () => {
    const b: Gradient = { ...g, stops: [{ at: 0, color: '#ffffff' }, { at: 1, color: '#000000' }], to: { x: 0, y: 100 } };
    const mid = blendGradient(g, b, 0.5)!;
    expect(mid.stops[0].color).toBe('#808080');
    expect(mid.to).toEqual({ x: 50, y: 50 });
    const radial: Gradient = { ...g, kind: 'radial' };
    expect(blendGradient(g, radial, 0.4)).toBe(g);
    expect(blendGradient(g, radial, 0.6)).toBe(radial);
    expect(blendGradient(g, undefined, 0.7)).toBeUndefined();
  });

  it('recolours stops, and hands back the same object when nothing changed', () => {
    expect(recolourGradient(g, (c) => c)).toBe(g);
    expect(recolourGradient(g, (c) => (c === '#000000' ? '#ff0000' : c)).stops[0].color).toBe('#ff0000');
  });
});

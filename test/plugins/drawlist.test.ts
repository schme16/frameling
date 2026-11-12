import { describe, expect, it } from 'vitest';
import { DRAW_LIMITS, drawDrawList, drawListToShapes, placeholderShapes, plainProps, sanitizeDrawList } from '../../src/plugins/drawlist';

describe('draw lists', () => {
  it('keeps what Frameling knows and drops the rest, never throwing', () => {
    const list = sanitizeDrawList([
      { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, stroke: '#ff0000' },
      { type: 'line', x1: 0, y1: 0, x2: NaN, y2: 1 },
      { type: 'rect', x: 1, y: 2, w: 3, h: 4, fill: 'red' },
      { type: 'script', src: 'alert(1)' },
      { type: 'polygon', points: [[0, 0], [1, 1], ['x', 2]] },
      { type: 'path', d: [['M', 0, 0], ['L', 5, 5], ['Q', 1, 1, 2, 2], ['Z'], ['X', 1]] },
      { type: 'text', x: 1, y: 1, text: 'hi\u0000there' },
      'nope',
      null,
    ]);
    expect(list.map((i) => i.type)).toEqual(['line', 'rect', 'polygon', 'path', 'text']);
    expect(list[1]).not.toHaveProperty('fill');
    expect((list[3] as { d: unknown[] }).d).toHaveLength(4);
    expect(list[4]).toMatchObject({ text: 'hi there' });
    expect(sanitizeDrawList('not a list')).toEqual([]);
    expect(sanitizeDrawList(undefined)).toEqual([]);
  });

  it('is limited in how many items, points and how far out', () => {
    expect(sanitizeDrawList(Array.from({ length: 5000 }, () => ({ type: 'rect', x: 0, y: 0, w: 1, h: 1 }))).length).toBe(DRAW_LIMITS.items);
    expect(sanitizeDrawList([{ type: 'rect', x: 1e9, y: 0, w: 1, h: 1 }])).toEqual([]);
    const big = sanitizeDrawList([{ type: 'polygon', points: Array.from({ length: 50000 }, (_, i) => [i, i]) }]);
    expect((big[0] as { points: unknown[] }).points.length).toBe(DRAW_LIMITS.points);
  });

  it('draws on a canvas context, widths in screen pixels staying the same size at any zoom', () => {
    const calls: string[] = [];
    const g = new Proxy({ lineWidth: 0 } as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => void calls.push(`${k}(${a.join(',')})`)),
      set: (t, k: string, v) => ((t[k] = v), calls.push(`${k}=${v}`), true),
    }) as unknown as CanvasRenderingContext2D;
    drawDrawList(g, sanitizeDrawList([{ type: 'line', x1: 0, y1: 0, x2: 4, y2: 4, stroke: '#00ff00', width: 2, screen: true, dash: [4, 2] }, { type: 'rect', x: 0, y: 0, w: 2, h: 2, fill: '#0000ff' }]), 4);
    expect(calls).toContain('lineWidth=0.5');
    expect(calls).toContain('setLineDash(1,0.5)');
    expect(calls).toContain('fillStyle=#0000ff');
    expect(calls.filter((c) => c === 'save()').length).toBe(2);
    expect(calls.filter((c) => c === 'restore()').length).toBe(2);
  });

  it('becomes ordinary path shapes: fills, outlines, curves and holes of their own', () => {
    let n = 0;
    const shapes = drawListToShapes(
      sanitizeDrawList([
        { type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#ff0000', stroke: '#000000', width: 3 },
        { type: 'ellipse', cx: 5, cy: 5, rx: 4, ry: 2, fill: '#00ff00' },
        { type: 'line', x1: 0, y1: 0, x2: 9, y2: 9 },
        { type: 'path', d: [['M', 0, 0], ['Q', 5, 0, 5, 5], ['C', 5, 7, 7, 9, 9, 9], ['Z']] },
        { type: 'text', x: 0, y: 0, text: 'left out' },
      ]),
      () => `s${n++}`,
    );
    expect(shapes).toHaveLength(4);
    expect(shapes[0]).toMatchObject({ type: 'path', fill: '#ff0000', stroke: { color: '#000000', width: 3 } });
    expect(shapes[1].fill).toBe('#00ff00');
    expect(shapes[1].stroke).toBeNull();
    // A line has no inside; with nothing said it is a thin black outline.
    expect(shapes[2]).toMatchObject({ fill: null, stroke: { color: '#000000', width: 1 } });
    expect(shapes[3].paths[0].closed).toBe(true);
    expect(shapes[3].paths[0].points[1].c1).toBeDefined();
  });

  it('has a placeholder to stand in when there is nothing to draw', () => {
    expect(placeholderShapes({ x: 0, y: 0, w: 10, h: 10 }, () => 'p').length).toBe(2);
  });

  it('only accepts plain settings for a shape, not too deep or too big', () => {
    expect(plainProps({ a: 1, b: [1, 2, { c: 'x' }] })).toEqual({ a: 1, b: [1, 2, { c: 'x' }] });
    expect(plainProps(undefined)).toEqual({});
    expect(plainProps([1])).toBeNull();
    expect(plainProps({ s: 'x'.repeat(70000) })).toBeNull();
    let deep: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) deep = { d: deep };
    expect(plainProps(deep)).toBeNull();
    expect(plainProps(JSON.parse('{"__proto__": {"x": 1}, "ok": 1}'))).toEqual({ ok: 1 });
  });
});

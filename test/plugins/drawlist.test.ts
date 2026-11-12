import { describe, expect, it } from 'vitest';
import { DRAW_LIMITS, drawDrawList, drawListToShapes, handleAt, placeholderShapes, plainProps, sanitizeDrawList } from '../../src/plugins/drawlist';
import type { PathShape, TextShape } from '../../src/core/format';

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
        { type: 'handle', id: 'h', x: 1, y: 1 },
      ]),
      () => `s${n++}`,
    ) as PathShape[];
    // The handle is only for tool previews: it never becomes part of a drawing.
    expect(shapes).toHaveLength(4);
    expect(shapes[0]).toMatchObject({ type: 'path', fill: '#ff0000', stroke: { color: '#000000', width: 3 } });
    expect(shapes[1].fill).toBe('#00ff00');
    expect(shapes[1].stroke).toBeNull();
    // A line has no inside; with nothing said it is a thin black outline.
    expect(shapes[2]).toMatchObject({ fill: null, stroke: { color: '#000000', width: 1 } });
    expect(shapes[3].paths[0].closed).toBe(true);
    expect(shapes[3].paths[0].points[1].c1).toBeDefined();
  });

  it('text becomes a text shape at the same spot, in an installed font or else Nunito', () => {
    const shapes = drawListToShapes(sanitizeDrawList([{ type: 'text', x: 10, y: 20, text: 'Hi', size: 30, font: 'Inter', weight: 640, italic: true, fill: '#ff0000', align: 'center' }, { type: 'text', x: 0, y: 0, text: 'x', font: 'No Such Font 9' }, { type: 'text', x: 0, y: 0, text: '  ' }]), () => 'id') as TextShape[];
    expect(shapes).toHaveLength(2);
    expect(shapes[0]).toMatchObject({ type: 'text', text: 'Hi', font: 'Inter', size: 30, weight: 600, italic: true, color: '#ff0000', align: 'center', transform: { x: 10, y: 20 } });
    expect(shapes[1].font).toBe('Nunito');
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

describe('fonts in draw lists', () => {
  const ctx = (calls: string[]) =>
    new Proxy({ lineWidth: 0 } as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : () => undefined),
      set: (t, k: string, v) => ((t[k] = v), k === 'font' && calls.push(String(v)), true),
    }) as unknown as CanvasRenderingContext2D;

  it('keeps a plain font name, weight and italic, and drops anything that could be more than a name', () => {
    const [a, b, c] = sanitizeDrawList([
      { type: 'text', x: 0, y: 0, text: 'a', font: ' Georgia ', weight: 1234, italic: true },
      { type: 'text', x: 0, y: 0, text: 'b', font: 'x"; background:url(//evil)', weight: 'bold', italic: 'yes' },
      { type: 'text', x: 0, y: 0, text: 'c', font: 'F'.repeat(80) },
    ]) as { font?: string; weight?: number; italic?: boolean }[];
    expect(a).toMatchObject({ font: 'Georgia', weight: 900, italic: true });
    expect(b.font).toBeUndefined();
    expect(b.weight).toBeUndefined();
    expect(b.italic).toBeUndefined();
    expect(c.font).toBeUndefined();
  });

  it('draws with the shipped font when it is asked for, and plain sans-serif for one that is not here', () => {
    const calls: string[] = [];
    drawDrawList(ctx(calls), sanitizeDrawList([{ type: 'text', x: 0, y: 0, text: 'a', size: 20, font: 'inter', weight: 700 }, { type: 'text', x: 0, y: 0, text: 'b', size: 20, font: 'Not Installed Anywhere' }, { type: 'text', x: 0, y: 0, text: 'c' }]));
    expect(calls[0]).toBe("700 20px 'Inter Variable', 'Inter', sans-serif");
    expect(calls[1]).toBe('400 20px sans-serif');
    expect(calls[2]).toBe('400 12px sans-serif');
  });
});

describe('handles in draw lists', () => {
  it('keeps handles with a plain id, once each, at most the limit, and a size kept sensible', () => {
    const list = sanitizeDrawList([
      { type: 'handle', id: 'a', x: 1, y: 2, size: 500, shape: 'circle', fill: '#ffffff' },
      { type: 'handle', id: 'a', x: 5, y: 5 },
      { type: 'handle', id: 'bad id!', x: 1, y: 1 },
      { type: 'handle', x: 1, y: 1 },
      { type: 'handle', id: 'z', x: NaN, y: 1 },
      { type: 'handle', id: 'b', x: 3, y: 4, shape: 'star' },
    ]);
    expect(list).toEqual([
      { type: 'handle', id: 'a', x: 1, y: 2, size: 40, shape: 'circle', fill: '#ffffff' },
      { type: 'handle', id: 'b', x: 3, y: 4 },
    ]);
    const many = sanitizeDrawList(Array.from({ length: 200 }, (_, i) => ({ type: 'handle', id: `h${i}`, x: i, y: 0 })));
    expect(many).toHaveLength(DRAW_LIMITS.handles);
  });

  it('finds the handle under a point, as easy to grab at any zoom, the top one first', () => {
    const list = sanitizeDrawList([
      { type: 'handle', id: 'under', x: 100, y: 100 },
      { type: 'handle', id: 'over', x: 101, y: 100 },
      { type: 'handle', id: 'far', x: 300, y: 100, size: 20 },
      { type: 'line', x1: 0, y1: 0, x2: 1, y2: 1 },
    ]);
    expect(handleAt(list, 100, 100, 1)).toBe('over');
    expect(handleAt(list, 200, 100, 1)).toBeNull();
    // Zoomed out 10x, 8 screen pixels is 80 stage pixels; zoomed in 10x, only 0.8.
    expect(handleAt(list, 140, 100, 0.1)).toBe('over');
    expect(handleAt(list, 102.5, 100, 10)).toBeNull();
    expect(handleAt(list, 300, 109, 1)).toBe('far');
    expect(handleAt([], 0, 0, 1)).toBeNull();
  });

  it('draws as a small shape of a fixed size on screen', () => {
    const calls: string[] = [];
    const g = new Proxy({ lineWidth: 0 } as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => void calls.push(`${k}(${a.map((v) => Math.round(Number(v) * 100) / 100).join(',')})`)),
      set: (t, k: string, v) => ((t[k] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    drawDrawList(g, sanitizeDrawList([{ type: 'handle', id: 'a', x: 50, y: 50, shape: 'circle', size: 10 }]), 5);
    expect(calls).toContain('arc(50,50,1,0,6.28)');
    calls.length = 0;
    drawDrawList(g, sanitizeDrawList([{ type: 'handle', id: 'a', x: 50, y: 50, size: 10 }]), 5, 'a');
    expect(calls).toContain('rect(48.75,48.75,2.5,2.5)');
  });
});

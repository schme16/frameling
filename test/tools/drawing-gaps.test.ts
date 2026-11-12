// The pen, polygon and star, clean pencil lines, gradients in the colour boxes and the recolour.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Doc, FillShape, PathShape } from '../../src/core/format';
import { newDoc, newPixelDrawing } from '../../src/core/doc';
import { store } from '../../src/core/store';
import { CLOSE_ENTER_MS, constrain45, enterEndsClosing, PenPath, penShape, penTool } from '../../src/tools/pen';
import { fitPoints, makePolyStar, polyPoints, polygonTool, starTool } from '../../src/tools/polystar';
import { cleanLineShape, fitCleanLine } from '../../src/tools/cleanLine';
import { pointsTool, resetPointsTool } from '../../src/tools/points';
import { gradientTool } from '../../src/tools/gradient-tool';
import { applyGradientToSelection, setPaintKind, setStopColor, addStop, removeStop, withWellGradients } from '../../src/tools/gradient-wells';
import { recolourDoc, usedColours } from '../../src/tools/recolour';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { pencilTool } from '../../src/tools/pencil';
import { addShapes, box, ctx, drag, ptr, shapesNow, vectorStore } from './helpers';

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  vectorStore();
  setPaintKind('fill', 'solid');
  setPaintKind('stroke', 'solid');
});

const key = (k: string) => ({ key: k }) as KeyboardEvent;

describe('pen', () => {
  it('keeps new points to 45 degree steps', () => {
    const p = constrain45({ x: 0, y: 0 }, { x: 100, y: 8 });
    expect(p.y).toBeCloseTo(0);
    const d = constrain45({ x: 0, y: 0 }, { x: 50, y: 45 });
    expect(d.x).toBeCloseTo(d.y);
  });

  it('makes corners from clicks and curves from drags', () => {
    const p = new PenPath();
    p.add({ x: 0, y: 0 });
    p.add({ x: 100, y: 0 });
    p.pull({ x: 120, y: 20 }, false);
    expect(p.anchors[1].hout).toEqual({ x: 120, y: 20 });
    expect(p.anchors[1].hin).toEqual({ x: 80, y: -20 });
    const sp = p.subPath(false)!;
    expect(sp.points[1].c2).toEqual({ x: 80, y: -20 });
    // Alt: only the side the pointer is on.
    p.add({ x: 200, y: 0 });
    p.pull({ x: 220, y: 0 }, true);
    expect(p.anchors[2].hin).toBeUndefined();
  });

  it('closes a shape with fill and stroke; an open line is all stroke', () => {
    const closed = penShape({ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }] }, { fill: '#ff0000', stroke: '#000000', line: '#000000' }, 3)!;
    expect(closed.fill).toBe('#ff0000');
    expect(closed.stroke?.width).toBe(3);
    const open = penShape({ closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }, { fill: '#ff0000', stroke: null, line: '#123456' }, 3)!;
    expect(open.fill).toBeNull();
    expect(open.stroke?.color).toBe('#123456');
    expect(penShape({ closed: true, points: [] }, { fill: null, stroke: null, line: '#000' }, 1)).toBeNull();
  });

  it('draws a closed shape by clicking back on the first point, as one undo step', () => {
    const c = ctx();
    const click = (x: number, y: number, time: number) => {
      penTool.down!(ptr(x, y, { time }), c);
      penTool.up!(ptr(x, y, { time }), c);
    };
    click(10, 10, 0);
    click(100, 10, 1000);
    click(60, 90, 2000);
    click(10, 10, 3000);
    const s = shapesNow();
    expect(s.length).toBe(1);
    expect((s[0] as PathShape).paths[0].closed).toBe(true);
    expect((s[0] as PathShape).paths[0].points.length).toBe(3);
  });

  it('finishes an open line on Enter, and Backspace takes back a point', () => {
    const c = ctx();
    for (const [x, t] of [[10, 0], [60, 1000], [120, 2000]] as const) {
      penTool.down!(ptr(x, 50, { time: t }), c);
      penTool.up!(ptr(x, 50, { time: t }), c);
    }
    expect(penTool.onKey!(key('Backspace'), c)).toBe(true);
    expect(penTool.onKey!(key('Enter'), c)).toBe(true);
    const s = shapesNow()[0] as PathShape;
    expect(s.paths[0].closed).toBe(false);
    expect(s.paths[0].points.length).toBe(2);
    // With nothing in progress the keys go to the rest of the app.
    expect(penTool.onKey!(key('Delete'), c)).toBe(false);
  });
});

describe('pen: Enter after closing a shape', () => {
  afterEach(() => vi.restoreAllMocks());
  const closeShape = (c: ReturnType<typeof ctx>) => {
    const click = (x: number, y: number, time: number) => {
      penTool.down!(ptr(x, y, { time }), c);
      penTool.up!(ptr(x, y, { time }), c);
    };
    click(10, 10, 0);
    click(100, 10, 1000);
    click(60, 90, 2000);
    click(10, 10, 3000);
  };

  it('takes the Enter that follows a closed shape, so it never starts Play', () => {
    const c = ctx();
    let now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    closeShape(c);
    expect(shapesNow().length).toBe(1);
    now += 400;
    expect(penTool.onKey!(key('Enter'), c)).toBe(true);
    // The shape is untouched, and there is still exactly one.
    expect(shapesNow().length).toBe(1);
    expect((shapesNow()[0] as PathShape).paths[0].closed).toBe(true);
    // Only the one Enter is taken; the next goes to Play as usual.
    expect(penTool.onKey!(key('Enter'), c)).toBe(false);
  });

  it('leaves Enter to the rest of the app a while later, or after a new press', () => {
    const c = ctx();
    let now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    closeShape(c);
    now += CLOSE_ENTER_MS + 1;
    expect(penTool.onKey!(key('Enter'), c)).toBe(false);
    closeShape(c);
    penTool.down!(ptr(500, 500, { time: 9000 }), c);
    penTool.up!(ptr(500, 500, { time: 9000 }), c);
    penTool.onKey!(key('Escape'), c);
    expect(penTool.onKey!(key('Enter'), c)).toBe(false);
  });

  it('does not take other keys, and an open line ended with Enter does not take the next one', () => {
    const c = ctx();
    vi.spyOn(performance, 'now').mockImplementation(() => 10_000);
    closeShape(c);
    expect(penTool.onKey!(key('Delete'), c)).toBe(false);
    expect(penTool.onKey!(key('Escape'), c)).toBe(false);
    penTool.leave!(c);
    expect(penTool.onKey!(key('Enter'), c)).toBe(false);
    for (const [x, t] of [[10, 0], [60, 1000]] as const) {
      penTool.down!(ptr(x, 50, { time: t }), c);
      penTool.up!(ptr(x, 50, { time: t }), c);
    }
    expect(penTool.onKey!(key('Enter'), c)).toBe(true);
    expect(penTool.onKey!(key('Enter'), c)).toBe(false);
  });

  it('takes the held-down repeats of that Enter too, until a fresh press', () => {
    const c = ctx();
    let now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    closeShape(c);
    now += 300;
    const held = { key: 'Enter', repeat: true } as KeyboardEvent;
    expect(penTool.onKey!(key('Enter'), c)).toBe(true);
    now += CLOSE_ENTER_MS * 2;
    expect(penTool.onKey!(held, c)).toBe(true);
    expect(penTool.onKey!(held, c)).toBe(true);
    // Let go and press again: that one plays.
    expect(penTool.onKey!(key('Enter'), c)).toBe(false);
    expect(penTool.onKey!(held, c)).toBe(false);
  });

  it('knows how soon is soon', () => {
    expect(enterEndsClosing(-Infinity, 5)).toBe(false);
    expect(enterEndsClosing(100, 100 + CLOSE_ENTER_MS - 1)).toBe(true);
    expect(enterEndsClosing(100, 100 + CLOSE_ENTER_MS)).toBe(false);
  });
});

describe('polygon and star', () => {
  it('has the right number of corners, pointing up', () => {
    expect(polyPoints(6, null).length).toBe(6);
    expect(polyPoints(5, 0.5).length).toBe(10);
    expect(polyPoints(5, null)[0].y).toBeCloseTo(-1);
  });

  it('fills the box, or stays even inside it with Shift', () => {
    const pts = fitPoints(polyPoints(5, null), { x: 0, y: 0, w: 100, h: 50 }, false);
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(0);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(50);
    const even = fitPoints(polyPoints(4, null), { x: 0, y: 0, w: 100, h: 50 }, true);
    const w = Math.max(...even.map((p) => p.x)) - Math.min(...even.map((p) => p.x));
    expect(w).toBeCloseTo(50);
  });

  it('draws with the tool settings', () => {
    setToolSettings({ starPoints: 7 });
    const s = makePolyStar('star', { x: 0, y: 0 }, { x: 80, y: 80 }, { shift: false, alt: false }, { fill: '#ff0', stroke: null })!;
    expect(s.paths[0].points.length).toBe(14);
    drag(polygonTool, ctx(), [[10, 10], [50, 40], [90, 90]]);
    drag(starTool, ctx(), [[100, 10], [190, 90]]);
    expect(shapesNow().length).toBe(2);
  });
});

describe('clean pencil lines', () => {
  it('fits a hand-drawn arc with a few even curves that stay on it', () => {
    const arc = Array.from({ length: 80 }, (_, i) => {
      const a = (i / 79) * Math.PI;
      return { x: 100 + Math.cos(a) * 60 + Math.sin(i * 7) * 0.3, y: 100 - Math.sin(a) * 60 };
    });
    const sp = fitCleanLine(arc, 1)!;
    expect(sp.closed).toBe(false);
    expect(sp.points.length).toBeLessThan(12);
    expect(sp.points[0].x).toBeCloseTo(160, 0);
  });

  it('keeps a sharp turn as a corner', () => {
    const v = [...Array.from({ length: 30 }, (_, i) => ({ x: i * 2, y: i * 2 })), ...Array.from({ length: 30 }, (_, i) => ({ x: 60 + i * 2, y: 58 - i * 2 }))];
    const s = cleanLineShape(v, '#000', 3)!;
    expect(s.stroke?.width).toBe(3);
    expect(s.fill).toBeNull();
    const corner = s.paths[0].points.find((p) => Math.abs(p.x - 58) < 4 && Math.abs(p.y - 58) < 4);
    expect(corner).toBeTruthy();
  });

  it('the pencil makes a stroked path in Clean line mode', () => {
    setToolSettings({ pencilClean: true });
    drag(pencilTool, ctx(), [[10, 10], [30, 25], [60, 30], [90, 60]]);
    const s = shapesNow()[0];
    expect(s.type).toBe('path');
  });
});

describe('edit points', () => {
  it('moves a point by dragging it, as one undo step', () => {
    resetPointsTool();
    addShapes(box('b', 0, 0, 100, 100));
    const c = ctx();
    pointsTool.down!(ptr(50, 50), c); // picks the shape
    drag(pointsTool, c, [[100, 0], [110, -5], [120, -10]]);
    const s = shapesNow()[0] as PathShape;
    expect(s.paths[0].points.some((p) => p.x === 120 && p.y === -10)).toBe(true);
    store().undo();
    expect((shapesNow()[0] as PathShape).paths[0].points.some((p) => p.x === 100 && p.y === 0)).toBe(true);
  });

  it('adds a point on a line and deletes it with Delete', () => {
    resetPointsTool();
    addShapes(box('b', 0, 0, 100, 100));
    const c = ctx();
    pointsTool.down!(ptr(50, 50), c);
    pointsTool.down!(ptr(50, 0), c);
    pointsTool.up!(ptr(50, 0), c);
    expect((shapesNow()[0] as PathShape).paths[0].points.length).toBe(5);
    expect(pointsTool.onKey!(key('Delete'), c)).toBe(true);
    expect((shapesNow()[0] as PathShape).paths[0].points.length).toBe(4);
  });
});

describe('gradients in the colour boxes', () => {
  it('lays the fill gradient over a new shape, and keeps the box colour on its first colour', () => {
    setPaintKind('fill', 'linear');
    const s = withWellGradients(box('b', 0, 0, 100, 50));
    expect(s.fillGradient?.kind).toBe('linear');
    expect(s.fillGradient?.from.x).toBeCloseTo(0);
    expect(s.fillGradient?.to.x).toBeCloseTo(100);
    expect(store().get().ui.fillColor).toBe(s.fillGradient!.stops[0].color);
    setStopColor('fill', '#00ff00');
    expect(store().get().ui.fillColor).toBe('#00ff00');
  });

  it('adds and removes colours, keeping at least two', () => {
    setPaintKind('fill', 'radial');
    addStop('fill', 0.5);
    removeStop('fill', 0);
    removeStop('fill', 0);
    const s = withWellGradients(box('b', 0, 0, 10, 10));
    expect(s.fillGradient?.stops.length).toBe(2);
  });

  it('changes the selected shapes, and Solid takes the gradient off', () => {
    addShapes(box('b', 0, 0, 100, 50));
    store().setUi({ selection: ['b'], activeWell: 'fill' });
    setPaintKind('fill', 'linear');
    expect((shapesNow()[0] as PathShape).fillGradient).toBeTruthy();
    setPaintKind('fill', 'solid');
    applyGradientToSelection('fill');
    expect((shapesNow()[0] as PathShape).fillGradient).toBeUndefined();
  });

  it('the Gradient tool sets the direction by dragging across a shape', () => {
    addShapes(box('b', 0, 0, 100, 100));
    store().setUi({ activeWell: 'fill' });
    setPaintKind('fill', 'linear');
    drag(gradientTool, ctx(), [[10, 10], [50, 50], [90, 90]]);
    const g = (shapesNow()[0] as PathShape).fillGradient!;
    expect(g.from).toEqual({ x: 10, y: 10 });
    expect(g.to).toEqual({ x: 90, y: 90 });
  });
});

describe('recolour the whole animation', () => {
  function doc(): Doc {
    const d = newDoc({ width: 10, height: 10 });
    const px = newPixelDrawing(2, 1);
    px.pixels.set([255, 0, 0, 255, 250, 10, 0, 128]);
    const fill: FillShape = { id: 'f', type: 'fill', paths: [], color: '#ff0000', opacity: 1, gradient: { kind: 'linear', stops: [{ at: 0, color: '#ff0000' }, { at: 1, color: '#0000ff' }], from: { x: 0, y: 0 }, to: { x: 1, y: 0 } } };
    d.drawings = { v: { id: 'v', kind: 'vector', shapes: [fill, box('p', 0, 0, 1, 1, '#00ff00')] }, p: px };
    d.swatches = [{ id: 's', name: 'red', color: '#ff0000cc' }];
    return d;
  }

  it('swaps one colour everywhere: shapes, gradients, pixels and swatches, keeping see-through', () => {
    const before = doc();
    const r = recolourDoc(before, '#ff0000', '#00ffff');
    const f = (r.doc.drawings.v as { shapes: FillShape[] }).shapes[0];
    expect(f.color).toBe('#00ffff');
    expect(f.gradient!.stops[0].color).toBe('#00ffff');
    expect(f.gradient!.stops[1].color).toBe('#0000ff');
    expect(r.doc.swatches[0].color).toBe('#00ffffcc');
    const px = (r.doc.drawings.p as { pixels: Uint8ClampedArray }).pixels;
    expect([...px.slice(0, 4)]).toEqual([0, 255, 255, 255]);
    // The near colour stays as it was without "close colours too".
    expect([...px.slice(4, 8)]).toEqual([250, 10, 0, 128]);
    // Untouched shapes keep their objects, and the document it started from is unchanged.
    expect((r.doc.drawings.v as { shapes: unknown[] }).shapes[1]).toBe((before.drawings.v as { shapes: unknown[] }).shapes[1]);
    expect((before.drawings.v as { shapes: FillShape[] }).shapes[0].color).toBe('#ff0000');
    expect(r.pixels).toBe(1);
  });

  it('shifts close colours by the same amount', () => {
    const r = recolourDoc(doc(), '#ff0000', '#00ffff', { closeness: 30 });
    const px = (r.doc.drawings.p as { pixels: Uint8ClampedArray }).pixels;
    expect([...px.slice(4, 8)]).toEqual([0, 255, 255, 128]);
  });

  it('lists the colours used, most used first', () => {
    const c = usedColours(doc());
    expect(c).toContain('#ff0000');
    expect(c[0]).toBe('#ff0000');
  });
});

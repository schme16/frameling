// Picking a shape with a gradient shows that gradient in the Colours panel, and editing it changes the shape.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Gradient, PathShape } from '../../src/core/format';
import { sharedPaint } from '../../src/core/gradient';
import { store } from '../../src/core/store';
import { getGradientWells, endGradientGesture, followPick, matchSelectedGradients, moveStop, paintView, removeStop, addStop, setAngle, setPaintKind, setStopColor, selectStop, stopColor } from '../../src/tools/gradient-wells';
import { addShapes, box, shapesNow, vectorStore } from './helpers';

const grad = (a: string, b: string, kind: Gradient['kind'] = 'linear'): Gradient => ({ kind, stops: [{ at: 0, color: a }, { at: 1, color: b }], from: { x: 0, y: 0 }, to: { x: 100, y: 0 } });
const line = { color: '#1d1b26', width: 3, join: 'round' as const, cap: 'round' as const };
const sky = (id: string, g: Gradient | null = grad('#112233', '#ffcc00')): PathShape => ({ ...box(id, 0, 0, 100, 50, '#112233'), stroke: line, ...(g ? { fillGradient: g } : {}) });
const shape = (id: string) => shapesNow().find((s) => s.id === id) as PathShape;

beforeEach(() => {
  vectorStore();
  setPaintKind('fill', 'solid');
  setPaintKind('stroke', 'solid');
  store().setUi({ fillColor: '#ff0000', color: '#000000', strokeOn: true, activeWell: 'stroke', selection: [] });
  followPick();
});

// The test store is a fresh one, so the app's own subscription is not on it: pick, then let the panel follow.
const pick = (ids: string[], well?: 'fill' | 'stroke') => {
  store().setUi({ selection: ids, ...(well ? { activeWell: well } : {}) });
  followPick();
};

describe('sharedPaint', () => {
  it('tells nothing, plain, one shared gradient and a mix apart', () => {
    expect(sharedPaint([]).state).toBe('none');
    expect(sharedPaint([undefined, undefined]).state).toBe('plain');
    expect(sharedPaint([grad('#000000', '#ffffff')]).state).toBe('same');
    // Same colours with the ends somewhere else is still the same gradient.
    const moved = { ...grad('#000000', '#ffffff'), from: { x: 5, y: 5 }, to: { x: 5, y: 90 } };
    expect(sharedPaint([grad('#000000', '#ffffff'), moved]).state).toBe('same');
    expect(sharedPaint([grad('#000000', '#ffffff'), grad('#000000', '#fffffe')]).state).toBe('differ');
    expect(sharedPaint([grad('#000000', '#ffffff'), undefined]).state).toBe('differ');
    expect(sharedPaint([grad('#000000', '#ffffff'), grad('#000000', '#ffffff', 'radial')]).state).toBe('differ');
  });
});

describe('picking a gradient shape', () => {
  it('shows its gradient, not the box', () => {
    addShapes(sky('a'));
    pick(['a']);
    const v = paintView('fill');
    expect(v.from).toBe('selection');
    expect(stopColor('fill')).toBe('#112233');
  });

  it('brings the fill forward when the fill is the gradient and the stroke is plain', () => {
    addShapes(sky('a'));
    pick(['a'], 'stroke');
    expect(store().get().ui.activeWell).toBe('fill');
  });

  it('leaves the box in front when nothing picked has a gradient', () => {
    addShapes(sky('a', null));
    pick(['a'], 'stroke');
    expect(store().get().ui.activeWell).toBe('stroke');
    expect(paintView('stroke').from).toBe('box');
  });

  it('starts again at the first colour', () => {
    addShapes(sky('a'));
    pick(['a']);
    selectStop('fill', 1);
    pick([]);
    pick(['a']);
    expect(stopColor('fill')).toBe('#112233');
  });
});

describe('editing the picked shape', () => {
  beforeEach(() => {
    addShapes(sky('a'));
    pick(['a']);
  });

  it('recolours a stop on the shape, and the box follows the edit (as it does for a plain colour)', () => {
    selectStop('fill', 1);
    setStopColor('fill', '#00ff88');
    expect(shape('a').fillGradient?.stops[1].color).toBe('#00ff88');
    expect(shape('a').fillGradient?.from).toEqual({ x: 0, y: 0 });
    expect(getGradientWells().fill?.stops[1].color).toBe('#00ff88');
    expect(store().get().ui.fillColor).toBe('#112233');
    expect(store().get().ui.color).toBe('#000000');
  });

  it('does not touch the box just by being picked', () => {
    expect(getGradientWells().fill).toBeNull();
    expect(store().get().ui.fillColor).toBe('#ff0000');
  });

  it('keeps the plain colour on the first stop, so old readers still get a sensible one', () => {
    selectStop('fill', 0);
    setStopColor('fill', '#00ff88');
    expect(shape('a').fill).toBe('#00ff88');
  });

  it('moves, adds and removes stops on the shape', () => {
    addStop('fill', 0.5);
    expect(shape('a').fillGradient?.stops.length).toBe(3);
    moveStop('fill', 1, 0.8);
    expect(shape('a').fillGradient?.stops[1].at).toBeCloseTo(0.8);
    removeStop('fill', 1);
    expect(shape('a').fillGradient?.stops.length).toBe(2);
  });

  it('keeps the stops when the direction changes, and lays the ends again', () => {
    setAngle('fill', 90);
    const g = shape('a').fillGradient!;
    expect(g.from.x).toBeCloseTo(g.to.x);
    expect(g.to.y).toBeGreaterThan(g.from.y);
  });

  it('turns it solid, or radial, from the panel', () => {
    setPaintKind('fill', 'radial');
    expect(shape('a').fillGradient?.kind).toBe('radial');
    setPaintKind('fill', 'solid');
    expect(shape('a').fillGradient).toBeUndefined();
    expect(shape('a').fill).toBe('#112233');
  });

  it('edits a gradient outline when the outline is the gradient', () => {
    pick([]);
    addShapes({ ...box('o', 0, 0, 100, 50, '#ffffff'), stroke: line, strokeGradient: grad('#000000', '#ff00ff') });
    pick(['o'], 'fill');
    expect(store().get().ui.activeWell).toBe('stroke');
    setStopColor('stroke', '#00ffff');
    expect(shape('o').strokeGradient?.stops[0].color).toBe('#00ffff');
    expect(shape('o').fillGradient).toBeUndefined();
  });

  it('is one undo step for a whole drag, and one more for the next gesture', () => {
    const start = shape('a').fillGradient!;
    for (const at of [0.3, 0.4, 0.5, 0.6]) moveStop('fill', 1, at);
    endGradientGesture();
    setStopColor('fill', '#00ff88');
    endGradientGesture();
    store().undo();
    expect(shape('a').fillGradient?.stops.at(-1)?.at).toBeCloseTo(0.6);
    expect(shape('a').fillGradient?.stops.at(-1)?.color).toBe('#ffcc00');
    store().undo();
    expect(shape('a').fillGradient).toEqual(start);
  });

  it('carries a stop with opacity through an edit', () => {
    selectStop('fill', 1);
    setStopColor('fill', '#ff990080');
    expect(shape('a').fillGradient?.stops[1].color).toBe('#ff990080');
  });
});

describe('several shapes picked', () => {
  it('edits all of them when they share a gradient', () => {
    addShapes(sky('a'), sky('b'));
    pick(['a', 'b']);
    expect(paintView('fill').from).toBe('selection');
    selectStop('fill', 1);
    setStopColor('fill', '#00ff88');
    expect(shape('a').fillGradient?.stops[1].color).toBe('#00ff88');
    expect(shape('b').fillGradient?.stops[1].color).toBe('#00ff88');
  });

  it('says they differ, and matching gives every shape the first one', () => {
    addShapes(sky('a'), sky('b', grad('#ff0000', '#0000ff')), sky('c', null));
    pick(['a', 'b', 'c']);
    expect(paintView('fill')).toEqual({ from: 'differ', count: 3 });
    // Nothing to edit until they match.
    setStopColor('fill', '#00ff88');
    expect(shape('b').fillGradient?.stops[0].color).toBe('#ff0000');
    matchSelectedGradients('fill');
    for (const id of ['a', 'b', 'c']) expect(shape(id).fillGradient?.stops.map((s) => s.color)).toEqual(['#112233', '#ffcc00']);
    expect(paintView('fill').from).toBe('selection');
  });
});

describe('the box still works when nothing picked has a gradient', () => {
  it('makes a gradient in the box and puts it on the picked shapes, as before', () => {
    addShapes(sky('a', null));
    pick(['a'], 'fill');
    setPaintKind('fill', 'linear');
    expect(shape('a').fillGradient?.kind).toBe('linear');
    expect(shape('a').fillGradient?.stops[0].color).toBe('#ff0000');
    expect(store().get().ui.fillColor).toBe('#ff0000');
  });
});

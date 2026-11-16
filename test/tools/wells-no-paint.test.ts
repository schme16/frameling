// A picked shape with nothing on one side shows "none" in that side's box, not the box's own colour. Some shapes with
// paint and some without is a mix, the same as different colours. The rules from colour-selection.test.ts and
// gradient-selection.test.ts still hold: the box follows an edit and never a pick, one undo step per gesture.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Gradient, PathShape, Shape, StrokeShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { bareWords, endGradientGesture, followPick, getGradientWells, isMixed, matchSelectedColours, paintView, setPaintKind, showsPaintKind, showsPicker, wellIsNone, wellShows } from '../../src/tools/gradient-wells';
import { setActiveColor } from '../../src/tools/wells';
import { getCommand } from '../../src/core/registry';
import '../../src/tools/wells';
import { addShapes, box, shapesNow, vectorStore } from './helpers';

const line = (color: string) => ({ color, width: 3, join: 'round' as const, cap: 'round' as const });
const shape = (id: string) => shapesNow().find((s) => s.id === id) as PathShape;
const both = (id: string): PathShape => ({ ...box(id, 0, 0, 100, 50, '#ff0000'), stroke: line('#00ff00') });
// A stroke-only line: no fill.
const lineOnly = (id: string): PathShape => ({ ...both(id), fill: null });
// A fill-only shape: no outline.
const fillOnly = (id: string): PathShape => ({ ...both(id), stroke: null });
const grad: Gradient = { kind: 'linear', stops: [{ at: 0, color: '#112233' }, { at: 1, color: '#ffcc00' }], from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };

beforeEach(() => {
  vectorStore();
  setPaintKind('fill', 'solid');
  setPaintKind('stroke', 'solid');
  store().setUi({ fillColor: '#0000ff', color: '#000000', strokeOn: true, activeWell: 'fill', selection: [] });
  followPick();
});

const pick = (ids: string[], well?: 'fill' | 'stroke') => {
  store().setUi({ selection: ids, ...(well ? { activeWell: well } : {}) });
  followPick();
};

describe('a picked shape with nothing on one side', () => {
  it('says none for the empty side and shows its own colour for the other', () => {
    addShapes(lineOnly('a'));
    pick(['a'], 'fill');
    expect(paintView('fill')).toEqual({ from: 'none', count: 1 });
    expect(paintView('stroke')).toEqual({ from: 'colour', color: '#00ff00' });
    expect(isMixed(paintView('fill'))).toBe(false);
  });

  it('says none for a missing outline too', () => {
    addShapes(fillOnly('a'));
    pick(['a'], 'stroke');
    expect(paintView('stroke')).toEqual({ from: 'none', count: 1 });
    expect(paintView('fill')).toEqual({ from: 'colour', color: '#ff0000' });
  });

  it('leaves the box alone: a pick never changes it', () => {
    addShapes(lineOnly('a'));
    pick(['a'], 'fill');
    expect(store().get().ui.fillColor).toBe('#0000ff');
    expect(store().get().ui.color).toBe('#000000');
  });

  it('still brings the side that has paint forward', () => {
    addShapes(lineOnly('a'));
    pick(['a'], 'fill');
    expect(store().get().ui.activeWell).toBe('stroke');
  });

  it('says none for every picked shape that has nothing there', () => {
    addShapes(lineOnly('a'), lineOnly('b'));
    pick(['a', 'b'], 'fill');
    expect(paintView('fill')).toEqual({ from: 'none', count: 2 });
  });

  it('is not about shapes that cannot hold that side at all', () => {
    const text = { id: 't', type: 'text', text: 'hi', font: 'Nunito', size: 20, weight: 400, color: '#123456', align: 'left', opacity: 1, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } } as unknown as Shape;
    const brush = { id: 's', type: 'stroke', color: '#654321', width: 3, points: [], opacity: 1 } as unknown as StrokeShape;
    addShapes(text, brush);
    pick(['t'], 'stroke');
    expect(paintView('stroke').from).toBe('box');
    pick(['s'], 'fill');
    expect(paintView('fill').from).toBe('box');
  });

  it('goes back to the box when nothing is picked', () => {
    addShapes(lineOnly('a'));
    pick(['a'], 'fill');
    pick([]);
    expect(paintView('fill').from).toBe('box');
  });

  it('has words for it, and none when there is nothing to say', () => {
    addShapes(lineOnly('a'), lineOnly('b'), both('c'));
    pick(['a'], 'fill');
    expect(bareWords(paintView('fill'), 'fill')).toBe('The picked shape has no fill. Click a colour to give it one.');
    expect(bareWords(paintView('fill'), 'stroke')).toContain('no outline');
    pick(['a', 'b'], 'fill');
    expect(bareWords(paintView('fill'), 'fill')).toBe('None of the 2 picked shapes have a fill. Click a colour to give them one.');
    pick(['c'], 'fill');
    expect(bareWords(paintView('fill'), 'fill')).toBeNull();
    pick([]);
    expect(bareWords(paintView('fill'), 'fill')).toBeNull();
  });
});

describe('giving a bare side a colour', () => {
  beforeEach(() => {
    addShapes(lineOnly('a'));
    pick(['a'], 'fill');
    store().setUi({ activeWell: 'fill' });
  });

  it('gives the shape a fill, and the box follows the edit', () => {
    setActiveColor('#ff8800');
    expect(shape('a').fill).toBe('#ff8800');
    expect(shape('a').stroke?.color).toBe('#00ff00');
    expect(store().get().ui.fillColor).toBe('#ff8800');
    expect(paintView('fill')).toEqual({ from: 'colour', color: '#ff8800' });
  });

  it('gives it the fill even when the colour is the one already in the box', () => {
    setActiveColor('#0000ff');
    expect(shape('a').fill).toBe('#0000ff');
  });

  it('gives a shape with no outline one, and turns the stroke box on', () => {
    addShapes(fillOnly('b'));
    store().setUi({ strokeOn: false });
    pick(['b'], 'stroke');
    store().setUi({ activeWell: 'stroke' });
    setActiveColor('#336699');
    expect(shape('b').stroke?.color).toBe('#336699');
    expect(store().get().ui.strokeOn).toBe(true);
  });

  it('is one undo step for a whole drag', () => {
    for (const c of ['#ff1100', '#ff2200', '#ff3300']) setActiveColor(c);
    endGradientGesture();
    store().undo();
    expect(shape('a').fill).toBeNull();
  });

  it('a gradient choice gives the shape a fill first, then the blend, in one step', () => {
    setPaintKind('fill', 'linear');
    expect(shape('a').fill).toBe('#0000ff');
    expect(shape('a').fillGradient).toBeDefined();
    expect(getGradientWells().fill).not.toBeNull();
    endGradientGesture();
    store().undo();
    expect(shape('a').fill).toBeNull();
    expect(shape('a').fillGradient).toBeUndefined();
  });

  it('Solid on a side with nothing changes nothing', () => {
    setPaintKind('fill', 'solid');
    expect(shape('a').fill).toBeNull();
    expect(paintView('fill').from).toBe('none');
  });
});

describe('some picked shapes with paint and some without', () => {
  it('reads as mixed, the same as different colours', () => {
    addShapes(both('a'), lineOnly('b'));
    pick(['a', 'b'], 'fill');
    const v = paintView('fill');
    expect(v).toEqual({ from: 'colour', color: '#ff0000', bare: 1 });
    expect(isMixed(v)).toBe(true);
    expect(isMixed(paintView('stroke'))).toBe(false);
  });

  it('is mixed on top of different colours too', () => {
    addShapes(both('a'), { ...both('b'), fill: '#00ff00' }, lineOnly('c'));
    pick(['a', 'b', 'c'], 'fill');
    expect(paintView('fill')).toEqual({ from: 'colours', count: 2, bare: 1 });
    expect(isMixed(paintView('fill'))).toBe(true);
  });

  it('is mixed with a gradient on the painted ones', () => {
    addShapes({ ...both('a'), fillGradient: grad }, lineOnly('b'));
    pick(['a', 'b'], 'fill');
    const v = paintView('fill');
    expect(v.from).toBe('selection');
    expect(isMixed(v)).toBe(true);
  });

  it('leaves the shapes without paint as they are when a colour is chosen', () => {
    addShapes(both('a'), lineOnly('b'));
    pick(['a', 'b'], 'fill');
    setActiveColor('#ff8800');
    expect(shape('a').fill).toBe('#ff8800');
    expect(shape('b').fill).toBeNull();
    expect(store().get().ui.fillColor).toBe('#ff8800');
  });

  it('says how many have nothing', () => {
    addShapes(both('a'), lineOnly('b'), lineOnly('c'));
    pick(['a', 'b', 'c'], 'fill');
    expect(bareWords(paintView('fill'), 'fill')).toBe('2 of the picked shapes have no fill, so they stay as they are.');
    pick(['a', 'b'], 'fill');
    expect(bareWords(paintView('fill'), 'fill')).toBe('1 of the picked shapes has no fill, so it stays as it is.');
  });

  it('offers to match only when the painted ones really differ', () => {
    addShapes(both('a'), lineOnly('b'));
    pick(['a', 'b'], 'fill');
    expect(getCommand('colors.matchColours')?.enabled?.(store().get())).toBe(false);
    addShapes({ ...both('c'), fill: '#00ff00' });
    pick(['a', 'b', 'c'], 'fill');
    expect(getCommand('colors.matchColours')?.enabled?.(store().get())).toBe(true);
    matchSelectedColours('fill');
    endGradientGesture();
    expect(shape('c').fill).toBe('#ff0000');
    expect(shape('b').fill).toBeNull();
    expect(paintView('fill')).toEqual({ from: 'colour', color: '#ff0000', bare: 1 });
  });
});

describe('a side with nothing on it keeps its colour tools', () => {
  it('keeps the picker and the Solid/Linear/Radial choice, because picking there is how you give it paint', () => {
    addShapes(lineOnly('a'));
    pick(['a'], 'fill');
    expect(showsPicker(paintView('fill'))).toBe(true);
    expect(showsPaintKind(paintView('fill'))).toBe(true);
    expect(bareWords(paintView('fill'), 'fill')).toMatch(/no fill/);
  });

  it('keeps them for the side that has paint, for nothing picked, and for a mix with some paint', () => {
    addShapes(lineOnly('a'), both('b'));
    pick(['a'], 'stroke');
    expect(showsPicker(paintView('stroke'))).toBe(true);
    expect(showsPaintKind(paintView('stroke'))).toBe(true);
    pick([], 'fill');
    expect(showsPicker(paintView('fill'))).toBe(true);
    pick(['a', 'b'], 'fill');
    expect(showsPicker(paintView('fill'))).toBe(true);
    expect(showsPaintKind(paintView('fill'))).toBe(true);
  });

  it('drops the picker only when the picked shapes have colours that differ, where there is nothing to show', () => {
    addShapes(fillOnly('a'), { ...fillOnly('b'), fill: '#00ff00' });
    pick(['a', 'b'], 'fill');
    expect(showsPicker(paintView('fill'))).toBe(false);
    expect(showsPaintKind(paintView('fill'))).toBe(true);
  });
});

describe('the see-through box', () => {
  it('shows nothing for a side with no paint, whatever the box colour is', () => {
    addShapes(lineOnly('a'));
    pick(['a'], 'fill');
    expect(wellShows(paintView('fill'), '#0000ff')).toBe(null);
    expect(wellIsNone(paintView('fill'), '#0000ff')).toBe(true);
  });

  it('shows the picked shape colour, not the box colour, when there is paint', () => {
    addShapes(lineOnly('a'));
    pick(['a'], 'stroke');
    expect(wellShows(paintView('stroke'), '#0000ff')).toBe('#00ff00');
    expect(wellIsNone(paintView('stroke'), '#0000ff')).toBe(false);
  });

  it('falls back to the box colour when nothing is picked', () => {
    expect(wellShows(paintView('fill'), '#0000ff')).toBe('#0000ff');
    expect(wellIsNone(paintView('fill'), '#0000ff')).toBe(false);
  });

  it('counts an empty box as nothing, so the box is see-through there too', () => {
    expect(wellIsNone(paintView('fill'), null)).toBe(true);
  });

  it('is not see-through when the picked shapes differ, which reads as mixed instead', () => {
    addShapes(fillOnly('a'), lineOnly('b'));
    pick(['a', 'b'], 'fill');
    expect(wellShows(paintView('fill'), '#0000ff')).toBe('mixed');
    expect(wellIsNone(paintView('fill'), '#0000ff')).toBe(false);
  });
});

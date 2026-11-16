// Picking a shape with a plain colour shows that colour in the Colours panel, and changing it changes the shape.
// The same rules as picking a gradient (gradient-selection.test.ts): a mix says so, the box follows an edit and
// never a pick, one undo step per gesture.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Gradient, PathShape, Shape, StrokeShape } from '../../src/core/format';
import { sharedColour } from '../../src/core/gradient';
import { store } from '../../src/core/store';
import { endGradientGesture, followPick, getGradientWells, matchSelectedColours, paintView, setPaintKind } from '../../src/tools/gradient-wells';
import { setActiveColor } from '../../src/tools/wells';
import { getCommand } from '../../src/core/registry';
import '../../src/tools/wells';
import { addShapes, box, shapesNow, vectorStore } from './helpers';

const line = (color: string) => ({ color, width: 3, join: 'round' as const, cap: 'round' as const });
const shape = (id: string) => shapesNow().find((s) => s.id === id) as PathShape;
const red = (id: string): PathShape => ({ ...box(id, 0, 0, 100, 50, '#ff0000'), stroke: line('#00ff00') });
const grad: Gradient = { kind: 'linear', stops: [{ at: 0, color: '#112233' }, { at: 1, color: '#ffcc00' }], from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };

beforeEach(() => {
  vectorStore();
  setPaintKind('fill', 'solid');
  setPaintKind('stroke', 'solid');
  store().setUi({ fillColor: '#0000ff', color: '#000000', strokeOn: true, activeWell: 'fill', selection: [] });
  followPick();
});

// The test store is a fresh one, so the app's own subscription is not on it: pick, then let the panel follow.
const pick = (ids: string[], well?: 'fill' | 'stroke') => {
  store().setUi({ selection: ids, ...(well ? { activeWell: well } : {}) });
  followPick();
};

describe('sharedColour', () => {
  it('tells nothing, one shared colour and a mix apart, in any letter case', () => {
    expect(sharedColour([]).state).toBe('none');
    expect(sharedColour(['#ff0000'])).toEqual({ state: 'same', color: '#ff0000' });
    expect(sharedColour(['#ff0000', '#FF0000']).state).toBe('same');
    expect(sharedColour(['#ff0000', '#ff0001'])).toEqual({ state: 'differ', count: 2 });
    expect(sharedColour(['#ff0000', '#ff000080']).state).toBe('differ');
  });
});

describe('picking a plain colour shape', () => {
  it('shows its colour, not the box', () => {
    addShapes(red('a'));
    pick(['a'], 'fill');
    expect(paintView('fill')).toEqual({ from: 'colour', color: '#ff0000' });
    expect(paintView('stroke')).toEqual({ from: 'colour', color: '#00ff00' });
  });

  it('leaves the box alone: a pick never changes it', () => {
    addShapes(red('a'));
    pick(['a'], 'fill');
    expect(store().get().ui.fillColor).toBe('#0000ff');
    expect(store().get().ui.color).toBe('#000000');
  });

  it('shows the box again when nothing is picked, or the shape has nothing on that side', () => {
    addShapes({ ...red('a'), stroke: null });
    pick([]);
    expect(paintView('fill').from).toBe('box');
    pick(['a']);
    expect(paintView('stroke').from).toBe('box');
  });

  it('brings forward the side the shape actually has', () => {
    addShapes({ ...red('a'), fill: null });
    pick(['a'], 'fill');
    expect(store().get().ui.activeWell).toBe('stroke');
  });

  it('keeps the box in front when the shape has both sides', () => {
    addShapes(red('a'));
    pick(['a'], 'stroke');
    expect(store().get().ui.activeWell).toBe('stroke');
  });

  it('still brings a gradient side forward ahead of a plain one', () => {
    addShapes({ ...red('a'), strokeGradient: { ...grad } });
    pick(['a'], 'fill');
    expect(store().get().ui.activeWell).toBe('stroke');
  });

  it('shows a plain shape as plain even when the box holds a gradient', () => {
    store().setUi({ fillColor: '#0000ff' });
    setPaintKind('fill', 'linear');
    expect(getGradientWells().fill).not.toBeNull();
    addShapes(red('a'));
    pick(['a'], 'fill');
    expect(paintView('fill')).toEqual({ from: 'colour', color: '#ff0000' });
  });

  it('works for text and for a brush stroke too', () => {
    const text = { id: 't', type: 'text', text: 'hi', font: 'Nunito', size: 20, weight: 400, color: '#123456', align: 'left', opacity: 1, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } } as unknown as Shape;
    const brush = { id: 's', type: 'stroke', color: '#654321', width: 3, points: [], opacity: 1 } as unknown as StrokeShape;
    addShapes(text, brush);
    pick(['t'], 'fill');
    expect(paintView('fill')).toEqual({ from: 'colour', color: '#123456' });
    pick(['s'], 'fill');
    expect(store().get().ui.activeWell).toBe('stroke');
    expect(paintView('stroke')).toEqual({ from: 'colour', color: '#654321' });
  });
});

describe('changing the picked colour', () => {
  beforeEach(() => {
    addShapes(red('a'));
    pick(['a'], 'fill');
  });

  it('changes the shape, and the box follows the edit', () => {
    setActiveColor('#ff8800');
    expect(shape('a').fill).toBe('#ff8800');
    expect(shape('a').stroke?.color).toBe('#00ff00');
    expect(store().get().ui.fillColor).toBe('#ff8800');
  });

  it('changes the outline when the outline is in front', () => {
    pick(['a'], 'stroke');
    setActiveColor('#ff8800');
    expect(shape('a').stroke?.color).toBe('#ff8800');
    expect(shape('a').fill).toBe('#ff0000');
    expect(store().get().ui.color).toBe('#ff8800');
  });

  it('works when the chosen colour is the one already in the box (the shape still changes)', () => {
    setActiveColor('#0000ff');
    expect(shape('a').fill).toBe('#0000ff');
  });

  it('takes the box up even when the shape already has that colour', () => {
    setActiveColor('#ff0000');
    expect(store().get().ui.fillColor).toBe('#ff0000');
    expect(shape('a').fill).toBe('#ff0000');
  });

  it('only changes shapes that have the side: a no-fill shape in the pick is left without a fill', () => {
    addShapes({ ...red('b'), fill: null });
    pick(['a', 'b'], 'fill');
    setActiveColor('#ff8800');
    expect(shape('a').fill).toBe('#ff8800');
    expect(shape('b').fill).toBeNull();
  });

  it('is one undo step for a whole drag, and one more for the next gesture', () => {
    for (const c of ['#ff1100', '#ff2200', '#ff3300', '#ff4400']) setActiveColor(c);
    endGradientGesture();
    setActiveColor('#00aa00');
    endGradientGesture();
    store().undo();
    expect(shape('a').fill).toBe('#ff4400');
    store().undo();
    expect(shape('a').fill).toBe('#ff0000');
  });

  it('turns a plain shape into a gradient from its own colour, not the box', () => {
    setPaintKind('fill', 'linear');
    expect(shape('a').fillGradient?.stops[0].color).toBe('#ff0000');
    expect(shape('a').fill).toBe('#ff0000');
    expect(getGradientWells().fill?.stops[0].color).toBe('#ff0000');
  });
});

describe('several shapes picked', () => {
  it('edits all of them when they share a colour', () => {
    addShapes(red('a'), red('b'));
    pick(['a', 'b'], 'fill');
    expect(paintView('fill')).toEqual({ from: 'colour', color: '#ff0000' });
    setActiveColor('#00aaff');
    expect(shape('a').fill).toBe('#00aaff');
    expect(shape('b').fill).toBe('#00aaff');
  });

  it('says they differ, and matching gives every shape the first one in one step', () => {
    addShapes(red('a'), { ...red('b'), fill: '#00ff00' }, { ...red('c'), fill: '#0000aa' });
    pick(['a', 'b', 'c'], 'fill');
    expect(paintView('fill')).toEqual({ from: 'colours', count: 3 });
    expect(getCommand('colors.matchColours')?.enabled?.(store().get())).toBe(true);
    matchSelectedColours('fill');
    endGradientGesture();
    for (const id of ['a', 'b', 'c']) expect(shape(id).fill).toBe('#ff0000');
    expect(paintView('fill').from).toBe('colour');
    store().undo();
    expect(shape('b').fill).toBe('#00ff00');
    expect(shape('c').fill).toBe('#0000aa');
  });

  it('lets a deliberate colour (a swatch, the eyedropper) give them all one colour', () => {
    addShapes(red('a'), { ...red('b'), fill: '#00ff00' });
    pick(['a', 'b'], 'fill');
    setActiveColor('#ffffff');
    expect(shape('a').fill).toBe('#ffffff');
    expect(shape('b').fill).toBe('#ffffff');
  });

  it('the match command is off when the colours already agree', () => {
    addShapes(red('a'), red('b'));
    pick(['a', 'b'], 'fill');
    expect(getCommand('colors.matchColours')?.enabled?.(store().get())).toBe(false);
  });

  it('a gradient on the selection still wins over plain colours on the same side', () => {
    addShapes({ ...red('a'), fillGradient: grad }, red('b'));
    pick(['a', 'b'], 'fill');
    expect(paintView('fill').from).toBe('differ');
  });
});

describe('the box still works when nothing picked has that side', () => {
  it('sets the box colour and pushes it onto the picked shapes, as before', () => {
    addShapes({ ...red('a'), fill: null });
    pick(['a'], 'fill');
    expect(paintView('fill').from).toBe('box');
    store().setUi({ activeWell: 'fill' });
    setActiveColor('#123456');
    expect(store().get().ui.fillColor).toBe('#123456');
    expect(shape('a').fill).toBe('#123456');
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { setChoice } from '../../src/core/choices';
import { store } from '../../src/core/store';
import '../../src/notes/marksChoices';
import { beginStroke, beginText, cancelStroke, cancelText, clearMarks, eraseAt, finishStroke, finishText, moveStroke, removeMark, typeText } from '../../src/notes/marksOps';
import { _resetMarksState, getMarksState, setMarksSaved } from '../../src/notes/marksState';

function fresh() {
  const d = newDoc({ name: 'T', width: 400, height: 400 });
  d.length = 12;
  const l = Object.assign(newVectorLayer('Lines'), { id: 'L1' });
  l.cels = [{ id: 'c1', start: 6, length: 2, drawingId: 'dx' }];
  d.layers = [l];
  store().load(d, null);
  store().setUi({ frame: 2, activeLayerId: 'L1' });
  _resetMarksState();
  setChoice('marks.pin', undefined);
}
beforeEach(fresh);

const marks = () => store().get().doc.marks;
const draw = (kind: 'arrow' | 'circle' | 'scribble', pts: [number, number][], o: { shift?: boolean; zoom?: number } = {}) => {
  beginStroke(kind, pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) moveStroke(x, y, { shift: o.shift, zoom: o.zoom ?? 1 });
  finishStroke(o.zoom ?? 1);
};

describe('drawing marks', () => {
  it('an arrow joins the file when the pen lifts, as one undo step with a plain name', () => {
    beginStroke('arrow', 10, 10);
    moveStroke(80, 60, { zoom: 1 });
    expect(getMarksState().draft).toMatchObject({ kind: 'arrow', pts: [10, 10, 80, 60] });
    expect(marks()).toBeUndefined();
    finishStroke(1);
    expect(getMarksState().draft).toBeNull();
    expect(marks()).toEqual([expect.objectContaining({ kind: 'arrow', pts: [10, 10, 80, 60], pin: 'frame', frame: 2 })]);
    expect(store().undoLabel()).toBe('Draw an arrow');
    store().undo();
    expect(marks()).toBeUndefined();
  });
  it('a circle and a sketch are named for what they are', () => {
    draw('circle', [[10, 10], [90, 70]]);
    expect(store().undoLabel()).toBe('Draw a circle');
    draw('scribble', [[0, 0], [20, 5], [40, 0], [60, 8]]);
    expect(store().undoLabel()).toBe('Draw a sketch');
    expect(marks()).toHaveLength(2);
  });
  it('a tap that went nowhere leaves nothing', () => {
    draw('arrow', [[10, 10], [11, 10]]);
    expect(marks()).toBeUndefined();
    expect(store().canUndo()).toBe(false);
  });
  it('a sketch is thinned, so a long stroke stays small in the file', () => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 200; i++) pts.push([i * 2, 50]);
    draw('scribble', pts);
    expect(marks()![0].pts.length).toBeLessThan(10);
  });
  it('Shift keeps an arrow to 15 degree steps and a circle round', () => {
    draw('arrow', [[0, 0], [100, 10]], { shift: true });
    const [, , x, y] = marks()![0].pts;
    expect(Math.atan2(y, x) * (180 / Math.PI)).toBeCloseTo(0, 0);
    draw('circle', [[0, 0], [100, 40]], { shift: true });
    const c = marks()![1].pts;
    expect(Math.abs(c[2] - c[0])).toBeCloseTo(Math.abs(c[3] - c[1]), 5);
  });
  it('uses the pen colour and thickness, and writes down only what is not the default', () => {
    setMarksSaved({ color: '#3b82f6', w: 7 });
    draw('arrow', [[0, 0], [50, 50]]);
    expect(marks()![0]).toMatchObject({ color: '#3b82f6', w: 7 });
    setMarksSaved({ color: '#ff3b5c', w: 3 });
    draw('arrow', [[0, 0], [60, 60]]);
    expect(marks()![1].color).toBeUndefined();
    expect(marks()![1].w).toBeUndefined();
  });
  it('belongs where the remembered choice says', () => {
    setChoice('marks.pin', 'page');
    draw('arrow', [[0, 0], [50, 50]]);
    expect(marks()![0].pin).toBeUndefined();
    setChoice('marks.pin', 'layer');
    draw('arrow', [[0, 0], [60, 60]]);
    expect(marks()![1]).toMatchObject({ pin: 'layer', layer: 'L1' });
  });
  it('a layer mark with no layer to belong to goes on the page', () => {
    setChoice('marks.pin', 'layer');
    store().setUi({ activeLayerId: null });
    draw('arrow', [[0, 0], [50, 50]]);
    expect(marks()![0].pin).toBeUndefined();
  });
  it('stays on the frame it was drawn on, even if the playhead moves before it is kept', () => {
    beginStroke('arrow', 0, 0);
    moveStroke(50, 50, { zoom: 1 });
    store().setUi({ frame: 9 });
    finishStroke(1);
    expect(marks()![0]).toMatchObject({ pin: 'frame', frame: 2 });
  });
  it('turns the marks on if they were hidden, so you never draw what you cannot see', () => {
    setMarksSaved({ show: false });
    beginStroke('arrow', 0, 0);
    expect(getMarksState().show).toBe(true);
  });
  it('Esc drops the stroke in hand', () => {
    beginStroke('arrow', 0, 0);
    moveStroke(50, 50, { zoom: 1 });
    cancelStroke();
    finishStroke(1);
    expect(marks()).toBeUndefined();
  });
});

describe('words', () => {
  it('join the file when finished, and an empty box leaves nothing', () => {
    beginText(30, 40);
    finishText();
    expect(marks()).toBeUndefined();
    beginText(30, 40);
    typeText('raise this eye');
    expect(getMarksState().typing!.text).toBe('raise this eye');
    expect(marks()).toBeUndefined();
    finishText();
    expect(marks()).toEqual([expect.objectContaining({ kind: 'text', pts: [30, 40], text: 'raise this eye' })]);
    expect(store().undoLabel()).toBe('Add words');
    expect(getMarksState().typing).toBeNull();
  });
  it('Esc drops them', () => {
    beginText(0, 0);
    typeText('never mind');
    cancelText();
    finishText();
    expect(marks()).toBeUndefined();
  });
});

describe('rubbing out and clearing', () => {
  const setup = () => {
    setChoice('marks.pin', 'frame');
    draw('arrow', [[0, 0], [100, 0]]);
    draw('arrow', [[0, 50], [100, 50]]);
    store().setUi({ frame: 3 });
    draw('circle', [[200, 200], [300, 300]]);
    store().setUi({ frame: 2 });
  };
  it('rubs out the mark under the pen, and only on a frame where it shows', () => {
    setup();
    expect(eraseAt(50, 2, 1)).toBe(true);
    expect(marks()).toHaveLength(2);
    expect(eraseAt(50, 25, 1)).toBe(false);
    expect(eraseAt(250, 200, 1)).toBe(false);
    expect(store().undoLabel()).toBe('Rub out a mark');
  });
  it('a thin line is as easy to hit at any zoom', () => {
    setup();
    expect(eraseAt(50, 6, 1)).toBe(true);
    setup();
    expect(eraseAt(50, 6, 4)).toBe(false);
  });
  it('removes one by id', () => {
    setup();
    const id = marks()![0].id;
    removeMark(id);
    expect(marks()!.some((m) => m.id === id)).toBe(false);
    removeMark('nothing');
  });
  it('clears this frame, or everything, with the empty list taken out of the file', () => {
    setup();
    expect(clearMarks('frame')).toBe(2);
    expect(marks()!.map((m) => m.kind)).toEqual(['circle']);
    expect(store().undoLabel()).toBe('Clear the marks on this frame');
    expect(clearMarks('all')).toBe(1);
    expect(marks()).toBeUndefined();
    expect(clearMarks('all')).toBe(0);
    store().undo();
    expect(marks()).toHaveLength(1);
  });
});

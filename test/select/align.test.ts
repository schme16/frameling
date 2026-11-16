import { beforeEach, describe, expect, it } from 'vitest';
import { shapeBounds } from '../../src/canvas/geometry';
import '../../src/core/commands';
import '../../src/tools';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import {
  alignPixelsTo,
  alignShifts,
  alignTarget,
  gapsOf,
  spreadShifts,
  unionBox,
  type Boxed,
} from '../../src/select/align';
import { alignSelection, spreadSelection } from '../../src/select/align-ops';
import { setAlignTo } from '../../src/select/align-settings';
import { cancel } from '../../src/transform/session';
import { addShapes, box, shapesNow, vectorStore } from '../tools/helpers';

const b = (id: string, x: number, y: number, w: number, h: number): Boxed => ({ id, box: { x, y, w, h } });
const shift = (m: Map<string, { dx: number; dy: number }>, id: string) => m.get(id);

describe('align maths', () => {
  const boxes = [b('a', 10, 50, 20, 20), b('b', 60, 10, 40, 10), b('c', 40, 90, 10, 30)];

  it('the selection box is the box round everything', () => {
    expect(unionBox(boxes)).toEqual({ x: 10, y: 10, w: 90, h: 110 });
    expect(unionBox([])).toBeNull();
  });

  it('lines up on the left, centre and right of the target', () => {
    const t = unionBox(boxes)!;
    expect(shift(alignShifts(boxes, 'left', t), 'b')).toEqual({ dx: -50, dy: 0 });
    expect(alignShifts(boxes, 'left', t).has('a')).toBe(false);
    expect(shift(alignShifts(boxes, 'centre', t), 'a')).toEqual({ dx: 35, dy: 0 });
    expect(shift(alignShifts(boxes, 'right', t), 'a')).toEqual({ dx: 70, dy: 0 });
  });

  it('lines up on the top, middle and bottom of the target', () => {
    const t = unionBox(boxes)!;
    expect(shift(alignShifts(boxes, 'top', t), 'a')).toEqual({ dx: 0, dy: -40 });
    expect(shift(alignShifts(boxes, 'middle', t), 'b')).toEqual({ dx: 0, dy: 50 });
    expect(shift(alignShifts(boxes, 'bottom', t), 'b')).toEqual({ dx: 0, dy: 100 });
  });

  it('leaves out shapes that are already there, so an even tidy is an empty map', () => {
    const t = unionBox(boxes)!;
    const once = alignShifts(boxes, 'left', t);
    const moved = boxes.map((x) => ({ ...x, box: { ...x.box, x: x.box.x + (once.get(x.id)?.dx ?? 0) } }));
    expect(alignShifts(moved, 'left', unionBox(moved)!).size).toBe(0);
  });

  it('lines up to the page when that is the target', () => {
    const page = { x: 0, y: 0, w: 400, h: 300 };
    expect(shift(alignShifts([b('t', 0, 0, 100, 40)], 'centre', page), 't')).toEqual({ dx: 150, dy: 0 });
    expect(shift(alignShifts([b('t', 0, 0, 100, 40)], 'middle', page), 't')).toEqual({ dx: 0, dy: 130 });
  });

  it('one shape can only line up to the page', () => {
    expect(alignTarget(1, 'selection')).toBe('page');
    expect(alignTarget(2, 'selection')).toBe('selection');
    expect(alignTarget(3, 'page')).toBe('page');
  });
});

describe('spread maths', () => {
  const row = [b('a', 0, 0, 10, 10), b('b', 20, 0, 40, 10), b('c', 70, 0, 10, 10), b('d', 200, 0, 20, 10)];

  it('needs three, and does nothing with two', () => {
    expect(spreadShifts([b('a', 0, 0, 10, 10), b('b', 50, 0, 10, 10)], 'across').size).toBe(0);
  });

  it('keeps the ends and makes the gaps equal, edge to edge', () => {
    const m = spreadShifts(row, 'across');
    // Room: 0..220, widths 10 + 40 + 10 + 20 = 80, so three gaps of 46.67.
    const after = row.map((x) => ({ ...x, box: { ...x.box, x: x.box.x + (m.get(x.id)?.dx ?? 0) } }));
    const gaps = gapsOf(after, 'across');
    expect(gaps).toHaveLength(3);
    for (const g of gaps) expect(g).toBeCloseTo(140 / 3, 6);
    expect(after[0].box.x).toBe(0);
    expect(after[3].box.x + after[3].box.w).toBe(220);
    expect(m.has('a')).toBe(false);
    expect(m.has('d')).toBe(false);
  });

  it('sets an exact gap from the first shape on', () => {
    const m = spreadShifts(row, 'across', 5);
    const after = row.map((x) => ({ ...x, box: { ...x.box, x: x.box.x + (m.get(x.id)?.dx ?? 0) } }));
    expect(gapsOf(after, 'across')).toEqual([5, 5, 5]);
    expect(after[0].box.x).toBe(0);
  });

  it('a gap of nothing, or a negative one, is allowed', () => {
    const m = spreadShifts(row, 'across', 0);
    const after = row.map((x) => ({ ...x, box: { ...x.box, x: x.box.x + (m.get(x.id)?.dx ?? 0) } }));
    expect(gapsOf(after, 'across')).toEqual([0, 0, 0]);
  });

  it('goes down as well, moving only y', () => {
    const col = [b('a', 0, 0, 10, 10), b('b', 5, 15, 10, 10), b('c', 0, 100, 10, 10)];
    const m = spreadShifts(col, 'down');
    expect(m.get('b')).toEqual({ dx: 0, dy: 35 });
  });

  it('shapes given out of order are taken in order of where they are', () => {
    const m = spreadShifts([row[2], row[0], row[3], row[1]], 'across');
    const after = row.map((x) => x.box.x + (m.get(x.id)?.dx ?? 0));
    expect(after[0]).toBeLessThan(after[1]);
    expect(after[1]).toBeLessThan(after[2]);
    expect(after[2]).toBeLessThan(after[3]);
  });

  it('already even says so with no moves', () => {
    const even = [b('a', 0, 0, 10, 10), b('b', 20, 0, 10, 10), b('c', 40, 0, 10, 10)];
    expect(spreadShifts(even, 'across').size).toBe(0);
  });
});

describe('pixels line up to the page in whole pixels', () => {
  it('picks the pixel before when the middle falls between two', () => {
    const box = { x0: 3, y0: 4, x1: 6, y1: 7 };
    expect(alignPixelsTo(box, 'left', 32, 32)).toEqual({ x: 0, y: null });
    expect(alignPixelsTo(box, 'right', 32, 32)).toEqual({ x: 28, y: null });
    expect(alignPixelsTo(box, 'centre', 33, 32)).toEqual({ x: 14, y: null });
    expect(alignPixelsTo(box, 'middle', 32, 31)).toEqual({ x: null, y: 13 });
    expect(alignPixelsTo(box, 'bottom', 32, 32)).toEqual({ x: null, y: 28 });
  });
});

describe('on the page', () => {
  beforeEach(() => {
    cancel();
    vectorStore();
    setAlignTo('selection');
    addShapes(box('a', 100, 100, 80, 40), box('b', 300, 60, 40, 40), box('c', 150, 200, 60, 20));
  });

  const bounds = (id: string) => shapeBounds(shapesNow().find((s) => s.id === id)!);
  const pick = (...ids: string[]) => store().setUi({ selection: ids });

  it('aligning is one undo step that puts the shapes where it says, and undo puts them back', () => {
    pick('a', 'b', 'c');
    const step = store().historyIds().undo;
    expect(alignSelection('left')).toBe(true);
    expect(bounds('a').x).toBe(100);
    expect(bounds('b').x).toBe(100);
    expect(bounds('c').x).toBe(100);
    expect(store().historyIds().undo).not.toBe(step);
    store().undo();
    expect(bounds('b').x).toBe(300);
    expect(store().historyIds().undo).toBe(step);
  });

  it('one shape lines up to the page', () => {
    pick('b');
    expect(alignSelection('centre')).toBe(true);
    expect(bounds('b').x + bounds('b').w / 2).toBe(200);
    expect(alignSelection('middle')).toBe(true);
    expect(bounds('b').y + bounds('b').h / 2).toBe(150);
  });

  it('several shapes line up to the page when asked', () => {
    pick('a', 'b');
    expect(alignSelection('right', 'page')).toBe(true);
    expect(bounds('a').x + bounds('a').w).toBe(400);
    expect(bounds('b').x + bounds('b').w).toBe(400);
    expect(bounds('c').x).toBe(150);
  });

  it('does nothing, and makes no undo step, when they are lined up already', () => {
    pick('a', 'b');
    alignSelection('left');
    const step = store().historyIds().undo;
    expect(alignSelection('left')).toBe(false);
    expect(store().historyIds().undo).toBe(step);
  });

  it('spreads three out evenly, in one step', () => {
    pick('a', 'b', 'c');
    const step = store().historyIds().undo;
    expect(spreadSelection('across')).toBe(true);
    const [a, c, bb] = [bounds('a'), bounds('c'), bounds('b')];
    // Left to right: a (100..180), c (150..210), b (300..340): the one at each end stays.
    expect(a.x).toBe(100);
    expect(bb.x + bb.w).toBe(340);
    const order = [a, c, bb].sort((p, q) => p.x - q.x);
    expect(order[1].x - (order[0].x + order[0].w)).toBeCloseTo(order[2].x - (order[1].x + order[1].w), 6);
    expect(store().historyIds().undo).not.toBe(step);
  });

  it('refuses two shapes and says why, leaving the page alone', () => {
    pick('a', 'b');
    const before = store().get().doc;
    expect(spreadSelection('across')).toBe(false);
    expect(store().get().doc).toBe(before);
  });

  it('has a command for each, in the palette', () => {
    for (const id of ['select.alignLeft', 'select.alignCentre', 'select.alignRight', 'select.alignTop', 'select.alignMiddle', 'select.alignBottom', 'select.spreadAcross', 'select.spreadDown', 'select.alignToPage']) {
      expect(getCommand(id), id).toBeTruthy();
    }
    pick('a', 'b', 'c');
    getCommand('select.alignBottom')!.run();
    expect(bounds('a').y + bounds('a').h).toBe(bounds('c').y + bounds('c').h);
  });
});

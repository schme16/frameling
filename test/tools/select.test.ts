import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape } from '../../src/core/format';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { setLive, getLive } from '../../src/canvas/controller';
import { shapeBounds } from '../../src/canvas/geometry';
import { selectTool, shapesInRect } from '../../src/tools/select';
import '../../src/tools/edit-commands';
import { clearClipboard } from '../../src/tools/clipboard';
import { addShapes, box, ctx, drag, ptr, shapesNow, vectorStore } from './helpers';

const run = (id: string) => void getCommand(id)!.run();
const selection = () => store().get().ui.selection;
const bounds = (id: string) => {
  const s = shapesNow().find((x) => x.id === id) as PathShape;
  return shapeBounds(s);
};

beforeEach(() => {
  vectorStore();
  clearClipboard();
  setLive(null);
  addShapes(box('a', 0, 0, 100, 100), box('b', 200, 0, 100, 100), box('c', 400, 200, 50, 50));
});

describe('selecting', () => {
  it('selects a shape by clicking, and swaps selection on another click', () => {
    drag(selectTool, ctx(), [[50, 50], [50, 50]]);
    expect(selection()).toEqual(['a']);
    drag(selectTool, ctx(), [[250, 50], [250, 50]]);
    expect(selection()).toEqual(['b']);
  });

  it('adds and removes with Shift+click', () => {
    drag(selectTool, ctx(), [[50, 50], [50, 50]]);
    drag(selectTool, ctx(), [[250, 50], [250, 50]], { shift: true });
    expect(selection()).toEqual(['a', 'b']);
    drag(selectTool, ctx(), [[250, 50], [250, 50]], { shift: true });
    expect(selection()).toEqual(['a']);
  });

  it('clears on a click in empty space', () => {
    drag(selectTool, ctx(), [[50, 50], [50, 50]]);
    drag(selectTool, ctx(), [[350, 150], [350, 150]]);
    expect(selection()).toEqual([]);
  });

  it('selects everything a marquee touches, and Shift keeps what was there', () => {
    drag(selectTool, ctx(), [[-10, -10], [320, 120]]);
    expect(selection()).toEqual(['a', 'b']);
    drag(selectTool, ctx(), [[390, 190], [460, 260]], { shift: true });
    expect(selection()).toEqual(['a', 'b', 'c']);
  });

  it('finds shapes in a rectangle', () => {
    expect(shapesInRect(shapesNow(), { x: 90, y: 90, w: 5, h: 5 }).map((s) => s.id)).toEqual(['a']);
    expect(shapesInRect(shapesNow(), { x: 1000, y: 1000, w: 5, h: 5 })).toEqual([]);
  });

  it('does nothing to the document while selecting', () => {
    const before = store().get().doc;
    drag(selectTool, ctx(), [[50, 50], [50, 50]]);
    drag(selectTool, ctx(), [[-10, -10], [320, 120]]);
    expect(store().get().doc).toBe(before);
  });
});

describe('moving, resizing and turning', () => {
  it('moves the selection in one undo step and shows a live preview on the way', () => {
    const c = ctx();
    drag(selectTool, c, [[50, 50], [50, 50]]);
    selectTool.down?.(ptr(50, 50), c);
    selectTool.move?.(ptr(80, 70), c);
    expect(getLive()).not.toBeNull();
    // The document hasn't moved yet.
    expect(bounds('a')).toMatchObject({ x: 0, y: 0 });
    selectTool.move?.(ptr(150, 90), c);
    selectTool.up?.(ptr(150, 90), c);
    expect(getLive()).toBeNull();
    expect(bounds('a')).toMatchObject({ x: 100, y: 40, w: 100, h: 100 });
    expect(bounds('b')).toMatchObject({ x: 200, y: 0 });
    expect(store().undoLabel()).toBe('Move');
    store().undo();
    expect(bounds('a')).toMatchObject({ x: 0, y: 0 });
  });

  it('locks to one direction with Shift', () => {
    drag(selectTool, ctx(), [[50, 50], [50, 50]]);
    drag(selectTool, ctx(), [[50, 50], [150, 70]], { shift: true });
    expect(bounds('a')).toMatchObject({ x: 100, y: 0 });
  });

  it('treats a tiny wobble as a click, not a move', () => {
    drag(selectTool, ctx(), [[50, 50], [50, 50]]);
    const before = store().get().doc;
    drag(selectTool, ctx(), [[50, 50], [51, 51]]);
    expect(store().get().doc).toBe(before);
  });

  it('resizes by a corner, with the opposite corner held still', () => {
    drag(selectTool, ctx(), [[50, 50], [50, 50]]);
    drag(selectTool, ctx(), [[100, 100], [200, 200]]);
    expect(bounds('a')).toMatchObject({ x: 0, y: 0, w: 200, h: 200 });
    expect(store().undoLabel()).toBe('Resize');
  });

  it('keeps proportions with Shift', () => {
    drag(selectTool, ctx(), [[50, 50], [50, 50]]);
    drag(selectTool, ctx(), [[100, 100], [200, 120]], { shift: true });
    const b = bounds('a');
    expect(b.w).toBeCloseTo(b.h);
    expect(b.w).toBeCloseTo(200);
  });

  it('turns by the rotate handle', () => {
    drag(selectTool, ctx(), [[50, 50], [50, 50]]);
    // The handle floats 28px above the top middle; drag it round to the right of the shape.
    drag(selectTool, ctx(), [[50, -28], [150, 50]]);
    const b = bounds('a');
    expect(b.x).toBeCloseTo(0, 5);
    expect(b.w).toBeCloseTo(100, 5);
    expect(store().undoLabel()).toBe('Rotate');
    // A quarter turn about the centre leaves a square's box where it was, but the points have moved.
    const pts = (shapesNow()[0] as PathShape).paths[0].points;
    expect(pts[0].x).toBeCloseTo(100);
    expect(pts[0].y).toBeCloseTo(0);
  });

  it('cancelling puts everything back', () => {
    const c = ctx();
    drag(selectTool, c, [[50, 50], [50, 50]]);
    const before = store().get().doc;
    selectTool.down?.(ptr(50, 50), c);
    selectTool.move?.(ptr(150, 150), c);
    selectTool.cancel?.(c);
    expect(getLive()).toBeNull();
    expect(store().get().doc).toBe(before);
  });

  it('works on the frame you are on', () => {
    drag(selectTool, ctx(), [[50, 50], [50, 50]]);
    store().setUi({ frame: 5 });
    drag(selectTool, ctx(), [[50, 50], [50, 50]]);
    expect(selection()).toEqual([]);
  });
});

describe('edit commands', () => {
  it('selects all and deselects', () => {
    run('select.all');
    expect(selection()).toEqual(['a', 'b', 'c']);
    run('select.none');
    expect(selection()).toEqual([]);
  });

  it('deletes the selection in one step', () => {
    store().setUi({ selection: ['a', 'c'] });
    run('edit.delete');
    expect(shapesNow().map((s) => s.id)).toEqual(['b']);
    expect(selection()).toEqual([]);
    store().undo();
    expect(shapesNow()).toHaveLength(3);
  });

  it('duplicates beside the original and selects the copies', () => {
    store().setUi({ selection: ['a'] });
    run('edit.duplicate');
    expect(shapesNow()).toHaveLength(4);
    const copy = shapesNow()[3];
    expect(copy.id).not.toBe('a');
    expect(selection()).toEqual([copy.id]);
    expect(shapeBounds(copy).x).toBeGreaterThan(0);
  });

  it('copies and pastes within a frame (offset) and into another frame (in place)', () => {
    store().setUi({ selection: ['b'] });
    run('edit.copy');
    run('edit.paste');
    expect(shapesNow()).toHaveLength(4);
    expect(shapeBounds(shapesNow()[3]).x).toBeGreaterThan(200);

    store().setUi({ frame: 6, selection: [] });
    run('edit.paste');
    expect(shapesNow()).toHaveLength(1);
    expect(shapeBounds(shapesNow()[0])).toMatchObject({ x: 200, y: 0, w: 100, h: 100 });
    expect(selection()).toEqual([shapesNow()[0].id]);
    // Back on the first frame nothing else changed.
    store().setUi({ frame: 0 });
    expect(shapesNow()).toHaveLength(4);
  });

  it('cuts', () => {
    store().setUi({ selection: ['a'] });
    run('edit.cut');
    expect(shapesNow().map((s) => s.id)).toEqual(['b', 'c']);
    run('edit.paste');
    expect(shapesNow()).toHaveLength(3);
  });

  it('only pastes when there is something to paste', () => {
    expect(getCommand('edit.paste')!.enabled!(store().get())).toBe(false);
    store().setUi({ selection: ['a'] });
    run('edit.copy');
    expect(getCommand('edit.paste')!.enabled!(store().get())).toBe(true);
  });

  it('flips about the middle of the selection', () => {
    store().setUi({ selection: ['a', 'b'] });
    run('select.flipH');
    expect(bounds('a')).toMatchObject({ x: 200, w: 100 });
    expect(bounds('b')).toMatchObject({ x: 0, w: 100 });
    run('select.flipV');
    expect(bounds('a')).toMatchObject({ y: 0 });
  });

  it('brings forward and sends back', () => {
    store().setUi({ selection: ['a'] });
    run('arrange.forward');
    expect(shapesNow().map((s) => s.id)).toEqual(['b', 'a', 'c']);
    run('arrange.front');
    expect(shapesNow().map((s) => s.id)).toEqual(['b', 'c', 'a']);
    run('arrange.backward');
    expect(shapesNow().map((s) => s.id)).toEqual(['b', 'a', 'c']);
    run('arrange.back');
    expect(shapesNow().map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('nudges by 1, or 10 with Shift, and a run of nudges is one undo', () => {
    store().setUi({ selection: ['a'] });
    run('select.nudgeRight');
    run('select.nudgeRight');
    run('select.nudgeDownMore');
    expect(bounds('a')).toMatchObject({ x: 2, y: 10 });
    store().undo();
    expect(bounds('a')).toMatchObject({ x: 0, y: 0 });
  });

  it('is greyed out with nothing selected', () => {
    for (const id of ['edit.delete', 'edit.duplicate', 'edit.copy', 'select.flipH', 'arrange.forward', 'select.nudgeLeft']) {
      expect(getCommand(id)!.enabled!(store().get())).toBe(false);
    }
    store().setUi({ selection: ['a'] });
    expect(getCommand('edit.delete')!.enabled!(store().get())).toBe(true);
  });
});

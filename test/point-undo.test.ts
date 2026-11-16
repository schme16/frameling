// @vitest-environment jsdom
// Ctrl+Z while placing points takes a point back, and never reaches the drawing behind until the shape is gone.
import { beforeEach, describe, expect, it } from 'vitest';
import { store } from '../src/core/store';
import type { Tool, ToolContext } from '../src/core/registry';
import { allCommands } from '../src/core/registry';
import '../src/core/commands';
import '../src/tools';
import '../src/select/commands';
import '../src/transform/commands';
import { pointsInProgress } from '../src/core/pointUndo';
import { reasonFor } from '../src/core/commandReasons';
import { dispatchKey, resetKeyboard } from '../src/ui/keyboard';
import { commandEnabled } from '../src/ui/palette';
import { lassoIsOpen, selectTools } from '../src/tools/select';
import { pixelLassoIsOpen, pixelSelectTools } from '../src/select/pixel-tool';
import { pixelSelection, resetPixelSelection } from '../src/select/pixel-state';
import { DEFAULT_SELECT_SETTINGS, setSelectSettings } from '../src/select/settings';
import { penState, penTool } from '../src/tools/pen';
import { addShapes, box, ctx, pixelStore, ptr, shapesNow, vectorStore } from './tools/helpers';

let clock = 0;
const click = (t: Tool, c: ToolContext, x: number, y: number, extra = {}) => {
  clock += 2000;
  t.down!(ptr(x, y, { time: clock, ...extra }), c);
  t.up!(ptr(x, y, { time: clock + 10, ...extra }), c);
};
const select = (id: string): Tool => [...selectTools, ...pixelSelectTools].find((t) => t.id === id)!;

/** The real key, through the real keymap. */
const ctrlZ = (repeat = false) => {
  const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, repeat, bubbles: true, cancelable: true });
  document.body.dispatchEvent(e);
  return dispatchKey(e);
};
const ctrlShiftZ = () => {
  const e = new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
  document.body.dispatchEvent(e);
  return dispatchKey(e);
};

/** A finished box on the drawing, and what the undo history holds after it. */
function finishedDrawing(): void {
  addShapes(box('behind', 10, 10, 20, 20));
}
const behindIntact = () => expect(shapesNow().map((s) => s.id)).toEqual(['behind']);

beforeEach(() => {
  // The tools keep their half-made shapes in module state: let go of whatever an earlier test left.
  penTool.leave!(ctx());
  for (const t of [...selectTools, ...pixelSelectTools]) t.cancel?.(ctx());
  resetKeyboard();
  resetPixelSelection();
  setSelectSettings({ ...DEFAULT_SELECT_SETTINGS });
});

describe('Ctrl+Z with the pen', () => {
  beforeEach(() => {
    vectorStore();
    finishedDrawing();
    store().setUi({ tool: 'pen' });
  });

  it('takes the points back one at a time and leaves the drawing behind alone', () => {
    const c = ctx();
    click(penTool, c, 100, 100);
    click(penTool, c, 200, 100);
    click(penTool, c, 200, 200);
    expect(penState().path?.length).toBe(3);
    expect(ctrlZ()).toBe(true);
    expect(penState().path?.length).toBe(2);
    expect(ctrlZ()).toBe(true);
    expect(penState().path?.length).toBe(1);
    behindIntact();
    // The last point cancels the shape, and that press stops there.
    expect(ctrlZ()).toBe(true);
    expect(penState().path).toBeNull();
    expect(pointsInProgress()).toBe(false);
    behindIntact();
    // With nothing half made, the next one is the drawing's own undo again.
    expect(ctrlZ()).toBe(true);
    expect(shapesNow()).toEqual([]);
  });

  it('does not let a held key run on from the last point into the drawing', () => {
    const c = ctx();
    click(penTool, c, 100, 100);
    click(penTool, c, 200, 100);
    ctrlZ();
    ctrlZ();
    expect(penState().path).toBeNull();
    // The auto-repeat of the same hold is dropped. A fresh press goes through.
    expect(ctrlZ(true)).toBe(true);
    expect(ctrlZ(true)).toBe(true);
    behindIntact();
    ctrlZ();
    expect(shapesNow()).toEqual([]);
  });

  it('takes a curved point back whole, handles and all', () => {
    const c = ctx();
    click(penTool, c, 100, 100);
    clock += 2000;
    penTool.down!(ptr(200, 100, { time: clock }), c);
    penTool.move!(ptr(260, 160, { time: clock + 5 }), c);
    penTool.up!(ptr(260, 160, { time: clock + 10 }), c);
    expect(penState().path?.anchors[1].hout).toBeTruthy();
    ctrlZ();
    expect(penState().path?.length).toBe(1);
    expect(penState().path?.anchors[0].hout).toBeUndefined();
  });

  it('is the same as Backspace', () => {
    const c = ctx();
    click(penTool, c, 100, 100);
    click(penTool, c, 200, 100);
    penTool.onKey!({ key: 'Backspace' } as KeyboardEvent, c);
    expect(penState().path?.length).toBe(1);
  });

  it('keeps Redo from putting a drawing step back under points you are placing', () => {
    // Undo the box, so the drawing has something to redo, then start a path.
    expect(ctrlZ()).toBe(true);
    expect(shapesNow()).toEqual([]);
    const redo = allCommands().find((x) => x.id === 'edit.redo')!;
    expect(commandEnabled(redo)).toBe(true);
    click(penTool, ctx(), 100, 100);
    expect(commandEnabled(redo)).toBe(false);
    expect(ctrlShiftZ()).toBe(false);
    expect(shapesNow()).toEqual([]);
    expect(reasonFor(redo, store().get())).toMatch(/Finish the shape/);
    // Once the shape is gone, Redo is the drawing's again.
    ctrlZ();
    expect(commandEnabled(redo)).toBe(true);
    expect(ctrlShiftZ()).toBe(true);
    behindIntact();
  });

  it('is never greyed while points are placed, even on an empty history', () => {
    vectorStore();
    store().setUi({ tool: 'pen' });
    const undo = allCommands().find((x) => x.id === 'edit.undo')!;
    expect(commandEnabled(undo)).toBe(false);
    click(penTool, ctx(), 100, 100);
    expect(commandEnabled(undo)).toBe(true);
  });
});

describe('Ctrl+Z with a polygon selection', () => {
  beforeEach(() => {
    vectorStore();
    finishedDrawing();
    store().setUi({ tool: 'select-polygon' });
  });

  it('takes corners back one at a time and leaves the drawing behind alone', () => {
    const t = select('select-polygon');
    const c = ctx();
    click(t, c, 0, 0);
    click(t, c, 100, 0);
    click(t, c, 100, 100);
    expect(lassoIsOpen()).toBe(true);
    ctrlZ();
    ctrlZ();
    expect(lassoIsOpen()).toBe(true);
    behindIntact();
    ctrlZ();
    expect(lassoIsOpen()).toBe(false);
    behindIntact();
    ctrlZ();
    expect(shapesNow()).toEqual([]);
  });

  it('does not take corners from a polygon left open on another tool', () => {
    const t = select('select-polygon');
    click(t, ctx(), 0, 0);
    click(t, ctx(), 100, 0);
    store().setUi({ tool: 'pen' });
    ctrlZ();
    expect(lassoIsOpen()).toBe(true);
    expect(shapesNow()).toEqual([]);
  });
});

describe('Ctrl+Z with a lasso left open by Alt', () => {
  it('takes the last Alt side back, then the whole lasso, never the drawing behind', () => {
    vectorStore();
    finishedDrawing();
    store().setUi({ tool: 'select-lasso' });
    const t = select('select-lasso');
    const c = ctx();
    // A freehand stroke let go with Alt held, then two Alt+click sides.
    t.down!(ptr(0, 0), c);
    for (const [x, y] of [[20, 0], [40, 0], [60, 0], [80, 0]]) t.move!(ptr(x, y), c);
    t.up!(ptr(100, 0, { alt: true }), c);
    click(t, c, 100, 100, { alt: true });
    click(t, c, 0, 100, { alt: true });
    expect(lassoIsOpen()).toBe(true);
    ctrlZ();
    ctrlZ();
    expect(lassoIsOpen()).toBe(true);
    ctrlZ();
    expect(lassoIsOpen()).toBe(false);
    behindIntact();
  });
});

describe('Ctrl+Z with a polygon selection on a pixel layer', () => {
  it('takes corners back one at a time and leaves the pixels behind alone', () => {
    pixelStore();
    store().setUi({ tool: 'pixel-select-polygon' });
    const behind = JSON.stringify(store().get().doc.layers);
    const t = select('pixel-select-polygon');
    const c = ctx();
    click(t, c, 0, 0);
    click(t, c, 40, 0);
    click(t, c, 40, 40);
    expect(pixelLassoIsOpen()).toBe(true);
    ctrlZ();
    ctrlZ();
    expect(pixelLassoIsOpen()).toBe(true);
    ctrlZ();
    expect(pixelLassoIsOpen()).toBe(false);
    expect(pixelSelection()).toBeNull();
    expect(JSON.stringify(store().get().doc.layers)).toBe(behind);
  });
});

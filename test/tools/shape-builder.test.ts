import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PathShape, SubPath } from '../../src/core/format';
import { getCommand, getHelp, getTool } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { currentChoice, resetChoices, setChoice } from '../../src/core/choices';
import { areaOfPaths, geomArea } from '../../src/geometry/merge';
import '../../src/tools/shapeBuilder';
import { resetShapeBuilder, setBuildMode } from '../../src/tools/shapeBuilder';
import { addShapes, box, ctx, drag, ptr, shapesNow, vectorStore } from './helpers';

const tool = () => getTool('shape-builder')!;
const area = (s: PathShape) => geomArea(areaOfPaths(s.paths as SubPath[]));
const pick = (...ids: string[]) => store().setUi({ selection: ids });

beforeEach(() => {
  resetChoices();
  vectorStore();
  resetShapeBuilder();
  // a 0..100, b 50..150: the lens is 50..100.
  addShapes(box('a', 0, 0, 100, 100, '#ff0000'), box('b', 50, 50, 100, 100, '#0000ff'));
});

describe('the Shape builder tool', () => {
  it('is a tool for vector layers with a key and help, and it is in the palette', () => {
    expect(tool().layers).toEqual(['vector']);
    expect(tool().key).toBe('Shift+N');
    expect(getHelp('tool-shape-builder')?.media).toBe('tool-shape-builder.mp4');
    expect(tool().help).toBe('tool-shape-builder');
    // The tool's own command is made from the tool (tools.<id>), so there is only the one definition.
    expect(getCommand('shapes.builder')).toBeUndefined();
  });

  it('a drag across three bits joins them into one shape, in one undo step', () => {
    const c = ctx();
    drag(tool(), c, [[20, 20], [60, 40], [75, 75], [120, 120]]);
    const now = shapesNow() as PathShape[];
    // Crescent a, lens, crescent b become one shape. Nothing else was there to keep.
    expect(now).toHaveLength(1);
    expect(area(now[0])).toBeCloseTo(17500, -1);
    expect(store().get().ui.selection).toEqual([now[0].id]);
    store().undo();
    expect(shapesNow().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('wears the colours of the bit the drag started on, or the bottom shape when that is the answer', () => {
    drag(tool(), ctx(), [[120, 120], [75, 75], [20, 20]]);
    expect((shapesNow()[0] as PathShape).fill).toBe('#0000ff');
    store().undo();
    setChoice('shapes.buildLook', 'bottom');
    drag(tool(), ctx(), [[120, 120], [75, 75], [20, 20]]);
    expect((shapesNow()[0] as PathShape).fill).toBe('#ff0000');
  });

  it('defaults to the bit you started on, without asking', () => {
    expect(currentChoice('shapes.buildLook')).toBe('dragged');
  });

  it('Alt-drag takes the bits it crosses away', () => {
    drag(tool(), ctx(), [[75, 75], [76, 76]], { alt: true });
    const now = shapesNow() as PathShape[];
    expect(now).toHaveLength(2);
    expect(now.reduce((n, s) => n + area(s), 0)).toBeCloseTo(15000, -1);
    store().undo();
    expect(shapesNow().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('Shift does the same as Alt, for desktops that keep Alt-drag', () => {
    drag(tool(), ctx(), [[75, 75], [76, 76]], { shift: true });
    expect(shapesNow()).toHaveLength(2);
    expect((shapesNow() as PathShape[]).reduce((n, s) => n + area(s), 0)).toBeCloseTo(15000, -1);
  });

  it('the options can make a plain drag take away, and Alt then joins', () => {
    setBuildMode('remove');
    drag(tool(), ctx(), [[75, 75], [76, 76]]);
    expect(shapesNow()).toHaveLength(2);
    store().undo();
    drag(tool(), ctx(), [[20, 20], [75, 75]], { alt: true });
    expect(shapesNow()).toHaveLength(2);
    expect((shapesNow() as PathShape[]).some((s) => Math.abs(area(s) - 10000) < 200)).toBe(true);
  });

  it('a click on a crossing bit pulls it out as a shape of its own', () => {
    drag(tool(), ctx(), [[75, 75], [75, 75]]);
    expect(shapesNow()).toHaveLength(3);
  });

  it('a click on a shape that is already whole says so and changes nothing', () => {
    vectorStore();
    resetShapeBuilder();
    addShapes(box('solo', 0, 0, 100, 100));
    const before = shapesNow();
    const c = ctx();
    drag(tool(), c, [[50, 50], [50, 50]]);
    expect(shapesNow()).toBe(before);
    expect(c.hint).toHaveBeenCalled();
  });

  it('works on just the picked shapes when two or more are picked', () => {
    addShapes(box('c', 120, 0, 60, 60, '#00ff00'));
    pick('a', 'b');
    // The drag crosses a's bit, the lens and b's: c is not in it and stays as it is.
    drag(tool(), ctx(), [[20, 20], [75, 75], [120, 120]]);
    const now = shapesNow();
    expect(now.map((s) => s.id)).toContain('c');
    expect(now).toHaveLength(2);
  });

  it('with nothing picked it still finds the shapes round the pointer', () => {
    pick();
    const c = ctx();
    tool().hover!(ptr(75, 75), c);
    expect(c.requestOverlay).toHaveBeenCalled();
  });

  it('says so on bare paper, and changes nothing', () => {
    const before = shapesNow();
    const c = ctx();
    drag(tool(), c, [[300, 250], [310, 260]]);
    expect(shapesNow()).toBe(before);
    expect(c.hint).toHaveBeenCalled();
  });

  it('Escape in the middle of a drag drops it, and nothing is built', () => {
    const before = shapesNow();
    const c = ctx();
    tool().down!(ptr(20, 20), c);
    tool().move!(ptr(75, 75), c);
    tool().cancel!(c);
    tool().up!(ptr(120, 120), c);
    expect(shapesNow()).toBe(before);
  });

  it('draws its highlight without touching the drawing', () => {
    const c = ctx();
    const g = new Proxy({}, { get: (_t, k) => (k === 'setLineDash' || k === 'save' || k === 'restore' ? vi.fn() : vi.fn()), set: () => true }) as unknown as CanvasRenderingContext2D;
    tool().down!(ptr(20, 20), c);
    tool().move!(ptr(75, 75), c);
    const before = shapesNow();
    expect(() => tool().overlay!(g, c)).not.toThrow();
    expect(shapesNow()).toBe(before);
    tool().cancel!(c);
  });
});

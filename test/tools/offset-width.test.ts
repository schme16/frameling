import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape } from '../../src/core/format';
import { getCommand, getTool } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { currentChoice, resetChoices, setChoice } from '../../src/core/choices';
import { areaOfPaths, geomArea } from '../../src/geometry/merge';
import { applyOffset } from '../../src/tools/offset';
import { resetWidthTool } from '../../src/tools/width';
import '../../src/tools/edit-commands';
import '../../src/tools/offset';
import '../../src/tools/width';
import { addShapes, box, ctx, drag, ptr, shapesNow, vectorStore } from './helpers';

const pick = (...ids: string[]) => store().setUi({ selection: ids });
const area = (s: PathShape) => geomArea(areaOfPaths(s.paths));
const line = (id: string): PathShape => ({ id, type: 'path', paths: [{ closed: false, points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] }], fill: null, stroke: { color: '#000', width: 10, join: 'round', cap: 'butt' }, opacity: 1 });

beforeEach(() => {
  resetChoices();
  vectorStore();
  resetWidthTool();
});

describe('Offset path commands', () => {
  it('is in the palette in plain words, and greyed with a reason when nothing is picked', () => {
    const c = getCommand('offset.card')!;
    expect(c.label).toMatch(/bigger or smaller/);
    expect(c.enabled?.(store().get())).toBe(false);
    expect(c.reason?.(store().get())).toMatch(/Select a shape/);
  });

  it('asks the original-or-copy question once, and the default keeps the original', () => {
    expect(currentChoice('shapes.offsetKeep')).toBe('copy');
  });

  it('grows a copy behind the original and selects it, in one undo step', () => {
    addShapes(box('a', 50, 50, 100, 100));
    pick('a');
    applyOffset(10, 'sharp');
    const now = shapesNow() as PathShape[];
    expect(now).toHaveLength(2);
    expect(now[1].id).toBe('a');
    expect(area(now[0])).toBeCloseTo(120 * 120, -1);
    expect(store().get().ui.selection).toEqual([now[0].id]);
    store().undo();
    expect(shapesNow()).toHaveLength(1);
  });

  it('shrinks a copy in front when the answer is to keep it', () => {
    addShapes(box('a', 50, 50, 100, 100));
    pick('a');
    applyOffset(-10);
    const now = shapesNow() as PathShape[];
    expect(now[0].id).toBe('a');
    expect(area(now[1])).toBeCloseTo(80 * 80, -1);
  });

  it('swaps the shape for the copy when that is the remembered answer', () => {
    setChoice('shapes.offsetKeep', 'replace');
    addShapes(box('a', 50, 50, 100, 100));
    pick('a');
    applyOffset(10, 'sharp');
    const now = shapesNow() as PathShape[];
    expect(now).toHaveLength(1);
    expect(now[0].id).toBe('a');
    expect(area(now[0])).toBeCloseTo(120 * 120, -1);
  });

  it('leaves a shape that would shrink away as it was', () => {
    addShapes(box('a', 50, 50, 20, 20));
    pick('a');
    applyOffset(-15);
    expect(shapesNow()).toHaveLength(1);
    expect(area(shapesNow()[0] as PathShape)).toBeCloseTo(400, 0);
  });
});

describe('the Width tool', () => {
  const tool = () => getTool('width')!;
  const stops = () => (shapesNow()[0] as PathShape).stroke!.widths;

  it('is a tool for vector layers, reached by a command, with help', () => {
    expect(tool().layers).toEqual(['vector']);
    expect(getCommand('width.tool')?.help).toBe('tool-width');
    getCommand('width.tool')!.run();
    expect(store().get().ui.tool).toBe('width');
  });

  it('a drag from the middle of a line makes it fat there, in one undo step', () => {
    addShapes(line('a'));
    pick('a');
    drag(tool(), ctx(), [[100, 100], [100, 110], [100, 120], [100, 125]]);
    const s = stops()!;
    expect(s.length).toBe(3);
    expect(s[1].at).toBeCloseTo(0.5, 2);
    // Grabbed in the middle (half the line, 5, inside its edge) and pulled 25: the edge is 30 out, six times the line's width.
    expect(s[1].w).toBeCloseTo(6, 1);
    store().undo();
    expect(stops()).toBeUndefined();
  });

  it('grabbing the edge does not make the line jump, and pulling in makes it thin', () => {
    addShapes(line('a'));
    pick('a');
    const c = ctx();
    tool().down!(ptr(100, 105), c);
    tool().move!(ptr(100, 105), c);
    expect(stops()![1].w).toBeCloseTo(1, 2);
    tool().move!(ptr(100, 101), c);
    tool().up!(ptr(100, 101), c);
    expect(stops()![1].w).toBeCloseTo(0.2, 2);
  });

  it('Alt+click on a point takes it away, and an even line goes back to no stops', () => {
    addShapes(line('a'));
    pick('a');
    drag(tool(), ctx(), [[100, 100], [100, 120], [100, 120]]);
    expect(stops()).toBeDefined();
    const c = ctx();
    tool().down!(ptr(100, 120, { alt: true }), c);
    tool().up!(ptr(100, 120, { alt: true }), c);
    expect(stops()).toBeUndefined();
  });

  it('says why when the line under it is a brush line', () => {
    addShapes({ id: 'b', type: 'stroke', points: [{ x: 10, y: 10, p: 0.5 }, { x: 60, y: 10, p: 0.5 }, { x: 110, y: 10, p: 0.5 }], brush: { size: 8, thinning: 0, smoothing: 0, streamline: 0, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true }, color: '#000', opacity: 1 });
    const c = ctx();
    tool().down!(ptr(60, 10), c);
    expect(c.hint).toHaveBeenCalledWith(expect.stringMatching(/Pen or the Line tool/));
  });
});

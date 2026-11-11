import { beforeEach, describe, expect, it } from 'vitest';
import type { FillShape, Shape } from '../../src/core/format';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { pointInPaths } from '../../src/geometry/hit';
import { geomArea, shapeParts } from '../../src/geometry/merge';
import { brushTool } from '../../src/tools/brush';
import { eraserTool } from '../../src/tools/eraser';
import { rectTool } from '../../src/tools/shapes';
import { selectTool } from '../../src/tools/select';
import '../../src/tools/fill';
import '../../src/tools/edit-commands';
import { activeIsMerge, breakApart, groupShapes, pendingCut, setLayerDrawMode, ungroupShapes, withGroups } from '../../src/tools/merge-mode';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { saveFile, loadFile } from '../../src/io/file';
import { addShapes, box, ctx, drag, ptr, shapesNow, vectorStore } from './helpers';
import { getTool } from '../../src/core/registry';
import { setFillOptions } from '../../src/tools/fill-options';

const red = '#ff0000';
const blue = '#0000ff';
const area = (s: Shape) => shapeParts(s).reduce((a, p) => a + geomArea(p.geom), 0);
const total = (color?: string) => shapesNow().filter((s) => !color || (s as FillShape).color === color).reduce((a, s) => a + area(s), 0);
const colorAt = (x: number, y: number) => {
  const list = shapesNow();
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i] as FillShape;
    if (s.type === 'fill' && pointInPaths(s.paths, x, y)) return s.color;
  }
  return null;
};

function mergeStore() {
  const s = vectorStore();
  setLayerDrawMode(s.get().doc.layers[0].id, 'merge');
  return s;
}

/** A filled rectangle drawn with the rectangle tool, no outline. */
function drawRect(x: number, y: number, w: number, h: number, color: string) {
  store().setUi({ fillColor: color, strokeOn: false });
  drag(rectTool, ctx(), [
    [x, y],
    [x + w, y + h],
  ]);
}

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  setFillOptions({ gap: 'small', onTop: false, allOfColour: false });
});

describe('merge drawing on a layer', () => {
  it('starts off as separate objects, and the switch is one undo step', () => {
    const s = vectorStore();
    expect(activeIsMerge()).toBe(false);
    getCommand('draw.toggleMerge')!.run();
    expect(activeIsMerge()).toBe(true);
    expect(s.get().doc.layers[0]).toMatchObject({ drawMode: 'merge' });
    s.undo();
    expect(activeIsMerge()).toBe(false);
    expect('drawMode' in s.get().doc.layers[0]).toBe(false);
  });

  it('keeps shapes separate in object mode', () => {
    vectorStore();
    drawRect(0, 0, 100, 100, red);
    drawRect(50, 50, 100, 100, red);
    expect(shapesNow()).toHaveLength(2);
    expect(shapesNow().every((s) => s.type === 'path')).toBe(true);
  });

  it('joins the same colour, cuts another, and undoes each as one step', () => {
    const s = mergeStore();
    drawRect(0, 0, 100, 100, red);
    drawRect(50, 50, 100, 100, red);
    expect(shapesNow()).toHaveLength(1);
    expect(total(red)).toBeCloseTo(17500, 0);
    drawRect(80, 0, 40, 200, blue);
    expect(total(blue)).toBeCloseTo(8000, 0);
    expect(colorAt(100, 100)).toBe(blue);
    expect(shapesNow().filter((x) => (x as FillShape).color === red)).toHaveLength(2);
    expect(s.undoLabel()).toBe('Draw rectangle');
    s.undo();
    expect(shapesNow()).toHaveLength(1);
    expect(total(red)).toBeCloseTo(17500, 0);
  });

  it('a brush stroke across a fill splits it into two regions', () => {
    const s = mergeStore();
    drawRect(0, 0, 100, 100, red);
    s.setUi({ color: '#000000', brush: { ...s.get().ui.brush, size: 6, thinning: 0, taperStart: 0, taperEnd: 0 } });
    drag(brushTool, ctx(), [
      [50, -20],
      [50, 40],
      [50, 80],
      [50, 120],
    ]);
    expect(shapesNow().filter((x) => (x as FillShape).color === red)).toHaveLength(2);
    expect(shapesNow().every((x) => x.type === 'fill')).toBe(true);
  });

  it('the bucket recolours one region at a time after a split', () => {
    const s = mergeStore();
    drawRect(0, 0, 100, 100, red);
    s.setUi({ color: '#000000', brush: { ...s.get().ui.brush, size: 6, thinning: 0, taperStart: 0, taperEnd: 0 } });
    drag(brushTool, ctx(), [
      [50, -20],
      [50, 120],
    ]);
    s.setUi({ fillColor: blue });
    getTool('fill')!.down!(ptr(20, 50), ctx());
    expect(colorAt(20, 50)).toBe(blue);
    expect(colorAt(80, 50)).toBe(red);
  });

  it('the bucket fills inside a ring of merged line without covering the line', () => {
    const s = mergeStore();
    store().setUi({ fillColor: null, strokeOn: true, color: '#000000' });
    setToolSettings({ shapeStroke: 6 });
    drag(rectTool, ctx(), [
      [100, 100],
      [200, 200],
    ]);
    const lineArea = total('#000000');
    expect(lineArea).toBeGreaterThan(2000);
    s.setUi({ fillColor: blue });
    getTool('fill')!.down!(ptr(150, 150), ctx());
    expect(colorAt(150, 150)).toBe(blue);
    expect(total('#000000')).toBeCloseTo(lineArea, 0);
  });

  it('the eraser rubs out area, not whole shapes, as one step', () => {
    const s = mergeStore();
    drawRect(0, 0, 200, 100, red);
    setToolSettings({ eraserSize: 20 });
    drag(eraserTool, ctx(), [
      [100, -20],
      [100, 50],
      [100, 120],
    ]);
    expect(shapesNow().filter((x) => (x as FillShape).color === red)).toHaveLength(2);
    expect(total(red)).toBeLessThan(20000 - 1800);
    expect(total(red)).toBeGreaterThan(20000 - 2200);
    expect(s.undoLabel()).toBe('Erase');
    s.undo();
    expect(total(red)).toBeCloseTo(20000, 0);
  });

  it('the eraser leaves grouped shapes alone', () => {
    mergeStore();
    addShapes({ ...box('g1', 0, 0, 100, 100), group: 'g' });
    drag(eraserTool, ctx(), [
      [50, -20],
      [50, 120],
    ]);
    expect(shapesNow()).toHaveLength(1);
    expect(shapesNow()[0].type).toBe('path');
  });

  it('a box over part of a shape picks just that part, and moving it leaves a hole', () => {
    const s = mergeStore();
    drawRect(0, 0, 100, 100, red);
    // Drag a box over the right half, from empty ground.
    drag(selectTool, ctx(), [
      [50, -10],
      [80, 50],
      [150, 110],
    ]);
    const cut = pendingCut();
    expect(cut).not.toBeNull();
    expect(cut!.lifted).toHaveLength(1);
    // Nothing has changed yet.
    expect(shapesNow()).toHaveLength(1);
    drag(selectTool, ctx(), [
      [75, 50],
      [150, 50],
      [275, 50],
    ]);
    expect(colorAt(75, 50)).toBe(null);
    expect(colorAt(25, 50)).toBe(red);
    expect(colorAt(275, 50)).toBe(red);
    expect(total(red)).toBeCloseTo(10000, 0);
    expect(s.undoLabel()).toBe('Move');
    s.undo();
    expect(shapesNow()).toHaveLength(1);
    expect(colorAt(75, 50)).toBe(red);
  });

  it('deleting a picked part takes out only that part', () => {
    mergeStore();
    drawRect(0, 0, 100, 100, red);
    drag(selectTool, ctx(), [
      [-10, -10],
      [50, 110],
    ]);
    getCommand('edit.delete')!.run();
    expect(total(red)).toBeCloseTo(5000, 0);
    expect(colorAt(25, 50)).toBe(null);
  });

  it('moving a whole shape onto another colour cuts it', () => {
    mergeStore();
    drawRect(0, 0, 100, 100, red);
    drawRect(300, 0, 100, 100, blue);
    drag(selectTool, ctx(), [
      [350, 50],
      [200, 50],
      [100, 50],
    ]);
    expect(colorAt(75, 50)).toBe(blue);
    expect(total(red)).toBeCloseTo(5000, 0);
  });

  it('Group protects shapes and Break apart lets them merge', () => {
    const s = mergeStore();
    drawRect(0, 0, 100, 100, red);
    const id = shapesNow()[0].id;
    s.setUi({ selection: [id] });
    getCommand('arrange.group')!.run();
    expect(shapesNow()[0].group).toBeTruthy();
    drawRect(50, 0, 100, 100, blue);
    // The grouped red is untouched underneath the blue.
    expect(area(shapesNow().find((x) => x.id === id)!)).toBeCloseTo(10000, 0);
    s.setUi({ selection: [id] });
    getCommand('arrange.breakApart')!.run();
    expect(shapesNow().every((x) => !x.group)).toBe(true);
    // Broken apart, the red lands on top and cuts the blue.
    expect(total(red)).toBeCloseTo(10000, 0);
    expect(total(blue)).toBeCloseTo(5000, 0);
  });

  it('clicking one shape of a group selects the whole group', () => {
    vectorStore();
    addShapes({ ...box('a', 0, 0, 50, 50), group: 'g' }, { ...box('b', 100, 0, 50, 50), group: 'g' }, box('c', 200, 0, 50, 50));
    drag(selectTool, ctx(), [
      [25, 25],
      [25, 25],
    ]);
    expect(store().get().ui.selection.sort()).toEqual(['a', 'b']);
  });

  it('pastes and duplicates merge on a merge layer', () => {
    const s = mergeStore();
    drawRect(0, 0, 100, 100, red);
    s.setUi({ selection: [shapesNow()[0].id] });
    getCommand('edit.duplicate')!.run();
    expect(shapesNow()).toHaveLength(1);
    expect(store().get().ui.selection).toEqual([shapesNow()[0].id]);
  });
});

describe('group helpers', () => {
  const shapes = [box('a', 0, 0, 1, 1), box('b', 0, 0, 1, 1), box('c', 0, 0, 1, 1)];
  it('groups keep order and sit at the topmost member', () => {
    const g = groupShapes(shapes, new Set(['a', 'b']));
    expect(g.shapes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(g.shapes.filter((s) => s.group === g.group)).toHaveLength(2);
    expect(withGroups(g.shapes, ['a'])).toEqual(['a', 'b']);
    expect(ungroupShapes(g.shapes, new Set(['a'])).find((s) => s.id === 'a')!.group).toBeUndefined();
  });
  it('break apart on a normal layer turns paths into fills', () => {
    const r = breakApart([{ ...box('a', 0, 0, 10, 10), stroke: { color: blue, width: 2, join: 'miter', cap: 'butt' } }], new Set(['a']), false);
    expect(r.shapes.every((s) => s.type === 'fill')).toBe(true);
    expect(r.shapes).toHaveLength(2);
  });
});

describe('files', () => {
  it('keeps a layer merge setting and shape groups through save and load', () => {
    const s = mergeStore();
    addShapes({ ...box('a', 0, 0, 10, 10), group: 'g' });
    const back = loadFile(saveFile(s.get().doc)).doc;
    expect(back.layers[0]).toMatchObject({ drawMode: 'merge' });
    const d = Object.values(back.drawings)[0];
    expect(d.kind === 'vector' && d.shapes[0].group).toBe('g');
  });
});

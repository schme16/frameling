import { beforeEach, describe, expect, it } from 'vitest';
import { store } from '../../src/core/store';
import '../../src/core/commands';
import '../../src/tools';
import { selectTool } from '../../src/tools/select';
import { pendingCut, setLayerDrawMode } from '../../src/tools/merge-mode';
import { DEFAULT_SELECT_SETTINGS, setSelectSettings } from '../../src/select/settings';
import { geomArea, shapeParts } from '../../src/geometry/merge';
import { addShapes, box, ctx, drag, ptr, vectorStore } from '../tools/helpers';

const sel = () => store().get().ui.selection;

beforeEach(() => {
  setSelectSettings({ ...DEFAULT_SELECT_SETTINGS });
  vectorStore();
  // The way of picking is the tool you chose, so these tests pick the Lasso tool.
  store().setUi({ tool: 'select-lasso' });
});

describe('lasso on vector layers', () => {
  it('selects the shapes it touches, and Shift adds', () => {
    addShapes(box('a', 10, 10, 20, 20), box('b', 100, 10, 20, 20), box('c', 10, 200, 20, 20));
    // A loop round the first shape and clipping the corner of the second.
    drag(selectTool, ctx(), [
      [0, 0],
      [105, 0],
      [105, 15],
      [0, 40],
    ]);
    expect(sel().sort()).toEqual(['a', 'b']);
    drag(selectTool, ctx(), [
      [0, 190],
      [40, 190],
      [40, 230],
      [0, 230],
    ], { shift: true });
    expect(sel().sort()).toEqual(['a', 'b', 'c']);
  });

  it('straight sides with Alt+clicks', () => {
    addShapes(box('a', 10, 10, 20, 20), box('b', 100, 100, 20, 20));
    const c = ctx();
    selectTool.down!(ptr(0, 0), c);
    selectTool.up!(ptr(0, 0, { alt: true }), c);
    selectTool.down!(ptr(50, 0, { alt: true }), c);
    selectTool.up!(ptr(50, 0, { alt: true }), c);
    selectTool.down!(ptr(50, 50), c);
    expect(sel()).toEqual([]);
    selectTool.up!(ptr(50, 50), c);
    expect(sel()).toEqual(['a']);
  });

  it('on a merge layer, cuts out exactly what is inside', () => {
    const layerId = store().get().doc.layers[0].id;
    setLayerDrawMode(layerId, 'merge');
    addShapes(box('a', 0, 0, 100, 100));
    // A triangle over the top left half.
    drag(selectTool, ctx(), [
      [-10, -10],
      [110, -10],
      [-10, 110],
    ]);
    const cut = pendingCut();
    expect(cut).not.toBeNull();
    const area = cut!.lifted.reduce((n, s) => n + shapeParts(s).reduce((m, p) => m + geomArea(p.geom), 0), 0);
    // The triangle cuts the square exactly in half.
    expect(area).toBeGreaterThan(4950);
    expect(area).toBeLessThan(5050);
  });
});

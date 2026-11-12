// Snapping artboards to each other: the lines are drawn in the open artboard's own space, where the canvas draws them.
import { beforeEach, describe, expect, it } from 'vitest';
import { artboardTool } from '../../src/artboards/tool';
import { activeId, addArtboard, artboardsOf, boxes } from '../../src/artboards/model';
import { installArtboards, resetArtboardView } from '../../src/artboards/ops';
import { setViewport } from '../../src/canvas/controller';
import { getSnapLines } from '../../src/canvas/snap';
import { setSnapDistance, setSnapPick } from '../../src/canvas/snapOps';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { ctx, ptr } from '../tools/helpers';

function twoBoards() {
  const doc = newDoc({ width: 100, height: 100, length: 4 });
  addArtboard(doc, { name: 'Other', width: 100, height: 100, length: 4 });
  resetArtboardView();
  resetStore(doc);
  installArtboards();
  setViewport({ w: 900, h: 600, dpr: 1 });
  const [a, b] = artboardsOf(store().get().doc);
  return { a: a.id, b: b.id };
}
const box = (id: string) => boxes(store().get().doc).find((x) => x.id === id)!;

describe('dragging an artboard next to another', () => {
  let t: ReturnType<typeof twoBoards>;
  beforeEach(() => {
    t = twoBoards();
    setViewSettings({ snap: true });
    setSnapPick('artboard', 'artboards', true);
    setSnapDistance(6);
  });

  it('lines its edge up with the other one, and draws the line on the open artboard', () => {
    const c = ctx(1);
    const b0 = box(t.b);
    const right = box(t.a).x + box(t.a).w;
    expect(b0.x).toBeGreaterThan(right + 6);
    // Press in the middle of the second artboard (the first is open, at the pasteboard's origin).
    artboardTool.down!(ptr(b0.x + 50, 50), c);
    expect(activeId(store().get().doc)).toBe(t.b);
    // From here pointer places are in the second artboard's own space; move left to 3 pixels short of the first's edge.
    artboardTool.move!(ptr(50 - (b0.x - right) + 3, 50), c);
    const now = box(t.b);
    expect(now.x).toBe(right);
    const lines = getSnapLines().filter((l) => l.axis === 'x');
    expect(lines).toEqual([{ axis: 'x', at: right - now.x, kind: 'artboards' }]);
    artboardTool.up!(ptr(0, 50), c);
    expect(getSnapLines()).toEqual([]);
  });

  it('follows the snap distance', () => {
    const c = ctx(1);
    const b0 = box(t.b);
    const right = box(t.a).x + box(t.a).w;
    setSnapDistance(2);
    artboardTool.down!(ptr(b0.x + 50, 50), c);
    artboardTool.move!(ptr(50 - (b0.x - right) + 5, 50), c);
    expect(box(t.b).x).not.toBe(right);
    artboardTool.up!(ptr(0, 50), c);
  });
});

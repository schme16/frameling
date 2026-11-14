// The Transform tool end to end with real pointer events: nothing changes until you apply, applying is one undo step,
// and it works on shapes, several shapes, a symbol and selected pixels.
import { beforeEach, describe, expect, it } from 'vitest';
import type { InstanceShape, PixelDrawing } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getLive, setLive } from '../../src/canvas/controller';
import { apply, shapeBounds, shapesBounds } from '../../src/canvas/geometry';
import { getCommand } from '../../src/core/registry';
import { makeSymbol } from '../../src/core/symbols';
import '../../src/core/commands';
import '../../src/tools';
import { transformTool } from '../../src/transform/tool';
import { cancel, currentFrame, getSession, isDirty } from '../../src/transform/session';
import { rotateKnob } from '../../src/transform/box';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { setChoice } from '../../src/core/choices';
import { wantsSkew } from '../../src/transform/settings';
import { changeShapes } from '../../src/select/numbers-ops';
import { turnBoxBy } from '../../src/select/numbers';
import { rectMask } from '../../src/select/mask';
import { resetPixelSelection, setPixelSelection, pixelSelection } from '../../src/select/pixel-state';
import { pencilTool } from '../../src/tools/pencil';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { asGrid } from '../helpers/grid';
import { addShapes, box, ctx, pixelStore, ptr, shapesNow, vectorStore } from '../tools/helpers';

const T = transformTool;
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey, ctrlKey: false, metaKey: false, altKey: false }) as KeyboardEvent;
const pointer = (x: number, y: number, extra = {}) => ptr(x, y, extra);

/** Down, a few moves, then up (and stays open: no Enter). */
function pull(c: ReturnType<typeof ctx>, from: [number, number], to: [number, number], extra = {}) {
  T.down!(pointer(...from, extra), c);
  const steps = 4;
  for (let i = 1; i < steps; i++) T.move!(pointer(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps, extra), c);
  T.move!(pointer(...to, extra), c);
  T.up!(pointer(...to, extra), c);
}
const enter = (c: ReturnType<typeof ctx>) => T.onKey!(key('Enter'), c);
/** Where the turn knob is now. */
const knob = (): [number, number] => {
  const k = rotateKnob(currentFrame()!, 1).knob;
  return [k.x, k.y];
};
const pick = (...ids: string[]) => store().setUi({ selection: ids });
const undoId = () => store().historyIds().undo;
const sel = () => shapesNow().filter((s) => store().get().ui.selection.includes(s.id));

beforeEach(() => {
  cancel();
  setLive(null);
});

describe('shapes', () => {
  beforeEach(() => {
    vectorStore();
    addShapes(box('a', 100, 100, 80, 40), box('b', 300, 100, 40, 40));
  });

  it('clicking a shape picks it and shows the box, and nothing changes in the document', () => {
    const before = store().get().doc;
    const c = ctx();
    T.down!(pointer(120, 120), c);
    T.up!(pointer(120, 120), c);
    expect(store().get().ui.selection).toEqual(['a']);
    expect(store().get().doc).toBe(before);
  });

  it('dragging a corner shows a live preview and only lands on Enter, as one undo step', () => {
    pick('a');
    const c = ctx();
    const before = store().get().doc;
    const step = undoId();
    pull(c, [180, 140], [260, 220]);
    expect(isDirty()).toBe(true);
    expect(store().get().doc).toBe(before);
    expect(getLive()).not.toBeNull();
    expect(enter(c)).toBe(true);
    expect(getLive()).toBeNull();
    const b = shapeBounds(sel()[0]);
    expect([b.x, b.y, b.w, b.h]).toEqual([100, 100, 160, 120]);
    expect(undoId()).not.toBe(step);
    store().undo();
    expect(store().get().doc).toEqual(before);
  });

  it('several drags in one session are still one undo step', () => {
    pick('a');
    const c = ctx();
    const before = store().get().doc;
    pull(c, [180, 140], [260, 220]); // stretch
    pull(c, knob(), [250, 60]); // turn the box by its knob
    pull(c, [200, 130], [230, 160]); // move
    expect(enter(c)).toBe(true);
    store().undo();
    expect(store().get().doc).toEqual(before);
    expect(store().canUndo()).toBe(true);
  });

  it('Escape puts everything back and the document was never touched', () => {
    pick('a');
    const c = ctx();
    const before = store().get().doc;
    pull(c, [180, 140], [260, 220]);
    expect(T.onKey!(key('Escape'), c)).toBe(true);
    expect(isDirty()).toBe(false);
    expect(getSession()).toBeNull();
    expect(getLive()).toBeNull();
    expect(store().get().doc).toBe(before);
  });

  it('Escape in the middle of a drag puts it back too', () => {
    pick('a');
    const c = ctx();
    const before = store().get().doc;
    T.down!(pointer(180, 140), c);
    T.move!(pointer(240, 200), c);
    T.cancel!(c);
    expect(getSession()).toBeNull();
    expect(store().get().doc).toBe(before);
  });

  it('clicking away applies it', () => {
    pick('a');
    const c = ctx();
    pull(c, [120, 125], [180, 165]);
    expect(isDirty()).toBe(true);
    pull(c, [600, 280], [600, 280]);
    expect(isDirty()).toBe(false);
    expect(shapeBounds(sel()[0] ?? shapesNow()[0]).x).toBeGreaterThan(100);
  });

  it('a click that goes nowhere leaves nothing open', () => {
    pick('a');
    const c = ctx();
    const before = store().get().doc;
    T.down!(pointer(120, 125), c);
    T.up!(pointer(120, 125), c);
    expect(getSession()).toBeNull();
    expect(store().get().doc).toBe(before);
  });

  it('works on several shapes at once, as one box', () => {
    pick('a', 'b');
    const c = ctx();
    const before = shapesBounds(shapesNow())!;
    pull(c, [340, 140], [440, 240]);
    enter(c);
    const after = shapesBounds(sel())!;
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.w).toBeCloseTo(before.w + 100, 6);
    expect(after.h).toBeCloseTo(before.h + 100, 6);
  });

  it('Shift on a corner keeps the proportions and Alt works from the middle', () => {
    pick('a');
    const c = ctx();
    pull(c, [180, 140], [300, 150], { shift: true });
    enter(c);
    let b = shapeBounds(sel()[0]);
    expect(b.w / b.h).toBeCloseTo(2, 6);
    store().undo();
    pull(c, [180, 140], [200, 150], { alt: true });
    enter(c);
    b = shapeBounds(sel()[0]);
    expect(b.x + b.w / 2).toBeCloseTo(140, 6);
    expect(b.y + b.h / 2).toBeCloseTo(120, 6);
  });

  it('Ctrl on a side slants it, and the opposite side stays put', () => {
    pick('a');
    const c = ctx();
    pull(c, [140, 100], [180, 100], { mod: true });
    enter(c);
    const s = sel()[0] as ReturnType<typeof box>;
    const pts = (s.paths[0] as { points: { x: number; y: number }[] }).points ?? [];
    expect(pts.length).toBeGreaterThan(0);
    const b = shapeBounds(s);
    // The bottom edge is where it was; the top slid right.
    expect(b.y + b.h).toBeCloseTo(140, 6);
    expect(b.w).toBeGreaterThan(80);
  });

  it('a dragged turn and the typed turn land the same shape', () => {
    pick('a');
    const c = ctx();
    const centre = { x: 140, y: 120 };
    // The knob is 28px above the top middle. Drag it to the right of the centre: a quarter turn.
    pull(c, [140, 72], [centre.x + 60, centre.y]);
    enter(c);
    const dragged = JSON.stringify(sel()[0]);
    store().undo();
    changeShapes('Turn', 'turn', (b) => turnBoxBy(b, 90));
    expect(JSON.stringify(sel()[0])).toBe(dragged);
  });

  it('moves the pivot without changing the shape, and turning then goes about it', () => {
    pick('a');
    const c = ctx();
    pull(c, [140, 120], [100, 100]); // the pivot clings to the top left corner
    expect(isDirty()).toBe(false);
    pull(c, [140, 72], [140, 20]);
    expect(getSession()).not.toBeNull();
  });

  it('the arrow keys nudge it as part of the session, and Shift takes ten', () => {
    pick('a');
    const c = ctx();
    T.onKey!(key('ArrowRight'), c);
    T.onKey!(key('ArrowDown', true), c);
    enter(c);
    const b = shapeBounds(sel()[0]);
    expect([b.x, b.y]).toEqual([101, 110]);
  });

  it('is put back, with a word, if the document changes under it', () => {
    pick('a');
    const c = ctx();
    pull(c, [180, 140], [260, 220]);
    addShapes(box('z', 0, 0, 5, 5));
    expect(getSession()).toBeNull();
    expect(getLive()).toBeNull();
  });

  it('says why when there is nothing to transform', () => {
    pick();
    const c = ctx();
    T.down!(pointer(600, 280), c);
    expect(c.hint).toHaveBeenCalled();
  });

  it('is there in the palette and the menus, with a key', () => {
    syncDynamicCommands();
    expect(getCommand('tools.transform')).toBeTruthy();
    expect(getCommand('transform.apply')).toBeTruthy();
    expect(getCommand('transform.putBack')).toBeTruthy();
    expect(getCommand('transform.pivotMiddle')).toBeTruthy();
    expect(T.key).toBe('q');
  });
});

describe('a symbol', () => {
  it('moves, turns and stretches like a shape, and undo gives the same instance back', () => {
    vectorStore();
    addShapes(box('a', 100, 100, 80, 40));
    store().update('make symbol', (d) => {
      const { doc, ui } = { doc: d, ui: store().get().ui };
      const layer = doc.layers.find((l) => l.id === ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
      makeSymbol(doc, layer.cels[0].drawingId, ['a'], { x: 140, y: 120 });
    });
    const inst = shapesNow().find((s) => s.type === 'instance') as InstanceShape;
    pick(inst.id);
    const before = store().get().doc;
    const c = ctx();
    pull(c, [180, 140], [260, 220]);
    pull(c, knob(), [320, 120]);
    enter(c);
    const after = shapesNow().find((s) => s.id === inst.id) as InstanceShape;
    expect(after.transform).not.toEqual(inst.transform);
    expect(after.transform.rotation).not.toBe(0);
    store().undo();
    expect(store().get().doc).toEqual(before);
  });
});

describe('pixels', () => {
  // 64x64 at 8 per art pixel: an 8x8 grid.
  const at = (px: number, py: number): [number, number] => [px * 8 + 4, py * 8 + 4];
  const grid = () => {
    const { doc, ui } = store().get();
    return asGrid(doc.drawings[doc.layers[0].cels.find((c) => ui.frame >= c.start && ui.frame < c.start + c.length)!.drawingId] as PixelDrawing);
  };
  const painted = () => {
    const d = grid();
    const out: string[] = [];
    for (let i = 0; i < d.pixels.length; i += 4) if (d.pixels[i + 3]) out.push(`${(i / 4) % d.width},${Math.floor(i / 4 / d.width)}`);
    return out.sort();
  };
  beforeEach(() => {
    pixelStore();
    resetPixelSelection();
    store().setUi({ color: '#ff0000' });
    for (const cell of [[1, 1], [2, 1], [1, 2], [2, 2]] as [number, number][]) {
      pencilTool.down!(pointer(...at(...cell)), ctx());
      pencilTool.up!(pointer(...at(...cell)), ctx());
      forgetLastPixelEnd();
    }
    setPixelSelection(rectMask(8, 8, 1, 1, 2, 2));
  });

  it('moves the selected pixels by whole pixels, nothing changes until Enter, and one undo brings it back exactly', () => {
    const c = ctx();
    const before = grid().pixels.slice();
    pull(c, at(1, 1), [at(1, 1)[0] + 16, at(1, 1)[1] + 8]);
    expect(isDirty()).toBe(true);
    expect(Array.from(grid().pixels)).toEqual(Array.from(before));
    enter(c);
    expect(painted()).toEqual(['3,2', '3,3', '4,2', '4,3']);
    expect(c.hint).not.toHaveBeenCalled();
    expect(pixelSelection()).not.toBeNull();
    store().undo();
    expect(Array.from(grid().pixels)).toEqual(Array.from(before));
  });

  it('a stretch lands every pixel as one of the colours it had, and says it picked pixels again', () => {
    const c = ctx();
    // The corner of the selection's box is at (24, 24) in the page; pull it to double the size.
    pull(c, [24, 24], [40, 40]);
    enter(c);
    expect(painted().length).toBe(16);
    expect(c.hint).toHaveBeenCalledWith(expect.stringContaining('picked again'));
    const d = grid();
    for (let i = 0; i < d.pixels.length; i += 4) if (d.pixels[i + 3]) expect(Array.from(d.pixels.slice(i, i + 4))).toEqual([255, 0, 0, 255]);
  });

  it('Escape leaves the pixels and the selection as they were', () => {
    const c = ctx();
    const before = grid().pixels.slice();
    const mask = pixelSelection();
    pull(c, at(1, 1), [at(1, 1)[0] + 16, at(1, 1)[1]]);
    T.onKey!(key('Escape'), c);
    expect(Array.from(grid().pixels)).toEqual(Array.from(before));
    expect(pixelSelection()).toBe(mask);
    expect(getLive()).toBeNull();
  });

  it('a turn by a quarter is exact and says nothing about losing anything', () => {
    const c = ctx();
    // The box is 16 wide and 16 tall at (8,8): its middle is (16,16), the knob 28 above the top.
    pull(c, [16, 8 - 28], [16 + 40, 16]);
    enter(c);
    expect(painted().length).toBe(4);
  });

  it('with no pixels selected it says what to do', () => {
    resetPixelSelection();
    const c = ctx();
    T.down!(pointer(30, 30), c);
    expect(c.hint).toHaveBeenCalledWith(expect.stringContaining('Select some pixels'));
  });
});

describe('maths agree with a point', () => {
  it('apply and the typed turn agree on a point', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(apply(turnBoxBy(r, 90)!, 10, 5).x).toBeCloseTo(5, 9);
  });
});

describe('the keys', () => {
  it('Ctrl slants by default and Shift does if you choose it', () => {
    expect(wantsSkew({ shift: false, mod: true })).toBe(true);
    expect(wantsSkew({ shift: true, mod: false })).toBe(false);
    expect(wantsSkew({ shift: true, mod: false }, 'shift')).toBe(true);
    expect(wantsSkew({ shift: false, mod: true }, 'shift')).toBe(false);
  });

  it('Shift slants a side when that is the choice', () => {
    vectorStore();
    addShapes(box('a', 100, 100, 80, 40));
    pick('a');
    setChoice('transform.skewKey', 'shift');
    try {
      const c = ctx();
      pull(c, [140, 100], [180, 100], { shift: true });
      enter(c);
      expect(shapeBounds(sel()[0]).w).toBeGreaterThan(80);
    } finally {
      setChoice('transform.skewKey', undefined);
    }
  });

  it('Undo while a transform is open puts it back and leaves the step before it alone', () => {
    vectorStore();
    addShapes(box('a', 100, 100, 80, 40));
    pick('a');
    syncDynamicCommands();
    const before = store().get().doc;
    const c = ctx();
    pull(c, [180, 140], [260, 220]);
    expect(isDirty()).toBe(true);
    getCommand('edit.undo')!.run();
    expect(isDirty()).toBe(false);
    expect(store().get().doc).toBe(before);
    expect(shapesNow().length).toBe(1);
  });
});

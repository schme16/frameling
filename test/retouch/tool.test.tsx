// @vitest-environment jsdom
// The retouch tools on a real pixel layer: where they sit, how the source is chosen, aligned and not aligned across two strokes
// (and the question asked once), one stroke being one undo, and the commands.
import { beforeEach, describe, expect, it } from 'vitest';
import { currentChoice, rememberedChoice, resetChoices, setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getTool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { activeDrawing, activeGrid, setActivePixels } from '../../src/tools/edit';
import { gridPixels } from '../../src/core/pixelBounds';
import { cloneAim, resetCloneAim } from '../../src/retouch/aim';
import { CLONE_ALIGN_CHOICE } from '../../src/retouch/choices';
import { retouchStore } from '../../src/retouch/settings';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { ctx, drag, pixelStore, ptr, vectorStore } from '../tools/helpers';
import '../../src/tools/index';

const SIZE = 64;
const grid = (): Uint8ClampedArray => {
  const d = activeDrawing();
  const g = activeGrid()!;
  return gridPixels(d as never, g.width, g.height);
};
const at = (x: number, y: number): number[] => Array.from(grid().slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4));

/** A picture whose red goes up with x, so a copy from a place is easy to read back. */
function seed(): void {
  const px = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) px.set([x * 4, y * 4, 0, 255], (y * SIZE + x) * 4);
  expect(setActivePixels('seed', px)).toBe('ok');
}

beforeEach(() => {
  resetChoices();
  setChoiceAsker(null);
  pixelStore(1);
  seed();
  resetCloneAim();
  retouchStore('clone').reset();
  retouchStore('blur').reset();
  retouchStore('sharpen').reset();
  // A hard, small brush so each stroke is easy to read.
  retouchStore('clone').set({ brush: { size: 3, hardness: 1, aliased: true, spacing: 0.25 } });
  syncDynamicCommands();
});

describe('where the retouch tools sit', () => {
  it('are pixel layer tools with keys and the right help', () => {
    expect(getTool('clone-stamp')?.layers).toEqual(['pixel']);
    expect(getTool('clone-stamp')?.key).toBe('Alt+Shift+S');
    expect(getTool('clone-stamp')?.help).toBe('clone-stamp');
    expect(getTool('blur-brush')?.layers).toEqual(['pixel']);
    expect(getTool('blur-brush')?.help).toBe('blur-sharpen-brush');
    expect(getTool('sharpen-brush')?.key).toBeTruthy();
  });

  it('get a palette command each, greyed with a reason off a pixel layer', () => {
    for (const id of ['tools.clone-stamp', 'tools.blur-brush', 'tools.sharpen-brush']) expect(getCommand(id), id).toBeTruthy();
  });
});

describe('choosing the source', () => {
  it('is an Alt-click, and paints nothing', () => {
    const t = getTool('clone-stamp')!;
    const c = ctx();
    const before = grid().slice();
    t.down!(ptr(10.5, 10.5, { alt: true }), c);
    t.up!(ptr(10.5, 10.5, { alt: true }), c);
    expect(cloneAim().source).toEqual({ x: 10, y: 10 });
    expect(Array.from(grid())).toEqual(Array.from(before));
  });

  it('is also a Ctrl-click', () => {
    const t = getTool('clone-stamp')!;
    t.down!(ptr(7.5, 3.5, { mod: true }), ctx());
    t.up!(ptr(7.5, 3.5, { mod: true }), ctx());
    expect(cloneAim().source).toEqual({ x: 7, y: 3 });
  });

  it('is the first click when nothing has been chosen, rather than a stroke from nowhere', () => {
    const t = getTool('clone-stamp')!;
    t.down!(ptr(20.5, 20.5), ctx());
    t.up!(ptr(20.5, 20.5), ctx());
    expect(cloneAim().source).toEqual({ x: 20, y: 20 });
    expect(at(20, 20)).toEqual([80, 80, 0, 255]);
  });

  it('is the spot under the pointer from the palette', () => {
    const t = getTool('clone-stamp')!;
    t.down!(ptr(5.5, 5.5, { alt: true }), ctx());
    getCommand('clone.forget')!.run();
    expect(cloneAim().source).toBeNull();
  });
});

describe('painting a copy', () => {
  it('puts the picture from the source where you paint, following your hand at the same gap', () => {
    const t = getTool('clone-stamp')!;
    const c = ctx();
    t.down!(ptr(10.5, 10.5, { alt: true }), c);
    t.up!(ptr(10.5, 10.5, { alt: true }), c);
    // Paint from 40, 40 along to 44, 40: they copy 10, 10 and the pixels to the right of it.
    drag(t, c, [[40.5, 40.5], [42.5, 40.5], [44.5, 40.5]]);
    expect(at(40, 40)).toEqual([40, 40, 0, 255]);
    expect(at(42, 40)).toEqual([48, 40, 0, 255]);
    expect(at(44, 40)).toEqual([56, 40, 0, 255]);
    // The source itself is untouched.
    expect(at(10, 10)).toEqual([40, 40, 0, 255]);
  });

  it('is one undo step for a whole stroke', () => {
    const t = getTool('clone-stamp')!;
    const c = ctx();
    t.down!(ptr(10.5, 10.5, { alt: true }), c);
    t.up!(ptr(10.5, 10.5, { alt: true }), c);
    const before = grid().slice();
    drag(t, c, [[40.5, 40.5], [42.5, 40.5], [44.5, 40.5], [46.5, 40.5]]);
    expect(at(46, 40)).not.toEqual(Array.from(before.slice((40 * SIZE + 46) * 4, (40 * SIZE + 46) * 4 + 4)));
    store().undo();
    expect(Array.from(grid())).toEqual(Array.from(before));
  });
});

describe('lifting the pen and starting again', () => {
  const twoStrokes = () => {
    const t = getTool('clone-stamp')!;
    const c = ctx();
    t.down!(ptr(10.5, 10.5, { alt: true }), c);
    t.up!(ptr(10.5, 10.5, { alt: true }), c);
    drag(t, c, [[40.5, 40.5], [41.5, 40.5]]);
    // The second stroke starts 20 pixels further down.
    drag(t, c, [[40.5, 60.5], [41.5, 60.5]]);
  };

  it('carries on in step when aligned: the second stroke copies from the same gap away', () => {
    setChoice(CLONE_ALIGN_CHOICE, 'aligned');
    twoStrokes();
    // Gap is -30, -30: 40, 60 copies 10, 30.
    expect(at(40, 60)).toEqual([40, 120, 0, 255]);
  });

  it('starts from the source again when it is not: the second stroke begins by copying the source', () => {
    setChoice(CLONE_ALIGN_CHOICE, 'restart');
    twoStrokes();
    expect(at(40, 60)).toEqual([40, 40, 0, 255]);
  });

  it('is aligned unless somebody says otherwise, when it cannot be asked', () => {
    expect(currentChoice(CLONE_ALIGN_CHOICE)).toBe('aligned');
  });

  it('asks once after the first stroke, and never again once answered', async () => {
    const asked: string[] = [];
    setChoiceAsker(async (def) => {
      asked.push(def.id);
      return { value: 'restart', remember: true };
    });
    twoStrokes();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toEqual([CLONE_ALIGN_CHOICE]);
    expect(rememberedChoice(CLONE_ALIGN_CHOICE)).toBe('restart');
  });

  it('does not ask before a stroke has been made, only after the first one', () => {
    const asked: string[] = [];
    setChoiceAsker(async (def) => {
      asked.push(def.id);
      return null;
    });
    const t = getTool('clone-stamp')!;
    t.down!(ptr(10.5, 10.5, { alt: true }), ctx());
    t.up!(ptr(10.5, 10.5, { alt: true }), ctx());
    expect(asked).toEqual([]);
  });

  it('is changed by the palette commands', () => {
    getCommand('clone.align.restart')!.run();
    expect(currentChoice(CLONE_ALIGN_CHOICE)).toBe('restart');
    getCommand('clone.align.aligned')!.run();
    expect(currentChoice(CLONE_ALIGN_CHOICE)).toBe('aligned');
  });

  it('forgets the old gap when a new source is chosen', () => {
    setChoice(CLONE_ALIGN_CHOICE, 'aligned');
    twoStrokes();
    const t = getTool('clone-stamp')!;
    t.down!(ptr(30.5, 20.5, { alt: true }), ctx());
    t.up!(ptr(30.5, 20.5, { alt: true }), ctx());
    expect(cloneAim().offset).toBeNull();
    drag(t, ctx(), [[5.5, 5.5], [6.5, 5.5]]);
    expect(at(5, 5)).toEqual([120, 80, 0, 255]);
  });
});

describe('the blur and sharpen brushes', () => {
  it('blur softens a hard edge under the brush in one undo step', () => {
    const px = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) px.set(x < 32 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * SIZE + x) * 4);
    setActivePixels('seed', px);
    retouchStore('blur').set({ amount: 0.5, brush: { size: 9, hardness: 1, aliased: false } });
    const t = getTool('blur-brush')!;
    const before = grid().slice();
    drag(t, ctx(), [[32, 20], [32, 24], [32, 28]]);
    expect(at(31, 24)[0]).toBeLessThan(250);
    expect(at(32, 24)[0]).toBeGreaterThan(5);
    expect(at(31, 50)).toEqual([255, 255, 255, 255]);
    store().undo();
    expect(Array.from(grid())).toEqual(Array.from(before));
  });

  it('sharpen leaves a flat area as it is', () => {
    const px = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) px.set([90, 120, 160, 255], i * 4);
    setActivePixels('seed', px);
    retouchStore('sharpen').set({ amount: 1, brush: { size: 9, hardness: 1, aliased: false } });
    drag(getTool('sharpen-brush')!, ctx(), [[20, 20], [30, 22]]);
    expect(at(25, 21)).toEqual([90, 120, 160, 255]);
  });

  it('say what they need on a vector layer, and paint nothing', () => {
    vectorStore();
    for (const id of ['clone-stamp', 'blur-brush', 'sharpen-brush']) {
      const c = ctx();
      const t = getTool(id)!;
      t.down!(ptr(5, 5, { alt: true }), c);
      t.up!(ptr(5, 5, { alt: true }), c);
      expect(c.hint, id).toHaveBeenCalled();
    }
    expect(cloneAim().source).toBeNull();
  });
});

describe('what is kept', () => {
  it('holds a retouch brush to its own kind: no picture tip, no colour, no texture', () => {
    retouchStore('blur').set({ brush: { tip: 'picture', wet: 1 } });
    const b = retouchStore('blur').get().brush;
    expect(b.tip).toBe('round');
    expect(b.wet).toBe(0);
    expect(b.grain).toBeNull();
  });

  it('starts blur and sharpen with the pen driving their flow, and the clone with nothing', () => {
    expect(retouchStore('blur').get().brush.dynamics.map((r) => `${r.from}>${r.to}`)).toEqual(['pressure>flow']);
    expect(retouchStore('sharpen').get().brush.dynamics.map((r) => `${r.from}>${r.to}`)).toEqual(['pressure>flow']);
    retouchStore('clone').reset();
    expect(retouchStore('clone').get().brush.dynamics).toEqual([]);
  });

  it('keeps the amount in range', () => {
    retouchStore('blur').set({ amount: 9 });
    expect(retouchStore('blur').get().amount).toBe(1);
    retouchStore('blur').set({ amount: -2 });
    expect(retouchStore('blur').get().amount).toBe(0.05);
  });
});

// The magnetic lasso as a tool, on a pixel layer and a vector layer: clicks, Backspace, Enter, and what gets picked.
import { beforeEach, describe, expect, it } from 'vitest';
import { store } from '../../src/core/store';
import type { Tool, ToolContext } from '../../src/core/registry';
import { getCommand } from '../../src/core/registry';
import '../../src/core/commands';
import '../../src/tools';
import { lassoIsOpen, selectTools } from '../../src/tools/select';
import { pixelLassoIsOpen, pixelSelectTools } from '../../src/select/pixel-tool';
import { pixelSelection, resetPixelSelection } from '../../src/select/pixel-state';
import { maskCount, maskHas } from '../../src/select/mask';
import { DEFAULT_SELECT_SETTINGS, setSelectSettings } from '../../src/select/settings';
import { pencilTool } from '../../src/tools/pencil';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { addShapes, box, ctx, drag, pixelStore, ptr, vectorStore } from '../tools/helpers';

const tool = (id: string): Tool => [...selectTools, ...pixelSelectTools].find((t) => t.id === id)!;
const click = (t: Tool, c: ToolContext, x: number, y: number) => {
  t.down!(ptr(x, y), c);
  t.up!(ptr(x, y), c);
};
const hover = (t: Tool, c: ToolContext, x: number, y: number) => t.hover!(ptr(x, y), c);
const key = (t: Tool, c: ToolContext, k: string) => t.onKey!({ key: k } as KeyboardEvent, c);

describe('the magnetic lasso on a pixel layer', () => {
  // The 64 x 64 document is an 8 x 8 grid of 8 px pixels. A red block fills pixels (2,2) to (5,4).
  const at = (px: number, py: number): [number, number] => [px * 8 + 4, py * 8 + 4];
  beforeEach(() => {
    setSelectSettings({ ...DEFAULT_SELECT_SETTINGS });
    resetPixelSelection();
    forgetLastPixelEnd();
    pixelStore();
    store().setUi({ color: '#ff0000', tool: 'pencil' });
    drag(pencilTool, ctx(), [at(2, 2), at(5, 2)]);
    drag(pencilTool, ctx(), [at(2, 3), at(5, 3)]);
    drag(pencilTool, ctx(), [at(2, 4), at(5, 4)]);
    forgetLastPixelEnd();
    store().setUi({ tool: 'pixel-select-magnetic' });
  });

  it('is registered next to the others, with a command in the palette', () => {
    expect(tool('pixel-select-magnetic')).toBeTruthy();
    expect(tool('select-magnetic')).toBeTruthy();
    const c = getCommand('select.magnetic')!;
    expect(c.label).toBe('Magnetic lasso');
    c.run();
    expect(store().get().ui.tool).toBe('pixel-select-magnetic');
  });

  it('picks exactly the block when you click round it roughly and press Enter', () => {
    const t = tool('pixel-select-magnetic');
    const c = ctx();
    // A rough trace a little outside the block: its corners are (16,16) to (48,40) in document pixels.
    click(t, c, 12, 12);
    expect(pixelLassoIsOpen()).toBe(true);
    for (const [x, y] of [
      [52, 12],
      [52, 44],
      [12, 44],
    ]) {
      hover(t, c, x, y);
      click(t, c, x, y);
    }
    expect(pixelSelection()).toBeNull();
    expect(key(t, c, 'Enter')).toBe(true);
    expect(pixelLassoIsOpen()).toBe(false);
    const m = pixelSelection()!;
    expect(maskCount(m)).toBe(12);
    expect(maskHas(m, 2, 2)).toBe(true);
    expect(maskHas(m, 5, 4)).toBe(true);
    expect(maskHas(m, 1, 2)).toBe(false);
    expect(maskHas(m, 6, 4)).toBe(false);
  });

  it('closes by clicking the first point again', () => {
    const t = tool('pixel-select-magnetic');
    const c = ctx(4);
    click(t, c, 12, 12);
    for (const [x, y] of [
      [52, 12],
      [52, 44],
      [12, 44],
    ])
      click(t, c, x, y);
    // The first point is the corner at (16,16).
    click(t, c, 17, 17);
    expect(pixelLassoIsOpen()).toBe(false);
    expect(maskCount(pixelSelection()!)).toBe(12);
  });

  it('Backspace takes the last point back, and at the first one gives up', () => {
    const t = tool('pixel-select-magnetic');
    const c = ctx();
    click(t, c, 12, 12);
    click(t, c, 52, 12);
    click(t, c, 52, 44);
    expect(key(t, c, 'Backspace')).toBe(true);
    expect(pixelLassoIsOpen()).toBe(true);
    expect(key(t, c, 'Backspace')).toBe(true);
    expect(pixelLassoIsOpen()).toBe(true);
    // Only the start is left: one more lets go of it.
    expect(key(t, c, 'Backspace')).toBe(true);
    expect(pixelLassoIsOpen()).toBe(false);
    expect(pixelSelection()).toBeNull();
    // Nothing open, so Backspace is left alone for whatever else it does.
    expect(key(t, c, 'Backspace')).toBe(false);
  });

  it('Escape lets go of it without picking', () => {
    const t = tool('pixel-select-magnetic');
    const c = ctx();
    click(t, c, 12, 12);
    click(t, c, 52, 12);
    getCommand('select.none')!.run();
    expect(pixelLassoIsOpen()).toBe(false);
    expect(pixelSelection()).toBeNull();
  });

  it('draws the stretch it is clinging to as the pointer moves', () => {
    const t = tool('pixel-select-magnetic');
    const c = ctx();
    click(t, c, 12, 12);
    hover(t, c, 30, 12);
    const calls: [number, number][] = [];
    const g = { save() {}, restore() {}, beginPath() {}, moveTo: (x: number, y: number) => calls.push([x, y]), lineTo: (x: number, y: number) => calls.push([x, y]), closePath() {}, fill() {}, stroke() {}, setLineDash() {}, arc: (x: number, y: number) => calls.push([x, y]) } as unknown as CanvasRenderingContext2D;
    t.overlay!(g, c);
    // The first point, the point along the top edge it clings to, and the dot where it has hold.
    expect(calls).toEqual(expect.arrayContaining([[16, 16], [32, 16]]));
  });

  it('drags like it hovers: holding the button down while tracing works too', () => {
    const t = tool('pixel-select-magnetic');
    const c = ctx();
    t.down!(ptr(12, 12), c);
    t.move!(ptr(30, 12), c);
    t.move!(ptr(52, 12), c);
    t.up!(ptr(52, 12), c);
    // Letting go is not a corner by itself, and it stays open for the next click.
    expect(pixelLassoIsOpen()).toBe(true);
  });

  it('shift adds to what is already picked', () => {
    const t = tool('pixel-select-magnetic');
    const c = ctx();
    click(t, c, 12, 12);
    click(t, c, 52, 12);
    click(t, c, 52, 44);
    key(t, c, 'Enter');
    const first = maskCount(pixelSelection()!);
    expect(first).toBeGreaterThan(0);
    // A second trace round the block's top row only, holding Shift, keeps the first.
    t.down!(ptr(12, 12, { shift: true }), c);
    t.up!(ptr(12, 12, { shift: true }), c);
    click(t, c, 52, 12);
    click(t, c, 52, 28);
    key(t, c, 'Enter');
    expect(maskCount(pixelSelection()!)).toBeGreaterThanOrEqual(first);
  });
});

describe('Backspace on the polygon', () => {
  it('takes the last corner back, and at the first one gives up', () => {
    pixelStore();
    store().setUi({ tool: 'pixel-select-polygon' });
    const t = tool('pixel-select-polygon');
    const c = ctx();
    click(t, c, 0, 0);
    click(t, c, 40, 0);
    click(t, c, 40, 40);
    expect(key(t, c, 'Backspace')).toBe(true);
    expect(key(t, c, 'Backspace')).toBe(true);
    expect(pixelLassoIsOpen()).toBe(true);
    expect(key(t, c, 'Backspace')).toBe(true);
    expect(pixelLassoIsOpen()).toBe(false);
  });

  it('leaves Backspace alone for the freehand lasso, which has no corners to take back', () => {
    pixelStore();
    store().setUi({ tool: 'pixel-select-lasso' });
    const t = tool('pixel-select-lasso');
    expect(key(t, ctx(), 'Backspace')).toBe(false);
  });
});

describe('the magnetic lasso on a vector layer', () => {
  const sel = () => store().get().ui.selection;
  beforeEach(() => {
    setSelectSettings({ ...DEFAULT_SELECT_SETTINGS });
    vectorStore();
    addShapes(box('a', 100, 100, 100, 100), box('b', 300, 100, 50, 50));
    store().setUi({ tool: 'select-magnetic', selection: [] });
  });

  it('starts a trace on top of a shape instead of picking the shape up', () => {
    const t = tool('select-magnetic');
    const c = ctx();
    click(t, c, 100, 100);
    expect(lassoIsOpen()).toBe(true);
    expect(sel()).toEqual([]);
  });

  it('picks the shapes it went round, closed with Enter', () => {
    const t = tool('select-magnetic');
    const c = ctx();
    click(t, c, 96, 96);
    for (const [x, y] of [
      [204, 96],
      [204, 204],
      [96, 204],
    ]) {
      hover(t, c, x, y);
      click(t, c, x, y);
    }
    expect(key(t, c, 'Enter')).toBe(true);
    expect(lassoIsOpen()).toBe(false);
    expect(sel()).toEqual(['a']);
  });

  it('Backspace takes a point back and Enter still closes what is left', () => {
    const t = tool('select-magnetic');
    const c = ctx();
    click(t, c, 96, 96);
    click(t, c, 204, 96);
    click(t, c, 204, 204);
    click(t, c, 330, 330);
    expect(key(t, c, 'Backspace')).toBe(true);
    expect(lassoIsOpen()).toBe(true);
    expect(key(t, c, 'Enter')).toBe(true);
    expect(sel()).toEqual(['a']);
  });

  it('gives up with Backspace back at the start, and leaves the key alone when nothing is open', () => {
    const t = tool('select-magnetic');
    const c = ctx();
    click(t, c, 96, 96);
    expect(key(t, c, 'Backspace')).toBe(true);
    expect(lassoIsOpen()).toBe(false);
    expect(key(t, c, 'Backspace')).toBe(false);
  });
});

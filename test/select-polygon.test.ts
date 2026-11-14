// The Polygon way of picking: the mode itself, and the words that go with it.
import { describe, expect, it } from 'vitest';
import { modeOfTool, WAYS, type SelectMode } from '../src/select/ways';
import { maskCount, maskHas, polygonMask } from '../src/select/mask';
import { store } from '../src/core/store';
import type { Tool, ToolContext } from '../src/core/registry';
import '../src/core/commands';
import '../src/tools';
import { lassoIsOpen, selectTools } from '../src/tools/select';
import { pixelLassoIsOpen, pixelSelectTools } from '../src/select/pixel-tool';
import { pixelSelection, setPixelSelection } from '../src/select/pixel-state';
import { addShapes, box, ctx, pixelStore, ptr, vectorStore } from './tools/helpers';

describe('the polygon select mode', () => {
  it('is a tool of its own, on both kinds of layer', () => {
    const modes: SelectMode[] = WAYS.map((w) => w.mode);
    expect(modes).toContain('polygon');
    expect(modeOfTool('select-polygon')).toBe('polygon');
    expect(modeOfTool('pixel-select-polygon')).toBe('polygon');
    // Anything else is the box, which is what Select has always meant.
    expect(modeOfTool('pencil')).toBe('box');
  });

  it('picks the pixels inside the corners you clicked', () => {
    // A triangle across the top-left of an 8 x 8 grid.
    const m = polygonMask(8, 8, [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 6 },
    ]);
    expect(maskHas(m, 1, 1)).toBe(true);
    expect(maskHas(m, 7, 7)).toBe(false);
  });

  it('takes a square back as a square', () => {
    const m = polygonMask(4, 4, [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
      { x: 1, y: 3 },
    ]);
    expect(maskHas(m, 2, 2)).toBe(true);
    expect(maskHas(m, 0, 0)).toBe(false);
  });
});

describe('closing a polygon', () => {
  const sel = () => store().get().ui.selection;
  const polyTool = (id: string) => [...selectTools, ...pixelSelectTools].find((t) => t.id === id)!;
  const click = (tool: Tool, c: ToolContext, x: number, y: number) => {
    tool.down!(ptr(x, y), c);
    tool.up!(ptr(x, y), c);
  };
  const enter = (tool: Tool, c: ToolContext) => tool.onKey!({ key: 'Enter' } as KeyboardEvent, c);

  it('waits for the next corner on a vector layer, and Enter closes it', () => {
    vectorStore();
    store().setUi({ tool: 'select-polygon' });
    addShapes(box('a', 10, 10, 20, 20));
    const tool = polyTool('select-polygon');
    const c = ctx();
    click(tool, c, 0, 0);
    click(tool, c, 100, 0);
    click(tool, c, 100, 100);
    // Three corners in and nothing is picked yet: the polygon is still open.
    expect(lassoIsOpen()).toBe(true);
    expect(sel()).toEqual([]);
    expect(enter(tool, c)).toBe(true);
    expect(lassoIsOpen()).toBe(false);
    expect(sel()).toEqual(['a']);
  });

  it('Enter closes it on a pixel layer too', () => {
    pixelStore();
    store().setUi({ tool: 'pixel-select-polygon' });
    setPixelSelection(null);
    const tool = polyTool('pixel-select-polygon');
    const c = ctx();
    click(tool, c, 0, 0);
    click(tool, c, 40, 0);
    click(tool, c, 40, 40);
    expect(pixelLassoIsOpen()).toBe(true);
    expect(pixelSelection()).toBeNull();
    expect(enter(tool, c)).toBe(true);
    expect(pixelLassoIsOpen()).toBe(false);
    expect(maskCount(pixelSelection()!)).toBeGreaterThan(0);
  });

  it('leaves Enter alone when no polygon is open, so it still plays', () => {
    vectorStore();
    store().setUi({ tool: 'select-polygon' });
    expect(enter(polyTool('select-polygon'), ctx())).toBe(false);
    pixelStore();
    store().setUi({ tool: 'pixel-select-polygon' });
    expect(enter(polyTool('pixel-select-polygon'), ctx())).toBe(false);
  });
});

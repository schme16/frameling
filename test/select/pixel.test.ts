import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getPx } from '../../src/canvas/pixels';
import { getCommand } from '../../src/core/registry';
import '../../src/core/commands';
import '../../src/tools';
import { pencilTool } from '../../src/tools/pencil';
import { fillTool } from '../../src/tools/fill';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { DEFAULT_PIXEL_SETTINGS, setPixelSettings } from '../../src/pixel/settings';
import { pixelSelectTool } from '../../src/select/pixel-tool';
import { isFloating, pixelSelection, resetPixelSelection, setPixelSelection } from '../../src/select/pixel-state';
import { clearPixelClipboard } from '../../src/select/commands';
import { DEFAULT_SELECT_SETTINGS, setSelectSettings } from '../../src/select/settings';
import { maskBounds, maskCount, rectMask } from '../../src/select/mask';
import { ctx, drag, pixelStore } from '../tools/helpers';

// 64x64 document at 8 per pixel: an 8x8 grid. at(px, py) is the middle of an art pixel.
const at = (px: number, py: number): [number, number] => [px * 8 + 4, py * 8 + 4];
const drawing = () => {
  const { doc, ui } = store().get();
  const layer = doc.layers[0];
  const cel = layer.cels.find((c) => ui.frame >= c.start && ui.frame < c.start + c.length);
  return cel ? (doc.drawings[cel.drawingId] as PixelDrawing) : undefined;
};
const hex = (x: number, y: number) => {
  const d = drawing();
  if (!d) return null;
  const [r, g, b, a] = getPx(d.pixels, d.width, x, y);
  return a ? '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') : null;
};
const run = (id: string) => void getCommand(id)!.run();
const enabled = (id: string) => getCommand(id)!.enabled?.(store().get()) ?? true;

/** Red pixels at (1,1) and (2,1), blue at (5,5). */
function sprite() {
  store().setUi({ color: '#ff0000' });
  drag(pencilTool, ctx(), [at(1, 1), at(2, 1)]);
  forgetLastPixelEnd();
  store().setUi({ color: '#0000ff' });
  drag(pencilTool, ctx(), [at(5, 5), at(5, 5)]);
  forgetLastPixelEnd();
}

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
  setSelectSettings({ ...DEFAULT_SELECT_SETTINGS });
  forgetLastPixelEnd();
  resetPixelSelection();
  clearPixelClipboard();
  pixelStore();
  sprite();
  store().setUi({ tool: 'pixel-select' });
});

describe('picking pixels', () => {
  it('a box selects whole art pixels, and a click elsewhere lets go', () => {
    drag(pixelSelectTool, ctx(), [at(0, 0), at(3, 2)]);
    expect(maskBounds(pixelSelection()!)).toEqual({ x0: 0, y0: 0, x1: 3, y1: 2 });
    drag(pixelSelectTool, ctx(), [at(7, 7), at(7, 7)]);
    expect(pixelSelection()).toBeNull();
  });

  it('Shift adds and Alt takes away', () => {
    drag(pixelSelectTool, ctx(), [at(0, 0), at(1, 0)]);
    drag(pixelSelectTool, ctx(), [at(0, 2), at(1, 2)], { shift: true });
    expect(maskCount(pixelSelection()!)).toBe(4);
    drag(pixelSelectTool, ctx(), [at(0, 0), at(0, 2)], { alt: true });
    expect(maskCount(pixelSelection()!)).toBe(2);
  });

  it('the lasso picks what it goes round', () => {
    setSelectSettings({ mode: 'lasso' });
    drag(pixelSelectTool, ctx(), [
      [0, 0],
      [32, 0],
      [32, 24],
      [0, 24],
    ]);
    expect(maskBounds(pixelSelection()!)).toEqual({ x0: 0, y0: 0, x1: 3, y1: 2 });
  });

  it('the lasso can have straight sides with Alt+clicks', () => {
    setSelectSettings({ mode: 'lasso' });
    const c = ctx();
    pixelSelectTool.down!(ptrAt(0, 0), c);
    pixelSelectTool.up!({ ...ptrAt(0, 0), alt: true }, c);
    pixelSelectTool.down!({ ...ptrAt(32, 0), alt: true }, c);
    pixelSelectTool.up!({ ...ptrAt(32, 0), alt: true }, c);
    pixelSelectTool.down!(ptrAt(32, 32), c);
    expect(pixelSelection()).toBeNull();
    pixelSelectTool.up!(ptrAt(32, 32), c);
    // A triangle: (0,0), (32,0), (32,32) in document pixels.
    const m = pixelSelection()!;
    expect(m).not.toBeNull();
    expect(maskBounds(m)!.x1).toBe(3);
  });

  it('the magic wand picks a colour', () => {
    setSelectSettings({ mode: 'wand' });
    drag(pixelSelectTool, ctx(), [at(1, 1), at(1, 1)]);
    expect(maskCount(pixelSelection()!)).toBe(2);
    setSelectSettings({ contiguous: false });
    drag(pixelSelectTool, ctx(), [at(5, 5), at(5, 5)], { shift: true });
    expect(maskCount(pixelSelection()!)).toBe(3);
  });

  it('select all, invert and deselect', () => {
    run('select.all');
    expect(maskCount(pixelSelection()!)).toBe(64);
    setPixelSelection(rectMask(8, 8, 0, 0, 0, 7));
    run('select.invert');
    expect(maskCount(pixelSelection()!)).toBe(56);
    run('select.none');
    expect(pixelSelection()).toBeNull();
  });
});

function ptrAt(x: number, y: number) {
  return { x, y, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 };
}

describe('moving selected pixels', () => {
  it('lifts them, shows the move without touching the document, and drops it as one undo step', () => {
    setPixelSelection(rectMask(8, 8, 1, 1, 2, 1));
    const before = store().get().doc;
    drag(pixelSelectTool, ctx(), [at(1, 1), at(2, 2)]);
    expect(isFloating()).toBe(true);
    expect(store().get().doc).toBe(before);
    // Nudges add to the same move.
    run('select.nudgeRight');
    run('select.none');
    expect(isFloating()).toBe(false);
    expect(hex(1, 1)).toBeNull();
    expect(hex(3, 2)).toBe('#ff0000');
    expect(hex(4, 2)).toBe('#ff0000');
    expect(store().undoLabel()).toBe('Move pixels');
    store().undo();
    expect(hex(1, 1)).toBe('#ff0000');
    expect(hex(3, 2)).toBeNull();
  });

  it('undo while lifted puts them back without undoing anything else', () => {
    setPixelSelection(rectMask(8, 8, 1, 1, 2, 1));
    const doc = store().get().doc;
    drag(pixelSelectTool, ctx(), [at(1, 1), at(1, 4)]);
    run('edit.undo');
    expect(isFloating()).toBe(false);
    expect(store().get().doc).toBe(doc);
    expect(maskBounds(pixelSelection()!)).toEqual({ x0: 1, y0: 1, x1: 2, y1: 1 });
  });

  it('switching tool drops them', () => {
    setPixelSelection(rectMask(8, 8, 1, 1, 2, 1));
    run('select.nudgeDown');
    store().setUi({ tool: 'pencil' });
    expect(isFloating()).toBe(false);
    expect(hex(1, 2)).toBe('#ff0000');
    expect(maskBounds(pixelSelection()!)).toEqual({ x0: 1, y0: 2, x1: 2, y1: 2 });
  });

  it('copy and paste lands floating in the same place', () => {
    setPixelSelection(rectMask(8, 8, 1, 1, 2, 1));
    run('edit.copy');
    run('select.none');
    run('edit.paste');
    expect(isFloating()).toBe(true);
    run('select.nudgeDown');
    run('select.none');
    expect(hex(1, 1)).toBe('#ff0000');
    expect(hex(1, 2)).toBe('#ff0000');
    expect(store().undoLabel()).toBe('Paste');
  });

  it('cut and delete clear just the selection', () => {
    setPixelSelection(rectMask(8, 8, 1, 1, 1, 1));
    run('edit.cut');
    expect(hex(1, 1)).toBeNull();
    expect(hex(2, 1)).toBe('#ff0000');
    setPixelSelection(rectMask(8, 8, 5, 5, 5, 5));
    run('edit.delete');
    expect(hex(5, 5)).toBeNull();
  });
});

describe('working inside the selection', () => {
  it('painting stays inside', () => {
    setPixelSelection(rectMask(8, 8, 0, 3, 3, 3));
    store().setUi({ tool: 'pencil', color: '#00ff00' });
    drag(pencilTool, ctx(), [at(0, 3), at(7, 3)]);
    expect(hex(3, 3)).toBe('#00ff00');
    expect(hex(4, 3)).toBeNull();
  });

  it('the paint bucket stays inside', () => {
    setPixelSelection(rectMask(8, 8, 0, 6, 7, 7));
    store().setUi({ fillColor: '#00ff00' });
    drag(fillTool, ctx(), [at(0, 7), at(0, 7)]);
    expect(hex(0, 7)).toBe('#00ff00');
    expect(hex(0, 0)).toBeNull();
  });

  it('flips just the selection, and the selection flips too', () => {
    setPixelSelection(rectMask(8, 8, 1, 1, 3, 1));
    run('pixel.flipH');
    expect(hex(1, 1)).toBeNull();
    expect(hex(3, 1)).toBe('#ff0000');
    expect(hex(5, 5)).toBe('#0000ff');
  });

  it('turns just the selection', () => {
    setPixelSelection(rectMask(8, 8, 1, 1, 2, 2));
    run('pixel.rotateRight');
    expect(hex(5, 5)).toBe('#0000ff');
    expect(maskBounds(pixelSelection()!)).toEqual({ x0: 1, y0: 1, x1: 2, y1: 2 });
    expect(hex(2, 1)).toBe('#ff0000');
    expect(hex(2, 2)).toBe('#ff0000');
    expect(hex(1, 1)).toBeNull();
  });

  it('outlines only the selected art', () => {
    setPixelSelection(rectMask(8, 8, 4, 4, 6, 6));
    store().setUi({ color: '#000000' });
    run('pixel.outline');
    expect(hex(5, 4)).toBe('#000000');
    expect(hex(1, 0)).toBeNull();
  });

  it('the Edit commands still work on vector layers', () => {
    expect(enabled('select.all')).toBe(true);
  });
});

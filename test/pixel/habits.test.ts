// @vitest-environment jsdom
// Aseprite habits: brush size keys, palette colour keys, zoom presets, and the Alt temporary eyedropper.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { DEFAULT_TOOL_SETTINGS, getToolSettings, setToolSettings } from '../../src/tools/settings';
import { DEFAULT_PIXEL_SETTINGS, getPixelSettings, setPixelSettings } from '../../src/pixel/settings';
import { setDocPalette } from '../../src/pixel/commands';
import { MAX_BRUSH, MAX_DITHER, stepPaletteColor, stepSize } from '../../src/pixel/habits';
import { altPicks, plainPointer } from '../../src/tools/eyedropper';
import { dispatchKey, resetKeyboard, tabIsShortcut } from '../../src/ui/keyboard';
import { setPrefs } from '../../src/ui/prefs';
import { getView } from '../../src/canvas/controller';
import '../../src/pixel';
import '../../src/canvas/commands';
import { pixelStore, ptr, vectorStore } from '../tools/helpers';

const run = (id: string) => getCommand(id)!.run();
const enabled = (id: string) => (getCommand(id)!.enabled ? getCommand(id)!.enabled!(store().get()) : true);
const SIZES = { pixelBrushSize: 3, eraserPixelSize: 5, ditherSize: 4, spraySize: 8 };

describe('stepSize', () => {
  it('steps the brush, the eraser and dither by one', () => {
    expect(stepSize('brush', SIZES, 1)).toEqual({ set: { pixelBrushSize: 4 } });
    expect(stepSize('shade', SIZES, -1)).toEqual({ set: { pixelBrushSize: 2 } });
    expect(stepSize('eraser', SIZES, 1)).toEqual({ set: { eraserPixelSize: 6 } });
    expect(stepSize('dither', SIZES, -1)).toEqual({ set: { ditherSize: 3 } });
  });
  it('stops at 1 and at the biggest', () => {
    expect(stepSize('brush', { ...SIZES, pixelBrushSize: 1 }, -1)).toBeNull();
    expect(stepSize('brush', { ...SIZES, pixelBrushSize: MAX_BRUSH }, 1)).toBeNull();
    expect(stepSize('dither', { ...SIZES, ditherSize: MAX_DITHER }, 1)).toBeNull();
  });
  it('the pencil is the one sized tool: it steps its own size and stays the pencil', () => {
    expect(stepSize('pencil', { ...SIZES, pixelBrushSize: 1 }, 1)).toEqual({ set: { pixelBrushSize: 2 } });
    expect(stepSize('pencil', { ...SIZES, pixelBrushSize: 1 }, -1)).toBeNull();
  });
  it('the spray steps its own size', () => {
    expect(stepSize('spray', SIZES, 1)).toEqual({ set: { spraySize: 9 } });
  });
  it('tools without a size do nothing', () => {
    for (const t of ['fill', 'line', 'rect', 'eyedropper', 'pixel-select']) expect(stepSize(t, SIZES, 1), t).toBeNull();
  });
});

describe('stepPaletteColor', () => {
  const colors = ['#000000', '#111111', '#222222'];
  it('goes along and round the ends', () => {
    expect(stepPaletteColor(colors, 0, 1)).toBe(1);
    expect(stepPaletteColor(colors, 2, 1)).toBe(0);
    expect(stepPaletteColor(colors, 0, -1)).toBe(2);
  });
  it('with no palette colour in use, starts at an end', () => {
    expect(stepPaletteColor(colors, null, 1)).toBe(0);
    expect(stepPaletteColor(colors, null, -1)).toBe(2);
  });
  it('an empty palette has nowhere to go', () => {
    expect(stepPaletteColor([], null, 1)).toBeNull();
  });
});

describe('the size commands', () => {
  beforeEach(() => {
    setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
    setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
    pixelStore();
  });
  it('bigger and smaller change the brush you are holding', () => {
    store().setUi({ tool: 'brush' });
    run('pixel.sizeUp');
    run('pixel.sizeUp');
    expect(getToolSettings().pixelBrushSize).toBe(3);
    run('pixel.sizeDown');
    expect(getToolSettings().pixelBrushSize).toBe(2);
  });
  it('bigger with the pencil stays on the pencil and gives it a size', () => {
    store().setUi({ tool: 'pencil' });
    run('pixel.sizeUp');
    expect(store().get().ui.tool).toBe('pencil');
    expect(getToolSettings().pixelBrushSize).toBe(2);
  });
  it('the eraser and dither keep their own sizes', () => {
    store().setUi({ tool: 'eraser' });
    run('pixel.sizeUp');
    expect(getToolSettings().eraserPixelSize).toBe(2);
    expect(getToolSettings().pixelBrushSize).toBe(1);
    store().setUi({ tool: 'dither' });
    run('pixel.sizeDown');
    expect(getPixelSettings().ditherSize).toBe(3);
  });
  it('are off (so the key passes on) when there is nothing to size', () => {
    store().setUi({ tool: 'fill' });
    expect(enabled('pixel.sizeUp')).toBe(false);
    store().setUi({ tool: 'brush' });
    expect(enabled('pixel.sizeUp')).toBe(true);
    expect(enabled('pixel.sizeDown')).toBe(false); // already 1
    vectorStore();
    expect(enabled('pixel.sizeUp')).toBe(false);
  });
});

describe('the palette colour commands', () => {
  beforeEach(() => {
    pixelStore();
    setDocPalette({ name: 'T', colors: ['#000000', '#444444', '#888888', '#cccccc'] });
    store().setUi({ tool: 'brush', activeWell: 'stroke', color: '#444444', strokeOn: true });
  });
  it('next and previous move the colour you paint with', () => {
    run('pixel.nextColor');
    expect(store().get().ui.color).toBe('#888888');
    run('pixel.previousColor');
    run('pixel.previousColor');
    expect(store().get().ui.color).toBe('#000000');
    run('pixel.previousColor');
    expect(store().get().ui.color).toBe('#cccccc');
  });
  it('the colour in front is the fill when the bucket is in hand', () => {
    store().setUi({ activeWell: 'fill', fillColor: '#888888' });
    run('pixel.nextColor');
    expect(store().get().ui.fillColor).toBe('#cccccc');
    expect(store().get().ui.color).toBe('#444444');
  });
});

describe('the zoom presets', () => {
  it('1 to 6 are 100% to 3200% of an art pixel', () => {
    for (const [n, pct] of [[1, 100], [2, 200], [3, 400], [4, 800], [5, 1600], [6, 3200]]) {
      expect(getCommand(`pixel.zoom${n}`)!.label).toBe(`Zoom ${pct}%`);
    }
  });
  it('set the zoom so one art pixel is that many screen pixels', () => {
    pixelStore(8);
    run('pixel.zoom4');
    expect(getView().zoom).toBeCloseTo(1, 5); // 800% of an 8 pixel art pixel
    run('pixel.zoom1');
    expect(getView().zoom).toBeCloseTo(0.125, 5);
  });
  it('do nothing on a page with no pixel layer', () => {
    vectorStore();
    expect(enabled('pixel.zoom1')).toBe(false);
  });
});

describe('Alt temporary eyedropper', () => {
  it('replaces the painting tools on a pixel layer', () => {
    for (const t of ['pencil', 'brush', 'eraser', 'fill', 'shade', 'dither']) expect(altPicks(t, 'pixel', true), t).toBe(true);
  });
  it('needs Alt, a pixel layer, and a painting tool', () => {
    expect(altPicks('pencil', 'pixel', false)).toBe(false);
    expect(altPicks('pencil', 'vector', true)).toBe(false);
    for (const t of ['line', 'rect', 'ellipse', 'pixel-select', 'eyedropper', 'hand']) expect(altPicks(t, 'pixel', true), t).toBe(false);
  });
  it('picks from everything you see, not just the layer (Alt only asked for the pick)', () => {
    expect(plainPointer(ptr(1, 2, { alt: true })).alt).toBe(false);
    const p = ptr(1, 2);
    expect(plainPointer(p)).toBe(p);
  });
});

describe('Tab as a shortcut', () => {
  it('only when nothing is focused and the mouse is over the canvas', () => {
    expect(tabIsShortcut(document.body, true)).toBe(true);
    expect(tabIsShortcut(document.body, false)).toBe(false);
    const b = document.createElement('button');
    document.body.appendChild(b);
    expect(tabIsShortcut(b, true)).toBe(false);
    const cv = document.createElement('div');
    cv.className = 'cv-root';
    document.body.appendChild(cv);
    expect(tabIsShortcut(cv, true)).toBe(true);
  });
});

describe('through the keyboard, with the Aseprite keys picked', () => {
  const press = (key: string, init: KeyboardEventInit = {}) => dispatchKey(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  beforeEach(() => {
    resetKeyboard();
    setPrefs({ keymapSet: 'pixel', keymap: {} });
    setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
    pixelStore();
    store().setUi({ tool: 'brush' });
  });
  afterEach(() => {
    setPrefs({ keymapSet: 'frameling', keymap: {} });
    resetKeyboard();
  });
  it('+ and - change the brush', () => {
    expect(press('+')).toBe(true);
    expect(press('=')).toBe(true);
    expect(getToolSettings().pixelBrushSize).toBe(3);
    expect(press('-')).toBe(true);
    expect(getToolSettings().pixelBrushSize).toBe(2);
  });
  it('[ and ] step the palette', () => {
    setDocPalette({ name: 'T', colors: ['#000000', '#444444', '#888888'] });
    store().setUi({ activeWell: 'stroke', color: '#444444', strokeOn: true });
    expect(press(']')).toBe(true);
    expect(store().get().ui.color).toBe('#888888');
    expect(press('[')).toBe(true);
    expect(store().get().ui.color).toBe('#444444');
  });
  it('1 to 6 zoom', () => {
    expect(press('4')).toBe(true);
    expect(getView().zoom).toBeCloseTo(1, 5);
  });
  it('Tab leaves focus alone unless the mouse is over the canvas with nothing focused', () => {
    const b = document.createElement('button');
    document.body.appendChild(b);
    b.focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    b.dispatchEvent(e);
    expect(dispatchKey(e)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
  });
  it('does nothing with the default keys', () => {
    setPrefs({ keymapSet: 'frameling' });
    resetKeyboard();
    expect(press('+')).toBe(false);
    expect(getToolSettings().pixelBrushSize).toBe(1);
  });
});

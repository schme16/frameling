import { asGrid } from '../helpers/grid';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getPx } from '../../src/canvas/pixels';
import { setChoice } from '../../src/core/choices';
import { getCommand } from '../../src/core/registry';
import { brushTool } from '../../src/tools/brush';
import { pencilTool } from '../../src/tools/pencil';
import { ellipseTool, lineTool, rectTool } from '../../src/tools/shapes';
import { fillTool } from '../../src/tools/fill';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { ditherTool, shadeTool } from '../../src/pixel/tools';
import { changePaletteColor, setDocPalette } from '../../src/pixel/commands';
import { DEFAULT_PIXEL_SETTINGS, setPixelSettings } from '../../src/pixel/settings';
import '../../src/pixel';
import { loadFile, saveFile } from '../../src/io/file';
import { ctx, drag, pixelStore } from '../tools/helpers';

// 64x64 document at 8 per pixel: an 8x8 grid. at(px, py) is the middle of an art pixel.
const at = (px: number, py: number): [number, number] => [px * 8 + 4, py * 8 + 4];
const drawing = () => asGrid(Object.values(store().get().doc.drawings)[0] as PixelDrawing);
const px = (x: number, y: number) => {
  const d = drawing();
  return getPx(d.pixels, d.width, x, y);
};
const hex = (x: number, y: number) => {
  const [r, g, b, a] = px(x, y);
  return a ? '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') : null;
};
const layer = () => store().get().doc.layers[0] as PixelLayer;

const PAL = { name: 'Test', colors: ['#000000', '#444444', '#888888', '#cccccc', '#ff0000'], ramps: [4] };

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
  forgetLastPixelEnd();
});

describe('shade', () => {
  it('moves palette colours one step per stroke and leaves others alone', () => {
    pixelStore();
    setDocPalette(PAL);
    store().setUi({ color: '#444444' });
    drag(pencilTool, ctx(), [at(0, 0), at(3, 0)]);
    store().setUi({ color: '#123456' });
    drag(pencilTool, ctx(), [at(5, 0), at(5, 0)]);
    setPixelSettings({ shadeLighter: true });
    drag(shadeTool, ctx(), [at(0, 0), at(5, 0), at(0, 0)]);
    expect(hex(0, 0)).toBe('#888888');
    expect(hex(3, 0)).toBe('#888888');
    expect(hex(5, 0)).toBe('#123456');
    expect(hex(6, 0)).toBeNull();
    drag(shadeTool, ctx(), [at(0, 0), at(0, 0)]);
    expect(hex(0, 0)).toBe('#cccccc');
    drag(shadeTool, ctx(), [at(0, 0), at(0, 0)]);
    expect(hex(0, 0)).toBe('#cccccc');
    setPixelSettings({ shadeLighter: false });
    drag(shadeTool, ctx(), [at(1, 0), at(1, 0)]);
    expect(hex(1, 0)).toBe('#444444');
    expect(store().undoLabel()).toBe('Shade pixels');
  });
});

describe('dither', () => {
  it('paints the stroke and fill colours in a fixed checker', () => {
    pixelStore();
    store().setUi({ color: '#000000', fillColor: '#ffffff' });
    setPixelSettings({ ditherPattern: 'checker', ditherSize: 4 });
    drag(ditherTool, ctx(), [at(2, 2), at(2, 2)]);
    // A size 4 brush at (2, 2) covers 1..4 each way.
    expect(hex(2, 2)).toBe('#000000');
    expect(hex(2, 1)).toBe('#ffffff');
    expect(hex(1, 1)).toBe('#000000');
    expect(hex(0, 0)).toBeNull();
  });
  it('leaves the light squares alone when the fill is none', () => {
    pixelStore();
    store().setUi({ color: '#000000', fillColor: null });
    drag(ditherTool, ctx(), [at(2, 2), at(2, 2)]);
    expect(hex(2, 2)).toBe('#000000');
    expect(hex(2, 1)).toBeNull();
  });
});

describe('mirror drawing', () => {
  it('copies pencil, brush and shape pixels across the mirror lines', () => {
    pixelStore();
    store().setUi({ color: '#ff0000' });
    setPixelSettings({ symmetry: 'h' });
    drag(pencilTool, ctx(), [at(1, 1), at(1, 1)]);
    expect(hex(6, 1)).toBe('#ff0000');
    setPixelSettings({ symmetry: 'both' });
    drag(brushTool, ctx(), [at(0, 0), at(0, 0)]);
    expect(hex(7, 0)).toBe('#ff0000');
    expect(hex(0, 7)).toBe('#ff0000');
    expect(hex(7, 7)).toBe('#ff0000');
    setPixelSettings({ symmetry: 'v', axisY: 3.5 });
    drag(lineTool, ctx(), [at(0, 5), at(2, 5)]);
    expect(hex(2, 1)).toBe('#ff0000');
  });
});

describe('pixel shapes on a pixel layer', () => {
  it('draws a filled rectangle with an outline, and an ellipse', () => {
    pixelStore();
    store().setUi({ color: '#000000', fillColor: '#ff0000', strokeOn: true });
    drag(rectTool, ctx(), [at(0, 0), at(3, 3)]);
    expect(hex(0, 0)).toBe('#000000');
    expect(hex(1, 1)).toBe('#ff0000');
    expect(hex(4, 4)).toBeNull();
    store().setUi({ fillColor: null });
    drag(ellipseTool, ctx(), [at(0, 0), at(6, 6)]);
    expect(hex(3, 0)).toBe('#000000');
  });
});

describe('palette lock and recolouring', () => {
  it('snaps painted colours to the palette, bucket included', () => {
    pixelStore();
    setDocPalette(PAL);
    store().update('lock', (d) => void ((d.layers[0] as PixelLayer).paletteLock = true));
    store().setUi({ color: '#ee1111', fillColor: '#999999' });
    drag(pencilTool, ctx(), [at(0, 0), at(0, 0)]);
    expect(hex(0, 0)).toBe('#ff0000');
    fillTool.down!({ x: 60, y: 60, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 }, ctx());
    expect(hex(7, 7)).toBe('#888888');
  });

  it('reduces a drawing to the palette, and the lock command toggles', () => {
    pixelStore();
    setDocPalette(PAL);
    store().setUi({ color: '#fe0101' });
    drag(pencilTool, ctx(), [at(0, 0), at(0, 0)]);
    getCommand('pixel.reduceToPalette')!.run();
    expect(hex(0, 0)).toBe('#ff0000');
    getCommand('pixel.paletteLock')!.run();
    expect(layer().paletteLock).toBe(true);
    getCommand('pixel.paletteLock')!.run();
    expect(layer().paletteLock).toBeUndefined();
  });

  it('changing a palette colour recolours its pixels in one undo step (or not, as chosen)', () => {
    pixelStore();
    setDocPalette(PAL);
    store().setUi({ color: '#ff0000' });
    drag(pencilTool, ctx(), [at(0, 0), at(0, 0)]);
    setChoice('palette.recolour', 'recolour');
    changePaletteColor(4, '#00ff00');
    expect(hex(0, 0)).toBe('#00ff00');
    expect(store().get().doc.palette!.colors[4]).toBe('#00ff00');
    store().undo();
    expect(hex(0, 0)).toBe('#ff0000');
    setChoice('palette.recolour', 'palette-only');
    changePaletteColor(4, '#0000ff');
    expect(hex(0, 0)).toBe('#ff0000');
    setChoice('palette.recolour', undefined);
  });
});

describe('drawing commands', () => {
  it('flips, turns and outlines the drawing on this frame', () => {
    pixelStore();
    store().setUi({ color: '#ff0000' });
    drag(pencilTool, ctx(), [at(2, 2), at(2, 4)]);
    getCommand('pixel.rotateRight')!.run();
    expect(hex(1, 3)).toBe('#ff0000');
    expect(hex(3, 3)).toBe('#ff0000');
    expect(hex(2, 2)).toBeNull();
    store().setUi({ color: '#000000' });
    getCommand('pixel.outline')!.run();
    expect(hex(0, 3)).toBe('#000000');
    expect(hex(2, 2)).toBe('#000000');
    expect(store().undoLabel()).toBe('Add outline');
  });
});

describe('saving', () => {
  it('keeps the palette and the palette lock, and old files have neither', () => {
    pixelStore();
    setDocPalette(PAL);
    store().update('lock', (d) => void ((d.layers[0] as PixelLayer).paletteLock = true));
    const back = loadFile(saveFile(store().get().doc)).doc;
    expect(back.palette).toEqual(PAL);
    expect((back.layers[0] as PixelLayer).paletteLock).toBe(true);
    pixelStore();
    const plain = loadFile(saveFile(store().get().doc)).doc;
    expect(plain.palette).toBeUndefined();
    expect('paletteLock' in plain.layers[0]).toBe(false);
  });
});

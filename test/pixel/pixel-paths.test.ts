// The pen, polygon and star on a pixel layer: clean pixel outlines and fills, like the pixel rectangle.
import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getPx } from '../../src/canvas/pixels';
import { plotPolygon } from '../../src/pixel/raster';
import { polygonTool, starTool } from '../../src/tools/polystar';
import { penTool } from '../../src/tools/pen';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { DEFAULT_PIXEL_SETTINGS, setPixelSettings } from '../../src/pixel/settings';
import '../../src/pixel';
import { ctx, drag, pixelStore, ptr } from '../tools/helpers';

const drawing = () => Object.values(store().get().doc.drawings)[0] as PixelDrawing | undefined;
const hex = (x: number, y: number) => {
  const d = drawing()!;
  const [r, g, b, a] = getPx(d.pixels, d.width, x, y);
  return a ? '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') : null;
};
const count = (c: string) => {
  const d = drawing()!;
  let n = 0;
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) if (hex(x, y) === c) n++;
  return n;
};

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
});

describe('plotPolygon', () => {
  it('fills cells whose middles are inside and outlines the corners', () => {
    const fill = new Set<string>();
    const edge = new Set<string>();
    plotPolygon([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], true, (x, y) => void edge.add(`${x},${y}`), (x, y) => void fill.add(`${x},${y}`));
    expect(fill.size).toBe(16);
    expect(edge.has('0,0') && edge.has('4,4') && edge.has('2,0')).toBe(true);
  });
  it('leaves an open line unfilled', () => {
    const fill: string[] = [];
    const edge: string[] = [];
    plotPolygon([{ x: 0.5, y: 0.5 }, { x: 3.5, y: 0.5 }], false, (x, y) => void edge.push(`${x},${y}`), (x, y) => void fill.push(`${x},${y}`));
    expect(fill).toEqual([]);
    expect(edge).toEqual(['0,0', '1,0', '2,0', '3,0']);
  });
});

describe('on a pixel layer', () => {
  it('the polygon paints a filled shape with an outline, one undo step', () => {
    pixelStore(1);
    store().setUi({ color: '#000000', fillColor: '#ff0000', strokeOn: true });
    drag(polygonTool, ctx(), [[10, 10], [50, 50]]);
    expect(store().undoLabel()).toBe('Draw polygon');
    expect(hex(30, 30)).toBe('#ff0000');
    expect(count('#000000')).toBeGreaterThan(20);
    expect(hex(2, 2)).toBeNull();
    // Only solid, fully opaque colours: no blending at the edges.
    const d = drawing()!;
    for (let i = 3; i < d.pixels.length; i += 4) expect([0, 255]).toContain(d.pixels[i]);
  });

  it('the star with no outline uses the fill for its edge', () => {
    pixelStore(1);
    store().setUi({ fillColor: '#00ff00', strokeOn: false });
    drag(starTool, ctx(), [[4, 4], [60, 60]]);
    expect(hex(32, 34)).toBe('#00ff00');
    expect(count('#00ff00')).toBeGreaterThan(100);
  });

  it('the pen turns a finished path into pixels', () => {
    pixelStore(1);
    store().setUi({ color: '#000000', fillColor: '#0000ff', strokeOn: true });
    const c = ctx();
    let t = 100_000;
    const click = (x: number, y: number) => {
      t += 1000;
      penTool.down!(ptr(x, y, { time: t }), c);
      penTool.up!(ptr(x, y, { time: t }), c);
    };
    click(8, 8);
    click(56, 8);
    click(32, 56);
    click(8, 8);
    expect(store().undoLabel()).toBe('Draw with the pen');
    expect(hex(32, 20)).toBe('#0000ff');
    expect(hex(30, 8)).toBe('#000000');
  });
});

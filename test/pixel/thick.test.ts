// Thick pixel outlines: the pure rasterising, the preference, and the shape tools on a pixel layer.
import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getPx } from '../../src/canvas/pixels';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { addCamera, setView, toggleThroughCamera } from '../../src/camera/ops';
import { ellipseTool, lineTool, rectTool } from '../../src/tools/shapes';
import { polygonTool } from '../../src/tools/polystar';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { setDocPalette } from '../../src/pixel/commands';
import { DEFAULT_PIXEL_SETTINGS, setPixelSettings } from '../../src/pixel/settings';
import { brushReach, clampOutline, insetBox, outlineThickness, plotThickEllipse, plotThickLine, plotThickPolygon, plotThickRect, type Thickness } from '../../src/pixel/thick';
import { plotEllipse, plotLine, plotRect, plotRectInside } from '../../src/pixel/raster';
import { DEFAULT_PREFS, migratePrefs, setPrefs } from '../../src/ui/prefs';
import '../../src/pixel';
import { ctx, drag, pixelStore } from '../tools/helpers';

const cells = (run: (plot: (x: number, y: number) => void) => void): Set<string> => {
  const out = new Set<string>();
  run((x, y) => void out.add(`${x},${y}`));
  return out;
};
const sq = (size: number): Thickness => ({ size, shape: 'square' });
const bounds = (s: Set<string>) => {
  const xs = [...s].map((k) => +k.split(',')[0]);
  const ys = [...s].map((k) => +k.split(',')[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

describe('limits and the brush reach', () => {
  it('keeps the thickness a whole number from 1 to 16, 2 when unusable', () => {
    expect(clampOutline(0)).toBe(1);
    expect(clampOutline(99)).toBe(16);
    expect(clampOutline(3.6)).toBe(4);
    expect(clampOutline('x')).toBe(2);
    expect(clampOutline(undefined)).toBe(2);
  });
  it('outlineThickness is none when off or one pixel', () => {
    expect(outlineThickness(false, 5, 'square')).toBeUndefined();
    expect(outlineThickness(true, 1, 'square')).toBeUndefined();
    expect(outlineThickness(true, 0.2, 'square')).toBeUndefined();
    expect(outlineThickness(true, 3, 'round')).toEqual({ size: 3, shape: 'round' });
  });
  it('the brush leans up and left on even sizes', () => {
    expect(brushReach(1)).toEqual({ before: 0, after: 0 });
    expect(brushReach(3)).toEqual({ before: 1, after: 1 });
    expect(brushReach(4)).toEqual({ before: 1, after: 2 });
  });
  it('insetBox gives the box the brush centres travel on, or null when the shape would be solid', () => {
    expect(insetBox(0, 0, 9, 9, 3)).toEqual([1, 1, 8, 8]);
    expect(insetBox(9, 9, 0, 0, 4)).toEqual([1, 1, 7, 7]);
    expect(insetBox(0, 0, 9, 2, 4)).toBeNull();
  });
});

describe('thick rectangles', () => {
  it('without a thickness is the classic one pixel outline, exactly', () => {
    const a = cells((p) => plotThickRect(1, 2, 8, 7, undefined, p));
    const b = cells((p) => plotRect(1, 2, 8, 7, false, p));
    expect(a).toEqual(b);
  });
  it('grows inwards, so the shape keeps its size', () => {
    for (const n of [2, 3]) {
      const s = cells((p) => plotThickRect(2, 3, 13, 10, sq(n), p));
      expect(bounds(s)).toEqual([2, 3, 13, 10]);
      // A hollow ring n thick: the box minus the inner box.
      const w = 12;
      const h = 8;
      expect(s.size).toBe(w * h - (w - 2 * n) * (h - 2 * n));
      expect(s.has('2,3') && s.has('13,10') && s.has(`${2 + n - 1},${3 + n - 1}`)).toBe(true);
      expect(s.has(`${2 + n},${3 + n}`)).toBe(false);
    }
  });
  it('goes solid when it is thicker than the shape', () => {
    const s = cells((p) => plotThickRect(0, 0, 5, 2, sq(4), p));
    expect(s.size).toBe(18);
  });
  it('paints the fill inside and the outline on top of it', () => {
    const order: string[] = [];
    plotThickRect(0, 0, 9, 9, sq(3), (x, y) => order.push(`e${x},${y}`), (x, y) => order.push(`f${x},${y}`));
    const lastFill = order.map((o, i) => (o[0] === 'f' ? i : -1)).reduce((m, v) => Math.max(m, v), -1);
    const firstEdge = order.findIndex((o) => o[0] === 'e');
    expect(firstEdge).toBeGreaterThan(lastFill);
    // Fill covers the whole inside, edge included, so nothing shows through under the ring.
    expect(order.filter((o) => o[0] === 'f').length).toBe(64);
  });
  it('a round brush has the same outer size', () => {
    const s = cells((p) => plotThickRect(0, 0, 11, 11, { size: 4, shape: 'round' }, p));
    expect(bounds(s)).toEqual([0, 0, 11, 11]);
  });
});

describe('thick ellipses', () => {
  it('without a thickness is the classic ellipse, exactly, fill and all', () => {
    const e1 = new Set<string>();
    const f1 = new Set<string>();
    plotThickEllipse(0, 0, 10, 8, undefined, (x, y) => void e1.add(`${x},${y}`), (x, y) => void f1.add(`${x},${y}`));
    const e2 = new Set<string>();
    const f2 = new Set<string>();
    plotEllipse(0, 0, 10, 8, (x, y) => void e2.add(`${x},${y}`), (x, y) => void f2.add(`${x},${y}`));
    expect(e1).toEqual(e2);
    expect(f1).toEqual(f2);
  });
  it('keeps the dragged size and is symmetric', () => {
    const s = cells((p) => plotThickEllipse(0, 0, 14, 10, sq(3), p));
    expect(bounds(s)).toEqual([0, 0, 14, 10]);
    for (const k of s) {
      const [x, y] = k.split(',').map(Number);
      expect(s.has(`${14 - x},${y}`)).toBe(true);
      expect(s.has(`${x},${10 - y}`)).toBe(true);
    }
  });
  it('is thicker than the classic one and leaves the middle hollow', () => {
    const thin = cells((p) => plotEllipse(0, 0, 20, 20, p));
    const thick = cells((p) => plotThickEllipse(0, 0, 20, 20, sq(3), p));
    expect(thick.size).toBeGreaterThan(thin.size * 2);
    expect(thick.has('10,10')).toBe(false);
    // The ring is joined up: every classic outline pixel of the inset shape has stamps on it.
    expect(thick.has('10,0') && thick.has('0,10') && thick.has('20,10') && thick.has('10,20')).toBe(true);
  });
  it('the fill covers right up to the ring with no gap', () => {
    const e = new Set<string>();
    const f = new Set<string>();
    plotThickEllipse(0, 0, 20, 20, sq(3), (x, y) => void e.add(`${x},${y}`), (x, y) => void f.add(`${x},${y}`));
    // Every cell inside the outer ellipse is either ring or fill.
    for (let y = 0; y <= 20; y++) {
      for (let x = 0; x <= 20; x++) {
        const inside = ((x - 10) / 10.5) ** 2 + ((y - 10) / 10.5) ** 2 <= 0.8;
        if (inside) expect(e.has(`${x},${y}`) || f.has(`${x},${y}`)).toBe(true);
      }
    }
  });
  it('goes solid when too thick', () => {
    const s = cells((p) => plotThickEllipse(0, 0, 3, 3, sq(6), p));
    expect(s.size).toBeGreaterThan(8);
  });
});

describe('thick lines and polygons', () => {
  it('a line without a thickness is the classic line', () => {
    expect(cells((p) => plotThickLine(0, 0, 9, 4, undefined, p))).toEqual(cells((p) => plotLine(0, 0, 9, 4, p)));
  });
  it('a horizontal line gets as thick as the brush', () => {
    const s = cells((p) => plotThickLine(5, 5, 15, 5, sq(3), p));
    expect(bounds(s)).toEqual([4, 4, 16, 6]);
    expect(s.size).toBe(13 * 3);
  });
  it('a diagonal line has no gaps: every classic pixel has the whole brush round it', () => {
    const s = cells((p) => plotThickLine(0, 0, 8, 8, sq(2), p));
    for (let i = 0; i <= 8; i++) expect(s.has(`${i},${i}`) && s.has(`${i + 1},${i + 1}`) && s.has(`${i + 1},${i}`) && s.has(`${i},${i + 1}`)).toBe(true);
  });
  it('a polygon outline is thick and its fill stays put', () => {
    const tri = [{ x: 2, y: 2 }, { x: 14, y: 2 }, { x: 8, y: 13 }];
    const fillOnly = new Set<string>();
    plotThickPolygon(tri, true, undefined, () => {}, (x, y) => void fillOnly.add(`${x},${y}`));
    const fill = new Set<string>();
    const edge = new Set<string>();
    plotThickPolygon(tri, true, sq(3), (x, y) => void edge.add(`${x},${y}`), (x, y) => void fill.add(`${x},${y}`));
    expect(fill).toEqual(fillOnly);
    const thin = cells((p) => plotThickPolygon(tri, true, undefined, p));
    expect(edge.size).toBeGreaterThan(thin.size * 2);
    for (const k of thin) expect(edge.has(k)).toBe(true);
  });
  it('an open path keeps its ends open', () => {
    const s = cells((p) => plotThickPolygon([{ x: 2, y: 2 }, { x: 10, y: 2 }], false, sq(3), p));
    expect(bounds(s)).toEqual([1, 1, 11, 3]);
  });
});

describe('the preference', () => {
  it('is off by default, at 2 pixels, and old saved preferences get that', () => {
    expect(DEFAULT_PREFS.pixelThickOutlines).toBe(false);
    expect(DEFAULT_PREFS.pixelOutlineWidth).toBe(2);
    const p = migratePrefs({ theme: 'dark' });
    expect(p.pixelThickOutlines).toBe(false);
    expect(p.pixelOutlineWidth).toBe(2);
  });
  it('keeps what was saved and tidies damaged values', () => {
    expect(migratePrefs({ pixelThickOutlines: true, pixelOutlineWidth: 5 })).toMatchObject({ pixelThickOutlines: true, pixelOutlineWidth: 5 });
    expect(migratePrefs({ pixelThickOutlines: 'yes', pixelOutlineWidth: 500 })).toMatchObject({ pixelThickOutlines: false, pixelOutlineWidth: 16 });
    expect(migratePrefs({ pixelOutlineWidth: -3 }).pixelOutlineWidth).toBe(1);
  });
});

// ---------------------------------------------------------------- the tools on a pixel layer

// 64 x 64 document at 1 per pixel: a 64 x 64 grid. at(px, py) is the middle of an art pixel.
const at = (px: number, py: number): [number, number] => [px + 0.5, py + 0.5];
const drawing = () => Object.values(store().get().doc.drawings).find((d) => d.kind === 'pixel') as PixelDrawing;
const hexAt = (x: number, y: number) => {
  const [r, g, b, a] = getPx(drawing().pixels, drawing().width, x, y);
  return a ? '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') : null;
};
const count = (c?: string) => {
  let n = 0;
  const d = drawing();
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) if (c ? hexAt(x, y) === c : getPx(d.pixels, d.width, x, y)[3] > 0) n++;
  return n;
};

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
  setViewSettings({ perspective: true, snap: true, throughCamera: false, guides: true, grid: 'off' });
  setPrefs({ pixelThickOutlines: false, pixelOutlineWidth: 2 });
  forgetLastPixelEnd();
});

describe('pixel shape tools with a thick outline', () => {
  it('stay one pixel by default', () => {
    pixelStore(1);
    store().setUi({ color: '#ff0000', fillColor: null, strokeOn: true });
    drag(rectTool, ctx(), [at(1, 1), at(6, 5)]);
    expect(count()).toBe(6 * 5 - 4 * 3);
  });

  it('a rectangle gets a thicker outline and keeps its size', () => {
    pixelStore(1);
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 2 });
    store().setUi({ color: '#ff0000', fillColor: null, strokeOn: true });
    drag(rectTool, ctx(), [at(1, 1), at(8, 6)]);
    // 8 x 6 box with a 2 thick ring: 48 - 4 * 2.
    expect(count()).toBe(48 - 4 * 2);
    expect(hexAt(1, 1)).toBe('#ff0000');
    expect(hexAt(8, 6)).toBe('#ff0000');
    expect(hexAt(0, 1)).toBeNull();
    expect(hexAt(9, 6)).toBeNull();
    expect(hexAt(3, 3)).toBeNull();
  });

  it('thickness is for the outline only: the fill colour stays inside', () => {
    pixelStore(1);
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 2 });
    store().setUi({ color: '#ff0000', fillColor: '#0000ff', strokeOn: true });
    drag(rectTool, ctx(), [at(1, 1), at(8, 6)]);
    expect(count('#0000ff')).toBe(4 * 2);
    expect(hexAt(4, 3)).toBe('#0000ff');
    expect(hexAt(2, 2)).toBe('#ff0000');
    expect(count()).toBe(48);
  });

  it('a fill with no outline stays plain', () => {
    pixelStore(1);
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 4 });
    store().setUi({ fillColor: '#0000ff', strokeOn: false });
    drag(rectTool, ctx(), [at(1, 1), at(6, 5)]);
    expect(count('#0000ff')).toBe(30);
  });

  it('an ellipse and a line are thicker too', () => {
    pixelStore(1);
    store().setUi({ color: '#ff0000', fillColor: null, strokeOn: true });
    drag(ellipseTool, ctx(), [at(2, 2), at(14, 10)]);
    const thin = count();
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 3 });
    pixelStore(1);
    store().setUi({ color: '#ff0000', fillColor: null, strokeOn: true });
    drag(ellipseTool, ctx(), [at(2, 2), at(14, 10)]);
    expect(count()).toBeGreaterThan(thin * 2);
    pixelStore(1);
    store().setUi({ color: '#ff0000' });
    drag(lineTool, ctx(), [at(2, 4), at(12, 4)]);
    expect(count()).toBe(13 * 3);
  });

  it('a polygon outline is thicker', () => {
    pixelStore(1);
    store().setUi({ color: '#ff0000', fillColor: null, strokeOn: true });
    drag(polygonTool, ctx(), [[30, 30], [45, 45]]);
    const thin = count();
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 3 });
    pixelStore(1);
    store().setUi({ color: '#ff0000', fillColor: null, strokeOn: true });
    drag(polygonTool, ctx(), [[30, 30], [45, 45]]);
    expect(count()).toBeGreaterThan(thin * 2);
  });

  it('every pixel is the exact colour (crisp), and the palette lock snaps the thick outline', () => {
    pixelStore(1);
    setDocPalette({ name: 'Test', colors: ['#000000', '#ff0000'], ramps: [2] });
    store().update('lock', (d) => void ((d.layers[0] as PixelLayer).paletteLock = true));
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 3 });
    store().setUi({ color: '#ee1111', fillColor: null, strokeOn: true });
    drag(rectTool, ctx(), [at(1, 1), at(9, 8)]);
    const d = drawing();
    let n = 0;
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        const px = getPx(d.pixels, d.width, x, y);
        if (px[3]) {
          n++;
          expect(px).toEqual([255, 0, 0, 255]);
        }
      }
    }
    expect(n).toBeGreaterThan(30);
  });

  it('mirror drawing mirrors the thick outline exactly', () => {
    pixelStore(1);
    setPixelSettings({ symmetry: 'h' });
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 3 });
    store().setUi({ color: '#ff0000' });
    drag(lineTool, ctx(), [at(2, 3), at(5, 3)]);
    const d = drawing();
    const w = d.width;
    for (let y = 0; y < d.height; y++) for (let x = 0; x < w; x++) expect(getPx(d.pixels, w, x, y)[3]).toBe(getPx(d.pixels, w, w - 1 - x, y)[3]);
  });

  it('a rectangle on a perspective plane gets the thicker outline too', () => {
    const s = pixelStore(1);
    s.update('Perspective', (d) => void (d.perspective = { points: [{ x: 300, y: 20 }] }));
    s.setUi({ color: '#ff0000', fillColor: null, strokeOn: true });
    setToolSettings({ perspectivePlane: 'wall' });
    drag(rectTool, ctx(), [at(1, 3), at(6, 6)]);
    const thin = count();
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 3 });
    pixelStore(1).update('Perspective', (d) => void (d.perspective = { points: [{ x: 300, y: 20 }] }));
    store().setUi({ color: '#ff0000', fillColor: null, strokeOn: true });
    drag(rectTool, ctx(), [at(1, 3), at(6, 6)]);
    expect(count()).toBeGreaterThan(thin);
  });

  it('follows the camera size rule like the pixel brush', () => {
    const s = pixelStore(1);
    const layerId = s.get().doc.layers[0].id;
    addCamera();
    setView({ x: 32, y: 32, zoom: 2 });
    s.setUi({ activeLayerId: layerId, color: '#ff0000' });
    toggleThroughCamera(true);
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 4 });
    // Through a camera at 2x, 4 pixels looks like 2 on the grid.
    drag(lineTool, ctx(), [at(2, 4), at(12, 4)]);
    // A 2 pixel brush on a line 11 long: 12 across.
    expect(count()).toBe(12 * 2);
  });
});

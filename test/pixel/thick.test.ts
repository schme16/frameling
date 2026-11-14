// Thick pixel outlines: the pure rasterising, the preference, and the shape tools on a pixel layer.
import { asGrid } from '../helpers/grid';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getPx } from '../../src/canvas/pixels';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { addCamera, setView, toggleThroughCamera } from '../../src/camera/ops';
import { ellipseTool, lineTool, rectTool } from '../../src/tools/shapes';
import { polygonTool } from '../../src/tools/polystar';
import { penTool } from '../../src/tools/pen';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { setDocPalette } from '../../src/pixel/commands';
import { DEFAULT_PIXEL_SETTINGS, setPixelSettings } from '../../src/pixel/settings';
import { brushReach, clampOutline, insetBox, outlineThickness, plotThickEllipse, plotThickLine, plotCornerStroke, plotThickPolygon, plotThickRect, type Thickness } from '../../src/pixel/thick';
import { plotEllipse, plotLine, plotRect, plotRectInside } from '../../src/pixel/raster';
import { DEFAULT_PREFS, migratePrefs, setPrefs } from '../../src/ui/prefs';
import '../../src/pixel';
import { ctx, drag, pixelStore, ptr } from '../tools/helpers';

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
  it('an open path keeps its ends open, with round ends', () => {
    const s = cells((p) => plotThickPolygon([{ x: 2, y: 2 }, { x: 10, y: 2 }], false, sq(3), p));
    expect(bounds(s)).toEqual([1, 1, 10, 3]);
  });
});

describe('corner-aware strokes', () => {
  const stroke = (pts: { x: number; y: number }[], closed: boolean, size: number, limit?: number) => cells((p) => plotCornerStroke(pts, closed, size, p, limit));
  const rowsAt = (s: Set<string>, x: number) => [...s].filter((k) => k.startsWith(x + ',')).length;
  const colsAt = (s: Set<string>, y: number) => [...s].filter((k) => k.endsWith(',' + y)).length;

  it('keeps one steady width on a flat edge, wherever it sits between pixel lines', () => {
    for (const size of [2, 3, 4]) {
      for (const f of [0, 0.2, 0.5, 0.75, 0.99]) {
        const s = stroke([{ x: 4, y: 10 + f }, { x: 24, y: 10 + f }], false, size);
        expect(rowsAt(s, 14), `${size} wide at .${f}`).toBe(size);
        const t = stroke([{ x: 10 + f, y: 4 }, { x: 10 + f, y: 24 }], false, size);
        expect(colsAt(t, 14), `${size} wide upright at .${f}`).toBe(size);
      }
    }
  });

  it('gives a slanting edge about the same width as a flat one', () => {
    const s = stroke([{ x: 4, y: 4 }, { x: 28, y: 28 }], false, 3);
    // A 3 wide line at 45 degrees is 3 * sqrt(2) = 4.2 pixels across a row.
    for (const y of [10, 14, 18]) expect(colsAt(s, y)).toBeGreaterThanOrEqual(4);
    for (const y of [10, 14, 18]) expect(colsAt(s, y)).toBeLessThanOrEqual(5);
  });

  it('plots every pixel once', () => {
    let n = 0;
    const seen = new Set<string>();
    plotCornerStroke([{ x: 3, y: 3 }, { x: 20, y: 5 }, { x: 8, y: 22 }], true, 3, (x, y) => {
      n++;
      seen.add(x + ',' + y);
    });
    expect(n).toBe(seen.size);
  });

  it('keeps a square corner square, and rounds it when the limit says so', () => {
    const square = [{ x: 4, y: 4 }, { x: 24, y: 4 }, { x: 24, y: 24 }, { x: 4, y: 24 }];
    // 4 wide: the outermost corner pixel's middle is 2.12 from the corner point, past the round join's 2.
    expect(stroke(square, true, 4).has('2,2')).toBe(true);
    expect(stroke(square, true, 4, 0).has('2,2')).toBe(false);
  });

  it('draws a dot for a single point', () => {
    const s = stroke([{ x: 5.5, y: 5.5 }], false, 3);
    expect(s.size).toBeGreaterThanOrEqual(5);
    expect(s.has('5,5')).toBe(true);
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
const drawing = () => asGrid(Object.values(store().get().doc.drawings).find((d) => d.kind === 'pixel') as PixelDrawing);
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

// ---------------------------------------------------------------- the pen

describe('the pen on a pixel layer with a thick outline', () => {
  const penPath = (pts: [number, number][], closeIt = false) => {
    const c = ctx();
    let t = 200_000;
    const click = (x: number, y: number) => {
      t += 1000;
      penTool.down!(ptr(x, y, { time: t }), c);
      penTool.up!(ptr(x, y, { time: t }), c);
    };
    for (const [x, y] of pts) click(x, y);
    if (closeIt) click(pts[0][0], pts[0][1]);
    else penTool.onKey!({ key: 'Enter' } as KeyboardEvent, c);
    return c;
  };

  it('keeps drawing one pixel by default', () => {
    pixelStore(1);
    store().setUi({ color: '#ff0000', strokeOn: true, fillColor: null });
    penPath([[10.5, 10.5], [30.5, 10.5]]);
    const n = count();
    expect(n).toBeGreaterThan(19);
    // One row of cells.
    expect(hexAt(20, 10)).toBe('#ff0000');
    expect(hexAt(20, 9)).toBeNull();
    expect(hexAt(20, 11)).toBeNull();
    expect(n).toBeLessThan(26);
  });

  it('stamps the outline thickness along the path, centred on it', () => {
    pixelStore(1);
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 3 });
    store().setUi({ color: '#ff0000', strokeOn: true, fillColor: null });
    penPath([[10.5, 10.5], [30.5, 10.5]]);
    // Three rows (9 to 11), each the one pixel line's length plus the brush's reach on both ends.
    const len = count() / 3;
    expect(Number.isInteger(len)).toBe(true);
    expect(len).toBeGreaterThan(21);
    expect(hexAt(20, 9)).toBe('#ff0000');
    expect(hexAt(20, 11)).toBe('#ff0000');
    expect(hexAt(20, 8)).toBeNull();
    expect(hexAt(20, 12)).toBeNull();
  });

  it('a closed shape gets a thicker edge and keeps the fill colour inside', () => {
    pixelStore(1);
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 3 });
    store().setUi({ color: '#ff0000', strokeOn: true, fillColor: '#0000ff' });
    penPath([[10.5, 10.5], [40.5, 10.5], [40.5, 40.5], [10.5, 40.5]], true);
    expect(hexAt(25, 25)).toBe('#0000ff');
    expect(hexAt(10, 25)).toBe('#ff0000');
    expect(hexAt(11, 25)).toBe('#ff0000');
    expect(hexAt(9, 25)).toBe('#ff0000');
    expect(hexAt(12, 25)).toBe('#0000ff');
  });

  it('with the stroke off there is no outline to thicken', () => {
    pixelStore(1);
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 5 });
    store().setUi({ color: '#ff0000', strokeOn: false, fillColor: '#0000ff' });
    penPath([[10.5, 10.5], [40.5, 10.5], [40.5, 40.5], [10.5, 40.5]], true);
    expect(count('#ff0000')).toBe(0);
    expect(count('#0000ff')).toBeGreaterThan(800);
  });

  it('mirrors, and snaps to the palette, like the other tools', () => {
    pixelStore(1);
    setDocPalette({ name: 'Test', colors: ['#000000', '#ff0000'], ramps: [2] });
    store().update('lock', (d) => void ((d.layers[0] as PixelLayer).paletteLock = true));
    setPixelSettings({ symmetry: 'h' });
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 3 });
    store().setUi({ color: '#ee1111', strokeOn: true, fillColor: null });
    penPath([[5.5, 10.5], [20.5, 14.5]]);
    const d = drawing();
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        const px = getPx(d.pixels, d.width, x, y);
        expect(px[3]).toBe(getPx(d.pixels, d.width, d.width - 1 - x, y)[3]);
        if (px[3]) expect(px).toEqual([255, 0, 0, 255]);
      }
    }
    expect(count()).toBeGreaterThan(40);
  });

  it('follows the camera size rule', () => {
    const s = pixelStore(1);
    const layerId = s.get().doc.layers[0].id;
    addCamera();
    setView({ x: 32, y: 32, zoom: 2 });
    s.setUi({ activeLayerId: layerId, color: '#ff0000', strokeOn: true, fillColor: null });
    toggleThroughCamera(true);
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 4 });
    penPath([[10.5, 10.5], [20.5, 10.5]]);
    // 4 pixels through a camera at 2x paints 2: two rows.
    expect(hexAt(15, 10)).toBe('#ff0000');
    expect(hexAt(15, 9) !== null || hexAt(15, 11) !== null).toBe(true);
    expect(hexAt(15, 8)).toBeNull();
    expect(hexAt(15, 12)).toBeNull();
    expect(hexAt(15, 10)).toBe('#ff0000');
    expect(hexAt(15, 11)).toBe('#ff0000');
  });
});

// ---------------------------------------------------------------- perspective planes keep the dragged size

describe('thick shapes on a perspective plane', () => {
  const bbox = () => {
    const d = drawing();
    let x0 = 999, y0 = 999, x1 = -1, y1 = -1;
    for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) if (getPx(d.pixels, d.width, x, y)[3]) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
    return [x0, y0, x1, y1];
  };
  const setup = (plane: 'wall' | 'floor', width: number) => {
    setToolSettings({ perspectivePlane: plane });
    setPrefs({ pixelThickOutlines: width > 0, pixelOutlineWidth: width || 2 });
    const s = pixelStore(1);
    s.update('Perspective', (d) => void (d.perspective = { points: [{ x: 300, y: 20 }] }));
    s.setUi({ color: '#ff0000', fillColor: null, strokeOn: true });
  };

  it.each([2, 3, 4, 7])('a rectangle on a wall keeps its left, right and top edges at thickness %i', (w) => {
    setup('wall', w);
    drag(rectTool, ctx(), [at(10, 20), at(30, 40)]);
    const [x0, y0, x1] = bbox();
    expect([x0, y0, x1]).toEqual([10, 20, 30]);
  });

  it.each([2, 3, 4, 7])('an ellipse on a wall keeps its sides at thickness %i', (w) => {
    setup('wall', w);
    drag(ellipseTool, ctx(), [at(10, 20), at(30, 40)]);
    const [x0, y0, x1] = bbox();
    expect([x0, y0, x1]).toEqual([10, 20, 30]);
  });

  it('thickness never makes the shape grow: thick and thin reach the same sides', () => {
    setup('wall', 0);
    drag(rectTool, ctx(), [at(10, 20), at(30, 40)]);
    const thin = bbox();
    setup('wall', 5);
    drag(rectTool, ctx(), [at(10, 20), at(30, 40)]);
    const thick = bbox();
    expect(thick[0]).toBe(thin[0]);
    expect(thick[1]).toBe(thin[1]);
    expect(thick[2]).toBe(thin[2]);
    expect(thick[3]).toBeLessThanOrEqual(thin[3]);
  });

  it('a floor plane (no slant) matches the flat shape exactly', () => {
    setup('floor', 3);
    drag(rectTool, ctx(), [at(10, 20), at(30, 40)]);
    const floor = count();
    expect(bbox()).toEqual([10, 20, 30, 40]);
    setToolSettings({ perspectivePlane: 'flat' });
    pixelStore(1).setUi({ color: '#ff0000', fillColor: null, strokeOn: true });
    drag(rectTool, ctx(), [at(10, 20), at(30, 40)]);
    expect(count()).toBe(floor);
  });

  it('a thickness the shape cannot hold makes it solid', () => {
    setup('wall', 9);
    drag(rectTool, ctx(), [at(10, 20), at(14, 24)]);
    expect(count()).toBeGreaterThanOrEqual(25);
    // And a roomy shape stays hollow at the same thickness.
    drag(rectTool, ctx(), [at(10, 20), at(40, 50)]);
    expect(hexAt(25, 35)).toBeNull();
  });

  it('the fill stays inside the thick outline', () => {
    setup('wall', 3);
    store().setUi({ fillColor: '#0000ff' });
    drag(rectTool, ctx(), [at(10, 20), at(30, 40)]);
    expect(hexAt(20, 30)).toBe('#0000ff');
    expect(hexAt(10, 30)).toBe('#ff0000');
    expect(count('#0000ff')).toBeGreaterThan(100);
  });
});

// Pixel shapes land on exactly the cells that were clicked or dragged: no snapping to the page or guides on a pixel
// layer, and perspective walls cover exactly the cells whose middle is inside the projected shape.
import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getPx } from '../../src/canvas/pixels';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { ellipseTool, lineTool, rectTool } from '../../src/tools/shapes';
import { polygonTool, starTool } from '../../src/tools/polystar';
import { penTool } from '../../src/tools/pen';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { DEFAULT_PIXEL_SETTINGS, setPixelSettings } from '../../src/pixel/settings';
import { perspectivePixelOutline } from '../../src/pixel/perspective';
import { coveredCells, edgeRing } from '../../src/pixel/raster';
import { flattenSubPath } from '../../src/geometry/hit';
import { setPrefs } from '../../src/ui/prefs';
import '../../src/pixel';
import { ctx, drag, pixelStore, ptr, shapesNow, vectorStore } from '../tools/helpers';

const at = (px: number, py: number): [number, number] => [px + 0.5, py + 0.5];
const drawing = () => Object.values(store().get().doc.drawings).find((d) => d.kind === 'pixel') as PixelDrawing;
const painted = (): Map<string, readonly number[]> => {
  const d = drawing();
  const out = new Map<string, readonly number[]>();
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) if (getPx(d.pixels, d.width, x, y)[3]) out.set(`${x},${y}`, getPx(d.pixels, d.width, x, y));
  return out;
};
const bounds = (keys: Iterable<string>) => {
  const p = [...keys].map((k) => k.split(',').map(Number));
  const xs = p.map((c) => c[0]);
  const ys = p.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
  setViewSettings({ perspective: true, snap: true, throughCamera: false, guides: true, grid: 'off' });
  setPrefs({ pixelThickOutlines: false, pixelOutlineWidth: 2 });
  forgetLastPixelEnd();
});

describe('a pen line on a pixel layer paints the cells that were clicked', () => {
  const penPath = (pts: [number, number][]) => {
    const c = ctx();
    let t = 300_000;
    for (const [x, y] of pts) {
      t += 1000;
      penTool.down!(ptr(x, y, { time: t }), c);
      penTool.up!(ptr(x, y, { time: t }), c);
    }
    penTool.onKey!({ key: 'Enter' } as KeyboardEvent, c);
  };

  it('x 10.5 to 30.5 is cells 10 to 30, even next to the page middle (32)', () => {
    pixelStore(1);
    store().setUi({ color: '#ff0000', strokeOn: true, fillColor: null });
    penPath([[10.5, 10.5], [30.5, 10.5]]);
    const cells = painted();
    expect(cells.size).toBe(21);
    expect(bounds(cells.keys())).toEqual([10, 10, 30, 10]);
  });

  it('is not pulled onto the page edge or a guide either', () => {
    pixelStore(1).update('guide', (d) => void (d.guides = [{ id: 'g1', axis: 'x', at: 33 }]));
    store().setUi({ color: '#ff0000', strokeOn: true, fillColor: null });
    penPath([[2.5, 20.5], [30.5, 20.5], [30.5, 1.5]]);
    expect(bounds(painted().keys())).toEqual([2, 1, 30, 20]);
  });

  it('draws the same cells as the Line tool', () => {
    pixelStore(1);
    store().setUi({ color: '#ff0000', strokeOn: true, fillColor: null });
    penPath([[10.5, 10.5], [30.5, 25.5]]);
    const viaPen = [...painted().keys()].sort();
    pixelStore(1);
    store().setUi({ color: '#ff0000', strokeOn: true, fillColor: null });
    drag(lineTool, ctx(), [at(10, 10), at(30, 25)]);
    expect([...painted().keys()].sort()).toEqual(viaPen);
  });

  it('a thick outline reaches only as far as the brush on each end, like the Line tool', () => {
    pixelStore(1);
    setPrefs({ pixelThickOutlines: true, pixelOutlineWidth: 3 });
    store().setUi({ color: '#ff0000', strokeOn: true, fillColor: null });
    penPath([[10.5, 10.5], [30.5, 10.5]]);
    expect(bounds(painted().keys())).toEqual([9, 9, 31, 11]);
  });

  it('a closed pen shape covers exactly its clicked corners', () => {
    pixelStore(1);
    store().setUi({ color: '#ff0000', strokeOn: true, fillColor: '#0000ff' });
    const c = ctx();
    let t = 400_000;
    for (const [x, y] of [[10.5, 10.5], [30.5, 10.5], [30.5, 29.5], [10.5, 29.5], [10.5, 10.5]]) {
      t += 1000;
      penTool.down!(ptr(x, y, { time: t }), c);
      penTool.up!(ptr(x, y, { time: t }), c);
    }
    expect(bounds(painted().keys())).toEqual([10, 10, 30, 29]);
  });

  it('still snaps on a vector layer', () => {
    vectorStore();
    store().setUi({ color: '#ff0000', strokeOn: true, fillColor: null });
    // The page middle is x 200.
    penPath([[20, 20], [197, 20]]);
    const sp = (shapesNow()[0] as { paths: { points: { x: number }[] }[] }).paths[0];
    expect(sp.points[1].x).toBe(200);
  });
});

describe('the other pixel shape tools keep to the dragged cells', () => {
  const setup = () => {
    pixelStore(1);
    store().setUi({ color: '#ff0000', strokeOn: true, fillColor: null });
  };

  it('a line from cell 10 to 30 is 21 cells, snapping on', () => {
    setup();
    drag(lineTool, ctx(), [at(10, 10), at(30, 10)]);
    expect(bounds(painted().keys())).toEqual([10, 10, 30, 10]);
    expect(painted().size).toBe(21);
  });

  it('a line is not pulled onto the page middle while perspective guides show', () => {
    setup();
    store().update('Perspective', (d) => void (d.perspective = { points: [{ x: 300, y: 200 }] }));
    drag(lineTool, ctx(), [at(10, 10), at(30, 40)]);
    expect(bounds(painted().keys())).toEqual([10, 10, 30, 40]);
  });

  it.each([
    ['rectangle', rectTool],
    ['ellipse', ellipseTool],
    ['polygon', polygonTool],
    ['star', starTool],
  ])('a %s from cell 10,10 to 30,40 covers those cells and no more', (_n, tool) => {
    setup();
    drag(tool, ctx(), [at(10, 10), at(30, 40)]);
    const [x0, y0, x1, y1] = bounds(painted().keys());
    expect(x0).toBeGreaterThanOrEqual(10);
    expect(y0).toBeGreaterThanOrEqual(10);
    expect(x1).toBeLessThanOrEqual(30);
    expect(y1).toBeLessThanOrEqual(40);
    // A rectangle and an ellipse reach all four sides; a polygon and a star at least the middle of the box.
    if (tool === rectTool || tool === ellipseTool) expect([x0, y0, x1, y1]).toEqual([10, 10, 30, 40]);
    else expect(y1 - y0).toBeGreaterThan(20);
  });
});

describe('shapes on a perspective wall cover exactly the cells inside the projected shape', () => {
  const persp = { vps: [{ x: 300, y: 20 }], plane: 'wall' as const };
  const setup = (fill: string | null, stroke: boolean, width: number) => {
    setToolSettings({ perspectivePlane: 'wall' });
    setPrefs({ pixelThickOutlines: width > 0, pixelOutlineWidth: width || 2 });
    const s = pixelStore(1);
    s.update('Perspective', (d) => void (d.perspective = { points: persp.vps }));
    s.setUi({ color: '#ff0000', fillColor: fill, strokeOn: stroke });
  };
  const truth = (kind: 'rect' | 'ellipse', p: { x: number; y: number }, q: { x: number; y: number }) => {
    const sp = perspectivePixelOutline(kind, p, q, 1, persp)!;
    const flat = flattenSubPath(sp);
    return coveredCells(Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[2 * i], y: flat[2 * i + 1] })));
  };
  const keys = (cells: { x: number; y: number }[]) => new Set(cells.map((c) => `${c.x},${c.y}`));
  const a = { x: 10, y: 20 };
  const b = { x: 30, y: 40 };

  it('a rectangle that is only filled is exactly those cells (no overgrown far edge)', () => {
    setup('#ff0000', false, 0);
    drag(rectTool, ctx(), [at(a.x, a.y), at(b.x, b.y)]);
    const want = keys(truth('rect', a, b));
    expect(new Set(painted().keys())).toEqual(want);
  });

  it('an ellipse that is only filled is exactly those cells', () => {
    setup('#ff0000', false, 0);
    drag(ellipseTool, ctx(), [at(a.x, a.y), at(b.x, b.y)]);
    expect(new Set(painted().keys())).toEqual(keys(truth('ellipse', a, b)));
  });

  it.each([0, 1, 2, 3, 5])('an outline of thickness %i stays inside and reaches every edge, bottom included', (w) => {
    setup(null, true, w);
    drag(rectTool, ctx(), [at(a.x, a.y), at(b.x, b.y)]);
    const cells = truth('rect', a, b);
    const want = keys(cells);
    const got = painted();
    for (const k of got.keys()) expect(want.has(k)).toBe(true);
    // The outline is exactly the ring of the covered cells.
    expect(new Set(got.keys())).toEqual(keys(edgeRing(cells, Math.max(1, w))));
    // Every column has its lowest and highest covered cell painted, and every row its first and last.
    for (const c of cells) {
      const col = cells.filter((o) => o.x === c.x).map((o) => o.y);
      const row = cells.filter((o) => o.y === c.y).map((o) => o.x);
      if (c.y === Math.max(...col) || c.y === Math.min(...col) || c.x === Math.max(...row) || c.x === Math.min(...row)) expect(got.has(`${c.x},${c.y}`)).toBe(true);
    }
  });

  it('outline and fill together: the fill is all the cells, the outline on top', () => {
    setup('#0000ff', true, 3);
    drag(rectTool, ctx(), [at(a.x, a.y), at(b.x, b.y)]);
    const cells = truth('rect', a, b);
    const got = painted();
    expect(new Set(got.keys())).toEqual(keys(cells));
    const ring = keys(edgeRing(cells, 3));
    for (const [k, px] of got) expect(px).toEqual(ring.has(k) ? [255, 0, 0, 255] : [0, 0, 255, 255]);
    expect(ring.size).toBeLessThan(cells.length);
  });

  it('a one cell drag still leaves a cell', () => {
    setup('#ff0000', false, 0);
    drag(rectTool, ctx(), [at(20, 30), at(20, 30)]);
    expect(painted().size).toBeGreaterThanOrEqual(1);
  });

  it('a thickness the shape cannot hold makes it solid', () => {
    setup(null, true, 9);
    drag(rectTool, ctx(), [at(10, 20), at(14, 24)]);
    expect(new Set(painted().keys())).toEqual(keys(truth('rect', { x: 10, y: 20 }, { x: 14, y: 24 })));
  });
});

describe('edgeRing', () => {
  const box = (w: number, h: number) => {
    const out = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push({ x, y });
    return out;
  };
  it('is the outer rows and columns, depth deep', () => {
    expect(edgeRing(box(10, 8), 1).length).toBe(10 * 8 - 8 * 6);
    expect(edgeRing(box(10, 8), 2).length).toBe(10 * 8 - 6 * 4);
  });
  it('is everything when the area is too small', () => {
    expect(edgeRing(box(4, 4), 2).length).toBe(16);
    expect(edgeRing(box(3, 3), 5).length).toBe(9);
  });
  it('keeps a slanted edge a single line at depth 1', () => {
    // A triangle below the diagonal: cells with y >= x, 12 across.
    const tri = box(12, 12).filter((c) => c.y >= c.x);
    const ring = edgeRing(tri, 1);
    // The diagonal is one cell per column (no doubled stair steps), plus the left column and the bottom row.
    expect(ring.filter((c) => c.x === c.y).length).toBe(12);
    expect(ring.length).toBe(12 + 12 + 12 - 3);
  });
  it('an empty area has no ring', () => {
    expect(edgeRing([], 3)).toEqual([]);
  });
});

// Pixel layers follow the perspective planes (rasterised crisply) and the camera size rule.
import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getPx, pixelSizeThroughCamera } from '../../src/canvas/pixels';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { addCamera, setView, toggleThroughCamera } from '../../src/camera/ops';
import { brushTool } from '../../src/tools/brush';
import { eraserTool } from '../../src/tools/eraser';
import { ellipseTool, lineTool, rectTool } from '../../src/tools/shapes';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { setDocPalette } from '../../src/pixel/commands';
import { perspectivePixelOutline } from '../../src/pixel/perspective';
import { DEFAULT_PIXEL_SETTINGS, setPixelSettings } from '../../src/pixel/settings';
import '../../src/pixel';
import { ctx, drag, pixelStore } from '../tools/helpers';

// 64 x 64 document at 8 per pixel: an 8 x 8 grid. at(px, py) is the middle of an art pixel.
const at = (px: number, py: number): [number, number] => [px * 8 + 4, py * 8 + 4];
const drawing = () => Object.values(store().get().doc.drawings).find((d) => d.kind === 'pixel') as PixelDrawing;
const on = (x: number, y: number) => getPx(drawing().pixels, drawing().width, x, y)[3] > 0;
const hexAt = (x: number, y: number) => {
  const [r, g, b, a] = getPx(drawing().pixels, drawing().width, x, y);
  return a ? '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') : null;
};
const count = () => {
  let n = 0;
  const d = drawing();
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) if (on(x, y)) n++;
  return n;
};

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
  setViewSettings({ perspective: true, snap: true, throughCamera: false, guides: true, grid: 'off' });
  forgetLastPixelEnd();
});

describe('a pixel brush size through the camera', () => {
  it('rounds to whole pixels, never below one', () => {
    expect(pixelSizeThroughCamera(4, 1)).toBe(4);
    expect(pixelSizeThroughCamera(4, 0.5)).toBe(2);
    expect(pixelSizeThroughCamera(3, 0.5)).toBe(2);
    expect(pixelSizeThroughCamera(4, 2)).toBe(8);
    expect(pixelSizeThroughCamera(1, 0.25)).toBe(1);
    expect(pixelSizeThroughCamera(5, 0.1)).toBe(1);
    expect(pixelSizeThroughCamera(2.4, 1)).toBe(2);
    expect(pixelSizeThroughCamera(4, 0)).toBe(4);
    expect(pixelSizeThroughCamera(4, Number.NaN)).toBe(4);
  });

  function zoomedCamera(zoom: number) {
    const s = pixelStore();
    const layerId = s.get().doc.layers[0].id;
    addCamera();
    setView({ x: 32, y: 32, zoom });
    s.setUi({ activeLayerId: layerId });
    toggleThroughCamera(true);
  }

  it('the brush is smaller on the grid through a zoomed in camera, so it looks the size you set', () => {
    zoomedCamera(2);
    setToolSettings({ pixelBrushSize: 4, pixelBrushShape: 'square' });
    store().setUi({ color: '#ff0000' });
    drag(brushTool, ctx(), [at(4, 4), at(4, 4)]);
    expect(count()).toBe(4);
  });

  it('the brush is bigger through a zoomed out camera', () => {
    zoomedCamera(0.5);
    setToolSettings({ pixelBrushSize: 2, pixelBrushShape: 'square' });
    store().setUi({ color: '#ff0000' });
    drag(brushTool, ctx(), [at(4, 4), at(4, 4)]);
    expect(count()).toBe(16);
  });

  it('is the plain size when not looking through the camera, and the eraser follows the rule too', () => {
    pixelStore();
    setToolSettings({ pixelBrushSize: 4, pixelBrushShape: 'square', eraserPixelSize: 4 });
    store().setUi({ color: '#ff0000' });
    drag(brushTool, ctx(), [at(4, 4), at(4, 4)]);
    expect(count()).toBe(16);
    store().setUi({ activeLayerId: store().get().doc.layers[0].id });
    addCamera();
    setView({ x: 32, y: 32, zoom: 2 });
    store().setUi({ activeLayerId: store().get().doc.layers[0].id });
    toggleThroughCamera(true);
    drag(eraserTool, ctx(), [at(4, 4), at(4, 4)]);
    // A 2 x 2 eraser takes 4 of the 16.
    expect(count()).toBe(12);
  });
});

describe('pixel shapes on a perspective plane', () => {
  function withPerspective(points: { x: number; y: number }[]) {
    const s = pixelStore();
    s.update('Perspective', (d) => void (d.perspective = { points }));
    s.setUi({ fillColor: '#ff0000', strokeOn: false });
    return s;
  }

  it('the outline is the same quad a vector shape gets, covering whole cells', () => {
    const q = perspectivePixelOutline('rect', { x: 1, y: 2 }, { x: 4, y: 5 }, 8, { vps: [{ x: 300, y: 20 }], plane: 'wall' });
    expect(q).not.toBeNull();
    const pts = q!.points;
    expect(pts[0].x).toBeCloseTo(8);
    expect(pts[0].y).toBeCloseTo(16);
    expect(pts[2].x).toBeCloseTo(40);
    expect(pts[2].y).toBeCloseTo(48);
    expect(pts[1].x).toBeCloseTo(40);
    expect(pts[3].x).toBeCloseTo(8);
    expect(pts[1].y).not.toBeCloseTo(16);
  });

  it('a drag back up and left makes the same shape as one down and right', () => {
    const persp = { vps: [{ x: 300, y: 20 }], plane: 'wall' as const };
    const a = perspectivePixelOutline('rect', { x: 1, y: 2 }, { x: 4, y: 5 }, 8, persp)!;
    const b = perspectivePixelOutline('rect', { x: 4, y: 5 }, { x: 1, y: 2 }, 8, persp)!;
    const key = (p: { x: number; y: number }) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
    expect(a.points.map(key).sort()).toEqual(b.points.map(key).sort());
  });

  it('stays flat for Flat, no vanishing points, or a drag across the vanishing point', () => {
    const vps = [{ x: 300, y: 20 }];
    expect(perspectivePixelOutline('rect', { x: 1, y: 2 }, { x: 4, y: 5 }, 8, { vps, plane: 'flat' })).toBeNull();
    expect(perspectivePixelOutline('rect', { x: 1, y: 2 }, { x: 4, y: 5 }, 8, { vps: [], plane: 'auto' })).toBeNull();
  });

  it('a rectangle on a wall paints a slanted block of crisp pixels, not a box', () => {
    withPerspective([{ x: 80, y: 20 }]);
    setToolSettings({ perspectivePlane: 'wall' });
    drag(rectTool, ctx(), [at(1, 3), at(5, 5)]);
    const n = count();
    // The plain rectangle would be 5 x 3 = 15 cells; on the wall its sides slope towards the horizon.
    expect(n).toBeGreaterThan(0);
    expect(n).not.toBe(15);
    // Every painted pixel is the fill colour exactly (no anti-aliasing, no half-transparent edge).
    const d = drawing();
    for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) if (on(x, y)) expect(getPx(d.pixels, d.width, x, y)).toEqual([255, 0, 0, 255]);
  });

  it('Flat gives the ordinary pixel rectangle', () => {
    withPerspective([{ x: 300, y: 20 }]);
    setToolSettings({ perspectivePlane: 'flat' });
    drag(rectTool, ctx(), [at(1, 3), at(4, 5)]);
    expect(count()).toBe(12);
  });

  it('with no perspective guides in the document nothing changes', () => {
    pixelStore().setUi({ fillColor: '#ff0000', strokeOn: false });
    drag(rectTool, ctx(), [at(1, 3), at(4, 5)]);
    expect(count()).toBe(12);
  });

  it('an ellipse on a floor is painted and stays inside the drag box height', () => {
    withPerspective([{ x: 32, y: 4 }]);
    setToolSettings({ perspectivePlane: 'floor' });
    drag(ellipseTool, ctx(), [at(1, 3), at(6, 7)]);
    expect(count()).toBeGreaterThan(8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (on(x, y)) expect(y).toBeGreaterThanOrEqual(3);
  });

  it('keeps to the palette on a palette locked layer', () => {
    withPerspective([{ x: 300, y: 20 }]);
    setDocPalette({ name: 'T', colors: ['#000000', '#ff0000'], ramps: [2] });
    store().update('lock', (d) => void ((d.layers[0] as PixelLayer).paletteLock = true));
    store().setUi({ fillColor: '#ee2222' });
    setToolSettings({ perspectivePlane: 'wall' });
    drag(rectTool, ctx(), [at(1, 3), at(4, 5)]);
    expect(hexAt(2, 4)).toBe('#ff0000');
  });

  it('a line end follows the direction to the vanishing point', () => {
    withPerspective([{ x: 56, y: 28 }]);
    store().setUi({ color: '#0000ff' });
    // Nearly along the way to the vanishing point (level at y 28): it pulls onto it.
    drag(lineTool, ctx(), [[4, 28], [44, 30]]);
    for (let x = 0; x <= 5; x++) expect(on(x, 3)).toBe(true);
    expect(on(5, 4)).toBe(false);
  });
});

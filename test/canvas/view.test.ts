import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, centerView, clampPan, clampZoom, docToScreen, fitView, nextZoomStep, screenToDoc, stageDeviceRect, wheelZoomFactor, zoomAbout, zoomToRect } from '../../src/canvas/view';

describe('screen to document', () => {
  it('maps with zoom and pan, and back again', () => {
    const v = { zoom: 2, panX: 100, panY: 50 };
    expect(screenToDoc(v, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(screenToDoc(v, 300, 250)).toEqual({ x: 100, y: 100 });
    const p = docToScreen(v, 12.5, 7);
    const back = screenToDoc(v, p.x, p.y);
    expect(back.x).toBeCloseTo(12.5);
    expect(back.y).toBeCloseTo(7);
  });
});

describe('zooming', () => {
  it('keeps the point under the cursor still', () => {
    const v = { zoom: 1.5, panX: -40, panY: 30 };
    const before = screenToDoc(v, 220, 180);
    const z = zoomAbout(v, 6, 220, 180);
    expect(z.zoom).toBe(6);
    const after = screenToDoc(z, 220, 180);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('stays within the limits', () => {
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
    expect(clampZoom(0.0001)).toBe(MIN_ZOOM);
    expect(clampZoom(NaN)).toBe(1);
    expect(zoomAbout({ zoom: 1, panX: 0, panY: 0 }, 9999, 0, 0).zoom).toBe(MAX_ZOOM);
  });

  it('steps through friendly levels', () => {
    expect(nextZoomStep(1, 1)).toBe(1.5);
    expect(nextZoomStep(1, -1)).toBe(0.667);
    expect(nextZoomStep(1.2, 1)).toBe(1.5);
    expect(nextZoomStep(1.2, -1)).toBe(1);
    expect(nextZoomStep(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(nextZoomStep(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });

  it('zooms by a smooth factor from wheels and pinches', () => {
    expect(wheelZoomFactor(0, 0)).toBe(1);
    expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0)).toBeLessThan(1);
    // A trackpad pinch sends small numbers and reacts more strongly per unit than a mouse wheel.
    expect(Math.log(wheelZoomFactor(-5, 0)) / 5).toBeGreaterThan(Math.log(wheelZoomFactor(-100, 0)) / 100);
  });
});

describe('fitting', () => {
  it('centres the page with room round it', () => {
    const v = fitView(1000, 700, 500, 300, 50);
    expect(v.zoom).toBeCloseTo(Math.min(900 / 500, 600 / 300));
    expect(v.panX).toBeCloseTo((1000 - 500 * v.zoom) / 2);
    expect(v.panY).toBeCloseTo((700 - 300 * v.zoom) / 2);
  });

  it('shrinks big pages to fit', () => {
    const v = fitView(800, 600, 3840, 2160, 0);
    expect(v.zoom).toBeLessThan(1);
    expect(3840 * v.zoom).toBeLessThanOrEqual(800 + 1e-6);
  });

  it('rounds up-zooms to whole numbers for pixel art', () => {
    expect(fitView(1000, 700, 64, 64, 50, true).zoom).toBe(9);
    expect(fitView(1000, 700, 64, 64, 50, false).zoom).toBeCloseTo(600 / 64);
    // A 32x32 grid at 8 document pixels per art pixel (256x256) in a 720x560 area: 1.81x would make art pixels
    // 14.5 screen pixels, so it rounds to 14 (zoom 1.75) rather than all the way down to 1.
    expect(fitView(720, 560, 256, 256, 48, 8).zoom).toBe(1.75);
  });

  it('zooms to a box', () => {
    const v = zoomToRect({ x: 100, y: 100, w: 50, h: 50 }, 600, 400, 0);
    expect(v.zoom).toBe(8);
    const c = docToScreen(v, 125, 125);
    expect(c.x).toBeCloseTo(300);
    expect(c.y).toBeCloseTo(200);
  });

  it('centres without changing the zoom', () => {
    const v = centerView({ zoom: 2, panX: 999, panY: -999 }, 800, 600, 100, 100);
    expect(v).toEqual({ zoom: 2, panX: 300, panY: 200 });
  });

  it('keeps part of the page in view when panning', () => {
    const v = clampPan({ zoom: 1, panX: -5000, panY: 5000 }, 800, 600, 500, 500);
    expect(v.panX + 500).toBeGreaterThanOrEqual(90);
    expect(v.panY).toBeLessThanOrEqual(600 - 90);
  });
});

describe('device pixels', () => {
  it('places the page on whole device pixels', () => {
    const r = stageDeviceRect({ zoom: 1.5, panX: 10.3, panY: 20.7 }, 100, 50, 2);
    expect(r).toEqual({ x: 21, y: 41, w: 300, h: 150 });
  });
});

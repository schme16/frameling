import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { ART_ZOOM_PRESETS, artPixelOf, artSizeOf, artZoomPercent, docSizeOf, newPixelLayerNote, zoomForArtPercent } from '../../src/pixel/units';

describe('pixel units in plain words', () => {
  it('a 512 stage of 16 pixel art pixels is 32 x 32', () => {
    expect(artSizeOf(512, 512, 16)).toEqual({ w: 32, h: 32 });
    expect(artSizeOf(130, 64, 16)).toEqual({ w: 9, h: 4 });
    expect(artSizeOf(300, 200, 1)).toEqual({ w: 300, h: 200 });
  });
  it('typed art sizes go back to stage units', () => {
    expect(docSizeOf(32, 24, 16)).toEqual({ w: 512, h: 384 });
  });
  it('zoom is screen pixels per art pixel as a percentage', () => {
    expect(artZoomPercent(0.5, 16)).toBe(800);
    expect(artZoomPercent(1, 1)).toBe(100);
    expect(artZoomPercent(0.0625, 16)).toBe(100);
  });
  it('a percentage maps back to the view zoom', () => {
    for (const p of ART_ZOOM_PRESETS) expect(artZoomPercent(zoomForArtPercent(p, 8), 8)).toBe(p);
  });
  it('reads the art pixel size from a pixel document only', () => {
    expect(artPixelOf(newDoc({ width: 512, height: 512, pixel: { pixelSize: 16 } }))).toBe(16);
    expect(artPixelOf(newDoc({ width: 512, height: 512 }))).toBe(1);
  });
});

describe('what a new pixel layer says about its size', () => {
  it('names the size in pixels and how wide each one is, for the first pixel layer on a page', () => {
    expect(newPixelLayerNote(1280, 720, 8, false)).toBe('Pixel layer: 160 x 90 pixels, each one 8 wide on the page.');
  });
  it('rounds up a page that does not divide evenly, like the status bar does', () => {
    expect(newPixelLayerNote(130, 64, 16, false)).toBe('Pixel layer: 9 x 4 pixels, each one 16 wide on the page.');
  });
  it('stays quiet when other pixel layers already set the size', () => {
    expect(newPixelLayerNote(1280, 720, 8, true)).toBeNull();
  });
});

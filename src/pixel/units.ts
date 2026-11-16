// Pixel units in plain words: the size of a sprite in art pixels (32 x 32, not the 512 x 512 stage it sits on) and
// zoom as screen pixels per art pixel (800%). Plain functions, so they can be tested.
import type { Doc } from '../core/format';
import { artScale } from '../export/plan';

/** Document pixels in one art pixel for a document made only of pixel layers, else 1. */
export function artPixelOf(doc: Doc): number {
  const s = artScale(doc);
  return s ? Math.max(1, Math.round(1 / s)) : 1;
}

/** A size in document pixels as art pixels. `pixel` is the size of one art pixel. */
export function artSizeOf(w: number, h: number, pixel: number): { w: number; h: number } {
  const p = Math.max(1, pixel);
  return { w: Math.ceil(w / p), h: Math.ceil(h / p) };
}

/** Art pixels back to document pixels, for a size someone types in. */
export function docSizeOf(artW: number, artH: number, pixel: number): { w: number; h: number } {
  const p = Math.max(1, pixel);
  return { w: Math.round(artW * p), h: Math.round(artH * p) };
}

/** The zoom as the figure pixel artists use: screen pixels for each art pixel, as a percentage (100% = one to one). */
export function artZoomPercent(zoom: number, pixel: number): number {
  return Math.round(zoom * Math.max(1, pixel) * 100);
}

/** The view zoom that shows each art pixel as `percent` / 100 screen pixels. */
export function zoomForArtPercent(percent: number, pixel: number): number {
  return percent / 100 / Math.max(1, pixel);
}

/** The zoom presets of keys 1 to 6, as Aseprite has them. */
export const ART_ZOOM_PRESETS = [100, 200, 400, 800, 1600, 3200] as const;

/** How many frames a new pixel file starts with: one picture is a single frame, an animation gets four to play with. */
export const START_FRAMES = { picture: 1, animation: 4 } as const;

/**
 * What to say after the first pixel layer lands on a page: how many pixels it has and how wide each one is. Pixel
 * layers after the first copy the size of the others, so there is nothing new to say then (null).
 */
export function newPixelLayerNote(pageW: number, pageH: number, pixel: number, hadPixelLayer: boolean): string | null {
  if (hadPixelLayer) return null;
  const art = artSizeOf(pageW, pageH, pixel);
  return `Pixel layer: ${art.w} x ${art.h} pixels, each one ${pixel} wide on the page.`;
}

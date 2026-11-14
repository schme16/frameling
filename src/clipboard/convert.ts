/**
 * The parts that need a canvas: drawing shapes to a picture (to copy out, or to paste onto a pixel layer), and the
 * picture's SVG. Everything that decides or counts lives in plan.ts, which is tested without one.
 */
import type { Doc, Id, Layer, PixelDrawing, Shape, SymbolDef, VectorDrawing } from '../core/format';
import { renderFrame } from '../core/render';
import { uid } from '../core/doc';
import { shapesBounds } from '../canvas/geometry';
import { encodePng } from '../io/png';
import { shapeToSvg, n2 } from '../export/svg';
import { docPalette, paletteRgb, reduceToPalette } from '../pixel/palette';
import { hardenEdges } from './plan';
import { newInstance } from '../core/symbols';
import { trimPixels } from '../core/pixelBounds';

export interface Pixels {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The document with one layer that holds just these shapes, so the one renderer draws them (symbols, text and all). */
function onlyShapes(doc: Doc, shapes: Shape[]): Doc {
  const d: VectorDrawing = { id: uid('v'), kind: 'vector', shapes };
  const layer: Layer = { id: uid('l'), name: 'Copy', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: uid('c'), start: 0, length: 1, drawingId: d.id }] };
  return { ...doc, layers: [layer], drawings: { ...doc.drawings, [d.id]: d }, editing: undefined, artboards: undefined, camera: undefined, clips: [], markers: [], inOut: undefined } as unknown as Doc;
}

/** Shapes drawn into a picture covering `box` (in page units) at `scale` pixels per unit. See-through where nothing is drawn. */
export function drawShapes(doc: Doc, shapes: Shape[], box: Box, scale: number): Pixels {
  const width = Math.max(1, Math.ceil(box.w * scale));
  const height = Math.max(1, Math.ceil(box.h * scale));
  const c = new OffscreenCanvas(width, height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.scale(scale, scale);
  g.translate(-box.x, -box.y);
  renderFrame(g, onlyShapes(doc, shapes), 0, { background: false, camera: false, includeHidden: true });
  return { width, height, pixels: new Uint8ClampedArray(g.getImageData(0, 0, width, height).data.buffer) };
}

/** The most pixels a copied picture may have on its longest side, so a huge selection doesn't fill the clipboard. */
const COPY_MAX_SIDE = 4096;

/** What a copy of shapes puts on the clipboard: the selection's box drawn at twice the page size (crisp), with nothing behind it. */
export function shapesToPicture(doc: Doc, shapes: Shape[]): Pixels | null {
  const b = shapesBounds(shapes);
  if (!b || b.w <= 0 || b.h <= 0) return null;
  const scale = Math.min(2, COPY_MAX_SIDE / Math.max(b.w, b.h));
  return drawShapes(doc, shapes, b, scale);
}

export const toPng = (p: Pixels): Uint8Array => encodePng({ width: p.width, height: p.height, pixels: p.pixels });

/** The shapes as a small SVG document, sized to what they cover. Instances of symbols and shapes SVG can't hold are drawn as they are in the picture only. */
export function shapesToSvg(doc: Doc, shapes: Shape[]): { svg: string; left: number } | null {
  const b = shapesBounds(shapes);
  if (!b || b.w <= 0 || b.h <= 0) return null;
  let left = 0;
  const body: string[] = [];
  for (const s of shapes) {
    const el = shapeToSvg(s, doc);
    if (el) body.push(el);
    else left++;
  }
  if (!body.length) return null;
  const x = n2(b.x);
  const y = n2(b.y);
  const w = n2(b.w);
  const h = n2(b.h);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">${body.join('')}</svg>`, left };
}

export interface ToPixels {
  /** The whole art grid of the layer, with the shapes drawn in. */
  pixels: Uint8ClampedArray;
  /** Pixels of the pictures that were part see-through and became solid or clear. */
  softened: number;
  /** Pixels whose colour moved to the nearest one in a locked palette. */
  recoloured: number;
  /** Some of the shapes reach past the page edge. */
  offPage: boolean;
}

/**
 * Shapes as pixels on a layer's art grid: each art pixel is `pixelSize` page units, drawn without smoothing (an art
 * pixel is more than half covered or it is clear), and, when the layer's palette is locked, snapped to the nearest
 * palette colour. The shapes stay where they were on the page.
 */
export function shapesToPixels(doc: Doc, shapes: Shape[], grid: { width: number; height: number; pixelSize: number }, lockedPalette: boolean): ToPixels {
  const drawn = drawShapes(doc, shapes, { x: 0, y: 0, w: grid.width * grid.pixelSize, h: grid.height * grid.pixelSize }, 1 / grid.pixelSize);
  // The canvas can come out a pixel off when the page isn't a whole number of art pixels; the grid is the size that counts.
  let px = drawn.pixels;
  if (drawn.width !== grid.width || drawn.height !== grid.height) {
    const fixed = new Uint8ClampedArray(grid.width * grid.height * 4);
    for (let y = 0; y < Math.min(grid.height, drawn.height); y++) fixed.set(drawn.pixels.subarray(y * drawn.width * 4, (y * drawn.width + Math.min(grid.width, drawn.width)) * 4), y * grid.width * 4);
    px = fixed;
  }
  const hard = hardenEdges(px);
  let pixels = hard.pixels;
  let recoloured = 0;
  if (lockedPalette) {
    const r = reduceToPalette(pixels, paletteRgb(docPalette(doc).colors));
    pixels = r.pixels;
    recoloured = r.changed;
  }
  const b = shapesBounds(shapes);
  const w = grid.width * grid.pixelSize;
  const h = grid.height * grid.pixelSize;
  const offPage = !!b && (b.x < -0.5 || b.y < -0.5 || b.x + b.w > w + 0.5 || b.y + b.h > h + 0.5);
  return { pixels, softened: hard.softened, recoloured, offPage };
}

export interface PictureSymbol {
  symbolId: Id;
  symbol: SymbolDef;
  /** The pixels of the picture, as the drawing inside the symbol. */
  drawing: PixelDrawing;
  instance: ReturnType<typeof newInstance>;
}

/**
 * A picture of pixels as something a vector layer can hold: a symbol with one pixel layer inside it, and an instance
 * to place. `pixels` is the whole art grid (`gw` x `gh`, art pixels of `pixelSize` page units). Only the part that shows
 * goes in, and the symbol turns and resizes around its middle. Null when nothing shows.
 */
export function pictureSymbol(pixels: Uint8ClampedArray, gw: number, gh: number, pixelSize: number, name: string, lockedPalette = false): PictureSymbol | null {
  const t = trimPixels(pixels, gw, gh);
  if (t.width <= 0 || t.height <= 0) return null;
  const drawing: PixelDrawing = { id: uid('p'), kind: 'pixel', ...(t.x ? { x: t.x } : {}), ...(t.y ? { y: t.y } : {}), width: t.width, height: t.height, pixels: new Uint8ClampedArray(t.pixels) };
  const origin = { x: (t.x + t.width / 2) * pixelSize, y: (t.y + t.height / 2) * pixelSize };
  const inner: Layer = { id: uid('l'), name: 'Layer 1', kind: 'pixel', visible: true, locked: false, opacity: 1, pixelSize, ...(lockedPalette ? { paletteLock: true } : {}), cels: [{ id: uid('c'), start: 0, length: 1, drawingId: drawing.id }] };
  const symbolId = uid('y');
  const symbol: SymbolDef = { id: symbolId, name, layers: [inner], length: 1, origin };
  return { symbolId, symbol, drawing, instance: newInstance(symbolId, origin) };
}

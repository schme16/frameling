/**
 * Draws tilemap drawings for the shared renderer. Each map is kept as one bitmap at tile-pixel size and only the
 * slots that changed are repainted: a stamped tile repaints one slot, an edited tile repaints the slots that use it,
 * and an animated tile repaints its slots when its frame changes. Maps too big to keep as a bitmap are drawn slot by
 * slot, only where the canvas can see.
 */
import type { Doc, PixelDrawing, TilemapDrawing } from './format';
import { DEFAULT_TILE_SIZE } from './doc';
import { cellFlags, cellKey, flagMatrix, findTile, tileDrawingAt } from '../tiles/model';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Canvas2 = OffscreenCanvas | HTMLCanvasElement;
type TileCanvas = (d: PixelDrawing) => CanvasImageSource;

/** Maps bigger than this (in tile pixels) are drawn directly instead of cached. */
export const MAP_CACHE_MAX_PIXELS = 16_000_000;
const MAX_ENTRIES = 24;

interface Entry {
  canvas: Canvas2;
  tw: number;
  th: number;
  columns: number;
  rows: number;
  /** The cells as last painted. */
  cells: Uint32Array;
  /** The pixels each tile key showed when last painted. */
  shown: Map<number, PixelDrawing | undefined>;
}

const cache = new Map<string, Entry>();
/** Counters for tests and tuning. */
export const tilemapStats = { builds: 0, slotPaints: 0 };

export function clearTilemapCache(): void {
  cache.clear();
}

function makeCanvas(w: number, h: number): Canvas2 {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
}

/** Draws one tile into a slot whose top-left is (x, y), turned as the flags say. */
export function drawTileAt(g: Ctx, img: CanvasImageSource, flags: number, x: number, y: number, tw: number, th: number): void {
  if (!flags) {
    g.drawImage(img, x, y, tw, th);
    return;
  }
  const [a, b, c, d] = flagMatrix(flags);
  g.save();
  // Centred on the slot: p = M (s - half) + half + slot.
  g.transform(a, b, c, d, x + tw / 2 - (a * tw) / 2 - (c * th) / 2, y + th / 2 - (b * tw) / 2 - (d * th) / 2);
  g.drawImage(img, 0, 0, tw, th);
  g.restore();
}

/** The pixel drawing each tile key shows at this frame. */
function resolver(doc: Doc, frame: number): (key: number) => PixelDrawing | undefined {
  const memo = new Map<number, PixelDrawing | undefined>();
  return (key) => {
    if (!memo.has(key)) {
      const t = findTile(doc.tileset, key);
      memo.set(key, t ? tileDrawingAt(doc, t, frame) : undefined);
    }
    return memo.get(key);
  };
}

/** The cached bitmap of a map at a frame, brought up to date. Undefined when the map is too big to cache. */
export function tilemapBitmap(doc: Doc, d: TilemapDrawing, frame: number, tileCanvas: TileCanvas): Canvas2 | undefined {
  const tw = doc.tileset?.tileWidth ?? DEFAULT_TILE_SIZE;
  const th = doc.tileset?.tileHeight ?? DEFAULT_TILE_SIZE;
  const W = d.columns * tw;
  const H = d.rows * th;
  if (W * H > MAP_CACHE_MAX_PIXELS || W < 1 || H < 1) return undefined;
  const resolve = resolver(doc, frame);
  let e = cache.get(d.id);
  if (e && (e.tw !== tw || e.th !== th || e.columns !== d.columns || e.rows !== d.rows)) e = undefined;
  if (e) {
    // Freshest last, so the oldest map is the one to go.
    cache.delete(d.id);
    cache.set(d.id, e);
  }
  const g = (c: Canvas2) => c.getContext('2d') as Ctx;
  if (!e) {
    const canvas = makeCanvas(W, H);
    e = { canvas, tw, th, columns: d.columns, rows: d.rows, cells: new Uint32Array(d.cells.length), shown: new Map() };
    cache.set(d.id, e);
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    tilemapStats.builds++;
  }
  // Which tiles look different from last time (an edit, or an animation step)?
  const changed = new Set<number>();
  for (const [k, was] of e.shown) {
    const now = resolve(k);
    if (now !== was) changed.add(k);
  }
  if (e.cells === d.cells && !changed.size) return e.canvas;
  const ctx = g(e.canvas);
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < d.cells.length; i++) {
    const v = d.cells[i];
    const old = e.cells[i];
    if (v === old && !(v && changed.has(cellKey(v)))) continue;
    const x = (i % d.columns) * tw;
    const y = Math.floor(i / d.columns) * th;
    ctx.clearRect(x, y, tw, th);
    tilemapStats.slotPaints++;
    if (!v) continue;
    const src = resolve(cellKey(v));
    if (src) drawTileAt(ctx, tileCanvas(src), cellFlags(v), x, y, tw, th);
  }
  e.cells = d.cells;
  e.shown.clear();
  for (let i = 0; i < d.cells.length; i++) if (d.cells[i]) {
    const k = cellKey(d.cells[i]);
    if (!e.shown.has(k)) e.shown.set(k, resolve(k));
  }
  return e.canvas;
}

/** Draws a map in document pixels (the caller sets the transform). */
export function drawTilemap(g: Ctx, doc: Doc, d: TilemapDrawing, pixelSize: number, frame: number, tileCanvas: TileCanvas): void {
  const tw = doc.tileset?.tileWidth ?? DEFAULT_TILE_SIZE;
  const th = doc.tileset?.tileHeight ?? DEFAULT_TILE_SIZE;
  const prev = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  const bmp = tilemapBitmap(doc, d, frame, tileCanvas);
  if (bmp) {
    g.drawImage(bmp, 0, 0, d.columns * tw * pixelSize, d.rows * th * pixelSize);
    g.imageSmoothingEnabled = prev;
    return;
  }
  // Too big to keep: draw only the slots the canvas can see.
  const m = g.getTransform();
  const inv = m.inverse();
  const cw = (g.canvas as { width: number }).width;
  const ch = (g.canvas as { height: number }).height;
  const corners = [inv.transformPoint({ x: 0, y: 0 }), inv.transformPoint({ x: cw, y: 0 }), inv.transformPoint({ x: 0, y: ch }), inv.transformPoint({ x: cw, y: ch })];
  const sw = tw * pixelSize;
  const sh = th * pixelSize;
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x)) / sw));
  const x1 = Math.min(d.columns - 1, Math.floor(Math.max(...corners.map((p) => p.x)) / sw));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y)) / sh));
  const y1 = Math.min(d.rows - 1, Math.floor(Math.max(...corners.map((p) => p.y)) / sh));
  const resolve = resolver(doc, frame);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = d.cells[y * d.columns + x];
      if (!v) continue;
      const src = resolve(cellKey(v));
      if (src) drawTileAt(g, tileCanvas(src), cellFlags(v), x * sw, y * sh, sw, sh);
    }
  }
  g.imageSmoothingEnabled = prev;
}

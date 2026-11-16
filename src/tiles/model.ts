/**
 * Tiles and tilemaps as plain functions on a document: the tileset (add, copy, delete, reorder, rename), what a
 * tilemap cell holds (a tile key plus flip flags), map edits on cell arrays, and turning a map into pixels.
 *
 * Nothing here knows about the store or the DOM, so it runs in tests and in exports. Functions that change a document
 * take the doc (a draft inside `store().update`, or a plain object) and change it in place.
 */
import { DEFAULT_TILE_SIZE, newPixelDrawing, tileOrigin, tilemapGrid } from '../core/doc';
import type { Doc, Id, PixelDrawing, Tile, TilemapDrawing, TilemapLayer, Tileset } from '../core/format';
import { TILE_FLIP_D, TILE_FLIP_X, TILE_FLIP_Y, TILE_KEY_MASK } from '../core/format';
import { propsOf, writeProps } from './props';
import { fitShapes } from './shapes';

export const MIN_TILE = 1;
export const MAX_TILE = 256;
/** The flag bits of a cell. */
export const FLAG_MASK = (TILE_FLIP_X | TILE_FLIP_Y | TILE_FLIP_D) >>> 0;

// ---------------------------------------------------------------- cells

export const cellKey = (c: number): number => c & TILE_KEY_MASK;
export const cellFlags = (c: number): number => (c & FLAG_MASK) >>> 0;
/** A cell value for a tile key with flags (0 key = empty, whatever the flags). */
export const makeCell = (key: number, flags = 0): number => (key > 0 ? ((key & TILE_KEY_MASK) | (flags & FLAG_MASK)) >>> 0 : 0);

/** A tile's orientation as a 2 x 2 matrix [a, b, c, d] acting on centred coordinates: (u, v) -> (a u + c v, b u + d v). */
export function flagMatrix(flags: number): [number, number, number, number] {
  // The diagonal mirror goes first, then left-right, then top-bottom (Tiled's order, which Godot shares).
  let m: [number, number, number, number] = [1, 0, 0, 1];
  if (flags & TILE_FLIP_D) m = [0, 1, 1, 0];
  if (flags & TILE_FLIP_X) m = [-m[0], m[1], -m[2], m[3]];
  if (flags & TILE_FLIP_Y) m = [m[0], -m[1], m[2], -m[3]];
  return m;
}

const ALL_FLAGS = [0, TILE_FLIP_X, TILE_FLIP_Y, TILE_FLIP_D, TILE_FLIP_X | TILE_FLIP_Y, TILE_FLIP_X | TILE_FLIP_D, TILE_FLIP_Y | TILE_FLIP_D, TILE_FLIP_X | TILE_FLIP_Y | TILE_FLIP_D].map((f) => f >>> 0);

/** The flags whose matrix is `m` (each of the 8 orientations has exactly one). */
function flagsOf(m: [number, number, number, number]): number {
  return ALL_FLAGS.find((f) => flagMatrix(f).every((x, i) => x === m[i])) ?? 0;
}

function mul(p: [number, number, number, number], q: [number, number, number, number]): [number, number, number, number] {
  // p after q.
  return [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3]];
}

/** The orientation after turning a quarter clockwise (on screen) from `flags`. */
export function rotateFlags(flags: number, dir: 1 | -1 = 1): number {
  const r: [number, number, number, number] = dir === 1 ? [0, 1, -1, 0] : [0, -1, 1, 0];
  return flagsOf(mul(r, flagMatrix(flags)));
}

/** The orientation after mirroring the (already turned) tile left to right, or top to bottom. */
export function mirrorFlags(flags: number, axis: 'x' | 'y'): number {
  const r: [number, number, number, number] = axis === 'x' ? [-1, 0, 0, 1] : [1, 0, 0, -1];
  return flagsOf(mul(r, flagMatrix(flags)));
}

// ---------------------------------------------------------------- the tileset

export function newTileset(tileWidth = DEFAULT_TILE_SIZE, tileHeight = tileWidth): Tileset {
  return { tileWidth: clampTile(tileWidth), tileHeight: clampTile(tileHeight), tiles: [], nextKey: 1 };
}

export const clampTile = (n: number): number => Math.max(MIN_TILE, Math.min(MAX_TILE, Math.round(n) || DEFAULT_TILE_SIZE));

/** The document's tileset, made (empty) if it has none yet. */
export function ensureTileset(doc: Doc, tileWidth?: number, tileHeight?: number): Tileset {
  if (!doc.tileset) doc.tileset = newTileset(tileWidth, tileHeight ?? tileWidth);
  return doc.tileset;
}

export function findTile(ts: Tileset | undefined, key: number): Tile | undefined {
  return ts?.tiles.find((t) => t.key === key);
}

export function tileIndex(ts: Tileset | undefined, key: number): number {
  return ts ? ts.tiles.findIndex((t) => t.key === key) : -1;
}

function uniqueTileName(ts: Tileset, base: string): string {
  const names = new Set(ts.tiles.map((t) => t.name));
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** Adds an empty tile (or one with these pixels) after `after` (default: at the end). Returns it. */
export function addTile(doc: Doc, opts: { name?: string; pixels?: Uint8ClampedArray; after?: number } = {}): Tile {
  const ts = ensureTileset(doc);
  const d = newPixelDrawing(ts.tileWidth, ts.tileHeight);
  if (opts.pixels && opts.pixels.length === d.pixels.length) d.pixels = new Uint8ClampedArray(opts.pixels);
  doc.drawings[d.id] = d;
  const key = Math.max(ts.nextKey, 1 + Math.max(0, ...ts.tiles.map((t) => t.key)));
  const tile: Tile = { key, name: opts.name ? uniqueTileName(ts, opts.name) : uniqueTileName(ts, `Tile ${ts.tiles.length + 1}`), frames: [{ drawingId: d.id, duration: 1 }] };
  ts.nextKey = key + 1;
  const at = opts.after !== undefined ? tileIndex(ts, opts.after) : -1;
  if (at >= 0) ts.tiles.splice(at + 1, 0, tile);
  else ts.tiles.push(tile);
  return tile;
}

/** A copy of a tile (its pixels copied too), placed just after it. */
export function duplicateTile(doc: Doc, key: number): Tile | null {
  const ts = doc.tileset;
  const src = findTile(ts, key);
  if (!ts || !src) return null;
  const frames = src.frames.map((f) => {
    const from = doc.drawings[f.drawingId];
    const d = newPixelDrawing(ts.tileWidth, ts.tileHeight);
    if (from && from.kind === 'pixel' && from.pixels.length === d.pixels.length) d.pixels = new Uint8ClampedArray(from.pixels);
    doc.drawings[d.id] = d;
    return { drawingId: d.id, duration: f.duration };
  });
  const tile: Tile = { key: ts.nextKey, name: uniqueTileName(ts, src.name.replace(/ copy( \d+)?$/, '') + ' copy'), frames };
  // Shapes, values and terrain come along: a copy of a spike is still a spike.
  writeProps(tile, propsOf(src));
  ts.nextKey++;
  ts.tiles.splice(tileIndex(ts, key) + 1, 0, tile);
  return tile;
}

/** Deletes a tile and its pixels. Map cells that used it become empty. Returns how many cells were cleared, or -1. */
export function deleteTile(doc: Doc, key: number): number {
  const ts = doc.tileset;
  const i = tileIndex(ts, key);
  if (!ts || i < 0) return -1;
  const [tile] = ts.tiles.splice(i, 1);
  for (const f of tile.frames) delete doc.drawings[f.drawingId];
  let cleared = 0;
  for (const d of Object.values(doc.drawings)) {
    if (d.kind !== 'tilemap') continue;
    let next: Uint32Array | null = null;
    for (let k = 0; k < d.cells.length; k++) {
      if (d.cells[k] !== 0 && cellKey(d.cells[k]) === key) {
        if (!next) next = new Uint32Array(d.cells);
        next[k] = 0;
        cleared++;
      }
    }
    if (next) d.cells = next;
  }
  return cleared;
}

/** Moves a tile to a new place in the list (keys stay the same, so maps don't change). */
export function moveTile(doc: Doc, key: number, to: number): boolean {
  const ts = doc.tileset;
  const i = tileIndex(ts, key);
  if (!ts || i < 0) return false;
  const j = Math.max(0, Math.min(ts.tiles.length - 1, to));
  if (i === j) return false;
  const [t] = ts.tiles.splice(i, 1);
  ts.tiles.splice(j, 0, t);
  return true;
}

export function renameTile(doc: Doc, key: number, name: string): boolean {
  const t = findTile(doc.tileset, key);
  const n = name.trim();
  if (!t || !n || t.name === n) return false;
  t.name = n;
  return true;
}

/** How long one loop of a tile's animation is, in document frames. */
export function tileLoopLength(tile: Tile): number {
  let n = 0;
  for (const f of tile.frames) n += Math.max(1, f.duration);
  return Math.max(1, n);
}

/** Which of a tile's frames shows at a document frame (animated tiles loop from frame 0). */
export function tileFrameIndex(tile: Tile, frame: number): number {
  if (tile.frames.length <= 1) return 0;
  let t = ((frame % tileLoopLength(tile)) + tileLoopLength(tile)) % tileLoopLength(tile);
  for (let i = 0; i < tile.frames.length; i++) {
    t -= Math.max(1, tile.frames[i].duration);
    if (t < 0) return i;
  }
  return 0;
}

/** The pixels a tile shows at a document frame. */
export function tileDrawingAt(doc: Doc, tile: Tile, frame: number): PixelDrawing | undefined {
  const f = tile.frames[tileFrameIndex(tile, frame)];
  const d = f ? doc.drawings[f.drawingId] : undefined;
  return d && d.kind === 'pixel' ? d : undefined;
}

/** How many map cells use a tile, across every tilemap drawing. */
export function tileUsage(doc: Doc, key: number): number {
  let n = 0;
  for (const d of Object.values(doc.drawings)) {
    if (d.kind !== 'tilemap') continue;
    for (let k = 0; k < d.cells.length; k++) if (d.cells[k] !== 0 && cellKey(d.cells[k]) === key) n++;
  }
  return n;
}

/** Changes the tile size. Tiles are cropped or padded (top-left stays put). Returns false when nothing changed. */
export function setTileSize(doc: Doc, w: number, h: number): boolean {
  const ts = ensureTileset(doc);
  const W = clampTile(w);
  const H = clampTile(h);
  if (W === ts.tileWidth && H === ts.tileHeight) return false;
  for (const t of ts.tiles) {
    // Shapes follow the new size: a whole-tile shape stays whole, the rest are pulled inside.
    if (t.collision) {
      const shapes = fitShapes(t.collision.shapes, { w: ts.tileWidth, h: ts.tileHeight }, { w: W, h: H });
      if (shapes.length) t.collision = { ...t.collision, shapes };
      else delete t.collision;
    }
    for (const f of t.frames) {
      const d = doc.drawings[f.drawingId];
      if (!d || d.kind !== 'pixel') continue;
      const next = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < Math.min(H, d.height); y++) next.set(d.pixels.subarray(y * d.width * 4, (y * d.width + Math.min(W, d.width)) * 4), y * W * 4);
      d.width = W;
      d.height = H;
      d.pixels = next;
    }
  }
  ts.tileWidth = W;
  ts.tileHeight = H;
  // A grid start has to stay inside the first tile.
  if ((ts.gridX ?? 0) >= W) delete ts.gridX;
  if ((ts.gridY ?? 0) >= H) delete ts.gridY;
  return true;
}

/** A grid start made to fit: a whole number from 0 up to the tile size minus 1. */
export const clampGrid = (v: number, tile: number): number => Math.max(0, Math.min(tile - 1, Math.round(v) || 0));

/**
 * Sets where a tile edge sits from the stage's top-left corner (0 = the tiles start at the corner). The tiles already
 * on a map move with the grid, and maps grow to still cover the stage. Returns false when nothing changed.
 */
export function setTileGrid(doc: Doc, x: number, y: number): boolean {
  const ts = ensureTileset(doc);
  const gx = clampGrid(x, ts.tileWidth);
  const gy = clampGrid(y, ts.tileHeight);
  if (gx === (ts.gridX ?? 0) && gy === (ts.gridY ?? 0)) return false;
  if (gx) ts.gridX = gx;
  else delete ts.gridX;
  if (gy) ts.gridY = gy;
  else delete ts.gridY;
  for (const layer of doc.layers) {
    if (layer.kind !== 'tilemap') continue;
    const g = tilemapGrid(doc, layer);
    for (const cel of layer.cels) {
      const d = doc.drawings[cel.drawingId];
      if (!d || d.kind !== 'tilemap' || (d.columns >= g.columns && d.rows >= g.rows)) continue;
      const columns = Math.max(d.columns, g.columns);
      const rows = Math.max(d.rows, g.rows);
      const cells = new Uint32Array(columns * rows);
      for (let r = 0; r < d.rows; r++) cells.set(d.cells.subarray(r * d.columns, (r + 1) * d.columns), r * columns);
      d.columns = columns;
      d.rows = rows;
      d.cells = cells;
    }
  }
  return true;
}

// ---------------------------------------------------------------- maps

/** The tile slot under a document position on a tilemap layer (may be outside the map). */
export function docToCell(doc: Doc, layer: TilemapLayer, x: number, y: number): { x: number; y: number } {
  const tw = (doc.tileset?.tileWidth ?? DEFAULT_TILE_SIZE) * layer.pixelSize;
  const th = (doc.tileset?.tileHeight ?? DEFAULT_TILE_SIZE) * layer.pixelSize;
  const o = tileOrigin(doc, layer.pixelSize);
  return { x: Math.floor((x - o.x) / tw), y: Math.floor((y - o.y) / th) };
}

export function inMap(d: Pick<TilemapDrawing, 'columns' | 'rows'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < d.columns && y < d.rows;
}

export function getCell(d: Pick<TilemapDrawing, 'columns' | 'rows' | 'cells'>, x: number, y: number): number {
  return inMap(d, x, y) ? d.cells[y * d.columns + x] : 0;
}

/** Sets one cell in a cell array. Returns true if it changed. */
export function setCell(cells: Uint32Array, columns: number, rows: number, x: number, y: number, v: number): boolean {
  if (x < 0 || y < 0 || x >= columns || y >= rows) return false;
  const i = y * columns + x;
  if (cells[i] === v) return false;
  cells[i] = v;
  return true;
}

/** Fills a rectangle of cells (corners in any order, clipped to the map). Returns how many changed. */
export function fillCellRect(cells: Uint32Array, columns: number, rows: number, x0: number, y0: number, x1: number, y1: number, v: number): number {
  let n = 0;
  const ax = Math.max(0, Math.min(x0, x1));
  const bx = Math.min(columns - 1, Math.max(x0, x1));
  const ay = Math.max(0, Math.min(y0, y1));
  const by = Math.min(rows - 1, Math.max(y0, y1));
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) if (setCell(cells, columns, rows, x, y, v)) n++;
  return n;
}

/** Fills the connected run of cells that hold the same thing as (x, y), sideways and up and down. Returns how many changed. */
export function floodCells(cells: Uint32Array, columns: number, rows: number, x: number, y: number, v: number): number {
  if (x < 0 || y < 0 || x >= columns || y >= rows) return 0;
  const from = cells[y * columns + x];
  if (from === v) return 0;
  const stack = [y * columns + x];
  let n = 0;
  while (stack.length) {
    const i = stack.pop()!;
    if (cells[i] !== from) continue;
    cells[i] = v;
    n++;
    const cx = i % columns;
    if (cx > 0) stack.push(i - 1);
    if (cx < columns - 1) stack.push(i + 1);
    if (i >= columns) stack.push(i - columns);
    if (i + columns < cells.length) stack.push(i + columns);
  }
  return n;
}

/** The cells a straight line between two slots crosses (for dragging quickly). */
export function cellLine(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** A tilemap drawing resized to a new grid (top-left stays put). */
export function resizeTilemap(d: TilemapDrawing, columns: number, rows: number): Uint32Array {
  const next = new Uint32Array(columns * rows);
  for (let y = 0; y < Math.min(rows, d.rows); y++) for (let x = 0; x < Math.min(columns, d.columns); x++) next[y * columns + x] = d.cells[y * d.columns + x];
  return next;
}

/** Keys of the tiles a map uses, in the order they first appear. */
export function usedKeys(d: TilemapDrawing): number[] {
  const seen = new Set<number>();
  for (let i = 0; i < d.cells.length; i++) if (d.cells[i]) seen.add(cellKey(d.cells[i]));
  return [...seen];
}

// ---------------------------------------------------------------- pixels

/**
 * Copies a tile's pixels into a bigger RGBA buffer at (ox, oy) with an orientation. Pixels outside the target are
 * skipped. See-through pixels of the tile are copied too (they replace what was there), as a map slot shows one tile.
 */
export function blitTile(src: PixelDrawing, flags: number, dst: Uint8ClampedArray, dw: number, dh: number, ox: number, oy: number): void {
  const w = src.width;
  const h = src.height;
  const [a, b, c, d] = flagMatrix(flags);
  // The inverse of an orientation matrix is its transpose.
  for (let y = 0; y < h; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= dh) continue;
    for (let x = 0; x < w; x++) {
      const tx = ox + x;
      if (tx < 0 || tx >= dw) continue;
      const u = x + 0.5 - w / 2;
      const v = y + 0.5 - h / 2;
      const su = Math.floor(a * u + b * v + w / 2);
      const sv = Math.floor(c * u + d * v + h / 2);
      if (su < 0 || sv < 0 || su >= w || sv >= h) continue;
      const si = (sv * w + su) * 4;
      const di = (ty * dw + tx) * 4;
      dst[di] = src.pixels[si];
      dst[di + 1] = src.pixels[si + 1];
      dst[di + 2] = src.pixels[si + 2];
      dst[di + 3] = src.pixels[si + 3];
    }
  }
}

/**
 * A tilemap as one pixel drawing (columns x tile width by rows x tile height), at a document frame. It starts at the
 * stage's corner: when the tile grid starts off the corner, the part of the first slots outside the stage is cut.
 */
export function flattenTilemap(doc: Doc, d: TilemapDrawing, frame = 0): PixelDrawing {
  const tw = doc.tileset?.tileWidth ?? DEFAULT_TILE_SIZE;
  const th = doc.tileset?.tileHeight ?? DEFAULT_TILE_SIZE;
  const o = tileOrigin(doc);
  const out = newPixelDrawing(Math.max(1, d.columns * tw + o.x), Math.max(1, d.rows * th + o.y));
  out.id = d.id + '-flat';
  const tiles = new Map<number, PixelDrawing | undefined>();
  for (let y = 0; y < d.rows; y++) {
    for (let x = 0; x < d.columns; x++) {
      const v = d.cells[y * d.columns + x];
      if (!v) continue;
      const k = cellKey(v);
      if (!tiles.has(k)) {
        const t = findTile(doc.tileset, k);
        tiles.set(k, t ? tileDrawingAt(doc, t, frame) : undefined);
      }
      const src = tiles.get(k);
      if (src) blitTile(src, cellFlags(v), out.pixels, out.width, out.height, o.x + x * tw, o.y + y * th);
    }
  }
  return out;
}

/** Ids of every drawing a tileset owns. */
export function tileDrawingIds(ts: Tileset | undefined): Set<Id> {
  const s = new Set<Id>();
  for (const t of ts?.tiles ?? []) for (const f of t.frames) s.add(f.drawingId);
  return s;
}


/**
 * Helpers for reading and building documents. Pure functions on the format types, no DOM.
 */
import type { BrushSettings, Cel, Doc, Drawing, Id, Layer, PixelDrawing, PixelLayer, TilemapDrawing, TilemapLayer, VectorDrawing, VectorLayer } from './format';
import { FORMAT_VERSION } from './format';

let counter = 0;
/** A short unique id. */
export function uid(prefix = ''): Id {
  counter = (counter + 1) % 1679616;
  return prefix + Date.now().toString(36).slice(-6) + counter.toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 6);
}

export const DEFAULT_BRUSH: BrushSettings = {
  size: 8,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.5,
  taperStart: 0,
  taperEnd: 0,
  capStart: true,
  capEnd: true,
};

export const DEFAULT_SWATCHES = [
  ['Ink', '#1d1b26'],
  ['Paper', '#fffaf0'],
  ['Sunny', '#ffc94a'],
  ['Peach', '#ff9e6d'],
  ['Rose', '#ff6f91'],
  ['Grape', '#9b7bff'],
  ['Sky', '#5ab8ff'],
  ['Mint', '#4fd1a5'],
  ['Leaf', '#6abf4b'],
  ['Stone', '#8a8598'],
] as const;

export function newDoc(opts: Partial<Pick<Doc, 'name' | 'width' | 'height' | 'fps' | 'length' | 'background'>> & { pixel?: { pixelSize: number } } = {}): Doc {
  const doc: Doc = {
    format: 'frameling',
    version: FORMAT_VERSION,
    lineage: true,
    id: uid('d'),
    name: opts.name ?? 'Untitled',
    width: opts.width ?? 1280,
    height: opts.height ?? 720,
    fps: opts.fps ?? 12,
    length: opts.length ?? 24,
    background: opts.background === undefined ? '#ffffff' : opts.background,
    layers: [],
    drawings: {},
    clips: [],
    markers: [],
    swatches: DEFAULT_SWATCHES.map(([name, color]) => ({ id: uid('s'), name, color })),
  };
  const layer = opts.pixel ? newPixelLayer('Layer 1', opts.pixel.pixelSize) : newVectorLayer('Layer 1');
  doc.layers.push(layer);
  return doc;
}

export function newVectorLayer(name: string): VectorLayer {
  return { id: uid('l'), name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
}

export function newPixelLayer(name: string, pixelSize: number): PixelLayer {
  return { id: uid('l'), name, kind: 'pixel', pixelSize: Math.max(1, Math.round(pixelSize)), visible: true, locked: false, opacity: 1, cels: [] };
}

export function newTilemapLayer(name: string, pixelSize: number): TilemapLayer {
  return { id: uid('l'), name, kind: 'tilemap', pixelSize: Math.max(1, Math.round(pixelSize)), visible: true, locked: false, opacity: 1, cels: [] };
}

/** Tile size used before a document has a tileset. */
export const DEFAULT_TILE_SIZE = 16;

/** How many tiles fit across and down the stage on a tilemap layer (a part tile at the edge counts). */
export function tilemapGrid(doc: Doc, layer: TilemapLayer): { columns: number; rows: number } {
  const tw = (doc.tileset?.tileWidth ?? DEFAULT_TILE_SIZE) * layer.pixelSize;
  const th = (doc.tileset?.tileHeight ?? DEFAULT_TILE_SIZE) * layer.pixelSize;
  const o = tileOrigin(doc, layer.pixelSize);
  return { columns: Math.max(1, Math.ceil((doc.width - o.x) / tw)), rows: Math.max(1, Math.ceil((doc.height - o.y) / th)) };
}

/**
 * Where the first slot of a map starts, in document pixels: 0 or a little left of and above the stage, so the slots
 * still cover its top-left corner when the tile grid does not start there (Tileset.gridX / gridY).
 */
export function tileOrigin(doc: Doc, pixelSize = 1): { x: number; y: number } {
  const ts = doc.tileset;
  if (!ts) return { x: 0, y: 0 };
  const gx = ts.gridX ?? 0;
  const gy = ts.gridY ?? 0;
  return { x: (gx > 0 ? gx - ts.tileWidth : 0) * pixelSize, y: (gy > 0 ? gy - ts.tileHeight : 0) * pixelSize };
}

export function newTilemapDrawing(columns: number, rows: number): TilemapDrawing {
  return { id: uid('t'), kind: 'tilemap', columns, rows, cells: new Uint32Array(columns * rows) };
}

/** The art grid size of a pixel layer. */
export function pixelGrid(doc: Doc, layer: PixelLayer): { width: number; height: number } {
  return { width: Math.ceil(doc.width / layer.pixelSize), height: Math.ceil(doc.height / layer.pixelSize) };
}

export function newVectorDrawing(): VectorDrawing {
  return { id: uid('v'), kind: 'vector', shapes: [] };
}

export function newPixelDrawing(width: number, height: number): PixelDrawing {
  return { id: uid('p'), kind: 'pixel', width, height, pixels: new Uint8ClampedArray(width * height * 4) };
}

/** A fresh, empty drawing of the right kind for a layer. */
export function newDrawingFor(doc: Doc, layer: Layer): Drawing {
  if (layer.kind === 'pixel') {
    const g = pixelGrid(doc, layer);
    return newPixelDrawing(g.width, g.height);
  }
  if (layer.kind === 'tilemap') {
    const g = tilemapGrid(doc, layer);
    return newTilemapDrawing(g.columns, g.rows);
  }
  if (layer.kind === 'camera') return { id: uid('k'), kind: 'camera', view: { x: doc.width / 2, y: doc.height / 2, zoom: 1, rotation: 0 } };
  return newVectorDrawing();
}

/** The cel covering `frame` on a layer, if any. */
export function celAt(layer: Layer, frame: number): Cel | undefined {
  for (const c of layer.cels) {
    if (frame >= c.start && frame < c.start + c.length) return c;
    if (c.start > frame) break;
  }
  return undefined;
}

/** The drawing showing on a layer at `frame`, if any. */
export function drawingAt(doc: Doc, layer: Layer, frame: number): Drawing | undefined {
  const cel = celAt(layer, frame);
  return cel ? doc.drawings[cel.drawingId] : undefined;
}

export function findLayer(doc: Doc, id: Id | null | undefined): Layer | undefined {
  return id ? doc.layers.find((l) => l.id === id) : undefined;
}

/** Keeps cels sorted and drops any that are empty or entirely past the document's end. */
export function normaliseCels(layer: Layer): void {
  layer.cels.sort((a, b) => a.start - b.start);
  layer.cels = layer.cels.filter((c) => c.length > 0);
}

/** The last frame any cel reaches, plus one (0 for an empty document). */
export function contentLength(doc: Doc): number {
  let n = 0;
  for (const l of doc.layers) for (const c of l.cels) n = Math.max(n, c.start + c.length);
  return n;
}

/** Removes drawings no cel (and no tile) points at. */
export function pruneDrawings(doc: Doc): void {
  const used = new Set<string>();
  // Symbols' layers (and layers set aside while one is open) use the same drawings.
  const lists: Layer[][] = [doc.layers, ...(doc.editing ?? []).map((f) => f.layers), ...Object.values(doc.symbols ?? {}).map((s) => s.layers)];
  // Artboards that aren't open keep their layers aside.
  for (const a of doc.artboards ?? []) if (a.content) lists.push(a.content.layers);
  for (const list of lists) for (const l of list) for (const c of l.cels) used.add(c.drawingId);
  for (const t of doc.tileset?.tiles ?? []) for (const f of t.frames) used.add(f.drawingId);
  for (const id of Object.keys(doc.drawings)) if (!used.has(id)) delete doc.drawings[id];
}

/**
 * Changing the stage size, two ways:
 * - resize the canvas: the artwork stays the size it is and the space round it grows or shrinks, on the side the
 *   anchor says (canvas size);
 * - scale the artwork: everything grows or shrinks with the stage (image size).
 *
 * Pure functions: they take a document and hand back a new one (nothing is changed in place), so the store can swap
 * the parts in as one undo step. Pixel and tile layers only ever move by whole art pixels or tiles, and only scale
 * by steps that keep every art pixel a whole number of stage pixels, so pixel art never goes blurry.
 */
import type { CameraDrawing, Cel, Doc, Drawing, Guide, Layer, LayerEffect, PixelDrawing, Shape, SymbolDef, TilemapDrawing, VectorDrawing } from '../core/format';
import { DEFAULT_TILE_SIZE, tileOrigin } from '../core/doc';
import { EFFECTS } from '../effects/model';
import { scaleBy, transformShape, translate, type Matrix } from './geometry';

/** Which way the new space goes: 'nw' keeps the top-left corner where it is, 'c' grows evenly all round. */
export type Anchor = 'nw' | 'n' | 'ne' | 'w' | 'c' | 'e' | 'sw' | 's' | 'se';

export const ANCHORS: Anchor[] = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];

export const MIN_SIZE = 1;
export const MAX_SIZE = 16384;

/** How far (stage pixels) the old stage's top-left moves inside the new one. */
export function anchorOffset(oldW: number, oldH: number, newW: number, newH: number, anchor: Anchor): { dx: number; dy: number } {
  const fx = anchor.endsWith('w') ? 0 : anchor.endsWith('e') ? 1 : 0.5;
  const fy = anchor.startsWith('n') ? 0 : anchor.startsWith('s') ? 1 : 0.5;
  return { dx: Math.round((newW - oldW) * fx), dy: Math.round((newH - oldH) * fy) };
}

export const clampSize = (v: number): number => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(Number.isFinite(v) ? v : MIN_SIZE)));

// ---------------------------------------------------------------- pixel and tile grids

/** A pixel drawing on a new grid, its old pixels moved by (ox, oy) art pixels. Anything off the grid is cut. */
export function regridPixels(d: PixelDrawing, w: number, h: number, ox: number, oy: number): PixelDrawing {
  if (w === d.width && h === d.height && !ox && !oy) return d;
  const out = new Uint8ClampedArray(w * h * 4);
  const x0 = Math.max(0, ox);
  const x1 = Math.min(w, d.width + ox);
  if (x1 > x0) {
    for (let y = 0; y < d.height; y++) {
      const ny = y + oy;
      if (ny < 0 || ny >= h) continue;
      const src = (y * d.width + (x0 - ox)) * 4;
      out.set(d.pixels.subarray(src, src + (x1 - x0) * 4), (ny * w + x0) * 4);
    }
  }
  return { ...d, width: w, height: h, pixels: out };
}

/** The same for a tilemap, moved by whole tiles. */
export function regridTiles(d: TilemapDrawing, columns: number, rows: number, ox: number, oy: number): TilemapDrawing {
  if (columns === d.columns && rows === d.rows && !ox && !oy) return d;
  const out = new Uint32Array(columns * rows);
  for (let y = 0; y < d.rows; y++) {
    const ny = y + oy;
    if (ny < 0 || ny >= rows) continue;
    for (let x = 0; x < d.columns; x++) {
      const nx = x + ox;
      if (nx >= 0 && nx < columns) out[ny * columns + nx] = d.cells[y * d.columns + x];
    }
  }
  return { ...d, columns, rows, cells: out };
}

/** Whole steps pixel art can scale by: 1/G, where G is the largest number every pixel and tile size divides by. */
export function pixelScaleStep(doc: Doc): number {
  let g = 0;
  for (const l of doc.layers) if (l.kind === 'pixel' || l.kind === 'tilemap') g = gcd(g, l.pixelSize);
  return g;
}

/** True when the document has pixel or tile layers, so scaling goes in whole steps and keeps its shape. */
export const hasPixelArt = (doc: Doc): boolean => pixelScaleStep(doc) > 0;

/** The nearest scale pixel art can take (at least one step). Without pixel layers any scale goes. */
export function snapScale(k: number, step: number): number {
  if (!step) return k;
  return Math.max(1, Math.round(k * step)) / step;
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a;
}

// ---------------------------------------------------------------- walking the document

interface Owner {
  layer: Layer;
  /** On the stage (true) or inside a symbol. Symbol space never moves; only its pixel grids follow the stage size. */
  stage: boolean;
}

/** Which layer each drawing is shown on (the first one found, stage layers first). */
function owners(doc: Doc): Map<string, Owner> {
  const map = new Map<string, Owner>();
  const add = (layers: Layer[], stage: boolean) => {
    for (const layer of layers) for (const c of layer.cels) if (!map.has(c.drawingId)) map.set(c.drawingId, { layer, stage });
  };
  add(doc.layers, true);
  for (const s of Object.values(doc.symbols ?? {}) as SymbolDef[]) add(s.layers, false);
  return map;
}

function tileSize(doc: Doc): { w: number; h: number } {
  return { w: doc.tileset?.tileWidth ?? DEFAULT_TILE_SIZE, h: doc.tileset?.tileHeight ?? DEFAULT_TILE_SIZE };
}

/** Moves a point-ish thing by a matrix (only scale and move are used here). */
const mapXY = (m: Matrix, p: { x: number; y: number }) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

function mapShape(s: Shape, m: Matrix): Shape {
  if (s.type !== 'instance') return transformShape(s, m);
  // Instances: done here so no symbol lookup is needed (only scale and move ever reach this).
  const t = s.transform;
  return { ...s, transform: { ...t, x: m[0] * t.x + m[4], y: m[3] * t.y + m[5], scaleX: t.scaleX * m[0], scaleY: t.scaleY * m[3] } };
}

function mapCels(cels: Cel[], m: Matrix): Cel[] {
  if (!cels.some((c) => c.tween?.path || c.tween?.hints)) return cels;
  return cels.map((c) => {
    if (!c.tween || (!c.tween.path && !c.tween.hints)) return c;
    const tween = { ...c.tween };
    if (tween.path) tween.path = { ...tween.path, points: tween.path.points.map((p) => ({ ...mapXY(m, p), ...(p.c1 ? { c1: mapXY(m, p.c1) } : {}), ...(p.c2 ? { c2: mapXY(m, p.c2) } : {}) })) };
    if (tween.hints) tween.hints = tween.hints.map((h) => ({ ...h, from: mapXY(m, h.from), to: mapXY(m, h.to) }));
    return { ...c, tween };
  });
}

/** Stage layers with their own geometry (bones, skin meshes, motion paths) moved by the matrix. */
function mapLayers(layers: Layer[], m: Matrix, k: number): Layer[] {
  return layers.map((l) => {
    let out: Layer = l;
    const cels = mapCels(l.cels, m);
    if (cels !== l.cels) out = { ...out, cels };
    if (l.kind === 'vector' && l.rig) {
      const scalePose = (p: Record<string, { r: number; x?: number; y?: number }>) =>
        Object.fromEntries(Object.entries(p).map(([id, b]) => [id, { ...b, ...(b.x !== undefined ? { x: b.x * m[0] } : {}), ...(b.y !== undefined ? { y: b.y * m[3] } : {}) }]));
      out = {
        ...out,
        kind: 'vector',
        rig: {
          ...l.rig,
          bones: l.rig.bones.map((b) => ({ ...b, ...mapXY(m, b), length: b.length * k })),
          ...(l.rig.poses ? { poses: l.rig.poses.map((p) => ({ ...p, pose: scalePose(p.pose) })) } : {}),
        },
      } as Layer;
    }
    if (l.bind?.mesh) {
      const pts = l.bind.mesh.points.map((v, i) => (i % 2 ? m[3] * v + m[5] : m[0] * v + m[4]));
      out = { ...out, bind: { ...l.bind, mesh: { ...l.bind.mesh, points: pts } } };
    }
    if (k !== 1 && l.effects?.length) out = { ...out, effects: scaleEffects(l.effects, k) };
    return out;
  });
}

/** Effect settings measured in pixels (blur, glow size, shadow offset) scaled with the artwork. */
function scaleEffects(list: LayerEffect[], k: number): LayerEffect[] {
  return list.map((e) => {
    const info = EFFECTS.find((x) => x.kind === e.kind);
    const px = new Set((info?.params ?? []).filter((p) => p.unit === 'px').map((p) => p.key));
    if (!px.size) return e;
    const values = { ...e.values };
    for (const key of px) if (typeof values[key] === 'number') values[key] = (values[key] as number) * k;
    const keys = e.keys?.map((kf) => ({ ...kf, values: Object.fromEntries(Object.entries(kf.values).map(([n, v]) => [n, px.has(n) ? v * k : v])) }));
    return { ...e, values, ...(keys ? { keys } : {}) };
  });
}

function mapGuides(guides: Guide[] | undefined, fx: (x: number) => number, fy: (y: number) => number): Guide[] | undefined {
  return guides?.map((g) => ({ ...g, at: g.axis === 'x' ? fx(g.at) : fy(g.at) }));
}

/** What the change did that someone might want to know (pixel art moved a little off, part of it cut). */
export interface ResizeResult {
  doc: Doc;
  notes: string[];
}

// ---------------------------------------------------------------- resize the canvas

/**
 * The stage made `w` x `h`, with the artwork staying the size it is. The anchor says where the old stage sits in the
 * new one; anything that ends up outside is kept on vector layers (it just isn't shown) and cut on pixel layers.
 */
export function resizeCanvas(doc: Doc, w: number, h: number, anchor: Anchor): ResizeResult {
  w = clampSize(w);
  h = clampSize(h);
  const { dx, dy } = anchorOffset(doc.width, doc.height, w, h, anchor);
  const m = translate(dx, dy);
  const tile = tileSize(doc);
  const own = owners(doc);
  const notes = new Set<string>();
  const drawings: Record<string, Drawing> = {};
  for (const [id, d] of Object.entries(doc.drawings)) {
    const o = own.get(id);
    drawings[id] = d;
    if (!o) continue;
    const { layer, stage } = o;
    if (d.kind === 'vector' && stage && (dx || dy)) drawings[id] = moveVector(d, m);
    else if (d.kind === 'camera' && stage && (dx || dy)) drawings[id] = { ...d, view: { ...d.view, x: d.view.x + dx, y: d.view.y + dy } } as CameraDrawing;
    else if (d.kind === 'pixel' && (layer.kind === 'pixel' || layer.kind === 'tilemap')) {
      const ps = layer.pixelSize;
      const ox = stage ? Math.round(dx / ps) : 0;
      const oy = stage ? Math.round(dy / ps) : 0;
      if (stage && (ox * ps !== dx || oy * ps !== dy)) notes.add('pixel-shift');
      drawings[id] = regridPixels(d, Math.ceil(w / ps), Math.ceil(h / ps), ox, oy);
    } else if (d.kind === 'tilemap' && layer.kind === 'tilemap') {
      const tw = tile.w * layer.pixelSize;
      const th = tile.h * layer.pixelSize;
      const ox = stage ? Math.round(dx / tw) : 0;
      const oy = stage ? Math.round(dy / th) : 0;
      if (stage && (ox * tw !== dx || oy * th !== dy)) notes.add('tile-shift');
      const to = tileOrigin(doc, layer.pixelSize);
      drawings[id] = regridTiles(d, Math.max(1, Math.ceil((w - to.x) / tw)), Math.max(1, Math.ceil((h - to.y) / th)), ox, oy);
    }
  }
  if (w < doc.width || h < doc.height) notes.add('cropped');
  const out: Doc = { ...doc, width: w, height: h, drawings, layers: mapLayers(doc.layers, m, 1) };
  const guides = mapGuides(doc.guides, (x) => x + dx, (y) => y + dy);
  if (guides) out.guides = guides;
  return { doc: out, notes: [...notes] };
}

function moveVector(d: VectorDrawing, m: Matrix): VectorDrawing {
  if (!d.shapes.length) return d;
  return { ...d, shapes: d.shapes.map((s) => mapShape(s, m)) };
}

// ---------------------------------------------------------------- scale the artwork

/**
 * The stage made `w` x `h` with everything on it scaled to match. With pixel or tile layers the scale is uniform and
 * in whole steps (see pixelScaleStep): their art pixels just get bigger or smaller, nothing is resampled.
 */
export function scaleArtwork(doc: Doc, w: number, h: number): ResizeResult {
  const step = pixelScaleStep(doc);
  const asked = { w: clampSize(w), h: clampSize(h) };
  let kx = clampSize(w) / doc.width;
  let ky = clampSize(h) / doc.height;
  if (step) {
    const k = snapScale(Math.sqrt(kx * ky), step);
    kx = ky = k;
  }
  w = clampSize(doc.width * kx);
  h = clampSize(doc.height * ky);
  const k = Math.sqrt(Math.abs(kx * ky));
  const m = scaleBy(kx, ky);
  const tile = tileSize(doc);
  const own = owners(doc);
  const layers = mapLayers(doc.layers, m, k).map((l) => (l.kind === 'pixel' || l.kind === 'tilemap' ? { ...l, pixelSize: Math.max(1, Math.round(l.pixelSize * kx)) } : l));
  const sized = new Map(layers.map((l) => [l.id, l]));
  const drawings: Record<string, Drawing> = {};
  for (const [id, d] of Object.entries(doc.drawings)) {
    const o = own.get(id);
    drawings[id] = d;
    if (!o) continue;
    const layer = (o.stage && sized.get(o.layer.id)) || o.layer;
    if (d.kind === 'vector' && o.stage) drawings[id] = d.shapes.length ? { ...d, shapes: d.shapes.map((s) => mapShape(s, m)) } : d;
    else if (d.kind === 'camera' && o.stage) drawings[id] = { ...d, view: { ...d.view, x: d.view.x * kx, y: d.view.y * ky } };
    else if (d.kind === 'pixel' && (layer.kind === 'pixel' || layer.kind === 'tilemap')) drawings[id] = regridPixels(d, Math.ceil(w / layer.pixelSize), Math.ceil(h / layer.pixelSize), 0, 0);
    else if (d.kind === 'tilemap' && layer.kind === 'tilemap') {
      const to = tileOrigin(doc, layer.pixelSize);
      drawings[id] = regridTiles(d, Math.max(1, Math.ceil((w - to.x) / (tile.w * layer.pixelSize))), Math.max(1, Math.ceil((h - to.y) / (tile.h * layer.pixelSize))), 0, 0);
    }
    // Poses on bones layers hold moves as well as turns.
    const nd = drawings[id];
    if (nd.kind === 'vector' && nd.pose && o.stage) {
      drawings[id] = { ...nd, pose: Object.fromEntries(Object.entries(nd.pose).map(([b, p]) => [b, { ...p, ...(p.x !== undefined ? { x: p.x * kx } : {}), ...(p.y !== undefined ? { y: p.y * ky } : {}) }])) };
    }
  }
  const folders = doc.folders && k !== 1 ? Object.fromEntries(Object.entries(doc.folders).map(([id, f]) => [id, f.effects?.length ? { ...f, effects: scaleEffects(f.effects, k) } : f])) : doc.folders;
  const out: Doc = { ...doc, width: w, height: h, drawings, layers };
  if (folders) out.folders = folders;
  const guides = mapGuides(doc.guides, (x) => x * kx, (y) => y * ky);
  if (guides) out.guides = guides;
  return { doc: out, notes: step && (w !== asked.w || h !== asked.h) ? ['rounded'] : [] };
}

/** The size scaling would really give (pixel art rounds to whole steps), for showing before it's done. */
export function scaledSize(doc: Doc, w: number, h: number): { w: number; h: number; k: number | null } {
  const step = pixelScaleStep(doc);
  if (!step) return { w: clampSize(w), h: clampSize(h), k: null };
  const k = snapScale(Math.sqrt((clampSize(w) / doc.width) * (clampSize(h) / doc.height)), step);
  return { w: clampSize(doc.width * k), h: clampSize(doc.height * k), k };
}

/** Plain words for the notes. */
export const NOTE_TEXT: Record<string, string> = {
  'pixel-shift': 'Pixel layers move by whole art pixels, so they may sit up to half an art pixel off from the rest.',
  'tile-shift': 'Tile layers move by whole tiles, so they may sit a little off from the rest.',
  cropped: 'Part of the drawing is now outside the page. Vector shapes are kept and come back if you make it bigger again; pixels outside are cut.',
  rounded: 'Pixel layers grow in whole steps, so the size was rounded to the nearest step.',
};

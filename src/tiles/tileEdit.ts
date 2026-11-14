/**
 * Editing a tile on the canvas. The tile opens as a small document of its own (one pixel layer the size of the tile,
 * one key per animation frame), so every pixel tool, the timeline and undo work on it unchanged. Tile mode comes on so
 * the edges can be made seamless. "Done" puts the tile back into the open document as one undo step, and every map
 * that uses the tile shows the change.
 */
import { coversGrid, gridPixels } from '../core/pixelBounds';
import { produce, type Draft } from 'immer';
import { newPixelDrawing, newPixelLayer, uid } from '../core/doc';
import type { Doc, Drawing, TileFrame } from '../core/format';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { sharedEditNote } from '../artboards/variations';
import { findTile } from './model';
import { getTileUi, setTileUi } from './state';
import { TILE_PROPS_EXT, propsInExt, propsOf, writeProps } from './props';

const TAG = 'tile:';

/** The key of the tile being edited, or 0. */
export function editingTileKey(): number {
  const t = store().nestedTag();
  return t && t.startsWith(TAG) ? Number(t.slice(TAG.length)) || 0 : 0;
}

/** The small document a tile is edited in. */
export function tileDocument(parent: Doc, key: number): Doc | null {
  const ts = parent.tileset;
  const tile = findTile(ts, key);
  if (!ts || !tile) return null;
  const layer = newPixelLayer(tile.name, 1);
  const drawings: Record<string, Drawing> = {};
  let at = 0;
  for (const f of tile.frames) {
    const d = parent.drawings[f.drawingId];
    if (!d || d.kind !== 'pixel') continue;
    drawings[d.id] = d;
    const n = Math.max(1, f.duration);
    layer.cels.push({ id: uid('c'), start: at, length: n, drawingId: d.id });
    at += n;
  }
  if (!layer.cels.length) {
    const d = newPixelDrawing(ts.tileWidth, ts.tileHeight);
    drawings[d.id] = d;
    layer.cels.push({ id: uid('c'), start: 0, length: 1, drawingId: d.id });
    at = 1;
  }
  return {
    format: 'frameling',
    version: parent.version,
    ...(parent.lineage ? { lineage: true as const } : {}),
    // The same id every time for the same tile, so the canvas keeps its view while you go back and forth.
    id: `${parent.id}~tile${key}`,
    name: tile.name,
    width: ts.tileWidth,
    height: ts.tileHeight,
    fps: parent.fps,
    length: Math.max(1, at),
    background: null,
    layers: [layer],
    drawings,
    clips: [],
    markers: [],
    swatches: parent.swatches,
    // The tile's shapes, values and terrain, edited here with the picture and put back with it.
    ext: { [TILE_PROPS_EXT]: propsOf(tile) },
  };
}

/** The tile's frames as the tile document has them: one per key on its bottom pixel layer, held as long as the key. */
export function framesFromTileDoc(sub: Doc, tileWidth: number, tileHeight: number): { frames: TileFrame[]; drawings: Drawing[] } {
  const layer = sub.layers.find((l) => l.kind === 'pixel');
  const frames: TileFrame[] = [];
  const drawings: Drawing[] = [];
  for (const c of layer?.cels ?? []) {
    const held = sub.drawings[c.drawingId];
    if (!held || held.kind !== 'pixel') continue;
    // Painting keeps only the painted part of a drawing; a tile frame is always the whole tile.
    const d = coversGrid(held, tileWidth, tileHeight) ? held : { id: held.id, kind: 'pixel' as const, ...(held.ext ? { ext: held.ext } : {}), width: tileWidth, height: tileHeight, pixels: gridPixels(held, tileWidth, tileHeight) };
    frames.push({ drawingId: d.id, duration: Math.max(1, c.length) });
    if (!drawings.some((x) => x.id === d.id)) drawings.push(d);
  }
  return { frames, drawings };
}

/** Writes an edited tile back into a document (a draft or plain object). */
export function applyTileDoc(doc: Doc | Draft<Doc>, key: number, sub: Doc): void {
  const ts = doc.tileset;
  const tile = ts?.tiles.find((t) => t.key === key);
  if (!ts || !tile) return;
  const props = propsInExt(sub.ext);
  if (props) writeProps(tile, props);
  const { frames, drawings } = framesFromTileDoc(sub, ts.tileWidth, ts.tileHeight);
  if (!frames.length) return;
  const same = frames.length === tile.frames.length && frames.every((f, i) => f.drawingId === tile.frames[i].drawingId && f.duration === tile.frames[i].duration);
  for (const d of drawings) if (doc.drawings[d.id] !== d) (doc.drawings as Record<string, Drawing>)[d.id] = d;
  if (!same) {
    const keep = new Set(frames.map((f) => f.drawingId));
    for (const f of tile.frames) if (!keep.has(f.drawingId)) delete doc.drawings[f.drawingId];
    tile.frames = frames;
  }
}

/** Opens a tile on the canvas. */
export function editTile(key: number): boolean {
  if (editingTileKey() === key) return true;
  const shared = sharedEditNote(store().get().doc, 'tileset');
  if (shared) {
    toast(shared, { kind: 'warn' });
    return false;
  }
  if (editingTileKey()) finishTileEdit();
  const parent = store().get().doc;
  const sub = tileDocument(parent, key);
  if (!sub) return false;
  const { zoom, panX, panY } = store().get().ui;
  back = { tileMode: getTileUi().tileMode, zoom, panX, panY };
  // Tile mode first, so the canvas fits the tile with its neighbours around it.
  setTileUi({ tileMode: true });
  store().enterNested(sub, { tag: TAG + key, merge: (p, n) => produce(p, (d) => applyTileDoc(d as Doc, key, n)) });
  return true;
}

/** How things were before the tile was opened. */
let back = { tileMode: false, zoom: 1, panX: 0, panY: 0 };

/** Puts the tile being edited back into the document (one undo step) and returns to it. */
export function finishTileEdit(): void {
  const key = editingTileKey();
  if (!key) return;
  setTileUi({ tileMode: back.tileMode });
  const sub = store().exitNested();
  if (!sub) return;
  // The canvas refits for the document coming back; put the view back where it was instead.
  store().setUi({ zoom: back.zoom, panX: back.panX, panY: back.panY, ...(store().get().ui.tool === 'tile-shape' ? { tool: 'tile-brush' } : {}) });
  const name = findTile(store().get().doc.tileset, key)?.name ?? 'tile';
  store().update(`Edit tile "${name}"`, (d) => applyTileDoc(d as Doc, key, sub));
}

/** Leaves tile editing (if on) before a change to the whole document, so the change lands in the right place. */
export function leaveTileEdit(): void {
  if (editingTileKey()) finishTileEdit();
}

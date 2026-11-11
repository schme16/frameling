/**
 * Tile actions on the app's store, each one undo step with a plain-words label. Anything that changes the whole
 * document first puts away a tile that's open for editing, so the change lands in the document and not in the tile.
 */
import { DEFAULT_TILE_SIZE, findLayer, newTilemapLayer } from '../core/doc';
import type { Doc, Id } from '../core/format';
import { store } from '../core/store';
import * as m from './model';
import { setTileUi, getTileUi } from './state';
import { editTile, editingTileKey, finishTileEdit, leaveTileEdit } from './tileEdit';
import { hint } from '../canvas/controller';

function uniqueLayerName(doc: Doc, base: string): string {
  const names = new Set(doc.layers.map((l) => l.name));
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** A pixel size for a new tilemap layer: the pixel layers' one, else about 20 tiles across the stage. */
export function tilemapPixelSize(doc: Doc): number {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (l.kind !== 'vector') return l.pixelSize;
  }
  const tw = doc.tileset?.tileWidth ?? DEFAULT_TILE_SIZE;
  return Math.max(1, Math.round(doc.width / (tw * 20)));
}

/** Adds a tilemap layer above `aboveId` (default: the active layer) and makes it active. Makes the tileset if needed. */
export function addTilemapLayer(aboveId?: Id | null): Id {
  leaveTileEdit();
  const { doc, ui } = store().get();
  const above = aboveId === undefined ? ui.activeLayerId : aboveId;
  const layer = newTilemapLayer(uniqueLayerName(doc, 'Tiles'), tilemapPixelSize(doc));
  store().update('Add tilemap layer', (d) => {
    m.ensureTileset(d as Doc);
    const i = above ? d.layers.findIndex((l) => l.id === above) : -1;
    d.layers.splice(i < 0 ? d.layers.length : i + 1, 0, layer);
  });
  store().setUi({ activeLayerId: layer.id, tool: 'tile-brush' });
  return layer.id;
}

/** Adds an empty tile after the brush tile (or at the end), picks it as the brush, and returns its key. */
export function newTile(opts: { open?: boolean } = {}): number {
  leaveTileEdit();
  let key = 0;
  const after = getTileUi().brush || undefined;
  store().update('New tile', (d) => {
    const t = m.addTile(d as Doc, { after: m.findTile(d.tileset, after ?? 0) ? after : undefined });
    key = t.key;
  });
  setTileUi({ brush: key, flags: 0 });
  if (opts.open) editTile(key);
  return key;
}

export function duplicateTile(key = getTileUi().brush): number {
  leaveTileEdit();
  let made = 0;
  store().update('Duplicate tile', (d) => void (made = m.duplicateTile(d as Doc, key)?.key ?? 0));
  if (made) setTileUi({ brush: made });
  return made;
}

export function deleteTile(key = getTileUi().brush): boolean {
  leaveTileEdit();
  const ts = store().get().doc.tileset;
  const i = m.tileIndex(ts, key);
  if (!ts || i < 0) return false;
  const name = ts.tiles[i].name;
  let cleared = 0;
  store().update(`Delete tile "${name}"`, (d) => void (cleared = m.deleteTile(d as Doc, key)));
  const left = store().get().doc.tileset?.tiles ?? [];
  setTileUi({ brush: left[Math.min(i, left.length - 1)]?.key ?? 0 });
  if (cleared) hint(`Deleted "${name}" and cleared the ${cleared} place${cleared === 1 ? '' : 's'} it was used. Undo brings it all back.`);
  return true;
}

export function moveTile(key: number, to: number): boolean {
  leaveTileEdit();
  let ok = false;
  store().update('Move tile', (d) => void (ok = m.moveTile(d as Doc, key, to)));
  return ok;
}

export function renameTile(key: number, name: string): boolean {
  let ok = false;
  const editing = editingTileKey() === key;
  leaveTileEdit();
  store().update('Rename tile', (d) => void (ok = m.renameTile(d as Doc, key, name)));
  if (editing) editTile(key);
  return ok;
}

export function setTileSize(w: number, h: number): boolean {
  leaveTileEdit();
  let ok = false;
  store().update('Change tile size', (d) => void (ok = m.setTileSize(d as Doc, w, h)));
  return ok;
}

/** Picks the tile the tile tools paint with. On a tilemap layer, also switches to the tile brush if no tile tool is on. */
export function pickTile(key: number): void {
  setTileUi({ brush: key });
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId);
  if (layer?.kind === 'tilemap' && !ui.tool.startsWith('tile-')) store().setUi({ tool: 'tile-brush' });
}

export { editTile, finishTileEdit, editingTileKey };

/**
 * Tile actions on the app's store, each one undo step with a plain-words label. Anything that changes the whole
 * document first puts away a tile that's open for editing, so the change lands in the document and not in the tile.
 */
import { DEFAULT_TILE_SIZE, findLayer, newTilemapLayer } from '../core/doc';
import type { Doc, Id, PeeringBit, TerrainMode, TileDataType, TileShape } from '../core/format';
import { store } from '../core/store';
import * as m from './model';
import * as data from './data';
import * as terrain from './terrain';
import { TILE_PROPS_EXT, propsOf, writeProps, type TileProps } from './props';
import { cleanCollision, wholeTileBox } from './shapes';
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
    if (l.kind === 'pixel' || l.kind === 'tilemap') return l.pixelSize;
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

/** Moves the tile grid: where a tile edge sits from the stage's top-left corner, in art pixels. One undo step. */
export function setTileGrid(x: number, y: number): boolean {
  leaveTileEdit();
  let ok = false;
  store().update('Move tile grid', (d) => void (ok = m.setTileGrid(d as Doc, x, y)));
  return ok;
}

/** The tile size and the grid start together, from the Tileset panel's form: one undo step. */
export function setTileSettings(w: number, h: number, gx: number, gy: number): boolean {
  leaveTileEdit();
  let ok = false;
  store().update('Change tile settings', (d) => {
    const a = m.setTileSize(d as Doc, w, h);
    const b = m.setTileGrid(d as Doc, gx, gy);
    ok = a || b;
  });
  return ok;
}

/** Picks the tile the tile tools paint with. On a tilemap layer, also switches to the tile brush if no tile tool is on. */
export function pickTile(key: number): void {
  setTileUi({ brush: key });
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId);
  if (layer?.kind === 'tilemap' && !ui.tool.startsWith('tile-')) store().setUi({ tool: 'tile-brush' });
}

// ---------------------------------------------------------------- shapes, values and terrain

/**
 * Changes what a tile carries (shapes, values, terrain). While the tile is open on the canvas the change goes into the
 * open tile, so it undoes with the drawing and lands with Done; otherwise it goes straight into the tileset.
 */
export function updateTileProps(key: number, label: string, mutate: (p: TileProps) => void): boolean {
  const { doc } = store().get();
  if (editingTileKey() === key) {
    const p = (doc.ext?.[TILE_PROPS_EXT] as TileProps | undefined) ?? {};
    const next = propsOf(p);
    mutate(next);
    store().update(label, (d) => {
      d.ext = { ...(d.ext ?? {}), [TILE_PROPS_EXT]: next };
    });
    return true;
  }
  if (!m.findTile(doc.tileset, key)) return false;
  store().update(label, (d) => {
    const t = m.findTile(d.tileset, key);
    if (!t) return;
    const next = propsOf(t);
    mutate(next);
    writeProps(t, next);
  });
  return true;
}

/** Changes the tileset's own lists (values, terrains), putting a tile that is open away first and opening it again after. */
function changeTileset(label: string, fn: (d: Doc) => void): void {
  const editing = editingTileKey();
  leaveTileEdit();
  store().update(label, (d) => fn(d as Doc));
  if (editing && m.findTile(store().get().doc.tileset, editing)) editTile(editing);
}

/** Opens a tile's shape on the canvas with the Collision tool. */
export function drawShape(key: number, mode: 'box' | 'polygon'): boolean {
  if (!m.findTile(store().rootDoc().tileset, key)) return false;
  if (!editTile(key)) return false;
  setTileUi({ shapeMode: mode });
  store().setUi({ tool: 'tile-shape' });
  return true;
}

export function setShapes(key: number, shapes: TileShape[], label = 'Change collision shape'): boolean {
  return updateTileProps(key, label, (p) => {
    const c = cleanCollision({ shapes, oneWay: p.collision?.oneWay });
    if (c) p.collision = c;
    else delete p.collision;
  });
}

export function addShape(key: number, shape: TileShape): boolean {
  const shapes = [...(tileProps(key).collision?.shapes ?? []), shape];
  return setShapes(key, shapes, 'Add collision shape');
}

/** Makes the whole tile solid: one box covering it. */
export function solidTile(key: number): boolean {
  const ts = store().rootDoc().tileset;
  if (!ts) return false;
  return setShapes(key, [wholeTileBox(ts.tileWidth, ts.tileHeight)], 'Make the tile solid');
}

export function clearShapes(key: number): boolean {
  return updateTileProps(key, 'Clear collision shapes', (p) => void delete p.collision);
}

export function setOneWay(key: number, on: boolean): boolean {
  return updateTileProps(key, on ? 'Make the tile a one-way platform' : 'Make the tile solid from every side', (p) => {
    if (!p.collision) return;
    if (on) p.collision.oneWay = true;
    else delete p.collision.oneWay;
  });
}

/** What a tile carries right now, including changes made while it's open on the canvas. */
export function tileProps(key: number): TileProps {
  const root = store().rootDoc();
  return propsOf(m.findTile(root.tileset, key));
}

export function addValue(name: string, type: TileDataType): string {
  let made = '';
  changeTileset('Add a custom value', (d) => void (made = data.addDataLayer(m.ensureTileset(d), name, type).name));
  return made;
}

export function removeValue(name: string): void {
  changeTileset(`Remove the value "${name}"`, (d) => void (d.tileset && data.removeDataLayer(d.tileset, name)));
}

export function renameValue(from: string, to: string): boolean {
  let ok = false;
  changeTileset('Rename a custom value', (d) => void (ok = !!d.tileset && data.renameDataLayer(d.tileset, from, to)));
  return ok;
}

export function retypeValue(name: string, type: TileDataType): void {
  changeTileset('Change what a value holds', (d) => void (d.tileset && data.retypeDataLayer(d.tileset, name, type)));
}

/** Sets a tile's value; an empty text for a number or text clears it. */
export function setTileValue(key: number, name: string, raw: unknown): boolean {
  const ts = store().rootDoc().tileset;
  const layer = ts?.dataLayers?.find((l) => l.name === name);
  if (!ts || !layer) return false;
  if (raw === '' && layer.type !== 'string') return updateTileProps(key, `Clear "${name}"`, (p) => void (p.data && (delete p.data[name], !Object.keys(p.data).length && delete p.data)));
  const v = data.coerceData(layer.type, raw);
  if (v === undefined) return false;
  return updateTileProps(key, `Set "${name}"`, (p) => void (p.data = { ...(p.data ?? {}), [name]: v }));
}

export function addTerrain(name?: string): number {
  let id = 0;
  changeTileset('Add a terrain', (d) => void (id = terrain.addTerrain(m.ensureTileset(d), { name }).id));
  setTileUi({ terrain: id });
  return id;
}

export function deleteTerrain(id: number): void {
  const left = (store().rootDoc().tileset?.terrains ?? []).filter((t) => t.id !== id);
  changeTileset('Delete a terrain', (d) => void (d.tileset && terrain.deleteTerrain(d.tileset, id)));
  if (getTileUi().terrain === id) setTileUi({ terrain: left[0]?.id ?? 0 });
}

export function renameTerrain(id: number, name: string): boolean {
  let ok = false;
  changeTileset('Rename a terrain', (d) => void (ok = !!d.tileset && terrain.renameTerrain(d.tileset, id, name)));
  return ok;
}

export function recolourTerrain(id: number, color: string): boolean {
  let ok = false;
  changeTileset('Change a terrain colour', (d) => void (ok = !!d.tileset && terrain.recolourTerrain(d.tileset, id, color)));
  return ok;
}

export function setTerrainMode(mode: TerrainMode): void {
  changeTileset('Change how terrain edges match', (d) => {
    const ts = m.ensureTileset(d);
    if (mode === 'corners-and-sides') delete ts.terrainMode;
    else ts.terrainMode = mode;
  });
}

/** Says which terrain a tile is made of (undefined: none). */
export function setTerrainOf(key: number, id: number | undefined): boolean {
  return updateTileProps(key, id === undefined ? 'Take the tile out of its terrain' : 'Put the tile in a terrain', (p) => {
    if (id === undefined) delete p.terrain;
    else p.terrain = { id, ...(p.terrain?.bits ? { bits: p.terrain.bits } : {}) };
  });
}

/** Sets what touches one side or corner of a tile (undefined: nothing). */
export function setEdge(key: number, bit: PeeringBit, id: number | undefined): boolean {
  return updateTileProps(key, 'Change a tile edge', (p) => {
    if (!p.terrain) return;
    const bits = { ...(p.terrain.bits ?? {}) };
    if (id === undefined) delete bits[bit];
    else bits[bit] = id;
    p.terrain = { id: p.terrain.id, ...(Object.keys(bits).length ? { bits } : {}) };
  });
}

/** Works out a tile's edges from its picture (see terrain.guessBits). The tile's first frame is the one looked at. */
export function guessEdges(key: number): boolean {
  const root = store().rootDoc();
  const ts = root.tileset;
  const tile = m.findTile(ts, key);
  const own = tileProps(key).terrain?.id;
  if (!ts || !tile || own === undefined) return false;
  const d = m.tileDrawingAt(root, tile, 0);
  if (!d) return false;
  const guess = terrain.guessBits(d.pixels, d.width, d.height, own, terrain.modeOf(ts));
  return updateTileProps(key, 'Guess the tile edges from its picture', (p) => void (p.terrain = guess));
}

/** Makes a full set of edge tiles for a terrain (47 for corners and sides). Returns how many were made. */
export function makeEdgeTiles(id: number): number {
  leaveTileEdit();
  let made: number[] = [];
  store().update('Make edge tiles', (d) => void (made = terrain.addEdgeSet(d as Doc, id).map((t) => t.key)));
  if (made.length) setTileUi({ brush: made[made.length - 1] });
  return made.length;
}

export { editTile, finishTileEdit, editingTileKey };

/**
 * Custom values on tiles (damage, solid, sound): the tileset lists the names and types, each tile holds its values.
 * Pure functions on a tileset, like the rest of the tile model.
 */
import type { Tile, TileDataLayer, TileDataType, TileDataValue, Tileset } from '../core/format';
import { coerceData } from '../core/tileFormat';

export const DATA_TYPES: { value: TileDataType; label: string }[] = [
  { value: 'bool', label: 'Yes or no' },
  { value: 'int', label: 'Whole number' },
  { value: 'float', label: 'Number with decimals' },
  { value: 'string', label: 'Text' },
];

/** The value a tile has when none is set. */
export function dataDefault(type: TileDataType): TileDataValue {
  return type === 'bool' ? false : type === 'string' ? '' : 0;
}

export { coerceData };

/** A tile's value for a name: its own, or the default for the type. */
export function dataValue(ts: Tileset | undefined, tile: Tile | undefined, name: string): TileDataValue | undefined {
  const layer = ts?.dataLayers?.find((l) => l.name === name);
  if (!layer) return undefined;
  const v = tile?.data?.[name];
  return v === undefined ? dataDefault(layer.type) : v;
}

/** Adds a named value to the tileset. Names are kept unique (a repeat gets a number). Returns the layer. */
export function addDataLayer(ts: Tileset, name: string, type: TileDataType): TileDataLayer {
  const list = (ts.dataLayers ??= []);
  const base = name.trim() || 'value';
  let n = base;
  for (let i = 2; list.some((l) => l.name === n); i++) n = `${base} ${i}`;
  const layer = { name: n, type };
  list.push(layer);
  return layer;
}

/** Renames a value on the tileset and on every tile that has it. */
export function renameDataLayer(ts: Tileset, from: string, to: string): boolean {
  const l = ts.dataLayers?.find((x) => x.name === from);
  const n = to.trim();
  if (!l || !n || n === from || ts.dataLayers!.some((x) => x.name === n)) return false;
  l.name = n;
  for (const t of ts.tiles) {
    if (t.data && from in t.data) {
      t.data = Object.fromEntries(Object.entries(t.data).map(([k, v]) => [k === from ? n : k, v]));
    }
  }
  return true;
}

/** Changes a value's type; each tile's value is converted, or dropped when it doesn't convert. */
export function retypeDataLayer(ts: Tileset, name: string, type: TileDataType): boolean {
  const l = ts.dataLayers?.find((x) => x.name === name);
  if (!l || l.type === type) return false;
  l.type = type;
  for (const t of ts.tiles) {
    if (!t.data || !(name in t.data)) continue;
    const v = coerceData(type, t.data[name]);
    if (v === undefined) delete t.data[name];
    else t.data[name] = v;
    if (!Object.keys(t.data).length) delete t.data;
  }
  return true;
}

/** Removes a value from the tileset and from every tile. */
export function removeDataLayer(ts: Tileset, name: string): boolean {
  const i = ts.dataLayers?.findIndex((l) => l.name === name) ?? -1;
  if (!ts.dataLayers || i < 0) return false;
  ts.dataLayers.splice(i, 1);
  if (!ts.dataLayers.length) delete ts.dataLayers;
  for (const t of ts.tiles) {
    if (t.data && name in t.data) {
      delete t.data[name];
      if (!Object.keys(t.data).length) delete t.data;
    }
  }
  return true;
}

/** Sets a tile's value (a value equal to the default is kept, so what you set stays set). Returns false when it doesn't fit the type. */
export function setTileData(ts: Tileset, tile: Tile, name: string, raw: unknown): boolean {
  const l = ts.dataLayers?.find((x) => x.name === name);
  if (!l) return false;
  const v = coerceData(l.type, raw);
  if (v === undefined) return false;
  tile.data = { ...(tile.data ?? {}), [name]: v };
  return true;
}

/** Clears a tile's value so it has the default again. */
export function clearTileData(tile: Tile, name: string): void {
  if (!tile.data || !(name in tile.data)) return;
  delete tile.data[name];
  if (!Object.keys(tile.data).length) delete tile.data;
}

/** Godot's Variant types for custom data layers. */
export const GODOT_DATA_TYPE: Record<TileDataType, number> = { bool: 1, int: 2, float: 3, string: 4 };

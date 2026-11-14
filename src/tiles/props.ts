/**
 * A tile's collision, values and terrain as one bundle. While a tile is open on the canvas the bundle lives in the tile
 * document's `ext`, so changes to it undo with the drawing and land in the tileset as one step when you press Done.
 */
import type { Tile, TileCollision, TileDataValue, TileTerrain } from '../core/format';

/** The key in the tile document's `ext`. */
export const TILE_PROPS_EXT = 'tiles.props';

export interface TileProps {
  collision?: TileCollision;
  data?: Record<string, TileDataValue>;
  terrain?: TileTerrain;
}

const copy = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** A copy of what a tile carries. */
export function propsOf(t: Pick<Tile, 'collision' | 'data' | 'terrain'> | undefined): TileProps {
  const p: TileProps = {};
  if (t?.collision) p.collision = copy(t.collision);
  if (t?.data && Object.keys(t.data).length) p.data = copy(t.data);
  if (t?.terrain) p.terrain = copy(t.terrain);
  return p;
}

/** Puts the bundle on the tile (a draft or plain object); anything the bundle leaves out is removed from the tile. */
export function writeProps(t: Tile, p: TileProps): void {
  if (p.collision?.shapes.length) t.collision = copy(p.collision);
  else delete t.collision;
  if (p.data && Object.keys(p.data).length) t.data = copy(p.data);
  else delete t.data;
  if (p.terrain) t.terrain = copy(p.terrain);
  else delete t.terrain;
}

/** The bundle kept in a tile document, if it has one. */
export function propsInExt(ext: Record<string, unknown> | undefined): TileProps | undefined {
  const p = ext?.[TILE_PROPS_EXT];
  return p && typeof p === 'object' ? (p as TileProps) : undefined;
}

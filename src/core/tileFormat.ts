/**
 * The tile extras (shapes, values, terrains) as the file format needs them: reading them out of a saved file, checked
 * (anything that doesn't make sense is dropped rather than trusted, so an odd or hand-edited file still opens), and the
 * two small checks the reader shares with the tile editor. Pure. Lives in core so the file reader doesn't depend on the
 * optional tiles feature; src/tiles re-exports what it needs.
 */
import type { PeeringBit, Terrain, TerrainMode, Tile, TileCollision, TileDataLayer, TileDataType, TileDataValue, TileShape, TileTerrain } from '../core/format';

/** Twice the signed area of a polygon (positive when the points go clockwise on screen). */
export function area2(p: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.y - q.x * p[i].y;
  }
  return a;
}

/** A shape is real when a box has some size, or a polygon has three corners or more and encloses some area. */
export function validShape(s: TileShape): boolean {
  if (s.kind === 'box') return s.w > 0 && s.h > 0;
  return s.points.length >= 3 && Math.abs(area2(s.points)) > 0;
}

/** The tile's collision with only the real shapes, or undefined when none are left. */
export function cleanCollision(c: TileCollision | undefined): TileCollision | undefined {
  const shapes = (c?.shapes ?? []).filter(validShape);
  if (!shapes.length) return undefined;
  return { shapes, ...(c?.oneWay ? { oneWay: true } : {}) };
}

/** A value made to fit a type (a number typed into a whole-number value is rounded), or undefined when it can't be. */
export function coerceData(type: TileDataType, v: unknown): TileDataValue | undefined {
  if (type === 'bool') return typeof v === 'boolean' ? v : v === 'true' || v === 1 ? true : v === 'false' || v === 0 ? false : undefined;
  if (type === 'string') return typeof v === 'string' ? v : v === undefined || v === null ? undefined : String(v);
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return type === 'int' ? Math.round(n) : n;
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const BITS: PeeringBit[] = ['right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left', 'top', 'top-right'];
const TYPES: TileDataType[] = ['bool', 'int', 'float', 'string'];
const MODES: TerrainMode[] = ['corners-and-sides', 'corners', 'sides'];
const coord = (v: unknown, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : undefined);

function readShape(s: unknown, tw: number, th: number): TileShape | undefined {
  if (!isObj(s)) return undefined;
  if (s.kind === 'box') {
    const x = coord(s.x, tw);
    const y = coord(s.y, th);
    const w = coord(s.w, tw);
    const h = coord(s.h, th);
    if (x === undefined || y === undefined || w === undefined || h === undefined) return undefined;
    return { kind: 'box', x, y, w: Math.min(w, tw - x), h: Math.min(h, th - y) };
  }
  if (s.kind === 'polygon' && Array.isArray(s.points)) {
    const points = s.points.slice(0, 256).map((p: unknown) => (isObj(p) ? { x: coord(p.x, tw), y: coord(p.y, th) } : { x: undefined, y: undefined }));
    if (points.some((p) => p.x === undefined || p.y === undefined)) return undefined;
    return { kind: 'polygon', points: points as { x: number; y: number }[] };
  }
  return undefined;
}

export function readCollision(raw: unknown, tw: number, th: number): TileCollision | undefined {
  if (!isObj(raw) || !Array.isArray(raw.shapes)) return undefined;
  const shapes = raw.shapes.slice(0, 64).map((s: unknown) => readShape(s, tw, th)).filter((s): s is TileShape => !!s);
  return cleanCollision({ shapes, ...(raw.oneWay === true ? { oneWay: true } : {}) });
}

export function readDataLayers(raw: unknown): TileDataLayer[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: TileDataLayer[] = [];
  for (const l of raw) {
    if (!isObj(l) || typeof l.name !== 'string' || !l.name.trim() || !TYPES.includes(l.type) || out.some((o) => o.name === l.name)) continue;
    out.push({ name: l.name.slice(0, 200), type: l.type });
  }
  return out.length ? out : undefined;
}

export function readTerrains(raw: unknown): Terrain[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Terrain[] = [];
  for (const t of raw) {
    const id = isObj(t) ? Math.round(Number(t.id)) : 0;
    if (!isObj(t) || !(id >= 1) || out.some((o) => o.id === id)) continue;
    out.push({ id, name: typeof t.name === 'string' && t.name ? t.name.slice(0, 200) : `Terrain ${out.length + 1}`, color: typeof t.color === 'string' && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#5fbf5f' });
  }
  return out.length ? out : undefined;
}

export const readTerrainMode = (raw: unknown): TerrainMode | undefined => (MODES.includes(raw as TerrainMode) && raw !== 'corners-and-sides' ? (raw as TerrainMode) : undefined);

/** The values a tile holds, kept only for names the tileset lists and fitted to their type. */
export function readTileData(raw: unknown, layers: TileDataLayer[] | undefined): Record<string, TileDataValue> | undefined {
  if (!isObj(raw) || !layers) return undefined;
  const out: Record<string, TileDataValue> = {};
  for (const l of layers) {
    if (!(l.name in raw)) continue;
    const v = coerceData(l.type, raw[l.name]);
    if (v !== undefined) out[l.name] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A tile's terrain, kept when its terrain exists; edges that touch a terrain that doesn't exist are dropped. */
export function readTileTerrain(raw: unknown, terrains: Terrain[] | undefined): TileTerrain | undefined {
  if (!isObj(raw) || !terrains) return undefined;
  const ids = new Set(terrains.map((t) => t.id));
  const id = Math.round(Number(raw.id));
  if (!ids.has(id)) return undefined;
  const bits: Partial<Record<PeeringBit, number>> = {};
  if (isObj(raw.bits)) for (const b of BITS) if (ids.has(Math.round(Number(raw.bits[b]))) && raw.bits[b] !== undefined) bits[b] = Math.round(Number(raw.bits[b]));
  return { id, ...(Object.keys(bits).length ? { bits } : {}) };
}

/** Puts a saved tile's extras on the tile. */
export function readTileExtras(raw: Record<string, any>, tile: Tile, o: { tileWidth: number; tileHeight: number; dataLayers?: TileDataLayer[]; terrains?: Terrain[] }): void {
  const collision = readCollision(raw.collision, o.tileWidth, o.tileHeight);
  if (collision) tile.collision = collision;
  const data = readTileData(raw.data, o.dataLayers);
  if (data) tile.data = data;
  const terrain = readTileTerrain(raw.terrain, o.terrains);
  if (terrain) tile.terrain = terrain;
}

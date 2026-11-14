/**
 * Tileset exports, as pure functions: the atlas picture (with padding and extruded edges), a Godot 4 TileSet and a
 * scene with one TileMapLayer per tilemap layer, a generic JSON file, and Tiled's .tsj and .tmj.
 *
 * Layout: tiles go left to right in tileset order, an animated tile's frames side by side on one row (which is how
 * Godot and Tiled expect animation frames), wrapping to a new row when a tile no longer fits.
 */
import type { Doc, Tile, TileDataValue, TilemapDrawing, TilemapLayer, Tileset } from '../core/format';
import { drawingAt, tileOrigin } from '../core/doc';
import { TILE_FLIP_D, TILE_FLIP_X, TILE_FLIP_Y } from '../core/format';
import { strToU8 } from 'fflate';
import { encodePng, type RawImage } from '../io/png';
import { slug } from '../export/plan';
import { cellFlags, cellKey, findTile } from './model';
import { GODOT_DATA_TYPE } from './data';
import { godotPolygons, shapePoints, validShape } from './shapes';
import { GODOT_BIT, GODOT_MODE, PEERING, modeOf, modeUses } from './terrain';

export interface TilesetExportSettings {
  /** Tiles per row; 0 picks a roughly square picture. */
  columns: number;
  /** Empty pixels between tiles. */
  padding: number;
  /** Pixels of each tile's edge repeated outwards, which stops seams when a game scales or filters the picture. */
  extrude: number;
  /** Whole-number scale of the picture. */
  scale: number;
  godot: boolean;
  godotScene: boolean;
  json: boolean;
  tiled: boolean;
  /** Where the picture will live in the Godot project. Empty: res://tiles/<name>.png. */
  godotPath: string;
}

export const DEFAULT_TILESET_EXPORT: TilesetExportSettings = { columns: 0, padding: 0, extrude: 0, scale: 1, godot: true, godotScene: true, json: false, tiled: false, godotPath: '' };

export interface AtlasTile {
  key: number;
  name: string;
  /** Where each frame sits, in slots (column, row), and how many document frames it shows for. */
  frames: { col: number; row: number; duration: number }[];
}

export interface TileAtlas {
  image: RawImage;
  /** Tile size in the picture (after scale). */
  tileWidth: number;
  /** The picture's scale (1 when left out). */
  scale?: number;
  tileHeight: number;
  columns: number;
  rows: number;
  /** Godot's margins and Tiled's margin: the extrude. */
  margin: number;
  /** Godot's separation and Tiled's spacing: padding plus extrude on both sides. */
  spacing: number;
  tiles: AtlasTile[];
  /** The tileset the picture was cut from: its shapes, values and terrains travel with the picture. */
  tileset?: Tileset;
}

/** Places the tiles in slots. Pure layout, no pixels. */
export function layoutTiles(doc: Doc, columns: number): { columns: number; rows: number; tiles: AtlasTile[] } {
  const tiles = doc.tileset?.tiles ?? [];
  const widest = Math.max(1, ...tiles.map((t) => t.frames.length));
  const slots = tiles.reduce((n, t) => n + t.frames.length, 0);
  const cols = Math.max(widest, columns > 0 ? Math.round(columns) : Math.ceil(Math.sqrt(Math.max(1, slots))));
  const out: AtlasTile[] = [];
  let col = 0;
  let row = 0;
  for (const t of tiles) {
    if (col + t.frames.length > cols) {
      col = 0;
      row++;
    }
    out.push({ key: t.key, name: t.name, frames: t.frames.map((f, i) => ({ col: col + i, row, duration: Math.max(1, f.duration) })) });
    col += t.frames.length;
  }
  return { columns: cols, rows: tiles.length ? row + 1 : 0, tiles: out };
}

/** The atlas picture and where every tile is in it. */
export function buildTileAtlas(doc: Doc, s: Pick<TilesetExportSettings, 'columns' | 'padding' | 'extrude' | 'scale'>): TileAtlas {
  const ts = doc.tileset;
  const scale = Math.max(1, Math.round(s.scale));
  const tw = (ts?.tileWidth ?? 16) * scale;
  const th = (ts?.tileHeight ?? 16) * scale;
  const pad = Math.max(0, Math.round(s.padding));
  const ex = Math.max(0, Math.round(s.extrude));
  const lay = layoutTiles(doc, s.columns);
  const spacing = pad + 2 * ex;
  const W = Math.max(1, lay.columns * (tw + 2 * ex) + (lay.columns - 1) * pad);
  const H = Math.max(1, lay.rows * (th + 2 * ex) + Math.max(0, lay.rows - 1) * pad);
  const px = new Uint8ClampedArray(W * H * 4);
  const tiles = ts?.tiles ?? [];
  lay.tiles.forEach((at, ti) => {
    at.frames.forEach((slot, fi) => {
      const d = doc.drawings[tiles[ti].frames[fi].drawingId];
      if (!d || d.kind !== 'pixel') return;
      const ox = ex + slot.col * (tw + spacing);
      const oy = ex + slot.row * (th + spacing);
      // Each destination pixel reads its art pixel; the extrude reads the nearest edge pixel.
      for (let y = -ex; y < th + ex; y++) {
        const sy = Math.min(d.height - 1, Math.max(0, Math.floor(y / scale)));
        for (let x = -ex; x < tw + ex; x++) {
          const sx = Math.min(d.width - 1, Math.max(0, Math.floor(x / scale)));
          const si = (sy * d.width + sx) * 4;
          const di = ((oy + y) * W + ox + x) * 4;
          px[di] = d.pixels[si];
          px[di + 1] = d.pixels[si + 1];
          px[di + 2] = d.pixels[si + 2];
          px[di + 3] = d.pixels[si + 3];
        }
      }
    });
  });
  return { image: { width: W, height: H, pixels: px }, tileWidth: tw, tileHeight: th, scale, columns: lay.columns, rows: lay.rows, margin: ex, spacing, tiles: lay.tiles, ...(ts ? { tileset: ts } : {}) };
}

/** The tilemap layers and the map each shows at `frame`. */
export function mapsAt(doc: Doc, frame: number): { layer: TilemapLayer; map: TilemapDrawing | null }[] {
  const out: { layer: TilemapLayer; map: TilemapDrawing | null }[] = [];
  for (const l of doc.layers) {
    if (l.kind !== 'tilemap') continue;
    const d = drawingAt(doc, l, frame);
    out.push({ layer: l, map: d && d.kind === 'tilemap' ? d : null });
  }
  return out;
}

// ---------------------------------------------------------------- Godot

const gdString = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';
const gdFloat = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n * 10000) / 10000));

/** Godot's alternative-tile flags (TileSetAtlasSource.TRANSFORM_*). */
export const GODOT_FLIP_H = 4096;
export const GODOT_FLIP_V = 8192;
export const GODOT_TRANSPOSE = 16384;

export function godotAlternative(flags: number): number {
  return (flags & TILE_FLIP_X ? GODOT_FLIP_H : 0) | (flags & TILE_FLIP_Y ? GODOT_FLIP_V : 0) | (flags & TILE_FLIP_D ? GODOT_TRANSPOSE : 0);
}

const gdPoints = (pts: { x: number; y: number }[]) => `PackedVector2Array(${pts.map((p) => `${gdNum(p.x)}, ${gdNum(p.y)}`).join(', ')})`;
const gdNum = (n: number) => String(Math.round(n * 10000) / 10000);
const gdColor = (hex: string) => {
  const c = [1, 3, 5].map((i) => Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 10000) / 10000);
  return `Color(${c.join(', ')}, 1)`;
};
const gdValue = (type: string, v: TileDataValue): string => (type === 'bool' ? String(!!v) : type === 'string' ? gdString(String(v)) : type === 'int' ? String(Math.round(Number(v))) : gdFloat(Number(v)));

/** The lines of one tile's data that follow `x:y/0 = 0`: its terrain, shapes and values. */
function godotTileData(at: string, tile: Tile, ts: Tileset, scale: number): string[] {
  const out: string[] = [];
  const mode = modeOf(ts);
  const terrains = ts.terrains ?? [];
  const index = (id: number) => terrains.findIndex((t) => t.id === id);
  if (tile.terrain && index(tile.terrain.id) >= 0) {
    out.push(`${at}/0/terrain_set = 0`, `${at}/0/terrain = ${index(tile.terrain.id)}`);
  }
  const polys = tile.collision ? godotPolygons(tile.collision, ts.tileWidth, ts.tileHeight, scale) : [];
  polys.forEach((pts, i) => {
    out.push(`${at}/0/physics_layer_0/polygon_${i}/points = ${gdPoints(pts)}`);
    if (tile.collision?.oneWay) out.push(`${at}/0/physics_layer_0/polygon_${i}/one_way = true`);
  });
  if (tile.terrain && index(tile.terrain.id) >= 0) {
    for (const p of PEERING) {
      const id = tile.terrain.bits?.[p.bit];
      if (id !== undefined && index(id) >= 0 && modeUses(mode, p.bit)) out.push(`${at}/0/terrains_peering_bit/${GODOT_BIT[p.bit]} = ${index(id)}`);
    }
  }
  (ts.dataLayers ?? []).forEach((l, i) => {
    const v = tile.data?.[l.name];
    if (v !== undefined) out.push(`${at}/0/custom_data_${i} = ${gdValue(l.type, v)}`);
  });
  return out;
}

/** A Godot 4 TileSet with one atlas source cut from the picture. Animated tiles keep their frames and timing. Shapes, custom values and terrains become its physics layer, custom data layers and terrain set. */
export function godotTileSet(atlas: TileAtlas, texturePath: string, fps: number): string {
  const out: string[] = [];
  const ts = atlas.tileset;
  out.push('[gd_resource type="TileSet" load_steps=3 format=3]', '');
  out.push(`[ext_resource type="Texture2D" path=${gdString(texturePath)} id="1_tiles"]`, '');
  out.push('[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_1"]');
  out.push('texture = ExtResource("1_tiles")');
  if (atlas.margin) out.push(`margins = Vector2i(${atlas.margin}, ${atlas.margin})`);
  if (atlas.spacing) out.push(`separation = Vector2i(${atlas.spacing}, ${atlas.spacing})`);
  out.push(`texture_region_size = Vector2i(${atlas.tileWidth}, ${atlas.tileHeight})`);
  for (const t of atlas.tiles) {
    const f0 = t.frames[0];
    const at = `${f0.col}:${f0.row}`;
    if (t.frames.length > 1) {
      out.push(`${at}/animation_frames_count = ${t.frames.length}`);
      t.frames.forEach((f, i) => out.push(`${at}/animation_frame_${i}/duration = ${gdFloat(f.duration / Math.max(1, fps))}`));
    }
    out.push(`${at}/0 = 0`);
    const tile = ts ? findTile(ts, t.key) : undefined;
    if (ts && tile) out.push(...godotTileData(at, tile, ts, atlas.scale ?? 1));
  }
  out.push('', '[resource]');
  out.push(`tile_size = Vector2i(${atlas.tileWidth}, ${atlas.tileHeight})`);
  if (ts && ts.tiles.some((t) => t.collision?.shapes.some(validShape))) out.push('physics_layer_0/collision_layer = 1');
  if (ts?.terrains?.length) {
    out.push(`terrain_set_0/mode = ${GODOT_MODE[modeOf(ts)]}`);
    ts.terrains.forEach((t, i) => out.push(`terrain_set_0/terrain_${i}/name = ${gdString(t.name)}`, `terrain_set_0/terrain_${i}/color = ${gdColor(t.color)}`));
  }
  (ts?.dataLayers ?? []).forEach((l, i) => out.push(`custom_data_layer_${i}/name = ${gdString(l.name)}`, `custom_data_layer_${i}/type = ${GODOT_DATA_TYPE[l.type]}`));
  out.push('sources/0 = SubResource("TileSetAtlasSource_1")', '');
  return out.join('\n');
}

/** A TileMapLayer's tile_map_data: a format number, then 12 bytes per used cell (all little-endian 16-bit). */
export function godotTileMapData(map: TilemapDrawing, atlas: TileAtlas): number[] {
  const where = new Map(atlas.tiles.map((t) => [t.key, t.frames[0]]));
  const bytes: number[] = [0, 0];
  const u16 = (n: number) => bytes.push(n & 0xff, (n >> 8) & 0xff);
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.columns; x++) {
      const v = map.cells[y * map.columns + x];
      const slot = v ? where.get(cellKey(v)) : undefined;
      if (!slot) continue;
      u16(x);
      u16(y);
      u16(0);
      u16(slot.col);
      u16(slot.row);
      u16(godotAlternative(cellFlags(v)));
    }
  }
  return bytes;
}

function nodeName(name: string, used: Set<string>, fallback: string): string {
  const base = name.replace(/[.:@/"%]/g, '').trim() || fallback;
  let n = base;
  for (let i = 2; used.has(n); i++) n = `${base} ${i}`;
  used.add(n);
  return n;
}

/**
 * A scene with a Node2D holding one TileMapLayer per tilemap layer (bottom layer first, as Godot draws in order).
 * Each layer is scaled by its pixel size over the picture's scale, so the level comes out the size it is in the
 * document (a 16 px tile at pixel size 2 covers 32 px in both).
 */
export function godotTileScene(o: { tileSetPath: string; rootName: string; maps: { layer: TilemapLayer; map: TilemapDrawing | null }[]; atlas: TileAtlas; /** Where the first slot starts when the tile grid is off the corner (Tileset.gridX), in art pixels. */ origin?: { x: number; y: number } }): string {
  const used = new Set<string>();
  const root = nodeName(o.rootName, used, 'Level');
  const out: string[] = ['[gd_scene load_steps=2 format=3]', '', `[ext_resource type="TileSet" path=${gdString(o.tileSetPath)} id="1_tiles"]`, ''];
  out.push(`[node name=${gdString(root)} type="Node2D"]`);
  // Nearest-neighbour filtering, so pixel art stays crisp.
  out.push('texture_filter = 1', '');
  for (const { layer, map } of o.maps) {
    out.push(`[node name=${gdString(nodeName(layer.name, used, 'Tiles'))} type="TileMapLayer" parent="."]`);
    if (!layer.visible) out.push('visible = false');
    if (layer.opacity < 1) out.push(`modulate = Color(1, 1, 1, ${gdFloat(layer.opacity)})`);
    const k = (layer.pixelSize || 1) / (o.atlas.scale ?? 1);
    if (o.origin && (o.origin.x || o.origin.y)) out.push(`position = Vector2(${gdFloat(o.origin.x * (layer.pixelSize || 1))}, ${gdFloat(o.origin.y * (layer.pixelSize || 1))})`);
    if (k !== 1) out.push(`scale = Vector2(${gdFloat(k)}, ${gdFloat(k)})`);
    if (map) out.push(`tile_map_data = PackedByteArray(${godotTileMapData(map, o.atlas).join(', ')})`);
    out.push('tile_set = ExtResource("1_tiles")', '');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- Tiled and JSON

/** Slot (column, row) to Tiled's local tile id. */
const localId = (atlas: TileAtlas, col: number, row: number) => row * atlas.columns + col;

/** A cell as Tiled writes it: 0 empty, else first gid + local id, with the same three flip bits Frameling uses. */
function tiledGid(atlas: TileAtlas, v: number, firstGid: number, where: Map<number, { col: number; row: number }>): number {
  const slot = v ? where.get(cellKey(v)) : undefined;
  if (!slot) return 0;
  return ((firstGid + localId(atlas, slot.col, slot.row)) | cellFlags(v)) >>> 0;
}

/** A tile's custom values (and its terrain and one-way flag) as Tiled properties. */
function tiledProperties(ts: Tileset | undefined, tile: Tile | undefined): { name: string; type: string; value: TileDataValue }[] {
  if (!ts || !tile) return [];
  const out: { name: string; type: string; value: TileDataValue }[] = [];
  for (const l of ts.dataLayers ?? []) {
    const v = tile.data?.[l.name];
    if (v !== undefined) out.push({ name: l.name, type: l.type === 'bool' ? 'bool' : l.type === 'int' ? 'int' : l.type === 'float' ? 'float' : 'string', value: v });
  }
  const terrain = ts.terrains?.find((t) => t.id === tile.terrain?.id);
  if (terrain) out.push({ name: 'terrain', type: 'string', value: terrain.name });
  if (tile.collision?.oneWay) out.push({ name: 'oneWay', type: 'bool', value: true });
  return out;
}

/** A tile's shapes as the object layer Tiled keeps its collision in, in the picture's pixels. */
function tiledCollision(tile: Tile, ts: Tileset, scale: number): object | undefined {
  const shapes = (tile.collision?.shapes ?? []).filter(validShape);
  if (!shapes.length) return undefined;
  const objects = shapes.map((s, i) => {
    const base = { id: i + 1, name: '', type: '', rotation: 0, visible: true };
    if (s.kind === 'box') return { ...base, x: s.x * scale, y: s.y * scale, width: s.w * scale, height: s.h * scale };
    const pts = shapePoints(s);
    return { ...base, x: 0, y: 0, polygon: pts.map((p) => ({ x: p.x * scale, y: p.y * scale })) };
  });
  return { draworder: 'index', id: shapes.length + 2, name: '', opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0, objects };
}

export function tiledTileset(atlas: TileAtlas, o: { name: string; image: string; fps: number }): object {
  const tiles: object[] = [];
  for (const t of atlas.tiles) {
    const f0 = t.frames[0];
    const tile = atlas.tileset ? findTile(atlas.tileset, t.key) : undefined;
    const entry: Record<string, unknown> = { id: localId(atlas, f0.col, f0.row), properties: [{ name: 'name', type: 'string', value: t.name }, ...tiledProperties(atlas.tileset, tile)] };
    const group = tile && atlas.tileset ? tiledCollision(tile, atlas.tileset, atlas.scale ?? 1) : undefined;
    if (group) entry.objectgroup = group;
    if (t.frames.length > 1) entry.animation = t.frames.map((f) => ({ tileid: localId(atlas, f.col, f.row), duration: Math.round((f.duration * 1000) / Math.max(1, o.fps)) }));
    tiles.push(entry);
  }
  return {
    type: 'tileset',
    version: '1.10',
    tiledversion: '1.11.0',
    name: o.name,
    image: o.image,
    imagewidth: atlas.image.width,
    imageheight: atlas.image.height,
    tilewidth: atlas.tileWidth,
    tileheight: atlas.tileHeight,
    margin: atlas.margin,
    spacing: atlas.spacing,
    columns: atlas.columns,
    tilecount: atlas.columns * atlas.rows,
    tiles,
  };
}

export function tiledMap(atlas: TileAtlas, o: { tilesetSource: string; maps: { layer: TilemapLayer; map: TilemapDrawing | null }[]; origin?: { x: number; y: number } }): object {
  const where = new Map(atlas.tiles.map((t) => [t.key, t.frames[0]]));
  const width = Math.max(1, ...o.maps.map((m) => m.map?.columns ?? 0));
  const height = Math.max(1, ...o.maps.map((m) => m.map?.rows ?? 0));
  const layers = o.maps.map(({ layer, map }, i) => {
    const data = new Array<number>(width * height).fill(0);
    if (map) for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.columns; x++) data[y * width + x] = tiledGid(atlas, map.cells[y * map.columns + x], 1, where);
    return { id: i + 1, name: layer.name, type: 'tilelayer', x: 0, y: 0, ...(o.origin && (o.origin.x || o.origin.y) ? { offsetx: o.origin.x * (atlas.scale ?? 1), offsety: o.origin.y * (atlas.scale ?? 1) } : {}), width, height, opacity: layer.opacity, visible: layer.visible, data };
  });
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width,
    height,
    tilewidth: atlas.tileWidth,
    tileheight: atlas.tileHeight,
    infinite: false,
    compressionlevel: -1,
    nextlayerid: layers.length + 1,
    nextobjectid: 1,
    tilesets: [{ firstgid: 1, source: o.tilesetSource }],
    layers,
  };
}

/** Frameling's own plain JSON: where each tile is, and every map as tile numbers. */
export function tilesetJson(atlas: TileAtlas, o: { image: string; fps: number; maps: { layer: TilemapLayer; map: TilemapDrawing | null }[] }): object {
  const index = new Map(atlas.tiles.map((t, i) => [t.key, i]));
  const cell = (v: number) => {
    const i = v ? index.get(cellKey(v)) : undefined;
    return i === undefined ? 0 : ((i + 1) | cellFlags(v)) >>> 0;
  };
  return {
    format: 'frameling-tileset',
    version: 1,
    image: o.image,
    imageWidth: atlas.image.width,
    imageHeight: atlas.image.height,
    tileWidth: atlas.tileWidth,
    tileHeight: atlas.tileHeight,
    margin: atlas.margin,
    spacing: atlas.spacing,
    fps: o.fps,
    ...(atlas.tileset?.dataLayers?.length ? { dataLayers: atlas.tileset.dataLayers } : {}),
    ...(atlas.tileset?.terrains?.length ? { terrains: atlas.tileset.terrains.map((t) => ({ name: t.name, color: t.color })), terrainMode: modeOf(atlas.tileset) } : {}),
    tiles: atlas.tiles.map((t) => {
      const tile = atlas.tileset ? findTile(atlas.tileset, t.key) : undefined;
      const terrains = atlas.tileset?.terrains ?? [];
      const nameOf = (id: number) => terrains.find((x) => x.id === id)?.name;
      const own = tile?.terrain ? nameOf(tile.terrain.id) : undefined;
      return {
        name: t.name,
        frames: t.frames.map((f) => ({ x: atlas.margin + f.col * (atlas.tileWidth + atlas.spacing), y: atlas.margin + f.row * (atlas.tileHeight + atlas.spacing), duration: f.duration })),
        ...(tile?.collision?.shapes.length ? { collision: { oneWay: !!tile.collision.oneWay, shapes: tile.collision.shapes.map((s) => (s.kind === 'box' ? { type: 'box', x: s.x, y: s.y, width: s.w, height: s.h } : { type: 'polygon', points: s.points })) } } : {}),
        ...(tile?.data ? { data: tile.data } : {}),
        ...(own ? { terrain: { name: own, edges: Object.fromEntries(Object.entries(tile!.terrain!.bits ?? {}).map(([k, v]) => [k, nameOf(v as number)]).filter(([, v]) => v)) } } : {}),
      };
    }),
    cellFormat: '0 is empty. Otherwise the tile number (1 is the first tile) plus flags: 2^31 mirrored left to right, 2^30 mirrored top to bottom, 2^29 swapped across the diagonal.',
    maps: o.maps.map(({ layer, map }) => ({ name: layer.name, columns: map?.columns ?? 0, rows: map?.rows ?? 0, visible: layer.visible, opacity: layer.opacity, cells: map ? Array.from(map.cells, cell) : [] })),
  };
}

// ---------------------------------------------------------------- the files

/** Where the picture lives in the Godot project. */
export function tilesetTexturePath(custom: string, name: string): string {
  const c = custom.trim().replace(/\\/g, '/');
  if (!c) return `res://tiles/${slug(name, 'tileset')}.png`;
  return c.startsWith('res://') ? c : 'res://' + c.replace(/^\/+/, '');
}

/** Every file the export makes. Pure, so tests can check it. */
export function tilesetFiles(doc: Doc, s: TilesetExportSettings, frame: number): { name: string; bytes: Uint8Array }[] {
  const atlas = buildTileAtlas(doc, s);
  const texture = tilesetTexturePath(s.godotPath, doc.name);
  const base = texture.split('/').pop()!.replace(/\.[^.]*$/, '') || 'tileset';
  const dir = texture.slice(0, texture.lastIndexOf('/') + 1);
  const maps = mapsAt(doc, frame);
  const files = [{ name: `${base}.png`, bytes: encodePng(atlas.image) }];
  const text = (name: string, t: string) => files.push({ name, bytes: strToU8(t) });
  if (s.godot || s.godotScene) text(`${base}.tres`, godotTileSet(atlas, texture, doc.fps));
  if (s.godotScene && maps.length) text(`${base}.tscn`, godotTileScene({ tileSetPath: `${dir}${base}.tres`, rootName: doc.name, maps, atlas, origin: tileOrigin(doc) }));
  if (s.json) text(`${base}.json`, JSON.stringify(tilesetJson(atlas, { image: `${base}.png`, fps: doc.fps, maps }), null, 2) + '\n');
  if (s.tiled) {
    text(`${base}.tsj`, JSON.stringify(tiledTileset(atlas, { name: doc.name, image: `${base}.png`, fps: doc.fps }), null, 2) + '\n');
    if (maps.length) text(`${base}.tmj`, JSON.stringify(tiledMap(atlas, { tilesetSource: `${base}.tsj`, maps, origin: tileOrigin(doc) })) + '\n');
  }
  return files;
}


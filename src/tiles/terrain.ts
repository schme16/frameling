/**
 * Terrains: groups of tiles that fit together by their edges (grass, water, walls). Each tile says which terrain it is
 * and which terrain touches each of its sides and corners. Painting with a terrain tile then picks, for every slot,
 * the tile whose edges fit its neighbours, so a patch of grass gets its edges and corners by itself.
 *
 * All pure functions on a tileset and on cell arrays, so the tools, the exports and the tests share them.
 */
import type { Doc, PeeringBit, PixelDrawing, Terrain, TerrainMode, Tile, TileTerrain, Tileset } from '../core/format';
import { addTile, cellKey, ensureTileset, makeCell } from './model';

/** The eight neighbours with where they sit, clockwise from the right. */
export const PEERING: { bit: PeeringBit; dx: number; dy: number; corner: boolean }[] = [
  { bit: 'right', dx: 1, dy: 0, corner: false },
  { bit: 'bottom-right', dx: 1, dy: 1, corner: true },
  { bit: 'bottom', dx: 0, dy: 1, corner: false },
  { bit: 'bottom-left', dx: -1, dy: 1, corner: true },
  { bit: 'left', dx: -1, dy: 0, corner: false },
  { bit: 'top-left', dx: -1, dy: -1, corner: true },
  { bit: 'top', dx: 0, dy: -1, corner: false },
  { bit: 'top-right', dx: 1, dy: -1, corner: true },
];

export const TERRAIN_MODES: { value: TerrainMode; label: string; detail: string }[] = [
  { value: 'corners-and-sides', label: 'Corners and sides', detail: 'Edges and corners both have to fit: the full set of 47 tiles.' },
  { value: 'sides', label: 'Sides only', detail: 'Only the four sides have to fit: a set of 16 tiles.' },
  { value: 'corners', label: 'Corners only', detail: 'Only the four corners have to fit: a set of 16 tiles.' },
];

/** Does this way of matching look at the bit? */
export function modeUses(mode: TerrainMode, bit: PeeringBit): boolean {
  const corner = PEERING.find((p) => p.bit === bit)!.corner;
  return mode === 'corners-and-sides' || (mode === 'corners') === corner;
}

export const modeOf = (ts: Tileset | undefined): TerrainMode => ts?.terrainMode ?? 'corners-and-sides';

/** Godot's names for the bits (TileSet.CellNeighbor), as they appear in a .tres file. */
export const GODOT_BIT: Record<PeeringBit, string> = {
  right: 'right_side',
  'bottom-right': 'bottom_right_corner',
  bottom: 'bottom_side',
  'bottom-left': 'bottom_left_corner',
  left: 'left_side',
  'top-left': 'top_left_corner',
  top: 'top_side',
  'top-right': 'top_right_corner',
};

export const GODOT_MODE: Record<TerrainMode, number> = { 'corners-and-sides': 0, corners: 1, sides: 2 };

export const terrainById = (ts: Tileset | undefined, id: number | undefined): Terrain | undefined => (id === undefined ? undefined : ts?.terrains?.find((t) => t.id === id));

// ---------------------------------------------------------------- editing the list

export const TERRAIN_COLORS = ['#5fbf5f', '#e0a84a', '#5aa9e6', '#c97bd8', '#e66a6a', '#8c8f99'];

function uniqueName(ts: Tileset, base: string): string {
  const names = new Set((ts.terrains ?? []).map((t) => t.name));
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** Adds a terrain. Ids are never reused. */
export function addTerrain(ts: Tileset, opts: { name?: string; color?: string } = {}): Terrain {
  const list = (ts.terrains ??= []);
  const id = Math.max(ts.nextTerrain ?? 1, 1 + Math.max(0, ...list.map((t) => t.id)));
  const t: Terrain = { id, name: uniqueName(ts, opts.name?.trim() || 'Terrain'), color: opts.color ?? TERRAIN_COLORS[list.length % TERRAIN_COLORS.length] };
  ts.nextTerrain = id + 1;
  list.push(t);
  return t;
}

export function renameTerrain(ts: Tileset, id: number, name: string): boolean {
  const t = terrainById(ts, id);
  const n = name.trim();
  if (!t || !n || t.name === n) return false;
  t.name = n;
  return true;
}

export function recolourTerrain(ts: Tileset, id: number, color: string): boolean {
  const t = terrainById(ts, id);
  if (!t || !/^#[0-9a-f]{6}$/i.test(color) || t.color === color) return false;
  t.color = color;
  return true;
}

/** Removes a terrain; tiles that were part of it stop being, and edges that touched it are cleared. Returns how many tiles changed. */
export function deleteTerrain(ts: Tileset, id: number): number {
  const list = ts.terrains;
  const i = list ? list.findIndex((t) => t.id === id) : -1;
  if (!list || i < 0) return 0;
  list.splice(i, 1);
  let n = 0;
  for (const t of ts.tiles) {
    if (!t.terrain) continue;
    if (t.terrain.id === id) {
      delete t.terrain;
      n++;
      continue;
    }
    if (t.terrain.bits) {
      for (const k of Object.keys(t.terrain.bits) as PeeringBit[]) if (t.terrain.bits[k] === id) delete t.terrain.bits[k];
      if (!Object.keys(t.terrain.bits).length) delete t.terrain.bits;
    }
  }
  if (!list.length) {
    delete ts.terrains;
    delete ts.nextTerrain;
    delete ts.terrainMode;
  }
  return n;
}

/** Says which terrain a tile is (or none, with undefined). Its edges are kept. */
export function setTileTerrain(t: Tile, id: number | undefined): void {
  if (id === undefined) delete t.terrain;
  else t.terrain = { id, ...(t.terrain?.bits ? { bits: t.terrain.bits } : {}) };
}

/** Sets or clears what touches one side or corner of a tile. The tile must already be part of a terrain. */
export function setTileBit(t: Tile, bit: PeeringBit, id: number | undefined): boolean {
  if (!t.terrain) return false;
  const bits = { ...(t.terrain.bits ?? {}) };
  if (id === undefined) delete bits[bit];
  else bits[bit] = id;
  t.terrain = { id: t.terrain.id, ...(Object.keys(bits).length ? { bits } : {}) };
  return true;
}

// ---------------------------------------------------------------- picking tiles

/** What each of the eight places around a slot holds: a terrain id, or undefined for none. */
export type Around = Partial<Record<PeeringBit, number>>;

/** The terrain of a slot's cell, or undefined when it's empty or its tile is not part of a terrain. */
export function terrainOfCell(ts: Tileset, cell: number): number | undefined {
  if (!cell) return undefined;
  const k = cellKey(cell);
  return ts.tiles.find((t) => t.key === k)?.terrain?.id;
}

/**
 * What a slot's edges should touch, given the terrain around it. A side touches the terrain of the slot beside it; a
 * corner touches a terrain only when the slot on the diagonal and both slots beside the corner are that terrain.
 */
export function wantedBits(around: (dx: number, dy: number) => number | undefined): Around {
  const out: Around = {};
  for (const p of PEERING) {
    const v = around(p.dx, p.dy);
    if (v === undefined) continue;
    if (!p.corner) out[p.bit] = v;
    else if (around(p.dx, 0) === v && around(0, p.dy) === v) out[p.bit] = v;
  }
  return out;
}

const SIDE_COST = 4;
const CORNER_COST = 1;

/** How far a tile's edges are from what's wanted (0 is a perfect fit). Sides count more than corners. */
export function mismatch(tile: Tile, want: Around, mode: TerrainMode): number {
  const have = tile.terrain?.bits ?? {};
  let cost = 0;
  for (const p of PEERING) {
    if (!modeUses(mode, p.bit)) continue;
    if (have[p.bit] !== want[p.bit]) cost += p.corner ? CORNER_COST : SIDE_COST;
  }
  return cost;
}

/** The tile of a terrain whose edges fit best. The current tile wins a tie, then the earlier one in the tileset. */
export function bestTile(tiles: Tile[], want: Around, mode: TerrainMode, current?: number): Tile | undefined {
  let best: Tile | undefined;
  let bestCost = Infinity;
  for (const t of tiles) {
    const c = mismatch(t, want, mode);
    if (c < bestCost || (c === bestCost && best && t.key === current && best.key !== current)) {
      best = t;
      bestCost = c;
    }
  }
  return best;
}

/** Tiles by the terrain they belong to. */
export function tilesByTerrain(ts: Tileset): Map<number, Tile[]> {
  const m = new Map<number, Tile[]>();
  for (const t of ts.tiles) if (t.terrain) m.set(t.terrain.id, [...(m.get(t.terrain.id) ?? []), t]);
  return m;
}

/** Does the tileset have any tile that is part of a terrain? */
export const hasTerrainTiles = (ts: Tileset | undefined): boolean => !!ts?.tiles.some((t) => t.terrain);

/**
 * Re-picks the tile of every slot in a rectangle (clamped to the map) so its edges fit what is around it. A slot that
 * already fits perfectly is left alone, even when another tile fits too, so a flower tile you placed on purpose stays.
 * Slots that are empty or hold a tile with no terrain are never touched. Returns how many slots changed.
 */
export function healCells(cells: Uint32Array, columns: number, rows: number, ts: Tileset, x0: number, y0: number, x1: number, y1: number): number {
  if (!hasTerrainTiles(ts)) return 0;
  const groups = tilesByTerrain(ts);
  const mode = modeOf(ts);
  const byKey = new Map(ts.tiles.map((t) => [t.key, t]));
  const terrainAt = (x: number, y: number): number | undefined => {
    if (x < 0 || y < 0 || x >= columns || y >= rows) return undefined;
    const v = cells[y * columns + x];
    return v ? byKey.get(cellKey(v))?.terrain?.id : undefined;
  };
  let changed = 0;
  const next: [number, number][] = [];
  for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(columns - 1, x1); x++) {
      const v = cells[y * columns + x];
      const own = v ? byKey.get(cellKey(v)) : undefined;
      if (!own?.terrain) continue;
      const want = wantedBits((dx, dy) => terrainAt(x + dx, y + dy));
      if (mismatch(own, want, mode) === 0) continue;
      const pick = bestTile(groups.get(own.terrain.id) ?? [], want, mode, own.key);
      if (pick && pick.key !== own.key) next.push([y * columns + x, makeCell(pick.key)]);
    }
  }
  // Applied after looking at every slot: the choice depends only on the terrains around, never on the tiles picked.
  for (const [i, c] of next) {
    cells[i] = c;
    changed++;
  }
  return changed;
}

/** Puts a value in a slot and re-picks the tiles of the slot and the eight around it. Returns true when the slot changed. */
export function placeWithEdges(cells: Uint32Array, columns: number, rows: number, ts: Tileset, x: number, y: number, value: number): boolean {
  if (x < 0 || y < 0 || x >= columns || y >= rows) return false;
  const i = y * columns + x;
  const was = cells[i];
  cells[i] = value;
  healCells(cells, columns, rows, ts, x - 1, y - 1, x + 1, y + 1);
  return cells[i] !== was;
}

/** The smallest rectangle (inclusive) where two cell arrays differ, or null when they match. */
export function changedBox(a: Uint32Array, b: Uint32Array, columns: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) continue;
    const x = i % columns;
    const y = Math.floor(i / columns);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

// ---------------------------------------------------------------- guessing edges from the picture

/**
 * Works out which sides and corners of a picture touch the terrain by looking at where it is filled in: a side counts
 * when the middle of that edge is mostly painted, a corner when the corner block is. Meant for tiles drawn on a
 * see-through background (grass on nothing); a tile that fills its whole square touches everything.
 */
export function guessBits(pixels: Uint8ClampedArray, w: number, h: number, id: number, mode: TerrainMode): TileTerrain {
  const solid = (x: number, y: number) => pixels[(y * w + x) * 4 + 3] >= 128;
  const frac = (x0: number, y0: number, x1: number, y1: number) => {
    let on = 0;
    let all = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        all++;
        if (solid(x, y)) on++;
      }
    }
    return all ? on / all : 0;
  };
  const band = Math.max(1, Math.round(Math.min(w, h) / 8));
  const block = Math.max(1, Math.round(Math.min(w, h) / 4));
  const mx0 = Math.floor(w / 3);
  const mx1 = Math.max(mx0 + 1, Math.ceil((2 * w) / 3));
  const my0 = Math.floor(h / 3);
  const my1 = Math.max(my0 + 1, Math.ceil((2 * h) / 3));
  const has: Record<PeeringBit, boolean> = {
    top: frac(mx0, 0, mx1, band) >= 0.5,
    bottom: frac(mx0, h - band, mx1, h) >= 0.5,
    left: frac(0, my0, band, my1) >= 0.5,
    right: frac(w - band, my0, w, my1) >= 0.5,
    'top-left': frac(0, 0, block, block) >= 0.5,
    'top-right': frac(w - block, 0, w, block) >= 0.5,
    'bottom-left': frac(0, h - block, block, h) >= 0.5,
    'bottom-right': frac(w - block, h - block, w, h) >= 0.5,
  };
  const bits: Partial<Record<PeeringBit, number>> = {};
  for (const p of PEERING) {
    if (!modeUses(mode, p.bit) || !has[p.bit]) continue;
    // With sides in play, a corner only counts when both sides beside it do.
    if (p.corner && mode === 'corners-and-sides' && !(has[sideBeside(p.bit, 'x')] && has[sideBeside(p.bit, 'y')])) continue;
    bits[p.bit] = id;
  }
  return { id, ...(Object.keys(bits).length ? { bits } : {}) };
}

function sideBeside(corner: PeeringBit, axis: 'x' | 'y'): PeeringBit {
  const [v, h] = corner.split('-') as ['top' | 'bottom', 'left' | 'right'];
  return axis === 'x' ? h : v;
}

// ---------------------------------------------------------------- a starter set

/** Every way a tile's four sides and four corners can be touched: 47 in all (a corner only matters when both sides beside it are). */
export function edgeCombos(mode: TerrainMode = 'corners-and-sides'): PeeringBit[][] {
  const out: PeeringBit[][] = [];
  const sides: PeeringBit[] = ['top', 'right', 'bottom', 'left'];
  const corners: PeeringBit[] = ['top-right', 'bottom-right', 'bottom-left', 'top-left'];
  if (mode === 'corners') {
    for (let m = 0; m < 16; m++) out.push(corners.filter((_, i) => m & (1 << i)));
    return out;
  }
  for (let m = 0; m < 16; m++) {
    const s = sides.filter((_, i) => m & (1 << i));
    if (mode === 'sides') {
      out.push(s);
      continue;
    }
    const open = corners.filter((c) => s.includes(sideBeside(c, 'x')) && s.includes(sideBeside(c, 'y')));
    for (let k = 0; k < 1 << open.length; k++) out.push([...s, ...open.filter((_, i) => k & (1 << i))]);
  }
  return out;
}

/** Pixels of one starter tile: a block of colour that runs to the edge where the bits say it continues, with a darker outline. */
export function drawEdgeTile(bits: PeeringBit[], w: number, h: number, color: [number, number, number]): Uint8ClampedArray {
  const has = new Set(bits);
  const mx = Math.max(1, Math.round(w / 5));
  const my = Math.max(1, Math.round(h / 5));
  const fill = new Uint8Array(w * h);
  const left = has.has('left') ? 0 : mx;
  const right = has.has('right') ? w : w - mx;
  const top = has.has('top') ? 0 : my;
  const bottom = has.has('bottom') ? h : h - my;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) fill[y * w + x] = 1;
  const cut = (cx0: number, cy0: number, cx1: number, cy1: number) => {
    for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) fill[y * w + x] = 0;
  };
  // A corner between two continuing sides that is not touched is a notch; a corner where both sides end is rounded.
  const has2 = (a: PeeringBit, b: PeeringBit) => has.has(a) && has.has(b);
  if (has2('top', 'left') && !has.has('top-left')) cut(0, 0, mx, my);
  if (has2('top', 'right') && !has.has('top-right')) cut(w - mx, 0, w, my);
  if (has2('bottom', 'left') && !has.has('bottom-left')) cut(0, h - my, mx, h);
  if (has2('bottom', 'right') && !has.has('bottom-right')) cut(w - mx, h - my, w, h);
  if (!has.has('top') && !has.has('left')) fill[my * w + mx] = 0;
  if (!has.has('top') && !has.has('right')) fill[my * w + (w - mx - 1)] = 0;
  if (!has.has('bottom') && !has.has('left')) fill[(h - my - 1) * w + mx] = 0;
  if (!has.has('bottom') && !has.has('right')) fill[(h - my - 1) * w + (w - mx - 1)] = 0;
  const px = new Uint8ClampedArray(w * h * 4);
  const dark = color.map((c) => Math.round(c * 0.55));
  const solid = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? true : fill[y * w + x] === 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!fill[y * w + x]) continue;
      const rim = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
      const c = rim ? dark : color;
      px.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  }
  return px;
}

const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0) as [number, number, number];

/**
 * Makes a ready-to-paint set of edge tiles for a terrain, drawn in its colour: 47 for corners and sides, 16 for the
 * others. Every tile already knows which sides and corners it touches. Returns the new tiles.
 */
export function addEdgeSet(doc: Doc, terrainId: number): Tile[] {
  const ts = ensureTileset(doc);
  const terrain = terrainById(ts, terrainId);
  if (!terrain) return [];
  const mode = modeOf(ts);
  const color = hexRgb(terrain.color);
  const made: Tile[] = [];
  edgeCombos(mode).forEach((bits, i) => {
    const t = addTile(doc, { name: `${terrain.name} ${i + 1}` });
    const d = doc.drawings[t.frames[0].drawingId] as PixelDrawing;
    d.pixels = drawEdgeTile(bits, ts.tileWidth, ts.tileHeight, color);
    t.terrain = { id: terrainId, ...(bits.length ? { bits: Object.fromEntries(bits.map((b) => [b, terrainId])) } : {}) };
    made.push(t);
  });
  return made;
}

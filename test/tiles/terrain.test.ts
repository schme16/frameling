import { describe, expect, it } from 'vitest';
import { newDoc, newTilemapDrawing } from '../../src/core/doc';
import type { Doc, PeeringBit, PixelDrawing, Tileset } from '../../src/core/format';
import { addTile, ensureTileset, makeCell } from '../../src/tiles/model';
import { addEdgeSet, addTerrain, bestTile, changedBox, deleteTerrain, drawEdgeTile, edgeCombos, guessBits, healCells, mismatch, modeUses, placeWithEdges, setTileBit, setTileTerrain, wantedBits } from '../../src/tiles/terrain';

/** A tileset with one terrain and its 47 edge tiles. */
function grassDoc(mode?: 'sides' | 'corners') {
  const doc = newDoc({ width: 64, height: 64, pixel: { pixelSize: 1 } });
  const ts = ensureTileset(doc, 16, 16);
  if (mode) ts.terrainMode = mode;
  const grass = addTerrain(ts, { name: 'Grass' });
  const tiles = addEdgeSet(doc, grass.id);
  return { doc, ts, grass, tiles };
}

const bitsOf = (t: { terrain?: { bits?: Partial<Record<PeeringBit, number>> } }) => Object.keys(t.terrain?.bits ?? {}).sort();

/** The map as text: "." for empty, else the tile's index in the set. */
function show(cells: Uint32Array, cols: number, ts: Tileset): string {
  const rows: string[] = [];
  for (let y = 0; y < cells.length / cols; y++) rows.push([...cells.subarray(y * cols, (y + 1) * cols)].map((c) => (c ? String(ts.tiles.findIndex((t) => t.key === (c & 0x0fffffff))).padStart(2, '0') : '..')).join(' '));
  return rows.join('\n');
}

describe('terrains', () => {
  it('numbers ids that are never reused', () => {
    const doc = newDoc();
    const ts = ensureTileset(doc, 8, 8);
    const a = addTerrain(ts);
    const b = addTerrain(ts);
    expect([a.id, b.id]).toEqual([1, 2]);
    deleteTerrain(ts, b.id);
    expect(addTerrain(ts).id).toBe(3);
    expect(new Set([a.name, b.name]).size).toBe(2);
  });

  it('takes tiles out of a deleted terrain and clears edges that touched it', () => {
    const doc = newDoc();
    const ts = ensureTileset(doc, 8, 8);
    const a = addTerrain(ts);
    const b = addTerrain(ts);
    const t = addTile(doc);
    const u = addTile(doc);
    setTileTerrain(t, a.id);
    setTileBit(t, 'top', b.id);
    setTileBit(t, 'left', a.id);
    setTileTerrain(u, b.id);
    expect(deleteTerrain(ts, b.id)).toBe(1);
    expect(u.terrain).toBeUndefined();
    expect(t.terrain).toEqual({ id: a.id, bits: { left: a.id } });
    deleteTerrain(ts, a.id);
    expect(ts.terrains).toBeUndefined();
    expect(ts.nextTerrain).toBeUndefined();
  });

  it('only counts the bits a way of matching looks at', () => {
    expect(modeUses('sides', 'top')).toBe(true);
    expect(modeUses('sides', 'top-left')).toBe(false);
    expect(modeUses('corners', 'top-left')).toBe(true);
    expect(modeUses('corners', 'left')).toBe(false);
    expect(modeUses('corners-and-sides', 'left')).toBe(true);
  });
});

describe('the starter set', () => {
  it('has 47 tiles for corners and sides, 16 for the others, all different', () => {
    expect(edgeCombos().length).toBe(47);
    expect(edgeCombos('sides').length).toBe(16);
    expect(edgeCombos('corners').length).toBe(16);
    const { doc, tiles } = grassDoc();
    expect(tiles.length).toBe(47);
    const looks = new Set(tiles.map((t) => '' + [...addEdgeSetPixels(t, doc)]));
    expect(looks.size).toBe(47);
  });

  it('draws a corner that is not touched as a notch, and a lone tile with rounded corners', () => {
    const w = 10;
    const all: PeeringBit[] = ['top', 'right', 'bottom', 'left', 'top-right', 'bottom-right', 'bottom-left', 'top-left'];
    const full = drawEdgeTile(all, w, w, [10, 200, 10]);
    const notch = drawEdgeTile(all.filter((b) => b !== 'top-left'), w, w, [10, 200, 10]);
    const alpha = (px: Uint8ClampedArray, x: number, y: number) => px[(y * w + x) * 4 + 3];
    expect(alpha(full, 0, 0)).toBe(255);
    expect(alpha(notch, 0, 0)).toBe(0);
    expect(alpha(notch, 9, 9)).toBe(255);
    const lone = drawEdgeTile([], w, w, [10, 200, 10]);
    expect(alpha(lone, 0, 0)).toBe(0);
    expect(alpha(lone, 5, 5)).toBe(255);
  });
});

function addEdgeSetPixels(t: { frames: { drawingId: string }[] }, doc: Doc): Uint8ClampedArray {
  return (doc.drawings[t.frames[0].drawingId] as PixelDrawing | undefined)?.pixels ?? new Uint8ClampedArray(0);
}

describe('guessing edges from a picture', () => {
  it('finds the edges of every starter tile from its pixels alone', () => {
    const { doc, tiles } = grassDoc();
    for (const t of tiles) {
      const d = doc.drawings[t.frames[0].drawingId] as PixelDrawing;
      const guess = guessBits(d.pixels, d.width, d.height, t.terrain!.id, 'corners-and-sides');
      expect(bitsOf({ terrain: guess })).toEqual(bitsOf(t));
    }
  });

  it('marks a tile that fills its whole square as touching everything', () => {
    const px = new Uint8ClampedArray(8 * 8 * 4).fill(255);
    expect(bitsOf({ terrain: guessBits(px, 8, 8, 1, 'corners-and-sides') }).length).toBe(8);
    expect(bitsOf({ terrain: guessBits(px, 8, 8, 1, 'sides') }).length).toBe(4);
  });
});

describe('what a slot wants', () => {
  it('has a side touch the slot beside it, and a corner only when the diagonal and both sides are terrain', () => {
    const at = (set: string[]) => (dx: number, dy: number) => (set.includes(`${dx},${dy}`) ? 1 : undefined);
    expect(wantedBits(at(['1,0', '0,1']))).toEqual({ right: 1, bottom: 1 });
    expect(wantedBits(at(['1,0', '0,1', '1,1']))).toEqual({ right: 1, bottom: 1, 'bottom-right': 1 });
    // A diagonal on its own touches no corner.
    expect(wantedBits(at(['1,1']))).toEqual({});
  });

  it('picks the closest tile when none fits, sides first, and keeps the current one on a tie', () => {
    const { ts, tiles } = grassDoc();
    const group = ts.tiles;
    const want = { top: 1, right: 1, bottom: 1, left: 1 };
    const pick = bestTile(group, want, 'corners-and-sides')!;
    expect(pick.terrain!.bits).toMatchObject(want);
    expect(mismatch(pick, want, 'corners-and-sides')).toBeLessThanOrEqual(0);
    // Nothing wanted and a tile that fits: stays put.
    const lone = tiles.find((t) => !t.terrain!.bits)!;
    expect(bestTile(group, {}, 'corners-and-sides', lone.key)!.key).toBe(lone.key);
  });
});

describe('painting with edges', () => {
  it('turns a 3 by 3 block into a rim, corners and a middle', () => {
    const { ts, tiles } = grassDoc();
    const cols = 7;
    const cells = new Uint32Array(cols * 7);
    const brush = makeCell(tiles[tiles.length - 1].key);
    for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) placeWithEdges(cells, cols, 7, ts, x, y, brush);
    const at = (x: number, y: number) => ts.tiles.find((t) => t.key === (cells[y * cols + x] & 0x0fffffff))!;
    // The middle touches everything.
    expect(bitsOf(at(3, 3)).length).toBe(8);
    // The top left corner touches right, bottom and the diagonal inside.
    expect(bitsOf(at(2, 2))).toEqual(['bottom', 'bottom-right', 'right']);
    expect(bitsOf(at(4, 2))).toEqual(['bottom', 'bottom-left', 'left']);
    expect(bitsOf(at(2, 4))).toEqual(['right', 'top', 'top-right']);
    expect(bitsOf(at(4, 4))).toEqual(['left', 'top', 'top-left']);
    expect(bitsOf(at(3, 2))).toEqual(['bottom', 'bottom-left', 'bottom-right', 'left', 'right']);
  });

  it('heals the edges when a middle slot is erased', () => {
    const { ts, tiles } = grassDoc();
    const cols = 7;
    const cells = new Uint32Array(cols * 7);
    const brush = makeCell(tiles[tiles.length - 1].key);
    for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) placeWithEdges(cells, cols, 7, ts, x, y, brush);
    placeWithEdges(cells, cols, 7, ts, 3, 3, 0);
    const at = (x: number, y: number) => ts.tiles.find((t) => t.key === (cells[y * cols + x] & 0x0fffffff))!;
    // The slot above the hole now has an open bottom, and the one to its left an open right side.
    expect(bitsOf(at(3, 2))).not.toContain('bottom');
    expect(bitsOf(at(2, 3))).not.toContain('right');
    // And the corner of the hole is a notch for the diagonal neighbour.
    expect(bitsOf(at(2, 2))).not.toContain('bottom-right');
  });

  it('leaves a slot that already fits alone, so a variation you placed stays', () => {
    const { doc, ts, tiles, grass } = grassDoc();
    const full = tiles[tiles.length - 1];
    const variant = addTile(doc, { name: 'Flowers' });
    variant.terrain = { id: grass.id, bits: full.terrain!.bits };
    const cols = 5;
    const cells = new Uint32Array(cols * 5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) cells[y * cols + x] = makeCell(full.key);
    cells[2 * cols + 2] = makeCell(variant.key);
    healCells(cells, cols, 5, ts, 0, 0, 4, 4);
    expect(cells[2 * cols + 2]).toBe(makeCell(variant.key));
  });

  it('never touches empty slots or tiles that have no terrain', () => {
    const { doc, ts, tiles } = grassDoc();
    const plain = addTile(doc, { name: 'Brick' });
    const cols = 3;
    const cells = new Uint32Array(cols * 3);
    cells[4] = makeCell(plain.key);
    cells[3] = makeCell(tiles[0].key);
    const before = [...cells];
    healCells(cells, cols, 3, ts, 0, 0, 2, 2);
    expect(cells[4]).toBe(before[4]);
    expect(cells[0]).toBe(0);
    expect(cells[3]).not.toBe(0);
  });

  it('does nothing without terrains, and stays inside the map', () => {
    const doc = newDoc();
    const ts = ensureTileset(doc, 8, 8);
    const t = addTile(doc);
    const cells = new Uint32Array(4);
    expect(placeWithEdges(cells, 2, 2, ts, 5, 5, makeCell(t.key))).toBe(false);
    expect(placeWithEdges(cells, 2, 2, ts, 0, 0, makeCell(t.key))).toBe(true);
    expect(healCells(cells, 2, 2, ts, 0, 0, 1, 1)).toBe(0);
  });

  it('works on sides only with a set of 16', () => {
    const { ts, tiles } = grassDoc('sides');
    expect(tiles.length).toBe(16);
    const cols = 5;
    const cells = new Uint32Array(cols * 5);
    const brush = makeCell(tiles[tiles.length - 1].key);
    for (let x = 1; x < 4; x++) placeWithEdges(cells, cols, 5, ts, x, 2, brush);
    const at = (x: number) => ts.tiles.find((t) => t.key === (cells[2 * cols + x] & 0x0fffffff))!;
    expect(bitsOf(at(1))).toEqual(['right']);
    expect(bitsOf(at(2))).toEqual(['left', 'right']);
    expect(bitsOf(at(3))).toEqual(['left']);
    // The map as text, to see it at a glance.
    expect(show(cells, cols, ts).split('\n')[2]).toMatch(/^\.\. \d\d \d\d \d\d \.\.$/);
  });

  it('finds the box where two maps differ', () => {
    const a = new Uint32Array(16);
    const b = new Uint32Array(a);
    expect(changedBox(a, b, 4)).toBeNull();
    b[1 * 4 + 2] = 5;
    b[3 * 4 + 1] = 5;
    expect(changedBox(a, b, 4)).toEqual({ x0: 1, y0: 1, x1: 2, y1: 3 });
    void newTilemapDrawing;
  });
});

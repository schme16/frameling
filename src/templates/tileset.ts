// A starter tileset and a small level painted with it: grass, dirt, bricks, animated water and a flower, on two
// tilemap layers.
import { newDoc, newTilemapDrawing, newTilemapLayer } from '../core/doc';
import { TILE_FLIP_X, type Doc } from '../core/format';
import { addTile, ensureTileset, makeCell } from '../tiles/model';
import { hold, hexToRgba, swatchesFrom, type PixelPalette } from './build';

const PAL: PixelPalette = {
  g: '#6abf4b',
  G: '#3f8f3a',
  d: '#a8714a',
  D: '#7a4e33',
  s: '#a7a3b5',
  S: '#6e6a7c',
  w: '#5ab8ff',
  W: '#3f86d8',
  l: '#c9ecff',
  r: '#ff6f91',
  y: '#ffc94a',
};

const DIRT = ['dddddddDdddddddd', 'ddDdddddddddDddd', 'dddddddddddddddd', 'ddddddDdddddddDd', 'dDdddddddddddddd', 'ddddddddddDddddd', 'dddDdddddddddddd', 'dddddddddddddDdd'];

const GRASS = ['..g...g....g..g.', '.ggg.ggg..ggg.gg', 'gggggggggggggggg', 'gGggggGgggggGggg', 'GgGGgGGgGGgGGgGG', 'dGddGddddGdddGdd', ...DIRT.slice(0, 8), 'dddddddddDdddddd', 'dDdddddddddddddd'];

const brickRow = (gaps: number[]) => Array.from({ length: 16 }, (_, x) => (gaps.includes(x) ? 'S' : 's')).join('');
const BRICK = ['SSSSSSSSSSSSSSSS', ...Array(7).fill(brickRow([7, 15])), 'SSSSSSSSSSSSSSSS', ...Array(7).fill(brickRow([3, 11]))];

function water(shift: number): string[] {
  const wave = (s: string) => s.slice(shift) + s.slice(0, shift);
  return [wave('ll....ll....ll..'), wave('wllwwwwllwwwwllw'), ...Array(5).fill('wwwwwwwwwwwwwwww'), wave('wwwwlwwwwwwwlwww'), ...Array(8).fill('WWWWWWWWWWWWWWWW')];
}

const FLOWER = [...Array(9).fill('................'), '.......r........', '......ryr.......', '.......r........', '.......G........', '......GG.G......', '.......G........', '.......G........'];

function pixels(rows: readonly string[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(16 * 16 * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const ch = row[x];
      if (ch && ch !== '.') out.set(hexToRgba(PAL[ch]), (y * 16 + x) * 4);
    }
  });
  return out;
}

export function makeTileset(): Doc {
  const doc = newDoc({ name: 'Tileset', width: 320, height: 192, fps: 8, length: 8, background: '#9fdcff' });
  doc.layers = [];
  ensureTileset(doc, 16, 16);
  const grass = addTile(doc, { name: 'Grass', pixels: pixels(GRASS) });
  const dirt = addTile(doc, { name: 'Dirt', pixels: pixels([...DIRT, ...DIRT]) });
  const brick = addTile(doc, { name: 'Bricks', pixels: pixels(BRICK) });
  const wet = addTile(doc, { name: 'Water', pixels: pixels(water(0)) });
  const second = addTile(doc, { name: 'tmp', pixels: pixels(water(2)) });
  // The water's second frame: borrow the pixels just made, then drop the stand-in tile.
  wet.frames = [
    { drawingId: wet.frames[0].drawingId, duration: 4 },
    { drawingId: second.frames[0].drawingId, duration: 4 },
  ];
  doc.tileset!.tiles = doc.tileset!.tiles.filter((t) => t !== second);
  const flower = addTile(doc, { name: 'Flower', pixels: pixels(FLOWER) });

  const cols = 20;
  const rows = 12;
  const ground = newTilemapLayer('Ground', 1);
  const level = newTilemapDrawing(cols, rows);
  const put = (x: number, y: number, v: number) => (level.cells[y * cols + x] = v);
  for (let x = 0; x < cols; x++) {
    const pool = x >= 9 && x <= 12;
    put(x, 8, makeCell(pool ? wet.key : grass.key));
    for (let y = 9; y < rows; y++) put(x, y, makeCell(dirt.key));
  }
  for (let x = 4; x <= 7; x++) put(x, 5, makeCell(brick.key));
  for (let x = 14; x <= 16; x++) put(x, 4, makeCell(brick.key));
  doc.drawings[level.id] = level;
  hold(ground, level.id, 0, 8);

  const decor = newTilemapLayer('Flowers', 1);
  const flowers = newTilemapDrawing(cols, rows);
  for (const [x, flip] of [
    [2, 0],
    [3, TILE_FLIP_X],
    [15, 0],
    [18, TILE_FLIP_X],
  ] as const)
    flowers.cells[7 * cols + x] = makeCell(flower.key, flip);
  flowers.cells[3 * cols + 15] = makeCell(flower.key);
  doc.drawings[flowers.id] = flowers;
  hold(decor, flowers.id, 0, 8);

  doc.layers.push(ground, decor);
  swatchesFrom(doc, Object.entries({ Leaf: PAL.g, Moss: PAL.G, Dirt: PAL.d, Soil: PAL.D, Stone: PAL.s, Slate: PAL.S, Water: PAL.w, Deep: PAL.W, Foam: PAL.l, Rose: PAL.r, Sunny: PAL.y }) as [string, string][]);
  return doc;
}

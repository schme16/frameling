// "Tiles": make a tile, draw it with tile mode on, paint across its edge so it repeats without a seam, then stamp it
// on a tilemap layer. Listed in src/quests/library.ts after Shade and shine.
import { celAt, drawingAt } from '../core/doc';
import type { Doc, PixelDrawing } from '../core/format';
import { store, type State } from '../core/store';
import type { Quest } from '../quests/types';
import { freshPage } from '../quests/actions';
import { hasPixelLayer } from '../quests/predicates';
import { PRESETS, docFromPreset } from '../ui/presets';
import { showPanel } from '../ui/dock';
import { editActiveDrawing } from '../tools/edit';
import { cellKey, makeCell } from './model';
import * as ops from './ops';
import { getTileUi, setTileUi, tileModeOn } from './state';

const SEL = {
  canvas: '.cv-root',
  newTile: ['.tz-empty button', '[data-command="tiles.new"]'],
  tiles: ['.tz-tile.is-chosen', '.tz-tile', '.tz-panel'],
  tileMode: '[data-command="tiles.tileMode"]',
  done: '.tz-banner [data-command="tiles.done"]',
  menu: '.ui-menubar [data-top]',
};

const tileCount = (): number => store().rootDoc().tileset?.tiles.length ?? 0;

/** A Game sprite page (64 x 64 grid), so 16 pixel tiles leave room for a little map. Keeps an empty one. */
export function ensureTilePage(): boolean | Promise<boolean> {
  const s = store().get();
  const p = PRESETS.find((x) => x.id === 'game-sprite');
  const empty = hasPixelLayer(s) && !s.doc.layers.some((l) => l.cels.length > 0) && !s.doc.tileset?.tiles.length;
  if (empty || !p) return !!p;
  return freshPage(() => docFromPreset(p));
}

/** The tile being drawn (on the canvas, while a tile is open). */
function openTileDrawing(doc: Doc, frame: number): PixelDrawing | null {
  if (!ops.editingTileKey()) return null;
  const layer = doc.layers.find((l) => l.kind === 'pixel');
  const d = layer ? drawingAt(doc, layer, frame) : undefined;
  return d && d.kind === 'pixel' ? d : null;
}

/**
 * Paint that runs off one edge and carries on at the other: a pixel on the left edge touching one on the right edge
 * (straight across or one step up or down, counting round the wrap), or the same between top and bottom. A tile
 * painted all over doesn't count (that's just a fill).
 */
export function paintsAcrossEdge(d: PixelDrawing): boolean {
  const { width: w, height: h, pixels } = d;
  const on = (x: number, y: number) => pixels[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4 + 3] > 0;
  let all = true;
  for (let i = 3; i < pixels.length; i += 4) if (!pixels[i]) all = false;
  if (all) return false;
  for (let y = 0; y < h; y++) if (on(0, y) && (on(w - 1, y - 1) || on(w - 1, y) || on(w - 1, y + 1))) return true;
  for (let x = 0; x < w; x++) if (on(x, 0) && (on(x - 1, h - 1) || on(x, h - 1) || on(x + 1, h - 1))) return true;
  return false;
}

/** Tiles placed on the active tilemap layer at this frame. */
export function stampedTiles(s: State): number {
  const layer = s.doc.layers.find((l) => l.id === s.ui.activeLayerId && l.kind === 'tilemap') ?? s.doc.layers.find((l) => l.kind === 'tilemap');
  const cel = layer ? celAt(layer, s.ui.frame) : undefined;
  const d = cel ? s.doc.drawings[cel.drawingId] : undefined;
  if (!d || d.kind !== 'tilemap') return 0;
  let n = 0;
  for (const v of d.cells) if (cellKey(v)) n++;
  return n;
}

/** "Show me how" for the edge: a wave right across the tile that lines up with itself where it wraps. */
function drawDemoWave(): boolean {
  const c = /^#([0-9a-f]{6})/i.exec(store().get().ui.color)?.[1] ?? '2f7d4a';
  const rgb = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (
    editActiveDrawing('Draw pixels', 'pixel', (d) => {
      const px = new Uint8ClampedArray(d.pixels);
      const amp = Math.max(1, Math.floor(d.height / 8));
      for (let x = 0; x < d.width; x++) {
        const y = Math.floor(d.height / 2) + Math.round(Math.sin((2 * Math.PI * x) / d.width) * amp);
        px.set([rgb[0], rgb[1], rgb[2], 255], (y * d.width + x) * 4);
      }
      d.pixels = px;
    }) === 'ok'
  );
}

/** "Show me how" for stamping: a row of the tile along the map. */
function stampDemo(): boolean {
  const key = getTileUi().brush || store().get().doc.tileset?.tiles[0]?.key || 0;
  if (!key) return false;
  return (
    editActiveDrawing('Paint tiles', 'tilemap', (d) => {
      const y = Math.max(0, d.rows - 1);
      const cells = new Uint32Array(d.cells);
      for (let x = 0; x < d.columns; x++) cells[y * d.columns + x] = makeCell(key);
      d.cells = cells;
    }) === 'ok'
  );
}

export const TILES_QUEST: Quest = {
  id: 'tiles',
  title: 'Tiles',
  summary: 'Draw a tile that repeats without a seam, then paint a little level with it.',
  minutes: 4,
  icon: 'tiles',
  badge: { id: 'level-builder', name: 'Level Builder', icon: 'tiles', color: '--mint' },
  requires: ['first-animation'],
  finish: 'A seamless tile and a level made of it. Add more tiles (grass, walls, water) and export the lot for your game with File, Export tileset.',
  prepare: ensureTilePage,
  ready: hasPixelLayer,
  steps: [
    {
      id: 'make',
      say: 'Make a tile: in the Tileset panel, press + (New tile).',
      why: 'A tile is a small square picture, like a patch of grass. You draw it once and use it everywhere.',
      target: SEL.newTile,
      enter: () => showPanel('tileset'),
      done: (c) => c.ran.has('tiles.new') || c.ran.has('tiles.newAndDraw') || tileCount() > (c.entry.state.doc.tileset?.tiles.length ?? 0),
      show: () => void ops.newTile(),
      help: 'tileset',
    },
    {
      id: 'open',
      say: 'Double-click your tile to draw it. Tile mode comes on: the tile repeats all round.',
      why: 'Tile mode (Shift+T) shows copies on every side, so you can see where the edges meet.',
      target: SEL.tiles,
      done: () => !!ops.editingTileKey() && tileModeOn(),
      show: () => {
        const key = getTileUi().brush || store().rootDoc().tileset?.tiles[0]?.key;
        if (!key) return;
        ops.editTile(key);
        if (!tileModeOn()) setTileUi({ tileMode: true });
        store().setUi({ tool: 'pencil' });
      },
      hint: 'If it is open but not repeating, press Shift+T to turn tile mode on.',
      help: 'tile-mode',
    },
    {
      id: 'edge',
      say: 'Pick the pencil (P) and draw a line off the right edge. Watch it carry on from the left.',
      why: 'Drawing wraps round in tile mode, so the edges always match. That is a seamless tile.',
      target: SEL.canvas,
      enter: () => {
        if (ops.editingTileKey()) store().setUi({ tool: 'pencil' });
      },
      done: (c) => {
        const d = openTileDrawing(c.state.doc, c.state.ui.frame);
        return !!d && c.edits.length > 0 && paintsAcrossEdge(d);
      },
      show: () => void drawDemoWave(),
      hint: 'Start near the middle and drag straight past the edge of the tile. Top to bottom works too.',
      help: 'tile-mode',
    },
    {
      id: 'done',
      say: 'Press Done above the canvas (or Ctrl+Enter) to put the tile back.',
      target: SEL.done,
      done: (c) => c.ran.has('tiles.done') || (!ops.editingTileKey() && tileCount() > 0),
      show: 'tiles.done',
      help: 'tileset',
    },
    {
      id: 'layer',
      say: 'Add a tilemap layer: Draw menu, then Add a tilemap layer.',
      why: 'A tilemap layer is a grid you paint with tiles instead of colours. Game levels are made of them.',
      target: SEL.menu,
      done: (c) => c.state.doc.layers.some((l) => l.kind === 'tilemap'),
      show: 'tiles.addLayer',
      help: 'tilemaps',
    },
    {
      id: 'stamp',
      say: 'With the tile brush (B), click a few times on the canvas to stamp your tile.',
      why: 'Drag to paint a row. Change the tile later and every copy changes with it.',
      target: SEL.canvas,
      enter: () => {
        const key = getTileUi().brush || store().get().doc.tileset?.tiles[0]?.key;
        if (key) ops.pickTile(key);
      },
      done: (c) => stampedTiles(c.state) >= 3,
      show: () => void stampDemo(),
      hint: 'Three tiles is enough. Side by side they join up with no seam.',
      help: 'tilemaps',
    },
  ],
};

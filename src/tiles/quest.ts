// "Tiles": make a tile, draw it with tile mode on, paint across its edge so it repeats without a seam, then stamp it
// on a tilemap layer. Listed in src/quests/library.ts after Shade and shine.
import { celAt, drawingAt, pixelGrid } from '../core/doc';
import type { Doc, PixelDrawing, PixelLayer } from '../core/format';
import { gridPixels, setGridPixels } from '../core/pixelBounds';
import { store, type State } from '../core/store';
import type { Quest } from '../quests/types';
import { freshPage } from '../quests/actions';
import { hasPixelLayer } from '../quests/predicates';
import { PRESETS, docFromPreset } from '../ui/presets';
import { showPanel } from '../ui/dock';
import { activeGrid, editActiveDrawing } from '../tools/edit';
import { cellKey, makeCell } from './model';
import * as ops from './ops';
import { getTileUi, setTileUi, tileModeOn } from './state';
import { questWord } from '../words/quests';

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

/** A pixel drawing as a whole-grid one (it holds only its painted block), so edges are the grid's edges. */
export function onWholeGrid(doc: Doc, layer: PixelLayer, d: PixelDrawing): PixelDrawing {
  const g = pixelGrid(doc, layer);
  return { ...d, x: 0, y: 0, width: g.width, height: g.height, pixels: gridPixels(d, g.width, g.height) };
}

/** The tile being drawn (on the canvas, while a tile is open), as the whole tile. */
function openTileDrawing(doc: Doc, frame: number): PixelDrawing | null {
  if (!ops.editingTileKey()) return null;
  const layer = doc.layers.find((l) => l.kind === 'pixel');
  const d = layer ? drawingAt(doc, layer, frame) : undefined;
  return layer?.kind === 'pixel' && d && d.kind === 'pixel' ? onWholeGrid(doc, layer, d) : null;
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
export function drawDemoWave(): boolean {
  const c = /^#([0-9a-f]{6})/i.exec(store().get().ui.color)?.[1] ?? '2f7d4a';
  const rgb = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  const g = activeGrid();
  if (!g) return false;
  return (
    editActiveDrawing('Draw pixels', 'pixel', (d) => {
      // The drawing holds only its painted block, so the wave is laid on the whole tile and trimmed again.
      const px = new Uint8ClampedArray(gridPixels(d, g.width, g.height));
      const amp = Math.max(1, Math.floor(g.height / 8));
      for (let x = 0; x < g.width; x++) {
        const y = Math.floor(g.height / 2) + Math.round(Math.sin((2 * Math.PI * x) / g.width) * amp);
        px.set([rgb[0], rgb[1], rgb[2], 255], (y * g.width + x) * 4);
      }
      setGridPixels(d, px, g.width, g.height);
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
  title: questWord('quest.tiles.title'),
  summary: questWord('quest.tiles.summary'),
  minutes: 4,
  icon: 'tiles',
  badge: { id: 'level-builder', name: questWord('quest.tiles.badge'), icon: 'tiles', color: '--mint' },
  // A first quest in its own right for tile people, so it needs nothing before it.
  features: ['tiles'],
  requires: [],
  finish: questWord('quest.tiles.finish'),
  prepare: ensureTilePage,
  ready: hasPixelLayer,
  steps: [
    {
      id: 'make',
      say: questWord('quest.tiles.make.say'),
      why: questWord('quest.tiles.make.why'),
      target: SEL.newTile,
      enter: () => showPanel('tileset'),
      done: (c) => c.ran.has('tiles.new') || c.ran.has('tiles.newAndDraw') || tileCount() > (c.entry.state.doc.tileset?.tiles.length ?? 0),
      show: () => void ops.newTile(),
      help: 'tileset',
    },
    {
      id: 'open',
      say: questWord('quest.tiles.open.say'),
      why: questWord('quest.tiles.open.why'),
      target: SEL.tiles,
      done: () => !!ops.editingTileKey() && tileModeOn(),
      show: () => {
        const key = getTileUi().brush || store().rootDoc().tileset?.tiles[0]?.key;
        if (!key) return;
        ops.editTile(key);
        if (!tileModeOn()) setTileUi({ tileMode: true });
        store().setUi({ tool: 'pencil' });
      },
      hint: questWord('quest.tiles.open.hint'),
      help: 'tile-mode',
    },
    {
      id: 'edge',
      say: questWord('quest.tiles.edge.say'),
      why: questWord('quest.tiles.edge.why'),
      target: SEL.canvas,
      enter: () => {
        if (ops.editingTileKey()) store().setUi({ tool: 'pencil' });
      },
      done: (c) => {
        const d = openTileDrawing(c.state.doc, c.state.ui.frame);
        return !!d && c.edits.length > 0 && paintsAcrossEdge(d);
      },
      show: () => void drawDemoWave(),
      hint: questWord('quest.tiles.edge.hint'),
      help: 'tile-mode',
    },
    {
      id: 'done',
      say: questWord('quest.tiles.done.say'),
      target: SEL.done,
      done: (c) => c.ran.has('tiles.done') || (!ops.editingTileKey() && tileCount() > 0),
      show: 'tiles.done',
      help: 'tileset',
    },
    {
      id: 'layer',
      say: questWord('quest.tiles.layer.say'),
      why: questWord('quest.tiles.layer.why'),
      target: SEL.menu,
      done: (c) => c.state.doc.layers.some((l) => l.kind === 'tilemap'),
      show: 'tiles.addLayer',
      help: 'tilemaps',
    },
    {
      id: 'stamp',
      say: questWord('quest.tiles.stamp.say'),
      why: questWord('quest.tiles.stamp.why'),
      target: SEL.canvas,
      enter: () => {
        const key = getTileUi().brush || store().get().doc.tileset?.tiles[0]?.key;
        if (key) ops.pickTile(key);
      },
      done: (c) => stampedTiles(c.state) >= 3,
      show: () => void stampDemo(),
      hint: questWord('quest.tiles.stamp.hint'),
      help: 'tilemaps',
    },
  ],
};

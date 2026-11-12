/**
 * The tile tools, for tilemap layers: Tile brush [B], Tile rectangle [R], Tile fill [G], Tile eraser [E] and Pick tile
 * [I]. They share keys with the drawing tools, which only work on other kinds of layer, so B is always "paint".
 *
 * A gesture works on a copy of the map shown live on the canvas and lands as one undo step when the pointer lifts,
 * like the pixel tools.
 */
import { drawingAt, findLayer, tileOrigin, tilemapGrid } from '../core/doc';
import type { Doc, TilemapDrawing, TilemapLayer } from '../core/format';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { pixelCanvas } from '../core/render';
import { drawTileAt } from '../core/tilemap';
import { store } from '../core/store';
import { getHover, setLive } from '../canvas/controller';
import { activeLayer, EDIT_HINTS, editActiveDrawing } from '../tools/edit';
import { cellFlags, clampGrid, cellKey, cellLine, docToCell, fillCellRect, findTile, floodCells, getCell, makeCell, setCell, tileDrawingAt } from './model';
import { setTileGrid } from './ops';
import { getTileUi, gridHandleOn, setTileUi, subscribeTileUi } from './state';
import { TileToolOptions } from './TileToolOptions';

/** The tilemap layer being drawn on, or a hint about why not. */
function mapLayer(ctx: ToolContext): TilemapLayer | null {
  const { layer, problem } = activeLayer();
  if (problem) {
    ctx.hint(EDIT_HINTS[problem]);
    return null;
  }
  if (!layer || layer.kind !== 'tilemap') {
    ctx.hint('Tile tools work on tilemap layers. Add one with Layer > Add a tilemap layer.');
    return null;
  }
  return layer;
}

/** The cell value the brush paints, or 0 with a hint when there's nothing to paint with yet. */
function brushValue(ctx: ToolContext): number {
  const { doc } = store().get();
  const ts = doc.tileset;
  if (!ts?.tiles.length) {
    ctx.hint('There are no tiles yet. Make one in the Tileset panel (New tile).');
    return 0;
  }
  let { brush, flags } = getTileUi();
  if (!findTile(ts, brush)) {
    brush = ts.tiles[0].key;
    setTileUi({ brush });
  }
  if (flags && ts.tileWidth !== ts.tileHeight) flags = cellFlags(flags) & ~0x20000000;
  return makeCell(brush, flags);
}

/** A map edit in progress: a private copy of the cells, shown live, committed as one step. */
class MapSession {
  readonly columns: number;
  readonly rows: number;
  readonly cells: Uint32Array;
  private base: TilemapDrawing | null;
  changed = false;

  constructor(
    readonly doc: Doc,
    readonly layer: TilemapLayer,
    frame: number,
  ) {
    const d = drawingAt(doc, layer, frame);
    if (d && d.kind === 'tilemap') {
      this.base = d;
      this.columns = d.columns;
      this.rows = d.rows;
      this.cells = new Uint32Array(d.cells);
    } else {
      const g = tilemapGrid(doc, layer);
      this.base = null;
      this.columns = g.columns;
      this.rows = g.rows;
      this.cells = new Uint32Array(g.columns * g.rows);
    }
  }

  cell(x: number, y: number) {
    return docToCell(this.doc, this.layer, x, y);
  }

  set(x: number, y: number, v: number): void {
    if (setCell(this.cells, this.columns, this.rows, x, y, v)) this.changed = true;
  }

  /** Shows the cells as they are now. A fresh array each time, so the map's bitmap knows what changed. */
  flush(): void {
    setLive({ layerId: this.layer.id, kind: 'tilemap', drawing: { id: this.base?.id ?? `live-${this.layer.id}`, kind: 'tilemap', columns: this.columns, rows: this.rows, cells: new Uint32Array(this.cells) } });
  }

  commit(label: string, ctx: ToolContext): void {
    setLive(null);
    if (!this.changed) return;
    const cells = this.cells;
    const { columns, rows } = this;
    const r = editActiveDrawing(label, 'tilemap', (d) => {
      d.columns = columns;
      d.rows = rows;
      d.cells = cells;
    });
    if (r !== 'ok') ctx.hint(EDIT_HINTS[r]);
  }

  discard(): void {
    setLive(null);
  }
}

/** What's under a document position on the active tilemap layer. */
function cellUnder(x: number, y: number): number {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId);
  if (!layer || layer.kind !== 'tilemap') return 0;
  const d = drawingAt(doc, layer, ui.frame);
  if (!d || d.kind !== 'tilemap') return 0;
  const c = docToCell(doc, layer, x, y);
  return getCell(d, c.x, c.y);
}

/** Picks up the tile (and how it is turned) under the pointer. */
function pickAt(e: ToolPointer, ctx: ToolContext, speak: boolean): boolean {
  const v = cellUnder(e.x, e.y);
  if (!v) {
    if (speak) ctx.hint("There's no tile there to pick up.");
    return false;
  }
  setTileUi({ brush: cellKey(v), flags: cellFlags(v) });
  return true;
}

/** The slot rectangle on the active layer, in document pixels. */
function slotRect(doc: Doc, layer: TilemapLayer, x: number, y: number) {
  const tw = (doc.tileset?.tileWidth ?? 16) * layer.pixelSize;
  const th = (doc.tileset?.tileHeight ?? 16) * layer.pixelSize;
  const o = tileOrigin(doc, layer.pixelSize);
  return { x: o.x + x * tw, y: o.y + y * th, w: tw, h: th };
}

/** The brush tile, see-through, over the slot under the pointer (or over a rectangle of slots). */
function drawGhost(g: CanvasRenderingContext2D, ctx: ToolContext, from?: { x: number; y: number }, erase = false): void {
  const hover = getHover();
  const { doc } = store().get();
  const layer = findLayer(doc, store().get().ui.activeLayerId);
  if (!hover || !layer || layer.kind !== 'tilemap') return;
  const c = docToCell(doc, layer, hover.x, hover.y);
  const a = from ?? c;
  const x0 = Math.min(a.x, c.x);
  const y0 = Math.min(a.y, c.y);
  const x1 = Math.max(a.x, c.x);
  const y1 = Math.max(a.y, c.y);
  const r0 = slotRect(doc, layer, x0, y0);
  const { brush, flags } = getTileUi();
  const tile = findTile(doc.tileset, brush);
  const img = tile && !erase ? tileDrawingAt(doc, tile, store().get().ui.frame) : undefined;
  g.save();
  if (img) {
    g.globalAlpha = 0.6;
    g.imageSmoothingEnabled = false;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawTileAt(g, pixelCanvas(img), flags, r0.x + (x - x0) * r0.w, r0.y + (y - y0) * r0.h, r0.w, r0.h);
  }
  g.globalAlpha = 1;
  g.lineWidth = 2 / ctx.zoom;
  g.strokeStyle = erase ? '#ff6f91' : '#5ab8ff';
  g.strokeRect(r0.x, r0.y, (x1 - x0 + 1) * r0.w, (y1 - y0 + 1) * r0.h);
  g.restore();
}

// ---------------------------------------------------------------- brush and eraser

function paintTool(erase: boolean): Tool {
  let s: MapSession | null = null;
  let last: { x: number; y: number } | null = null;
  let value = 0;
  let picking = false;
  let lastEnd: { layerId: string; x: number; y: number } | null = null;
  const stampLine = (to: { x: number; y: number }) => {
    if (!s) return;
    for (const p of last ? cellLine(last.x, last.y, to.x, to.y) : [to]) s.set(p.x, p.y, value);
    last = to;
    s.flush();
  };
  return {
    id: erase ? 'tile-eraser' : 'tile-brush',
    group: 'draw',
    groupAt: erase ? 5 : 4,
    label: erase ? 'Tile eraser' : 'Tile brush',
    icon: erase ? 'eraser' : 'brush',
    key: erase ? 'e' : 'b',
    layers: ['tilemap'],
    order: erase ? 21 : 11,
    help: 'tilemaps',
    cursor: 'crosshair',
    options: TileToolOptions,
    down(e, ctx) {
      // Alt+click picks up a tile, like the eyedropper.
      if (!erase && e.alt) {
        picking = true;
        pickAt(e, ctx, true);
        return;
      }
      const layer = mapLayer(ctx);
      if (!layer) return;
      value = erase ? 0 : brushValue(ctx);
      if (!erase && !value) return;
      const { doc, ui } = store().get();
      s = new MapSession(doc, layer, ui.frame);
      const here = s.cell(e.x, e.y);
      // Shift+click: a straight line from where the last stroke ended.
      last = e.shift && lastEnd?.layerId === layer.id ? { x: lastEnd.x, y: lastEnd.y } : null;
      stampLine(here);
    },
    move(e, ctx) {
      if (picking) return void pickAt(e, ctx, false);
      if (s) stampLine(s.cell(e.x, e.y));
    },
    up(_e, ctx) {
      picking = false;
      if (!s) return;
      if (last) lastEnd = { layerId: s.layer.id, x: last.x, y: last.y };
      s.commit(erase ? 'Erase tiles' : 'Paint tiles', ctx);
      s = null;
      last = null;
    },
    cancel() {
      s?.discard();
      s = null;
      last = null;
      picking = false;
    },
    overlay(g, ctx) {
      if (!s) drawGhost(g, ctx, undefined, erase);
    },
  };
}

export const tileBrushTool = paintTool(false);
export const tileEraserTool = paintTool(true);

// ---------------------------------------------------------------- rectangle

let rect: { s: MapSession; from: { x: number; y: number }; value: number } | null = null;

export const tileRectTool: Tool = {
  id: 'tile-rect',
  group: 'shapes',
  groupAt: 5,
  label: 'Tile rectangle',
  icon: 'rect',
  key: 'r',
  layers: ['tilemap'],
  order: 12,
  help: 'tilemaps',
  cursor: 'crosshair',
  options: TileToolOptions,
  down(e, ctx) {
    const layer = mapLayer(ctx);
    if (!layer) return;
    // Alt+drag clears a rectangle instead.
    const value = e.alt ? 0 : brushValue(ctx);
    if (!e.alt && !value) return;
    const { doc, ui } = store().get();
    const s = new MapSession(doc, layer, ui.frame);
    rect = { s, from: s.cell(e.x, e.y), value };
  },
  move() {},
  up(e, ctx) {
    if (!rect) return;
    const { s, from, value } = rect;
    const to = s.cell(e.x, e.y);
    if (fillCellRect(s.cells, s.columns, s.rows, from.x, from.y, to.x, to.y, value)) s.changed = true;
    rect = null;
    s.commit(value ? 'Fill a rectangle with tiles' : 'Clear a rectangle of tiles', ctx);
  },
  cancel() {
    rect?.s.discard();
    rect = null;
  },
  overlay(g, ctx) {
    drawGhost(g, ctx, rect?.from, rect ? !rect.value : false);
  },
};

// ---------------------------------------------------------------- fill

export const tileFillTool: Tool = {
  id: 'tile-fill',
  group: 'draw',
  groupAt: 6,
  label: 'Tile fill',
  icon: 'fill',
  key: 'g',
  layers: ['tilemap'],
  order: 13,
  help: 'tilemaps',
  cursor: 'crosshair',
  options: TileToolOptions,
  down(e, ctx) {
    const layer = mapLayer(ctx);
    if (!layer) return;
    const value = brushValue(ctx);
    if (!value) return;
    const { doc, ui } = store().get();
    const s = new MapSession(doc, layer, ui.frame);
    const c = s.cell(e.x, e.y);
    if (c.x < 0 || c.y < 0 || c.x >= s.columns || c.y >= s.rows) return ctx.hint('Click inside the map to fill.');
    if (floodCells(s.cells, s.columns, s.rows, c.x, c.y, value)) s.changed = true;
    else ctx.hint('That area already has this tile.');
    s.commit('Fill with tiles', ctx);
  },
  overlay(g, ctx) {
    drawGhost(g, ctx);
  },
};

// ---------------------------------------------------------------- picker

export const tilePickerTool: Tool = {
  id: 'tile-picker',
  group: 'extras',
  groupAt: 4,
  label: 'Pick tile',
  icon: 'eyedropper',
  key: 'i',
  layers: ['tilemap'],
  order: 70,
  help: 'tilemaps',
  cursor: 'crosshair',
  options: TileToolOptions,
  down(e, ctx) {
    pickAt(e, ctx, true);
  },
  move(e, ctx) {
    pickAt(e, ctx, false);
  },
};

// ---------------------------------------------------------------- the grid handle

/** Where the first tile edge sits on the active tilemap layer, in document pixels (the handle's place). */
function gridHandleAt(doc: Doc, layer: TilemapLayer): { x: number; y: number } {
  const ts = doc.tileset;
  return { x: (ts?.gridX ?? 0) * layer.pixelSize, y: (ts?.gridY ?? 0) * layer.pixelSize };
}

let gridDrag: { gx: number; gy: number } | null = null;

/** The grid start (art pixels, kept inside the first tile) for a pointer position. */
function gridFromPointer(doc: Doc, layer: TilemapLayer, e: ToolPointer): { gx: number; gy: number } {
  const ts = doc.tileset;
  return { gx: clampGrid(e.x / layer.pixelSize, ts?.tileWidth ?? 16), gy: clampGrid(e.y / layer.pixelSize, ts?.tileHeight ?? 16) };
}

function handleLayer(): { doc: Doc; layer: TilemapLayer } | null {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId);
  return layer && layer.kind === 'tilemap' && doc.tileset ? { doc, layer } : null;
}

// The handle only shows (and only grabs) with Alt held or while the "Where the tile grid starts" form is open, so a
// click at the stage corner paints. The overlay is redrawn when Alt goes down or up, and when the form opens.
let altHeld = false;
let overlayCtx: ToolContext | null = null;
const handleOn = (): boolean => gridHandleOn(altHeld, getTileUi().sizeForm);
const setAlt = (on: boolean): void => {
  if (on === altHeld) return;
  altHeld = on;
  overlayCtx?.requestOverlay();
};
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (ev) => ev.key === 'Alt' && setAlt(true));
  window.addEventListener('keyup', (ev) => ev.key === 'Alt' && setAlt(false));
  window.addEventListener('blur', () => setAlt(false));
}
subscribeTileUi(() => overlayCtx?.requestOverlay());

/**
 * Gives a tile tool the grid handle: a round handle on the first tile corner that you drag to say where the tile
 * grid starts. It is there with Alt held, or while the grid form is open. Anything not on the handle goes to the
 * tool as usual.
 */
function withGridHandle(tool: Tool): Tool {
  const near = (e: ToolPointer, ctx: ToolContext): boolean => {
    if (!gridHandleOn(e.alt, getTileUi().sizeForm)) return false;
    const h = handleLayer();
    if (!h) return false;
    const p = gridHandleAt(h.doc, h.layer);
    return Math.hypot(e.x - p.x, e.y - p.y) * ctx.zoom <= 9;
  };
  return {
    ...tool,
    down(e, ctx) {
      const h = handleLayer();
      if (h && near(e, ctx)) {
        gridDrag = gridFromPointer(h.doc, h.layer, e);
        ctx.requestOverlay();
        return;
      }
      tool.down?.(e, ctx);
    },
    move(e, ctx) {
      const h = handleLayer();
      if (gridDrag && h) {
        gridDrag = gridFromPointer(h.doc, h.layer, e);
        ctx.requestOverlay();
        return;
      }
      tool.move?.(e, ctx);
    },
    up(e, ctx) {
      if (gridDrag) {
        const { gx, gy } = gridDrag;
        gridDrag = null;
        const was = store().get().doc.tileset;
        if (gx !== (was?.gridX ?? 0) || gy !== (was?.gridY ?? 0)) {
          setTileGrid(gx, gy);
          ctx.hint(gx || gy ? `The tile grid now starts ${gx} across and ${gy} down. Undo puts it back.` : 'The tile grid starts at the corner again.');
        }
        ctx.requestOverlay();
        return;
      }
      tool.up?.(e, ctx);
    },
    hover(e, ctx) {
      overlayCtx = ctx;
      altHeld = e.alt;
      tool.hover?.(e, ctx);
      ctx.requestOverlay();
    },
    cancel(ctx) {
      gridDrag = null;
      tool.cancel?.(ctx);
    },
    leave(ctx) {
      gridDrag = null;
      if (overlayCtx === ctx) overlayCtx = null;
      tool.leave?.(ctx);
    },
    overlay(g, ctx) {
      tool.overlay?.(g, ctx);
      overlayCtx = ctx;
      const h = handleLayer();
      if (!h || (!gridDrag && !handleOn())) return;
      const { doc, layer } = h;
      const ps = layer.pixelSize;
      const ts = doc.tileset!;
      const p = gridDrag ? { x: gridDrag.gx * ps, y: gridDrag.gy * ps } : gridHandleAt(doc, layer);
      const hover = getHover();
      const hot = !!gridDrag || (!!hover && Math.hypot(hover.x - p.x, hover.y - p.y) * ctx.zoom <= 9);
      g.save();
      if (gridDrag) {
        // While dragging, the grid lines show where the tiles will fall.
        const tw = ts.tileWidth * ps;
        const th = ts.tileHeight * ps;
        g.lineWidth = 1 / ctx.zoom;
        g.strokeStyle = 'rgba(90, 184, 255, 0.8)';
        g.beginPath();
        for (let x = p.x - Math.ceil(p.x / tw) * tw; x <= doc.width; x += tw) (g.moveTo(x, 0), g.lineTo(x, doc.height));
        for (let y = p.y - Math.ceil(p.y / th) * th; y <= doc.height; y += th) (g.moveTo(0, y), g.lineTo(doc.width, y));
        g.stroke();
      }
      const r = (hot ? 7 : 5) / ctx.zoom;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fillStyle = hot ? '#5ab8ff' : 'rgba(255, 255, 255, 0.92)';
      g.fill();
      g.lineWidth = 2 / ctx.zoom;
      g.strokeStyle = '#1d1b26';
      g.stroke();
      g.restore();
    },
  };
}

for (const t of [tileBrushTool, tileRectTool, tileFillTool, tileEraserTool, tilePickerTool]) registerTool(withGridHandle(t));

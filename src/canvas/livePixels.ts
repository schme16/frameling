/**
 * Draws the live preview of a pixel layer. A whole picture (a selection being moved) is drawn as it is. A stroke in
 * progress is sparse: the live canvas holds only the 128 x 128 tiles the stroke touched, and the rest of the layer is
 * the drawing as it was, drawn from its cached picture, so nothing big is uploaded when a stroke starts.
 *
 * The old picture is drawn in plain rectangles around the tiles, and each tile on its own, every piece a simple clip
 * snapped to whole screen pixels, so they meet with no seam. One thing the pieces cannot match is a screen pixel whose
 * middle falls exactly on the edge between two art pixels (zoom 150% on a whole-pixel pan, say): the screen picks one of
 * the two art pixels and a clipped draw can pick the other from the finished, unclipped picture. Those screens (and a
 * turned camera) get the whole picture instead (`fill`), which is drawn in one piece like the finished one. That holds far
 * out too: where a touched tile's edge lands on a screen middle (30%, 25%, 15%) the picture is filled, and elsewhere far
 * out no touched edge lands on one (to within a few thousandths of a screen pixel), so the sparse preview and the finished
 * picture are the same pixels.
 */
import type { Live } from './controller';
import { drawDrawing, type Ctx2D } from '../core/render';

type PixelLive = Extract<Live, { kind: 'pixel' }>;
type R = { x: number; y: number; w: number; h: number };

/** The rectangles of `box` that the tiles leave free (tiles sit on a lattice, so this is a few strips). */
export function around(box: R, tiles: readonly R[]): R[] {
  const rows = new Map<number, R[]>();
  for (const t of tiles) {
    const list = rows.get(t.y);
    if (list) list.push(t);
    else rows.set(t.y, [t]);
  }
  const out: R[] = [];
  const x1 = box.x + box.w;
  const y1 = box.y + box.h;
  let top = box.y;
  const add = (x: number, y: number, xe: number, ye: number) => {
    if (xe > x && ye > y) out.push({ x, y, w: xe - x, h: ye - y });
  };
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(y)!.sort((a, b) => a.x - b.x);
    const yt = Math.max(box.y, y);
    const yb = Math.min(y1, y + row[0].h);
    if (yb <= box.y || yt >= y1) continue;
    add(box.x, top, x1, yt);
    let x = box.x;
    for (const t of row) {
      add(x, yt, Math.min(x1, t.x), yb);
      x = Math.max(x, t.x + t.w);
    }
    add(x, yt, x1, yb);
    top = Math.max(top, yb);
  }
  add(box.x, top, x1, y1);
  return out;
}

/** Below this many screen pixels per art pixel the sparse preview is used whatever the pan. */
export const SPARSE_BELOW = 1 / 3;

/** How close to a screen pixel's middle an edge counts as on it. The two draws round their float maths a hair apart, so this sits above that noise. */
const NEAR = 3e-4;

/**
 * True when an edge between art pixels lands on the middle of a screen pixel along one axis: `scale` screen pixels per
 * art pixel, `offset` the screen position of art pixel 0, `size` the screen's length. Magnified, a screen pixel that is
 * merely very close to an edge can go either way too (so the test is loose); zoomed out the edges are so many that over
 * the whole screen only an exact landing (zoom 50%, 35%...) is told apart.
 *
 * `span` (art pixel edges, first to last) limits the look to the edges inside it. The live preview only has to match
 * where it draws a touched tile: everywhere else it draws the old picture whole-canvas, the same canvas the finished
 * one is drawn from. Far out (under SPARSE_BELOW) it is only asked about that span, which is a few dozen edges, so a
 * far-out zoom that lands exactly (30%, 25%, 15%) can be told apart and the whole screen is not scanned. With no span,
 * far out, it says no.
 */
export function edgeOnMiddle(scale: number, offset: number, size: number, span?: { from: number; to: number }): boolean {
  const mag = Math.abs(scale);
  const far = mag < SPARSE_BELOW;
  if (far && !span) return false;
  const tol = mag >= 1 ? 3e-4 : far ? NEAR : 1e-6;
  // A flipped view has a negative scale: the screen's two ends are edges in either order.
  const e0 = (0 - offset) / scale;
  const e1 = (size - offset) / scale;
  let from = Math.floor(Math.min(e0, e1)) - 1;
  let to = Math.ceil(Math.max(e0, e1)) + 1;
  if (far && span) {
    from = Math.max(from, span.from);
    to = Math.min(to, span.to);
  }
  for (let i = from; i <= to; i++) {
    const f = scale * i + offset;
    if (Math.abs(f - Math.floor(f) - 0.5) < tol) return true;
  }
  return false;
}

/** The art pixel edges the live tiles span along each axis (their outer edges, one more each side for the clip's seam), or undefined with no tiles. */
export function tileSpan(tiles: readonly R[]): { x: { from: number; to: number }; y: { from: number; to: number } } | undefined {
  if (!tiles.length) return undefined;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tiles) {
    x0 = Math.min(x0, t.x);
    y0 = Math.min(y0, t.y);
    x1 = Math.max(x1, t.x + t.w);
    y1 = Math.max(y1, t.y + t.h);
  }
  return { x: { from: x0 - 1, to: x1 + 1 }, y: { from: y0 - 1, to: y1 + 1 } };
}

/** Draws the live pixel canvas of a layer, with the layer's transform already set on `g`. */
export function drawLivePixels(g: Ctx2D, lv: PixelLive, pixelSize: number): void {
  g.imageSmoothingEnabled = false;
  let sp = lv.sparse;
  const m = g.getTransform();
  const straight = Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9;
  if (sp) {
    const c = g.canvas as { width: number; height: number };
    const span = tileSpan(sp.tiles);
    if (!straight || edgeOnMiddle(m.a * pixelSize, m.e, c.width, span?.x) || edgeOnMiddle(m.d * pixelSize, m.f, c.height, span?.y)) {
      sp.fill();
      sp = undefined;
    }
  }
  const live = () => g.drawImage(lv.canvas, (lv.x ?? 0) * pixelSize, (lv.y ?? 0) * pixelSize, lv.width * pixelSize, lv.height * pixelSize);
  if (!sp) return live();
  // A screen pixel shows the art pixel under its middle, so a piece's edge falls on the first screen pixel whose middle is past it.
  const edge = (v: number) => Math.ceil(v - 0.5);
  const clipTo = (r: R, draw: () => void) => {
    const xa = edge(m.a * r.x * pixelSize + m.e);
    const xb = edge(m.a * (r.x + r.w) * pixelSize + m.e);
    const ya = edge(m.d * r.y * pixelSize + m.f);
    const yb = edge(m.d * (r.y + r.h) * pixelSize + m.f);
    g.save();
    g.beginPath();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.rect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya));
    g.setTransform(m);
    g.clip();
    draw();
    g.restore();
  };
  const base = sp.base;
  if (base && base.width > 0 && base.height > 0) {
    if (!sp.tiles.length) drawDrawing(g, base, pixelSize);
    else for (const r of around({ x: base.x ?? 0, y: base.y ?? 0, w: base.width, h: base.height }, sp.tiles)) clipTo(r, () => drawDrawing(g, base, pixelSize));
  }
  for (const t of sp.tiles) clipTo(t, live);
}

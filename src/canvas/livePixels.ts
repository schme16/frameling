/**
 * Draws the live preview of a pixel layer. A whole picture (a selection being moved) is drawn as it is. A stroke in
 * progress is sparse: the live canvas holds only the 128 x 128 tiles the stroke touched, and the rest of the layer is
 * the drawing as it was, drawn from its cached picture, so nothing big is uploaded when a stroke starts.
 *
 * The old picture is drawn in plain rectangles around the tiles, and each tile on its own, every piece a simple clip
 * snapped to whole screen pixels, so they meet with no seam. One thing the pieces cannot match is a screen pixel whose
 * middle falls exactly on the edge between two art pixels (zoom 150% on a whole-pixel pan, say): the screen picks one of
 * the two art pixels and a clipped draw can pick the other from the finished, unclipped picture. Those screens (and a
 * turned camera) get the whole picture instead (`fill`), which is drawn in one piece like the finished one. Zoomed far
 * out, a rare screen pixel that only nearly lands on an edge may still show its neighbour until the stroke ends.
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

/**
 * True when an edge between art pixels lands on the middle of a screen pixel along one axis: `scale` screen pixels per
 * art pixel, `offset` the screen position of art pixel 0, `size` the screen's length. Magnified, a screen pixel that is
 * merely very close to an edge can go either way too (so the test is loose); zoomed out the edges are so many that only an
 * exact landing (zoom 50%, 35%...) is told apart, and the odd near miss is left to the aliasing.
 */
export function edgeOnMiddle(scale: number, offset: number, size: number): boolean {
  // Far out (a big drawing fitted to the screen) a screen pixel stands for three or more art pixels and which of them it
  // shows is already arbitrary; this is where the sparse preview matters most, so it is always used.
  if (scale < SPARSE_BELOW) return false;
  const tol = scale >= 1 ? 3e-4 : 1e-6;
  const from = Math.floor(-offset / scale) - 1;
  const to = Math.ceil((size - offset) / scale) + 1;
  for (let i = from; i <= to; i++) {
    const f = scale * i + offset;
    if (Math.abs(f - Math.floor(f) - 0.5) < tol) return true;
  }
  return false;
}

/** Draws the live pixel canvas of a layer, with the layer's transform already set on `g`. */
export function drawLivePixels(g: Ctx2D, lv: PixelLive, pixelSize: number): void {
  g.imageSmoothingEnabled = false;
  let sp = lv.sparse;
  const m = g.getTransform();
  const straight = Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9;
  if (sp) {
    const c = g.canvas as { width: number; height: number };
    if (!straight || edgeOnMiddle(m.a * pixelSize, m.e, c.width) || edgeOnMiddle(m.d * pixelSize, m.f, c.height)) {
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

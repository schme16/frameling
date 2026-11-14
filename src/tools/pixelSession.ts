/**
 * A pixel edit in progress. Nothing is copied when it starts: the drawing's own block is read as it is, and a square
 * tile (128 x 128) is copied only when a stroke first touches it. The live preview (through the canvas's live preview,
 * so nothing touches the document) is sparse: a canvas that covers the drawing's block and whatever has been painted
 * outside it, made on the first painted pixel, which holds only the tiles the stroke has touched (each put on it whole
 * the first time, then only what changed). The canvas draws the rest from the drawing's own cached picture, so a stroke
 * on a big drawing uploads nothing big. Where that cannot be drawn exactly like the finished picture (see
 * canvas/livePixels.ts) the canvas asks for `fill`, which makes it the whole picture. At the end the session commits a
 * brand new pixel array as one undo step.
 */
import type { Doc, PixelDrawing, PixelLayer } from '../core/format';
import { pixelGrid } from '../core/doc';
import { dropPixelCanvas, peekPixelCanvas, pixelCanvas, seedPixelCanvas } from '../core/render';
import { drawingAt } from '../core/doc';
import { setLive } from '../canvas/controller';
import type { PxPt, RGBA } from '../canvas/pixels';
import { activeGrid, editActiveDrawing, type EditResult } from './edit';
import { forgetGrids, setPlaced, trimPixels, unionRect } from '../core/pixelBounds';
import { autoHeldAt } from '../timeline/edit-core';
import { markTracing } from '../canvas/ghost';
import { tileModeOn, wrap } from '../tiles/state';
import { lockedInk, makeMirror, mirrorPoints, type Ink, type Mirror } from '../pixel/ink';
import { docPalette } from '../pixel/palette';
import { getPixelSettings } from '../pixel/settings';
import { pixelSelection } from '../select/pixel-state';

type LiveCanvas = HTMLCanvasElement | OffscreenCanvas;

function makeLiveCanvas(w: number, h: number): LiveCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    try {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c.getContext('2d') ? c : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Tile edge in art pixels (a power of two). A tile is 64 KB. */
const TS = 128;
const SHIFT = 7;
const MASK = TS - 1;
/** How far past the painted area the live canvas grows each time, so a long stroke does not rebuild it on every tile. */
const MARGIN = 256;

export class PixelSession {
  readonly width: number;
  readonly height: number;
  readonly layerId: string;
  readonly pixelSize: number;
  /** The drawing as it was when the session began (read only: it is the drawing's own block). */
  private readonly src: { x: number; y: number; width: number; height: number; pixels: Uint8ClampedArray };
  /** Tiles copied from the block on first touch, in reading order over the grid. */
  private readonly tiles: (Uint8ClampedArray | undefined)[];
  private readonly images: (ImageData | undefined)[];
  /** Tiles already on the live canvas (whole), and where they are on the grid. */
  private readonly onCanvas: Uint8Array;
  private readonly liveTiles: { x: number; y: number; w: number; h: number }[] = [];
  /** The drawing as it was, shown outside the live tiles. */
  private readonly baseDrawing: PixelDrawing | null;
  /** The live canvas holds the whole picture (the old drawing under the tiles), not only the tiles. */
  private filled = false;
  private readonly tilesAcross: number;
  private canvas: LiveCanvas | null = null;
  /** Where the live canvas sits on the grid. */
  private cx = 0;
  private cy = 0;
  private cw = 0;
  private ch = 0;
  private dirty: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Everything changed since the session began (flush does not clear it), so commit writes only this and the old block. */
  private touched: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Where the drawing's block sat when the session began (none when a new drawing starts). */
  private was: { x?: number; y?: number; width: number; height: number } = { width: 0, height: 0 };
  changed = false;
  /** Mirror drawing, read once when the session starts. */
  readonly mirror: Mirror;
  /** Turns an ink into one that snaps to the palette, when the layer has its palette lock on. */
  readonly lock: (ink: Ink) => Ink;
  /** The selection: when there is one, painting stays inside it. */
  private clip: Uint8Array | null = null;
  private pts = new Int32Array(8);
  private rgba = new Uint8Array(4);
  /** One pixel of the old picture, handed to inks. */
  private basePx = new Uint8ClampedArray(4);

  /** Painting on a frame that only carries the last drawing along: this starts a new drawing there. */
  private fresh = false;

  constructor(doc: Doc, layer: PixelLayer, frame: number, opts: { mirror?: boolean; adds?: boolean } = {}) {
    const d = drawingAt(doc, layer, frame);
    this.fresh = !!opts.adds && !!autoHeldAt(layer, frame);
    if (this.fresh) markTracing(layer.id, frame);
    const g = pixelGrid(doc, layer);
    this.width = g.width;
    this.height = g.height;
    // The drawing holds only what is painted; its block is read where it is and copied a tile at a time.
    const old = d && d.kind === 'pixel' && !this.fresh && d.width > 0 && d.height > 0 && d.pixels.length === d.width * d.height * 4 ? d : null;
    if (old) this.was = { x: old.x, y: old.y, width: old.width, height: old.height };
    this.src = old ? { x: old.x ?? 0, y: old.y ?? 0, width: old.width, height: old.height, pixels: old.pixels } : { x: 0, y: 0, width: 0, height: 0, pixels: new Uint8ClampedArray(0) };
    this.tilesAcross = Math.ceil(g.width / TS);
    const n = this.tilesAcross * Math.ceil(g.height / TS);
    this.tiles = new Array(n);
    this.images = new Array(n);
    this.onCanvas = new Uint8Array(n);
    this.baseDrawing = old;
    this.layerId = layer.id;
    this.pixelSize = layer.pixelSize;
    const ps = getPixelSettings();
    this.mirror = makeMirror(opts.mirror === false ? 'off' : ps.symmetry, this.width, this.height, ps.axisX, ps.axisY);
    const pal = layer.paletteLock ? docPalette(doc) : null;
    this.lock = pal ? (ink) => lockedInk(ink, pal) : (ink) => ink;
    const sel = pixelSelection();
    if (sel && sel.width === this.width && sel.height === this.height) this.clip = sel.bits;
  }

  /** The old picture's pixel (x, y) written into `out` at `o`. */
  private readBase(x: number, y: number, out: Uint8ClampedArray | Uint8Array, o: number): void {
    const s = this.src;
    const bx = x - s.x;
    const by = y - s.y;
    if (bx >= 0 && by >= 0 && bx < s.width && by < s.height) {
      const i = (by * s.width + bx) * 4;
      out[o] = s.pixels[i];
      out[o + 1] = s.pixels[i + 1];
      out[o + 2] = s.pixels[i + 2];
      out[o + 3] = s.pixels[i + 3];
    } else out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
  }

  /** Fills a tile with the old picture. */
  private fillTile(t: Uint8ClampedArray, tx: number, ty: number): void {
    const s = this.src;
    t.fill(0);
    const gx = tx << SHIFT;
    const gy = ty << SHIFT;
    const x0 = Math.max(gx, s.x);
    const x1 = Math.min(gx + TS, s.x + s.width);
    if (x1 <= x0) return;
    const y0 = Math.max(gy, s.y);
    const y1 = Math.min(gy + TS, s.y + s.height);
    for (let y = y0; y < y1; y++) {
      const from = ((y - s.y) * s.width + (x0 - s.x)) * 4;
      t.set(s.pixels.subarray(from, from + (x1 - x0) * 4), ((y - gy) * TS + (x0 - gx)) * 4);
    }
  }

  get(x: number, y: number): RGBA {
    const t = this.tiles[(y >> SHIFT) * this.tilesAcross + (x >> SHIFT)];
    if (!t) return this.getBase(x, y);
    const i = ((y & MASK) * TS + (x & MASK)) * 4;
    return [t[i], t[i + 1], t[i + 2], t[i + 3]];
  }

  getBase(x: number, y: number): RGBA {
    const o = this.basePx;
    this.readBase(x, y, o, 0);
    return [o[0], o[1], o[2], o[3]];
  }

  /** Paints one pixel. */
  set(x: number, y: number, c: RGBA): void {
    if (tileModeOn()) {
      // Tile mode: whatever goes off one edge comes back on the other.
      x = wrap(x, this.width);
      y = wrap(y, this.height);
    } else if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (this.clip && !this.clip[y * this.width + x]) return;
    const ti = (y >> SHIFT) * this.tilesAcross + (x >> SHIFT);
    let t = this.tiles[ti];
    if (!t) {
      const b = this.basePx;
      this.readBase(x, y, b, 0);
      if (b[0] === c[0] && b[1] === c[1] && b[2] === c[2] && b[3] === c[3]) return;
      t = new Uint8ClampedArray(TS * TS * 4);
      this.fillTile(t, x >> SHIFT, y >> SHIFT);
      this.tiles[ti] = t;
    }
    const i = ((y & MASK) * TS + (x & MASK)) * 4;
    if (t[i] === c[0] && t[i + 1] === c[1] && t[i + 2] === c[2] && t[i + 3] === c[3]) return;
    t[i] = c[0];
    t[i + 1] = c[1];
    t[i + 2] = c[2];
    t[i + 3] = c[3];
    this.changed = true;
    const tc = this.touched;
    if (!tc) this.touched = { x0: x, y0: y, x1: x, y1: y };
    else {
      if (x < tc.x0) tc.x0 = x;
      if (y < tc.y0) tc.y0 = y;
      if (x > tc.x1) tc.x1 = x;
      if (y > tc.y1) tc.y1 = y;
    }
    const d = this.dirty;
    if (!d) this.dirty = { x0: x, y0: y, x1: x, y1: y };
    else {
      if (x < d.x0) d.x0 = x;
      if (y < d.y0) d.y0 = y;
      if (x > d.x1) d.x1 = x;
      if (y > d.y1) d.y1 = y;
    }
  }

  /** Paints one pixel (and its mirror images) with an ink. The ink sees the pixel as it was before the session. */
  paint(x: number, y: number, ink: Ink): void {
    const n = mirrorPoints(this.mirror, x, y, this.pts);
    const c = this.rgba;
    const b = this.basePx;
    for (let k = 0; k < n; k++) {
      const px = this.pts[k * 2];
      const py = this.pts[k * 2 + 1];
      if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
      this.readBase(px, py, b, 0);
      if (ink.color(px, py, b, 0, c)) this.set(px, py, [c[0], c[1], c[2], c[3]]);
    }
  }

  /** Puts one pixel (and its mirror images) back to how it was before the session. */
  restore(x: number, y: number): void {
    const n = mirrorPoints(this.mirror, x, y, this.pts);
    for (let k = 0; k < n; k++) {
      const px = this.pts[k * 2];
      const py = this.pts[k * 2 + 1];
      if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
      this.set(px, py, this.getBase(px, py));
    }
  }

  /** Paints a brush footprint around a pixel with an ink (mirrored). */
  stampInk(p: PxPt, offsets: PxPt[], ink: Ink): void {
    for (const o of offsets) this.paint(p.x + o.x, p.y + o.y, ink);
  }

  /** Paints a brush footprint around a pixel. */
  stamp(p: PxPt, offsets: PxPt[], c: RGBA): void {
    for (const o of offsets) this.set(p.x + o.x, p.y + o.y, c);
  }

  /** Puts everything back to how it was when the session started (for rubber-band lines). */
  reset(): void {
    let d: PixelSession['dirty'] = null;
    for (let ti = 0; ti < this.tiles.length; ti++) {
      const t = this.tiles[ti];
      if (!t) continue;
      const tx = ti % this.tilesAcross;
      const ty = (ti - tx) / this.tilesAcross;
      this.fillTile(t, tx, ty);
      const x0 = tx << SHIFT;
      const y0 = ty << SHIFT;
      const x1 = Math.min(x0 + TS, this.width) - 1;
      const y1 = Math.min(y0 + TS, this.height) - 1;
      if (!d) d = { x0, y0, x1, y1 };
      else {
        d.x0 = Math.min(d.x0, x0);
        d.y0 = Math.min(d.y0, y0);
        d.x1 = Math.max(d.x1, x1);
        d.y1 = Math.max(d.y1, y1);
      }
    }
    this.changed = false;
    // The tiles' whole area goes back to the screen, outside any dirty rectangle already waiting.
    const w = this.dirty;
    if (d && w) this.dirty = { x0: Math.min(d.x0, w.x0), y0: Math.min(d.y0, w.y0), x1: Math.max(d.x1, w.x1), y1: Math.max(d.y1, w.y1) };
    else this.dirty = d ?? w;
  }

  /**
   * Makes the live canvas, or grows it, so it covers the grid rectangle: the tiles of the stroke, with room to grow (a big
   * canvas costs time to make even when nothing is put on it, so it is no bigger than the stroke needs).
   */
  private cover(x0: number, y0: number, x1: number, y1: number): boolean {
    if (this.canvas && x0 >= this.cx && y0 >= this.cy && x1 < this.cx + this.cw && y1 < this.cy + this.ch) return true;
    const s = this.src;
    const o = this.canvas ? { x0: this.cx, y0: this.cy, x1: this.cx + this.cw - 1, y1: this.cy + this.ch - 1 } : null;
    const m = Math.min(MARGIN, Math.max(MARGIN >> 2, o ? (o.x1 - o.x0 + 1) >> 1 : 0));
    // A side the request pushes past gets a margin, so a long stroke does not rebuild the canvas for every tile.
    const nx0 = !o || x0 < o.x0 ? Math.max(0, x0 - m) : o.x0;
    const ny0 = !o || y0 < o.y0 ? Math.max(0, y0 - m) : o.y0;
    const nx1 = !o || x1 > o.x1 ? Math.min(this.width - 1, x1 + m) : o.x1;
    const ny1 = !o || y1 > o.y1 ? Math.min(this.height - 1, y1 + m) : o.y1;
    const nw = nx1 - nx0 + 1;
    const nh = ny1 - ny0 + 1;
    const next = makeLiveCanvas(nw, nh);
    if (!next) return false;
    const g = next.getContext('2d') as CanvasRenderingContext2D;
    if (this.canvas && this.filled) {
      // A canvas that holds the whole picture shows the old drawing in the part it grows into, and keeps what it has (erased pixels included).
      this.paintBase(g, s.x - nx0, s.y - ny0);
      g.save();
      g.beginPath();
      g.rect(this.cx - nx0, this.cy - ny0, this.cw, this.ch);
      g.clip();
      g.globalCompositeOperation = 'copy';
      g.drawImage(this.canvas as CanvasImageSource, this.cx - nx0, this.cy - ny0);
      g.restore();
    } else if (this.canvas) g.drawImage(this.canvas as CanvasImageSource, this.cx - nx0, this.cy - ny0);
    this.canvas = next;
    this.cx = nx0;
    this.cy = ny0;
    this.cw = nw;
    this.ch = nh;
    return true;
  }

  /** Puts the old drawing's picture on a canvas at (x, y) of it: from its cached picture (a canvas to canvas copy, not an upload of the pixels). */
  private paintBase(g: CanvasRenderingContext2D, x: number, y: number): void {
    const d = this.baseDrawing;
    if (d && this.src.width) g.drawImage(pixelCanvas(d) as CanvasImageSource, x, y);
  }

  /**
   * Makes the live canvas the whole picture (the old drawing with the live tiles on it), for a screen where the sparse
   * preview cannot be drawn exactly like the finished picture. From then on it stays whole.
   */
  private fill = (): void => {
    if (this.filled || !this.canvas) return;
    const s = this.src;
    let x0 = this.cx;
    let y0 = this.cy;
    let x1 = this.cx + this.cw - 1;
    let y1 = this.cy + this.ch - 1;
    if (s.width) {
      x0 = Math.min(x0, s.x);
      y0 = Math.min(y0, s.y);
      x1 = Math.max(x1, s.x + s.width - 1);
      y1 = Math.max(y1, s.y + s.height - 1);
    }
    const next = makeLiveCanvas(x1 - x0 + 1, y1 - y0 + 1);
    if (!next) return;
    const g = next.getContext('2d') as CanvasRenderingContext2D;
    // The old picture, then each live tile on it whole (the tiles hold the new picture, erased pixels included).
    this.paintBase(g, s.x - x0, s.y - y0);
    for (const t of this.liveTiles) {
      const img = this.images[(t.y >> SHIFT) * this.tilesAcross + (t.x >> SHIFT)];
      if (img) g.putImageData(img, t.x - x0, t.y - y0, 0, 0, t.w, t.h);
    }
    this.canvas = next;
    this.cx = x0;
    this.cy = y0;
    this.cw = x1 - x0 + 1;
    this.ch = y1 - y0 + 1;
    this.filled = true;
    setLive(this.liveState());
  };

  private liveState() {
    const c = this.canvas as CanvasImageSource;
    return { layerId: this.layerId, kind: 'pixel' as const, canvas: c, x: this.cx, y: this.cy, width: this.cw, height: this.ch, ...(this.filled ? {} : { sparse: { base: this.baseDrawing, tiles: this.liveTiles, fill: this.fill } }) };
  }

  /** Sends what changed to the screen. */
  flush(): void {
    const d = this.dirty;
    if (!d) return;
    if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return;
    const tx0 = d.x0 >> SHIFT;
    const tx1 = d.x1 >> SHIFT;
    const ty0 = d.y0 >> SHIFT;
    const ty1 = d.y1 >> SHIFT;
    // A tile that reaches the canvas for the first time goes up whole (the old picture's part of it too), so the canvas
    // must cover all of it.
    let ux0 = d.x0;
    let uy0 = d.y0;
    let ux1 = d.x1;
    let uy1 = d.y1;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ti = ty * this.tilesAcross + tx;
        if (!this.tiles[ti] || this.onCanvas[ti]) continue;
        ux0 = Math.min(ux0, tx << SHIFT);
        uy0 = Math.min(uy0, ty << SHIFT);
        ux1 = Math.max(ux1, Math.min(((tx + 1) << SHIFT) - 1, this.width - 1));
        uy1 = Math.max(uy1, Math.min(((ty + 1) << SHIFT) - 1, this.height - 1));
      }
    }
    if (!this.cover(ux0, uy0, ux1, uy1)) return;
    const g = (this.canvas as LiveCanvas).getContext('2d') as CanvasRenderingContext2D;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ti = ty * this.tilesAcross + tx;
        const t = this.tiles[ti];
        if (!t) continue;
        let img = this.images[ti];
        if (!img) img = this.images[ti] = new ImageData(t as Uint8ClampedArray<ArrayBuffer>, TS, TS);
        const gx = tx << SHIFT;
        const gy = ty << SHIFT;
        const ex = Math.min(gx + TS, this.width) - 1 - gx;
        const ey = Math.min(gy + TS, this.height) - 1 - gy;
        let sx = 0;
        let sy = 0;
        let fx = ex;
        let fy = ey;
        if (this.onCanvas[ti]) {
          sx = Math.max(d.x0, gx) - gx;
          sy = Math.max(d.y0, gy) - gy;
          fx = Math.min(d.x1, gx + TS - 1) - gx;
          fy = Math.min(d.y1, gy + TS - 1) - gy;
        } else {
          this.onCanvas[ti] = 1;
          this.liveTiles.push({ x: gx, y: gy, w: ex + 1, h: ey + 1 });
        }
        g.putImageData(img, gx - this.cx, gy - this.cy, sx, sy, fx - sx + 1, fy - sy + 1);
      }
    }
    this.dirty = null;
    setLive(this.liveState());
  }

  /** Ends the preview without changing the document. */
  discard(): void {
    setLive(null);
    forgetGrids();
  }

  /** The finished picture over a rectangle of the grid: the old block with the changed tiles on top. */
  private crop(r: { x: number; y: number; w: number; h: number }): Uint8ClampedArray {
    const out = new Uint8ClampedArray(r.w * r.h * 4);
    const s = this.src;
    const bx0 = Math.max(r.x, s.x);
    const bx1 = Math.min(r.x + r.w, s.x + s.width);
    if (bx1 > bx0) {
      for (let y = Math.max(r.y, s.y); y < Math.min(r.y + r.h, s.y + s.height); y++) {
        const from = ((y - s.y) * s.width + (bx0 - s.x)) * 4;
        out.set(s.pixels.subarray(from, from + (bx1 - bx0) * 4), ((y - r.y) * r.w + (bx0 - r.x)) * 4);
      }
    }
    for (let ty = r.y >> SHIFT; ty <= (r.y + r.h - 1) >> SHIFT; ty++) {
      for (let tx = r.x >> SHIFT; tx <= (r.x + r.w - 1) >> SHIFT; tx++) {
        const t = this.tiles[ty * this.tilesAcross + tx];
        if (!t) continue;
        const gx = tx << SHIFT;
        const gy = ty << SHIFT;
        const x0 = Math.max(r.x, gx);
        const x1 = Math.min(r.x + r.w, gx + TS);
        for (let y = Math.max(r.y, gy); y < Math.min(r.y + r.h, gy + TS); y++) {
          const from = ((y - gy) * TS + (x0 - gx)) * 4;
          out.set(t.subarray(from, from + (x1 - x0) * 4), ((y - r.y) * r.w + (x0 - r.x)) * 4);
        }
      }
    }
    return out;
  }

  /**
   * Makes the finished drawing's cached picture from the old drawing's with only the touched tiles put on top, so the first
   * draw after pen-up does not upload the whole block again. When the block is where it was, the old picture itself is
   * updated and handed over (nothing big is copied; undo makes the old one again when asked for it); otherwise it is a
   * canvas to canvas copy. Skipped when the old picture is not cached or most of the block changed (the plain rebuild is
   * as cheap then).
   */
  private seedPicture(p: { x: number; y: number; width: number; height: number; pixels: Uint8ClampedArray }): void {
    const old = this.baseDrawing;
    const s = this.src;
    const base = old && s.width ? peekPixelCanvas(old.pixels) : undefined;
    if (old && s.width && !base) return;
    const list: number[] = [];
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i]) list.push(i);
    if (list.length * TS * TS * 2 > p.width * p.height) return;
    const inPlace = !!base && p.x === s.x && p.y === s.y && p.width === s.width && p.height === s.height;
    const c = inPlace ? base : makeLiveCanvas(p.width, p.height);
    const g = c?.getContext('2d') as CanvasRenderingContext2D | null | undefined;
    if (!c || !g) return;
    if (base && !inPlace) {
      g.globalCompositeOperation = 'copy';
      g.drawImage(base as CanvasImageSource, s.x - p.x, s.y - p.y);
      g.globalCompositeOperation = 'source-over';
    }
    for (const ti of list) {
      const tx = ti % this.tilesAcross;
      const ty = (ti - tx) / this.tilesAcross;
      const gx = tx << SHIFT;
      const gy = ty << SHIFT;
      let img = this.images[ti];
      if (!img) img = this.images[ti] = new ImageData(this.tiles[ti] as Uint8ClampedArray<ArrayBuffer>, TS, TS);
      const w = Math.min(gx + TS, this.width) - gx;
      const h = Math.min(gy + TS, this.height) - gy;
      g.putImageData(img, gx - p.x, gy - p.y, 0, 0, w, h);
    }
    seedPixelCanvas(p.pixels, c);
    if (inPlace && old) dropPixelCanvas(old.pixels);
  }

  /** Writes the result into the drawing, copying and trimming only the touched rectangle and the old block. */
  private write(label: string): EditResult {
    const g = activeGrid();
    if (!g) return 'wrong-kind';
    const t = this.touched;
    const touched = t ? { width: t.x1 - t.x0 + 1, height: t.y1 - t.y0 + 1, x: t.x0, y: t.y0 } : { width: 0, height: 0 };
    const r = unionRect(this.was, touched);
    const placed = r ? trimPixels(this.crop(r), r.w, r.h, r.x, r.y) : null;
    if (placed && placed.width > 0) this.seedPicture(placed);
    return editActiveDrawing(label, 'pixel', (d) => void setPlaced(d, placed ?? { x: 0, y: 0, width: 0, height: 0, pixels: new Uint8ClampedArray(0) }), { adds: this.fresh });
  }

  /** Ends the preview and writes the result into the document as one undo step. */
  commit(label: string): EditResult | 'nothing' {
    if (!this.changed) {
      setLive(null);
      forgetGrids();
      return 'nothing';
    }
    const r = this.write(label);
    setLive(null);
    return r;
  }
}

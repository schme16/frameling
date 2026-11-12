/**
 * A pixel edit in progress. Works on a private copy of the layer's pixels, shows it live (through the canvas's live
 * preview, so nothing touches the document), and at the end commits a brand new pixel array as one undo step.
 */
import type { Doc, PixelLayer } from '../core/format';
import { pixelGrid } from '../core/doc';
import { drawingAt } from '../core/doc';
import { setLive } from '../canvas/controller';
import { getPx, setPx, type PxPt, type RGBA } from '../canvas/pixels';
import { activeGrid, editActiveDrawing, type EditResult } from './edit';
import { forgetGrids, gridPixels, setGridRect } from '../core/pixelBounds';
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

export class PixelSession {
  readonly width: number;
  readonly height: number;
  readonly layerId: string;
  readonly pixelSize: number;
  private base: Uint8ClampedArray;
  readonly work: Uint8ClampedArray;
  private canvas: LiveCanvas | null;
  private img: ImageData | null = null;
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

  /** Painting on a frame that only carries the last drawing along: this starts a new drawing there. */
  private fresh = false;

  constructor(doc: Doc, layer: PixelLayer, frame: number, opts: { mirror?: boolean; adds?: boolean } = {}) {
    const d = drawingAt(doc, layer, frame);
    this.fresh = !!opts.adds && !!autoHeldAt(layer, frame);
    if (this.fresh) markTracing(layer.id, frame);
    const g = pixelGrid(doc, layer);
    this.width = g.width;
    this.height = g.height;
    // The drawing holds only what is painted; the session works on the whole grid.
    if (d && d.kind === 'pixel' && !this.fresh) this.was = { x: d.x, y: d.y, width: d.width, height: d.height };
    this.base = d && d.kind === 'pixel' && !this.fresh ? gridPixels(d, g.width, g.height) : new Uint8ClampedArray(g.width * g.height * 4);
    this.work = new Uint8ClampedArray(this.base);
    this.layerId = layer.id;
    this.pixelSize = layer.pixelSize;
    const ps = getPixelSettings();
    this.mirror = makeMirror(opts.mirror === false ? 'off' : ps.symmetry, this.width, this.height, ps.axisX, ps.axisY);
    const pal = layer.paletteLock ? docPalette(doc) : null;
    this.lock = pal ? (ink) => lockedInk(ink, pal) : (ink) => ink;
    const sel = pixelSelection();
    if (sel && sel.width === this.width && sel.height === this.height) this.clip = sel.bits;
    this.canvas = makeLiveCanvas(this.width, this.height);
    if (this.canvas) {
      const g = this.canvas.getContext('2d') as CanvasRenderingContext2D;
      this.img = new ImageData(this.work as Uint8ClampedArray<ArrayBuffer>, this.width, this.height);
      g.putImageData(this.img, 0, 0);
      setLive({ layerId: this.layerId, kind: 'pixel', canvas: this.canvas, width: this.width, height: this.height });
    }
  }

  get(x: number, y: number): RGBA {
    return getPx(this.work, this.width, x, y);
  }

  getBase(x: number, y: number): RGBA {
    return getPx(this.base, this.width, x, y);
  }

  /** Paints one pixel. */
  set(x: number, y: number, c: RGBA): void {
    if (tileModeOn()) {
      // Tile mode: whatever goes off one edge comes back on the other.
      x = wrap(x, this.width);
      y = wrap(y, this.height);
    } else if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (this.clip && !this.clip[y * this.width + x]) return;
    const i = (y * this.width + x) * 4;
    const w = this.work;
    if (w[i] === c[0] && w[i + 1] === c[1] && w[i + 2] === c[2] && w[i + 3] === c[3]) return;
    setPx(w, this.width, this.height, x, y, c);
    this.changed = true;
    const t = this.touched;
    if (!t) this.touched = { x0: x, y0: y, x1: x, y1: y };
    else {
      if (x < t.x0) t.x0 = x;
      if (y < t.y0) t.y0 = y;
      if (x > t.x1) t.x1 = x;
      if (y > t.y1) t.y1 = y;
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
    for (let k = 0; k < n; k++) {
      const px = this.pts[k * 2];
      const py = this.pts[k * 2 + 1];
      if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
      if (ink.color(px, py, this.base, (py * this.width + px) * 4, c)) this.set(px, py, [c[0], c[1], c[2], c[3]]);
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
    this.work.set(this.base);
    this.changed = false;
    this.dirty = { x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 };
  }

  /** Sends what changed to the screen. */
  flush(): void {
    const d = this.dirty;
    if (!d || !this.canvas || !this.img) return;
    (this.canvas.getContext('2d') as CanvasRenderingContext2D).putImageData(this.img, 0, 0, d.x0, d.y0, d.x1 - d.x0 + 1, d.y1 - d.y0 + 1);
    this.dirty = null;
    setLive({ layerId: this.layerId, kind: 'pixel', canvas: this.canvas, width: this.width, height: this.height });
  }

  /** Ends the preview without changing the document. */
  discard(): void {
    setLive(null);
    forgetGrids();
  }

  /** Writes the work grid into the drawing, copying and trimming only the touched rectangle and the old block. */
  private write(label: string): EditResult {
    const g = activeGrid();
    if (!g) return 'wrong-kind';
    const t = this.touched;
    const touched = t ? { x: t.x0, y: t.y0, w: t.x1 - t.x0 + 1, h: t.y1 - t.y0 + 1 } : null;
    return editActiveDrawing(label, 'pixel', (d) => void setGridRect(d, this.work, g.width, this.was, touched), { adds: this.fresh });
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
    // The whole-grid copy of the old drawing is only wanted while painting; a big canvas's is megabytes.
    forgetGrids();
    return r;
  }
}

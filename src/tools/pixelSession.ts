/**
 * A pixel edit in progress. Works on a private copy of the layer's pixels, shows it live (through the canvas's live
 * preview, so nothing touches the document), and at the end commits a brand new pixel array as one undo step.
 */
import type { Doc, PixelLayer } from '../core/format';
import { pixelGrid } from '../core/doc';
import { drawingAt } from '../core/doc';
import { setLive } from '../canvas/controller';
import { getPx, setPx, type PxPt, type RGBA } from '../canvas/pixels';
import { editActiveDrawing } from './edit';
import { lockedInk, makeMirror, mirrorPoints, type Ink, type Mirror } from '../pixel/ink';
import { docPalette } from '../pixel/palette';
import { getPixelSettings } from '../pixel/settings';

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
  changed = false;
  /** Mirror drawing, read once when the session starts. */
  readonly mirror: Mirror;
  /** Turns an ink into one that snaps to the palette, when the layer has its palette lock on. */
  readonly lock: (ink: Ink) => Ink;
  private pts = new Int32Array(8);
  private rgba = new Uint8Array(4);

  constructor(doc: Doc, layer: PixelLayer, frame: number, opts: { mirror?: boolean } = {}) {
    const d = drawingAt(doc, layer, frame);
    if (d && d.kind === 'pixel') {
      this.width = d.width;
      this.height = d.height;
      this.base = d.pixels;
    } else {
      const g = pixelGrid(doc, layer);
      this.width = g.width;
      this.height = g.height;
      this.base = new Uint8ClampedArray(g.width * g.height * 4);
    }
    this.work = new Uint8ClampedArray(this.base);
    this.layerId = layer.id;
    this.pixelSize = layer.pixelSize;
    const ps = getPixelSettings();
    this.mirror = makeMirror(opts.mirror === false ? 'off' : ps.symmetry, this.width, this.height, ps.axisX, ps.axisY);
    const pal = layer.paletteLock ? docPalette(doc) : null;
    this.lock = pal ? (ink) => lockedInk(ink, pal) : (ink) => ink;
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
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const w = this.work;
    if (w[i] === c[0] && w[i + 1] === c[1] && w[i + 2] === c[2] && w[i + 3] === c[3]) return;
    setPx(w, this.width, this.height, x, y, c);
    this.changed = true;
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
  }

  /** Ends the preview and writes the result into the document as one undo step. */
  commit(label: string): ReturnType<typeof editActiveDrawing> | 'nothing' {
    if (!this.changed) {
      setLive(null);
      return 'nothing';
    }
    const pixels = new Uint8ClampedArray(this.work);
    const r = editActiveDrawing(label, 'pixel', (d) => {
      d.pixels = pixels;
    });
    setLive(null);
    return r;
  }
}

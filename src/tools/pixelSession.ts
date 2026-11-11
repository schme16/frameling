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

  constructor(doc: Doc, layer: PixelLayer, frame: number) {
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

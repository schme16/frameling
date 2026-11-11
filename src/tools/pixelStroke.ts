/**
 * Painting and erasing on a pixel layer: hard pixels, a brush footprint, the "pixel perfect" corner clean-up, and
 * Shift+click straight lines from the last pixel. Used by the brush (paints) and the eraser (clears).
 */
import type { Doc, PixelLayer } from '../core/format';
import { PixelPerfect, bresenham, brushOffsets, docToPixel, type PixelShape, type PxPt, type RGBA } from '../canvas/pixels';
import { PixelSession } from './pixelSession';
import { solidInk, type Ink } from '../pixel/ink';

/** Where the last pixel stroke ended, per layer, for Shift+click lines. */
let lastEnd: { docId: string; layerId: string; x: number; y: number } | null = null;

export function lastPixelEnd(doc: Doc, layer: PixelLayer): PxPt | null {
  return lastEnd && lastEnd.docId === doc.id && lastEnd.layerId === layer.id ? { x: lastEnd.x, y: lastEnd.y } : null;
}

export function forgetLastPixelEnd(): void {
  lastEnd = null;
}

export interface PixelStrokeOptions {
  color: RGBA;
  size: number;
  shape: PixelShape;
  perfect: boolean;
  /** How painted pixels get their colour (shading, dither). Defaults to plain `color`. */
  ink?: Ink;
}

export class PixelStroke {
  readonly session: PixelSession;
  private offsets: PxPt[];
  private perfect: PixelPerfect | null;
  private counts = new Map<number, number>();
  private last: PxPt | null = null;
  private lineFrom: PxPt | null = null;
  private ink: Ink;

  constructor(
    private doc: Doc,
    private layer: PixelLayer,
    frame: number,
    private opts: PixelStrokeOptions,
  ) {
    // Plain paint adds a new drawing over a carried-along one; rubbing out or shading works on what's there.
    this.session = new PixelSession(doc, layer, frame, { adds: !opts.ink && opts.color[3] > 0 });
    this.offsets = brushOffsets(opts.size, opts.shape);
    this.ink = this.session.lock(opts.ink ?? solidInk(opts.color));
    // The corner clean-up only means something for a one pixel line.
    this.perfect = opts.perfect && opts.size === 1 && (opts.color[3] > 0 || !!opts.ink) ? new PixelPerfect() : null;
  }

  /** Where in the grid a document position lands. */
  cell(x: number, y: number): PxPt {
    return docToPixel(x, y, this.layer.pixelSize);
  }

  /** Starts freehand at a pixel. */
  begin(p: PxPt): void {
    this.paintPixel(p);
    this.last = p;
    this.session.flush();
  }

  /** Starts a straight line from the last pixel to this one (Shift+click). Further moves stretch the line. */
  beginLine(from: PxPt, to: PxPt): void {
    this.lineFrom = from;
    this.moveTo(to);
  }

  moveTo(p: PxPt): void {
    if (this.lineFrom) {
      this.session.reset();
      for (const q of bresenham(this.lineFrom.x, this.lineFrom.y, p.x, p.y)) this.session.stampInk(q, this.offsets, this.ink);
      this.last = p;
      this.session.flush();
      return;
    }
    const last = this.last;
    if (!last) return this.begin(p);
    if (last.x === p.x && last.y === p.y) return;
    const line = bresenham(last.x, last.y, p.x, p.y);
    for (let i = 1; i < line.length; i++) this.paintPixel(line[i]);
    this.last = p;
    this.session.flush();
  }

  private key(p: PxPt): number {
    return p.y * this.session.width + p.x;
  }

  private paintPixel(p: PxPt): void {
    if (!this.perfect) {
      this.session.stampInk(p, this.offsets, this.ink);
      return;
    }
    this.counts.set(this.key(p), (this.counts.get(this.key(p)) ?? 0) + 1);
    this.session.paint(p.x, p.y, this.ink);
    const dropped = this.perfect.add(p);
    if (dropped) {
      const k = this.key(dropped);
      const n = (this.counts.get(k) ?? 1) - 1;
      this.counts.set(k, n);
      // Take the pixel back off, unless the line crossed itself there and still needs it.
      if (n <= 0) this.session.restore(dropped.x, dropped.y);
    }
  }

  /** Ends the stroke and writes it into the document. Returns what the edit did. */
  commit(label: string) {
    if (this.last) lastEnd = { docId: this.doc.id, layerId: this.layer.id, x: this.last.x, y: this.last.y };
    return this.session.commit(label);
  }

  discard(): void {
    this.session.discard();
  }
}

/**
 * Painting and erasing on a pixel layer: hard pixels, a brush footprint, the "pixel perfect" corner clean-up, and
 * Shift+click straight lines from the last pixel. Used by the brush (paints) and the eraser (clears).
 */
import type { Doc, PixelLayer } from '../core/format';
import { PixelPerfect, bresenham, brushOffsets, docToPixel, type PixelShape, type PxPt, type RGBA } from '../canvas/pixels';
import { PixelSession } from './pixelSession';
import { solidInk, type Ink } from '../pixel/ink';
import { toolEvent } from './toolEvents';
import { stampCells, stampSpacing, type PixelStamp } from '../brushes/stamps';

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
  /** A brush made from a selection: its shape (or picture) is stamped instead of a square or round dab. */
  stamp?: PixelStamp;
}

export class PixelStroke {
  readonly session: PixelSession;
  private offsets: PxPt[];
  private perfect: PixelPerfect | null;
  private counts = new Map<number, number>();
  private last: PxPt | null = null;
  private lineFrom: PxPt | null = null;
  private ink: Ink;
  private size: number;
  private offsetsBySize = new Map<number, PxPt[]>();
  /** A picture brush: each cell with its own colour, stamped as copies this far apart (null for a plain shape). */
  private picture: { o: PxPt; ink: Ink }[] | null = null;
  private spacing = 1;
  private lastDab: PxPt | null = null;

  constructor(
    private doc: Doc,
    private layer: PixelLayer,
    frame: number,
    private opts: PixelStrokeOptions,
  ) {
    // Plain paint adds a new drawing over a carried-along one; rubbing out or shading works on what's there.
    this.session = new PixelSession(doc, layer, frame, { adds: !opts.ink && opts.color[3] > 0 });
    this.size = opts.size;
    const cells = opts.stamp ? stampCells(opts.stamp) : null;
    this.offsets = cells ? cells.map((c) => ({ x: c.x, y: c.y })) : brushOffsets(opts.size, opts.shape);
    this.offsetsBySize.set(opts.size, this.offsets);
    this.ink = this.session.lock(opts.ink ?? solidInk(opts.color));
    if (opts.stamp?.keep && cells) {
      this.picture = cells.map((c) => ({ o: { x: c.x, y: c.y }, ink: this.session.lock(solidInk(c.rgba)) }));
      this.spacing = stampSpacing(opts.stamp);
    }
    // The corner clean-up only means something for a one pixel line.
    this.perfect = !cells && opts.perfect && opts.size === 1 && (opts.color[3] > 0 || !!opts.ink) ? new PixelPerfect() : null;
  }

  /**
   * Makes the brush `factor` times the size it started with from now on (pen pressure or tilt), never under one pixel.
   * A one pixel pixel perfect line keeps its size, since its corner clean-up works on single pixels.
   */
  scale(factor: number): void {
    if (this.perfect || factor === 1 || this.opts.stamp) return;
    const n = Math.min(128, Math.max(1, Math.round(this.opts.size * factor)));
    if (n === this.size) return;
    this.size = n;
    let o = this.offsetsBySize.get(n);
    if (!o) this.offsetsBySize.set(n, (o = brushOffsets(n, this.opts.shape)));
    this.offsets = o;
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
      this.lastDab = null;
      for (const q of bresenham(this.lineFrom.x, this.lineFrom.y, p.x, p.y)) this.dab(q);
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

  /** One dab of the brush at a pixel. A picture brush lays copies side by side as you drag, a shape smears like any brush. */
  private dab(p: PxPt): void {
    const pic = this.picture;
    if (!pic) return this.session.stampInk(p, this.offsets, this.ink);
    const l = this.lastDab;
    if (l && Math.max(Math.abs(p.x - l.x), Math.abs(p.y - l.y)) < this.spacing) return;
    this.lastDab = p;
    for (const c of pic) this.session.paint(p.x + c.o.x, p.y + c.o.y, c.ink);
  }

  private paintPixel(p: PxPt): void {
    if (!this.perfect) {
      this.dab(p);
      return;
    }
    this.counts.set(this.key(p), (this.counts.get(this.key(p)) ?? 0) + 1);
    this.session.paint(p.x, p.y, this.ink);
    const dropped = this.perfect.add(p);
    if (dropped) {
      toolEvent('perfectFix');
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

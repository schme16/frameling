/**
 * A freehand vector stroke in progress: collects the points, previews them on the overlay with exactly the outline the
 * finished stroke will have, and commits one StrokeShape as a single undo step. Brush and pencil both use it.
 */
import type { BrushSettings, StrokePoint, StrokeShape } from '../core/format';
import { uid } from '../core/doc';
import type { ToolContext, ToolPointer } from '../core/registry';
import { getPredicted } from '../canvas/controller';
import { addDrawn, drawWithMirror } from './mirror';
import { noteColorUsed } from './recent';
import { reportEdit } from './util';
import type { VectorDynamics } from '../tablet/dynamics';
import { store } from '../core/store';
import { afterStroke, drawQuickPreview, holdModeNow, QuickHold } from './quickshape';

/** The document and layer a stroke belongs to, for remembering where it ended. */
function lastStore(): { doc: string; ui: string } {
  const s = store().get();
  return { doc: s.doc.id, ui: s.ui.activeLayerId ?? '' };
}

/** Points closer than this on screen add nothing the eye can see, and would only bloat the file. */
const MIN_STEP_SCREEN = 0.35;

/** Where the last vector stroke ended, per layer, for Shift+click straight lines. */
let lastEnd: { docId: string; layerId: string; x: number; y: number } | null = null;

/** Where the last brush or pencil stroke on this layer ended, if it was this drawing. */
export function lastVectorEnd(docId: string, layerId: string): { x: number; y: number } | null {
  return lastEnd && lastEnd.docId === docId && lastEnd.layerId === layerId ? { x: lastEnd.x, y: lastEnd.y } : null;
}

export function forgetLastVectorEnd(): void {
  lastEnd = null;
}

/** Remembers where a stroke finished, so the next Shift+click can run a line from it. */
export function noteVectorEnd(docId: string, layerId: string, p: { x: number; y: number }): void {
  lastEnd = { docId, layerId, x: p.x, y: p.y };
}

/**
 * Shift+click: the stroke starts at the end of the last one, so a click lays a straight line from there. Nothing
 * remembered (or no Shift) just starts where you clicked.
 */
export function startFromLast(stroke: { add(e: ToolPointer, zoom: number): void }, e: ToolPointer, zoom: number): void {
  if (e.shift) {
    const { doc, ui } = lastStore();
    const from = lastVectorEnd(doc, ui);
    if (from) stroke.add({ ...e, x: from.x, y: from.y }, zoom);
  }
  stroke.add(e, zoom);
}

export function buildStroke(points: StrokePoint[], brush: BrushSettings, color: string, opacity = 1, realPressure = false): StrokeShape {
  // A lone click becomes a dot: two identical points make perfect-freehand draw a round dab.
  const pts = points.length === 1 ? [points[0], { ...points[0] }] : points;
  return { id: uid('sh'), type: 'stroke', points: pts, brush: { ...brush }, ...(realPressure ? { realPressure: true } : {}), color, opacity };
}

export class VectorStroke {
  private points: StrokePoint[] = [];
  /** The share of full strength at each point, when opacity follows pressure. */
  private strengths: number[] = [];
  /** A pen drew this, so its widths are the pen's own and never worked out from the speed. */
  private fromPen = false;
  /** Hold to tidy: watching for the pen to stop (see quickshape.ts). Null when it is off or not allowed here. */
  private hold: QuickHold | null = null;

  constructor(
    private brush: BrushSettings,
    private color: string,
    /** What pen pressure and tilt do to width and opacity. Without it, pressure is the point's width value. */
    private dyn?: VectorDynamics,
  ) {}

  private point(e: ToolPointer): StrokePoint {
    if (this.dyn && e.pointerType === 'pen') this.fromPen = true;
    return { x: e.x, y: e.y, p: this.dyn ? this.dyn.width(e) : e.hasPressure ? e.pressure : 0.5 };
  }

  /** The whole line's opacity: the average of the strength along it, or 1 when opacity doesn't follow pressure. */
  private opacity(): number {
    if (!this.strengths.length) return 1;
    return this.strengths.reduce((a, b) => a + b, 0) / this.strengths.length;
  }

  /**
   * Starts watching for the pen to hold still (Hold to tidy). `changed` redraws the preview. Does nothing when the
   * feature is off, or here it is not allowed (a merge layer, mirror drawing).
   */
  watchHold(zoom: number, changed: () => void): void {
    const mode = holdModeNow();
    if (!mode) return;
    this.hold = new QuickHold({ points: () => this.points.map((p) => ({ x: p.x, y: p.y })), changed }, zoom, mode);
  }

  /** Stops the watching (the stroke ended or was dropped). */
  stop(): void {
    this.hold?.stop();
  }

  /** True while the clean shape is showing. */
  get tidying(): boolean {
    return !!this.hold?.snapped;
  }

  add(e: ToolPointer, zoom: number): void {
    if (this.hold) {
      // Once the clean shape shows, the pen reshapes it and the line stops growing.
      this.hold.moved({ x: e.x, y: e.y, shift: e.shift });
      if (this.hold.snapped) return;
    }
    const last = this.points[this.points.length - 1];
    if (last && Math.hypot(e.x - last.x, e.y - last.y) * zoom < MIN_STEP_SCREEN) return;
    this.points.push(this.point(e));
    const op = this.dyn?.opacity?.(e);
    if (op !== undefined) this.strengths.push(op);
  }

  /** The stroke as it would be committed right now. */
  shape(withPredicted = false): StrokeShape | null {
    if (!this.points.length) return null;
    let pts = this.points;
    if (withPredicted) {
      const pred = getPredicted();
      if (pred.length) {
        const p = this.points[this.points.length - 1].p;
        pts = [...pts, ...pred.map((q) => ({ x: q.x, y: q.y, p }))];
      }
    }
    return buildStroke(pts, this.brush, this.color, this.opacity(), this.fromPen);
  }

  overlay(g: CanvasRenderingContext2D, zoom = 1): void {
    if (this.hold?.shape) {
      const plain = this.shape();
      if (plain) return drawQuickPreview(g, plain, this.hold.shape, zoom);
    }
    const s = this.shape(true);
    if (s) drawWithMirror(g, s);
  }

  /** Finishes the stroke. */
  commit(e: ToolPointer, zoom: number, ctx: ToolContext): void {
    const tidied = this.tidying;
    if (!tidied) {
      this.add(e, zoom);
      // The very last point always counts, so the stroke ends where the pen lifted.
      const last = this.points[this.points.length - 1];
      if (last && (last.x !== e.x || last.y !== e.y)) this.points.push(this.point(e));
    }
    const shape = this.shape();
    if (!shape) return;
    // On a merge layer the stroke joins or cuts what it lands on.
    const r = addDrawn('Draw stroke', [shape]).result;
    if (r === 'ok') {
      noteColorUsed(this.color);
      const { doc, ui } = lastStore();
      const end = this.points[this.points.length - 1];
      if (end) noteVectorEnd(doc, ui, end);
      // The stroke is drawn as it was; if the pen held, it is swapped for the clean shape as a step of its own.
      afterStroke(shape.id, this.hold);
    } else if (r !== 'nothing') reportEdit(ctx, r);
    this.stop();
  }
}

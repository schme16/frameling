/**
 * A freehand vector stroke in progress: collects the points, previews them on the overlay with exactly the outline the
 * finished stroke will have, and commits one StrokeShape as a single undo step. Brush and pencil both use it.
 */
import type { BrushSettings, StrokePoint, StrokeShape } from '../core/format';
import { uid } from '../core/doc';
import type { ToolContext, ToolPointer } from '../core/registry';
import { drawShape } from '../core/render';
import { getPredicted } from '../canvas/controller';
import { addShapes } from './merge-mode';
import { noteColorUsed } from './recent';
import { reportEdit } from './util';
import type { VectorDynamics } from '../tablet/dynamics';

/** Points closer than this on screen add nothing the eye can see, and would only bloat the file. */
const MIN_STEP_SCREEN = 0.35;

export function buildStroke(points: StrokePoint[], brush: BrushSettings, color: string, opacity = 1): StrokeShape {
  // A lone click becomes a dot: two identical points make perfect-freehand draw a round dab.
  const pts = points.length === 1 ? [points[0], { ...points[0] }] : points;
  return { id: uid('sh'), type: 'stroke', points: pts, brush: { ...brush }, color, opacity };
}

export class VectorStroke {
  private points: StrokePoint[] = [];
  /** The share of full strength at each point, when opacity follows pressure. */
  private strengths: number[] = [];

  constructor(
    private brush: BrushSettings,
    private color: string,
    /** What pen pressure and tilt do to width and opacity. Without it, pressure is the point's width value. */
    private dyn?: VectorDynamics,
  ) {}

  private point(e: ToolPointer): StrokePoint {
    return { x: e.x, y: e.y, p: this.dyn ? this.dyn.width(e) : e.hasPressure ? e.pressure : 0.5 };
  }

  /** The whole line's opacity: the average of the strength along it, or 1 when opacity doesn't follow pressure. */
  private opacity(): number {
    if (!this.strengths.length) return 1;
    return this.strengths.reduce((a, b) => a + b, 0) / this.strengths.length;
  }

  add(e: ToolPointer, zoom: number): void {
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
    return buildStroke(pts, this.brush, this.color, this.opacity());
  }

  overlay(g: CanvasRenderingContext2D): void {
    const s = this.shape(true);
    if (s) drawShape(g, s);
  }

  /** Finishes the stroke. */
  commit(e: ToolPointer, zoom: number, ctx: ToolContext): void {
    this.add(e, zoom);
    // The very last point always counts, so the stroke ends where the pen lifted.
    const last = this.points[this.points.length - 1];
    if (last && (last.x !== e.x || last.y !== e.y)) this.points.push(this.point(e));
    const shape = this.shape();
    if (!shape) return;
    // On a merge layer the stroke joins or cuts what it lands on.
    const r = addShapes('Draw stroke', [shape]).result;
    if (r === 'ok') noteColorUsed(this.color);
    else if (r !== 'nothing') reportEdit(ctx, r);
  }
}

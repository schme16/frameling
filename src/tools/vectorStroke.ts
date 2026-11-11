/**
 * A freehand vector stroke in progress: collects the points, previews them on the overlay with exactly the outline the
 * finished stroke will have, and commits one StrokeShape as a single undo step. Brush and pencil both use it.
 */
import type { BrushSettings, StrokePoint, StrokeShape } from '../core/format';
import { uid } from '../core/doc';
import type { ToolContext, ToolPointer } from '../core/registry';
import { drawShape } from '../core/render';
import { getPredicted } from '../canvas/controller';
import { editActiveDrawing } from './edit';
import { noteColorUsed } from './recent';
import { reportEdit } from './util';

/** Points closer than this on screen add nothing the eye can see, and would only bloat the file. */
const MIN_STEP_SCREEN = 0.35;

export function buildStroke(points: StrokePoint[], brush: BrushSettings, color: string): StrokeShape {
  // A lone click becomes a dot: two identical points make perfect-freehand draw a round dab.
  const pts = points.length === 1 ? [points[0], { ...points[0] }] : points;
  return { id: uid('sh'), type: 'stroke', points: pts, brush: { ...brush }, color, opacity: 1 };
}

export class VectorStroke {
  private points: StrokePoint[] = [];

  constructor(
    private brush: BrushSettings,
    private color: string,
  ) {}

  add(e: ToolPointer, zoom: number): void {
    const last = this.points[this.points.length - 1];
    if (last && Math.hypot(e.x - last.x, e.y - last.y) * zoom < MIN_STEP_SCREEN) return;
    this.points.push({ x: e.x, y: e.y, p: e.hasPressure ? e.pressure : 0.5 });
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
    return buildStroke(pts, this.brush, this.color);
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
    if (last && (last.x !== e.x || last.y !== e.y)) this.points.push({ x: e.x, y: e.y, p: e.hasPressure ? e.pressure : 0.5 });
    const shape = this.shape();
    if (!shape) return;
    const r = editActiveDrawing('Draw stroke', 'vector', (d) => {
      d.shapes.push(shape);
    });
    if (r === 'ok') noteColorUsed(this.color);
    else reportEdit(ctx, r);
  }
}

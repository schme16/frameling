/**
 * The pencil's "Clean line" (centre-line) mode: the hand's path becomes a few smooth curves with an even width, a
 * stroked path rather than a filled outline, so Edit points (A) can bend it later point by point.
 */
import type { PathPoint, PathShape, SubPath } from '../core/format';
import { uid } from '../core/doc';
import type { ToolContext, ToolPointer } from '../core/registry';
import { fitCurve, rdp, type V } from '../geometry/bezier';
import { addDrawn, drawWithMirror } from './mirror';
import { noteColorUsed } from './recent';
import { reportEdit } from './util';
import { withWellGradients } from './gradient-wells';

/** A turn sharper than this (degrees) between simplified pieces is kept as a corner. */
const CORNER_DEG = 65;

const unit = (a: V, b: V): V => {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return l > 1e-9 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : { x: 1, y: 0 };
};

/** Evens out the hand's wobble a little: each point moves towards its neighbours. Ends stay put. */
function soften(pts: V[]): V[] {
  if (pts.length < 3) return pts;
  return pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : { x: (pts[i - 1].x + 2 * p.x + pts[i + 1].x) / 4, y: (pts[i - 1].y + 2 * p.y + pts[i + 1].y) / 4 }));
}

/**
 * The hand's points as a smooth open path: softened, then fitted with as few curves as stay within `tol` document
 * pixels, with sharp turns kept as corners.
 */
export function fitCleanLine(input: V[], tol = 1): SubPath | null {
  const pts = input.filter((p, i) => i === 0 || Math.hypot(p.x - input[i - 1].x, p.y - input[i - 1].y) > 1e-6);
  if (pts.length < 2) return null;
  const soft = soften(soften(pts));
  // Corners: where the simplified line turns sharply.
  const simple = rdp(soft, tol * 2);
  const cornerAt = new Set<string>();
  for (let i = 1; i < simple.length - 1; i++) {
    const a = unit(simple[i - 1], simple[i]);
    const b = unit(simple[i], simple[i + 1]);
    const turn = (Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) * 180) / Math.PI;
    if (turn > CORNER_DEG) cornerAt.add(`${simple[i].x},${simple[i].y}`);
  }
  const pieces: V[][] = [[]];
  for (const p of soft) {
    pieces[pieces.length - 1].push(p);
    if (cornerAt.has(`${p.x},${p.y}`)) pieces.push([p]);
  }
  const points: PathPoint[] = [{ x: soft[0].x, y: soft[0].y }];
  for (const piece of pieces) {
    if (piece.length < 2) continue;
    if (piece.length === 2) {
      points.push({ x: piece[1].x, y: piece[1].y });
      continue;
    }
    const t1 = unit(piece[0], piece[Math.min(2, piece.length - 1)]);
    const t2 = unit(piece[piece.length - 1], piece[Math.max(0, piece.length - 3)]);
    for (const c of fitCurve(piece, tol, t1, t2)) points.push({ x: c[3].x, y: c[3].y, c1: { x: c[1].x, y: c[1].y }, c2: { x: c[2].x, y: c[2].y } });
  }
  return points.length >= 2 ? { closed: false, points } : null;
}

export function cleanLineShape(input: V[], color: string, width: number): PathShape | null {
  // A lone click is a dot: a tiny line with round ends.
  const pts = input.length === 1 ? [input[0], { x: input[0].x + 0.01, y: input[0].y }] : input;
  const sp = fitCleanLine(pts, Math.max(0.5, width * 0.35));
  if (!sp) return null;
  return { id: uid('sh'), type: 'path', paths: [sp], fill: null, stroke: { color, width, join: 'round', cap: 'round' }, opacity: 1 };
}

/** A clean line in progress, previewed as the straight polyline the hand made (cheap), fitted once on release. */
export class CleanLine {
  private points: V[] = [];
  constructor(
    private color: string,
    private width: number,
  ) {}

  add(e: ToolPointer, zoom: number): void {
    const last = this.points[this.points.length - 1];
    if (last && Math.hypot(e.x - last.x, e.y - last.y) * zoom < 0.5) return;
    this.points.push({ x: e.x, y: e.y });
  }

  overlay(g: CanvasRenderingContext2D): void {
    if (!this.points.length) return;
    g.save();
    g.lineWidth = this.width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = this.color;
    g.beginPath();
    g.moveTo(this.points[0].x, this.points[0].y);
    for (const p of this.points) g.lineTo(p.x, p.y);
    if (this.points.length === 1) g.lineTo(this.points[0].x + 0.01, this.points[0].y);
    g.stroke();
    g.restore();
  }

  commit(e: ToolPointer, zoom: number, ctx: ToolContext): void {
    this.add(e, zoom);
    const shape = cleanLineShape(this.points, this.color, this.width);
    if (!shape) return;
    const s = withWellGradients(shape);
    const r = addDrawn('Draw clean line', [s]).result;
    if (r === 'ok') noteColorUsed(this.color);
    else if (r !== 'nothing') reportEdit(ctx, r);
  }

  /** The finished shape, for drawing it exactly once it's fitted. */
  shape(): PathShape | null {
    return cleanLineShape(this.points, this.color, this.width);
  }

  draw(g: CanvasRenderingContext2D): void {
    const s = this.shape();
    if (s) drawWithMirror(g, s);
  }
}

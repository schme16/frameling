/**
 * A dry media stroke on a pixel layer. Dabs go along the pointer's path like the soft brushes', and each says how far the
 * stick reaches into the paper at every pixel. The stroke keeps the deepest reach per pixel (so crossing yourself does not
 * darken, and a new stroke over the old one does), and each pixel then takes pigment from that reach and the paper's
 * height there (see maths.ts). Every pixel is worked out from the picture as it was before the stroke.
 */
import type { Doc, PixelLayer } from '../core/format';
import type { RGBA } from '../canvas/pixels';
import { tileModeOn, wrap } from '../tiles/state';
import { dabStep, eachDabPixel, holdAt, mirrorCentres, MIN_SMOOTH_EDGE, paintOver, type EdgeMode } from '../soft/maths';
import { palettePicker, Walker, type PaintSurface, type Pt } from '../soft/stroke';
import { deposit, pitDepth, streakAt, type Medium } from './maths';
import { paperInfo, paperTile, TILE, type PaperKind } from './paper';

export interface DryParams {
  medium: Medium;
  paper: PaperKind;
  color: RGBA;
  hardness: number;
  edge: EdgeMode;
  /** Which stick the streaks come from. Left out, each stroke picks its own; a picture of a brush fixes it so it never changes. */
  seed?: number;
}

export class DryStroke {
  private readonly reach = new Map<number, number>();
  private readonly walk = new Walker();
  private readonly snap: ReturnType<typeof palettePicker>;
  private readonly w: number;
  private readonly h: number;
  private readonly base = new Uint8ClampedArray(4);
  private readonly out = new Uint8ClampedArray(4);
  private readonly tile: Uint8Array;
  private readonly tooth: number;
  /** The way the stick is being dragged (a unit step) and where the last dab was, so the stick's streaks run along the stroke. */
  private dirX = 1;
  private dirY = 0;
  private prev: Pt | null = null;
  private readonly seed: number;

  constructor(
    readonly session: PaintSurface,
    doc: Doc | null,
    layer: PixelLayer | null,
    private readonly p: DryParams,
  ) {
    this.snap = palettePicker(doc, layer);
    this.seed = p.seed ?? (Math.random() * 1e9) | 0;
    this.w = session.width;
    this.h = session.height;
    this.tile = paperTile(p.paper);
    this.tooth = paperInfo(p.paper).tooth;
  }

  private touch(x: number, y: number, v: number): void {
    if (tileModeOn()) {
      x = wrap(x, this.w);
      y = wrap(y, this.h);
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const key = y * this.w + x;
    const have = this.reach.get(key) ?? 0;
    const next = holdAt(have, v);
    if (next <= have) return;
    this.reach.set(key, next);
    const was = this.session.getBase(x, y);
    const b = this.base;
    b[0] = was[0];
    b[1] = was[1];
    b[2] = was[2];
    b[3] = was[3];
    const height = this.tile[(((y % TILE) + TILE) % TILE) * TILE + (((x % TILE) + TILE) % TILE)] / 255;
    let a = deposit(next, pitDepth(height, this.tooth, this.p.medium.tooth), b[3] / 255, this.p.medium);
    if (this.p.edge === 'crisp') a = a >= 0.5 * this.p.medium.ceiling ? 1 : 0;
    if (a <= 0) return;
    const o = this.out;
    paintOver(b, 0, this.p.color, a, o);
    this.snap?.(o);
    this.session.set(x, y, [o[0], o[1], o[2], o[3]]);
  }

  private dab(at: Pt, diameter: number, strength: number): void {
    const m = this.session.mirror;
    const minEdge = this.p.edge === 'smooth' ? MIN_SMOOTH_EDGE : 0;
    const streak = this.p.medium.streak;
    const { dirX, dirY } = this;
    for (const c of mirrorCentres(m.mode, m.ax2, m.ay2, at.x, at.y)) {
      eachDabPixel(c.x, c.y, diameter, this.p.hardness, minEdge, (x, y, cov) => {
        // How far this pixel is to the side of the stroke's middle line decides how much of the stick's bumps it feels.
        const across = (y + 0.5 - c.y) * dirX - (x + 0.5 - c.x) * dirY;
        const bumpy = streak > 0 ? 1 - streak * streakAt(across, this.seed) : 1;
        this.touch(x, y, Math.min(1, cov * strength * bumpy));
      });
    }
  }

  /** Moves the stick to `to` (art pixels, fractions allowed), laying dabs on the way. `strength` is how hard you press, 0 to 1. */
  moveTo(to: Pt, diameter: number, strength: number): void {
    for (const at of this.walk.to(to, dabStep(diameter))) {
      if (this.prev) {
        const dx = at.x - this.prev.x;
        const dy = at.y - this.prev.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-6) {
          // Turn toward the new heading a little at a time, so a corner does not make the streaks jump.
          const k = this.prev && len > 0 ? 0.35 : 1;
          this.dirX += (dx / len - this.dirX) * k;
          this.dirY += (dy / len - this.dirY) * k;
          const n = Math.hypot(this.dirX, this.dirY) || 1;
          this.dirX /= n;
          this.dirY /= n;
        }
      }
      this.prev = at;
      this.dab(at, diameter, strength);
    }
  }
}


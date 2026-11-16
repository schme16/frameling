/**
 * Soft strokes on a pixel layer. A stroke lays dabs along the pointer's path; each dab says how much of the brush
 * reaches each pixel, and the stroke keeps the strongest of them per pixel (so crossing yourself does not darken, and
 * a new stroke over the old one does). Every pixel is then worked out from the picture as it was before the stroke, so
 * a pixel is never painted twice over. Smudge is the odd one out: it carries colour along instead of laying it down.
 */
import type { Doc, PixelLayer } from '../core/format';
import type { RGBA } from '../canvas/pixels';
import { tileModeOn, wrap } from '../tiles/state';
import type { PixelSession } from '../tools/pixelSession';
import { docPalette, NearestCache, paletteAlpha, paletteRgb } from '../pixel/palette';
import { buildUp, crispen, dabStep, eachDabPixel, falloff, holdAt, mirrorCentres, MIN_SMOOTH_EDGE, mixPixels, pickPixel, softColor, type EdgeMode, type SoftKind } from './maths';

export interface SoftParams {
  kind: SoftKind;
  color: RGBA;
  hardness: number;
  edge: EdgeMode;
}

export interface Pt {
  x: number;
  y: number;
}

/** Walks a pointer's path in even steps, so the dabs are the same distance apart however fast the hand moves. */
export class Walker {
  private last: Pt | null = null;
  private owed = 0;

  /** The points to put a dab at to get from the last point to `to` (the first call gives `to` itself). */
  to(to: Pt, step: number): Pt[] {
    const from = this.last;
    this.last = to;
    if (!from) return [to];
    const out: Pt[] = [];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return out;
    let d = step - this.owed;
    while (d <= len) {
      out.push({ x: from.x + (dx * d) / len, y: from.y + (dy * d) / len });
      d += step;
    }
    this.owed = len - (d - step);
    return out;
  }

  get at(): Pt | null {
    return this.last;
  }
}

/** What a stroke needs from the picture it paints on. A pixel session is one; a picture of a brush in the Library is another. */
export type PaintSurface = Pick<PixelSession, 'width' | 'height' | 'mirror' | 'get' | 'getBase' | 'set'>;

export function palettePicker(doc: Doc | null, layer: PixelLayer | null): ((c: number[] | Uint8Array | Uint8ClampedArray) => void) | null {
  if (!doc || !layer?.paletteLock) return null;
  const colors = docPalette(doc).colors;
  const rgb = paletteRgb(colors);
  if (!rgb.length) return null;
  const solid = paletteAlpha(colors);
  const near = new NearestCache(rgb);
  return (c) => {
    if (c[3] === 0) return;
    const n = near.get(c[0], c[1], c[2]);
    const k = n * 3;
    c[0] = rgb[k];
    c[1] = rgb[k + 1];
    c[2] = rgb[k + 2];
    c[3] = solid[n];
  };
}

export class SoftStroke {
  private readonly acc = new Map<number, number>();
  private readonly walk = new Walker();
  private readonly snap: ReturnType<typeof palettePicker>;
  private readonly w: number;
  private readonly h: number;
  private readonly base = new Uint8ClampedArray(4);
  private readonly out = new Uint8ClampedArray(4);

  constructor(
    readonly session: PaintSurface,
    doc: Doc | null,
    layer: PixelLayer | null,
    private readonly p: SoftParams,
  ) {
    this.snap = palettePicker(doc, layer);
    this.w = session.width;
    this.h = session.height;
  }

  /** Puts the stroke's strength on a pixel and repaints it. */
  private touch(x: number, y: number, v: number, hold: boolean): void {
    if (tileModeOn()) {
      x = wrap(x, this.w);
      y = wrap(y, this.h);
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const key = y * this.w + x;
    const have = this.acc.get(key) ?? 0;
    const next = hold ? buildUp(have, v) : holdAt(have, v);
    if (next <= have) return;
    this.acc.set(key, next);
    const cov = this.p.edge === 'crisp' ? crispen(next, x, y) : next;
    const b = this.base;
    const o = this.out;
    const was = this.session.getBase(x, y);
    b[0] = was[0];
    b[1] = was[1];
    b[2] = was[2];
    b[3] = was[3];
    if (!softColor(this.p.kind, b, 0, this.p.color, cov, o)) return;
    this.snap?.(o);
    this.session.set(x, y, [o[0], o[1], o[2], o[3]]);
  }

  private dab(at: Pt, diameter: number, strength: number, hold: boolean): void {
    const m = this.session.mirror;
    const minEdge = this.p.edge === 'smooth' ? MIN_SMOOTH_EDGE : 0;
    for (const c of mirrorCentres(m.mode, m.ax2, m.ay2, at.x, at.y)) eachDabPixel(c.x, c.y, diameter, this.p.hardness, minEdge, (x, y, cov) => this.touch(x, y, Math.min(1, cov * strength), hold));
  }

  /** Moves the brush to `to` (art pixels, fractions allowed), laying dabs on the way. `strength` is the flow with the pen's pressure on it. */
  moveTo(to: Pt, diameter: number, strength: number): void {
    for (const at of this.walk.to(to, dabStep(diameter))) this.dab(at, diameter, strength, false);
  }

  /** Holding still: a little more paint where the brush is (the airbrush). */
  hold(diameter: number, strength: number): void {
    const at = this.walk.at;
    if (at) this.dab(at, diameter, strength * 0.35, true);
  }
}

/** Smudge: picks up the colour under the brush where you press, and drags it along, leaving it behind as it fades. */
export class SmudgeStroke {
  private readonly walk = new Walker();
  private carry: Uint8ClampedArray | null = null;
  /** The patch of carried colour is made once, big enough for the biggest the brush gets (pressure can grow it). */
  private readonly n: number;
  private readonly mixed = [0, 0, 0, 0];

  constructor(
    readonly session: PaintSurface,
    private readonly p: SoftParams,
    maxDiameter: number,
  ) {
    this.n = Math.ceil(Math.max(0.5, maxDiameter) / 2) * 2 + 3;
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.session.width && y < this.session.height;
  }

  private dab(at: Pt, diameter: number, strength: number): void {
    const r = Math.max(0.5, diameter / 2);
    const n = this.n;
    const half = (n - 1) / 2;
    const cx = Math.round(at.x);
    const cy = Math.round(at.y);
    const first = !this.carry;
    if (!this.carry) this.carry = new Uint8ClampedArray(n * n * 4);
    const carry = this.carry;
    const pickup = 1 - strength;
    const crisp = this.p.edge === 'crisp';
    const reach = Math.min(half, Math.ceil(r) + 1);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (!this.inside(x, y)) continue;
        const cov = falloff(Math.hypot(dx, dy), r, this.p.hardness, 0);
        if (cov <= 0) continue;
        const i = ((dy + half) * n + (dx + half)) * 4;
        const now = this.session.get(x, y);
        if (first) {
          carry[i] = now[0];
          carry[i + 1] = now[1];
          carry[i + 2] = now[2];
          carry[i + 3] = now[3];
          continue;
        }
        const c: RGBA = [carry[i], carry[i + 1], carry[i + 2], carry[i + 3]];
        const m = this.mixed;
        if (crisp) pickPixel(now, c, cov * strength, x, y, m);
        else mixPixels(now, c, cov * strength, m);
        this.session.set(x, y, [m[0], m[1], m[2], m[3]]);
        // What is carried fades toward what the brush is passing over.
        if (crisp) pickPixel(c, now, pickup * cov, x, y, m);
        else mixPixels(c, now, pickup * cov, m);
        carry[i] = m[0];
        carry[i + 1] = m[1];
        carry[i + 2] = m[2];
        carry[i + 3] = m[3];
      }
    }
  }

  moveTo(to: Pt, diameter: number, strength: number): void {
    for (const at of this.walk.to(to, Math.max(1, dabStep(diameter)))) this.dab(at, diameter, Math.min(0.95, strength));
  }
}

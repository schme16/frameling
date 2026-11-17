/**
 * Pixel brush maths: a stroke as a row of dabs. The brush says what one dab looks like (a round, square or picture tip,
 * with a size, a hardness, an angle and a roundness) and how dabs are laid (spacing, scatter, jitter, turning with the
 * line). Everything here is a pure function or a small class with no DOM, so the maths can be tested on its own.
 */
import { readPixelStamp, type PixelStamp } from '../brushes/stamps';
import { MIN_SMOOTH_EDGE, mirrorCentres } from '../soft/maths';
import type { BlendMode } from '../core/format';
import { cleanBlend } from './blend';
import { cleanRoutes, effectsOf, FADE_DEFAULT, FADE_RANGE, lerpInputs, newEffects, NEUTRAL, sameRoutes, type DynRoute, type Effects, type Inputs } from './dynamics';
import { cleanDual, cleanGrain, sameDual, sameGrain, type Dual, type Grain } from './texture';

export type TipShape = 'round' | 'square' | 'picture';
export const TIP_SHAPES: TipShape[] = ['round', 'square', 'picture'];

/** One pixel brush: everything that makes its dab and how dabs follow each other. Colour is never part of it. */
export interface DabBrush {
  tip: TipShape;
  /** The picture a picture tip paints with (up to 32 by 32). Kept with the brush so a saved brush carries it. */
  picture: PixelStamp | null;
  /** Pixels across (for a picture, its longer side: 1 is the picture as it was drawn when it is that many pixels). */
  size: number;
  /** 0 (soft all the way in) to 1 (a hard edge). Round and square tips only. */
  hardness: number;
  /** Degrees, 0 to 359. */
  angle: number;
  /** 0.05 (a thin sliver) to 1 (a full circle or square): how flat the tip is. */
  roundness: number;
  /** The tip turns to point along the line as you draw, on top of its own angle. */
  follow: boolean;
  /** How far apart dabs are, as a share of the size. 0.25 is a quarter of the width; 1 is side by side. */
  spacing: number;
  /** How far a dab may land away from the line, as a share of the size. 0 keeps them on it. */
  scatter: number;
  /** How much smaller a dab may be, 0 (all one size) to 1 (down to nothing). */
  sizeJitter: number;
  /** How far a dab's angle may stray from the tip's, as a share of half a turn. */
  angleJitter: number;
  /** How much paint one dab lays down. Under 1 it builds up as dabs overlap. */
  flow: number;
  /** The most paint any pixel gets in one stroke, however many dabs cross it. */
  opacity: number;
  /** True: every pixel is all or nothing (no anti-aliasing). False: a smooth, see-through edge. */
  aliased: boolean;
  /** What the pen, the hand and the stroke do to each dab (see dynamics.ts). Empty: nothing, every dab the same. */
  dynamics: DynRoute[];
  /** How many pixels of line a "fade" source takes to run out. */
  fadeLength: number;
  /** A paper the paint catches on, or null for none (see texture.ts). */
  grain: Grain | null;
  /** A second tip the first is let through, or null for none. */
  dual: Dual | null;
  /** 0 (paints its own colour) to 1 (carries the colour it passes over along the stroke, like wet paint). */
  wet: number;
  /** How the paint joins what is on the layer: normal, or a blend mode like a layer's (see blend.ts). */
  blend: BlendMode;
}

export const SIZE_RANGE = { min: 1, max: 300 };
export const SPACING_RANGE = { min: 0.01, max: 4 };
export const SCATTER_RANGE = { min: 0, max: 2 };
export const FLOW_RANGE = { min: 0.05, max: 1 };
export const ROUND_RANGE = { min: 0.05, max: 1 };
/** No two dabs closer than this, in pixels, whatever the spacing says: under it they land on the same pixels anyway. */
export const MIN_STEP = 0.5;

export const DEFAULT_DAB: DabBrush = {
  tip: 'round',
  picture: null,
  size: 6,
  hardness: 1,
  angle: 0,
  roundness: 1,
  follow: false,
  spacing: 0.25,
  scatter: 0,
  sizeJitter: 0,
  angleJitter: 0,
  flow: 1,
  opacity: 1,
  aliased: true,
  dynamics: [],
  fadeLength: FADE_DEFAULT,
  grain: null,
  dual: null,
  wet: 0,
  blend: 'normal',
};

const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** A brush read from saved or shared data. Anything missing or odd takes its default, and nothing stays out of range. */
export function cleanDab(raw: unknown, base: DabBrush = DEFAULT_DAB): DabBrush {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const picture = r.picture === null ? null : (readPixelStamp(r.picture) ?? (r.picture === undefined ? base.picture : null));
  let tip: TipShape = TIP_SHAPES.includes(r.tip as TipShape) ? (r.tip as TipShape) : base.tip;
  // A picture tip with no picture has nothing to paint with.
  if (tip === 'picture' && !picture) tip = 'round';
  const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
  return {
    tip,
    picture,
    size: Math.round(num(r.size, SIZE_RANGE.min, SIZE_RANGE.max, base.size)),
    hardness: round3(num(r.hardness, 0, 1, base.hardness)),
    angle: Math.round(((num(r.angle, -3600, 3600, base.angle) % 360) + 360) % 360),
    roundness: round3(num(r.roundness, ROUND_RANGE.min, ROUND_RANGE.max, base.roundness)),
    follow: bool(r.follow, base.follow),
    spacing: round3(num(r.spacing, SPACING_RANGE.min, SPACING_RANGE.max, base.spacing)),
    scatter: round3(num(r.scatter, SCATTER_RANGE.min, SCATTER_RANGE.max, base.scatter)),
    sizeJitter: round3(num(r.sizeJitter, 0, 1, base.sizeJitter)),
    angleJitter: round3(num(r.angleJitter, 0, 1, base.angleJitter)),
    flow: round3(num(r.flow, FLOW_RANGE.min, 1, base.flow)),
    opacity: round3(num(r.opacity, FLOW_RANGE.min, 1, base.opacity)),
    aliased: bool(r.aliased, base.aliased),
    dynamics: r.dynamics === undefined ? base.dynamics : cleanRoutes(r.dynamics),
    fadeLength: Math.round(num(r.fadeLength, FADE_RANGE.min, FADE_RANGE.max, base.fadeLength)),
    grain: r.grain === undefined ? base.grain : cleanGrain(r.grain),
    dual: r.dual === undefined ? base.dual : cleanDual(r.dual),
    wet: round3(num(r.wet, 0, 1, base.wet)),
    blend: cleanBlend(r.blend, base.blend),
  };
}

/** True when two brushes make the same marks (numbers within a hair, since a slider can leave rounding behind). */
export function sameDab(a: DabBrush, b: DabBrush): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  // The picture only counts when a picture tip is using it.
  const pic = (a.tip !== 'picture' && b.tip !== 'picture') || (a.picture === null && b.picture === null) || (!!a.picture && !!b.picture && a.picture.w === b.picture.w && a.picture.h === b.picture.h && a.picture.keep === b.picture.keep && !!a.picture.soft === !!b.picture.soft && a.picture.cells.join() === b.picture.cells.join() && a.picture.colours.join() === b.picture.colours.join());
  return (
    a.tip === b.tip && pic && close(a.size, b.size) && close(a.hardness, b.hardness) && close(a.angle, b.angle) && close(a.roundness, b.roundness) && a.follow === b.follow &&
    close(a.spacing, b.spacing) && close(a.scatter, b.scatter) && close(a.sizeJitter, b.sizeJitter) && close(a.angleJitter, b.angleJitter) && close(a.flow, b.flow) && close(a.opacity, b.opacity) && a.aliased === b.aliased &&
    sameRoutes(a.dynamics, b.dynamics) && close(a.fadeLength, b.fadeLength) && sameGrain(a.grain, b.grain) && sameDual(a.dual, b.dual) && close(a.wet, b.wet) && a.blend === b.blend
  );
}

/** The distance between dabs for a brush this wide: its spacing share of the width, and never under half a pixel. */
export const stepFor = (size: number, spacing: number): number => Math.max(MIN_STEP, Math.max(0.5, size) * spacing);

/** Where the middle of a dab goes on an axis when whole pixels are wanted: an odd width centres on a pixel, an even one on a pixel corner. */
export const snapAxis = (v: number, across: number): number => (Math.round(across) % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v));

// ---------------------------------------------------------------- the picture tip

/** A picture tip made ready to sample: which cells have paint, and the colour and see-through of each. */
export interface Picture {
  w: number;
  h: number;
  /** 1 where the picture has paint, 0 where it is clear (a soft tip has the shades between). */
  mask: Float32Array;
  /** Each cell's own colour (r, g, b, a), for a picture that keeps its colours. */
  rgba: Uint8Array;
  keep: boolean;
}

const made = new WeakMap<PixelStamp, Picture>();

/** A picture brush made ready for sampling. Made once per picture, then kept. */
export function pictureOf(st: PixelStamp): Picture {
  const have = made.get(st);
  if (have) return have;
  const cols = st.colours.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), h.length > 7 ? parseInt(h.slice(7, 9), 16) : 255]);
  const mask = new Float32Array(st.w * st.h);
  const rgba = new Uint8Array(st.w * st.h * 4);
  for (let i = 0; i < mask.length; i++) {
    const k = st.cells[i];
    if (k > 0) {
      const c = cols[k - 1];
      // A soft tip lays down as much paint as the cell's see-through says; any other tip is all or nothing.
      mask[i] = st.soft ? c[3] / 255 : 1;
      rgba[i * 4] = c[0];
      rgba[i * 4 + 1] = c[1];
      rgba[i * 4 + 2] = c[2];
      rgba[i * 4 + 3] = c[3];
    }
  }
  const p = { w: st.w, h: st.h, mask, rgba, keep: st.keep };
  made.set(st, p);
  return p;
}

// ---------------------------------------------------------------- one dab

/** One dab to lay: where, how wide, which way round (radians) and how much paint. */
export interface Dab {
  x: number;
  y: number;
  size: number;
  angle: number;
  flow: number;
  /** The most paint this dab may leave on a pixel (a share of the brush's opacity), left out when nothing drives it. */
  cap?: number;
  /** Colour pushes from the brush's dynamics, left out when there are none (see dynamics.ts). */
  mix?: number;
  hue?: number;
  sat?: number;
  light?: number;
}

/** What a dab says about the pixel at an offset from its middle. */
export interface Sampler {
  /** How much of the tip reaches a pixel `dx, dy` from the dab's middle, 0 to 1. */
  cov(dx: number, dy: number): number;
  /** After a `cov` on a picture tip: the colour of the cell it landed on (r, g, b, a). Not set for the other tips. */
  cell: Uint8Array;
  /** How far from the middle a dab can reach, in pixels. */
  reach: number;
  /** The width the dab is snapped to the pixel grid by, per axis. */
  acrossX: number;
  acrossY: number;
}

/**
 * Makes the sampler for one dab. `crisp` keeps the edge sharp (a pixel is in or out); otherwise the edge is at least
 * about a pixel wide, so a hard brush is still anti-aliased. Hardness shapes the fall from solid to nothing.
 */
export function samplerFor(b: DabBrush, size: number, angle: number, crisp: boolean): Sampler {
  const rho = b.roundness;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cell = new Uint8Array(4);
  if (b.tip === 'picture' && b.picture) {
    const pic = pictureOf(b.picture);
    const s = Math.max(0.01, size) / Math.max(pic.w, pic.h);
    const hw = pic.w / 2;
    const hh = pic.h / 2;
    const inv = 1 / s;
    const invRho = inv / rho;
    const { mask, rgba, w, h } = pic;
    const reach = Math.hypot(pic.w * s, pic.h * s * rho) / 2;
    const at = (ix: number, iy: number): number => (ix < 0 || iy < 0 || ix >= w || iy >= h ? 0 : mask[iy * w + ix]);
    return {
      cell,
      reach,
      acrossX: Math.round(pic.w * s),
      acrossY: Math.round(pic.h * s),
      cov(dx, dy) {
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        const fx = u * inv + hw;
        const fy = v * invRho + hh;
        let ix = Math.floor(fx);
        let iy = Math.floor(fy);
        let c: number;
        if (crisp) {
          c = at(ix, iy);
        } else {
          // Smooth: blend the four cells round this spot, so a turned or resized picture has a soft edge. The colour comes
          // from whichever painted cell counts most.
          const gx = fx - 0.5;
          const gy = fy - 0.5;
          const jx = Math.floor(gx);
          const jy = Math.floor(gy);
          const tx = gx - jx;
          const ty = gy - jy;
          const w00 = at(jx, jy) * (1 - tx) * (1 - ty);
          const w10 = at(jx + 1, jy) * tx * (1 - ty);
          const w01 = at(jx, jy + 1) * (1 - tx) * ty;
          const w11 = at(jx + 1, jy + 1) * tx * ty;
          c = w00 + w10 + w01 + w11;
          const top = Math.max(w00, w10, w01, w11);
          ix = top === w00 ? jx : top === w10 ? jx + 1 : top === w01 ? jx : jx + 1;
          iy = top === w00 ? jy : top === w10 ? jy : jy + 1;
        }
        if (c <= 0) return 0;
        const k = (iy * w + ix) * 4;
        cell[0] = rgba[k];
        cell[1] = rgba[k + 1];
        cell[2] = rgba[k + 2];
        cell[3] = rgba[k + 3];
        return c;
      },
    };
  }
  // A smooth dab under two pixels wide is drawn as a two pixel one with its paint scaled by how much narrower it is. Its own
  // edge (at least a pixel wide) would otherwise leave no pixel under a thin line that falls between two rows, so a hair
  // line came and went with where the pen happened to be. A crisp dab sits on whole pixels already and is left as it is.
  const thin = !crisp && size < 2;
  const gain = thin ? Math.max(0.5, size) / 2 : 1;
  const r = thin ? 1 : Math.max(0.5, size / 2);
  const w = Math.max((1 - b.hardness) * r, crisp ? 0 : MIN_SMOOTH_EDGE);
  const inner = r - w;
  const inner2 = inner > 0 ? inner * inner : -1;
  const r2 = r * r;
  const invRho = 1 / rho;
  const square = b.tip === 'square';
  const reach = square ? Math.hypot(r, r * rho) : r;
  const fall = (d: number): number => {
    const t = (d - inner) / w;
    return t <= 0 ? 1 : 1 - t * t * (3 - 2 * t);
  };
  const across = Math.round(size);
  return {
    cell,
    reach,
    acrossX: across,
    acrossY: across,
    cov(dx, dy) {
      const u = dx * cos + dy * sin;
      const v = (-dx * sin + dy * cos) * invRho;
      if (square) {
        const d = Math.max(Math.abs(u), Math.abs(v));
        if (d >= r) return 0;
        if (w <= 0 || d <= inner) return gain;
        return fall(d) * gain;
      }
      const d2 = u * u + v * v;
      if (d2 >= r2) return 0;
      if (w <= 0 || d2 <= inner2) return gain;
      return fall(Math.sqrt(d2)) * gain;
    },
  };
}

/** How far a dab of this size reaches, for working out the box of pixels to look at. */
export const reachOf = (b: DabBrush, size: number): number => samplerFor(b, size, 0, true).reach;

/** The dab and its images across the mirror lines (positions and turns), for mirror drawing. Just the dab when mirror is off. */
export function mirrorDabs(mode: 'off' | 'h' | 'v' | 'both', ax2: number, ay2: number, d: Dab): Dab[] {
  const pts = mirrorCentres(mode, ax2, ay2, d.x, d.y);
  if (pts.length === 1) return [d];
  // Mirroring across a vertical line turns an angle a into half a turn minus a; across a horizontal line, minus a.
  const flips: ('h' | 'v' | 'both')[] = mode === 'h' ? ['h'] : mode === 'v' ? ['v'] : ['h', 'v', 'both'];
  const out = [d];
  flips.forEach((f, i) => out.push({ ...d, x: pts[i + 1].x, y: pts[i + 1].y, angle: f === 'h' ? Math.PI - d.angle : f === 'v' ? -d.angle : Math.PI + d.angle }));
  return out;
}

// ---------------------------------------------------------------- the path of dabs

/** A small, seedable source of 0 to 1 numbers (mulberry32), so a stroke's scatter can be repeated in a test. */
export function makeRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pt {
  x: number;
  y: number;
}

/** What the pen and hand are doing at one pointer event (see Inputs in dynamics.ts); a missing source means the device lacks it. */
export type Sense = Pick<Inputs, 'pressure' | 'tilt' | 'twist' | 'speed'>;

/** A place along the line where a dab goes, with how big it is there and what the dynamics make of it. */
interface Spot extends Pt {
  size: number;
  flow: number;
  fx: Effects;
}

/**
 * Walks a pointer's path and says where each dab goes, how big and which way round it is. Spacing is a share of the
 * brush's size, so the dabs sit the same distance apart however fast the hand moves, and when the size changes along the
 * line (pressure, speed, fading out) the gap follows it. With `follow` on, a dab turns to point along the line, and the very
 * first one waits until the line has a direction.
 */
export class DabPath {
  private last: Pt | null = null;
  private lastSense: Sense = {};
  private lastSize = 0;
  private lastFlow = 1;
  private owed = 0;
  private step = 0.5;
  private travelled = 0;
  private heading = 0;
  private dirX = 1;
  private dirY = 0;
  private prev: Pt | null = null;
  private waiting: Spot | null = null;
  private any = false;
  private readonly routes: readonly DynRoute[];
  private readonly inputs: Inputs = {};
  private readonly sense: Sense = {};

  constructor(
    private readonly b: DabBrush,
    private readonly rng: () => number,
  ) {
    this.routes = b.dynamics;
  }

  /** The dab spot at a point, with the dynamics worked out for it (the shared neutral push when the brush has none). */
  private spot(at: Pt, size: number, flow: number, s: Sense): Spot {
    if (this.routes.length === 0) return { x: at.x, y: at.y, size, flow, fx: NEUTRAL };
    const i = this.inputs;
    i.pressure = s.pressure;
    i.tilt = s.tilt;
    i.twist = s.twist;
    i.speed = s.speed;
    i.heading = this.heading;
    i.travelled = this.travelled;
    i.random = this.rng;
    const fx = effectsOf(this.routes, i, this.b.fadeLength, newEffects());
    return { x: at.x, y: at.y, size: Math.max(0.5, size * fx.size), flow: Math.min(1, flow * fx.flow), fx };
  }

  /** Points along the way from the last point to `to`, a step apart (the first call gives `to` itself). */
  private walk(to: Pt, size: number, flow: number, sense: Sense): Spot[] {
    const from = this.last;
    const s0 = this.lastSense;
    const size0 = this.lastSize;
    const flow0 = this.lastFlow;
    this.last = to;
    this.lastSense = { ...sense };
    this.lastSize = size;
    this.lastFlow = flow;
    if (!from) {
      const sp = this.spot(to, size, flow, sense);
      this.step = stepFor(sp.size, this.b.spacing);
      return [sp];
    }
    const out: Spot[] = [];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return out;
    this.heading = Math.atan2(dy, dx);
    const plain = this.routes.length === 0;
    let d = this.step - this.owed;
    const base = this.travelled;
    while (d <= len) {
      const k = d / len;
      const at = { x: from.x + dx * k, y: from.y + dy * k };
      // Without dynamics the size is the event's own all along the segment, as it always was.
      const sz = plain ? size : size0 + (size - size0) * k;
      const fl = plain ? flow : flow0 + (flow - flow0) * k;
      this.travelled = base + d;
      const sp = this.spot(at, sz, fl, plain ? sense : lerpInputs(s0, sense, k, this.sense));
      out.push(sp);
      this.step = stepFor(sp.size, this.b.spacing);
      d += this.step;
    }
    this.owed = len - (d - this.step);
    this.travelled = base + len;
    return out;
  }

  /** One dab at a spot, with the brush's jitter and scatter on it. */
  private make(at: Spot): Dab {
    const b = this.b;
    const rng = this.rng;
    const size = at.size;
    let x = at.x;
    let y = at.y;
    const scatter = b.scatter + at.fx.scatter;
    if (scatter > 0) {
      const a = rng() * Math.PI * 2;
      const r = scatter * size * Math.sqrt(rng());
      x += Math.cos(a) * r;
      y += Math.sin(a) * r;
    }
    const s = b.sizeJitter > 0 ? Math.max(0.5, size * (1 - b.sizeJitter * rng())) : size;
    let angle = (b.angle * Math.PI) / 180 + at.fx.angle;
    if (b.follow) angle += Math.atan2(this.dirY, this.dirX);
    if (b.angleJitter > 0) angle += (rng() * 2 - 1) * Math.PI * b.angleJitter;
    const d: Dab = { x, y, size: s, angle, flow: at.flow };
    const fx = at.fx;
    if (fx.opacity < 1) d.cap = fx.opacity;
    if (fx.mix) d.mix = fx.mix;
    if (fx.hue) d.hue = fx.hue;
    if (fx.sat) d.sat = fx.sat;
    if (fx.light) d.light = fx.light;
    return d;
  }

  /** Turns toward the heading from the last dab to this one, a little at a time so a corner does not make the tip jump. */
  private steer(to: Pt): void {
    const p = this.prev;
    if (!p) return;
    const dx = to.x - p.x;
    const dy = to.y - p.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    this.dirX += (dx / len - this.dirX) * 0.5;
    this.dirY += (dy / len - this.dirY) * 0.5;
    const n = Math.hypot(this.dirX, this.dirY) || 1;
    this.dirX /= n;
    this.dirY /= n;
  }

  /**
   * The dabs to lay to get to `to`. `size` is how wide the brush is right now (the pen page can change it) and `flow` the
   * paint per dab. `sense` says what the pen and hand are doing, for the brush's own dynamics.
   */
  to(to: Pt, size: number, flow: number, sense: Sense = {}): Dab[] {
    const out: Dab[] = [];
    for (const at of this.walk(to, size, flow, sense)) {
      if (this.b.follow && !this.prev && !this.any) {
        // The first dab waits for a direction.
        if (!this.waiting) {
          this.waiting = at;
          this.prev = at;
          continue;
        }
      }
      if (this.waiting) {
        const w = this.waiting;
        this.waiting = null;
        const dx = at.x - w.x;
        const dy = at.y - w.y;
        const len = Math.hypot(dx, dy) || 1;
        this.dirX = dx / len;
        this.dirY = dy / len;
        out.push(this.make(w));
        this.any = true;
        this.prev = w;
      }
      this.steer(at);
      this.prev = at;
      out.push(this.make(at));
      this.any = true;
    }
    return out;
  }

  /** The stroke is over: a dab still waiting for a direction (a single click) is laid at the tip's own angle. */
  end(): Dab[] {
    const w = this.waiting;
    this.waiting = null;
    if (!w) return [];
    this.any = true;
    return [this.make(w)];
  }
}

/**
 * A pixel brush stroke: dabs laid along the pointer's path (see maths.ts), each one reaching the pixels under its tip.
 * The stroke keeps how much paint it has put on every pixel (flow builds it up dab by dab, opacity is the ceiling), and
 * every pixel is worked out from the picture as it was before the stroke, so a pixel is never painted over itself.
 * With a crisp edge a pixel is all or nothing: the paint is dithered, so only colours that already exist are used.
 */
import type { Doc, PixelLayer } from '../core/format';
import type { RGBA } from '../canvas/pixels';
import { tileModeOn, wrap } from '../tiles/state';
import { PixelSession } from '../tools/pixelSession';
import { threshold, paintOver, mixTowards, type EdgeMode } from '../soft/maths';
import { palettePicker, type Pt } from '../soft/stroke';
import type { BlendMode } from '../core/format';
import { blendPaint } from './blend';
import { shiftColour, mixRgb, pickUp, type Rgb } from './colour';
import { touchesColour } from './dynamics';
import { DabPath, makeRng, mirrorDabs, samplerFor, snapAxis, type Dab, type DabBrush, type Sampler, type Sense } from './maths';
import { dualAt, dualTile, grainCut, grainTile } from './texture';
import { TILE, type PaperKind } from '../dry/paper';

/** Somewhere a stroke reads the old picture from and writes new pixels to: a pixel session, or any buffer. */
export interface Surface {
  readonly width: number;
  readonly height: number;
  /** The pixel as it was before the stroke, written into `out` (r, g, b, a). */
  read(x: number, y: number, out: Uint8ClampedArray | number[]): void;
  write(x: number, y: number, r: number, g: number, b: number, a: number): void;
  /** The pixel as it is now, with what this stroke has already put there. Left out: the same as `read`. */
  now?(x: number, y: number, out: Uint8ClampedArray | number[]): void;
}

/** A pixel session as a surface. */
export function sessionSurface(s: PixelSession): Surface {
  const px: [number, number, number, number] = [0, 0, 0, 0];
  return {
    width: s.width,
    height: s.height,
    read(x, y, out) {
      s.baseInto(x, y, out);
    },
    now(x, y, out) {
      const c = s.get(x, y);
      out[0] = c[0];
      out[1] = c[1];
      out[2] = c[2];
      out[3] = c[3];
    },
    write(x, y, r, g, b, a) {
      px[0] = r;
      px[1] = g;
      px[2] = b;
      px[3] = a;
      s.set(x, y, px);
    },
  };
}

/** A plain RGBA buffer as a surface (for pictures of a brush, and for tests). The buffer is written in place. */
export function bufferSurface(pixels: Uint8ClampedArray, width: number, height: number): Surface {
  const was = pixels.slice();
  return {
    width,
    height,
    read(x, y, out) {
      const i = (y * width + x) * 4;
      out[0] = was[i];
      out[1] = was[i + 1];
      out[2] = was[i + 2];
      out[3] = was[i + 3];
    },
    now(x, y, out) {
      const i = (y * width + x) * 4;
      out[0] = pixels[i];
      out[1] = pixels[i + 1];
      out[2] = pixels[i + 2];
      out[3] = pixels[i + 3];
    },
    write(x, y, r, g, b, a) {
      const i = (y * width + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    },
  };
}

export interface DabParams {
  brush: DabBrush;
  color: RGBA;
  /** The back colour: where a brush whose colour mixes (a "mix" route in its dynamics) goes toward. The paint colour when left out. */
  back?: RGBA | null;
  /** Crisp: a pixel is all or nothing. Smooth: see-through edges. */
  edge: EdgeMode;
  /** The sheet's paper, for a grain that does not keep one of its own. Medium when left out. */
  sheet?: PaperKind;
  mirror?: { mode: 'off' | 'h' | 'v' | 'both'; ax2: number; ay2: number };
  /** Turns a pixel into one from the layer's palette, when the palette is locked. */
  snap?: ReturnType<typeof palettePicker>;
  /** Seeds the scatter and jitter, so a test can repeat a stroke. */
  seed?: number;
  /**
   * Retouch brushes (clone, blur, sharpen): instead of one flat colour, each pixel is mixed toward a colour worked out
   * from the picture. Given the pixel as it was before the stroke, it writes the colour this pixel should become into `out`.
   * The paint share the dab put there decides how far it goes, so flow, opacity, hardness and dynamics all work as usual.
   */
  pick?: (x: number, y: number, was: Uint8ClampedArray, out: Uint8ClampedArray | number[]) => void;
}

/** A brush's paint per pixel is kept in square blocks, made on first touch. */
const TS = 64;
const SHIFT = 6;
const MASK = TS - 1;

export class DabStroke {
  private readonly path: DabPath;
  private readonly tiles: (Float32Array | undefined)[];
  // Wet paint: the colour this stroke has laid on each pixel (a paint-weighted mix of every dab that touched it), in the same blocks.
  private readonly mixTiles: (Float32Array | undefined)[] | null;
  private readonly across: number;
  private readonly w: number;
  private readonly h: number;
  private readonly base = new Uint8ClampedArray(4);
  private readonly out = new Uint8ClampedArray(4);
  private readonly col: [number, number, number, number] = [0, 0, 0, 0];
  private readonly crisp: boolean;
  private readonly keep: boolean;
  private readonly blend: BlendMode;
  private readonly wrapEdges: boolean;
  // Texture: the paper and the dual dots, looked up per pixel, and where this stroke's own scatter of dots starts.
  private readonly grainTile: Uint8Array | null;
  private readonly grainDepth: number;
  private readonly grainScale: number;
  private readonly grainMoving: boolean;
  private readonly dual: Uint8Array | null;
  private readonly dualOx: number;
  private readonly dualOy: number;
  private gOx = 0;
  private gOy = 0;
  private readonly look: () => number;
  // Colour: the one a dab paints with, which dynamics and wet mode can move away from the colour picked.
  private readonly colourFx: boolean;
  private readonly cur: Rgb;
  // Counts dabs from 1, so a pixel's wet stamp says which dab last put paint on it (0 is never).
  private dabNo = 0;
  // A dab only picks up its own stroke's paint from pixels laid at least this many dabs ago: the trail just behind it is the brush's own wake, not paint it has met.
  private readonly wake: number;
  private readonly load: Rgb;
  private readonly under = new Uint8ClampedArray(4);

  constructor(
    private readonly surface: Surface,
    private readonly p: DabParams,
  ) {
    this.path = new DabPath(p.brush, makeRng(p.seed ?? (Math.random() * 1e9) | 0));
    this.w = surface.width;
    this.h = surface.height;
    this.across = Math.ceil(this.w / TS);
    this.tiles = new Array(this.across * Math.ceil(this.h / TS));
    this.crisp = p.edge === 'crisp';
    this.mixTiles = p.brush.wet > 0 && !p.pick && !(p.brush.tip === 'picture' && p.brush.picture?.keep) ? new Array(this.tiles.length) : null;
    this.blend = p.brush.blend;
    this.keep = p.brush.tip === 'picture' && !!p.brush.picture?.keep;
    this.wrapEdges = tileModeOn();
    const g = p.brush.grain;
    this.grainTile = g && g.depth > 0 ? grainTile(g, p.sheet) : null;
    this.grainDepth = g?.depth ?? 0;
    this.grainScale = g?.scale ?? 1;
    this.grainMoving = !!g?.moving;
    const d = p.brush.dual;
    this.dual = d ? dualTile(d) : null;
    const start = makeRng((p.seed ?? 1) + 77);
    this.dualOx = (start() * TILE) | 0;
    this.dualOy = (start() * TILE) | 0;
    this.look = makeRng((p.seed ?? 1) + 991);
    this.wake = Math.max(2, Math.ceil(1 / Math.max(0.05, p.brush.spacing)) + 1);
    this.colourFx = touchesColour(p.brush.dynamics) || p.brush.wet > 0;
    this.cur = [p.color[0], p.color[1], p.color[2]];
    this.load = [p.color[0], p.color[1], p.color[2]];
  }

  /** Adds this much paint to a pixel (up to the opacity) and repaints it when its look changed. */
  private touch(x: number, y: number, add: number, cell: Uint8Array, ceiling = 1): void {
    if (this.wrapEdges) {
      x = wrap(x, this.w);
      y = wrap(y, this.h);
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const ti = (y >> SHIFT) * this.across + (x >> SHIFT);
    let t = this.tiles[ti];
    if (!t) t = this.tiles[ti] = new Float32Array(TS * TS);
    const i = (y & MASK) * TS + (x & MASK);
    const have = t[i];
    // A paper that stays put holds the stroke back, not each dab: once a valley has taken all the paint the paper lets
    // it have, more dabs over the same spot cannot fill it in. That is what keeps a pencil speckled all the way through
    // when its dabs sit a twentieth of a width apart. A paper that moves finds fresh ground for every dab, so it holds
    // nothing back across the stroke.
    const cap = this.p.brush.opacity * ceiling;
    if (have >= cap) return;
    let next = have + add * (1 - have);
    if (next > cap) next = cap;
    if (next <= have) return;
    t[i] = next;
    let s = next;
    // Wet: this dab's paint joins the paint the stroke already laid here, in proportion to how much of each there is.
    let own: Float32Array | undefined;
    if (this.mixTiles) {
      let m = this.mixTiles[ti];
      if (!m) m = this.mixTiles[ti] = new Float32Array(TS * TS * 4);
      own = m;
      const k = (y & MASK) * TS * 4 + (x & MASK) * 4;
      const share = (next - have) / next;
      const cu = this.cur;
      m[k + 3] = this.dabNo;
      if (have <= 0) {
        m[k] = cu[0];
        m[k + 1] = cu[1];
        m[k + 2] = cu[2];
      } else {
        m[k] += (cu[0] - m[k]) * share;
        m[k + 1] += (cu[1] - m[k + 1]) * share;
        m[k + 2] += (cu[2] - m[k + 2]) * share;
      }
    }
    // A smooth pixel whose paint moved by less than one step of see-through looks just the same: leave it be.
    if (!this.crisp && !this.keep && ((next * 255 + 0.5) | 0) === ((have * 255 + 0.5) | 0)) return;
    if (this.crisp) {
      // All or nothing: the pixel goes on once the paint passes its dither threshold, and stays on.
      // With a grain the paper decides which pixels go on, so the page's dither only counts for what the grain leaves.
      const th = this.grainDepth > 0 ? threshold(x, y) * (1 - this.grainDepth) : threshold(x, y);
      if (next <= th) return;
      if (have > th && !this.keep) return;
      s = 1;
    }
    const b = this.base;
    this.surface.read(x, y, b);
    const c = this.col;
    const pc = this.p.color;
    if (this.keep) {
      c[0] = cell[0];
      c[1] = cell[1];
      c[2] = cell[2];
      c[3] = Math.round((cell[3] * pc[3]) / 255);
    } else if (own) {
      const k = (y & MASK) * TS * 4 + (x & MASK) * 4;
      c[0] = Math.round(own[k]);
      c[1] = Math.round(own[k + 1]);
      c[2] = Math.round(own[k + 2]);
      c[3] = pc[3];
    } else {
      c[0] = this.cur[0];
      c[1] = this.cur[1];
      c[2] = this.cur[2];
      c[3] = pc[3];
    }
    const o = this.out;
    if (this.p.pick) {
      this.p.pick(x, y, b, c);
      mixTowards(b, c, s, o);
    } else if (this.blend !== 'normal') blendPaint(this.blend, b, c, s, o);
    else paintOver(b, 0, c, s, o);
    this.p.snap?.(o);
    this.surface.write(x, y, o[0], o[1], o[2], o[3]);
  }

  /** One dab that is already where it goes: every pixel its tip reaches gets its share of paint. */
  private stampAt(d: Dab, sm: Sampler): void {
    const reach = sm.reach + 1;
    const y0 = Math.floor(d.y - reach);
    const y1 = Math.ceil(d.y + reach);
    const cell = sm.cell;
    const cap = this.p.brush.opacity;
    const w = this.w;
    const h = this.h;
    const tiles = this.tiles;
    const across = this.across;
    const plain = !this.wrapEdges;
    // A round tip that is not squashed is a circle, so each row only needs the pixels inside the circle's chord.
    const circle = this.p.brush.tip === 'round' && this.p.brush.roundness === 1;
    const r2 = reach * reach;
    const dual = this.dual;
    const grain = this.grainTile;
    const gs = this.grainScale;
    const depth = this.grainDepth;
    const gox = this.gOx;
    const goy = this.gOy;
    const dox = this.dualOx;
    const doy = this.dualOy;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - d.y;
      let x0 = Math.floor(d.x - reach);
      let x1 = Math.ceil(d.x + reach);
      if (circle) {
        const c = Math.sqrt(Math.max(0, r2 - dy * dy));
        x0 = Math.max(x0, Math.floor(d.x - c));
        x1 = Math.min(x1, Math.ceil(d.x + c));
      }
      const row = plain ? (y >> SHIFT) * across : 0;
      const ty = (y & MASK) * TS;
      const inRow = plain && y >= 0 && y < h;
      for (let x = x0; x <= x1; x++) {
        // A pixel that already holds all the paint it can is skipped before its coverage is even worked out.
        if (inRow && x >= 0 && x < w) {
          const t = tiles[row + (x >> SHIFT)];
          if (t !== undefined && t[ty + (x & MASK)] >= cap) continue;
        }
        if (dual !== null && dual[(((y + doy) & (TILE - 1)) * TILE) + ((x + dox) & (TILE - 1))] === 0) continue;
        const c = sm.cov(x + 0.5 - d.x, dy);
        if (c <= 0) continue;
        let add = c * d.flow;
        let ceiling = 1;
        if (grain !== null) {
          const sx = gs > 1 ? Math.floor(x / gs) : x;
          const sy = gs > 1 ? Math.floor(y / gs) : y;
          const height = grain[(((sy + goy) & (TILE - 1)) * TILE) + ((sx + gox) & (TILE - 1))] / 255;
          add = grainCut(add, height, depth);
          if (add <= 0) continue;
          if (!this.grainMoving) ceiling = 1 - depth * (1 - height);
        }
        this.touch(x, y, add, cell, ceiling);
      }
    }
  }

  /** The colour this dab paints with: the one picked, mixed toward the back colour, shifted in hue, saturation and lightness, and carrying what it picked up when wet. */
  private colourFor(d: Dab): void {
    this.dabNo++;
    const pc = this.p.color;
    const cur = this.cur;
    cur[0] = pc[0];
    cur[1] = pc[1];
    cur[2] = pc[2];
    const wet = this.p.brush.wet;
    if (wet > 0) {
      // Colour from under the middle of the dab joins the load, and the dab paints with a share of the load.
      const x = Math.floor(d.x);
      const y = Math.floor(d.y);
      if (x >= 0 && y >= 0 && x < this.w && y < this.h) {
        // Paint this stroke laid a while ago counts as paint under the brush (a loop smears its own earlier line); its wake does not.
        const m = this.mixTiles?.[(y >> SHIFT) * this.across + (x >> SHIFT)];
        const stamp = m ? m[((y & MASK) * TS + (x & MASK)) * 4 + 3] : 0;
        if (stamp > 0 && this.dabNo - stamp >= this.wake && this.surface.now) this.surface.now(x, y, this.under);
        else this.surface.read(x, y, this.under);
        pickUp(this.load, this.under);
      }
      mixRgb(pc, this.load, wet, cur);
    }
    if (d.mix) mixRgb(cur, this.p.back ?? pc, d.mix, cur);
    if (d.hue || d.sat || d.light) shiftColour(cur[0], cur[1], cur[2], d.hue ?? 0, d.sat ?? 0, d.light ?? 0, cur);
  }

  private lay(dabs: Dab[]): void {
    const { brush, mirror: m } = this.p;
    for (const d of dabs) {
      if (this.colourFx) this.colourFor(d);
      if (this.grainMoving) {
        this.gOx = (this.look() * TILE) | 0;
        this.gOy = (this.look() * TILE) | 0;
      }
      const sm = samplerFor(brush, d.size, d.angle, this.crisp);
      // An aliased brush puts its middle on the pixel grid, so its shape is the same wherever it lands. Snap first and
      // mirror after, so the images are snapped too (the mirror lines sit on whole or half pixels).
      const at = brush.aliased ? { ...d, x: snapAxis(d.x, sm.acrossX), y: snapAxis(d.y, sm.acrossY) } : d;
      if (!m || m.mode === 'off') this.stampAt(at, sm);
      else mirrorDabs(m.mode, m.ax2, m.ay2, at).forEach((e, i) => this.stampAt(e, i === 0 ? sm : samplerFor(brush, e.size, e.angle, this.crisp)));
    }
  }

  /** Moves the brush to `to` (art pixels, fractions allowed), laying dabs on the way. `size` is how wide it is now; `flow` is the paint per dab, 0 to 1; `sense` is what the pen and hand are doing, for the brush's dynamics. */
  moveTo(to: Pt, size: number, flow: number, sense?: Sense): void {
    this.lay(this.path.to(to, size, flow, sense));
  }

  /** The stroke is over. A click with no movement still lays its dab. */
  finish(): void {
    this.lay(this.path.end());
  }
}

/** A stroke on a pixel session, ready to use: the layer's palette lock and mirror drawing are picked up from it. */
export function sessionStroke(session: PixelSession, doc: Doc, layer: PixelLayer, p: Omit<DabParams, 'snap' | 'mirror'>): DabStroke {
  const m = session.mirror;
  return new DabStroke(sessionSurface(session), { ...p, snap: palettePicker(doc, layer), mirror: { mode: m.mode, ax2: m.ax2, ay2: m.ay2 } });
}

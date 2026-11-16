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
import { threshold, paintOver, type EdgeMode } from '../soft/maths';
import { palettePicker, type Pt } from '../soft/stroke';
import { shiftColour, mixRgb, pickUp, type Rgb } from './colour';
import { touchesColour } from './dynamics';
import { DabPath, makeRng, mirrorDabs, samplerFor, snapAxis, type Dab, type DabBrush, type Sampler, type Sense } from './maths';
import { dualAt, dualTile, grainCut } from './texture';
import { paperTile, TILE } from '../dry/paper';

/** Somewhere a stroke reads the old picture from and writes new pixels to: a pixel session, or any buffer. */
export interface Surface {
  readonly width: number;
  readonly height: number;
  /** The pixel as it was before the stroke, written into `out` (r, g, b, a). */
  read(x: number, y: number, out: Uint8ClampedArray | number[]): void;
  write(x: number, y: number, r: number, g: number, b: number, a: number): void;
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
  mirror?: { mode: 'off' | 'h' | 'v' | 'both'; ax2: number; ay2: number };
  /** Turns a pixel into one from the layer's palette, when the palette is locked. */
  snap?: ReturnType<typeof palettePicker>;
  /** Seeds the scatter and jitter, so a test can repeat a stroke. */
  seed?: number;
}

/** A brush's paint per pixel is kept in square blocks, made on first touch. */
const TS = 64;
const SHIFT = 6;
const MASK = TS - 1;

export class DabStroke {
  private readonly path: DabPath;
  private readonly tiles: (Float32Array | undefined)[];
  private readonly across: number;
  private readonly w: number;
  private readonly h: number;
  private readonly base = new Uint8ClampedArray(4);
  private readonly out = new Uint8ClampedArray(4);
  private readonly col: [number, number, number, number] = [0, 0, 0, 0];
  private readonly crisp: boolean;
  private readonly keep: boolean;
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
    this.keep = p.brush.tip === 'picture' && !!p.brush.picture?.keep;
    this.wrapEdges = tileModeOn();
    const g = p.brush.grain;
    this.grainTile = g && g.depth > 0 ? paperTile(g.paper) : null;
    this.grainDepth = g?.depth ?? 0;
    this.grainScale = g?.scale ?? 1;
    this.grainMoving = !!g?.moving;
    const d = p.brush.dual;
    this.dual = d ? dualTile(d) : null;
    const start = makeRng((p.seed ?? 1) + 77);
    this.dualOx = (start() * TILE) | 0;
    this.dualOy = (start() * TILE) | 0;
    this.look = makeRng((p.seed ?? 1) + 991);
    this.colourFx = touchesColour(p.brush.dynamics) || p.brush.wet > 0;
    this.cur = [p.color[0], p.color[1], p.color[2]];
    this.load = [p.color[0], p.color[1], p.color[2]];
  }

  /** Adds this much paint to a pixel (up to the opacity) and repaints it when its look changed. */
  private touch(x: number, y: number, add: number, cell: Uint8Array): void {
    if (this.wrapEdges) {
      x = wrap(x, this.w);
      y = wrap(y, this.h);
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const ti = (y >> SHIFT) * this.across + (x >> SHIFT);
    let t = this.tiles[ti];
    if (!t) t = this.tiles[ti] = new Float32Array(TS * TS);
    const i = (y & MASK) * TS + (x & MASK);
    const have = t[i];
    const cap = this.p.brush.opacity;
    if (have >= cap) return;
    let next = have + add * (1 - have);
    if (next > cap) next = cap;
    if (next <= have) return;
    t[i] = next;
    let s = next;
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
    } else {
      c[0] = this.cur[0];
      c[1] = this.cur[1];
      c[2] = this.cur[2];
      c[3] = pc[3];
    }
    const o = this.out;
    paintOver(b, 0, c, s, o);
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
        if (grain !== null) {
          const sx = gs > 1 ? Math.floor(x / gs) : x;
          const sy = gs > 1 ? Math.floor(y / gs) : y;
          add = grainCut(add, grain[(((sy + goy) & (TILE - 1)) * TILE) + ((sx + gox) & (TILE - 1))] / 255, depth);
          if (add <= 0) continue;
        }
        this.touch(x, y, add, cell);
      }
    }
  }

  /** The colour this dab paints with: the one picked, mixed toward the back colour, shifted in hue, saturation and lightness, and carrying what it picked up when wet. */
  private colourFor(d: Dab): void {
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
        this.surface.read(x, y, this.under);
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

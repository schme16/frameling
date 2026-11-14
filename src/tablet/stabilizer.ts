// The stabilizer steadies a shaky hand. Two ways, one amount (0 to 100):
//  - Pull string ("lazy mouse"): the brush hangs on a rope and trails behind the pointer. The pointer can wander inside
//    the rope's length without moving the brush at all, so lines come out smooth. A longer rope is a steadier line.
//  - Average: the brush sits at the average of the last few pointer positions.
// Pure maths on points, so it can be tested; the canvas runs every pointer sample through one while a stroke is drawn.

export type StabMode = 'string' | 'average';

export interface Sample {
  x: number;
  y: number;
  pressure: number;
}

/** The longest rope, in screen pixels, at an amount of 100. */
export const MAX_ROPE = 56;
/** The most pointer samples averaged, at an amount of 100. */
export const MAX_WINDOW = 16;
/** Steps the brush takes to catch up with the pointer when the pen lifts. */
export const CATCH_UP_STEPS = 6;

export function ropeLength(amount: number, zoom: number): number {
  return (Math.max(0, Math.min(100, amount)) / 100) * (MAX_ROPE / Math.max(zoom, 1e-6));
}

export function windowSize(amount: number): number {
  return 1 + Math.round((Math.max(0, Math.min(100, amount)) / 100) * (MAX_WINDOW - 1));
}

export class Stabilizer {
  private at: Sample | null = null;
  private recent: Sample[] = [];

  constructor(
    private mode: StabMode,
    private amount: number,
    private zoom: number,
  ) {}

  /** True when this stabilizer would change anything. */
  get active(): boolean {
    return this.amount > 0;
  }

  /** The brush where the stroke starts: right at the pointer. */
  start(p: Sample): Sample {
    this.at = { ...p };
    this.recent = [{ ...p }];
    return { ...p };
  }

  /** The brush's place for a new pointer sample. */
  push(p: Sample): Sample {
    if (!this.at) return this.start(p);
    if (!this.active) return (this.at = { ...p });
    if (this.mode === 'string') {
      const len = ropeLength(this.amount, this.zoom);
      const d = Math.hypot(p.x - this.at.x, p.y - this.at.y);
      if (d > len && d > 0) {
        const k = (d - len) / d;
        this.at = { x: this.at.x + (p.x - this.at.x) * k, y: this.at.y + (p.y - this.at.y) * k, pressure: p.pressure };
      } else this.at = { ...this.at, pressure: p.pressure };
      return { ...this.at };
    }
    this.recent.push({ ...p });
    const n = windowSize(this.amount);
    if (this.recent.length > n) this.recent.splice(0, this.recent.length - n);
    let x = 0;
    let y = 0;
    for (const r of this.recent) {
      x += r.x;
      y += r.y;
    }
    this.at = { x: x / this.recent.length, y: y / this.recent.length, pressure: p.pressure };
    return { ...this.at };
  }

  /** The last steps of a stroke: the brush walks the rest of the way to where the pen lifted, so the line ends there. */
  finish(p: Sample): Sample[] {
    const from = this.at ?? p;
    const out: Sample[] = [];
    const steps = this.active ? CATCH_UP_STEPS : 1;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      out.push({ x: from.x + (p.x - from.x) * t, y: from.y + (p.y - from.y) * t, pressure: p.pressure });
    }
    this.at = { ...p };
    return out;
  }

  /** Where the brush is now (for drawing the string). */
  position(): Sample | null {
    return this.at ? { ...this.at } : null;
  }
}

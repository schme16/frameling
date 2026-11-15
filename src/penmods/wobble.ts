// A shaky hand, as pure maths. The pen's position is nudged sideways by a slow tremor that depends on how far the pen
// has travelled, not on time or on how many samples came in. So a fast stroke and a slow one tremble the same way along
// their length, and a pen held still does not twitch. The nudge eases in over the first few pixels, so a click still
// starts where it was aimed.

/** Screen pixels over which the tremor fades in at the start of a stroke. */
export const RAMP = 14;
/** How far (screen pixels) the strongest tremor pulls the line off, per unit of amount (0 to 1 gives 0 to MAX_PULL). */
export const MAX_PULL = 7;
/** The two tremor periods, in screen pixels of travel. One slow, one quick, so it never looks like a regular zigzag. */
const PERIODS = [64, 23] as const;

export interface Point {
  x: number;
  y: number;
}

export class Wobble {
  private travelled = 0;
  private last: Point | null = null;

  /**
   * `amount` is 0 to 1. `zoom` is screen pixels per document pixel, so the wobble looks the same size on screen at any
   * zoom. `phases` are four numbers in 0 to 1 that decide where in the tremor this stroke starts (random per stroke).
   */
  constructor(
    private amount: number,
    private zoom: number,
    private phases: readonly number[] = [0, 0.25, 0.5, 0.75],
  ) {}

  /** The pen's place with the tremor added, for the next sample of the stroke. */
  push(p: Point): Point {
    if (this.last) this.travelled += Math.hypot(p.x - this.last.x, p.y - this.last.y);
    this.last = { x: p.x, y: p.y };
    return this.at(p);
  }

  /** The tremor for a point at the distance travelled so far (document pixels). */
  private at(p: Point): Point {
    const z = Math.max(this.zoom, 1e-6);
    const s = this.travelled * z;
    const ease = Math.min(1, s / RAMP);
    const pull = (Math.max(0, Math.min(1, this.amount)) * MAX_PULL * ease) / z;
    const wave = (k: number): number => {
      const a = Math.sin(((s / PERIODS[0]) + (this.phases[k] ?? 0)) * Math.PI * 2) * 0.65;
      const b = Math.sin(((s / PERIODS[1]) + (this.phases[(k + 1) % 4] ?? 0)) * Math.PI * 2) * 0.35;
      return a + b;
    };
    // x and y use different mixes of the two periods, so the pull goes in every direction, not just one.
    return { x: p.x + pull * wave(0), y: p.y + pull * wave(2) };
  }
}

/** Four random phases for a new stroke. */
export const randomPhases = (rng: () => number = Math.random): number[] => [rng(), rng(), rng(), rng()];

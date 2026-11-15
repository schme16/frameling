// What the canvas does to the pen's samples while a stroke is drawn: the stabilizer (the person's own, or a modifier's
// stronger one) and, for a shaky hand, the tremor. One object per stroke, so the canvas has one thing to ask and tests can
// run the very same path the canvas runs. Pure: no DOM.
import { Stabilizer, type Sample } from '../tablet/stabilizer';
import type { ToolPen } from '../tablet/settings';
import { effectiveToolPen, getPenEffect, type PenEffect } from './active';
import { randomPhases, Wobble } from './wobble';

export class PenFilter {
  private stab: Stabilizer | null = null;
  private wob: Wobble | null = null;

  /** `tp` is the person's own pen settings for the tool; a modifier in `fx` lies over them for this stroke only. */
  constructor(tp: ToolPen, zoom: number, start: Sample, fx: PenEffect | null = getPenEffect(), phases: number[] = randomPhases()) {
    const eff = effectiveToolPen(tp, fx);
    if (eff.stabilizer > 0) {
      this.stab = new Stabilizer(eff.stabMode, eff.stabilizer, zoom);
      this.stab.start(start);
    }
    if (fx?.wobble) {
      this.wob = new Wobble(fx.wobble, zoom, phases);
      this.wob.push(start);
    }
  }

  /** True when this filter changes anything. Nothing to do for the common case, so the canvas keeps no filter then. */
  get active(): boolean {
    return !!this.stab || !!this.wob;
  }

  /** Where the brush goes for a new pointer sample. */
  push(p: Sample): Sample {
    const s = this.stab ? this.stab.push(p) : p;
    return this.shake(s);
  }

  /** The end of a stroke: the steps the brush walks to catch up with where the pen lifted, and the last place itself. */
  finish(up: Sample): { before: Sample[]; last: Sample } {
    const before = this.stab ? this.stab.finish(up).slice(0, -1).map((s) => this.shake(s)) : [];
    return { before, last: this.shake(up) };
  }

  private shake(p: Sample): Sample {
    if (!this.wob) return p;
    const w = this.wob.push(p);
    return { ...p, x: w.x, y: w.y };
  }
}

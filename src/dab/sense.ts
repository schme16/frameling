// What the pen and hand are doing at a pointer event, in the form the brush dynamics take (see dynamics.ts). Pure, so a
// test can feed it points and see the numbers come out.
import type { ToolPointer } from '../core/registry';
import { leanOf } from '../tablet/tilt';
import { speedValue } from './dynamics';
import type { Sense } from './maths';

/** How fast the hand is moving, smoothed over the last few moves so one jumpy event does not whip the brush about. */
export class SpeedMeter {
  private x = 0;
  private y = 0;
  private t = 0;
  private started = false;
  private v = 0;

  /** The speed after this point, 0 (still) to 1 (flying). The first point of a stroke is 0. */
  push(x: number, y: number, t: number): number {
    if (this.started) {
      const dt = t - this.t;
      // Events in the same millisecond tell nothing new about speed.
      if (dt > 0) this.v += (Math.hypot(x - this.x, y - this.y) / dt - this.v) * 0.35;
      else return speedValue(this.v);
    }
    this.started = true;
    this.x = x;
    this.y = y;
    this.t = t;
    return speedValue(this.v);
  }
}

/** The sense for one event: pressure, tilt and twist only when the device really gives them, plus the speed worked out so far. */
export function senseOf(e: Pick<ToolPointer, 'hasPressure' | 'pressure' | 'tiltX' | 'tiltY' | 'twist'>, speed: number): Sense {
  const s: Sense = { speed };
  if (e.hasPressure) s.pressure = e.pressure;
  if (e.tiltX !== undefined && e.tiltY !== undefined) s.tilt = leanOf(e.tiltX, e.tiltY);
  if (e.twist !== undefined) s.twist = e.twist;
  return s;
}

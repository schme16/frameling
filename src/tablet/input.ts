// From a browser pointer event to what a tool is told: pressure through the pen's curve, tilt and twist. Pure.
import type { ToolPointer } from '../core/registry';
import { mapPressure } from './curve';
import type { PenDevice } from './settings';

export interface PointerLike {
  pointerType: string;
  pressure: number;
  buttons: number;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
}

export type PenFields = Pick<ToolPointer, 'pressure' | 'hasPressure' | 'tiltX' | 'tiltY' | 'twist'>;

/** The pen-related fields of a pointer sample. A mouse, or a finger, has no pressure and reports a steady 0.5. */
export function penFields(e: PointerLike, pen: PenDevice): PenFields {
  if (e.pointerType !== 'pen') return { pressure: 0.5, hasPressure: false };
  let raw = e.pressure;
  // Some drivers report 0 for the first sample of a press: count it as a medium touch rather than nothing.
  if (!raw && e.buttons !== 0) raw = 0.5;
  const out: PenFields = { pressure: mapPressure(raw, pen), hasPressure: true };
  if (typeof e.tiltX === 'number' && typeof e.tiltY === 'number') {
    out.tiltX = e.tiltX;
    out.tiltY = e.tiltY;
  }
  if (typeof e.twist === 'number') out.twist = e.twist;
  return out;
}

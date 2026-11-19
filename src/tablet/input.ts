// From a browser pointer event to what a tool is told: pressure through the pen's curve, tilt and twist. Pure.
import type { ToolPointer } from '../core/registry';
import { mapPressure } from './curve';
import type { PenDevice } from './settings';

export interface PointerLike {
  /** 'pointerdown' for the press itself. */
  type?: string;
  pointerType: string;
  pressure: number;
  buttons: number;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
}

export type PenFields = Pick<ToolPointer, 'pressure' | 'hasPressure' | 'tiltX' | 'tiltY' | 'twist'>;

/** What a press that says 0 counts as: the lightest touch, since a tip goes down the moment it first feels anything. */
export const TOUCH_DOWN_PRESSURE = 0.02;

/** The pen-related fields of a pointer sample. A mouse, or a finger, has no pressure and reports a steady 0.5. */
export function penFields(e: PointerLike, pen: PenDevice): PenFields {
  if (e.pointerType !== 'pen') return { pressure: 0.5, hasPressure: false };
  let raw = e.pressure;
  // Under X11 the press itself carries no pressure, so Chromium says 0 and the real reading comes a few ms later (seen
  // on a Huion Kamvas 13 Gen 3: 0, then 0.04). That press is the lightest touch. A pen still saying 0 after that has
  // no pressure at all, so it counts as a medium touch.
  if (!raw && e.buttons !== 0) raw = e.type === 'pointerdown' ? TOUCH_DOWN_PRESSURE : 0.5;
  const out: PenFields = { pressure: mapPressure(raw, pen), hasPressure: true };
  if (typeof e.tiltX === 'number' && typeof e.tiltY === 'number') {
    out.tiltX = e.tiltX;
    out.tiltY = e.tiltY;
  }
  if (typeof e.twist === 'number') out.twist = e.twist;
  return out;
}

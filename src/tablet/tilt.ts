// Pen tilt and barrel rotation, from what the browser reports. Pure maths.

const RAD = Math.PI / 180;

/** The angle between the pen and the tablet, in radians: PI/2 when it stands upright, 0 when it lies flat. */
export function altitudeOf(tiltX: number, tiltY: number): number {
  if (!tiltX && !tiltY) return Math.PI / 2;
  const tx = Math.tan(Math.max(-89.9, Math.min(89.9, tiltX)) * RAD);
  const ty = Math.tan(Math.max(-89.9, Math.min(89.9, tiltY)) * RAD);
  return Math.atan(1 / Math.hypot(tx, ty));
}

/** The direction the pen leans towards, in radians: 0 points right, PI/2 points down the screen. */
export function azimuthOf(tiltX: number, tiltY: number): number {
  if (!tiltX && !tiltY) return 0;
  return Math.atan2(Math.tan(Math.max(-89.9, Math.min(89.9, tiltY)) * RAD), Math.tan(Math.max(-89.9, Math.min(89.9, tiltX)) * RAD));
}

/** How far the pen leans: 0 standing upright, 1 lying flat. */
export function leanOf(tiltX: number, tiltY: number): number {
  return Math.min(1, Math.max(0, 1 - altitudeOf(tiltX, tiltY) / (Math.PI / 2)));
}

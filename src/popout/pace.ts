// How fast pixels in progress may be sent. A brush dab is a few hundred bytes and goes every screen frame. A whole picture
// (a selection being moved on a big layer) is megabytes, and copying that every frame would cost the person drawing, so a
// big piece is followed by a wait in proportion to its size. The second window is a little behind then, never the drawing.

/** Bytes the link may hand to the message port per millisecond, on average (64 MB a second). */
export const BYTES_PER_MS = 64 * 1024;
/** The longest wait after any piece. */
export const MAX_WAIT_MS = 250;

/** How long to leave the port alone after sending a piece of this many bytes. Under a screen frame's worth it is no wait. */
export function waitAfter(bytes: number): number {
  const ms = bytes / BYTES_PER_MS;
  return ms <= 16 ? 0 : Math.min(MAX_WAIT_MS, Math.round(ms));
}

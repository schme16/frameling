// The little drawing pads in Pen and tablet and in Quill's pen check: where on the canvas a pen is, and keeping the
// canvas the size it is shown at so a line lands under the pen and round ends stay round.

export interface PadRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A point on screen as canvas pixels. Each direction has its own scale, because CSS can stretch a canvas one way more
 * than the other. `k` is the scale for line widths.
 */
export function padPoint(clientX: number, clientY: number, rect: PadRect, width: number, height: number): { x: number; y: number; k: number } {
  const kx = rect.width ? width / rect.width : 1;
  const ky = rect.height ? height / rect.height : 1;
  return { x: (clientX - rect.left) * kx, y: (clientY - rect.top) * ky, k: kx };
}

/** The canvas size for a pad laid out at this size (CSS pixels, before any transform) on this screen. */
export function padSize(cssWidth: number, cssHeight: number, dpr: number): { width: number; height: number } {
  const d = dpr > 0 ? dpr : 1;
  return { width: Math.max(1, Math.round(cssWidth * d)), height: Math.max(1, Math.round(cssHeight * d)) };
}

/**
 * Makes the canvas match its laid-out size, which clears it. Uses the layout size rather than the on-screen box, so a
 * dialog still scaling in as it opens doesn't leave the pad too small. True when it changed.
 */
export function fitPad(c: HTMLCanvasElement): boolean {
  if (!c.clientWidth || !c.clientHeight) return false;
  const s = padSize(c.clientWidth, c.clientHeight, window.devicePixelRatio || 1);
  if (c.width === s.width && c.height === s.height) return false;
  c.width = s.width;
  c.height = s.height;
  return true;
}

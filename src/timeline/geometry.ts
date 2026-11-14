/** Pure maths for laying the grid out: which frame is under a pixel, which frames are on screen, how zoom behaves. */

export function frameAtX(x: number, cw: number, max = Infinity): number {
  return Math.max(0, Math.min(max, Math.floor(x / cw)));
}

/** First and last frame (inclusive) to draw for a scroll position, with some spare frames either side. */
export function visibleFrames(scrollLeft: number, viewWidth: number, cw: number, spare = 6): { from: number; to: number } {
  return { from: Math.max(0, Math.floor(scrollLeft / cw) - spare), to: Math.ceil((scrollLeft + viewWidth) / cw) + spare };
}

/** Frames between ruler numbers, so they never crowd: every 5 when roomy, then 10, 20, 50. */
export function labelStep(cw: number): number {
  if (cw >= 18) return 5;
  if (cw >= 10) return 10;
  if (cw >= 7) return 20;
  return 50;
}

/** The scroll position that keeps the frame under the pointer where it is while zooming. */
export function zoomScroll(scrollLeft: number, anchorX: number, oldCw: number, newCw: number): number {
  const frame = (scrollLeft + anchorX) / oldCw;
  return Math.max(0, frame * newCw - anchorX);
}

/** Time of a frame in seconds, to two decimals ("0.17"). */
export function seconds(frame: number, fps: number): string {
  return (frame / fps).toFixed(2);
}

/** "1 / 24" style frame text. People count from 1, the data counts from 0. */
export function frameText(frame: number, length: number): string {
  return `${frame + 1} / ${length}`;
}

/** A cel's key part and held tail, in frames: the key is always the first frame. */
export function celParts(length: number): { key: number; hold: number } {
  return { key: 1, hold: Math.max(0, length - 1) };
}

/** The words for a hold: 1 = "on ones", 2 = "on twos", up to fours, then a plain count. */
export function holdWords(frames: number): string {
  const on = ['', 'ones', 'twos', 'threes', 'fours'][frames];
  return on ? `${frames} frame${frames === 1 ? '' : 's'} (on ${on})` : `${frames} frames`;
}

/** "Moved 3 right and 2 down from where it was drawn", in words. */
export function movedWords(o: { x: number; y: number }): string {
  const bits = [o.x ? `${Math.abs(o.x)} ${o.x > 0 ? 'right' : 'left'}` : '', o.y ? `${Math.abs(o.y)} ${o.y > 0 ? 'down' : 'up'}` : ''].filter(Boolean);
  return `Moved ${bits.join(' and ')} from where it was drawn.`;
}

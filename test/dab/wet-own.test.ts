// Wet paint that mixes with the stroke's own paint: crossing its own earlier line picks that colour up, the trail just behind a
// dab is not counted as paint it has met, and dabs of different colours that overlap blend in proportion instead of the last one winning.
import { describe, expect, it } from 'vitest';
import { bufferSurface, DabStroke, type Surface } from '../../src/dab/stroke';
import { DEFAULT_DAB, type DabBrush } from '../../src/dab/maths';

const W = 64;
const H = 40;
type C = [number, number, number, number];
const RED: C = [220, 40, 40, 255];
const BLUE: C = [40, 60, 230, 255];

function run(b: Partial<DabBrush>, pts: [number, number][], ownPaint = true): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  const surf = bufferSurface(px, W, H);
  const surface: Surface = ownPaint ? surf : { width: W, height: H, read: surf.read, write: surf.write };
  const brush = { ...DEFAULT_DAB, size: 7, aliased: false, hardness: 1, spacing: 0.25, ...b };
  const s = new DabStroke(surface, { brush, color: RED, back: BLUE, edge: 'smooth', seed: 1 });
  for (const [x, y] of pts) s.moveTo({ x, y }, 7, 1);
  s.finish();
  return px;
}
const at = (g: Uint8ClampedArray, x: number, y: number): C => [g[(y * W + x) * 4], g[(y * W + x) * 4 + 1], g[(y * W + x) * 4 + 2], g[(y * W + x) * 4 + 3]];
// The first part of the stroke is the back colour (blue) and it runs out into the picked colour (red) over 30 pixels.
const toRed = { wet: 0.8, dynamics: [{ from: 'fade' as const, to: 'mix' as const, amount: 1, invert: false }], fadeLength: 30 };
const loop: [number, number][] = [[5, 10], [55, 10], [55, 24], [10, 24], [10, 3]];

describe('wet paint and the stroke\'s own paint', () => {
  it('a loop that crosses its own earlier line picks that colour up', () => {
    const own = run(toRed, loop);
    const none = run(toRed, loop, false);
    // Well before the crossing both agree: blue at the start, red further on.
    expect(at(own, 8, 10)).toEqual(at(none, 8, 10));
    expect(at(own, 40, 10)).toEqual(at(none, 40, 10));
    // After the crossing the loop carries some of the early blue with it, and with no pickup of its own paint it stays red.
    expect(at(none, 10, 5)).toEqual(RED);
    expect(at(own, 10, 5)[2]).toBeGreaterThan(at(none, 10, 5)[2] + 30);
    expect(at(own, 10, 5)[0]).toBeLessThan(RED[0] - 30);
  });

  it('a straight line over empty ground is the same either way: the wake is not paint it has met', () => {
    const line: [number, number][] = [[5, 20], [58, 20]];
    expect(Array.from(run(toRed, line))).toEqual(Array.from(run(toRed, line, false)));
  });

  it('a dry brush is untouched by all of this', () => {
    const dry = { dynamics: toRed.dynamics, fadeLength: 30 };
    expect(Array.from(run(dry, loop))).toEqual(Array.from(run(dry, loop, false)));
    expect(at(run(dry, loop), 10, 5)).toEqual(RED);
  });

  it('dabs of different colours that overlap blend, rather than the last one winning', () => {
    // A low flow lets many dabs build up on each pixel; the colour runs from blue to red along the stroke, so the pixels near the
    // start hold blue laid early and redder paint laid later. A dry brush shows only the colour of the last dab there.
    const flow = { flow: 0.3, dynamics: toRed.dynamics, fadeLength: 14 };
    const line: [number, number][] = [[10, 20], [40, 20]];
    const dry = run({ ...flow, wet: 0 }, line);
    const wet = run({ ...flow, wet: 0.01 }, line);
    const p = (g: Uint8ClampedArray) => at(g, 14, 20);
    expect(p(wet)).not.toEqual(p(dry));
    // Blue laid first is still in the mix, so the wet pixel is bluer than the last-dab-wins one.
    expect(p(wet)[2]).toBeGreaterThan(p(dry)[2]);
    expect(p(wet)[0]).toBeLessThan(p(dry)[0]);
  });
});

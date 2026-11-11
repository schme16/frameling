import { describe, expect, it } from 'vitest';
import type { Shape } from '../../src/core/format';
import { fillRegion } from '../../src/geometry/fill';
import { arc, brokenCircle, stroke } from './helpers';

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A busy 1280x720 drawing: a big head from four loose strokes, plus scribbles and short lines all over. */
function busyDrawing(): Shape[] {
  const r = rng(42);
  const shapes: Shape[] = brokenCircle(640, 360, 300, 4, 3, 10);
  for (let i = 0; i < 46; i++) {
    const x = 60 + r() * 1160;
    const y = 40 + r() * 640;
    const pts: [number, number][] = [];
    const len = 6 + Math.floor(r() * 30);
    let a = r() * 6.28;
    let px = x;
    let py = y;
    for (let k = 0; k < len; k++) {
      a += (r() - 0.5) * 0.8;
      px += Math.cos(a) * 9;
      py += Math.sin(a) * 9;
      pts.push([px, py]);
    }
    shapes.push(stroke(pts, 3 + Math.floor(r() * 8)));
  }
  shapes.push(stroke(arc(640, 330, 120, 0.3, 2.8), 6)); // a smile
  return shapes;
}

describe('speed', () => {
  it('fills a 1280x720 drawing with 50 strokes in about a frame or three', () => {
    const shapes = busyDrawing();
    expect(shapes.length).toBeGreaterThanOrEqual(50);
    const bounds = { x: 0, y: 0, width: 1280, height: 720 };
    const click = { x: 640, y: 200 };
    const cold = fillRegion(shapes, click, { gap: 24, bounds });
    expect(['ok', 'leak']).toContain(cold.kind);
    const lines: string[] = [`cold (outlines not cached yet): ${cold.stats.ms.toFixed(1)} ms, result ${cold.kind}`];
    for (const gap of [0, 10, 24, 48]) {
      const times: number[] = [];
      let kind = '';
      for (let i = 0; i < 12; i++) {
        const r = fillRegion(shapes, click, { gap, bounds });
        times.push(r.stats.ms);
        kind = r.kind;
      }
      times.sort((a, b) => a - b);
      lines.push(`gap ${String(gap).padStart(2)}: median ${times[6].toFixed(1)} ms, worst ${times[11].toFixed(1)} ms, ${kind}`);
      // Loose on purpose: this is a log, not a benchmark. It only catches something going badly wrong.
      expect(times[6]).toBeLessThan(1000);
    }
    console.log('paint bucket timings, 1280x720, ' + shapes.length + ' strokes\n  ' + lines.join('\n  '));
  });
});

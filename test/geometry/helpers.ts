import type { BrushSettings, StrokePoint, StrokeShape, PathShape, SubPath } from '../../src/core/format';
import { DEFAULT_BRUSH, uid } from '../../src/core/doc';

export function brush(size = 8): BrushSettings {
  // Constant width, no taper, so the line is as thick as asked everywhere.
  return { ...DEFAULT_BRUSH, size, thinning: 0, smoothing: 0.5, streamline: 0, taperStart: 0, taperEnd: 0 };
}

export function stroke(pts: [number, number][], size = 8, color = '#000000'): StrokeShape {
  const points: StrokePoint[] = pts.map(([x, y]) => ({ x, y, p: 0.5 }));
  return { id: uid('s'), type: 'stroke', points, brush: brush(size), color, opacity: 1 };
}

/** Points along a circular arc from angle a0 to a1 (radians), one every ~`step` pixels. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, step = 4): [number, number][] {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** A circle drawn as `parts` strokes, each leaving `gapDeg` degrees open at its end. */
export function brokenCircle(cx: number, cy: number, r: number, parts: number, gapDeg: number, size = 8): StrokeShape[] {
  const out: StrokeShape[] = [];
  const span = (Math.PI * 2) / parts;
  const gap = (gapDeg * Math.PI) / 180;
  for (let i = 0; i < parts; i++) out.push(stroke(arc(cx, cy, r, i * span + gap / 2, (i + 1) * span - gap / 2), size));
  return out;
}

export function rectPath(x: number, y: number, w: number, h: number, opts: Partial<PathShape> = {}): PathShape {
  const sp: SubPath = { closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] };
  return { id: uid('p'), type: 'path', paths: [sp], fill: null, stroke: { color: '#000000', width: 4, join: 'round', cap: 'round' }, opacity: 1, ...opts };
}

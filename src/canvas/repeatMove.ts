// What Repeat needs from the shape geometry: moving a shape about by a matrix (a symbol already posed for the frame moves
// its drawn matrix too) and finding its middle. Apart from geometry.ts so render.ts can reach it without a loop.
import type { Shape } from '../core/format';
import { isPosed, mul, type PosedInstance } from '../core/symbols';
import { rectCentre, shapeBounds, transformShape, type Matrix } from './geometry';

export function moveForRepeat(s: Shape, m: Matrix): Shape {
  const t = transformShape(s, m);
  if (!isPosed(s)) return t;
  const p = s as PosedInstance;
  const out: PosedInstance = { ...(t as PosedInstance), posed: { ...p.posed, matrix: mul(m, p.posed.matrix) } };
  return out;
}

export const shapeCentre = (s: Shape): { x: number; y: number } => rectCentre(shapeBounds(s));

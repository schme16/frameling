/** Plain 2D matrices, six numbers each. No imports, so anything can use them (the canvas geometry, the repeat maths, tests). */
/** [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f (the same layout as canvas setTransform). */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Applies `b` first, then `a`. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export const translate = (tx: number, ty: number): Matrix => [1, 0, 0, 1, tx, ty];
export const scaleBy = (sx: number, sy: number): Matrix => [sx, 0, 0, sy, 0, 0];
export const rotateBy = (rad: number): Matrix => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
};

/** Runs a matrix around a fixed point instead of the origin. */
export function about(m: Matrix, cx: number, cy: number): Matrix {
  return multiply(translate(cx, cy), multiply(m, translate(-cx, -cy)));
}
export const scaleAbout = (sx: number, sy: number, cx: number, cy: number): Matrix => about(scaleBy(sx, sy), cx, cy);
export const rotateAbout = (rad: number, cx: number, cy: number): Matrix => about(rotateBy(rad), cx, cy);

export function apply(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** How much a matrix scales lengths on average (the square root of its area change). Used for line widths. */
export function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

/** True when a matrix flips things over (a mirror image rather than a turn). */
export const flips = (m: Matrix): boolean => m[0] * m[3] - m[1] * m[2] < 0;

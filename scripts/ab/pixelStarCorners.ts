// Cells for the star and polygon corner A/B (scripts/ab/pixel-star-corners.cjs): the same shapes drawn with each way
// of making a thick outline. Bundled with esbuild and run in Electron, which draws the pictures.
import { plotCornerStroke, plotStampedPolygon } from '../../src/pixel/thick';
import { plotPolygon } from '../../src/pixel/raster';

type Pt = { x: number; y: number };

/** Mirrors polyPoints and fitPoints in src/tools/polystar.ts (the tool imports the whole app, so it is copied here). */
function shapePoints(kind: 'star' | 'polygon', box: number): Pt[] {
  const count = kind === 'star' ? 5 : 6;
  const inner = kind === 'star' ? 0.45 : null;
  const steps = inner === null ? count : count * 2;
  const unit: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / steps;
    const r = inner !== null && i % 2 === 1 ? inner : 1;
    unit.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const xs = unit.map((p) => p.x);
  const ys = unit.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min(box / (x1 - x0), box / (y1 - y0));
  return unit.map((p) => ({ x: 2 + (box - (x1 - x0) * k) / 2 + (p.x - x0) * k, y: 2 + (box - (y1 - y0) * k) / 2 + (p.y - y0) * k }));
}

export type Variant = 'round' | 'square' | 'steady' | 'corner';

/** The fill cells and the outline cells of one shape at one thickness. */
export function cellsFor(kind: 'star' | 'polygon', size: number, variant: Variant, box = 28): { fill: number[][]; edge: number[][] } {
  const pts = shapePoints(kind, box);
  const fill: number[][] = [];
  const edge: number[][] = [];
  const f = (x: number, y: number) => void fill.push([x, y]);
  const e = (x: number, y: number) => void edge.push([x, y]);
  if (variant === 'round' || variant === 'square') plotStampedPolygon(pts, true, { size, shape: variant }, e, f);
  else {
    plotPolygon(pts, true, null, f);
    plotCornerStroke(pts, true, size, e, variant === 'steady' ? 0 : undefined);
  }
  return { fill, edge };
}

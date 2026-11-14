/**
 * Mirror drawing on a vector layer: whatever you draw is copied across the mirror line, left and right, top and bottom
 * or both, as extra shapes added in the same undo step. The mode (off, left and right, top and bottom, both) is the
 * same one the pixel tools use (src/pixel/settings.ts); only the line's position is kept apart, in document pixels,
 * because a vector layer has no grid to count in. Pure geometry first, then the bits the tools call.
 */
import { findLayer, uid } from '../core/doc';
import type { Shape } from '../core/format';
import { scaleAbout, transformShape, type Matrix } from '../canvas/geometry';
import { drawShape } from '../core/render';
import { getPixelSettings, type SymmetryMode } from '../pixel/settings';
import { store } from '../core/store';
import { addShapes } from './merge-mode';

export interface VectorMirror {
  mode: SymmetryMode;
  /** Where the left-right line stands (its x) and the top-bottom line (its y), in document pixels. */
  ax: number;
  ay: number;
}

/** The mirror for a page: a line with no position of its own sits in the middle. */
export function vectorMirror(mode: SymmetryMode, width: number, height: number, axisX: number | null, axisY: number | null): VectorMirror {
  return { mode, ax: axisX ?? width / 2, ay: axisY ?? height / 2 };
}

const reflectX = (ax: number): Matrix => scaleAbout(-1, 1, ax, 0);
const reflectY = (ay: number): Matrix => scaleAbout(1, -1, 0, ay);

/** How each copy is made from the original: none when off, one for either direction, three for both. */
export function mirrorMatrices(m: VectorMirror): Matrix[] {
  const h = m.mode === 'h' || m.mode === 'both';
  const v = m.mode === 'v' || m.mode === 'both';
  const out: Matrix[] = [];
  if (h) out.push(reflectX(m.ax));
  if (v) out.push(reflectY(m.ay));
  if (h && v) out.push(scaleAbout(-1, -1, m.ax, m.ay));
  return out;
}

/** The point and where it lands across the mirror, the point itself first. */
export function mirrorSpots(m: VectorMirror, x: number, y: number): { x: number; y: number }[] {
  const out = [{ x, y }];
  const h = m.mode === 'h' || m.mode === 'both';
  const v = m.mode === 'v' || m.mode === 'both';
  if (h) out.push({ x: 2 * m.ax - x, y });
  if (v) out.push({ x, y: 2 * m.ay - y });
  if (h && v) out.push({ x: 2 * m.ax - x, y: 2 * m.ay - y });
  return out;
}

/** The shapes' reflections, each a shape of its own (new id, not grouped with the original). */
export function mirrorShapes(shapes: readonly Shape[], m: VectorMirror, newId: () => string = () => uid('sh')): Shape[] {
  const out: Shape[] = [];
  for (const mat of mirrorMatrices(m)) {
    for (const s of shapes) {
      const copy: Shape = { ...transformShape(s, mat), id: newId() };
      delete copy.origin;
      delete copy.group;
      out.push(copy);
    }
  }
  return out;
}

/** The mirror in force right now: on, and the layer in hand is a vector layer. Otherwise null. */
export function activeVectorMirror(): VectorMirror | null {
  const s = getPixelSettings();
  if (s.symmetry === 'off') return null;
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  if (!layer || layer.kind !== 'vector') return null;
  return vectorMirror(s.symmetry, doc.width, doc.height, s.vectorAxisX, s.vectorAxisY);
}

/** Adds what was drawn, and its reflections when mirror drawing is on, as one undo step. Same answer as `addShapes`. */
export function addDrawn(label: string, shapes: Shape[]): ReturnType<typeof addShapes> {
  const m = activeVectorMirror();
  return addShapes(label, m ? [...shapes, ...mirrorShapes(shapes, m)] : shapes);
}

/** Draws a shape in progress, and its reflections, so the preview shows what will be committed. */
export function drawWithMirror(g: CanvasRenderingContext2D, shape: Shape): void {
  drawShape(g, shape);
  const m = activeVectorMirror();
  if (m) for (const c of mirrorShapes([shape], m, () => shape.id)) drawShape(g, c);
}

/** Tools that copy across the mirror on a vector layer. */
export const MIRRORING_VECTOR_TOOLS: readonly string[] = ['brush', 'pencil', 'pen', 'rect', 'ellipse', 'line', 'polygon', 'star', 'eraser'];

/** True when the tool mirrors on a vector layer (so the mirror line is worth showing for it). */
export const mirrorsOnVector = (toolId: string): boolean => MIRRORING_VECTOR_TOOLS.includes(toolId);

/** The mirror line or lines, dashed across the page, for a vector layer. */
export function drawVectorMirrorLines(g: CanvasRenderingContext2D, zoom: number): void {
  const m = activeVectorMirror();
  if (!m) return;
  const { doc } = store().get();
  const px = 1 / zoom;
  g.save();
  g.setLineDash([6 * px, 4 * px]);
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.lineWidth = 3 * px;
    g.strokeStyle = 'rgb(255 255 255 / 0.7)';
    g.stroke();
    g.lineWidth = 1.5 * px;
    g.strokeStyle = 'rgb(155 123 255 / 0.95)';
    g.stroke();
  };
  if (m.mode === 'h' || m.mode === 'both') line(m.ax, 0, m.ax, doc.height);
  if (m.mode === 'v' || m.mode === 'both') line(0, m.ay, doc.width, m.ay);
  g.restore();
}

let saidFor: string | null = null;

/**
 * Says, once for each way the mirror is set, that a tool on a vector layer does not copy across it. Called by a tool
 * at the moment it is used, so the mode never sits lit while a tool quietly ignores it.
 */
export function sayNoMirror(say: (message: string) => void, message: string): void {
  if (!activeVectorMirror()) return;
  const key = `${getPixelSettings().symmetry}|${message}`;
  if (saidFor === key) return;
  saidFor = key;
  say(message);
}

/** For tests: forget what was said. */
export function resetMirrorSaid(): void {
  saidFor = null;
}


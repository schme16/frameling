import { vi } from 'vitest';
import type { PathShape, Shape, VectorDrawing } from '../../src/core/format';
import { newDoc } from '../../src/core/doc';
import type { Tool, ToolContext, ToolPointer } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { editActiveDrawing } from '../../src/tools/edit';
import { rectSubPath } from '../../src/tools/shapes';

export function ptr(x: number, y: number, extra: Partial<ToolPointer> = {}): ToolPointer {
  return { x, y, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0, ...extra };
}

export function ctx(zoom = 1) {
  return { zoom, requestOverlay: vi.fn<() => void>(), hint: vi.fn<(message: string) => void>() } satisfies ToolContext;
}

/** Runs a whole gesture: down at the first point, moves through the rest, up at the last. */
export function drag(tool: Tool, c: ToolContext, points: [number, number][], extra: Partial<ToolPointer> = {}): void {
  tool.down?.(ptr(...points[0], extra), c);
  for (const p of points.slice(1, -1)) tool.move?.(ptr(...p, extra), c);
  const last = points[points.length - 1];
  tool.up?.(ptr(last[0], last[1], extra), c);
}

export function vectorStore() {
  return resetStore(newDoc({ width: 400, height: 300 }));
}

export function pixelStore(pixelSize = 8) {
  return resetStore(newDoc({ width: 64, height: 64, pixel: { pixelSize } }));
}

export const box = (id: string, x: number, y: number, w: number, h: number, fill: string | null = '#ff0000'): PathShape => ({
  id,
  type: 'path',
  paths: [rectSubPath({ x, y, w, h })],
  fill,
  stroke: null,
  opacity: 1,
});

/** Puts shapes on the active drawing (making one if the frame has none). */
export function addShapes(...shapes: Shape[]): void {
  editActiveDrawing('add', 'vector', (d) => void d.shapes.push(...shapes));
}

export function shapesNow(): Shape[] {
  const { doc, ui } = store().get();
  const layer = doc.layers.find((l) => l.id === ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  const cel = layer.cels.find((c) => ui.frame >= c.start && ui.frame < c.start + c.length);
  return cel ? (doc.drawings[cel.drawingId] as VectorDrawing).shapes : [];
}

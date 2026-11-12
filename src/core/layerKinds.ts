/**
 * What the renderer and the exporters ask for when a drawing is not a plain vector or pixel one, or when a layer is
 * attached to something (a bone). Tiles and Rig each register their part when their folder loads; core only looks
 * the part up by name, so it never imports them. Like shape kinds, these stay registered for good, even while the
 * feature is switched off: a file that holds tilemaps or bone-attached layers still draws, exports and saves.
 *
 * Lookups are made once per drawing or layer, nothing here works per pixel.
 */
import type { Doc, Drawing, Layer, PixelDrawing } from './format';
import type { Ctx2D } from './render';

/** The mesh a posed layer is drawn through: rest points, posed points and triangles. Runtime only. */
export interface PosedMesh {
  src: number[];
  dst: number[];
  triangles: number[];
}

/** A kind of drawing the core does not know how to draw by itself (today only tilemaps). */
export interface DrawingKind<D extends Drawing = Drawing> {
  /** The `kind` of the drawings it handles. */
  kind: D['kind'];
  /** Draws it in document pixels (the caller sets the transform). `pixelCanvas` turns a pixel drawing into something drawable. */
  draw(g: Ctx2D, doc: Doc, d: D, pixelSize: number, frame: number, pixelCanvas: (p: PixelDrawing) => CanvasImageSource): void;
  /** The same picture as one pixel drawing, for the exporters that only know pixels (SVG, PDF, Lottie). */
  flatten(doc: Doc, d: D, frame: number): PixelDrawing;
}

const kinds = new Map<string, DrawingKind>();

export function registerDrawingKind<D extends Drawing>(k: DrawingKind<D>): void {
  kinds.set(k.kind, k as unknown as DrawingKind);
}
export const drawingKindOf = (d: Drawing): DrawingKind | undefined => kinds.get(d.kind);

/** A drawing of a registered kind as pixels. Undefined for any other drawing, or when nothing is registered for its kind. */
export function flattenDrawing(doc: Doc, d: Drawing, frame: number): PixelDrawing | undefined {
  return kinds.get(d.kind)?.flatten(doc, d, frame);
}

/** What a layer attached to something shows: its drawing moved by (or bent by) the thing it is attached to. */
export type LayerBinder = (doc: Doc, layer: Layer, frame: number, d: Drawing) => Drawing;
let binder: LayerBinder | undefined;

export function registerLayerBinder(fn: LayerBinder): void {
  binder = fn;
}
/** The drawing a layer shows at `frame`. Layers that are not attached (and every layer, when nothing is registered) show `d` as it is. */
export const bindLayer: LayerBinder = (doc, layer, frame, d) => (binder ? binder(doc, layer, frame, d) : d);

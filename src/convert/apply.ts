// Putting a conversion into the document. Both directions are one function of a document (or an immer draft of one), so
// the whole thing is one undo step when it runs inside `store().update`, and so it can be tested on plain documents.
import { newBlankPixelDrawing, newPixelLayer, newVectorLayer, normaliseCels, peek, pruneDrawings, uid } from '../core/doc';
import type { Cel, Doc, Drawing, FillShape, Id, Layer, PixelDrawing, VectorDrawing } from '../core/format';
import { gridPixels, setGridPixels, setPlaced, type Placed } from '../core/pixelBounds';
import { pixelGrid } from '../core/doc';
import type { Mask } from '../select/mask';
import { coversLayer, type Bake } from './scope';

export type LandsWhere = 'beside' | 'replace';

export interface Applied {
  /** The layer the result is on. */
  layerId: Id;
  /** The new shapes (when turning pixels into shapes), so they can be selected. */
  shapeIds: Id[];
  /** What happened to the original, in plain words. */
  original: 'hidden' | 'kept' | 'replaced' | 'emptied';
  /** The new layer's drawings, one per distinct picture. */
  drawings: number;
}

/** The layer the result goes on: it behaves like the original (opacity, blend, effects, clipping, folder). */
function resultLayer(src: Layer, kind: 'pixel' | 'vector', pixelSize: number, name: string): Layer {
  const l: Layer = kind === 'pixel' ? newPixelLayer(name, pixelSize) : newVectorLayer(name);
  if (src.opacity !== 1) l.opacity = src.opacity;
  for (const k of ['blend', 'effects', 'clipToBelow', 'mask', 'folder', 'depth', 'label', 'onion', 'reference'] as const) {
    const v = peek((src as unknown as Record<string, unknown>)[k]);
    if (v !== undefined) (l as unknown as Record<string, unknown>)[k] = typeof v === 'object' && v !== null ? JSON.parse(JSON.stringify(v)) : v;
  }
  return l;
}

function celsFor(bakes: readonly Bake[], idFor: (b: Bake) => Id | undefined): Cel[] {
  const out: Cel[] = [];
  for (const b of bakes) {
    const drawingId = idFor(b);
    if (drawingId) out.push({ id: uid('c'), start: b.start, length: b.length, drawingId });
  }
  return out;
}

/** Where a new layer goes, and what happens to the original afterwards. */
function place(doc: Doc, src: Layer, made: Layer, where: LandsWhere, emptied: boolean, whole: boolean, keepName: string): Applied['original'] {
  const i = doc.layers.findIndex((l) => l.id === src.id);
  if (where === 'replace' && emptied) {
    made.name = keepName;
    doc.layers.splice(i, 1, made);
    pruneDrawings(doc);
    return 'replaced';
  }
  doc.layers.splice(i + 1, 0, made);
  if (where === 'replace') return 'emptied';
  if (whole) {
    doc.layers[i].visible = false;
    return 'hidden';
  }
  return 'kept';
}

export interface ToPixelsInput {
  layerId: Id;
  bakes: Bake[];
  where: LandsWhere;
  pixelSize: number;
  /** The picture for each bake key. */
  pictures: Map<string, Placed>;
  /** Only these shapes were turned (the selection): they are the ones taken off the original when replacing. */
  shapeIds?: readonly Id[] | null;
  /** All of the layer is being turned, even though `bakes` is only a sample of it (a preview). Worked out from the bakes when missing. */
  whole?: boolean;
}

/** Shapes into pixels: a new pixel layer with a drawing per picture, and the original hidden, kept or emptied. Null when there is nothing to do. */
export function applyToPixels(doc: Doc, o: ToPixelsInput): Applied | null {
  const src = doc.layers.find((l) => l.id === o.layerId);
  if (!src || src.kind !== 'vector' || !o.bakes.length) return null;
  const made = resultLayer(src, 'pixel', o.pixelSize, `${src.name} (pixels)`);
  const byKey = new Map<string, Id>();
  for (const b of o.bakes) {
    const pic = o.pictures.get(b.key);
    if (!pic || byKey.has(b.key)) continue;
    const d: PixelDrawing = newBlankPixelDrawing();
    setPlaced(d, pic);
    doc.drawings[d.id] = d;
    byKey.set(b.key, d.id);
  }
  made.cels = celsFor(o.bakes, (b) => byKey.get(b.key));
  normaliseCels(made);
  const picked = o.shapeIds?.length ? new Set(o.shapeIds) : null;
  let emptied = false;
  if (o.where === 'replace') {
    for (const id of new Set(o.bakes.map((b) => b.drawingId))) {
      const d = doc.drawings[id];
      if (d?.kind !== 'vector') continue;
      d.shapes = picked ? d.shapes.filter((s) => !picked.has(s.id)) : [];
    }
    emptied = src.cels.every((c) => {
      const d = doc.drawings[c.drawingId];
      return !d || d.kind !== 'vector' || (d.shapes.length === 0 && !d.kept?.length);
    });
  }
  const original = place(doc, src, made, o.where, emptied, !picked && (o.whole ?? coversLayer(src, o.bakes)), src.name);
  return { layerId: made.id, shapeIds: [], original, drawings: byKey.size };
}

export interface ToShapesInput {
  layerId: Id;
  bakes: Bake[];
  where: LandsWhere;
  /** The shapes for each bake key. */
  traced: Map<string, FillShape[]>;
  /** Only the pixels this marks were turned: they are the ones cleared from the original when replacing. */
  mask?: Mask | null;
  /** All of the layer is being turned, even though `bakes` is only a sample of it (a preview). Worked out from the bakes when missing. */
  whole?: boolean;
}

/** Pixels into shapes: a new vector layer with a drawing per picture, and the original hidden, kept or emptied. Null when there is nothing to do. */
export function applyToShapes(doc: Doc, o: ToShapesInput): Applied | null {
  const src = doc.layers.find((l) => l.id === o.layerId);
  if (!src || src.kind !== 'pixel' || !o.bakes.length) return null;
  const made = resultLayer(src, 'vector', 1, `${src.name} (shapes)`);
  const byKey = new Map<string, Id>();
  const shapeIds: Id[] = [];
  for (const b of o.bakes) {
    const shapes = o.traced.get(b.key);
    if (!shapes || byKey.has(b.key)) continue;
    const d: VectorDrawing = { id: uid('v'), kind: 'vector', shapes };
    doc.drawings[d.id] = d;
    byKey.set(b.key, d.id);
    // The shapes of the first picture are the ones to select.
    if (!shapeIds.length) for (const s of shapes) shapeIds.push(s.id);
  }
  made.cels = celsFor(o.bakes, (b) => byKey.get(b.key));
  normaliseCels(made);
  let emptied = false;
  if (o.where === 'replace') {
    const { width: gw, height: gh } = pixelGrid(doc, src);
    for (const id of new Set(o.bakes.map((b) => b.drawingId))) {
      const d = doc.drawings[id];
      if (d?.kind !== 'pixel') continue;
      if (!o.mask) {
        const blank = newBlankPixelDrawing();
        setPlaced(d, { x: 0, y: 0, width: 0, height: 0, pixels: blank.pixels });
      } else {
        const grid = Uint8ClampedArray.from(gridPixels(d, gw, gh));
        for (let i = 0; i < o.mask.bits.length && i * 4 < grid.length; i++) if (o.mask.bits[i]) grid.fill(0, i * 4, i * 4 + 4);
        setGridPixels(d, grid, gw, gh);
      }
    }
    emptied = src.cels.every((c) => {
      const d = doc.drawings[c.drawingId] as Drawing | undefined;
      return !d || d.kind !== 'pixel' || d.width === 0 || d.height === 0;
    });
  }
  const original = place(doc, src, made, o.where, emptied, !o.mask && (o.whole ?? coversLayer(src, o.bakes)), src.name);
  return { layerId: made.id, shapeIds, original, drawings: byKey.size };
}

/** What the person is told once it is done, in plain words. */
export function doneWords(kind: 'pixels' | 'shapes', a: Applied): string {
  const what = kind === 'pixels' ? 'pixels' : 'shapes';
  const where =
    a.original === 'hidden' ? 'The original is hidden, not gone.' : a.original === 'kept' ? 'The original is still there underneath.' : a.original === 'replaced' ? 'It took the original’s place.' : 'It came out of the original.';
  return `Turned into ${what}. ${where} Undo puts it all back.`;
}

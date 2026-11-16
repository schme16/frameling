// A read VectorCraft file as Frameling pieces and documents: one board is a drawing of its own size, or layers added to the
// open drawing; several boards are a document with several artboards, laid out as they were. Pure.
import { uid } from '../../core/doc';
import type { Artboard, Doc } from '../../core/format';
import { FIRST_ID } from '../../artboards/model';
import { docFromPieces, mapShape, MAX_SIDE, STILL_LENGTH, vectorPieces, type Pieces, type Stage } from '../pieces';
import type { CraftBoard, VectorcraftFile } from './vectorcraft';

/** The one scale that brings every board under the size limit (1 = as drawn). */
export function craftScale(file: VectorcraftFile): number {
  const biggest = Math.max(...file.boards.map((b) => Math.max(b.width, b.height)));
  return Math.min(1, MAX_SIDE / biggest);
}

const scaled = (b: CraftBoard, k: number): CraftBoard => (k === 1 ? b : { ...b, x: b.x * k, y: b.y * k, width: Math.max(1, Math.round(b.width * k)), height: Math.max(1, Math.round(b.height * k)), layers: b.layers.map((l) => ({ ...l, shapes: l.shapes.map((s) => mapShape(s, k, 0, 0)) })) });

/** How many shapes (paths and text) a file brings in, and how many of them are text: the first board's only, or every board's. */
export function craftCounts(file: VectorcraftFile, every = false): { shapes: number; text: number } {
  const shapes = (every ? file.boards : file.boards.slice(0, 1)).flatMap((b) => b.layers.flatMap((l) => l.shapes));
  return { shapes: shapes.length, text: shapes.filter((s) => s.type === 'text').length };
}

/** The first board as layers for the open drawing (`stage`) or for a drawing of its own (no stage). */
export function craftPieces(file: VectorcraftFile, opts: { stage: Stage | null; length: number }): Pieces {
  const k = opts.stage ? 1 : craftScale(file);
  const b = scaled(file.boards[0], k);
  const p = vectorPieces(b.layers, { width: b.width, height: b.height }, { stage: opts.stage, length: opts.length });
  if (file.swatches.length) p.swatches = file.swatches;
  if (k < 1 && !p.scale) p.scale = k;
  return p;
}

/** A document of its own: one board is the drawing, several are artboards in the places they had. */
export function craftDoc(file: VectorcraftFile, name: string): { doc: Doc; scale: number } {
  const k = craftScale(file);
  const first = craftPieces(file, { stage: null, length: STILL_LENGTH });
  const doc = docFromPieces(first, name);
  if (file.boards.length > 1) {
    const x0 = file.boards[0].x * k;
    const y0 = file.boards[0].y * k;
    const list: Artboard[] = [{ id: FIRST_ID, name: file.boards[0].name, x: 0, y: 0 }];
    for (const raw of file.boards.slice(1)) {
      const b = scaled(raw, k);
      const p = vectorPieces(b.layers, { width: b.width, height: b.height }, { stage: null, length: STILL_LENGTH });
      Object.assign(doc.drawings, p.drawings);
      list.push({
        id: uid('ab'),
        name: b.name,
        x: Math.round(b.x - x0),
        y: Math.round(b.y - y0),
        content: { width: p.width, height: p.height, background: null, length: STILL_LENGTH, fps: doc.fps, layers: p.layers, clips: [], markers: [] },
      });
    }
    doc.artboards = list;
    doc.activeArtboard = FIRST_ID;
  }
  return { doc, scale: k };
}

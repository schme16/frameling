// How the export writers get at a kind of shape that is not a drawing basic (text, particles): through the kind's
// registered export, never by importing it. A kind registers where its folder loads (see core/shapeKinds.ts for the
// drawing side). The code is loaded the first time an export needs it (`loadShapeExports`, called by the formats that
// write shapes), so none of it is in the start-up bundle.
import type { Shape } from '../core/format';
import type { Feature } from './registry';
import type { Content, PdfFrameContext } from './pdf';
import type { Item, LottieKit } from './lottie';

export interface ShapeExport<S extends Shape = Shape> {
  /** One frame of SVG for the shape (empty when nothing shows). Also used by the animated SVG. */
  svg?(s: S): string;
  /** Draws it into a PDF (and Illustrator) page. */
  pdf?(cx: Content, ctx: PdfFrameContext, s: S): void;
  /** Turns the same shape on each frame of a run into sprites: the items of every frame, the same number on each. */
  lottie?(kit: LottieKit, frames: S[]): Item[][];
}

interface Registration {
  /** What "What carries over" calls a document that holds one, so a format can say how it carries it. */
  feature?: Feature;
  load(): Promise<ShapeExport>;
}

const regs = new Map<string, Registration>();
const loaded = new Map<string, ShapeExport>();
let pending: Promise<void> | null = null;

/** Registers the export of a kind of shape (once, when its folder loads). */
export function registerShapeExport<S extends Shape>(type: S['type'], reg: { feature?: Feature; load(): Promise<ShapeExport<S>> }): void {
  regs.set(type, reg as unknown as Registration);
  loaded.delete(type);
  pending = null;
}

/** Brings in the export of every registered kind. Awaited before a writer that reads shapes starts. */
export function loadShapeExports(): Promise<void> {
  pending ??= Promise.all(
    [...regs].map(async ([type, r]) => {
      if (!loaded.has(type)) loaded.set(type, await r.load());
    }),
  ).then(() => undefined);
  return pending;
}

/** The export of a kind, once `loadShapeExports` has run. */
export const shapeExportOf = (type: string): ShapeExport | undefined => loaded.get(type);

/** What a kind of shape counts as in "What carries over", if it says. */
export const shapeFeatureOf = (type: string): Feature | undefined => regs.get(type)?.feature;

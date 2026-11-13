// Giving Quill a drawing. He keeps a small picture of it, not the drawing itself, so his things stay tiny and
// nothing you make depends on him.
import { store } from '../core/store';
import { drawingAt } from '../core/doc';
import type { Doc, Shape } from '../core/format';
import { thumbnailOf } from '../io/thumb';
import { activeArtboardName } from './where';
import type { ThingSource } from './crayon';
import type { PetThing } from './model';
import { tellQuill } from './store';
import { noteFuss } from './watch';

/** The picture he keeps is this many pixels on its long side. Small on purpose: his things live in localStorage. */
export const THING_SIZE = 72;

/**
 * How much of a drawing he'll hang on to, in characters of JSON. A picture is always kept; the shapes are only kept
 * when they're small enough that his corner doesn't become the biggest thing on your computer.
 */
export const SOURCE_BUDGET = 180_000;

/**
 * The shapes on the frame you're on, from the vector layers you can see. Pixel, tile and bones layers aren't
 * something he can hold a crayon to, so they're left out, and if nothing is left he keeps the picture alone.
 */
export function sourceOf(doc: Doc, frame: number, budget = SOURCE_BUDGET): ThingSource | undefined {
  const shapes: Shape[] = [];
  for (const layer of doc.layers) {
    if (layer.kind !== 'vector' || !layer.visible || layer.reference || layer.rig) continue;
    const d = drawingAt(doc, layer, frame);
    if (d?.kind === 'vector') shapes.push(...d.shapes);
  }
  if (!shapes.length) return undefined;
  const src: ThingSource = { width: doc.width, height: doc.height, background: doc.background, shapes };
  try {
    if (JSON.stringify(src.shapes).length > budget) return undefined;
  } catch {
    return undefined;
  }
  return src;
}

let n = 0;
const nextId = (): string => `t${Date.now().toString(36)}${(n++).toString(36)}`;

/** A small picture of the frame you're on, ready to be given. Undefined when it can't be drawn. */
export async function thingFromNow(at: number = Date.now()): Promise<PetThing | undefined> {
  const s = store().get();
  const picture = await thumbnailOf(s.doc, THING_SIZE, s.ui.frame);
  if (!picture) return undefined;
  const source = sourceOf(s.doc, s.ui.frame);
  return { id: nextId(), name: activeArtboardName(s.doc) ?? s.doc.name ?? 'A drawing', picture, givenAt: at, ...(source ? { source } : {}) };
}

/** Gives Quill the frame you're on. True when he got it. */
export async function giveToQuill(): Promise<boolean> {
  const thing = await thingFromNow();
  if (!thing) return false;
  tellQuill({ kind: 'gave', thing });
  noteFuss();
  return true;
}

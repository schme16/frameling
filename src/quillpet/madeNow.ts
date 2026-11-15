// Putting one of yours in his room, the moment you save it. Page side: it needs a canvas. The picture is drawn once,
// small, here and now; the room itself only ever shows the little images. Never a reason a save fails.
import type { Doc } from '../core/format';
import { currentChoice } from '../core/choices';
import { renderFrameToCanvas } from '../core/render';
import { thumbnailOf } from '../io/thumb';
import { isBlankPicture, previewFrameOrder } from '../io/preview';
import { store } from '../core/store';
import { editedByYou } from './watch';
import { kindOf, keepMade, MADE_SIZE, YOURS_CHOICE, type Made } from './made';

/** The first frame that has something on it, as a small picture, or undefined when the whole drawing is empty. */
async function pictureOf(doc: Doc, current: number): Promise<string | undefined> {
  for (const f of previewFrameOrder(doc.length, current)) {
    const c = renderFrameToCanvas(doc, f, 32 / Math.max(1, doc.width, doc.height));
    const g = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (g && isBlankPicture(g.getImageData(0, 0, c.width, c.height).data)) continue;
    return thumbnailOf(doc, MADE_SIZE, f);
  }
  return undefined;
}

let n = 0;

/**
 * Called after a save worked. Puts the drawing in his room when it is yours (you drew in it, it is not empty) and you
 * have not switched this off. Kept even with Quill hidden, so he has it when he comes back. Undefined when it did not go in.
 */
export async function noteMade(doc: Doc, at: number = Date.now()): Promise<Made | undefined> {
  try {
    if (currentChoice(YOURS_CHOICE) === 'hide' || !editedByYou()) return undefined;
    const picture = await pictureOf(doc, store().get().ui.frame);
    if (!picture) return undefined;
    const item: Made = { id: doc.id || `m${at.toString(36)}${(n++).toString(36)}`, name: doc.name || 'A drawing', kind: kindOf(doc), picture, madeAt: at };
    keepMade(item);
    return item;
  } catch {
    return undefined;
  }
}

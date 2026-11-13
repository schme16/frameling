// Small readers the pet uses, kept apart so the rest of the feature doesn't import the artboard model.
import type { Doc } from '../core/format';
import { activeId, artboardsOf } from '../artboards/model';

/** What the board you're on is called, or undefined when the document has no boards. */
export function activeArtboardName(doc: Doc): string | undefined {
  try {
    const boards = artboardsOf(doc);
    if (boards.length < 2) return undefined;
    return boards.find((b) => b.id === activeId(doc))?.name;
  } catch {
    return undefined;
  }
}

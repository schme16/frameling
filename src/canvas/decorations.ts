/**
 * Things drawn on the overlay whatever tool is picked (a tween's motion trail, say). Each one draws in document
 * coordinates, like a tool overlay, and is skipped while playing.
 */
import { ownedUndo } from '../core/owners';
import type { ToolContext } from '../core/registry';

export type Decoration = (g: CanvasRenderingContext2D, ctx: ToolContext) => void;

const list: Decoration[] = [];

export function registerDecoration(d: Decoration): void {
  list.push(d);
  ownedUndo(() => {
    const i = list.indexOf(d);
    if (i >= 0) list.splice(i, 1);
  });
}

export function drawDecorations(g: CanvasRenderingContext2D, ctx: ToolContext): void {
  for (const d of list) {
    g.save();
    try {
      d(g, ctx);
    } finally {
      g.restore();
    }
  }
}

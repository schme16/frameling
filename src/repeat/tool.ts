// The Repeat tool: grab the handle of a repeat on the stage and move it. A ring's centre, a mirror line's point and its
// turning end, and a grid's step all snap the way other points do (shape ends, path points, guides, the grid, the page
// middle), so a centre or a line can be somewhere that matters instead of a number you nudge. Click a shape to see its
// repeat. Holding Ctrl lets go of the snapping; Shift turns a mirror line in steps of 15 degrees.
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { clearSnap, snapPt } from '../canvas/guides';
import { topShapeAt } from '../canvas/geometry';
import { dragRepeat, type HandleId } from '../geometry/repeat';
import { GRAB_PX } from '../tools/point-handles';
import { activeDrawing } from '../tools/edit';
import { withGroups } from '../tools/merge-mode';
import { canEdit } from '../tools/util';
import { changeRepeat } from './ops';
import { drawRepeatGuides, handleAt } from './draw';
import { RepeatControls } from './RepeatControls';

let drag: { id: HandleId; key: string; from: { x: number; y: number } } | null = null;
let hot: HandleId | null = null;
let gestures = 0;

function hit(e: ToolPointer, zoom: number): HandleId | null {
  const h = handleAt(zoom);
  if (!h) return null;
  let best: { id: HandleId; d: number } | null = null;
  for (const hd of h.handles) {
    const d = Math.hypot(hd.at.x - e.x, hd.at.y - e.y) * zoom;
    if (d <= GRAB_PX + 3 && (!best || d < best.d)) best = { id: hd.id, d };
  }
  return best?.id ?? null;
}

/** Takes the handle being dragged to the pointer, snapped. */
function follow(e: ToolPointer, ctx: ToolContext): void {
  if (!drag) return;
  const d = drag;
  const p = snapPt(e, ctx.zoom, e.mod);
  changeRepeat('Move the repeat', (r) => dragRepeat(r, d.id, p, d.from, { steps: e.shift }), d.key);
  ctx.requestOverlay();
}

export const repeatTool: Tool = {
  id: 'repeat',
  label: 'Repeat',
  commandLabel: 'Move a repeat’s centre, line or step on the stage (Repeat tool)',
  icon: 'repeat',
  layers: ['vector'],
  // Off the rail and the menus, which are full: reached from the Repeat panel, the palette and the Repeat commands.
  railless: true,
  help: 'repeat',
  cursor: 'default',
  options: RepeatControls,
  down(e: ToolPointer, ctx: ToolContext) {
    if (!canEdit(ctx, 'vector', 'The Repeat tool')) return;
    const id = hit(e, ctx.zoom);
    const h = handleAt(ctx.zoom);
    if (id && h) {
      drag = { id, key: `repeat-drag-${++gestures}`, from: h.from };
      ctx.requestOverlay();
      return;
    }
    // Anywhere else: pick the shape under the pointer, to see its repeat.
    const d = activeDrawing();
    if (!d || d.kind !== 'vector') return;
    const s = topShapeAt(d.shapes, e.x, e.y, GRAB_PX / ctx.zoom);
    store().setUi({ selection: s ? withGroups(d.shapes, [s.id]) : [] });
    ctx.requestOverlay();
  },
  move(e: ToolPointer, ctx: ToolContext) {
    follow(e, ctx);
  },
  up(e: ToolPointer, ctx: ToolContext) {
    // Letting go lands the last place too, in case no move came with it.
    follow(e, ctx);
    drag = null;
    clearSnap();
    ctx.requestOverlay();
  },
  hover(e: ToolPointer, ctx: ToolContext) {
    const next = hit(e, ctx.zoom);
    if (next === hot) return;
    hot = next;
    ctx.requestOverlay();
  },
  cancel() {
    drag = null;
    clearSnap();
  },
  leave() {
    drag = null;
    hot = null;
    clearSnap();
  },
  overlay(g: CanvasRenderingContext2D, ctx: ToolContext) {
    drawRepeatGuides(g, ctx.zoom, drag?.id ?? hot);
  },
};

registerTool(repeatTool);

/** For tests. */
export function resetRepeatTool(): void {
  drag = null;
  hot = null;
}

/**
 * The Marks tool [Shift+I]: drag to draw an arrow, a circle or a quick sketch over the picture, click to write a few
 * words, or rub a mark out. What it draws is shown by MarksLayer (an overlay that is never part of the picture), and is
 * saved in the file but never reaches an export.
 */
import { registerTool, type Tool, type ToolPointer } from '../core/registry';
import { MarksOptions } from './MarksOptions';
import { beginStroke, beginText, cancelStroke, eraseAt, finishStroke, finishText, moveStroke } from './marksOps';
import { getMarksState } from './marksState';

let rubbing = false;

export const marksTool: Tool = {
  id: 'marks',
  group: 'view',
  groupAt: 4,
  label: 'Marks',
  icon: 'mark',
  key: 'Shift+I',
  layers: ['vector', 'pixel', 'tilemap', 'camera'],
  order: 86,
  help: 'canvas-marks',
  cursor: 'crosshair',
  options: MarksOptions,
  down(e: ToolPointer, ctx) {
    const { shape } = getMarksState();
    if (shape === 'erase') {
      rubbing = true;
      eraseAt(e.x, e.y, ctx.zoom);
    } else if (shape === 'text') beginText(e.x, e.y);
    else beginStroke(shape, e.x, e.y);
  },
  move(e: ToolPointer, ctx) {
    if (rubbing) eraseAt(e.x, e.y, ctx.zoom);
    else moveStroke(e.x, e.y, { shift: e.shift, zoom: ctx.zoom });
  },
  up(_e, ctx) {
    if (rubbing) rubbing = false;
    else if (getMarksState().draft) finishStroke(ctx.zoom);
  },
  cancel() {
    rubbing = false;
    cancelStroke();
  },
  leave() {
    rubbing = false;
    cancelStroke();
    finishText();
  },
  onKey(e) {
    if (e.key === 'Escape' && getMarksState().draft) {
      cancelStroke();
      return true;
    }
    return false;
  },
};

registerTool(marksTool);

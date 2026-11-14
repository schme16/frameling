/**
 * The Notes tool [Shift+Y]: click the canvas to leave a note, then type. The marker is drawn by NotesLayer (it is a real
 * button, so you can drag it and click it with any tool); this tool only makes new ones.
 */
import { registerTool, type Tool, type ToolPointer } from '../core/registry';
import { NotesOptions } from './Options';
import { leaveNoteAt } from './ops';

/** Screen pixels a press may wander and still be a click. */
const CLICK_PX = 5;

let start: { x: number; y: number; zoom: number } | null = null;

export const notesTool: Tool = {
  id: 'notes',
  group: 'view',
  groupAt: 2,
  label: 'Notes',
  icon: 'note',
  key: 'Shift+Y',
  layers: ['vector', 'pixel', 'tilemap', 'camera'],
  order: 85,
  help: 'canvas-notes',
  cursor: 'crosshair',
  options: NotesOptions,
  down(e: ToolPointer, ctx) {
    start = { x: e.x, y: e.y, zoom: ctx.zoom };
  },
  up(e: ToolPointer) {
    const s = start;
    start = null;
    if (!s) return;
    if (Math.hypot(e.x - s.x, e.y - s.y) * s.zoom > CLICK_PX) return;
    leaveNoteAt(s.x, s.y);
  },
  cancel() {
    start = null;
  },
};

registerTool(notesTool);

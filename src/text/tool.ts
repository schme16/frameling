// The Text tool [T]: click to type new text, click text to type into it.
import { registerTool, type Tool } from '../core/registry';
import { store } from '../core/store';
import { topShapeAt } from '../canvas/geometry';
import { currentKey } from '../symbols/ops';
import { canEdit } from '../tools/util';
import { lazyPanel } from '../core/lazy';
import { editingText, editText, startNewText, stopEditingText } from './TextEditor';

export const textTool: Tool = {
  id: 'text',
  group: 'shapes',
  groupAt: 6,
  label: 'Text',
  icon: 'text',
  key: 't',
  layers: ['vector'],
  order: 65,
  help: 'text',
  cursor: 'text',
  options: lazyPanel(() => import('./TextPanel').then((m) => m.TextOptions)),
  down(e, ctx) {
    if (editingText()) {
      stopEditingText();
      return;
    }
    if (!canEdit(ctx, 'vector', 'Text')) return;
    const k = currentKey();
    const hit = k ? topShapeAt(k.drawing.shapes, e.x, e.y, 4 / store().get().ui.zoom) : undefined;
    if (hit?.type === 'text') editText(hit.id);
    else startNewText({ x: e.x, y: e.y });
  },
  cancel() {
    stopEditingText();
  },
};

registerTool(textTool);

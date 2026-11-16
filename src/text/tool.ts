// The Text tool [T]: click to type new text, click text to type into it. On a pixel layer it types pixel text (see pixel/).
import type { Tool } from '../core/registry';
import { store } from '../core/store';
import { topShapeAt } from '../canvas/geometry';
import { currentKey } from '../symbols/ops';
import { canEdit } from '../tools/util';
import { lazyPanel } from '../core/lazy';
import { byLayerKind } from '../pixel/ToolOptions';
import { activePixelLayer } from '../pixel/tools';
import { editingText, editText, startNewText, stopEditingText } from './TextEditor';
import { commitPixelText, pixelTextDown, pixelTextMove, pixelTextOverlay, pixelTextUp } from './pixel/session';

export const textTool: Tool = {
  id: 'text',
  group: 'shapes',
  groupAt: 6,
  label: 'Text',
  icon: 'text',
  key: 't',
  layers: ['vector', 'pixel'],
  order: 65,
  help: 'text',
  cursor: 'text',
  options: byLayerKind(
    lazyPanel(() => import('./TextPanel').then((m) => m.TextOptions)),
    lazyPanel(() => import('./pixel/PixelTextOptions').then((m) => m.PixelTextOptions)),
  ),
  down(e, ctx) {
    const px = activePixelLayer();
    if (px) {
      stopEditingText();
      return pixelTextDown(e, ctx, px);
    }
    commitPixelText();
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
  move(e) {
    const px = activePixelLayer();
    if (px) pixelTextMove(e, px);
  },
  up() {
    pixelTextUp();
  },
  overlay(g, ctx) {
    const px = activePixelLayer();
    if (px) pixelTextOverlay(g, ctx, px);
  },
  cancel() {
    stopEditingText();
  },
  leave() {
    void commitPixelText();
  },
};

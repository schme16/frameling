// Text as a kind of shape: how it is drawn, measured, hit, moved, posed and read from a file, and how the export
// formats write it. Registered for good when the text folder loads, so a drawing with text looks right and exports
// whether or not the Text feature is switched on (that only hides the tool, panel and commands).
import { transformPlaced } from '../canvas/geometry';
import type { TextShape } from '../core/format';
import { registerShapeKind } from '../core/shapeKinds';
import { registerShapeExport } from '../export/shapeExport';
import { drawText, hitText, textBounds } from './draw';
import { isAnimatedText } from './model';
import { readTextShape } from './read';

registerShapeKind<TextShape>({
  type: 'text',
  draw: (g, s) => drawText(g, s),
  extend(s, grow) {
    const t = textBounds(s);
    grow(t.x, t.y);
    grow(t.x + t.w, t.y + t.h);
  },
  bounds: textBounds,
  hit: hitText,
  transform: transformPlaced,
  moving: isAnimatedText,
  pose: (_doc, s, local) => (isAnimatedText(s) ? ({ ...s, posedFrame: local } as TextShape) : s),
  read: readTextShape,
});

registerShapeExport<TextShape>('text', { feature: 'text', load: () => import('./exports').then((m) => m.textExport) });

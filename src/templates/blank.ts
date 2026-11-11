import { newDoc } from '../core/doc';
import type { Doc } from '../core/format';
import { addPixelLayer, addVectorLayer, emptyOf, hold, pixelDrawing, vectorDrawing } from './build';

export function makeBlankVector(): Doc {
  const doc = emptyOf(newDoc({ name: 'Untitled drawing', width: 1280, height: 720, fps: 12, length: 12, background: '#ffffff' }));
  // Colour under line, the usual split for cleaning up a drawing. Each starts with an empty first frame.
  const colour = addVectorLayer(doc, 'Colour');
  const lines = addVectorLayer(doc, 'Lines');
  hold(colour, vectorDrawing(doc, []).id, 0);
  hold(lines, vectorDrawing(doc, []).id, 0);
  return doc;
}

export function makeBlankPixel(): Doc {
  const doc = emptyOf(newDoc({ name: 'Untitled pixel art', width: 256, height: 256, fps: 12, length: 8, background: null }));
  const layer = addPixelLayer(doc, 'Sprite', 8);
  hold(layer, pixelDrawing(doc, Array.from({ length: 32 }, () => '.'.repeat(32)), {}).id, 0);
  return doc;
}

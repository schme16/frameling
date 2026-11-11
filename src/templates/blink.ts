import { newDoc } from '../core/doc';
import type { Doc, StrokeShape, FillShape } from '../core/format';
import {
  INK, PEACH, ROSE, SUNNY,
  addClip, addMarker, addVectorLayer, arc, ellipsePath, emptyOf, fill, hold, stroke, vectorDrawing,
} from './build';

const LENGTH = 24;
const CX = 400;
const CY = 310;
const EYE_DX = 118;
const EYE_Y = 285;

/** Eyes at three openness levels: 1 open, 0.4 half shut, 0 closed. */
function eyes(open: number): (StrokeShape | FillShape)[] {
  const out: (StrokeShape | FillShape)[] = [];
  for (const side of [-1, 1]) {
    const x = CX + side * EYE_DX;
    if (open === 0) {
      out.push(stroke(arc(x, EYE_Y + 4, 34, 22, Math.PI * 0.12, Math.PI * 0.88, 14), INK, 13));
    } else {
      const ry = 44 * open;
      out.push(fill([ellipsePath(x, EYE_Y + (44 - ry) * 0.5, 30, ry)], INK));
      if (open === 1) out.push(fill([ellipsePath(x - 9, EYE_Y - 14, 9, 11)], '#ffffff'));
    }
  }
  return out;
}

/** A simple face with a 3-frame blink sitting on a 24-frame hold. */
export function makeBlink(): Doc {
  const doc = emptyOf(newDoc({ name: 'Blink', width: 800, height: 600, fps: 12, length: LENGTH, background: '#fff0c2' }));

  const head = addVectorLayer(doc, 'Head');
  const eyeLayer = addVectorLayer(doc, 'Eyes');
  const mouth = addVectorLayer(doc, 'Mouth');

  // Nothing on the head or the mouth moves, so each is one drawing held for all 24 frames.
  hold(head, vectorDrawing(doc, [
    fill([ellipsePath(CX, CY, 250, 225)], SUNNY),
    stroke(arc(CX, CY, 250, 225, 0, Math.PI * 2.04, 64), INK, 10),
    fill([ellipsePath(CX - 190, CY + 55, 38, 26)], ROSE, 0.7),
    fill([ellipsePath(CX + 190, CY + 55, 38, 26)], ROSE, 0.7),
    stroke(arc(CX - 70, CY - 120, 70, 30, Math.PI * 1.1, Math.PI * 1.7, 8), '#ffffff', 12, { opacity: 0.5, taperEnd: 18 }),
  ]).id, 0, LENGTH);
  hold(mouth, vectorDrawing(doc, [
    stroke(arc(CX, CY + 62, 62, 50, Math.PI * 0.12, Math.PI * 0.88, 14), INK, 11),
    fill([ellipsePath(CX, CY + 108, 20, 12)], PEACH, 0.9),
  ]).id, 0, LENGTH);

  // The key: eyes open for 21 frames, then three drawings of one frame each for the blink.
  const open = vectorDrawing(doc, eyes(1));
  const half = vectorDrawing(doc, eyes(0.4));
  const shut = vectorDrawing(doc, eyes(0));
  hold(eyeLayer, open.id, 0, 21);
  hold(eyeLayer, half.id, 21);
  hold(eyeLayer, shut.id, 22);
  // Opening again reuses the half-shut drawing.
  hold(eyeLayer, half.id, 23);

  addClip(doc, 'blink', 0, LENGTH - 1, true);
  addMarker(doc, 'blink', 22);
  return doc;
}

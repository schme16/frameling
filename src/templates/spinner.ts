import { newDoc, uid } from '../core/doc';
import type { Doc, InstanceShape, VectorLayer } from '../core/format';
import { newAnimator } from '../text/model';
import { GRAPE, addClip, addVectorLayer, ellipsePath, emptyOf, fill, hold, vectorDrawing } from './build';

const SIZE = 256;
const MID = { x: 128, y: 112 };
const LENGTH = 24;
const DOTS = 8;

/** A ring of dots, biggest and darkest at the top, fading away round the circle: it reads as spinning when it turns. */
function ringSymbol(doc: Doc): string {
  const shapes = Array.from({ length: DOTS }, (_, i) => {
    const a = -Math.PI / 2 - (i / DOTS) * Math.PI * 2;
    const r = 13 - i * 1.1;
    return fill([ellipsePath(MID.x + Math.cos(a) * 56, MID.y + Math.sin(a) * 56, r, r)], GRAPE, 1 - i * 0.11);
  });
  const id = uid('y');
  const layer: VectorLayer = { id: uid('l'), name: 'Layer 1', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
  hold(layer, vectorDrawing(doc, shapes).id, 0, 1);
  (doc.symbols ??= {})[id] = { id, name: 'Dot ring', layers: [layer], length: 1, origin: { ...MID } };
  return id;
}

/**
 * A loading spinner that loops without a seam: one tween turns the dot ring 345 degrees over 23 frames, and the jump
 * back to the start is the same 15 degree step. A "loading" label bobs in a wave that repeats every 24 frames too.
 */
export function makeSpinner(): Doc {
  const doc = emptyOf(newDoc({ name: 'Loading spinner', width: SIZE, height: SIZE, fps: 24, length: LENGTH, background: null }));
  const ring = ringSymbol(doc);
  const inst = (rotation: number): InstanceShape => ({ id: uid('s'), type: 'instance', symbolId: ring, transform: { x: MID.x, y: MID.y, scaleX: 1, scaleY: 1, rotation, skew: 0 }, opacity: 1, play: 'single', firstFrame: 0 });

  const spin = addVectorLayer(doc, 'Spinner');
  const step = 360 / LENGTH;
  spin.cels.push({ id: uid('c'), start: 0, length: LENGTH - 1, drawingId: vectorDrawing(doc, [inst(0) as never]).id, tween: { ease: 'linear' } });
  spin.cels.push({ id: uid('c'), start: LENGTH - 1, length: 1, drawingId: vectorDrawing(doc, [inst(360 - step) as never]).id });

  const label = addVectorLayer(doc, 'Label');
  hold(
    label,
    vectorDrawing(doc, [
      {
        id: uid('t'),
        type: 'text',
        text: 'loading',
        font: 'Nunito',
        size: 30,
        weight: 800,
        color: GRAPE,
        align: 'center',
        letterSpacing: 2,
        opacity: 1,
        transform: { x: MID.x, y: 222, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 },
        animators: [{ ...newAnimator('wave', uid('a')), duration: LENGTH, stagger: 3, amount: 5 }],
      } as never,
    ]).id,
    0,
    LENGTH,
  );

  addClip(doc, 'spin', 0, LENGTH - 1, true);
  return doc;
}

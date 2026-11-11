import { newDoc, uid } from '../core/doc';
import type { Doc, Easing, ShapeHint, VectorLayer } from '../core/format';
import { GRAPE, INK, MINT, ROSE, SUNNY, addVectorLayer, ellipsePath, emptyOf, fill, linePath, pathShape, rectPath, vectorDrawing } from './build';

const LENGTH = 48;
const MID = { x: 400, y: 280 };

function star(r1: number, r2: number, n = 5) {
  const points = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    points.push({ x: MID.x + Math.cos(a) * r, y: MID.y + Math.sin(a) * r });
  }
  return { closed: true, points };
}

/** Keys on a layer, each morphing into the next (the last one holds to the end). */
function morphKeys(doc: Doc, layer: VectorLayer, keys: { at: number; shapes: Parameters<typeof vectorDrawing>[1]; ease?: Easing; hints?: ShapeHint[] }[]): void {
  keys.forEach((k, i) => {
    const end = keys[i + 1]?.at ?? LENGTH;
    const d = vectorDrawing(doc, k.shapes);
    const tween = keys[i + 1] && k.ease ? { tween: { kind: 'shape' as const, ease: k.ease, ...(k.hints ? { hints: k.hints } : {}) } } : {};
    layer.cels.push({ id: uid('c'), start: k.at, length: end - k.at, drawingId: d.id, ...tween });
  });
}

/** A square melts into a circle, then a star, then back: shape tweens with easing, colours and a pair of hints. */
export function makeMorph(): Doc {
  const doc = emptyOf(newDoc({ name: 'Morphing shapes', width: 800, height: 560, fps: 24, length: LENGTH, background: '#fff7ea' }));
  const floor = addVectorLayer(doc, 'Floor');
  const fl = vectorDrawing(doc, [pathShape([linePath([[120, 470], [680, 470]])], null, { color: INK, width: 6 })]);
  floor.cels.push({ id: uid('c'), start: 0, length: LENGTH, drawingId: fl.id });

  const shadow = addVectorLayer(doc, 'Shadow');
  morphKeys(doc, shadow, [
    { at: 0, shapes: [fill([ellipsePath(400, 470, 120, 14)], INK, 0.2)], ease: 'easeInOut' },
    { at: 14, shapes: [fill([ellipsePath(400, 470, 90, 12)], INK, 0.2)], ease: 'easeInOut' },
    { at: 28, shapes: [fill([ellipsePath(400, 470, 70, 10)], INK, 0.15)], ease: 'easeInOut' },
    { at: 42, shapes: [fill([ellipsePath(400, 470, 120, 14)], INK, 0.2)] },
  ]);

  const shape = addVectorLayer(doc, 'Shape');
  const s = 220;
  morphKeys(doc, shape, [
    { at: 0, shapes: [pathShape([rectPath(MID.x - s / 2, MID.y - s / 2, s, s)], SUNNY, { color: INK, width: 8 })], ease: 'easeInOut' },
    { at: 14, shapes: [pathShape([ellipsePath(MID.x, MID.y, 120, 120)], ROSE, { color: INK, width: 8 })], ease: 'backOut' },
    {
      at: 28,
      shapes: [pathShape([star(150, 64)], GRAPE, { color: INK, width: 5 })],
      ease: 'easeInOut',
      // The star's top point goes back to the square's top-left corner, and its bottom-right point to the opposite one.
      hints: [
        { id: uid('h'), from: { x: MID.x, y: MID.y - 150 }, to: { x: MID.x - s / 2, y: MID.y - s / 2 } },
        { id: uid('h'), from: { x: MID.x + Math.cos(Math.PI * 0.3) * 150, y: MID.y + Math.sin(Math.PI * 0.3) * 150 }, to: { x: MID.x + s / 2, y: MID.y + s / 2 } },
      ],
    },
    { at: 42, shapes: [pathShape([rectPath(MID.x - s / 2, MID.y - s / 2, s, s)], MINT, { color: INK, width: 8 })] },
  ]);
  return doc;
}

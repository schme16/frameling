import { newDoc, uid } from '../core/doc';
import type { Doc, Easing, InstanceShape, Layer, Transform2D, VectorLayer } from '../core/format';
import { INK, PAPER, SKY, SUNNY, addVectorLayer, ellipsePath, emptyOf, fill, hold, pathShape, rectPath, vectorDrawing, type XY } from './build';

const LENGTH = 48;
const GROUND = 470;

// Symbols are drawn where they'd sit in the middle of the stage (symbol space is stage space), so drawing inside
// one shows it in plain view.
const MID = { x: 400, y: 300 };

function starPoints(r1: number, r2: number, n = 5, cx = MID.x, cy = MID.y): XY[] {
  const pts: XY[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** A symbol with one vector layer of the given keys (each a list of shapes, held `hold` frames). */
function addSymbol(doc: Doc, name: string, keys: Parameters<typeof vectorDrawing>[1][], holdFor = 1): string {
  const id = uid('y');
  const layer: VectorLayer = { id: uid('l'), name: 'Layer 1', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
  keys.forEach((shapes, i) => hold(layer, vectorDrawing(doc, shapes).id, i * holdFor, holdFor));
  (doc.symbols ??= {})[id] = { id, name, layers: [layer], length: keys.length * holdFor, origin: { ...MID } };
  return id;
}

function inst(symbolId: string, t: Partial<Transform2D>, more: Partial<InstanceShape> = {}): InstanceShape {
  return { id: uid('s'), type: 'instance', symbolId, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0, ...t }, opacity: 1, play: 'loop', firstFrame: 0, ...more };
}

/** Keys on a layer, each tweened into the next with its easing (the last one holds to the end). */
function tweenKeys(doc: Doc, layer: Layer, keys: { at: number; shapes: InstanceShape[]; ease?: Easing; spin?: number }[]): void {
  keys.forEach((k, i) => {
    const end = keys[i + 1]?.at ?? LENGTH;
    const d = vectorDrawing(doc, []);
    d.shapes.push(...k.shapes);
    layer.cels.push({ id: uid('c'), start: k.at, length: end - k.at, drawingId: d.id, ...(k.ease && keys[i + 1] ? { tween: { ease: k.ease, ...(k.spin ? { spin: k.spin } : {}) } } : {}) });
  });
}

/** A star logo drops in with a bounce, pops, spins and fades: symbols, nested timelines and eased in-betweens. */
export function makeBouncingLogo(): Doc {
  const doc = emptyOf(newDoc({ name: 'Bouncing logo', width: 800, height: 600, fps: 24, length: LENGTH, background: '#eaf6ff' }));

  // A twinkle that loops inside the star: four frames of a little coral shine growing and shrinking (coral, not white,
  // so it shows on the star and in the Library in both light and dark).
  const twinkle = addSymbol(
    doc,
    'Twinkle',
    [6, 10, 13, 9].map((r) => [pathShape([{ closed: true, points: starPoints(r, r * 0.35, 4).map(([x, y]) => ({ x, y })) }], '#ff6f91', null)]),
    3,
  );
  const star = addSymbol(doc, 'Star', [
    [
      pathShape([{ closed: true, points: starPoints(92, 44).map(([x, y]) => ({ x, y })) }], SUNNY, { color: INK, width: 9 }),
      fill([ellipsePath(MID.x - 22, MID.y - 6, 8, 12), ellipsePath(MID.x + 22, MID.y - 6, 8, 12)], INK),
      inst(twinkle, { x: MID.x - 38, y: MID.y - 38 }) as never,
    ],
  ]);
  const shadow = addSymbol(doc, 'Shadow', [[fill([ellipsePath(MID.x, MID.y, 90, 16)], INK, 0.25)]]);

  const ground = addVectorLayer(doc, 'Ground');
  hold(ground, vectorDrawing(doc, [fill([rectPath(0, GROUND, 800, 130)], SKY), pathShape([{ closed: false, points: [{ x: 0, y: GROUND }, { x: 800, y: GROUND }] }], null, { color: INK, width: 6 })]).id, 0, LENGTH);

  const shadowLayer = addVectorLayer(doc, 'Shadow');
  tweenKeys(doc, shadowLayer, [
    { at: 0, shapes: [inst(shadow, { x: 400, y: GROUND, scaleX: 0.3, scaleY: 0.3 }, { opacity: 0.3 })], ease: 'bounceOut' },
    { at: 20, shapes: [inst(shadow, { x: 400, y: GROUND })], ease: 'easeInOut' },
    { at: 36, shapes: [inst(shadow, { x: 400, y: GROUND, scaleX: 1.2, scaleY: 1.2 })], ease: 'easeIn' },
    { at: 47, shapes: [inst(shadow, { x: 400, y: GROUND }, { opacity: 0 })] },
  ]);

  const logo = addVectorLayer(doc, 'Logo');
  tweenKeys(doc, logo, [
    { at: 0, shapes: [inst(star, { x: 400, y: -80, scaleX: 0.7, scaleY: 0.7, rotation: -40 })], ease: 'bounceOut' },
    { at: 20, shapes: [inst(star, { x: 400, y: GROUND - 92 })], ease: 'backOut' },
    { at: 30, shapes: [inst(star, { x: 400, y: GROUND - 150, scaleX: 1.35, scaleY: 1.35 }, { tint: { color: '#ff6f91', amount: 0 } })], ease: 'easeInOut' },
    { at: 36, shapes: [inst(star, { x: 400, y: GROUND - 150, scaleX: 1.35, scaleY: 1.35 }, { tint: { color: '#ff6f91', amount: 0.35 } })], ease: 'easeIn', spin: 1 },
    { at: 47, shapes: [inst(star, { x: 400, y: 120, scaleX: 0.2, scaleY: 0.2 }, { opacity: 0, tint: { color: '#ff6f91', amount: 0.35 } })] },
  ]);

  doc.swatches.push({ id: uid('s'), name: 'Paper', color: PAPER });
  return doc;
}

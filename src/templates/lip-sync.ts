import { newDoc, uid } from '../core/doc';
import type { Doc, FillShape, InstanceShape, PathShape, StrokeShape, VectorLayer } from '../core/format';
import { applyMouths } from '../lipsync/apply';
import { CHART, type Mouth } from '../lipsync/chart';
import { INK, PEACH, ROSE, SUNNY, addMarker, addVectorLayer, arc, ellipsePath, emptyOf, fill, hold, pathShape, rectPath, stroke, vectorDrawing } from './build';

const LENGTH = 48;
const CX = 400;
const CY = 310;
/** Where the mouth sits, which is also the symbol's registration point. */
const MX = 400;
const MY = 405;
const DARK = '#7a2840';
const TONGUE = '#ff7b8f';
const TEETH = '#ffffff';

type Piece = FillShape | PathShape | StrokeShape;

const ring = (rx: number, ry: number, dy = 0, width = 8): PathShape => pathShape([ellipsePath(MX, MY + dy, rx, ry)], null, { color: INK, width });
const inside = (rx: number, ry: number, dy = 0): PathShape => pathShape([ellipsePath(MX, MY + dy, rx, ry)], DARK, null);
const teethTop = (rx: number, ry: number, dy = 0, from = 0.88, to = 0.3): FillShape => fill([rectPath(MX - rx * 0.5, MY + dy - ry * from, rx, ry * (from - to))], TEETH);
const teethBottom = (rx: number, ry: number, dy = 0, from = 0.3, to = 0.85): FillShape => fill([rectPath(MX - rx * 0.45, MY + dy + ry * from, rx * 0.9, ry * (to - from))], TEETH);
const tongue = (rx: number, ry: number, dx = 0, dy = 0): FillShape => fill([ellipsePath(MX + dx, MY + dy, rx, ry)], TONGUE);

/** One cartoon mouth per shape on the chart, in chart order. Original art, plain shapes. */
function mouthShapes(): Record<Mouth, Piece[]> {
  return {
    rest: [stroke(arc(MX, MY - 24, 64, 30, Math.PI * 0.14, Math.PI * 0.86, 16), INK, 11, { taperStart: 6, taperEnd: 6 })],
    A: [inside(58, 46), teethTop(58, 46), tongue(36, 16, 0, 26), ring(58, 46)],
    E: [inside(74, 24), teethTop(74, 24, 0, 0.92, 0.0), teethBottom(74, 24, 0, 0.35, 0.9), ring(74, 24)],
    O: [inside(34, 42), tongue(20, 10, 0, 24), ring(34, 42)],
    U: [inside(20, 22), ring(20, 22, 0, 9), stroke(arc(MX, MY, 38, 36, Math.PI * 0.9, Math.PI * 1.15, 4), INK, 7)],
    MBP: [pathShape([ellipsePath(MX, MY, 62, 9)], ROSE, { color: INK, width: 8 }), stroke([[MX - 56, MY], [MX + 56, MY]], INK, 6)],
    FV: [inside(56, 17, 0), teethTop(56, 17, 0, 0.9, -0.1), pathShape([ellipsePath(MX, MY + 11, 40, 9)], ROSE, null), ring(56, 17)],
    L: [inside(50, 30), teethTop(50, 30), tongue(22, 11, 0, -8), ring(50, 30)],
    WQ: [pathShape([ellipsePath(MX, MY, 30, 32)], ROSE, { color: INK, width: 8 }), inside(14, 16), ring(14, 16, 0, 5)],
    etc: [inside(58, 17), teethTop(58, 17, 0, 0.92, 0.05), teethBottom(58, 17, 0, 0.05, 0.85), ring(58, 17)],
  };
}

/** A face with a talking mouth, and the ten mouth shapes ready to go: the starting point for lip sync. */
export function makeLipSync(): Doc {
  const doc = emptyOf(newDoc({ name: 'Lip sync mouth chart', width: 800, height: 600, fps: 24, length: LENGTH, background: '#fff0c2' }));

  // The mouth symbol: one frame per chart shape, named like the chart so Auto lip sync can find each one.
  const shapes = mouthShapes();
  const symbolId = uid('y');
  const layer: VectorLayer = { id: uid('l'), name: 'Mouth shapes', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
  CHART.forEach((m, i) => hold(layer, vectorDrawing(doc, shapes[m.id]).id, i, 1));
  (doc.symbols ??= {})[symbolId] = { id: symbolId, name: 'Mouth', layers: [layer], length: CHART.length, origin: { x: MX, y: MY }, frameLabels: CHART.map((m) => m.label) };

  const head = addVectorLayer(doc, 'Head');
  const eyes = addVectorLayer(doc, 'Eyes');
  const mouth = addVectorLayer(doc, 'Mouth');

  hold(head, vectorDrawing(doc, [
    fill([ellipsePath(CX, CY, 250, 225)], SUNNY),
    stroke(arc(CX, CY, 250, 225, 0, Math.PI * 2.04, 64), INK, 10),
    fill([ellipsePath(CX - 190, CY + 55, 38, 26)], ROSE, 0.7),
    fill([ellipsePath(CX + 190, CY + 55, 38, 26)], ROSE, 0.7),
    fill([ellipsePath(CX, CY + 55, 16, 11)], PEACH),
    stroke(arc(CX, CY + 55, 16, 11, 0, Math.PI * 2, 20), INK, 6),
    stroke(arc(CX - 70, CY - 120, 70, 30, Math.PI * 1.1, Math.PI * 1.7, 8), '#ffffff', 12, { opacity: 0.5, taperEnd: 18 }),
  ]).id, 0, LENGTH);

  const eyePair: Piece[] = [];
  for (const side of [-1, 1]) {
    const x = CX + side * 105;
    eyePair.push(fill([ellipsePath(x, CY - 35, 28, 40)], INK), fill([ellipsePath(x - 8, CY - 50, 8, 10)], '#ffffff'));
    eyePair.push(stroke(arc(x, CY - 100, 34, 12, Math.PI * 1.1, Math.PI * 1.9, 10), INK, 9, { taperStart: 6, taperEnd: 6 }));
  }
  hold(eyes, vectorDrawing(doc, eyePair).id, 0, LENGTH);

  const inst: InstanceShape = { id: uid('s'), type: 'instance', symbolId, transform: { x: MX, y: MY, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'single', firstFrame: 0 };
  const base = vectorDrawing(doc, []);
  base.shapes.push(inst);
  hold(mouth, base.id, 0, LENGTH);

  // A little "hello" already on the mouth layer, so playing it shows what Auto lip sync writes.
  const hello: Mouth[] = ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'E', 'E', 'etc', 'L', 'L', 'O', 'O', 'O', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'];
  applyMouths(doc, mouth.id, 0, hello);

  addMarker(doc, 'Import a sound, then Animate > Auto lip sync', 0);
  return doc;
}

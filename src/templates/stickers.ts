import { newDoc, uid } from '../core/doc';
import type { Doc, InstanceShape, PathShape, Shape, SubPath, VectorLayer } from '../core/format';
import { INK, MINT, PEACH, ROSE, SKY, SUNNY, addMarker, addVectorLayer, ellipsePath, emptyOf, fill, hold, pathShape, stroke, vectorDrawing, type XY } from './build';

const SIZE = 512;
const MID = { x: 256, y: 256 };
const WHITE = '#ffffff';

const poly = (pts: XY[]): SubPath => ({ closed: true, points: pts.map(([x, y]) => ({ x, y })) });

function heartPts(cx: number, cy: number, s: number): XY[] {
  const pts: XY[] = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    pts.push([cx + 16 * Math.sin(t) ** 3 * s, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s]);
  }
  return pts;
}

function starPts(cx: number, cy: number, r1: number, r2: number): XY[] {
  return Array.from({ length: 10 }, (_, i): XY => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? r2 : r1;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

/** The die-cut look: a soft shadow and a thick white border behind each outline. */
function cut(paths: SubPath[], border = 34): PathShape[] {
  const shadow = pathShape(paths, INK, { color: INK, width: border }, 0.16);
  shadow.paths = paths.map((p) => ({ ...p, points: p.points.map((q) => ({ ...q, x: q.x + 8, y: q.y + 12, c1: q.c1 && { x: q.c1.x + 8, y: q.c1.y + 12 }, c2: q.c2 && { x: q.c2.x + 8, y: q.c2.y + 12 } })) }));
  return [shadow, pathShape(paths, WHITE, { color: WHITE, width: border })];
}

const eyes = (y: number, dx = 52, ry = 22): Shape[] => [fill([ellipsePath(MID.x - dx, y, 15, ry)], INK), fill([ellipsePath(MID.x + dx, y, 15, ry)], INK)];
const smile = (y: number, w = 70, depth = 46, size = 14): Shape => stroke([[MID.x - w, y], [MID.x - w * 0.5, y + depth * 0.8], [MID.x, y + depth], [MID.x + w * 0.5, y + depth * 0.8], [MID.x + w, y]], INK, size);
const cheeks = (y: number, dx = 98): Shape[] => [fill([ellipsePath(MID.x - dx, y, 26, 15)], PEACH, 0.8), fill([ellipsePath(MID.x + dx, y, 26, 15)], PEACH, 0.8)];

const face = (color: string): Shape[] => {
  const p = [ellipsePath(MID.x, MID.y, 170, 170)];
  return [...cut(p), pathShape(p, color, { color: INK, width: 10 })];
};

const STICKERS: { name: string; shapes: () => Shape[] }[] = [
  {
    name: 'happy',
    shapes: () => [
      ...face(SUNNY),
      stroke([[MID.x - 82, 230], [MID.x - 56, 206], [MID.x - 30, 230]], INK, 14),
      stroke([[MID.x + 30, 230], [MID.x + 56, 206], [MID.x + 82, 230]], INK, 14),
      ...cheeks(286),
      smile(282, 76, 60),
    ],
  },
  {
    name: 'love',
    shapes: () => {
      const p = [poly(heartPts(MID.x, MID.y - 10, 10.5))];
      return [...cut(p), pathShape(p, ROSE, { color: INK, width: 10 }), fill([ellipsePath(MID.x - 92, MID.y - 92, 22, 34)], WHITE, 0.7), ...eyes(236, 48, 18), smile(272, 34, 24, 12)];
    },
  },
  {
    name: 'wow',
    shapes: () => [...face(SUNNY), fill([ellipsePath(MID.x - 58, 222, 30, 34)], WHITE), fill([ellipsePath(MID.x + 58, 222, 30, 34)], WHITE), ...eyes(226, 58, 16), pathShape([ellipsePath(MID.x, 320, 34, 44)], INK, null), fill([ellipsePath(MID.x, 336, 20, 16)], ROSE)],
  },
  {
    name: 'star',
    shapes: () => {
      const p = [poly(starPts(MID.x, MID.y + 10, 200, 90))];
      return [...cut(p), pathShape(p, SUNNY, { color: INK, width: 10 }), ...eyes(262, 34, 16), smile(296, 26, 18, 10), ...cheeks(290, 66)];
    },
  },
  {
    name: 'sleepy',
    shapes: () => {
      const puffs = [ellipsePath(170, 290, 86, 76), ellipsePath(260, 240, 108, 100), ellipsePath(350, 290, 86, 76), ellipsePath(256, 320, 150, 60)];
      return [
        ...puffs.flatMap((p) => cut([p])),
        ...puffs.map((p) => pathShape([p], '#eef4ff', { color: INK, width: 10 })),
        // The puffs' inner outlines are covered by one more fill without a line, so it reads as one cloud.
        ...puffs.map((p) => pathShape([p], '#eef4ff', null)),
        stroke([[200, 284], [222, 296], [244, 284]], INK, 10),
        stroke([[272, 284], [294, 296], [316, 284]], INK, 10),
        stroke([[338, 120], [372, 120], [338, 152], [372, 152]], SKY, 12),
        stroke([[388, 70], [412, 70], [388, 94], [412, 94]], SKY, 10),
      ];
    },
  },
  {
    name: 'ok',
    shapes: () => {
      const p = [ellipsePath(MID.x, MID.y, 160, 160)];
      return [...cut(p), pathShape(p, MINT, { color: INK, width: 10 }), stroke([[176, 262], [234, 318], [344, 196]], WHITE, 36)];
    },
  },
];

/** A symbol for each sticker, so any of them can be dropped into another drawing and reused. */
function addSymbol(doc: Doc, name: string, shapes: Shape[]): string {
  const id = uid('y');
  const layer: VectorLayer = { id: uid('l'), name: 'Layer 1', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
  hold(layer, vectorDrawing(doc, shapes as Parameters<typeof vectorDrawing>[1]).id, 0, 1);
  (doc.symbols ??= {})[id] = { id, name, layers: [layer], length: 1, origin: { ...MID } };
  return id;
}

/**
 * Six die-cut stickers (emoji style), one per frame, each its own symbol and named by a marker, ready to export as
 * separate pictures.
 */
export function makeStickers(): Doc {
  const doc = emptyOf(newDoc({ name: 'Sticker pack', width: SIZE, height: SIZE, fps: 2, length: STICKERS.length, background: null }));
  const layer = addVectorLayer(doc, 'Stickers');
  STICKERS.forEach((s, i) => {
    const sym = addSymbol(doc, `Sticker: ${s.name}`, s.shapes());
    const inst: InstanceShape = { id: uid('s'), type: 'instance', symbolId: sym, transform: { x: MID.x, y: MID.y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'single', firstFrame: 0 };
    hold(layer, vectorDrawing(doc, [inst as never]).id, i, 1);
    addMarker(doc, s.name, i);
  });
  return doc;
}

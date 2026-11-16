// A layered file's layers as Frameling pixel layers and folders: names, order, opacity, blend, visibility and clipping kept,
// each picture held for the length of the drawing. Pure.
import { newPixelLayer, newVectorLayer, uid } from '../../core/doc';
import type { Id, LayerFolder, PixelDrawing, TextShape, VectorDrawing } from '../../core/format';
import { trimPixels } from '../../core/pixelBounds';
import { newTextShape } from '../../text/model';
import { STILL_LENGTH, type Pieces } from '../pieces';
import type { LayeredFile, LayerNode, TextNode } from './model';

/** A text layer as a vector layer holding one text shape. */
function textShapeOf(n: TextNode): TextShape {
  return newTextShape(uid('t'), { x: n.x, y: n.y }, {
    text: n.text,
    font: n.font,
    size: n.size,
    weight: n.weight,
    ...(n.italic ? { italic: true } : {}),
    color: n.color,
    align: n.align,
    lineHeight: n.lineHeight,
    letterSpacing: n.letterSpacing,
    transform: { x: n.x, y: n.y, scaleX: n.scaleX, scaleY: 1, rotation: n.rotation, skew: 0 },
  });
}

/** What a file holds, counted: pictures, groups and layers with nothing on them. */
export function countNodes(nodes: LayerNode[]): { layers: number; groups: number } {
  let layers = 0;
  let groups = 0;
  for (const n of nodes) {
    if (n.type === 'group') {
      groups++;
      const c = countNodes(n.children);
      layers += c.layers;
      groups += c.groups;
    } else layers++;
  }
  return { layers, groups };
}

/** How many layers came in as words you can edit. */
export function countText(nodes: LayerNode[]): number {
  let n = 0;
  for (const x of nodes) n += x.type === 'group' ? countText(x.children) : x.type === 'text' ? 1 : 0;
  return n;
}

export function layeredPieces(file: LayeredFile, length = STILL_LENGTH): Pieces {
  const out: Pieces = { width: file.width, height: file.height, layers: [], drawings: {}, folders: {} };
  const visit = (nodes: LayerNode[], folder: Id | undefined) => {
    for (const n of nodes) {
      if (n.type === 'group') {
        const id = uid('f');
        const f: LayerFolder = { id, name: n.name, visible: !n.hidden, opacity: n.opacity, ...(n.blend !== 'normal' ? { blend: n.blend } : {}), ...(folder ? { parent: folder } : {}) };
        out.folders[id] = f;
        visit(n.children, id);
        continue;
      }
      if (n.type === 'text') {
        const layer = newVectorLayer(n.name);
        layer.visible = !n.hidden;
        layer.opacity = n.opacity;
        if (n.blend !== 'normal') layer.blend = n.blend;
        if (n.clip) layer.clipToBelow = true;
        if (n.locked) layer.locked = true;
        if (folder) layer.folder = folder;
        const d: VectorDrawing = { id: uid('v'), kind: 'vector', shapes: [textShapeOf(n)] };
        out.drawings[d.id] = d;
        layer.cels.push({ id: uid('c'), start: 0, length, drawingId: d.id });
        out.layers.push(layer);
        continue;
      }
      const layer = newPixelLayer(n.name, 1);
      layer.visible = !n.hidden;
      layer.opacity = n.opacity;
      if (n.blend !== 'normal') layer.blend = n.blend;
      if (n.clip) layer.clipToBelow = true;
      if (n.locked) layer.locked = true;
      if (folder) layer.folder = folder;
      const t = n.width && n.height ? trimPixels(n.pixels, n.width, n.height, n.x, n.y) : null;
      if (t && t.width && t.height) {
        const d: PixelDrawing = { id: uid('p'), kind: 'pixel', width: t.width, height: t.height, pixels: t.pixels };
        if (t.x) d.x = t.x;
        if (t.y) d.y = t.y;
        out.drawings[d.id] = d;
        layer.cels.push({ id: uid('c'), start: 0, length, drawingId: d.id });
      }
      out.layers.push(layer);
    }
  };
  visit(file.nodes, undefined);
  return out;
}

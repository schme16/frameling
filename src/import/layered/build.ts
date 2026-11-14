// A layered file's layers as Frameling pixel layers and folders: names, order, opacity, blend, visibility and clipping kept,
// each picture held for the length of the drawing. Pure.
import { newPixelLayer, uid } from '../../core/doc';
import type { Id, LayerFolder, PixelDrawing } from '../../core/format';
import { trimPixels } from '../../core/pixelBounds';
import { STILL_LENGTH, type Pieces } from '../pieces';
import type { LayeredFile, LayerNode } from './model';

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

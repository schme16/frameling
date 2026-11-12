// A grey square inside a symbol that sits inside another symbol, each copy washed with its own colour.
import { newDoc } from '../../src/core/doc';
import type { Doc, InstanceShape } from '../../src/core/format';
import { makeSymbol } from '../../src/core/symbols';
import { addVectorLayer, fill, hold, rectPath, vectorDrawing } from '../../src/templates/build';

export type Wash = { color: string; amount: number } | undefined;

/** `inner` washes the copy of the inner symbol (inside the outer one), `outer` the copy of the outer symbol on the stage. */
export function nestedTintDoc(inner: Wash, outer: Wash, opts: { length?: number } = {}): Doc {
  const doc = newDoc({ width: 100, height: 100, length: opts.length ?? 2, fps: 12 });
  doc.layers = [];
  const layer = addVectorLayer(doc, 'Stage');
  const d = vectorDrawing(doc, [fill([rectPath(30, 30, 40, 40)], '#808080')]);
  hold(layer, d.id, 0, doc.length);
  const a = makeSymbol(doc, d.id, [d.shapes[0].id], { x: 50, y: 50 }, 'Inner')!;
  const b = makeSymbol(doc, d.id, [a.instanceId], { x: 50, y: 50 }, 'Outer')!;
  const innerDrawing = doc.drawings[doc.symbols![b.symbolId].layers[0].cels[0].drawingId];
  if (innerDrawing.kind !== 'vector') throw new Error('expected a vector drawing');
  const innerInst = innerDrawing.shapes.find((s): s is InstanceShape => s.type === 'instance')!;
  if (inner) innerInst.tint = inner;
  const outerInst = d.shapes.find((s): s is InstanceShape => s.type === 'instance')!;
  if (outer) outerInst.tint = outer;
  return doc;
}

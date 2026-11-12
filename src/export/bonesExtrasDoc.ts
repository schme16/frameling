// A small scene for the Godot bones checks (test/export/godot-bones-extras-e2e, scripts/e2e/export.cjs). Not a template people see.
import { newDoc, newVectorLayer, uid } from '../core/doc';
import { newCameraLayer } from '../core/camera';
import type { Bone, CameraDrawing, Doc, InstanceShape, PlayMode, VectorLayer } from '../core/format';
import { boneBetween } from '../rig/math';
import { ellipsePath, emptyOf, hold, pathShape, rectPath, vectorDrawing } from '../templates/build';

export interface ExtrasOptions {
  play?: PlayMode;
  firstFrame?: number;
  camera?: { a: { x: number; y: number; zoom: number; rotation: number }; b: { x: number; y: number; zoom: number; rotation: number } };
  /** Put effects on the layer with the arm instance, which keeps it from staying live. */
  fxOnHero?: boolean;
  /** Scale the second arm copy on the stage by this much (a big copy of a symbol). */
  bigCopy?: number;
  /** A Show mask over the backdrop (a round window) and a stripe clipped to the backdrop. */
  masked?: boolean;
}

/**
 * A little scene for the Godot checks: an arm symbol with a two bone skeleton (the upper bone swings, with an eased
 * glide), a hero layer holding two instances of it (one moves and is tinted), a far backdrop with depth, a glowing
 * layer with Add blend and a camera.
 */
export function bonesExtrasDoc(o: ExtrasOptions = {}): Doc {
  const doc = emptyOf(newDoc({ name: 'Extras', width: 360, height: 270, fps: 12, length: 12, background: '#203040' }));

  // The symbol: bones in symbol space, with its own timeline of 12 frames.
  const rig = newVectorLayer('Arm bones') as VectorLayer;
  const upper: Bone = boneBetween('bu', 'Upper', { x: 0, y: 0 }, { x: 60, y: 0 }, null);
  const lower: Bone = boneBetween('bl', 'Lower', { x: 60, y: 0 }, { x: 110, y: 0 }, 'bu');
  rig.rig = { bones: [upper, lower] };
  const p0 = vectorDrawing(doc, []);
  p0.pose = { bu: { r: 0 } };
  const p1 = vectorDrawing(doc, []);
  p1.pose = { bu: { r: 40 }, bl: { r: -30 } };
  rig.cels = [
    { id: uid('c'), start: 0, length: 6, drawingId: p0.id, tween: { ease: 'easeInOut' } },
    { id: uid('c'), start: 6, length: 6, drawingId: p1.id },
  ];
  const part = (name: string, bone: string, x: number, y: number, w: number, h: number, color: string): VectorLayer => {
    const l = newVectorLayer(name) as VectorLayer;
    l.bind = { rig: rig.id, bone };
    hold(l, vectorDrawing(doc, [pathShape([rectPath(x, y, w, h)], color, null)]).id, 0, 12);
    return l;
  };
  const upperPart = part('Upper arm', 'bu', 0, -8, 60, 16, '#ff9e6d');
  const lowerPart = part('Lower arm', 'bl', 60, -6, 50, 12, '#ffc94a');
  const hand = newVectorLayer('Hand') as VectorLayer;
  hold(hand, vectorDrawing(doc, [pathShape([ellipsePath(115, 0, 9, 9)], '#ff6f91', null)]).id, 0, 12);
  const symId = uid('sym');
  (doc.symbols ??= {})[symId] = { id: symId, name: 'Arm', layers: [rig, upperPart, lowerPart, hand], length: 12, origin: { x: 0, y: 0 } };

  const inst = (x: number, y: number, extra: Partial<InstanceShape> = {}): InstanceShape => ({
    id: uid('i'),
    type: 'instance',
    symbolId: symId,
    transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 },
    opacity: 1,
    play: o.play ?? 'loop',
    firstFrame: o.firstFrame ?? 0,
    ...extra,
  });

  // Stage, back to front.
  const sky = newVectorLayer('Sky') as VectorLayer;
  sky.depth = 1;
  hold(sky, vectorDrawing(doc, [pathShape([rectPath(-40, 0, 440, 150)], '#4a6a8a', null), pathShape([ellipsePath(260, 60, 30, 30)], '#ffe9a0', null)]).id, 0, 12);
  doc.layers.push(sky);

  if (o.masked) {
    const stripe = newVectorLayer('Stripe') as VectorLayer;
    stripe.clipToBelow = true;
    stripe.depth = 1;
    hold(stripe, vectorDrawing(doc, [pathShape([rectPath(-40, 40, 440, 30)], '#ff4fa0', null)]).id, 0, 12);
    doc.layers.push(stripe);
    const win = newVectorLayer('Window') as VectorLayer;
    win.mask = 'show';
    win.depth = 1;
    hold(win, vectorDrawing(doc, [pathShape([ellipsePath(200, 70, 120, 60)], '#ffffff', null)]).id, 0, 12);
    doc.layers.push(win);
  }

  const hero = newVectorLayer('Hero') as VectorLayer;
  const h0 = vectorDrawing(doc, []);
  h0.shapes = [inst(90, 150), inst(250, 190, { transform: { x: 250, y: 190, scaleX: 0.8, scaleY: 0.8, rotation: -15, skew: 0 } })];
  const h1 = vectorDrawing(doc, []);
  h1.shapes = [inst(130, 130, { opacity: 0.8, tint: { color: '#ff0000', amount: 0.5 } }), inst(250, 190, { transform: { x: 250, y: 190, scaleX: 0.8, scaleY: 0.8, rotation: -15, skew: 0 } })];
  hero.cels = [
    { id: uid('c'), start: 0, length: 6, drawingId: h0.id, tween: { ease: 'easeInOut' } },
    { id: uid('c'), start: 6, length: 6, drawingId: h1.id },
  ];
  if (o.bigCopy)
    for (const d of [h0, h1]) {
      const t = (d.shapes[1] as InstanceShape).transform;
      Object.assign(t, { x: 20, y: 215, scaleX: o.bigCopy, scaleY: o.bigCopy, rotation: -20 });
    }
  if (o.fxOnHero) hero.effects = [{ id: uid('e'), kind: 'blur', values: { radius: 2 } }];
  doc.layers.push(hero);

  const glow = newVectorLayer('Glow') as VectorLayer;
  glow.blend = 'add';
  glow.opacity = 0.7;
  glow.effects = [{ id: uid('e'), kind: 'glow', values: { color: '#ffd76a', size: 10, strength: 1 } }];
  hold(glow, vectorDrawing(doc, [pathShape([ellipsePath(180, 60, 22, 22)], '#ff8a3a', null)]).id, 0, 12);
  doc.layers.push(glow);

  if (o.camera) {
    const { layer } = newCameraLayer(doc);
    const mk = (v: typeof o.camera.a): CameraDrawing => {
      const d: CameraDrawing = { id: uid('k'), kind: 'camera', view: { ...v } };
      doc.drawings[d.id] = d;
      return d;
    };
    const a = mk(o.camera.a);
    const b = mk(o.camera.b);
    delete doc.drawings[layer.cels[0].drawingId];
    layer.cels = [
      { id: uid('c'), start: 0, length: 6, drawingId: a.id, tween: { ease: 'easeInOut' } },
      { id: uid('c'), start: 6, length: 6, drawingId: b.id },
    ];
    doc.layers.push(layer);
  }
  return doc;
}

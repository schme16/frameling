// A small scene for the Godot bones checks (test/export/godot-bones-extras-e2e, scripts/e2e/export.cjs). Not a template people see.
import { newDoc, newVectorLayer, uid } from '../core/doc';
import { newCameraLayer } from '../core/camera';
import type { BlendMode, Bone, CameraDrawing, Doc, InstanceShape, PlayMode, VectorLayer } from '../core/format';
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
  /** Fade the first arm copy to half, with a big hand overlapping the arm (parts that overlap show through when faded one by one). */
  fade?: boolean;
  /** The hero layer (with the arm copies) follows a swinging bone on the stage. */
  onBone?: boolean;
  /** The hero layer holds a Body symbol (its own bone and a swinging body) with an arm copy on a layer that follows the body bone. */
  bodyArm?: boolean;
  /** With bodyArm: the arm copy inside the Body symbol is washed too, so it has its own wash and the Body's on top. */
  armTint?: { color: string; amount: number };
  /** With bodyArm: the arm copy inside the Body symbol is faded to this much itself (a fade inside a fade). */
  armFade?: number;
  /** The glow layer uses this blend mode (at 0.7 fade, no glow effect) and also covers part of the sun, so it blends over two backdrops. */
  glowBlend?: BlendMode;
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
  hold(hand, vectorDrawing(doc, [pathShape([ellipsePath(o.fade ? 100 : 115, 0, o.fade ? 20 : 9, o.fade ? 20 : 9)], '#ff6f91', null)]).id, 0, 12);
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
  if (o.fade) for (const d of [h0, h1]) (d.shapes[0] as InstanceShape).opacity = 0.5;
  if (o.fxOnHero) hero.effects = [{ id: uid('e'), kind: 'blur', values: { radius: 2 } }];
  if (o.onBone) {
    const body = newVectorLayer('Body bones') as VectorLayer;
    const root: Bone = boneBetween('sb', 'Root', { x: 150, y: 60 }, { x: 190, y: 60 }, null);
    body.rig = { bones: [root] };
    const b0 = vectorDrawing(doc, []);
    b0.pose = { sb: { r: 0 } };
    const b1 = vectorDrawing(doc, []);
    b1.pose = { sb: { r: 25 } };
    body.cels = [
      { id: uid('c'), start: 0, length: 6, drawingId: b0.id, tween: { ease: 'easeInOut' } },
      { id: uid('c'), start: 6, length: 6, drawingId: b1.id },
    ];
    doc.layers.push(body);
    hero.bind = { rig: body.id, bone: 'sb' };
  }
  if (o.bodyArm) {
    // Body symbol: one bone, a torso on it, and a layer on the bone that holds the arm.
    const brig = newVectorLayer('Body bones') as VectorLayer;
    brig.rig = { bones: [boneBetween('bb', 'Spine', { x: 0, y: 0 }, { x: 0, y: -50 }, null)] };
    const q0 = vectorDrawing(doc, []);
    q0.pose = { bb: { r: 0 } };
    const q1 = vectorDrawing(doc, []);
    q1.pose = { bb: { r: 20 } };
    brig.cels = [
      { id: uid('c'), start: 0, length: 6, drawingId: q0.id },
      { id: uid('c'), start: 6, length: 6, drawingId: q1.id },
    ];
    const torso = newVectorLayer('Torso') as VectorLayer;
    torso.bind = { rig: brig.id, bone: 'bb' };
    hold(torso, vectorDrawing(doc, [pathShape([rectPath(-12, -50, 24, 50)], '#9b7bff', null)]).id, 0, 12);
    const holder = newVectorLayer('Arm holder') as VectorLayer;
    holder.bind = { rig: brig.id, bone: 'bb' };
    const hd = vectorDrawing(doc, []);
    hd.shapes = [inst(0, -45, { ...(o.armTint ? { tint: o.armTint } : {}), ...(o.armFade !== undefined ? { opacity: o.armFade } : {}) })];
    hold(holder, hd.id, 0, 12);
    const bodyId = uid('sym');
    doc.symbols![bodyId] = { id: bodyId, name: 'Body', layers: [brig, torso, holder], length: 12, origin: { x: 0, y: 0 } };
    h0.shapes = [inst(120, 220, { symbolId: bodyId })];
    h1.shapes = [inst(130, 220, { symbolId: bodyId, opacity: 0.8, tint: { color: '#ff0000', amount: 0.5 } })];
  }
  doc.layers.push(hero);

  const glow = newVectorLayer('Glow') as VectorLayer;
  glow.blend = o.glowBlend ?? 'add';
  glow.opacity = 0.7;
  if (!o.glowBlend) glow.effects = [{ id: uid('e'), kind: 'glow', values: { color: '#ffd76a', size: 10, strength: 1 } }];
  const glowShapes = [pathShape([ellipsePath(180, 60, 22, 22)], '#ff8a3a', null)];
  if (o.glowBlend) glowShapes.push(pathShape([rectPath(235, 35, 50, 50)], '#6070c0', null));
  hold(glow, vectorDrawing(doc, glowShapes).id, 0, 12);
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

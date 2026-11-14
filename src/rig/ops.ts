/**
 * Everything a person can do to bones, as store actions (one undo step each, drags coalesced). The bones tools, the
 * Rig panel and the commands all call these. Bones live on a bones layer in the open layer list (the stage's, or
 * the open symbol's), and layers attach to its bones.
 */
import type { Draft } from 'immer';
import type { Bone, Cel, Doc, Id, Layer, Pose, Rig, SavedPose, VectorDrawing } from '../core/format';
import { celAt, findLayer, newVectorDrawing, uid } from '../core/doc';
import { store } from '../core/store';
import { currentChoice, type ChoiceDef } from '../core/choices';
import { shapesBounds } from '../canvas/geometry';
import { boneBetween, boneForBox, descendants, gridMesh, mapply, minv, mirrorPose, nearestBone, rigState, skinMesh, swapSides, tidyPose, wrapAngle, type Pt } from './math';
import { isRigLayer, rigPoseAt, type RigLayer } from './pose';

export type NewPoseChoice = 'glide' | 'hold';

export const newPoseChoice: ChoiceDef<NewPoseChoice> = {
  id: 'rig.newPose',
  title: 'Posing on a new frame',
  question: "You're posing bones on a frame that has no pose of its own yet. How should the frames in between move?",
  options: [
    { value: 'glide', label: 'Glide from the last pose', detail: 'The bones move smoothly from the pose before to this one (a tween with easing).' },
    { value: 'hold', label: 'Jump to the new pose', detail: 'The old pose holds until this frame, then the bones snap to the new one (good for snappy, stepped motion).' },
  ],
  default: 'glide',
  category: 'Animating',
  help: 'rig-posing',
};

// ---------------------------------------------------------------- finding the rig

/** The bones layer to work with: the active layer if it is one, the one it's attached to, else the topmost. */
export function currentRig(doc: Doc = store().get().doc, activeId: Id | null = store().get().ui.activeLayerId): RigLayer | undefined {
  const active = findLayer(doc, activeId);
  if (isRigLayer(active)) return active;
  if (active?.bind) {
    const r = doc.layers.find((l) => l.id === active.bind!.rig);
    if (isRigLayer(r)) return r;
  }
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (isRigLayer(l)) return l;
  }
  return undefined;
}

/** The pose showing on a bones layer at the playhead. */
export function currentPose(rig: RigLayer | undefined = currentRig()): Pose {
  if (!rig) return {};
  const { doc, ui } = store().get();
  return rigPoseAt(doc, rig, ui.frame);
}

function draftRig(doc: Draft<Doc>, id: Id): (Draft<Layer> & { rig: Rig }) | undefined {
  const l = doc.layers.find((x) => x.id === id);
  return l && l.kind === 'vector' && l.rig ? (l as Draft<Layer> & { rig: Rig }) : undefined;
}

/** Makes a bones layer on top of the others if there isn't one yet. Returns its id. */
export function ensureRig(): Id {
  const have = currentRig();
  if (have) return have.id;
  const id = uid('l');
  store().update('Add bones layer', (doc) => {
    const d = newVectorDrawing();
    doc.drawings[d.id] = d;
    doc.layers.push({ id, name: 'Bones', kind: 'vector', visible: true, locked: false, opacity: 1, onion: false, rig: { bones: [] }, cels: [{ id: uid('c'), start: 0, length: Math.max(1, doc.length), drawingId: d.id }] });
  });
  return id;
}

// ---------------------------------------------------------------- building the skeleton

function freeBoneName(rig: Rig): string {
  const names = new Set(rig.bones.map((b) => b.name));
  for (let i = rig.bones.length + 1; ; i++) if (!names.has(`Bone ${i}`)) return `Bone ${i}`;
}

/**
 * Adds a bone from `a` to `b` (where they are on screen at the playhead, so bones can be drawn over a posed
 * character). Returns its id.
 */
export function addBone(rigId: Id, a: Pt, b: Pt, parent: Id | null, name?: string): Id | undefined {
  const { doc, ui } = store().get();
  const r = doc.layers.find((l) => l.id === rigId);
  if (!isRigLayer(r)) return undefined;
  // Drawn under a posed parent: put it where it would have to be at rest to land here.
  const ps = parent ? rigState(r.rig, rigPoseAt(doc, r, ui.frame)).get(parent) : undefined;
  const inv = ps ? minv(ps.skin) : undefined;
  const ra = inv ? mapply(inv, a.x, a.y) : a;
  const rb = inv ? mapply(inv, b.x, b.y) : b;
  const id = uid('b');
  store().update('Add bone', (d) => {
    const rig = draftRig(d, rigId)?.rig;
    if (!rig) return;
    rig.bones.push(boneBetween(id, name ?? freeBoneName(rig as Rig), ra, rb, parent));
  });
  return id;
}

/**
 * Moves a bone's joint or tip in its rest position, from where the pointer is on screen. Bones hanging from a moved
 * tip move their joints with it.
 */
export function moveJoint(rigId: Id, boneId: Id, which: 'base' | 'tip', p: Pt): void {
  const { doc, ui } = store().get();
  const r = doc.layers.find((l) => l.id === rigId);
  if (!isRigLayer(r)) return;
  const st = rigState(r.rig, rigPoseAt(doc, r, ui.frame));
  const s = st.get(boneId);
  if (!s) return;
  const bone = s.bone;
  store().update(
    which === 'tip' ? 'Change bone' : 'Move joint',
    (d) => {
      const rig = draftRig(d, rigId)?.rig;
      const b = rig?.bones.find((x) => x.id === boneId);
      if (!rig || !b) return;
      const oldTip = { x: b.x + Math.cos((b.angle * Math.PI) / 180) * b.length, y: b.y + Math.sin((b.angle * Math.PI) / 180) * b.length };
      if (which === 'tip') {
        // In the bone's own posed space: how far along, and how far it turned.
        const local = mapply(minv(s.posed), p.x, p.y);
        b.length = Math.max(2, Math.hypot(local.x, local.y));
        b.angle = wrapAngle(b.angle + (Math.atan2(local.y, local.x) * 180) / Math.PI);
      } else {
        const parent = bone.parent ? st.get(bone.parent) : undefined;
        const pose = rigPoseAt(doc, r, ui.frame)[boneId];
        const restP = parent ? mapply(minv(parent.skin), p.x, p.y) : { x: p.x - (pose?.x ?? 0), y: p.y - (pose?.y ?? 0) };
        // The tip stays where it is.
        const tip = oldTip;
        b.x = restP.x;
        b.y = restP.y;
        b.length = Math.max(2, Math.hypot(tip.x - b.x, tip.y - b.y));
        b.angle = (Math.atan2(tip.y - b.y, tip.x - b.x) * 180) / Math.PI;
      }
      const newTip = { x: b.x + Math.cos((b.angle * Math.PI) / 180) * b.length, y: b.y + Math.sin((b.angle * Math.PI) / 180) * b.length };
      for (const c of rig.bones)
        if (c.parent === boneId && Math.hypot(c.x - oldTip.x, c.y - oldTip.y) < 0.75) {
          const ct = { x: c.x + Math.cos((c.angle * Math.PI) / 180) * c.length, y: c.y + Math.sin((c.angle * Math.PI) / 180) * c.length };
          c.x = newTip.x;
          c.y = newTip.y;
          c.length = Math.max(2, Math.hypot(ct.x - c.x, ct.y - c.y));
          c.angle = (Math.atan2(ct.y - c.y, ct.x - c.x) * 180) / Math.PI;
        }
    },
    { coalesce: `rig-joint-${boneId}-${which}` },
  );
}

/**
 * Deletes a bone. By default its children hang from its parent instead; with `withBranch` the bones hanging from it go
 * too. Layers attached to a removed bone move to the nearest bone left above it.
 */
export function deleteBone(rigId: Id, boneId: Id, withBranch = false): void {
  store().update('Delete bone', (d) => {
    const rig = draftRig(d, rigId)?.rig;
    const b = rig?.bones.find((x) => x.id === boneId);
    if (!rig || !b) return;
    const byId = new Map(rig.bones.map((x) => [x.id, x]));
    const gone = withBranch ? descendants(rig as Rig, boneId) : new Set<Id>([boneId]);
    // The nearest bone above that is staying, or none.
    const above = (id: Id): Id | null => {
      let cur = byId.get(id)?.parent ?? null;
      while (cur && gone.has(cur)) cur = byId.get(cur)?.parent ?? null;
      return cur;
    };
    for (const c of rig.bones) if (!gone.has(c.id) && c.parent && gone.has(c.parent)) c.parent = above(c.parent);
    rig.bones = rig.bones.filter((x) => !gone.has(x.id));
    for (const l of d.layers) {
      if (l.bind?.rig !== rigId) continue;
      if (l.bind.mesh) l.bind.mesh = skinMesh(rig as Rig, l.bind.mesh);
      if (gone.has(l.bind.bone)) {
        const up = above(l.bind.bone);
        if (up) l.bind.bone = up;
        else if (rig.bones[0]) l.bind.bone = rig.bones[0].id;
        else delete l.bind;
      }
    }
    for (const p of rig.poses ?? []) for (const id of gone) delete p.pose[id];
  });
}

/** What removing a bone that has bones hanging from it does (asked the first time, then remembered). */
export type RemoveBoneChoice = 'keep' | 'branch';

export const removeBoneChoice: ChoiceDef<RemoveBoneChoice> = {
  id: 'rig.removeBone',
  title: 'Removing a bone with bones hanging from it',
  question: 'The bone you removed had other bones hanging from it (like a forearm from an upper arm). What should happen to those?',
  options: [
    { value: 'keep', label: 'Keep them', detail: 'They stay, and hang from the bone above instead. Good for taking one joint out of a chain.', did: 'Removed the bone and kept the ones hanging from it.' },
    { value: 'branch', label: 'Remove them too', detail: 'The whole branch goes: the bone and everything hanging from it. Good for taking a whole arm away.', did: 'Removed the bone and everything hanging from it.' },
  ],
  default: 'keep',
  category: 'Animating',
  help: 'rig-bone-tools',
};

/** The bones hanging straight from a bone. */
export function childBones(rig: Rig, id: Id): Bone[] {
  return rig.bones.filter((b) => b.parent === id);
}

export function renameBone(rigId: Id, boneId: Id, name: string): void {
  const n = name.trim();
  if (!n) return;
  store().update('Rename bone', (d) => {
    const b = draftRig(d, rigId)?.rig.bones.find((x) => x.id === boneId);
    if (b) b.name = n;
  });
}

export function setPin(rigId: Id, boneId: Id, pin: boolean): void {
  store().update(pin ? 'Pin bone' : 'Unpin bone', (d) => {
    const b = draftRig(d, rigId)?.rig.bones.find((x) => x.id === boneId);
    if (!b) return;
    if (pin) b.pin = true;
    else delete b.pin;
  });
}

// ---------------------------------------------------------------- poses

/** Whether posing at `frame` would make a new key (so the glide-or-jump question applies). */
export function needsNewPoseKey(rig: RigLayer, frame: number): boolean {
  return !rig.cels.some((c) => c.start === frame);
}

/**
 * Writes a pose on a bones layer at `frame` (on a draft). If no key starts there, one is made: a held key is split,
 * or the key before is stretched to reach it, and the frames between glide or jump (the `rig.newPose` choice).
 */
export function writePose(doc: Draft<Doc>, rigId: Id, frame: number, pose: Pose, glide = currentChoice<NewPoseChoice>('rig.newPose') !== 'hold'): void {
  const l = doc.layers.find((x) => x.id === rigId);
  if (!l || l.kind !== 'vector' || !l.rig) return;
  let cel = l.cels.find((c) => c.start === frame);
  if (!cel) {
    const d = newVectorDrawing();
    doc.drawings[d.id] = d;
    const cover = celAt(l as Layer, frame);
    let made: Cel;
    if (cover) {
      const end = cover.start + cover.length;
      cover.length = frame - cover.start;
      made = { id: uid('c'), start: frame, length: end - frame, drawingId: d.id };
      if (cover.tween) made.tween = { ...cover.tween };
      if (glide) cover.tween ??= { ease: 'easeInOut' };
      else delete cover.tween;
    } else {
      const prev = [...l.cels].reverse().find((c) => c.start < frame);
      const next = l.cels.find((c) => c.start > frame);
      if (prev) {
        prev.length = frame - prev.start;
        if (glide) prev.tween ??= { ease: 'easeInOut' };
        else delete prev.tween;
      }
      made = { id: uid('c'), start: frame, length: next ? next.start - frame : Math.max(1, doc.length - frame), drawingId: d.id };
      if (next && glide) made.tween = { ease: 'easeInOut' };
    }
    l.cels.push(made);
    l.cels.sort((a, b) => a.start - b.start);
    if (frame + made.length > doc.length) doc.length = frame + made.length;
    cel = l.cels.find((c) => c.id === made.id)!;
  }
  const dr = doc.drawings[cel.drawingId] as Draft<VectorDrawing> | undefined;
  if (!dr || dr.kind !== 'vector') return;
  // A drawing shared by two keys gets its own copy first, so the other key keeps its pose.
  const shared = l.cels.some((c) => c !== cel && c.drawingId === cel!.drawingId);
  if (shared) {
    const nd = newVectorDrawing();
    doc.drawings[nd.id] = nd;
    cel.drawingId = nd.id;
    (doc.drawings[nd.id] as VectorDrawing).pose = tidyPose(pose);
    return;
  }
  dr.pose = tidyPose(pose);
}

/** Sets the pose at the playhead (one undo step; pass `coalesce` while dragging). */
export function setPose(rigId: Id, pose: Pose, label = 'Pose bones', coalesce?: string, glide?: boolean): void {
  const frame = store().get().ui.frame;
  store().update(label, (doc) => writePose(doc, rigId, frame, pose, glide), coalesce ? { coalesce } : {});
}

export function resetPose(rigId?: Id): string | undefined {
  const rig = rigId ? (store().get().doc.layers.find((l) => l.id === rigId) as RigLayer | undefined) : currentRig();
  if (!rig) return 'There are no bones here yet. Draw some with the Bone tool (K).';
  setPose(rig.id, {}, 'Reset pose');
  return undefined;
}

export function mirrorCurrentPose(): string | undefined {
  const rig = currentRig();
  if (!rig) return 'There are no bones here yet. Draw some with the Bone tool (K).';
  setPose(rig.id, mirrorPose(rig.rig, currentPose(rig)), 'Mirror pose');
  return undefined;
}

export function swapCurrentSides(): string | undefined {
  const rig = currentRig();
  if (!rig) return 'There are no bones here yet. Draw some with the Bone tool (K).';
  setPose(rig.id, swapSides(rig.rig, currentPose(rig)), 'Swap left and right');
  return undefined;
}

// ---------------------------------------------------------------- the pose library

export function savePose(name?: string): string | undefined {
  const rig = currentRig();
  if (!rig) return 'There are no bones here yet. Draw some with the Bone tool (K).';
  const pose = tidyPose(currentPose(rig));
  store().update('Save pose', (d) => {
    const r = draftRig(d, rig.id)?.rig;
    if (!r) return;
    const list = (r.poses ??= []);
    const names = new Set(list.map((p) => p.name));
    let n = name?.trim() || `Pose ${list.length + 1}`;
    for (let i = 2; names.has(n); i++) n = `${name?.trim() || 'Pose'} ${i}`;
    list.push({ id: uid('o'), name: n, pose: JSON.parse(JSON.stringify(pose)) });
  });
  return undefined;
}

export function applySavedPose(id: Id, mirrored = false): string | undefined {
  const rig = currentRig();
  const saved = rig?.rig.poses?.find((p) => p.id === id);
  if (!rig || !saved) return 'That pose is gone.';
  setPose(rig.id, mirrored ? mirrorPose(rig.rig, saved.pose) : saved.pose, mirrored ? `Apply pose ${saved.name}, mirrored` : `Apply pose ${saved.name}`);
  return undefined;
}

export function renameSavedPose(id: Id, name: string): void {
  const rig = currentRig();
  if (!rig || !name.trim()) return;
  store().update('Rename pose', (d) => {
    const p = draftRig(d, rig.id)?.rig.poses?.find((x) => x.id === id);
    if (p) p.name = name.trim();
  });
}

export function deleteSavedPose(id: Id): void {
  const rig = currentRig();
  if (!rig) return;
  store().update('Delete pose', (d) => {
    const r = draftRig(d, rig.id)?.rig;
    if (r?.poses) r.poses = r.poses.filter((p: SavedPose) => p.id !== id);
  });
}

// ---------------------------------------------------------------- attaching layers

/** What a layer has drawn on it at rest (its first key), as a box, or null when it's empty. */
export function layerArtBox(doc: Doc, layer: Layer, frame: number): { x: number; y: number; w: number; h: number } | null {
  const cel = celAt(layer, frame) ?? layer.cels[0];
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  if (!d) return null;
  if (d.kind === 'vector') return shapesBounds(d.shapes);
  if (d.kind === 'pixel') {
    const ps = layer.kind === 'pixel' ? layer.pixelSize : 1;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < d.height; y++)
      for (let x = 0; x < d.width; x++)
        if (d.pixels[(y * d.width + x) * 4 + 3]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) return null;
    return { x: (x0 + (d.x ?? 0)) * ps, y: (y0 + (d.y ?? 0)) * ps, w: (x1 - x0 + 1) * ps, h: (y1 - y0 + 1) * ps };
  }
  return null;
}

/** Layers that could be attached to the rig's bones (not bones layers, not tilemaps). */
export function attachableLayers(doc: Doc = store().get().doc): Layer[] {
  return doc.layers.filter((l) => !isRigLayer(l) && l.kind !== 'tilemap');
}

/** Attaches a layer to one bone (it moves with it, like a cut-out part), or with `boneId` null, lets it go. */
export function attachLayer(layerId: Id, rigId: Id, boneId: Id | null): void {
  store().update(boneId ? 'Attach to bone' : 'Detach from bones', (d) => {
    const l = d.layers.find((x) => x.id === layerId);
    if (!l) return;
    if (boneId) l.bind = { rig: rigId, bone: boneId };
    else delete l.bind;
  });
}

/**
 * Lets a layer bend with the bones: a mesh over its art, each point weighted to the nearest bones. `covered` says
 * whether a square of the mesh has any art in it (all do when it's missing). Returns why not, if it couldn't.
 */
export function bendLayer(layerId: Id, rigId: Id, covered?: (x: number, y: number, w: number, h: number) => boolean): string | undefined {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, layerId);
  const r = doc.layers.find((l) => l.id === rigId);
  if (!layer || !isRigLayer(r)) return 'Pick a layer and a skeleton first.';
  if (!r.rig.bones.length) return 'Draw some bones first, with the Bone tool (K).';
  const box = layerArtBox(doc, layer, ui.frame);
  if (!box || box.w < 1 || box.h < 1) return 'That layer has nothing drawn on it yet.';
  const pad = 2;
  const grid = gridMesh({ x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 }, 14, covered);
  if (!grid.triangles.length) return 'That layer has nothing drawn on it yet.';
  const mesh = skinMesh(r.rig, grid);
  const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const main = nearestBone(r.rig, centre)!;
  store().update('Bend with bones', (d) => {
    const l = d.layers.find((x) => x.id === layerId);
    if (l) l.bind = { rig: rigId, bone: main.id, mesh };
  });
  return undefined;
}

/**
 * Attaches every layer that isn't attached yet to the bone nearest the middle of its art. Returns how many were
 * attached.
 */
export function autoAttach(rigId?: Id): number {
  const { doc, ui } = store().get();
  const r = rigId ? doc.layers.find((l) => l.id === rigId) : currentRig();
  if (!isRigLayer(r) || !r.rig.bones.length) return 0;
  // Layers much bigger than the skeleton, or off to one side of it (a floor, a sky), are scenery, not parts.
  const st = rigState(r.rig);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of st.values())
    for (const p of [s.base, s.tip]) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  const size = Math.max(x1 - x0, y1 - y0, 20);
  const plan: [Id, Id][] = [];
  for (const l of attachableLayers(doc)) {
    if (l.bind || l.reference) continue;
    const box = layerArtBox(doc, l, ui.frame);
    if (!box) continue;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    if (Math.max(box.w, box.h) > size * 1.5) continue;
    if (cx < x0 - size * 0.3 || cx > x1 + size * 0.3 || cy < y0 - size * 0.3 || cy > y1 + size * 0.3) continue;
    const b = boneForBox(r.rig, box);
    if (b) plan.push([l.id, b.id]);
  }
  if (!plan.length) return 0;
  store().update('Attach parts to bones', (d) => {
    for (const [lid, bid] of plan) {
      const l = d.layers.find((x) => x.id === lid);
      if (l) l.bind = { rig: r.id, bone: bid };
    }
  });
  return plan.length;
}

/** The bone a layer follows, by name, for lists. */
export function boneName(rig: Rig, id: Id | undefined): string {
  return rig.bones.find((b: Bone) => b.id === id)?.name ?? '';
}

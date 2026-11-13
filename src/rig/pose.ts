/**
 * Bones on the document: which pose a bones layer is in at a frame, and how a layer attached to a bone is drawn
 * there. Pure (no DOM, no store). `poseAt` in core/symbols.ts runs every attached layer through `boundDrawing`, so
 * the canvas, onion skin, thumbnails and every export show the same thing.
 */
import type { Cel, Doc, Drawing, Id, Layer, Pose, Rig, VectorDrawing, VectorLayer } from '../core/format';
import { tweenEase } from '../core/ease';
import { siblings } from '../core/sharedLayers';
import type { PosedMesh } from '../core/layerKinds';
import { deformMesh, lerpPose, mapply, minv, mmul, rigState, unposeOnMesh, type Mat, type RigState } from './math';

export type RigLayer = VectorLayer & { rig: Rig };

export function isRigLayer(l: Layer | undefined): l is RigLayer {
  return !!l && l.kind === 'vector' && !!l.rig;
}

// Layer lookup by id across the stage, open symbols and every symbol, cached per document object. Ids repeat across
// artboards (a variation keeps its original's layer ids), so a layer looks for its bones in its own list first.
interface LayerIndex {
  first: Map<Id, Layer>;
  /** For each layer, the ids of the list it sits in. */
  home: Map<Layer, Map<Id, Layer>>;
}
const layerIndex = new WeakMap<Doc, LayerIndex>();

function indexOf(doc: Doc): LayerIndex {
  let ix = layerIndex.get(doc);
  if (!ix) {
    ix = { first: new Map(), home: new Map() };
    const lists: Layer[][] = [doc.layers, ...(doc.editing ?? []).map((f) => f.layers), ...Object.values(doc.symbols ?? {}).map((s) => s.layers)];
    for (const a of doc.artboards ?? []) if (a.content) lists.push(a.content.layers);
    for (const list of lists) {
      const ids = new Map<Id, Layer>();
      for (const l of list) if (!ids.has(l.id)) ids.set(l.id, l);
      for (const l of list) {
        if (!ix.first.has(l.id)) ix.first.set(l.id, l);
        if (!ix.home.has(l)) ix.home.set(l, ids);
      }
    }
    layerIndex.set(doc, ix);
  }
  return ix;
}

/** A layer by id. With `near` (a layer to look beside), only the list that layer is in is searched, when it is in one. */
export function anyLayer(doc: Doc, id: Id, near?: Layer): Layer | undefined {
  const ix = indexOf(doc);
  const own = near && ix.home.get(near);
  if (own) return own.get(id);
  // With shared layers a closed board's layers are the stack holding that board's cels: look beside the layer there.
  const beside = near && siblings.get(near);
  if (beside) return beside.find((l) => l.id === id);
  return ix.first.get(id);
}

/** The key on a bones layer that rules `frame`: the one covering it, else the last one before it, else the first. */
export function poseKeyAt(layer: Layer, frame: number): { cel: Cel; index: number } | undefined {
  const cels = layer.cels;
  if (!cels.length) return undefined;
  let k = -1;
  for (let i = 0; i < cels.length; i++) {
    if (cels[i].start <= frame) k = i;
    else break;
  }
  if (k < 0) k = 0;
  return { cel: cels[k], index: k };
}

const EMPTY: Pose = {};
const lerpCache = new WeakMap<Drawing, WeakMap<Drawing, Map<string, Pose>>>();

function poseOf(d: Drawing | undefined): Pose {
  return (d?.kind === 'vector' && d.pose) || EMPTY;
}

/** The pose of a bones layer at `frame`: its key's pose, eased toward the next key's when the key tweens. */
export function rigPoseAt(doc: Doc, layer: Layer, frame: number): Pose {
  const k = poseKeyAt(layer, frame);
  if (!k) return EMPTY;
  const { cel, index } = k;
  const a = doc.drawings[cel.drawingId];
  const pa = poseOf(a);
  const next = layer.cels[index + 1];
  if (!cel.tween || !next || next.start !== cel.start + cel.length || frame < cel.start || frame >= next.start) return pa;
  const b = doc.drawings[next.drawingId];
  if (!a || !b) return pa;
  const t = tweenEase(cel.tween, (frame - cel.start) / cel.length);
  if (t === 0) return pa;
  let byB = lerpCache.get(a);
  if (!byB) lerpCache.set(a, (byB = new WeakMap()));
  let byT = byB.get(b);
  if (!byT) byB.set(b, (byT = new Map()));
  const key = t.toFixed(5);
  let p = byT.get(key);
  if (!p) {
    p = lerpPose(pa, poseOf(b), t);
    byT.set(key, p);
    if (byT.size > 400) byT.delete(byT.keys().next().value!);
  }
  return p;
}

/** Where every bone of a bones layer is at `frame`. */
export function rigStateAt(doc: Doc, layer: RigLayer, frame: number): RigState {
  return rigState(layer.rig, rigPoseAt(doc, layer, frame));
}

/** The bones layer a layer is attached to, if it still exists and has the bone. */
export function bindRig(doc: Doc, layer: Layer): RigLayer | undefined {
  const b = layer.bind;
  if (!b) return undefined;
  const r = anyLayer(doc, b.rig, layer);
  return isRigLayer(r) && r !== layer ? r : undefined;
}

/** Rest art to where it is at `frame`, for a layer attached rigidly (undefined when it isn't, or bends with a mesh). */
export function bindMatrixAt(doc: Doc, layer: Layer, frame: number): Mat | undefined {
  const r = bindRig(doc, layer);
  if (!r || layer.bind!.mesh) return undefined;
  return rigStateAt(doc, r, frame).get(layer.bind!.bone)?.skin;
}

/** A mesh layer's points where they are at `frame` (undefined when the layer has no mesh). */
export function meshAt(doc: Doc, layer: Layer, frame: number): number[] | undefined {
  const r = bindRig(doc, layer);
  const mesh = layer.bind?.mesh;
  if (!r || !mesh) return undefined;
  return deformedPoints(mesh, rigStateAt(doc, r, frame));
}

const meshCache = new WeakMap<object, WeakMap<RigState, number[]>>();
function deformedPoints(mesh: NonNullable<Layer['bind']>['mesh'] & object, st: RigState): number[] {
  let m = meshCache.get(mesh);
  if (!m) meshCache.set(mesh, (m = new WeakMap()));
  let pts = m.get(st);
  if (!pts) {
    pts = deformMesh(mesh, st);
    m.set(st, pts);
  }
  return pts;
}

const isIdentity = (m: Mat) => Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[4]) < 1e-6 && Math.abs(m[5]) < 1e-6;

// Wrapped drawings, per attachment, drawing, rig state and pixel size, so the same pose gives the same object (the
// canvas's bitmap cache keys on it) and a layer at rest gives back its own drawing untouched. The attachment object
// is part of the key because re-attaching, switching to bending or painting weights changes the picture while the
// drawing and the rig state stay the same (undo hands back the old object, and with it the old picture).
type Bind = NonNullable<Layer['bind']>;
const wrapCache = new WeakMap<Bind, WeakMap<Drawing, WeakMap<RigState, Map<number, Drawing>>>>();


/**
 * What an attached layer shows: its drawing moved by its bone (or bent by its mesh), as a drawing holding one posed
 * group, which every renderer already draws. Layers that aren't attached come back as they are.
 */
export function boundDrawing(doc: Doc, layer: Layer, frame: number, d: Drawing): Drawing {
  const r = bindRig(doc, layer);
  if (!r || d.kind === 'tilemap') return d;
  const bind = layer.bind!;
  const st = rigStateAt(doc, r, frame);
  const pixelSize = layer.kind === 'pixel' ? layer.pixelSize : 1;
  let byDrawing = wrapCache.get(bind);
  if (!byDrawing) wrapCache.set(bind, (byDrawing = new WeakMap()));
  let byState = byDrawing.get(d);
  if (!byState) byDrawing.set(d, (byState = new WeakMap()));
  let bySize = byState.get(st);
  if (!bySize) byState.set(st, (bySize = new Map()));
  const hit = bySize.get(pixelSize);
  if (hit) return hit;
  let out: Drawing = d;
  if (bind.mesh && bind.mesh.points.length) {
    const dst = deformedPoints(bind.mesh, st);
    out = wrap(d, [1, 0, 0, 1, 0, 0], pixelSize, { src: bind.mesh.points, dst, triangles: bind.mesh.triangles });
  } else {
    const m = st.get(bind.bone)?.skin;
    if (m && !isIdentity(m)) out = wrap(d, m, pixelSize);
  }
  bySize.set(pixelSize, out);
  return out;
}

function wrap(d: Drawing, matrix: Mat, pixelSize: number, mesh?: PosedMesh): VectorDrawing {
  const group = {
    id: `${d.id}~bone`,
    type: 'instance' as const,
    symbolId: '',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 },
    opacity: 1,
    play: 'single' as const,
    firstFrame: 0,
    posed: { matrix, layers: [{ drawing: d, opacity: 1, pixelSize, ...(mesh ? { mesh } : {}) }] },
  };
  return { id: `${d.id}~bone`, kind: 'vector', shapes: [group] };
}

/** Rest space to stage space for an attached layer at a frame, composed with `outer` (for overlays and pointers). */
export function layerMatrix(doc: Doc, layer: Layer, frame: number, outer: Mat = [1, 0, 0, 1, 0, 0]): Mat {
  const m = bindMatrixAt(doc, layer, frame);
  return m ? mmul(outer, m) : outer;
}

// ---------------------------------------------------------------- drawing on an attached layer

// Tools that work on the canvas as a whole rather than on the active layer's art.
export const STAGE_TOOLS = new Set(['bone', 'pose', 'weights', 'hand', 'zoom', 'eyedropper']);

/**
 * Where a point on screen (stage space) is on an attached layer's own art at rest, so drawing on a turned arm lands
 * where you see it. Unattached layers and stage tools get the point back as it is.
 */
export function toLayerSpace(doc: Doc, layerId: Id | null, frame: number, tool: string, p: { x: number; y: number }): { x: number; y: number } {
  if (!layerId || STAGE_TOOLS.has(tool)) return p;
  const layer = doc.layers.find((l) => l.id === layerId);
  if (!layer?.bind) return p;
  const r = bindRig(doc, layer);
  if (!r) return p;
  const mesh = layer.bind.mesh;
  if (mesh) {
    const at = unposeOnMesh(mesh, deformedPoints(mesh, rigStateAt(doc, r, frame)), p);
    if (at) return at;
  }
  const m = rigStateAt(doc, r, frame).get(layer.bind.bone)?.skin;
  return m ? mapply(minv(m), p.x, p.y) : p;
}

/** The extra transform a tool's overlay needs on an attached layer (undefined when none). */
export function overlayMatrix(doc: Doc, layerId: Id | null, frame: number, tool: string): Mat | undefined {
  if (!layerId || STAGE_TOOLS.has(tool)) return undefined;
  const layer = doc.layers.find((l) => l.id === layerId);
  if (!layer?.bind || layer.bind.mesh) return undefined;
  const m = bindMatrixAt(doc, layer, frame);
  return m && !isIdentity(m) ? m : undefined;
}

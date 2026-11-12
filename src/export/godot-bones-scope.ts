/**
 * What the Godot bones export is made of, before any text is written: the parts (layers) of a scope, the symbols with
 * skeletons of their own that become nested rigs, how each layer looks (fade, blend mode, effects) and notes about
 * what Godot does natively, what gets baked into the pictures and what can't go. Pure (no canvas): the runner draws
 * the pictures and godot-bones.ts writes the scene.
 *
 * A scope is a list of layers over a range of frames: the stage over the exported range, or a symbol over its own
 * timeline. A symbol that has bones (or holds symbols that do) becomes a nested rig under its instance.
 */
import type { Doc, Drawing, Id, Layer, LayerEffect, SkinMesh, VectorDrawing } from '../core/format';
import { celAt } from '../core/doc';
import { activeEffects, effectInfo, isNoop, valuesAt } from '../effects/model';
import { isInstance, isPosed, nextKey, poseAt, symbolContent, symbolFrame } from '../core/symbols';
import { isRigLayer, type RigLayer } from '../rig/pose';
import type { Mat } from '../rig/math';

export type PartKind = 'cut' | 'mesh' | 'free';

/** The blend modes Godot has natively (a CanvasItemMaterial): normal, Add and Multiply. */
export type NativeBlend = 'mix' | 'add' | 'mul';

/** How a layer looks in Godot: its fade, its blend mode and the effects that get baked into its pictures. */
export interface PartLook {
  /** The layer's fade times its folder's. */
  opacity: number;
  blend: NativeBlend;
  /** The layer's effects then its folder's, to bake into every picture (the compositor skips ones that do nothing). */
  effects: LayerEffect[];
}

export interface BonesPart {
  layer: Layer;
  /** Draw order, back to front (the layer's place in the stack). */
  z: number;
  kind: PartKind;
  rig?: RigLayer;
  bone?: Id;
  mesh?: SkinMesh;
  /** Every different picture the layer shows in the range, at rest (not moved by its bone). */
  pictures: Drawing[];
  /** For each frame of the range: which picture shows, or -1 for nothing. */
  frameOf: number[];
  look?: PartLook;
}

/** A rendered picture: where its top-left sits in output pixels, its size, and its res:// path. */
export interface BonesTexture {
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How a symbol instance sits at one frame of its host. */
export interface InstState {
  /** Symbol space to the host's space (document pixels). */
  matrix: Mat;
  opacity: number;
  tint?: { color: string; amount: number };
  /** The symbol's own frame it shows. */
  frame: number;
  /** In the middle of a tween (so its place changes smoothly), not holding. */
  glide: boolean;
}

/** An instance of a symbol with bones of its own: its own node, skeleton and parts. */
export interface NestedInstance {
  layer: Layer;
  /** The host layer's place in its stack. */
  z: number;
  name: string;
  symbolId: Id;
  /** Per frame of the host's range: how it sits, or null when it isn't there. */
  at: (InstState | null)[];
  scope: BonesScope;
  look: PartLook;
}

export interface BonesScope {
  layers: Layer[];
  range: { start: number; end: number };
  parts: BonesPart[];
  rigs: RigLayer[];
  nested: NestedInstance[];
  /** Per part, per picture. Filled in once the pictures are drawn. */
  textures?: BonesTexture[][];
}

// ---------------------------------------------------------------- notes

/** What happened to the look of the layers, in plain words, for the export dialog and the help topic. */
export class BonesNotes {
  native = new Set<string>();
  baked = new Map<string, Set<string>>();
  skipped = new Map<string, Set<string>>();

  bake(effect: string, layer: string): void {
    const s = this.baked.get(effect) ?? new Set<string>();
    s.add(layer);
    this.baked.set(effect, s);
  }

  skip(what: string, layer: string): void {
    const s = this.skipped.get(what) ?? new Set<string>();
    s.add(layer);
    this.skipped.set(what, s);
  }

  /** Short lines: [what, ...] each with the layer names. */
  lines(): { native: string[]; baked: string[]; skipped: string[] } {
    const list = (m: Map<string, Set<string>>) => [...m].map(([what, layers]) => `${what} on ${[...layers].join(', ')}`);
    return { native: [...this.native], baked: list(this.baked), skipped: list(this.skipped) };
  }
}

// ---------------------------------------------------------------- symbols with bones

/** The deepest nesting of skeletons inside skeletons that stays live; deeper ones are drawn into the pictures. */
export const MAX_NEST = 4;

/** The symbols that have a skeleton, or hold symbols that do. */
export function riggedSymbols(doc: Doc): Set<Id> {
  const out = new Set<Id>();
  const seen = new Map<Id, boolean>();
  const visit = (id: Id): boolean => {
    const known = seen.get(id);
    if (known !== undefined) return known;
    // A symbol inside itself counts as nothing while it's being looked at.
    seen.set(id, false);
    const c = symbolContent(doc, id);
    let yes = false;
    if (c)
      for (const l of c.layers) {
        if (isRigLayer(l) && l.rig.bones.length) yes = true;
        for (const cel of l.cels) {
          const d = doc.drawings[cel.drawingId];
          if (d?.kind === 'vector') for (const s of d.shapes) if (isInstance(s) && visit(s.symbolId)) yes = true;
        }
      }
    seen.set(id, yes);
    if (yes) out.add(id);
    return yes;
  };
  for (const id of Object.keys(doc.symbols ?? {})) visit(id);
  return out;
}

function holdsInstanceOf(doc: Doc, layer: Layer, set: Set<Id>): boolean {
  for (const cel of layer.cels) {
    const d = doc.drawings[cel.drawingId];
    if (d?.kind === 'vector' && d.shapes.some((s) => isInstance(s) && set.has(s.symbolId))) return true;
  }
  return false;
}

/** True when there is anything to export as bones: a skeleton on the stage, or a symbol with one placed on it. */
export function hasBonesToExport(doc: Doc): boolean {
  if (bonesRigs(doc).length) return true;
  const rigged = riggedSymbols(doc);
  return rigged.size > 0 && doc.layers.some((l) => l.visible && !l.reference && holdsInstanceOf(doc, l, rigged));
}

/** The bones layers on the stage that have bones. */
export function bonesRigs(doc: Doc): RigLayer[] {
  return doc.layers.filter((l): l is RigLayer => isRigLayer(l) && l.rig.bones.length > 0);
}

// ---------------------------------------------------------------- a layer's look

/** What a layer shows at a frame without its bone moving it (symbols, morphs and swaps still play). */
export function restPicture(doc: Doc, layer: Layer, frame: number): Drawing | undefined {
  if (!layer.bind) return poseAt(doc, layer, frame);
  const { bind: _b, ...free } = layer;
  return poseAt(doc, free as Layer, frame);
}

/** The Godot blend a Frameling blend becomes, and whether it is exact. */
export function nativeBlend(mode: Layer['blend']): { blend: NativeBlend; exact: boolean } {
  if (!mode || mode === 'normal') return { blend: 'mix', exact: true };
  if (mode === 'add') return { blend: 'add', exact: true };
  if (mode === 'multiply') return { blend: 'mul', exact: true };
  // Godot has no Screen, but Add is the nearest thing (both only lighten).
  if (mode === 'screen') return { blend: 'add', exact: false };
  return { blend: 'mix', exact: false };
}

/** The look of a layer (with its folder's), noting in `notes` what Godot does itself, what gets baked and what can't go. */
export function partLook(doc: Doc, layer: Layer, notes?: BonesNotes): PartLook {
  const folder = layer.folder ? doc.folders?.[layer.folder] : undefined;
  const opacity = layer.opacity * (folder?.opacity ?? 1);
  const mode = layer.blend && layer.blend !== 'normal' ? layer.blend : folder?.blend;
  const nb = nativeBlend(mode);
  const effects = [...(layer.effects ?? []), ...(folder?.effects ?? [])].filter((e) => e.on !== false && (e.keys?.length || !isNoop(e.kind, valuesAt(e, 0))));
  if (notes) {
    if (opacity < 1) notes.native.add('Fade: the node’s modulate');
    if (nb.blend !== 'mix') notes.native.add('Add and Multiply blend modes: a CanvasItemMaterial');
    if (!nb.exact && mode) notes.skip(`${mode === 'screen' ? 'Screen drawn as Add' : `${blendWord(mode)} drawn as normal`}`, layer.name);
    for (const e of effects) notes.bake(effectInfo(e.kind).label, layer.name);
    if (folder?.effects?.length) notes.skip('Folder effects go on each layer separately', layer.name);
    if (layer.mask) notes.skip('Mask layers are left out', layer.name);
    if (layer.clipToBelow) notes.skip('Clip to the layer below is not applied', layer.name);
  }
  return { opacity, blend: nb.blend, effects };
}

const blendWord = (m: string) => m.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

// ---------------------------------------------------------------- parts and nested rigs

// Object identity as a short number, for telling pictures apart.
const tokens = new WeakMap<object, number>();
let nextToken = 1;
const token = (o: object) => {
  let t = tokens.get(o);
  if (!t) tokens.set(o, (t = nextToken++));
  return t;
};

function without(d: Drawing, cut: Set<Id>): { d: Drawing; same: boolean } {
  if (d.kind !== 'vector' || !d.shapes.some((s) => isInstance(s) && cut.has(s.symbolId))) return { d, same: true };
  const flat: VectorDrawing = { ...d, id: `${d.id}~flat`, shapes: d.shapes.filter((s) => !(isInstance(s) && cut.has(s.symbolId))) };
  return { d: flat, same: false };
}

/**
 * The parts of one scope, and its nested rigs. Visible layers that aren't reference, bones or camera layers, with the
 * pictures each shows over the range. Instances of symbols with bones are taken out of their layer's pictures when
 * they can stay live (the layer has no effects and isn't attached to a bone): they become nested rigs instead.
 */
export function bonesScope(
  doc: Doc,
  layers: Layer[],
  range: { start: number; end: number },
  opts: { depth?: number; notes?: BonesNotes; rigged?: Set<Id>; scopes?: Map<Id, BonesScope> } = {},
): BonesScope {
  const depth = opts.depth ?? 0;
  const notes = opts.notes;
  const rigged = opts.rigged ?? riggedSymbols(doc);
  const scopes = opts.scopes ?? new Map<Id, BonesScope>();
  const live = depth < MAX_NEST ? rigged : new Set<Id>();
  const parts: BonesPart[] = [];
  const nested: NestedInstance[] = [];
  const n = range.end - range.start + 1;
  layers.forEach((layer, z) => {
    if (!layer.visible || layer.reference || isRigLayer(layer) || layer.kind === 'camera') return;
    if (layer.folder && doc.folders?.[layer.folder]?.visible === false) return;
    const look = partLook(doc, layer, notes);
    if (layer.mask) return;
    // Symbols with bones stay live only on layers that move on their own and have no effects to bake.
    const holds = live.size > 0 && holdsInstanceOf(doc, layer, live);
    const cut = holds && !layer.bind && !look.effects.length ? live : undefined;
    if (holds && !cut) notes?.skip('Symbols with bones are drawn into the pictures (the layer has effects or is attached to a bone)', layer.name);
    const animatedFx = look.effects.some((e) => e.keys?.length);
    const pictures: Drawing[] = [];
    const frameOf: number[] = [];
    const byKey = new Map<string, number>();
    const tracks = new Map<string, { symbolId: Id; at: (InstState | null)[] }>();
    for (let f = range.start; f <= range.end; f++) {
      const d = restPicture(doc, layer, f);
      if (!d) {
        frameOf.push(-1);
        continue;
      }
      let shown: Drawing = d;
      if (cut) {
        const cel = celAt(layer, f);
        const first = cel ? doc.drawings[cel.drawingId] : undefined;
        const from = first?.kind === 'vector' ? first.shapes.filter(isInstance) : [];
        if (d.kind === 'vector')
          d.shapes.filter(isInstance).forEach((s, i) => {
            if (!cut.has(s.symbolId) || !isPosed(s)) return;
            const c = symbolContent(doc, s.symbolId);
            if (!c) return;
            const key = `${i}|${s.symbolId}`;
            let t = tracks.get(key);
            if (!t) tracks.set(key, (t = { symbolId: s.symbolId, at: new Array<InstState | null>(n).fill(null) }));
            const glide = !!cel?.tween && !!nextKey(layer, cel);
            t.at[f - range.start] = { matrix: [...s.posed.matrix] as Mat, opacity: s.opacity, ...(s.tint && s.tint.amount > 0 ? { tint: s.tint } : {}), frame: symbolFrame(from[i] ?? s, cel ? f - cel.start : 0, c.length), glide };
          });
        shown = without(d, cut).d;
        if (shown.kind === 'vector' && !shown.shapes.length) {
          frameOf.push(-1);
          continue;
        }
      }
      const fx = animatedFx ? JSON.stringify(activeEffects(look.effects, f)) : '';
      const base = shown === d ? `d${token(d)}` : `s${(shown as VectorDrawing).shapes.map((s) => token(s)).join(',')}`;
      const key = `${base}|${fx}`;
      let i = byKey.get(key);
      if (i === undefined) {
        i = pictures.push(shown) - 1;
        byKey.set(key, i);
      }
      frameOf.push(i);
    }
    for (const [key, t] of tracks) {
      let scope = scopes.get(t.symbolId);
      if (!scope) {
        const c = symbolContent(doc, t.symbolId)!;
        scope = bonesScope(doc, c.layers, { start: 0, end: Math.max(1, c.length) - 1 }, { depth: depth + 1, notes, rigged, scopes });
        scopes.set(t.symbolId, scope);
      }
      void key;
      nested.push({ layer, z, name: doc.symbols?.[t.symbolId]?.name ?? 'Symbol', symbolId: t.symbolId, at: t.at, scope, look });
    }
    if (tracks.size) notes?.native.add('Symbols with bones: nested Skeleton2D and Bone2D nodes');
    if (!pictures.length) return;
    const r = layer.bind ? layers.find((l) => l.id === layer.bind!.rig) : undefined;
    const rig = isRigLayer(r) ? r : undefined;
    const hasBone = !!rig && rig.rig.bones.some((b) => b.id === layer.bind!.bone);
    const kind: PartKind = rig && layer.bind!.mesh?.points.length ? 'mesh' : hasBone ? 'cut' : 'free';
    parts.push({ layer, z, kind, ...(rig && kind !== 'free' ? { rig, bone: layer.bind!.bone } : {}), ...(kind === 'mesh' ? { mesh: layer.bind!.mesh } : {}), pictures, frameOf, look });
  });
  return { layers, range, parts, rigs: layers.filter((l): l is RigLayer => isRigLayer(l) && l.rig.bones.length > 0), nested };
}

/** The layers that make the scene (visible, not reference, not bones or camera), with their pictures per frame. */
export function bonesParts(doc: Doc, range: { start: number; end: number }): BonesPart[] {
  return bonesScope(doc, doc.layers, range).parts;
}

/** The whole stage: its parts and its nested rigs, with a note of how each layer's look is carried. */
export function bonesStage(doc: Doc, range: { start: number; end: number }, notes?: BonesNotes): BonesScope {
  return bonesScope(doc, doc.layers, range, { notes });
}

/** Every scope that needs pictures drawn, the stage first, each symbol once. */
export function allScopes(top: BonesScope): BonesScope[] {
  const out: BonesScope[] = [];
  const walk = (s: BonesScope) => {
    if (out.includes(s)) return;
    out.push(s);
    for (const n of s.nested) walk(n.scope);
  };
  walk(top);
  return out;
}

/**
 * What the export dialog says about the look of the layers, without building any pictures: the effects that get baked,
 * what Godot does itself and what can't go. Cheap enough to run on every render of the dialog.
 */
export function bonesNotes(doc: Doc): { native: string[]; baked: string[]; skipped: string[] } {
  const notes = new BonesNotes();
  const rigged = riggedSymbols(doc);
  const seen = new Set<Id>();
  const scan = (layers: Layer[], depth: number) => {
    for (const layer of layers) {
      if (!layer.visible || layer.reference || isRigLayer(layer) || layer.kind === 'camera') continue;
      if (layer.folder && doc.folders?.[layer.folder]?.visible === false) continue;
      const look = partLook(doc, layer, notes);
      if (layer.mask) continue;
      if (depth < MAX_NEST && rigged.size) {
        for (const cel of layer.cels) {
          const d = doc.drawings[cel.drawingId];
          if (d?.kind !== 'vector') continue;
          for (const s of d.shapes)
            if (isInstance(s) && rigged.has(s.symbolId)) {
              if (layer.bind || look.effects.length) notes.skip('Symbols with bones are drawn into the pictures (the layer has effects or is attached to a bone)', layer.name);
              else {
                notes.native.add('Symbols with bones: nested Skeleton2D and Bone2D nodes');
                if (!seen.has(s.symbolId)) {
                  seen.add(s.symbolId);
                  scan(symbolContent(doc, s.symbolId)?.layers ?? [], depth + 1);
                }
              }
            }
        }
      }
    }
  };
  scan(doc.layers, 0);
  if (doc.layers.some((l) => l.kind === 'camera' && l.visible)) notes.native.add('Camera: a Camera2D that moves and zooms like the stage camera');
  if (doc.layers.some((l) => l.depth && l.visible && !l.reference && l.kind !== 'camera')) notes.native.add('Layer depth: a Parallax2D (the camera pans them at different speeds)');
  return notes.lines();
}

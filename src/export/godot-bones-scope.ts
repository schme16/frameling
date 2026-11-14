/**
 * What the Godot bones export is made of, before any text is written: the parts (layers) of a scope, the symbols with
 * skeletons of their own that become nested rigs, how each layer looks (fade, blend mode, effects) and notes about
 * what Godot does natively, what gets baked into the pictures and what can't go. Pure (no canvas): the runner draws
 * the pictures and godot-bones.ts writes the scene.
 *
 * A scope is a list of layers over a range of frames: the stage over the exported range, or a symbol over its own
 * timeline. A symbol that has bones (or holds symbols that do) becomes a nested rig under its instance.
 */
import type { Doc, Drawing, Id, Layer, LayerEffect, LayerFolder, SkinMesh, VectorDrawing } from '../core/format';
import { activeCamera } from '../core/camera';
import { celAt } from '../core/doc';
import { folderChain } from '../core/folders';
import { activeEffects, effectInfo, isNoop, valuesAt } from '../effects/model';
import { isInstance, isPosed, nextKey, poseAt, symbolContent, symbolFrame } from '../core/symbols';
import { buildPlan, type PlanStep } from '../effects/plan';
import { isRigLayer, type RigLayer } from '../rig/pose';
import type { Mat } from '../rig/math';

export type PartKind = 'cut' | 'mesh' | 'free';

/** The blend modes Godot has natively (a CanvasItemMaterial): normal, Add and Multiply. The last three are a small included shader that reads what is behind. */
export type NativeBlend = 'mix' | 'add' | 'mul' | 'dodge' | 'sub' | 'div' | 'screen';

/** True for the blends that are a shader (they read the picture behind), not a CanvasItemMaterial. */
export const isShaderBlend = (b: NativeBlend): boolean => b === 'dodge' || b === 'sub' || b === 'div' || b === 'screen';

/** How a layer looks in Godot: its fade, its blend mode and the effects that get baked into its pictures. */
export interface PartLook {
  /** The layer's fade times its folder's. */
  opacity: number;
  blend: NativeBlend;
  /** The layer's effects then its folder's, to bake into every picture (the compositor skips ones that do nothing). */
  effects: LayerEffect[];
}

/** A layer that cuts a part's pictures: a mask layer above it, or the layer below it when the part is clipped to it. */
export interface PartMask {
  layer: Layer;
  /** 'in' keeps what's inside the drawing, 'out' removes it. */
  op: 'in' | 'out';
  clip?: boolean;
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
  /** Masks and clipping baked into every picture (the part and the masks stay put together). */
  masks?: PartMask[];
}

/**
 * A rendered picture: where its top-left sits, its size, and its res:// path. Positions and sizes are in the picture's
 * own pixels, which are `bake` times the scene's output pixels (1 when left out). A symbol copied large is baked bigger
 * so it stays sharp, and its Sprite2D is scaled back down by 1 / bake.
 */
export interface BonesTexture {
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bake?: number;
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
  /** The bone the host layer follows: the instance sits under it. */
  bind?: { rig: RigLayer; bone: Id };
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

// ---------------------------------------------------------------- baking sharp symbol copies

/** The most a symbol's pictures are baked larger than the export scale, however big its copies get. */
export const MAX_BAKE = 4;
/** The biggest side (and pixel count) of a part canvas the runner draws, so a big stage doesn't run out of memory. */
export const BAKE_MAX_SIDE = 8192;
export const BAKE_MAX_PIXELS = 40_000_000;

/** How much a matrix stretches the most, in any direction. */
export function maxStretch(m: readonly number[]): number {
  const [a, c, b, d] = [m[0], m[1], m[2], m[3]];
  const sum = a * a + b * b + c * c + d * d;
  const det = a * d - b * c;
  const disc = Math.sqrt(Math.max(0, sum * sum - 4 * det * det));
  return Math.sqrt((sum + disc) / 2);
}

/**
 * How much bigger than the export scale each scope's pictures are drawn, so copies scaled up on the stage stay sharp:
 * the largest scale any copy of the symbol is shown at (with the copies it sits in), at least 1, at most MAX_BAKE and
 * the most a canvas for the stage can take. The stage itself is always 1.
 */
export function bakeScales(top: BonesScope, doc: { width: number; height: number }, k: number): Map<BonesScope, number> {
  const use = new Map<BonesScope, number>([[top, 1]]);
  const walk = (sc: BonesScope, mul: number, depth: number) => {
    if (depth > MAX_NEST + 1) return;
    for (const n of sc.nested) {
      let worst = 0;
      for (const st of n.at) if (st) worst = Math.max(worst, maxStretch(st.matrix));
      const m = mul * (worst || 1);
      if ((use.get(n.scope) ?? 0) < m) {
        use.set(n.scope, m);
        walk(n.scope, m, depth + 1);
      }
    }
  };
  walk(top, 1, 0);
  const side = Math.max(doc.width, doc.height);
  const w = (doc.width + side) * k;
  const h = (doc.height + side) * k;
  const room = Math.min(BAKE_MAX_SIDE / Math.max(w, h), Math.sqrt(BAKE_MAX_PIXELS / (w * h)));
  const out = new Map<BonesScope, number>();
  for (const [sc, u] of use) {
    // Quarter steps, and not worth a bigger picture until the copy is clearly larger.
    const q = Math.ceil(u * 4 - 1e-6) / 4;
    out.set(sc, sc === top || u < 1.1 ? 1 : Math.max(1, Math.min(q, MAX_BAKE, room)));
  }
  return out;
}

// ---------------------------------------------------------------- notes

/** What happened to the look of the layers, in plain words, for the export dialog and the help topic. */
export type BonesNoteLines = { native: string[]; baked: string[]; skipped: string[]; fades: string[]; tips: string[]; folded: string[] };

/** Said once when the scene has a faded symbol drawn as a CanvasGroup. */
export const FADE_TIP = "Faded symbols look best with Godot's Forward+ or Mobile renderer. On Compatibility (web exports), they come out a little darker.";

export class BonesNotes {
  native = new Set<string>();
  baked = new Map<string, Set<string>>();
  skipped = new Map<string, Set<string>>();
  /** Faded symbols that fade part by part instead of as one picture: "Symbol on Layer" -> why. */
  fades = new Map<string, string>();
  /** A faded symbol became a CanvasGroup (Godot's Compatibility renderer draws those a little darker). */
  groups = false;
  /** Folder looks that go on each layer instead of the folder's node: "Fade on Clouds" -> why. */
  folded = new Map<string, string>();

  fadeFallback(symbol: string, layer: string, why: string): void {
    this.fades.set(`${symbol} on ${layer}`, why);
  }

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
  lines(): BonesNoteLines {
    const list = (m: Map<string, Set<string>>) => [...m].map(([what, layers]) => `${what} on ${[...layers].join(', ')}`);
    return { native: [...this.native], baked: list(this.baked), skipped: list(this.skipped), fades: [...this.fades].map(([what, why]) => `${what} (${why})`), tips: this.groups ? [FADE_TIP] : [], folded: [...this.folded].map(([what, why]) => `${what} (${why})`) };
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

/** The bone a layer follows when a symbol on it can sit under that bone (not a bent layer, and the bone is there). */
export function nestableBind(layers: Layer[], layer: Layer): { rig: RigLayer; bone: Id } | undefined {
  if (!layer.bind || layer.bind.mesh?.points.length) return undefined;
  const r = layers.find((l) => l.id === layer.bind!.rig);
  return isRigLayer(r) && r.rig.bones.some((b) => b.id === layer.bind!.bone) ? { rig: r, bone: layer.bind.bone } : undefined;
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
  if (mode === 'linear-dodge') return { blend: 'dodge', exact: true };
  if (mode === 'subtract') return { blend: 'sub', exact: true };
  if (mode === 'divide') return { blend: 'div', exact: true };
  // Godot has no Screen setting, so it goes through the same small shader the other read-behind blends use.
  if (mode === 'screen') return { blend: 'screen', exact: true };
  return { blend: 'mix', exact: false };
}

/** True when the layer sits in a folder that is switched off, or in one inside such a folder. */
function inHiddenFolder(doc: Doc, l: Layer): boolean {
  return folderChain(doc.folders, l.folder).some((f) => !f.visible);
}

/** True when the layer follows a bone that is there, so its picture sits under that bone (not under a folder's node). */
export function ridesBone(layers: Layer[], l: Layer): boolean {
  if (!l.bind) return false;
  const r = layers.find((x) => x.id === l.bind!.rig);
  return isRigLayer(r) && r.rig.bones.some((b) => b.id === l.bind!.bone);
}

/**
 * True when a layer is left out because of its folders. On the stage a hidden folder is a hidden node that holds its
 * layers, so only layers that ride a bone are left out (they cannot sit in the node). Inside symbols folders are
 * folded into the layers, and a hidden one hides them.
 */
function leftOutByFolder(doc: Doc, layers: Layer[], l: Layer, stage: boolean): boolean {
  return inHiddenFolder(doc, l) && (!stage || ridesBone(layers, l));
}

/** The look of a layer (with its folders'), noting in `notes` what Godot does itself, what gets baked and what can't go. */
export function partLook(doc: Doc, layer: Layer, notes?: BonesNotes): PartLook {
  // Every folder around the layer, the nearest first: their fades multiply, the nearest blend mode wins, effects stack.
  const around = folderChain(doc.folders, layer.folder).reverse();
  const opacity = layer.opacity * around.reduce((n, f) => n * f.opacity, 1);
  const mode = layer.blend && layer.blend !== 'normal' ? layer.blend : around.find((f) => f.blend && f.blend !== 'normal')?.blend;
  const nb = nativeBlend(mode);
  const effects = [...(layer.effects ?? []), ...around.flatMap((f) => f.effects ?? [])].filter((e) => e.on !== false && (e.keys?.length || !isNoop(e.kind, valuesAt(e, 0))));
  if (notes) {
    if (opacity < 1) notes.native.add('Fade: the node’s modulate');
    if (nb.blend !== 'mix' && !isShaderBlend(nb.blend)) notes.native.add('Add and Multiply blend modes: a CanvasItemMaterial');
    if (isShaderBlend(nb.blend)) notes.native.add('Screen, Glow brighter (plain), Take away and Brighten by dividing blend modes: a small included shader that reads what is behind, so they mix with the stage but not inside a faded group');
    if (!nb.exact && mode) notes.skip(`${blendWord(mode)} drawn as normal`, layer.name);
    for (const e of effects) notes.bake(effectInfo(e.kind).label, layer.name);
    if (around.some((f) => f.effects?.length)) notes.skip('Folder effects go on each layer separately', layer.name);
  }
  return { opacity, blend: nb.blend, effects };
}

const blendWord = (m: string) => m.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

// ---------------------------------------------------------------- fading a symbol as one picture

/** One step in the order a grouped symbol's nodes are written: a skeleton, a bone, or a part. */
export type GroupItem = { rig: Id } | { bone: Id } | { part: BonesPart } | { nested: NestedInstance };

/**
 * Whether a symbol's scope can sit inside a CanvasGroup (so its copy fades as one picture), and the order its nodes
 * must be written in. Godot only groups children on the group's own z, so the parts can't use z_index: the scene tree
 * has to draw them back to front by itself. A bone's parts and child bones can be written in any order, so that works
 * when the parts of each bone (with its child bones') sit together in the layer stack. A symbol with bones of its own
 * counts as one step at its layer's place (under its bone when the layer follows one), and needs the same of what is in it. `top` is the order under the
 * instance; `kids` the order under each bone (and under a skeleton, by rig id). Not for parts or symbols with
 * Add or Multiply (a group blends inside itself, not with the stage).
 */
export function groupLayout(sc: BonesScope): { ok: boolean; top: GroupItem[]; kids: Map<Id, GroupItem[]>; why?: string } {
  const failed = (why: string) => ({ ok: false, top: [] as GroupItem[], kids: new Map<Id, GroupItem[]>(), why });
  const fail = failed('its parts are mixed up in the layer stack, so the scene tree cannot draw them in the right order inside one group');
  for (const n of sc.nested) {
    if (n.look.blend !== 'mix') return failed('a symbol inside it uses a blend mode other than normal, which a group would blend inside itself instead of with the stage');
    const inner = groupLayout(n.scope);
    if (!inner.ok) return failed(`a symbol with bones inside it cannot be grouped (${inner.why})`);
  }
  if (sc.parts.some((p) => (p.look?.blend ?? 'mix') !== 'mix')) return failed('some of its parts use a blend mode other than normal, which a group would blend inside itself instead of with the stage');
  const kids = new Map<Id, GroupItem[]>();
  type Ranged = { item: GroupItem; lo: number; hi: number };
  // Sorts back to front and checks nothing interleaves. Items without parts in them go last.
  const sorted = (list: Ranged[]): Ranged[] | null => {
    const drawn = list.filter((r) => r.lo <= r.hi).sort((a, b) => a.lo - b.lo);
    for (let i = 1; i < drawn.length; i++) if (drawn[i].lo <= drawn[i - 1].hi) return null;
    return [...drawn, ...list.filter((r) => r.lo > r.hi)];
  };
  const taken = new Set<BonesPart | NestedInstance>();
  const rigRanges: Ranged[] = [];
  for (const rig of sc.rigs) {
    const seen = new Set<Id>();
    const children = new Map<Id | null, Id[]>();
    for (const b of rig.rig.bones) {
      const parent = b.parent && seen.has(b.parent) ? b.parent : null;
      seen.add(b.id);
      children.set(parent, [...(children.get(parent) ?? []), b.id]);
    }
    const arrange = (id: Id | null): Ranged | null => {
      const list: Ranged[] = [];
      for (const c of children.get(id) ?? []) {
        const r = arrange(c);
        if (!r) return null;
        list.push(r);
      }
      if (id) {
        for (const p of sc.parts)
          if (p.kind === 'cut' && p.rig?.id === rig.id && p.bone === id) {
            taken.add(p);
            list.push({ item: { part: p }, lo: p.z, hi: p.z });
          }
        for (const n of sc.nested)
          if (n.bind?.rig.id === rig.id && n.bind.bone === id) {
            taken.add(n);
            list.push({ item: { nested: n }, lo: n.z, hi: n.z });
          }
      }
      const out = sorted(list);
      if (!out) return null;
      kids.set(id ?? rig.id, out.map((r) => r.item));
      return { item: id ? { bone: id } : { rig: rig.id }, lo: Math.min(...out.map((r) => r.lo)), hi: Math.max(...out.map((r) => r.hi)) };
    };
    const r = arrange(null);
    if (!r) return fail;
    rigRanges.push(r);
  }
  // Everything else sits beside the skeletons, wholly behind or in front of each.
  const loose: Ranged[] = [
    ...sc.parts.filter((p) => !taken.has(p)).map((p) => ({ item: { part: p } as GroupItem, lo: p.z, hi: p.z })),
    ...sc.nested.filter((n) => !taken.has(n)).map((n) => ({ item: { nested: n } as GroupItem, lo: n.z, hi: n.z })),
  ];
  const top = sorted([...rigRanges, ...loose]);
  return top ? { ok: true, top: top.map((r) => r.item), kids } : fail;
}

/** Why a faded copy can't be a CanvasGroup (undefined when it can), given the blend of its layer and of the copy it sits in. */
export function groupBlocker(sc: BonesScope, blend: NativeBlend, inherit: NativeBlend = 'mix'): string | undefined {
  if (blend !== 'mix' || inherit !== 'mix') return 'its layer uses a blend mode other than normal, which a group would blend inside itself instead of with the stage';
  return groupLayout(sc).why;
}

// ---------------------------------------------------------------- masks and clipping

/** What cuts each layer of a list: the masks above it and the layer it is clipped to, the way the compositor plans them. */
export interface MaskLinks {
  /** Layers drawn at all, with the masks that cut them. */
  cuts: Map<Layer, PartMask[]>;
  /** Layers clipped to a folder (the base is a group of layers). */
  folderClipped: Set<Layer>;
  /** Depth only moves layers apart when there is a camera. */
  camera: boolean;
}

export function maskLinks(doc: Doc, layers: Layer[], stage = false): MaskLinks {
  const cuts = new Map<Layer, PartMask[]>();
  const folderClipped = new Set<Layer>();
  const lookDoc = { ...doc, layers } as Doc;
  const collect = (hidden: boolean, keep: (l: Layer) => boolean) => {
    const plan = buildPlan(lookDoc, (l) => l.visible, hidden, (l) => !l.reference);
    const walk = (steps: PlanStep[], outer: PartMask[]) => {
      steps.forEach((st, i) => {
        if (st.type === 'mask') return;
        const above: PartMask[] = [...steps.slice(i + 1).flatMap((x) => (x.type === 'mask' ? [{ layer: x.layer, op: x.layer.mask === 'hide' ? ('out' as const) : ('in' as const) }] : [])), ...outer];
        if (st.node.type === 'layer') {
          if (keep(st.node.layer)) cuts.set(st.node.layer, above);
          for (const c of st.clips) if (keep(c)) cuts.set(c, [{ layer: st.node.layer, op: 'in', clip: true }, ...above]);
        } else {
          walk(st.node.steps, above);
          for (const c of st.clips) {
            if (!keep(c)) continue;
            cuts.set(c, above);
            folderClipped.add(c);
          }
        }
      });
    };
    walk(plan, []);
  };
  collect(false, () => true);
  // On the stage a hidden folder's layers are still exported (in a hidden node), cut by the masks inside their folder.
  if (stage && layers.some((l) => inHiddenFolder(doc, l))) collect(true, (l) => inHiddenFolder(doc, l));
  return { cuts, folderClipped, camera: !!activeCamera(doc) };
}

/** True when a cutting layer stays put next to the part: neither moves with a bone and both sit at the same depth. */
function staysPut(part: Layer, cut: Layer, camera: boolean): boolean {
  return !part.bind && !cut.bind && (!camera || (part.depth ?? 0) === (cut.depth ?? 0));
}

/** The masks a part can have baked in, and whether some can't be carried. */
export function carriedMasks(links: MaskLinks, layer: Layer): { carried: PartMask[]; lost: PartMask[] } {
  const all = links.cuts.get(layer) ?? [];
  return { carried: all.filter((m) => staysPut(layer, m.layer, links.camera)), lost: all.filter((m) => !staysPut(layer, m.layer, links.camera)) };
}

/** Says in `notes` what happens to the masks and clipping among these layers. */
export function noteMasks(doc: Doc, layers: Layer[], notes: BonesNotes, links = maskLinks(doc, layers), stage = false): void {
  for (const layer of layers) {
    if (!layer.visible || layer.reference || isRigLayer(layer) || layer.kind === 'camera' || layer.mask) continue;
    if (leftOutByFolder(doc, layers, layer, stage)) continue;
    const { carried, lost } = carriedMasks(links, layer);
    for (const m of carried) notes.bake(m.clip ? 'Clip to the layer below' : m.op === 'out' ? 'Hide mask' : 'Show mask', layer.name);
    if (lost.length) notes.skip('Masks and clipping are not applied (the part or the mask moves with a bone, or sits at another depth)', layer.name);
    if (links.folderClipped.has(layer)) notes.skip('Clip to a folder is not applied', layer.name);
  }
}

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
 * they can stay live (the layer has no effects or masks, and isn't bent on a bone): they become nested rigs instead.
 */
export function bonesScope(
  doc: Doc,
  layers: Layer[],
  range: { start: number; end: number },
  opts: { depth?: number; notes?: BonesNotes; rigged?: Set<Id>; scopes?: Map<Id, BonesScope>; bake?: boolean } = {},
): BonesScope {
  const depth = opts.depth ?? 0;
  const notes = opts.notes;
  const rigged = opts.rigged ?? riggedSymbols(doc);
  const scopes = opts.scopes ?? new Map<Id, BonesScope>();
  const live = depth < MAX_NEST ? rigged : new Set<Id>();
  const parts: BonesPart[] = [];
  const nested: NestedInstance[] = [];
  const n = range.end - range.start + 1;
  // On the stage every folder is a node of its own, so a hidden folder's layers are still exported (the node is hidden).
  const stage = depth === 0;
  const links = maskLinks(doc, layers, stage);
  if (notes) noteMasks(doc, layers, notes, links, stage);
  layers.forEach((layer, z) => {
    if (!layer.visible || layer.reference || isRigLayer(layer) || layer.kind === 'camera') return;
    if (leftOutByFolder(doc, layers, layer, stage)) {
      notes?.skip('Left out: in a hidden folder and following a bone, so not inside the folder’s node', layer.name);
      return;
    }
    let look = partLook(doc, layer, notes);
    if (layer.mask) return;
    // A layer whose base is hidden is hidden with it (the compositor's rule).
    if (!links.cuts.has(layer)) return;
    const masks = carriedMasks(links, layer).carried;
    // A clipped layer is drawn into its base's group, so it fades and blends with the base too.
    const clipBase = masks.find((m) => m.clip)?.layer;
    if (clipBase) look = { ...look, opacity: look.opacity * clipBase.opacity, blend: look.blend === 'mix' ? nativeBlend(clipBase.blend).blend : look.blend };
    // Symbols with bones stay live only on layers that move on their own and have no effects or masks to bake.
    const holds = live.size > 0 && holdsInstanceOf(doc, layer, live);
    const bind = layer.bind ? nestableBind(layers, layer) : undefined;
    // Inside a faded group a faded symbol is drawn into this layer's pictures, one per frame: Godot draws a group inside a
    // group grey, and fading its parts one by one shows the overlaps through.
    const drawnIn = !!opts.bake && holds && layerFadesInstances(doc, layer, live, look.opacity);
    const cut = holds && !drawnIn && (!layer.bind || bind) && !look.effects.length && !masks.length ? live : undefined;
    if (drawnIn) notes?.bake(DRAWN_IN, layer.name);
    else if (holds && !cut) notes?.skip('Symbols with bones are drawn into the pictures (the layer has effects or masks, or follows a bone that can not carry it)', layer.name);
    const animatedFx = look.effects.some((e) => e.keys?.length);
    const maskFx = masks.some((m) => m.layer.effects?.some((e) => e.keys?.length));
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
      // A picture is the same only while its masks are too.
      const cutKey = masks.map((m) => `${token(restPicture(doc, m.layer, f) ?? m.layer)}${maskFx ? JSON.stringify(activeEffects(m.layer.effects ?? [], f)) : ''}`).join(',');
      const key = `${base}|${fx}|${cutKey}`;
      let i = byKey.get(key);
      if (i === undefined) {
        i = pictures.push(shown) - 1;
        byKey.set(key, i);
      }
      frameOf.push(i);
    }
    for (const [key, t] of tracks) {
      const inner = (bake: boolean, n = notes) => symbolScope(doc, t.symbolId, { depth: depth + 1, notes: n, rigged, scopes, bake });
      let scope = inner(!!opts.bake);
      // A fading copy that will be a group: if a faded symbol sits inside it, that one is drawn into pictures instead.
      if (!opts.bake && t.at.some((s) => s && look.opacity * s.opacity < 1 - 1e-6) && look.blend === 'mix') scope = fadeScope(scope, () => inner(true, undefined), () => inner(true));
      void key;
      nested.push({ layer, z, name: doc.symbols?.[t.symbolId]?.name ?? 'Symbol', symbolId: t.symbolId, at: t.at, scope, look, ...(bind ? { bind } : {}) });
    }
    if (tracks.size) notes?.native.add('Symbols with bones: nested Skeleton2D and Bone2D nodes');
    if (!pictures.length) return;
    const r = layer.bind ? layers.find((l) => l.id === layer.bind!.rig) : undefined;
    const rig = isRigLayer(r) ? r : undefined;
    const hasBone = !!rig && rig.rig.bones.some((b) => b.id === layer.bind!.bone);
    const kind: PartKind = rig && layer.bind!.mesh?.points.length ? 'mesh' : hasBone ? 'cut' : 'free';
    parts.push({ layer, z, kind, ...(rig && kind !== 'free' ? { rig, bone: layer.bind!.bone } : {}), ...(kind === 'mesh' ? { mesh: layer.bind!.mesh } : {}), pictures, frameOf, look, ...(masks.length ? { masks } : {}) });
  });
  return { layers, range, parts, rigs: layers.filter((l): l is RigLayer => isRigLayer(l) && l.rig.bones.length > 0), nested };
}

const DRAWN_IN = 'A faded symbol inside a faded symbol (drawn as one picture)';

/** True when an instance of one of the symbols on this layer is faded (by the layer or by itself) at any key. */
function layerFadesInstances(doc: Doc, layer: Layer, set: Set<Id>, layerOpacity: number): boolean {
  for (const cel of layer.cels) {
    const d = doc.drawings[cel.drawingId];
    if (d?.kind === 'vector' && d.shapes.some((s) => isInstance(s) && set.has(s.symbolId) && layerOpacity * s.opacity < 1 - 1e-6)) return true;
  }
  return false;
}

/** The scope of a symbol's layers (made once per symbol and mode). `bake`: faded symbols in it are drawn into pictures. */
function symbolScope(doc: Doc, id: Id, o: { depth: number; notes?: BonesNotes; rigged: Set<Id>; scopes: Map<Id, BonesScope>; bake: boolean }): BonesScope {
  const key = `${id}${o.bake ? '~drawn' : ''}${o.notes ? '~noted' : ''}`;
  let sc = o.scopes.get(key);
  if (!sc) {
    const c = symbolContent(doc, id)!;
    sc = bonesScope(doc, c.layers, { start: 0, end: Math.max(1, c.length) - 1 }, o);
    o.scopes.set(key, sc);
  }
  return sc;
}

/** True when a symbol holds a faded symbol copy (at any depth) that stays live, which a group cannot hold. */
function holdsFadedCopy(sc: BonesScope): boolean {
  return sc.nested.some((n) => n.at.some((s) => s && n.look.opacity * s.opacity < 1 - 1e-6) || holdsFadedCopy(n.scope));
}

/**
 * The scope a fading copy (a CanvasGroup) should use: its own when no faded symbol is inside it, else the one that
 * draws the faded symbols into pictures, when that can still sit in a group. `drawn` makes it (without notes, to look
 * at); `noted` makes it again with notes once it is chosen.
 */
export function fadeScope(own: BonesScope, drawn: () => BonesScope, noted: () => BonesScope): BonesScope {
  if (!holdsFadedCopy(own)) return own;
  return groupLayout(drawn()).ok ? noted() : own;
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

const layerHasEffects = (doc: Doc, l: Layer) => {
  return [...(l.effects ?? []), ...folderChain(doc.folders, l.folder).flatMap((f) => f.effects ?? [])].some((e) => e.on !== false && (e.keys?.length || !isNoop(e.kind, valuesAt(e, 0))));
};

/** The symbols a layer shows copies of, and the symbols inside those, each once. */
export function symbolsOnLayer(doc: Doc, layer: Layer): Id[] {
  const out: Id[] = [];
  const seen = new Set<Id>();
  const visit = (l: Layer) => {
    for (const cel of l.cels) {
      const d = doc.drawings[cel.drawingId];
      if (d?.kind !== 'vector') continue;
      for (const s of d.shapes)
        if (isInstance(s) && !seen.has(s.symbolId)) {
          seen.add(s.symbolId);
          out.push(s.symbolId);
          for (const inner of symbolContent(doc, s.symbolId)?.layers ?? []) visit(inner);
        }
    }
  };
  visit(layer);
  return out;
}

/** True when a symbol has effects on its layers (or their folders) and also hidden or reference layers, which every picture of it leaves out. */
export function symbolDropsHiddenLayers(doc: Doc, id: Id): boolean {
  const layers = symbolContent(doc, id)?.layers ?? [];
  const dropped = (l: Layer) => !l.visible || l.reference || inHiddenFolder(doc, l);
  return layers.some((l) => layerHasEffects(doc, l)) && layers.some(dropped);
}

// ---------------------------------------------------------------- folders as nodes

/** True when a part's picture sits under its bone, not under its folder's node. */
export const partRides = (p: BonesPart): boolean => p.kind !== 'free';

/** A folder's fade that can go on its node: not 0 (that hides it) and not 1 (nothing to fade). */
const fadesFolder = (f: LayerFolder) => f.opacity < 1 - 1e-6 && f.opacity > 1e-6;

/**
 * The folders on the stage whose fade goes on their own node (Godot fades each child of a node on its own, so that
 * only looks like Frameling's one-picture fade when nothing in the folder overlaps). A folder qualifies when it holds
 * one free part, or several at one depth whose pictures do not overlap. A symbol with bones, or a part on
 * a bone, among several needs a group: its fade goes on each layer instead.
 */
export function nativeFolderFades(doc: Doc, top: BonesScope, textures: BonesTexture[][], camera: boolean): Set<Id> {
  const out = new Set<Id>();
  const faded = Object.values(doc.folders ?? {}).filter(fadesFolder);
  if (!faded.length) return out;
  interface Item {
    chain: Id[];
    rides: boolean;
    inst: boolean;
    depth: number;
    box: Box | null;
  }
  const depthOf = (l: Layer) => (camera && !l.bind && l.depth ? l.depth : 0);
  const items: Item[] = [
    ...top.parts.map((p, i): Item => {
      let box: Box | null = null;
      for (const t of textures[i] ?? []) {
        const b = t.bake ?? 1;
        const r = { x0: t.x / b, y0: t.y / b, x1: (t.x + t.w) / b, y1: (t.y + t.h) / b };
        box = box ? { x0: Math.min(box.x0, r.x0), y0: Math.min(box.y0, r.y0), x1: Math.max(box.x1, r.x1), y1: Math.max(box.y1, r.y1) } : r;
      }
      return { chain: folderChain(doc.folders, p.layer.folder).map((f) => f.id), rides: partRides(p), inst: false, depth: depthOf(p.layer), box };
    }),
    ...top.nested.map((n): Item => ({ chain: folderChain(doc.folders, n.layer.folder).map((f) => f.id), rides: !!n.bind, inst: true, depth: depthOf(n.layer), box: null })),
  ];
  for (const f of faded) {
    const mine = items.filter((it) => it.chain.includes(f.id));
    if (!mine.length) continue;
    if (mine.some((it) => it.rides || it.inst)) continue;
    if (mine.length > 1) {
      if (mine.some((it) => it.depth !== mine[0].depth || !it.box)) continue;
      // One pixel of room: a soft edge counts as overlapping.
      const hit = (a: Box, b: Box) => a.x0 - 1 < b.x1 && b.x0 - 1 < a.x1 && a.y0 - 1 < b.y1 && b.y0 - 1 < a.y1;
      if (mine.some((a, i) => mine.slice(i + 1).some((b) => hit(a.box!, b.box!)))) continue;
    }
    out.add(f.id);
  }
  return out;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Says in `notes` what the stage's folders become, and which of their looks go on each layer instead of the folder's node. */
function noteFolders(doc: Doc, drawnUnder: Map<Id, number>, ridingUnder: Map<Id, string[]>, notes: BonesNotes): void {
  const used = Object.values(doc.folders ?? {}).filter((f) => drawnUnder.get(f.id));
  if (!used.length) return;
  notes.native.add('Layer folders: a Node2D each, nested the same way, so a whole folder can be hidden or scripted');
  for (const f of used) {
    if (f.opacity < 1 - 1e-6 && (drawnUnder.get(f.id) ?? 0) > 1) notes.folded.set(`Fade on ${f.name}`, 'goes on the folder’s node when its layers do not overlap, else on each layer');
    if (f.blend && f.blend !== 'normal') notes.folded.set(`Blend mode on ${f.name}`, 'on each layer');
    const riding = ridingUnder.get(f.id);
    if (riding?.length) notes.folded.set(`Layers on a bone in ${f.name} (${riding.join(', ')})`, 'they stay under their bone, so hiding or fading the folder does not reach them');
  }
}

/**
 * What the export dialog says about the look of the layers, without building any pictures: the effects that get baked,
 * what Godot does itself and what can't go. Cheap enough to run on every render of the dialog.
 */
export function bonesNotes(doc: Doc): BonesNoteLines {
  const notes = new BonesNotes();
  const rigged = riggedSymbols(doc);
  const seen = new Set<Id>();
  const scopes = new Map<Id, BonesScope>();
  // How many layers each folder holds that get exported (stage only: every folder there is a node of its own).
  const drawnUnder = new Map<Id, number>();
  const ridingUnder = new Map<Id, string[]>();
  // `under`: this symbol sits inside a faded one that is a CanvasGroup, and Godot cannot nest a group in a group: its
  // faded symbols are drawn into pictures ('drawn'), or fade part by part when that cannot be ('plain').
  const scan = (layers: Layer[], depth: number, inherit: NativeBlend = 'mix', under: false | 'plain' | 'drawn' = false) => {
    const stage = depth === 0;
    const links = maskLinks(doc, layers, stage);
    noteMasks(doc, layers, notes, links, stage);
    for (const layer of layers) {
      if (!layer.visible || layer.reference || isRigLayer(layer) || layer.kind === 'camera') continue;
      if (leftOutByFolder(doc, layers, layer, stage)) {
        notes.skip('Left out: in a hidden folder and following a bone, so not inside the folder’s node', layer.name);
        continue;
      }
      const look = partLook(doc, layer, notes);
      if (stage && !layer.mask && links.cuts.has(layer))
        for (const f of folderChain(doc.folders, layer.folder)) {
          drawnUnder.set(f.id, (drawnUnder.get(f.id) ?? 0) + 1);
          if (ridesBone(layers, layer)) ridingUnder.set(f.id, [...(ridingUnder.get(f.id) ?? []), layer.name]);
        }
      if (symbolsOnLayer(doc, layer).some((id) => symbolDropsHiddenLayers(doc, id))) notes.skip('Hidden or reference layers inside symbols with effects are left out of the pictures', layer.name);
      if (layer.mask || !links.cuts.has(layer)) continue;
      if (under === 'drawn' && depth < MAX_NEST && rigged.size && holdsInstanceOf(doc, layer, rigged) && layerFadesInstances(doc, layer, rigged, look.opacity)) {
        notes.bake(DRAWN_IN, layer.name);
        continue;
      }
      if (depth < MAX_NEST && rigged.size) {
        for (const cel of layer.cels) {
          const d = doc.drawings[cel.drawingId];
          if (d?.kind !== 'vector') continue;
          for (const s of d.shapes)
            if (isInstance(s) && rigged.has(s.symbolId)) {
              if ((layer.bind && !nestableBind(layers, layer)) || look.effects.length || carriedMasks(links, layer).carried.length) notes.skip('Symbols with bones are drawn into the pictures (the layer has effects or masks, or follows a bone that can not carry it)', layer.name);
              else {
                notes.native.add('Symbols with bones: nested Skeleton2D and Bone2D nodes');
                let group = false;
                let drawn = false;
                if (look.opacity * s.opacity < 1 - 1e-6) {
                  const c = symbolContent(doc, s.symbolId);
                  if (c) {
                    const o = { depth: depth + 1, rigged, scopes, bake: false };
                    let sc = symbolScope(doc, s.symbolId, o);
                    if (!under) {
                      const chosen = fadeScope(sc, () => symbolScope(doc, s.symbolId, { ...o, bake: true }), () => symbolScope(doc, s.symbolId, { ...o, bake: true }));
                      drawn = chosen !== sc;
                      sc = chosen;
                    }
                    const why = under ? 'Godot cannot put one fading group inside another, so it fades part by part inside the faded symbol around it' : groupBlocker(sc, look.blend, inherit);
                    if (why) notes.fadeFallback(doc.symbols?.[s.symbolId]?.name ?? 'Symbol', layer.name, why);
                    else {
                      group = true;
                      notes.groups = true;
                    }
                  }
                }
                const inside = under || (group ? (drawn ? 'drawn' : 'plain') : false);
                const key = inside ? `${s.symbolId}:${inside}` : s.symbolId;
                if (!seen.has(key)) {
                  seen.add(key);
                  scan(symbolContent(doc, s.symbolId)?.layers ?? [], depth + 1, look.blend, inside);
                }
              }
            }
        }
      }
    }
  };
  scan(doc.layers, 0);
  noteFolders(doc, drawnUnder, ridingUnder, notes);
  if (doc.layers.some((l) => l.kind === 'camera' && l.visible)) {
    notes.native.add('Camera: a Camera2D that moves and zooms like the stage camera');
    notes.native.add('Window size: attach the included fit-window script so the camera and depth layers line up at any window size');
  }
  if (doc.layers.some((l) => l.depth && l.visible && !l.reference && l.kind !== 'camera')) notes.native.add('Layer depth: a Parallax2D (the camera pans them at different speeds)');
  return notes.lines();
}

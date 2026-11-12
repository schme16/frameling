/**
 * Godot "Bones (editable in Godot)" export: the skeleton as Skeleton2D and Bone2D nodes, every part as a Sprite2D
 * riding its bone (or a skinned Polygon2D for layers that bend), and an AnimationPlayer with one animation per clip
 * holding each bone's position, rotation and squash. Symbols with skeletons of their own become nested rigs under
 * their instance, the camera becomes a Camera2D and layers with depth go under a Parallax2D. Fade, Add and Multiply
 * and a symbol's colour wash are Godot's own; other effects were baked into the pictures by the runner.
 * Pure: the runner renders the part pictures and hands them in.
 *
 * Spaces: Godot gets output pixels (document pixels times the export scale). Bone rest matrices are turns and moves
 * only, so scaling just scales their moves.
 */
import type { Cel, Doc, Easing, Id, Layer } from '../core/format';
import { activeCamera, cameraViewAt, parallaxFactor, plainView, clampZoom } from '../core/camera';
import { celAt } from '../core/doc';
import { nextKey } from '../core/symbols';
import { poseKeyAt, rigPoseAt, type RigLayer } from '../rig/pose';
import { minv, mmul, restMatrix, stretchOf, type Mat } from '../rig/math';
import type { Animation } from './sheet';
import { bonesRigs, type BonesPart, type BonesScope, type BonesTexture, type NativeBlend, type NestedInstance } from './godot-bones-scope';

export { bonesParts, bonesRigs, bonesScope, bonesStage, bonesNotes, allScopes, hasBonesToExport, restPicture, riggedSymbols, partLook, nativeBlend, BonesNotes } from './godot-bones-scope';
export type { BonesPart, BonesScope, BonesTexture, InstState, NativeBlend, NestedInstance, PartKind, PartLook } from './godot-bones-scope';

// ---------------------------------------------------------------- writing Godot text

const gdString = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';

/** A number as Godot writes it: short, no exponent, -0 as 0. */
export function gdNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1e6) / 1e6;
  if (Object.is(r, -0) || r === 0) return '0';
  return String(r);
}

/** A number Godot reads as a float (an animation track of floats must not start with a whole number, or it stops blending). */
export function gdFloat(n: number): string {
  const s = gdNum(n);
  return /[.e]/.test(s) ? s : `${s}.0`;
}

const v2 = (x: number, y: number) => `Vector2(${gdNum(x)}, ${gdNum(y)})`;
const xf = (m: readonly number[]) => `Transform2D(${m.map(gdNum).join(', ')})`;

/** A node name Godot accepts, unique among its siblings. */
function nodeNamer(): (parent: string, want: string) => string {
  const used = new Map<string, Set<string>>();
  return (parent, want) => {
    const base = want.replace(/[.:@/"%]/g, '_').trim() || 'Node';
    let set = used.get(parent);
    if (!set) used.set(parent, (set = new Set()));
    let n = base;
    for (let i = 2; set.has(n.toLowerCase()); i++) n = `${base} ${i}`;
    set.add(n.toLowerCase());
    return n;
  };
}

/** Godot's own easing curve that matches a Frameling easing exactly, or undefined when there isn't one. */
export function exactTransition(e: Easing | undefined): number | undefined {
  switch (e ?? 'linear') {
    case 'linear':
      return 1;
    case 'easeIn':
      return 3;
    case 'easeOut':
      return 1 / 3;
    case 'easeInOut':
      return -3;
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------- keys

/** One key for a bones layer's tracks: at time `t` it shows document frame `f`, easing to the next with `trans`. */
export interface RigKey {
  t: number;
  f: number;
  trans: number;
}

const HOLD = 1 / 4096;

/**
 * Where keys go for one animation of a bones layer. Glides with a Godot easing that matches exactly become two keys
 * with that easing. Other glides get a key per frame (the in-betweens baked). Held poses get a key just before the
 * next frame, so they snap the way Frameling's do.
 */
export function rigKeys(rig: Layer, frames: number[], fps: number): RigKey[] {
  const keys: RigKey[] = [];
  const n = frames.length;
  let i = 0;
  while (i < n) {
    const f = frames[i];
    const t = i / fps;
    const k = poseKeyAt(rig, f);
    const cel: Cel | undefined = k?.cel;
    const next = k ? rig.cels[k.index + 1] : undefined;
    const gliding = !!cel?.tween && !!next && next.start === cel.start + cel.length && f >= cel.start && f < next.start;
    if (gliding) {
      const c = exactTransition(cel!.tween!.ease);
      const end = i + (next!.start - f);
      // The whole glide is inside this animation, from its first frame: two keys and Godot's curve.
      if (c !== undefined && f === cel!.start && end <= n - 1 && frames[end] === next!.start) {
        keys.push({ t, f, trans: c });
        i = end;
        continue;
      }
      keys.push({ t, f, trans: 1 });
      i++;
      continue;
    }
    keys.push({ t, f, trans: 1 });
    keys.push({ t: (i + 1) / fps - HOLD / fps, f, trans: 1 });
    i++;
  }
  return keys;
}

/** Drops keys a straight line between their neighbours already gives. */
export function reduceKeys<T extends { t: number; trans: number; v: number[] }>(keys: T[], eps = 1e-5): T[] {
  if (keys.length <= 2) {
    if (keys.length === 2 && same(keys[0].v, keys[1].v, eps) && keys[0].trans === 1) return [keys[0]];
    return keys;
  }
  const out: T[] = [keys[0]];
  for (let j = 1; j < keys.length - 1; j++) {
    const a = out[out.length - 1];
    const b = keys[j];
    const c = keys[j + 1];
    if (a.trans !== 1 || b.trans !== 1) {
      out.push(b);
      continue;
    }
    const u = (b.t - a.t) / (c.t - a.t || 1);
    const line = a.v.map((x, k) => x + (c.v[k] - x) * u);
    if (!same(line, b.v, eps)) out.push(b);
  }
  const last = keys[keys.length - 1];
  const prev = out[out.length - 1];
  if (!(out.length === 1 && prev.trans === 1 && same(prev.v, last.v, eps))) out.push(last);
  return out;
}

function same(a: number[], b: number[], eps: number): boolean {
  for (let k = 0; k < a.length; k++) if (Math.abs(a[k] - b[k]) > eps) return false;
  return true;
}

// ---------------------------------------------------------------- shaders

/** The file a symbol's colour wash needs for a blend (mixing colours is the one thing Godot's modulate can't do). */
export const tintShaderName = (b: NativeBlend) => `frameling-tint-${b}.gdshader`;

/** A tiny canvas shader: each colour mixes toward `tint_color` by `tint_amount`, like Frameling's colour wash. */
export function tintShader(blend: NativeBlend): string {
  const mode = { mix: 'blend_mix', add: 'blend_add', mul: 'blend_mul' }[blend];
  return `// Made by Frameling. A colour wash over a symbol: every colour mixes toward tint_color by tint_amount (0 to 1).
shader_type canvas_item;
render_mode ${mode};

uniform vec4 tint_color = vec4(1.0);
uniform float tint_amount = 0.0;

void fragment() {
	// COLOR already holds the picture times the node's modulate.
	COLOR.rgb = mix(COLOR.rgb, tint_color.rgb, tint_amount);
}
`;
}

function gdColor(hex: string, a = 1): string {
  const h = hex.replace('#', '');
  const ch = (i: number) => (parseInt(h.slice(i, i + 2), 16) || 0) / 255;
  const alpha = h.length >= 8 ? ch(6) * a : a;
  return `Color(${gdNum(ch(0))}, ${gdNum(ch(2))}, ${gdNum(ch(4))}, ${gdNum(alpha)})`;
}

// ---------------------------------------------------------------- sampled keys

/**
 * Keys for a value that is sampled every frame: gliding frames get a key each (Godot joins them), held frames get a
 * key just before the next frame so they snap the way Frameling's do.
 */
function sampledKeys(n: number, fps: number, glide: (i: number) => boolean, value: (i: number) => number[] | null): { t: number; trans: number; v: number[] }[] {
  const out: { t: number; trans: number; v: number[] }[] = [];
  for (let i = 0; i < n; i++) {
    const v = value(i);
    if (!v) continue;
    out.push({ t: i / fps, trans: 1, v });
    if (!glide(i)) out.push({ t: (i + 1) / fps - HOLD / fps, trans: 1, v });
  }
  return out;
}

/** Where the camera's keys go for one animation: a key per gliding frame, a snap for held ones. */
export function cameraKeys(doc: Doc, frames: number[], fps: number): { t: number; f: number; glide: boolean }[] {
  const cam = activeCamera(doc);
  return frames.map((f, i) => {
    const cel = cam ? celAt(cam, f) : undefined;
    return { t: i / fps, f, glide: !!cam && !!cel?.tween && !!nextKey(cam, cel) };
  });
}

// ---------------------------------------------------------------- the scene

export interface BonesSceneInput {
  doc: Doc;
  range: { start: number; end: number };
  parts: BonesPart[];
  /** Per part, per picture. */
  textures: BonesTexture[][];
  scale: number;
  animations: Animation[];
  rootName: string;
  pixelArt?: boolean;
  /** Instances of symbols with skeletons of their own. Their scopes hold their own pictures. */
  nested?: NestedInstance[];
  /** The Godot folder the included shader files go in (res://...). */
  shaderDir?: string;
}

/** A bone's place under its parent at rest (output pixels). */
function localRest(rig: RigLayer, id: Id, k: number): Mat {
  const b = rig.rig.bones.find((x) => x.id === id)!;
  const rest = restMatrix(b);
  const p = b.parent ? rig.rig.bones.find((x) => x.id === b.parent) : undefined;
  const m = p ? mmul(minv(restMatrix(p)), rest) : rest;
  return [m[0], m[1], m[2], m[3], m[4] * k, m[5] * k];
}

const angle = (m: readonly number[]) => Math.atan2(m[1], m[0]);

/** How many z steps a scope needs for each of its layers, so a symbol's own layers stay between its neighbours'. */
function zUnit(sc: BonesScope): number {
  let u = 1;
  for (const n of sc.nested) u = Math.max(u, n.scope.layers.length * zUnit(n.scope));
  return u;
}

interface Tint {
  inst: NestedInstance;
  mats: Map<NativeBlend, { id: string; path: string }>;
}

interface ScopeNodes {
  sc: BonesScope;
  rigs: { rig: RigLayer; bonePath: Map<Id, string> }[];
  partPath: string[];
  nested: { inst: NestedInstance; path: string; nodes: ScopeNodes; tint?: Tint }[];
}

/** One animation frame by frame: the frame of the scope it shows, and whether the scope is there at all. */
interface Frames {
  f: number[];
  on: boolean[];
}

function build(o: BonesSceneInput): { text: string; shaders: Set<NativeBlend> } {
  const { doc, animations } = o;
  const k = o.scale;
  const name = nodeNamer();
  const ext: string[] = [];
  const sub: string[] = [];
  const nodes: string[] = [];
  const texId = new Map<string, string>();
  const shaders = new Set<NativeBlend>();
  const shaderDir = o.shaderDir ?? 'res://';
  const tex = (path: string) => {
    let id = texId.get(path);
    if (!id) {
      id = `${texId.size + 1}_tex`;
      texId.set(path, id);
      ext.push(`[ext_resource type="Texture2D" path=${gdString(path)} id="${id}"]`);
    }
    return `ExtResource("${id}")`;
  };
  const blendMats = new Map<NativeBlend, string>();
  const blendMaterial = (b: NativeBlend): string[] => {
    if (b === 'mix') return [];
    let id = blendMats.get(b);
    if (!id) {
      id = `Blend_${b}`;
      blendMats.set(b, id);
      sub.push(`[sub_resource type="CanvasItemMaterial" id="${id}"]`, `blend_mode = ${b === 'add' ? 1 : 3}`, '');
    }
    return [`material = SubResource("${id}")`];
  };
  const tints: Tint[] = [];
  const shaderRes = (b: NativeBlend) => {
    shaders.add(b);
    const id = `shader_${b}`;
    if (!ext.some((e) => e.endsWith(`id="${id}"]`))) ext.push(`[ext_resource type="Shader" path=${gdString(`${shaderDir}${shaderDir.endsWith('/') ? '' : '/'}${tintShaderName(b)}`)} id="${id}"]`);
    return `ExtResource("${id}")`;
  };

  const root = o.rootName.replace(/[.:@/"%]/g, '_').trim() || 'Character';
  nodes.push(`[node name=${gdString(root)} type="Node2D"]`);
  if (o.pixelArt) nodes.push('texture_filter = 1');
  nodes.push('');

  const camera = activeCamera(doc);
  // Godot's Parallax2D follows the camera's pan at a different speed but zooms like everything else, where Frameling's
  // far layers zoom less. So when the camera zooms, each depth group gets a child node that takes up the difference.
  let zooms = false;
  if (camera) for (let f = o.range.start; f <= o.range.end; f++) if (Math.abs(clampZoom((cameraViewAt(doc, f) ?? plainView(doc)).zoom) - 1) > 1e-6) zooms = true;
  // Layers with depth sit under a Parallax2D (only a camera moves them).
  const depthNodes = new Map<number, string>();
  const depthGroups: { factor: number; path: string }[] = [];
  const topParent = (layer: Layer): string => {
    const d = layer.depth;
    if (!camera || !d || layer.bind) return '';
    let n = depthNodes.get(d);
    if (!n) {
      n = name('.', `Depth ${gdNum(d)}`);
      const f = parallaxFactor(d);
      nodes.push(`[node name=${gdString(n)} type="Parallax2D" parent="."]`, `scroll_scale = ${v2(f, f)}`, '');
      if (zooms && Math.abs(f - 1) > 1e-6) {
        const inner = name(n, 'Zoom');
        nodes.push(`[node name=${gdString(inner)} type="Node2D" parent=${gdString(n)}]`, '');
        depthGroups.push({ factor: f, path: `${n}/${inner}` });
        n = `${n}/${inner}`;
      }
      depthNodes.set(d, n);
    }
    return n;
  };

  const top: BonesScope = { layers: doc.layers, range: o.range, parts: o.parts, rigs: bonesRigs(doc), nested: o.nested ?? [], textures: o.textures };

  const emit = (sc: BonesScope, parentPath: string, unit: number, inherit: { blend: NativeBlend; tint?: Tint } | undefined, parentOf: (l: Layer) => string): ScopeNodes => {
    const textures = sc.textures ?? sc.parts.map((p) => p.pictures.map(() => ({ path: 'res://missing.png', x: 0, y: 0, w: 1, h: 1 })));
    const at = (p: string) => p || '.';
    const under = (p: string, n: string) => (p ? `${p}/${n}` : n);
    const res: ScopeNodes = { sc, rigs: [], partPath: [], nested: [] };
    const bonePath = new Map<Id, string>();
    const skelPath = new Map<Id, string>();
    for (const rig of sc.rigs) {
      const sk = name(at(parentPath), rig.name);
      const skp = under(parentPath, sk);
      skelPath.set(rig.id, skp);
      nodes.push(`[node name=${gdString(sk)} type="Skeleton2D" parent=${gdString(at(parentPath))}]`, '');
      for (const b of rig.rig.bones) {
        const parent = b.parent && bonePath.has(b.parent) ? bonePath.get(b.parent)! : skp;
        const n = name(parent, b.name);
        bonePath.set(b.id, `${parent}/${n}`);
        const m = localRest(rig, b.id, k);
        nodes.push(
          `[node name=${gdString(n)} type="Bone2D" parent=${gdString(parent)}]`,
          `position = ${v2(m[4], m[5])}`,
          `rotation = ${gdNum(angle(m))}`,
          `rest = ${xf(m)}`,
          'auto_calculate_length_and_angle = false',
          `length = ${gdNum(b.length * k)}`,
          'bone_angle = 0.0',
          '',
        );
      }
      res.rigs.push({ rig, bonePath });
    }

    // The material a part's node gets: Godot's own blend, or the included shader when a symbol is tinted.
    const materialFor = (blend: NativeBlend, nodePath: string): string[] => {
      const b = blend !== 'mix' ? blend : (inherit?.blend ?? 'mix');
      const tint = inherit?.tint;
      if (!tint) return blendMaterial(b);
      let m = tint.mats.get(b);
      if (!m) {
        const id = `Tint_${tints.indexOf(tint) + 1}_${b}`;
        m = { id, path: nodePath };
        tint.mats.set(b, m);
        const at0 = tint.inst.at.find((s) => !!s);
        const color = tint.inst.at.find((s) => s?.tint)?.tint?.color ?? '#ffffff';
        sub.push(`[sub_resource type="ShaderMaterial" id="${id}"]`, `shader = ${shaderRes(b)}`, `shader_parameter/tint_color = ${gdColor(color)}`, `shader_parameter/tint_amount = ${gdNum(at0?.tint?.amount ?? 0)}`, '');
      }
      return [`material = SubResource("${m.id}")`];
    };

    // Parts, back to front by z_index (they sit at different depths under the bones, so tree order can't do it).
    sc.parts.forEach((p, i) => {
      const texs = textures[i];
      const first = p.frameOf.find((x) => x >= 0) ?? 0;
      const t0 = texs[first];
      const z = Math.max(-4096, Math.min(4096, p.z * unit));
      const op = p.look?.opacity ?? p.layer.opacity;
      const fade = op < 1 ? [`modulate = Color(1, 1, 1, ${gdNum(op)})`] : [];
      const hidden = p.frameOf[0] < 0 ? ['visible = false'] : [];
      const blend = p.look?.blend ?? 'mix';
      if (p.kind === 'mesh' && p.rig && p.mesh && skelPath.has(p.rig.id)) {
        const sk = skelPath.get(p.rig.id)!;
        const n = name(at(parentPath), p.layer.name);
        const path = under(parentPath, n);
        res.partPath.push(path);
        const mesh = p.mesh;
        const pts: string[] = [];
        const uv: string[] = [];
        for (let j = 0; j < mesh.points.length; j += 2) {
          pts.push(gdNum(mesh.points[j] * k), gdNum(mesh.points[j + 1] * k));
          uv.push(gdNum(mesh.points[j] * k - t0.x), gdNum(mesh.points[j + 1] * k - t0.y));
        }
        const tris: string[] = [];
        for (let j = 0; j < mesh.triangles.length; j += 3) tris.push(`PackedInt32Array(${mesh.triangles[j]}, ${mesh.triangles[j + 1]}, ${mesh.triangles[j + 2]})`);
        const bones: string[] = [];
        const count = mesh.points.length / 2;
        // Weights per bone per point, each point's weights adding up to 1 (Godot doesn't fill the rest with "stay put").
        const sums = new Array<number>(count).fill(0);
        mesh.weights.forEach((w, v) => {
          for (let q = 0; q < w.length; q += 2) if (bonePath.has(mesh.bones[w[q]]) && w[q + 1] > 0) sums[v] += w[q + 1];
        });
        mesh.bones.forEach((bid, bi) => {
          const bp = bonePath.get(bid);
          if (!bp) return;
          const ws = new Array<number>(count).fill(0);
          let any = false;
          mesh.weights.forEach((w, v) => {
            for (let q = 0; q < w.length; q += 2)
              if (w[q] === bi && w[q + 1] > 0 && sums[v] > 0) {
                ws[v] += w[q + 1] / sums[v];
                any = true;
              }
          });
          if (any) bones.push(`NodePath(${gdString(bp.slice(sk.length + 1))})`, `PackedFloat32Array(${ws.map(gdNum).join(', ')})`);
        });
        nodes.push(
          `[node name=${gdString(n)} type="Polygon2D" parent=${gdString(at(parentPath))}]`,
          `z_index = ${z}`,
          ...hidden,
          ...fade,
          ...materialFor(blend, path),
          `texture = ${tex(t0.path)}`,
          `skeleton = NodePath(${gdString('../' + sk.slice(sk.lastIndexOf('/') + 1))})`,
          `polygon = PackedVector2Array(${pts.join(', ')})`,
          `uv = PackedVector2Array(${uv.join(', ')})`,
          `polygons = [${tris.join(', ')}]`,
          `bones = [${bones.join(', ')}]`,
          '',
        );
        return;
      }
      if (p.kind === 'cut' && p.rig && p.bone && bonePath.has(p.bone)) {
        const parent = bonePath.get(p.bone)!;
        const n = name(parent, p.layer.name);
        res.partPath.push(`${parent}/${n}`);
        // Under the bone: undo its rest place, then sit where the picture was drawn.
        const b = p.rig.rig.bones.find((x) => x.id === p.bone)!;
        const r = restMatrix(b);
        const m = mmul(minv([r[0], r[1], r[2], r[3], r[4] * k, r[5] * k]), [1, 0, 0, 1, t0.x, t0.y]);
        nodes.push(
          `[node name=${gdString(n)} type="Sprite2D" parent=${gdString(parent)}]`,
          `z_index = ${z}`,
          ...hidden,
          ...fade,
          ...materialFor(blend, `${parent}/${n}`),
          `position = ${v2(m[4], m[5])}`,
          `rotation = ${gdNum(angle(m))}`,
          `texture = ${tex(t0.path)}`,
          'centered = false',
          '',
        );
        return;
      }
      const host = parentOf(p.layer);
      const n = name(at(host), p.layer.name);
      res.partPath.push(under(host, n));
      nodes.push(`[node name=${gdString(n)} type="Sprite2D" parent=${gdString(at(host))}]`, `z_index = ${z}`, ...hidden, ...fade, ...materialFor(blend, under(host, n)), `position = ${v2(t0.x, t0.y)}`, `texture = ${tex(t0.path)}`, 'centered = false', '');
    });

    // Symbols with skeletons of their own: a node moved by the instance, holding its own rig and parts.
    for (const inst of sc.nested) {
      const host = parentOf(inst.layer);
      const n = name(at(host), inst.name);
      const path = under(host, n);
      const firstAt = inst.at.findIndex((s) => !!s);
      const s0 = inst.at[firstAt] ?? undefined;
      const m = s0 ? [s0.matrix[0], s0.matrix[1], s0.matrix[2], s0.matrix[3], s0.matrix[4] * k, s0.matrix[5] * k] : [1, 0, 0, 1, 0, 0];
      const op = inst.look.opacity * (s0?.opacity ?? 1);
      const tinted = inst.at.some((s) => s?.tint);
      const tint: Tint | undefined = tinted ? { inst, mats: new Map() } : undefined;
      if (tint) tints.push(tint);
      nodes.push(
        `[node name=${gdString(n)} type="Node2D" parent=${gdString(at(host))}]`,
        `z_index = ${Math.max(-4096, Math.min(4096, inst.z * unit))}`,
        ...(inst.at[0] ? [] : ['visible = false']),
        ...(op < 1 ? [`modulate = Color(1, 1, 1, ${gdNum(op)})`] : []),
        `transform = ${xf(m)}`,
        '',
      );
      const nodesOf = emit(inst.scope, path, zUnit(inst.scope), { blend: inst.look.blend, tint }, () => path);
      res.nested.push({ inst, path, nodes: nodesOf, tint });
    }
    return res;
  };

  const rootNodes = emit(top, '', zUnit(top), undefined, topParent);

  let cameraNode = '';
  if (camera) {
    const v = cameraViewAt(doc, o.range.start) ?? plainView(doc);
    const n = (cameraNode = name('.', camera.name));
    nodes.push(`[node name=${gdString(n)} type="Camera2D" parent="."]`, `position = ${v2(v.x * k, v.y * k)}`, `rotation = ${gdNum((v.rotation * Math.PI) / 180)}`, `zoom = ${v2(clampZoom(v.zoom), clampZoom(v.zoom))}`, 'ignore_rotation = false', '');
  }

  // Animations.
  const animIds: [string, string][] = [];
  animations.forEach((a, ai) => {
    const id = `Animation_${ai + 1}`;
    animIds.push([a.name, id]);
    const frames = a.frames.map((f) => o.range.start + f);
    const len = frames.length / a.fps;
    const lines: string[] = [`[sub_resource type="Animation" id="${id}"]`, `resource_name = ${gdString(a.name)}`, `length = ${gdNum(len)}`, ...(a.loop ? ['loop_mode = 1'] : []), `step = ${gdNum(1 / a.fps)}`];
    let ti = 0;
    const track = (path: string, update: 0 | 1, keys: { t: number; trans: number; value: string }[]) => {
      lines.push(
        `tracks/${ti}/type = "value"`,
        `tracks/${ti}/imported = false`,
        `tracks/${ti}/enabled = true`,
        `tracks/${ti}/path = NodePath(${gdString(path)})`,
        `tracks/${ti}/interp = 1`,
        `tracks/${ti}/loop_wrap = true`,
        `tracks/${ti}/keys = {`,
        `"times": PackedFloat32Array(${keys.map((q) => gdNum(q.t)).join(', ')}),`,
        `"transitions": PackedFloat32Array(${keys.map((q) => gdNum(q.trans)).join(', ')}),`,
        `"update": ${update},`,
        `"values": [${keys.map((q) => q.value).join(', ')}]`,
        '}',
      );
      ti++;
    };
    type Keys = { t: number; trans: number; v: number[] }[];
    const vtrack = (path: string, keys: Keys, show: (v: number[]) => string) => track(path, 0, reduceKeys(keys).map((q) => ({ t: q.t, trans: q.trans, value: show(q.v) })));

    const scopeTracks = (nd: ScopeNodes, fr: Frames, textures: BonesTexture[][]) => {
      const sc = nd.sc;
      for (const { rig, bonePath } of nd.rigs) {
        const rk = rigKeys(rig, fr.f, a.fps);
        const poses = rk.map((q) => rigPoseAt(doc, rig, q.f));
        for (const b of rig.rig.bones) {
          const path = bonePath.get(b.id)!;
          const m = localRest(rig, b.id, k);
          const la = angle(m);
          const pos = reduceKeys(rk.map((q, j) => ({ t: q.t, trans: q.trans, v: [m[4] + (poses[j][b.id]?.x ?? 0) * k, m[5] + (poses[j][b.id]?.y ?? 0) * k] })));
          const rot = reduceKeys(rk.map((q, j) => ({ t: q.t, trans: q.trans, v: [la + ((poses[j][b.id]?.r ?? 0) * Math.PI) / 180] })));
          const sc2 = reduceKeys(rk.map((q, j) => ({ t: q.t, trans: q.trans, v: [stretchOf(poses[j][b.id])] })));
          track(`${path}:position`, 0, pos.map((q) => ({ t: q.t, trans: q.trans, value: v2(q.v[0], q.v[1]) })));
          track(`${path}:rotation`, 0, rot.map((q) => ({ t: q.t, trans: q.trans, value: gdFloat(q.v[0]) })));
          if (sc2.length > 1 || Math.abs(sc2[0].v[0] - 1) > 1e-6) track(`${path}:scale`, 0, sc2.map((q) => ({ t: q.t, trans: q.trans, value: v2(q.v[0], 1) })));
        }
      }
      // Picture swaps (mouths, hands, frame by frame drawing) and parts that come and go.
      sc.parts.forEach((p, i) => {
        const seq = fr.f.map((f, j) => (fr.on[j] ? (p.frameOf[f - sc.range.start] ?? -1) : -1));
        const pics = new Set(seq.filter((x) => x >= 0));
        const comes = seq.some((x) => x < 0) || p.frameOf.some((x) => x < 0);
        const swaps = p.pictures.length > 1;
        if (!swaps && !comes) return;
        const texKeys: { t: number; trans: number; value: string }[] = [];
        const visKeys: { t: number; trans: number; value: string }[] = [];
        let lastPic = -2;
        let lastVis: boolean | undefined;
        seq.forEach((x, j) => {
          const t = j / a.fps;
          if (x >= 0 && x !== lastPic && swaps) {
            texKeys.push({ t, trans: 1, value: tex(textures[i][x].path) });
            lastPic = x;
          }
          const vis = x >= 0;
          if (vis !== lastVis) {
            visKeys.push({ t, trans: 1, value: vis ? 'true' : 'false' });
            lastVis = vis;
          }
        });
        if (swaps && pics.size) track(`${nd.partPath[i]}:texture`, 1, texKeys);
        if (comes) track(`${nd.partPath[i]}:visible`, 1, visKeys);
        // A cut-out part's picture can be a different size: its place under the bone changes with it.
        if (swaps && p.kind !== 'mesh') {
          const posKeys: { t: number; trans: number; value: string }[] = [];
          let last = '';
          seq.forEach((x, j) => {
            if (x < 0) return;
            const tx = textures[i][x];
            let at = v2(tx.x, tx.y);
            if (p.kind === 'cut' && p.rig && p.bone) {
              const b = p.rig.rig.bones.find((q) => q.id === p.bone)!;
              const r = restMatrix(b);
              const m = mmul(minv([r[0], r[1], r[2], r[3], r[4] * k, r[5] * k]), [1, 0, 0, 1, tx.x, tx.y]);
              at = v2(m[4], m[5]);
            }
            if (at !== last) {
              posKeys.push({ t: j / a.fps, trans: 1, value: at });
              last = at;
            }
          });
          if (posKeys.length > 1) track(`${nd.partPath[i]}:position`, 1, posKeys);
        }
      });
      // Symbols with their own skeletons: where the instance is, how faded and washed, and which of its frames shows.
      for (const nn of nd.nested) {
        const inst = nn.inst;
        const st = fr.f.map((f, j) => (fr.on[j] ? (inst.at[f - sc.range.start] ?? null) : null));
        const n = st.length;
        const glide = (j: number) => !!st[j]?.glide;
        vtrack(`${nn.path}:transform`, sampledKeys(n, a.fps, glide, (j) => (st[j] ? [st[j]!.matrix[0], st[j]!.matrix[1], st[j]!.matrix[2], st[j]!.matrix[3], st[j]!.matrix[4] * k, st[j]!.matrix[5] * k] : null)), (v) => xf(v));
        const opKeys = sampledKeys(n, a.fps, glide, (j) => (st[j] ? [inst.look.opacity * st[j]!.opacity] : null));
        if (opKeys.some((q) => Math.abs(q.v[0] - 1) > 1e-6)) vtrack(`${nn.path}:modulate`, opKeys, (v) => `Color(1, 1, 1, ${gdNum(v[0])})`);
        if (st.some((s) => !s)) track(`${nn.path}:visible`, 1, st.reduce<{ t: number; trans: number; value: string }[]>((acc, s, j) => (acc.length && acc[acc.length - 1].value === String(!!s) ? acc : [...acc, { t: j / a.fps, trans: 1, value: String(!!s) }]), []));
        if (nn.tint) {
          let lastColor = st.find((s) => s?.tint)?.tint?.color ?? '#ffffff';
          const colors = st.map((s) => {
            if (s?.tint) lastColor = s.tint.color;
            return lastColor;
          });
          const amounts = sampledKeys(n, a.fps, glide, (j) => (st[j] ? [st[j]!.tint?.amount ?? 0] : null));
          const cols = sampledKeys(n, a.fps, glide, (j) => (st[j] ? rgbaOf(colors[j]) : null));
          for (const m of nn.tint.mats.values()) {
            vtrack(`${m.path}:material:shader_parameter/tint_amount`, amounts, (v) => gdFloat(v[0]));
            vtrack(`${m.path}:material:shader_parameter/tint_color`, cols, (v) => `Color(${v.map(gdNum).join(', ')})`);
          }
        }
        // The symbol's own timeline: which of its frames shows at each step.
        const inner: Frames = { f: [], on: [] };
        let lastF = 0;
        st.forEach((s) => {
          if (s) lastF = s.frame;
          inner.f.push(lastF);
          inner.on.push(!!s);
        });
        scopeTracks(nn.nodes, inner, nn.inst.scope.textures ?? nn.inst.scope.parts.map((p) => p.pictures.map(() => ({ path: 'res://missing.png', x: 0, y: 0, w: 1, h: 1 }))));
      }
    };
    scopeTracks(rootNodes, { f: frames, on: frames.map(() => true) }, o.textures);

    if (camera) {
      const cn = cameraNode;
      const ck = cameraKeys(doc, frames, a.fps);
      const view = (j: number) => cameraViewAt(doc, ck[j].f) ?? plainView(doc);
      const keys = (pick: (v: ReturnType<typeof view>) => number[]): Keys => sampledKeys(ck.length, a.fps, (j) => ck[j].glide, (j) => pick(view(j)));
      vtrack(`${cn}:position`, keys((v) => [v.x * k, v.y * k]), (v) => v2(v[0], v[1]));
      vtrack(`${cn}:rotation`, keys((v) => [(v.rotation * Math.PI) / 180]), (v) => gdFloat(v[0]));
      vtrack(`${cn}:zoom`, keys((v) => [clampZoom(v.zoom)]), (v) => v2(v[0], v[0]));
      for (const g of depthGroups) {
        // Scale about the camera's own centre of the layer, by how much less the far layer zooms.
        const grow = (v: ReturnType<typeof view>) => {
          const sc = Math.pow(clampZoom(v.zoom), g.factor - 1);
          const px = doc.width / 2 + (v.x - doc.width / 2) * g.factor;
          const py = doc.height / 2 + (v.y - doc.height / 2) * g.factor;
          return [sc, 0, 0, sc, px * (1 - sc) * k, py * (1 - sc) * k];
        };
        vtrack(`${g.path}:transform`, keys(grow), (v) => xf(v));
      }
    }
    sub.push(lines.join('\n'), '');
  });
  sub.push('[sub_resource type="AnimationLibrary" id="AnimationLibrary_1"]', '_data = {', animIds.map(([n, id]) => `&${gdString(n)}: SubResource("${id}")`).join(',\n'), '}', '');
  nodes.push('[node name="AnimationPlayer" type="AnimationPlayer" parent="."]', 'libraries = {', '&"": SubResource("AnimationLibrary_1")', '}', ...(animations[0] ? [`autoplay = &${gdString(animations[0].name)}`] : []), '');

  const text = [`[gd_scene load_steps=${ext.length + sub.filter((s) => s.startsWith('[sub_resource')).length + 1} format=3]`, '', ...(ext.length ? [...ext, ''] : []), ...sub, ...nodes].join('\n');
  return { text, shaders };
}

function rgbaOf(hex: string): number[] {
  const h = hex.replace('#', '');
  const ch = (i: number) => (parseInt(h.slice(i, i + 2), 16) || 0) / 255;
  return [ch(0), ch(2), ch(4), h.length >= 8 ? ch(6) : 1];
}

/** A Godot 4 scene (.tscn) for a rigged character. */
export function godotBonesScene(o: BonesSceneInput): string {
  return build(o).text;
}

/** The shader files the scene needs next to it (a tinted symbol only), by name. */
export function godotBonesShaders(o: BonesSceneInput): { name: string; text: string }[] {
  return [...build(o).shaders].map((b) => ({ name: tintShaderName(b), text: tintShader(b) }));
}

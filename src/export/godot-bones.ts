/**
 * Godot "Bones (editable in Godot)" export: the skeleton as Skeleton2D and Bone2D nodes, every part as a Sprite2D
 * riding its bone (or a skinned Polygon2D for layers that bend), and an AnimationPlayer with one animation per clip
 * holding each bone's position, rotation and squash. Pure: the runner renders the part pictures and hands them in.
 *
 * Spaces: Godot gets output pixels (document pixels times the export scale). Bone rest matrices are turns and moves
 * only, so scaling just scales their moves.
 */
import type { Cel, Doc, Drawing, Easing, Id, Layer, SkinMesh } from '../core/format';
import { poseAt } from '../core/symbols';
import { isRigLayer, poseKeyAt, rigPoseAt, type RigLayer } from '../rig/pose';
import { minv, mmul, restMatrix, stretchOf, type Mat } from '../rig/math';
import type { Animation } from './sheet';

// ---------------------------------------------------------------- what goes in

export type PartKind = 'cut' | 'mesh' | 'free';

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
}

/** A rendered picture: where its top-left sits in output pixels, its size, and its res:// path. */
export interface BonesTexture {
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a layer shows at a frame without its bone moving it (symbols, morphs and swaps still play). */
export function restPicture(doc: Doc, layer: Layer, frame: number): Drawing | undefined {
  if (!layer.bind) return poseAt(doc, layer, frame);
  const { bind: _b, ...free } = layer;
  return poseAt(doc, free as Layer, frame);
}

/** The layers that make the scene (visible, not reference, not bones or camera), with their pictures per frame. */
export function bonesParts(doc: Doc, range: { start: number; end: number }): BonesPart[] {
  const out: BonesPart[] = [];
  doc.layers.forEach((layer, z) => {
    if (!layer.visible || layer.reference || isRigLayer(layer) || layer.kind === 'camera') return;
    const pictures: Drawing[] = [];
    const frameOf: number[] = [];
    for (let f = range.start; f <= range.end; f++) {
      const d = restPicture(doc, layer, f);
      if (!d) {
        frameOf.push(-1);
        continue;
      }
      let i = pictures.indexOf(d);
      if (i < 0) i = pictures.push(d) - 1;
      frameOf.push(i);
    }
    if (!pictures.length) return;
    const r = layer.bind ? doc.layers.find((l) => l.id === layer.bind!.rig) : undefined;
    const rig = isRigLayer(r) ? r : undefined;
    const hasBone = !!rig && rig.rig.bones.some((b) => b.id === layer.bind!.bone);
    const kind: PartKind = rig && layer.bind!.mesh?.points.length ? 'mesh' : hasBone ? 'cut' : 'free';
    out.push({ layer, z, kind, ...(rig && kind !== 'free' ? { rig, bone: layer.bind!.bone } : {}), ...(kind === 'mesh' ? { mesh: layer.bind!.mesh } : {}), pictures, frameOf });
  });
  return out;
}

/** The bones layers on the stage that have bones. */
export function bonesRigs(doc: Doc): RigLayer[] {
  return doc.layers.filter((l): l is RigLayer => isRigLayer(l) && l.rig.bones.length > 0);
}

// ---------------------------------------------------------------- writing Godot text

const gdString = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';

/** A number as Godot writes it: short, no exponent, -0 as 0. */
export function gdNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1e6) / 1e6;
  if (Object.is(r, -0) || r === 0) return '0';
  return String(r);
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

/** A Godot 4 scene (.tscn) for a rigged character. */
export function godotBonesScene(o: BonesSceneInput): string {
  const { doc, parts, textures, animations } = o;
  const k = o.scale;
  const rigs = bonesRigs(doc);
  const name = nodeNamer();
  const ext: string[] = [];
  const sub: string[] = [];
  const nodes: string[] = [];
  const texId = new Map<string, string>();
  const tex = (path: string) => {
    let id = texId.get(path);
    if (!id) {
      id = `${texId.size + 1}_tex`;
      texId.set(path, id);
      ext.push(`[ext_resource type="Texture2D" path=${gdString(path)} id="${id}"]`);
    }
    return `ExtResource("${id}")`;
  };

  const root = o.rootName.replace(/[.:@/"%]/g, '_').trim() || 'Character';
  nodes.push(`[node name=${gdString(root)} type="Node2D"]`);
  if (o.pixelArt) nodes.push('texture_filter = 1');
  nodes.push('');

  // Skeletons and their bones. Paths are from the scene root.
  const bonePath = new Map<Id, string>();
  const skelPath = new Map<Id, string>();
  for (const rig of rigs) {
    const sk = name('.', rig.name);
    skelPath.set(rig.id, sk);
    nodes.push(`[node name=${gdString(sk)} type="Skeleton2D" parent="."]`, '');
    for (const b of rig.rig.bones) {
      const parent = b.parent && bonePath.has(b.parent) ? bonePath.get(b.parent)! : sk;
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
  }

  // Parts, back to front by z_index (they sit at different depths under the bones, so tree order can't do it).
  const partPath: string[] = [];
  parts.forEach((p, i) => {
    const texs = textures[i];
    const first = p.frameOf.find((x) => x >= 0) ?? 0;
    const t0 = texs[first];
    const z = Math.min(4096, p.z);
    const fade = p.layer.opacity < 1 ? [`modulate = Color(1, 1, 1, ${gdNum(p.layer.opacity)})`] : [];
    const hidden = p.frameOf[0] < 0 ? ['visible = false'] : [];
    if (p.kind === 'mesh' && p.rig && p.mesh) {
      const sk = skelPath.get(p.rig.id)!;
      const n = name('.', p.layer.name);
      partPath.push(n);
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
        const path = bonePath.get(bid);
        if (!path) return;
        const ws = new Array<number>(count).fill(0);
        let any = false;
        mesh.weights.forEach((w, v) => {
          for (let q = 0; q < w.length; q += 2)
            if (w[q] === bi && w[q + 1] > 0 && sums[v] > 0) {
              ws[v] += w[q + 1] / sums[v];
              any = true;
            }
        });
        if (any) bones.push(`NodePath(${gdString(path.slice(sk.length + 1))})`, `PackedFloat32Array(${ws.map(gdNum).join(', ')})`);
      });
      nodes.push(
        `[node name=${gdString(n)} type="Polygon2D" parent="."]`,
        `z_index = ${z}`,
        ...hidden,
        ...fade,
        `texture = ${tex(t0.path)}`,
        `skeleton = NodePath(${gdString('../' + sk)})`,
        `polygon = PackedVector2Array(${pts.join(', ')})`,
        `uv = PackedVector2Array(${uv.join(', ')})`,
        `polygons = [${tris.join(', ')}]`,
        `bones = [${bones.join(', ')}]`,
        '',
      );
      return;
    }
    if (p.kind === 'cut' && p.rig && p.bone) {
      const parent = bonePath.get(p.bone)!;
      const n = name(parent, p.layer.name);
      partPath.push(`${parent}/${n}`);
      // Under the bone: undo its rest place, then sit where the picture was drawn.
      const b = p.rig.rig.bones.find((x) => x.id === p.bone)!;
      const r = restMatrix(b);
      const m = mmul(minv([r[0], r[1], r[2], r[3], r[4] * k, r[5] * k]), [1, 0, 0, 1, t0.x, t0.y]);
      nodes.push(
        `[node name=${gdString(n)} type="Sprite2D" parent=${gdString(parent)}]`,
        `z_index = ${z}`,
        ...hidden,
        ...fade,
        `position = ${v2(m[4], m[5])}`,
        `rotation = ${gdNum(angle(m))}`,
        `texture = ${tex(t0.path)}`,
        'centered = false',
        '',
      );
      return;
    }
    const n = name('.', p.layer.name);
    partPath.push(n);
    nodes.push(`[node name=${gdString(n)} type="Sprite2D" parent="."]`, `z_index = ${z}`, ...hidden, ...fade, `position = ${v2(t0.x, t0.y)}`, `texture = ${tex(t0.path)}`, 'centered = false', '');
  });

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
    for (const rig of rigs) {
      const rk = rigKeys(rig, frames, a.fps);
      const poses = rk.map((q) => rigPoseAt(doc, rig, q.f));
      for (const b of rig.rig.bones) {
        const path = bonePath.get(b.id)!;
        const m = localRest(rig, b.id, k);
        const la = angle(m);
        const pos = reduceKeys(rk.map((q, j) => ({ t: q.t, trans: q.trans, v: [m[4] + (poses[j][b.id]?.x ?? 0) * k, m[5] + (poses[j][b.id]?.y ?? 0) * k] })));
        const rot = reduceKeys(rk.map((q, j) => ({ t: q.t, trans: q.trans, v: [la + ((poses[j][b.id]?.r ?? 0) * Math.PI) / 180] })));
        const sc = reduceKeys(rk.map((q, j) => ({ t: q.t, trans: q.trans, v: [stretchOf(poses[j][b.id])] })));
        track(`${path}:position`, 0, pos.map((q) => ({ t: q.t, trans: q.trans, value: v2(q.v[0], q.v[1]) })));
        track(`${path}:rotation`, 0, rot.map((q) => ({ t: q.t, trans: q.trans, value: gdNum(q.v[0]) })));
        if (sc.length > 1 || Math.abs(sc[0].v[0] - 1) > 1e-6) track(`${path}:scale`, 0, sc.map((q) => ({ t: q.t, trans: q.trans, value: v2(q.v[0], 1) })));
      }
    }
    // Picture swaps (mouths, hands, frame by frame drawing) and parts that come and go.
    parts.forEach((p, i) => {
      const seq = a.frames.map((f) => p.frameOf[f] ?? -1);
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
      if (swaps && pics.size) track(`${partPath[i]}:texture`, 1, texKeys);
      if (comes) track(`${partPath[i]}:visible`, 1, visKeys);
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
        if (posKeys.length > 1) track(`${partPath[i]}:position`, 1, posKeys);
      }
    });
    sub.push(lines.join('\n'), '');
  });
  sub.push('[sub_resource type="AnimationLibrary" id="AnimationLibrary_1"]', '_data = {', animIds.map(([n, id]) => `&${gdString(n)}: SubResource("${id}")`).join(',\n'), '}', '');
  nodes.push('[node name="AnimationPlayer" type="AnimationPlayer" parent="."]', 'libraries = {', '&"": SubResource("AnimationLibrary_1")', '}', ...(animations[0] ? [`autoplay = &${gdString(animations[0].name)}`] : []), '');

  return [`[gd_scene load_steps=${ext.length + sub.filter((s) => s.startsWith('[sub_resource')).length + 1} format=3]`, '', ...(ext.length ? [...ext, ''] : []), ...sub, ...nodes].join('\n');
}

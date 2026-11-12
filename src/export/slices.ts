// What the sprite sheet export writes for slices: regions, 9-patch borders and pivots in the shapes each engine reads.
// Pure text and numbers. Slices are measured on whole frames of the export, so the sheet picture must hold those frames
// whole (the export keeps the first frame, and every frame where a moving slice has a key, untrimmed when there are
// slices); `at` is where the first frame sits on the sheet, or a function from a frame to where that frame sits.
import type { SliceKey } from '../core/format';
import type { ExportSlice } from '../pixel/slices/model';

export interface Pt {
  x: number;
  y: number;
}

/** Names each slice can be given in an engine: no clash with `taken` (the frame names), and the same name twice gets a number. */
export function sliceNames(slices: readonly ExportSlice[], taken: Iterable<string>, clean: (s: string) => string = (s) => s): string[] {
  const used = new Set<string>(taken);
  return slices.map((s) => {
    const base = clean(s.name) || 'slice';
    let n = base;
    for (let k = 2; used.has(n); k++) n = `${base}_${k}`;
    used.add(n);
    return n;
  });
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Where an exported frame sits on the sheet: one place for the first frame, or a function from a frame (counted from 0) to its place. */
export type At = Pt | ((frame: number) => Pt);
export const placeOf = (at: At, frame: number): Pt => (typeof at === 'function' ? at(frame) : at);

/** The places a slice has, one per key (a slice that stays put has one, at frame 0). */
export function sliceKeys(s: ExportSlice): SliceKey[] {
  return s.keys?.length ? s.keys : [{ frame: 0, x: s.x, y: s.y, w: s.w, h: s.h, center: s.center, pivot: s.pivot }];
}

/** True for a slice that goes somewhere else on a later frame. */
export const moves = (s: ExportSlice): boolean => (s.keys?.length ?? 0) > 1;

/**
 * A name for each key of each slice: the first key keeps the slice's name, the later ones are `Name_f4` (the frame the key
 * starts on, counted from 1 like the timeline). They never clash with `taken` or with each other.
 */
export function sliceKeyNames(slices: readonly ExportSlice[], names: readonly string[], taken: Iterable<string> = []): string[][] {
  const used = new Set<string>([...taken, ...names]);
  return slices.map((s, i) =>
    sliceKeys(s).map((k, j) => {
      if (j === 0) return names[i];
      const base = `${names[i]}_f${k.frame + 1}`;
      let n = base;
      for (let m = 2; used.has(n); m++) n = `${base}_${m}`;
      used.add(n);
      return n;
    }),
  );
}

/** Which key is in force on each of `count` exported frames (an index into `sliceKeys`). */
export function keyIndexPerFrame(s: ExportSlice, count: number): number[] {
  const keys = sliceKeys(s);
  const out: number[] = [];
  let j = 0;
  for (let f = 0; f < count; f++) {
    while (j + 1 < keys.length && keys[j + 1].frame <= f) j++;
    out.push(j);
  }
  return out;
}

/** The four borders of a 9-patch, in pixels in from each side. */
export function nineBorders(s: Pick<SliceKey, 'x' | 'y' | 'w' | 'h' | 'center'>): { left: number; top: number; right: number; bottom: number } | null {
  const c = s.center;
  return c ? { left: c.x - s.x, top: c.y - s.y, right: s.x + s.w - (c.x + c.w), bottom: s.y + s.h - (c.y + c.h) } : null;
}

const hexColor = (s: ExportSlice): string => (s.color && /^#[0-9a-f]{6}/i.test(s.color) ? s.color.slice(0, 7) : '#0000ff') + 'ff';

/** Aseprite's own shape (meta.slices): the middle and the pivot measured from the slice's corner, one key per change. Frameling reads it back. */
export function sliceMeta(slices: readonly ExportSlice[], names: readonly string[]) {
  return slices.map((s, i) => ({
    name: names[i],
    color: hexColor(s),
    keys: (s.keys?.length ? s.keys : [{ frame: 0, x: s.x, y: s.y, w: s.w, h: s.h, center: s.center, pivot: s.pivot }]).map((k) => ({
      frame: k.frame,
      bounds: { x: k.x, y: k.y, w: k.w, h: k.h },
      ...(k.center ? { center: { x: k.center.x - k.x, y: k.center.y - k.y, w: k.center.w, h: k.center.h } } : {}),
      ...(k.pivot ? { pivot: { x: k.pivot.x - k.x, y: k.pivot.y - k.y } } : {}),
    })),
  }));
}

export interface SliceAtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  pivot?: Pt;
  anchor?: Pt;
  frameling?: { nineSlice: ReturnType<typeof nineBorders> };
}

/**
 * Atlas frames for slices (the shape Phaser and PixiJS read): the region on the sheet, with a pivot (Phaser) or anchor (Pixi).
 * A slice that moves has one more frame for each later key, named by `keyNames` (see `sliceKeyNames`), cut from the sheet
 * frame the key starts on.
 */
export function sliceFrames(slices: readonly ExportSlice[], names: readonly string[], at: At, key: 'pivot' | 'anchor', keyNames?: readonly (readonly string[])[]) {
  const out: Record<string, SliceAtlasFrame> = {};
  slices.forEach((s, i) => {
    const ks = sliceKeys(s);
    ks.forEach((k, j) => {
      const p = placeOf(at, j === 0 ? 0 : k.frame);
      out[j === 0 ? names[i] : (keyNames?.[i]?.[j] ?? `${names[i]}_f${k.frame + 1}`)] = {
        frame: { x: p.x + k.x, y: p.y + k.y, w: k.w, h: k.h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: k.w, h: k.h },
        sourceSize: { w: k.w, h: k.h },
        ...(k.pivot ? { [key]: { x: round4((k.pivot.x - k.x) / k.w), y: round4((k.pivot.y - k.y) / k.h) } } : {}),
        ...(k.center ? { frameling: { nineSlice: nineBorders(k) } } : {}),
      };
    });
  });
  return out;
}

/**
 * For a slice that moves: the name of its sprite for each exported frame (the key in force), so a player can show the
 * slice as an animation of its own. Empty for one that stays put.
 */
export function sliceTrack(s: ExportSlice, keyNames: readonly string[], count: number): string[] {
  return moves(s) ? keyIndexPerFrame(s, count).map((j) => keyNames[j]) : [];
}

/** The same motion as runs, for players that hold a frame by time (Unity): each key's sprite and how many exported frames it stays. */
export function sliceRuns(s: ExportSlice, keyNames: readonly string[], count: number): { frames: string[]; holds: number[] } {
  const ks = sliceKeys(s);
  return { frames: ks.map((_, j) => keyNames[j]), holds: ks.map((k, j) => Math.max(1, (j + 1 < ks.length ? ks[j + 1].frame : count) - k.frame)) };
}

/** Unity: sprites counted from the sheet's bottom, a normalised pivot, and the border as left, bottom, right, top. A key after the first is a sprite of its own. */
export function unitySlices(slices: readonly ExportSlice[], names: readonly string[], at: At, sheetHeight: number, keyNames?: readonly (readonly string[])[]) {
  const out: { name: string; x: number; y: number; w: number; h: number; pivotX: number; pivotY: number; borderL?: number; borderB?: number; borderR?: number; borderT?: number }[] = [];
  slices.forEach((s, i) => {
    const ks = sliceKeys(s);
    ks.forEach((k, j) => {
      const p = placeOf(at, j === 0 ? 0 : k.frame);
      const b = nineBorders(k);
      out.push({
        name: j === 0 ? names[i] : (keyNames?.[i]?.[j] ?? `${names[i]}_f${k.frame + 1}`),
        x: p.x + k.x,
        y: sheetHeight - (p.y + k.y) - k.h,
        w: k.w,
        h: k.h,
        // Unity's pivot starts at the bottom left. A slice with no pivot of its own sits on its middle.
        pivotX: round4(k.pivot ? (k.pivot.x - k.x) / k.w : 0.5),
        pivotY: round4(k.pivot ? 1 - (k.pivot.y - k.y) / k.h : 0.5),
        ...(b ? { borderL: b.left, borderB: b.bottom, borderR: b.right, borderT: b.top } : {}),
      });
    });
  });
  return out;
}

const gd = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const gdNode = (s: string) => s.replace(/[.:@/"%]/g, '_');
const gdNum = (n: number) => (Number.isInteger(n) ? String(n) : String(round4(n)));
const gdFloat = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(round4(n)));

/** The motion of the slices that move, for the Godot scene: how fast the exported frames play, and how many there are. */
export interface SliceTrack {
  fps: number;
  frames: number;
}

const sec = (frame: number, fps: number): string => String(Math.round((frame / Math.max(1, fps)) * 1e6) / 1e6);

/** One value track of an Animation resource: a property changing at the times of the keys, with no blending between them. */
function gdTrack(n: number, path: string, times: string[], values: string[]): string[] {
  return [
    `tracks/${n}/type = "value"`,
    `tracks/${n}/imported = false`,
    `tracks/${n}/enabled = true`,
    `tracks/${n}/path = NodePath(${gd(path)})`,
    `tracks/${n}/interp = 1`,
    `tracks/${n}/loop_wrap = true`,
    `tracks/${n}/keys = {`,
    `"times": PackedFloat32Array(${times.join(', ')}),`,
    `"transitions": PackedFloat32Array(${times.map(() => '1').join(', ')}),`,
    '"update": 1,',
    `"values": [${values.join(', ')}]`,
    '}',
  ];
}

/**
 * A Godot scene with one node per slice: a NinePatchRect (borders set) for a 9-patch, and a Sprite2D showing an
 * AtlasTexture of the region for any other, positioned so the node's origin is the slice's pivot (its top left when
 * there is none).
 *
 * A slice that moves between frames is the same node with the first key's look, plus an AnimationPlayer ("SlicePlayer",
 * playing "slices" on its own) that sets, at each key's time, the region (Sprite2D: `region_rect`, with the pivot as
 * `offset`; NinePatchRect: `region_rect`, `offset_*` and `patch_margin_*`), cut from the sheet frame the key starts on.
 */
export function godotSlicesScene(texturePath: string, slices: readonly ExportSlice[], names: readonly string[], at: At, pixelArt: boolean, track?: SliceTrack): string {
  const first = placeOf(at, 0);
  const plain = slices.map((s, i) => ({ s, i })).filter((x) => !x.s.center && !moves(x.s));
  const moving = slices.map((s, i) => ({ s, i })).filter((x) => moves(x.s));
  const body: string[] = [];
  const subs: string[] = [];
  plain.forEach((x, k) => subs.push(`[sub_resource type="AtlasTexture" id="Atlas_${k + 1}"]`, 'atlas = ExtResource("1_sheet")', `region = Rect2(${first.x + x.s.x}, ${first.y + x.s.y}, ${x.s.w}, ${x.s.h})`, ''));
  body.push('[node name="Slices" type="Node2D"]', ...(pixelArt ? ['texture_filter = 1'] : []), '');
  let k = 0;
  const tracks: string[] = [];
  let nTracks = 0;
  const addTrack = (path: string, ks: readonly SliceKey[], value: (key: SliceKey) => string) => {
    const values = ks.map(value);
    // A property that is the same on every key needs no track.
    if (values.every((v) => v === values[0])) return;
    tracks.push(...gdTrack(nTracks++, path, ks.map((key) => sec(key.frame, track?.fps ?? 12)), values));
  };
  const lastFrame = Math.max(0, ...slices.flatMap((s) => sliceKeys(s).map((key) => key.frame)));
  slices.forEach((s, i) => {
    const node = gdNode(names[i]);
    const ks = sliceKeys(s);
    const regionOf = (key: SliceKey): string => {
      const p = placeOf(at, key.frame);
      return `Rect2(${p.x + key.x}, ${p.y + key.y}, ${key.w}, ${key.h})`;
    };
    if (s.center) {
      const b = nineBorders(s)!;
      const off = (key: SliceKey) => ({ l: key.pivot ? -(key.pivot.x - key.x) : 0, t: key.pivot ? -(key.pivot.y - key.y) : 0 });
      body.push(
        `[node name=${gd(node)} type="NinePatchRect" parent="."]`,
        `offset_left = ${off(ks[0]).l}`,
        `offset_top = ${off(ks[0]).t}`,
        `offset_right = ${off(ks[0]).l + s.w}`,
        `offset_bottom = ${off(ks[0]).t + s.h}`,
        'texture = ExtResource("1_sheet")',
        `region_rect = Rect2(${first.x + s.x}, ${first.y + s.y}, ${s.w}, ${s.h})`,
        `patch_margin_left = ${b.left}`,
        `patch_margin_top = ${b.top}`,
        `patch_margin_right = ${b.right}`,
        `patch_margin_bottom = ${b.bottom}`,
        '',
      );
      if (moves(s)) {
        const bord = (key: SliceKey) => nineBorders(key) ?? { left: 0, top: 0, right: 0, bottom: 0 };
        addTrack(`${node}:region_rect`, ks, regionOf);
        addTrack(`${node}:offset_left`, ks, (key) => gdFloat(off(key).l));
        addTrack(`${node}:offset_top`, ks, (key) => gdFloat(off(key).t));
        addTrack(`${node}:offset_right`, ks, (key) => gdFloat(off(key).l + key.w));
        addTrack(`${node}:offset_bottom`, ks, (key) => gdFloat(off(key).t + key.h));
        addTrack(`${node}:patch_margin_left`, ks, (key) => String(bord(key).left));
        addTrack(`${node}:patch_margin_top`, ks, (key) => String(bord(key).top));
        addTrack(`${node}:patch_margin_right`, ks, (key) => String(bord(key).right));
        addTrack(`${node}:patch_margin_bottom`, ks, (key) => String(bord(key).bottom));
      }
    } else if (moves(s)) {
      // The sheet itself with a region, so the region can change from key to key.
      const off = (key: SliceKey) => `Vector2(${gdFloat(key.pivot ? -(key.pivot.x - key.x) : 0)}, ${gdFloat(key.pivot ? -(key.pivot.y - key.y) : 0)})`;
      body.push(`[node name=${gd(node)} type="Sprite2D" parent="."]`, 'texture = ExtResource("1_sheet")', 'centered = false', 'region_enabled = true', `region_rect = ${regionOf(ks[0])}`);
      if (ks[0].pivot) body.push(`offset = ${off(ks[0])}`);
      body.push('');
      addTrack(`${node}:region_rect`, ks, regionOf);
      addTrack(`${node}:offset`, ks, off);
    } else {
      k++;
      body.push(`[node name=${gd(node)} type="Sprite2D" parent="."]`, `texture = SubResource("Atlas_${k}")`, 'centered = false');
      if (s.pivot) body.push(`offset = Vector2(${gdNum(-(s.pivot.x - s.x))}, ${gdNum(-(s.pivot.y - s.y))})`);
      body.push('');
    }
  });
  if (moving.length) {
    const frames = Math.max(track?.frames ?? 0, lastFrame + 1);
    const len = sec(frames, track?.fps ?? 12);
    // Every moving slice is on the same clock, so one animation (and one player) moves them all.
    subs.push('[sub_resource type="Animation" id="Animation_slices"]', 'resource_name = "slices"', `length = ${len}`, 'loop_mode = 1', `step = ${sec(1, track?.fps ?? 12)}`, ...tracks, '');
    subs.push('[sub_resource type="AnimationLibrary" id="AnimationLibrary_slices"]', '_data = {', '&"slices": SubResource("Animation_slices")', '}', '');
    body.push('[node name="SlicePlayer" type="AnimationPlayer" parent="."]', 'libraries = {', '&"": SubResource("AnimationLibrary_slices")', '}', 'autoplay = "slices"', '');
  }
  const steps = 2 + plain.length + (moving.length ? 2 : 0);
  return [`[gd_scene load_steps=${steps} format=3]`, '', `[ext_resource type="Texture2D" path=${gd(texturePath)} id="1_sheet"]`, '', ...subs, ...body].join('\n');
}

/** The file name a 9-patch picture gets for CSS: the slice name after the sheet name. */
export const cssNineFile = (base: string, name: string): string => `${base}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'slice'}.png`;

/**
 * CSS for slices. A plain slice is a box showing its region of the sheet. A 9-patch is its own small picture (the file
 * the caller writes, named by `cssNineFile`) used as a border-image that stretches the middle and keeps the borders.
 * CSS has no way to follow a slice from frame to frame, so one that moves is written where it is on the first frame,
 * with a comment saying so.
 */
export function cssSliceRules(o: { prefix: string; image: string; base: string; slices: readonly ExportSlice[]; names: readonly string[]; at: Pt; pixelArt: boolean; classOf: (name: string) => string }): string {
  const out: string[] = ['', '/* Slices */'];
  o.slices.forEach((s, i) => {
    const cls = `.${o.prefix}-slice-${o.classOf(o.names[i])}`;
    const b = nineBorders(s);
    const crisp = o.pixelArt ? ' image-rendering: pixelated;' : '';
    if (moves(s)) out.push(`/* "${o.names[i]}" moves between frames; CSS can only show where it is on the first one. */`);
    if (b) {
      const px = `${b.top}px ${b.right}px ${b.bottom}px ${b.left}px`;
      const file = cssNineFile(o.base, o.names[i]);
      out.push(`${cls} {`, '  box-sizing: border-box;', `  width: ${s.w}px;`, `  height: ${s.h}px;`, `  border: solid transparent;`, `  border-width: ${px};`, `  border-image: url("${file}") ${b.top} ${b.right} ${b.bottom} ${b.left} fill / ${px} stretch;`, ...(crisp ? [crisp.trim()] : []), '}');
    } else {
      out.push(`${cls} {`, '  display: inline-block;', `  width: ${s.w}px;`, `  height: ${s.h}px;`, `  background: url("${o.image}") ${-(o.at.x + s.x)}px ${-(o.at.y + s.y)}px no-repeat;`, ...(crisp ? [crisp.trim()] : []), '}');
    }
  });
  return out.join('\n') + '\n';
}

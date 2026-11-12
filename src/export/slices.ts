// What the sprite sheet export writes for slices: regions, 9-patch borders and pivots in the shapes each engine reads.
// Pure text and numbers. Slices are measured on the whole first frame of the export, so the sheet picture must hold that
// frame whole (the export keeps it untrimmed when there are slices); `at` is where that frame sits on the sheet.
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

/** The four borders of a 9-patch, in pixels in from each side. */
export function nineBorders(s: ExportSlice): { left: number; top: number; right: number; bottom: number } | null {
  const c = s.center;
  return c ? { left: c.x - s.x, top: c.y - s.y, right: s.x + s.w - (c.x + c.w), bottom: s.y + s.h - (c.y + c.h) } : null;
}

const hexColor = (s: ExportSlice): string => (s.color && /^#[0-9a-f]{6}/i.test(s.color) ? s.color.slice(0, 7) : '#0000ff') + 'ff';

/** Aseprite's own shape (meta.slices): the middle and the pivot measured from the slice's corner. Frameling reads it back. */
export function sliceMeta(slices: readonly ExportSlice[], names: readonly string[]) {
  return slices.map((s, i) => ({
    name: names[i],
    color: hexColor(s),
    keys: [
      {
        frame: 0,
        bounds: { x: s.x, y: s.y, w: s.w, h: s.h },
        ...(s.center ? { center: { x: s.center.x - s.x, y: s.center.y - s.y, w: s.center.w, h: s.center.h } } : {}),
        ...(s.pivot ? { pivot: { x: s.pivot.x - s.x, y: s.pivot.y - s.y } } : {}),
      },
    ],
  }));
}

/** Atlas frames for slices (the shape Phaser and PixiJS read): the region on the sheet, with a pivot (Phaser) or anchor (Pixi). */
export function sliceFrames(slices: readonly ExportSlice[], names: readonly string[], at: Pt, key: 'pivot' | 'anchor') {
  return Object.fromEntries(
    slices.map((s, i) => [
      names[i],
      {
        frame: { x: at.x + s.x, y: at.y + s.y, w: s.w, h: s.h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: s.w, h: s.h },
        sourceSize: { w: s.w, h: s.h },
        ...(s.pivot ? { [key]: { x: round4((s.pivot.x - s.x) / s.w), y: round4((s.pivot.y - s.y) / s.h) } } : {}),
        ...(s.center ? { frameling: { nineSlice: nineBorders(s) } } : {}),
      },
    ]),
  );
}

/** Unity: sprites counted from the sheet's bottom, a normalised pivot, and the border as left, bottom, right, top. */
export function unitySlices(slices: readonly ExportSlice[], names: readonly string[], at: Pt, sheetHeight: number) {
  return slices.map((s, i) => {
    const b = nineBorders(s);
    const y = sheetHeight - (at.y + s.y) - s.h;
    return {
      name: names[i],
      x: at.x + s.x,
      y,
      w: s.w,
      h: s.h,
      // Unity's pivot starts at the bottom left. A slice with no pivot of its own sits on its middle.
      pivotX: round4(s.pivot ? (s.pivot.x - s.x) / s.w : 0.5),
      pivotY: round4(s.pivot ? 1 - (s.pivot.y - s.y) / s.h : 0.5),
      ...(b ? { borderL: b.left, borderB: b.bottom, borderR: b.right, borderT: b.top } : {}),
    };
  });
}

const gd = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const gdNode = (s: string) => s.replace(/[.:@/"%]/g, '_');
const gdNum = (n: number) => (Number.isInteger(n) ? String(n) : String(round4(n)));

/**
 * A Godot scene with one node per slice: a NinePatchRect (borders set) for a 9-patch, and a Sprite2D showing an
 * AtlasTexture of the region for any other, positioned so the node's origin is the slice's pivot (its top left when
 * there is none).
 */
export function godotSlicesScene(texturePath: string, slices: readonly ExportSlice[], names: readonly string[], at: Pt, pixelArt: boolean): string {
  const plain = slices.map((s, i) => ({ s, i })).filter((x) => !x.s.center);
  const out: string[] = [`[gd_scene load_steps=${2 + plain.length} format=3]`, '', `[ext_resource type="Texture2D" path=${gd(texturePath)} id="1_sheet"]`, ''];
  plain.forEach((x, k) => out.push(`[sub_resource type="AtlasTexture" id="Atlas_${k + 1}"]`, 'atlas = ExtResource("1_sheet")', `region = Rect2(${at.x + x.s.x}, ${at.y + x.s.y}, ${x.s.w}, ${x.s.h})`, ''));
  out.push('[node name="Slices" type="Node2D"]', ...(pixelArt ? ['texture_filter = 1'] : []), '');
  let k = 0;
  slices.forEach((s, i) => {
    const node = gdNode(names[i]);
    if (s.center) {
      const b = nineBorders(s)!;
      out.push(
        `[node name=${gd(node)} type="NinePatchRect" parent="."]`,
        `offset_left = ${s.pivot ? -(s.pivot.x - s.x) : 0}`,
        `offset_top = ${s.pivot ? -(s.pivot.y - s.y) : 0}`,
        `offset_right = ${(s.pivot ? -(s.pivot.x - s.x) : 0) + s.w}`,
        `offset_bottom = ${(s.pivot ? -(s.pivot.y - s.y) : 0) + s.h}`,
        'texture = ExtResource("1_sheet")',
        `region_rect = Rect2(${at.x + s.x}, ${at.y + s.y}, ${s.w}, ${s.h})`,
        `patch_margin_left = ${b.left}`,
        `patch_margin_top = ${b.top}`,
        `patch_margin_right = ${b.right}`,
        `patch_margin_bottom = ${b.bottom}`,
        '',
      );
    } else {
      k++;
      out.push(`[node name=${gd(node)} type="Sprite2D" parent="."]`, `texture = SubResource("Atlas_${k}")`, 'centered = false');
      if (s.pivot) out.push(`offset = Vector2(${gdNum(-(s.pivot.x - s.x))}, ${gdNum(-(s.pivot.y - s.y))})`);
      out.push('');
    }
  });
  return out.join('\n');
}

/** The file name a 9-patch picture gets for CSS: the slice name after the sheet name. */
export const cssNineFile = (base: string, name: string): string => `${base}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'slice'}.png`;

/**
 * CSS for slices. A plain slice is a box showing its region of the sheet. A 9-patch is its own small picture (the file
 * the caller writes, named by `cssNineFile`) used as a border-image that stretches the middle and keeps the borders.
 */
export function cssSliceRules(o: { prefix: string; image: string; base: string; slices: readonly ExportSlice[]; names: readonly string[]; at: Pt; pixelArt: boolean; classOf: (name: string) => string }): string {
  const out: string[] = ['', '/* Slices */'];
  o.slices.forEach((s, i) => {
    const cls = `.${o.prefix}-slice-${o.classOf(o.names[i])}`;
    const b = nineBorders(s);
    const crisp = o.pixelArt ? ' image-rendering: pixelated;' : '';
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

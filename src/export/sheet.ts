// Sprite sheets: trimming, packing frames into a grid, the JSON atlas, and the Godot files. Pure maths and text, so
// it is all tested without a canvas.
import type { Clip } from '../core/format';
import type { RawImage } from '../io/png';
import { slug } from './plan';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------- trimming and cropping

/** The smallest rectangle holding every pixel that is not fully transparent. A blank frame gives a 1 x 1 corner. */
export function trimBounds(img: RawImage): Rect {
  const { width, height, pixels } = img;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function cropImage(img: RawImage, r: Rect): RawImage {
  if (r.x === 0 && r.y === 0 && r.w === img.width && r.h === img.height) return img;
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const from = ((r.y + y) * img.width + r.x) * 4;
    out.set(img.pixels.subarray(from, from + r.w * 4), y * r.w * 4);
  }
  return { width: r.w, height: r.h, pixels: out };
}

export function sameImage(a: RawImage, b: RawImage): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  const p = a.pixels;
  const q = b.pixels;
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
  return true;
}

// ---------------------------------------------------------------- cells

export interface Cell {
  /** The picture to put on the sheet (cropped when trimming). */
  image: RawImage;
  /** Where that picture sat inside the full frame. */
  trim: Rect;
  /** The full frame size. */
  source: { w: number; h: number };
  /** How many document frames this cell stands for (more than 1 when repeats are merged). */
  held: number;
}

export interface Cells {
  cells: Cell[];
  /** For each document frame (index 0 is the first frame of the range), which cell shows it. */
  cellOfFrame: number[];
}

/**
 * Turns rendered frames into cells. With `dedupe`, a frame identical to the one before is not stored again, except
 * where a clip begins (`cuts`, as indexes into `frames`), so every clip keeps its own frames.
 */
export function buildCells(frames: RawImage[], opts: { trim: boolean; dedupe: boolean; cuts?: Set<number> }): Cells {
  const cells: Cell[] = [];
  const cellOfFrame: number[] = [];
  let last: RawImage | null = null;
  frames.forEach((f, i) => {
    if (opts.dedupe && last && !opts.cuts?.has(i) && sameImage(last, f)) {
      cells[cells.length - 1].held++;
      cellOfFrame.push(cells.length - 1);
      return;
    }
    const trim = opts.trim ? trimBounds(f) : { x: 0, y: 0, w: f.width, h: f.height };
    cells.push({ image: cropImage(f, trim), trim, source: { w: f.width, h: f.height }, held: 1 });
    cellOfFrame.push(cells.length - 1);
    last = f;
  });
  return { cells, cellOfFrame };
}

// ---------------------------------------------------------------- layout

export const nextPow2 = (n: number): number => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

/** A roughly square arrangement: the column count that makes the sheet closest to as wide as it is tall. */
export function autoColumns(count: number, cellW: number, cellH: number): number {
  if (count <= 1) return 1;
  return Math.min(count, Math.max(1, Math.ceil(Math.sqrt((count * cellH) / cellW))));
}

export interface Layout {
  columns: number;
  rows: number;
  /** Size of one slot. Frames sit at the top left of their slot. */
  cellW: number;
  cellH: number;
  padding: number;
  /** The whole sheet. */
  width: number;
  height: number;
  /** Top left of each slot. */
  positions: { x: number; y: number }[];
}

export function layoutGrid(opts: { count: number; cellW: number; cellH: number; columns?: number; padding?: number; pot?: boolean }): Layout {
  const count = Math.max(1, opts.count);
  const padding = Math.max(0, Math.round(opts.padding ?? 0));
  const columns = opts.columns && opts.columns > 0 ? Math.min(Math.round(opts.columns), count) : autoColumns(count, opts.cellW + padding, opts.cellH + padding);
  const rows = Math.ceil(count / columns);
  let width = columns * opts.cellW + (columns + 1) * padding;
  let height = rows * opts.cellH + (rows + 1) * padding;
  if (opts.pot) {
    width = nextPow2(width);
    height = nextPow2(height);
  }
  const positions = Array.from({ length: count }, (_, i) => ({
    x: padding + (i % columns) * (opts.cellW + padding),
    y: padding + Math.floor(i / columns) * (opts.cellH + padding),
  }));
  return { columns, rows, cellW: opts.cellW, cellH: opts.cellH, padding, width, height, positions };
}

/** The layout for a set of cells: the slot is as big as the biggest cell. */
export function layoutCells(cells: Cell[], o: { columns?: number; padding?: number; pot?: boolean }): Layout {
  const cellW = Math.max(1, ...cells.map((c) => c.image.width));
  const cellH = Math.max(1, ...cells.map((c) => c.image.height));
  return layoutGrid({ count: cells.length, cellW, cellH, ...o });
}

/** Paints the cells onto one transparent picture. */
export function composeSheet(cells: Cell[], layout: Layout): RawImage {
  const pixels = new Uint8ClampedArray(layout.width * layout.height * 4);
  cells.forEach((c, i) => {
    const at = layout.positions[i];
    for (let y = 0; y < c.image.height; y++) {
      const from = y * c.image.width * 4;
      pixels.set(c.image.pixels.subarray(from, from + c.image.width * 4), ((at.y + y) * layout.width + at.x) * 4);
    }
  });
  return { width: layout.width, height: layout.height, pixels };
}

// ---------------------------------------------------------------- animations

export interface Animation {
  name: string;
  fps: number;
  loop: boolean;
  /** Document frames, as indexes into the exported range. */
  frames: number[];
}

/**
 * What to play from the sheet. Each clip becomes an animation. With no clips (or when exporting a whole clip), the
 * whole range is one animation called `default`, or the clip's own name.
 */
export function buildAnimations(opts: { clips: Clip[]; rangeStart: number; rangeEnd: number; fps: number; whole: boolean; onlyClipId?: string | null }): Animation[] {
  const n = opts.rangeEnd - opts.rangeStart + 1;
  const names = new Set<string>();
  const unique = (name: string) => {
    let s = name.trim() || 'clip';
    while (names.has(s)) s += '_';
    names.add(s);
    return s;
  };
  const clipFrames = (c: Clip) => {
    const a = Math.max(opts.rangeStart, Math.min(c.start, c.end));
    const b = Math.min(opts.rangeEnd, Math.max(c.start, c.end));
    return a > b ? [] : Array.from({ length: b - a + 1 }, (_, i) => a - opts.rangeStart + i);
  };
  if (!opts.whole) {
    const clip = opts.clips.find((c) => c.id === opts.onlyClipId);
    return [{ name: unique(clip?.name ?? 'default'), fps: opts.fps, loop: clip?.loop ?? true, frames: Array.from({ length: n }, (_, i) => i) }];
  }
  const out = opts.clips
    .map((c) => ({ name: unique(c.name), fps: opts.fps, loop: c.loop, frames: clipFrames(c) }))
    .filter((a) => a.frames.length);
  if (out.length) return out;
  return [{ name: unique('default'), fps: opts.fps, loop: true, frames: Array.from({ length: n }, (_, i) => i) }];
}

/** An animation's frames as cell indexes, runs of the same cell merged into one entry with a duration in frames. */
export function animationRuns(anim: Animation, cellOfFrame: number[]): { cell: number; frames: number }[] {
  const out: { cell: number; frames: number }[] = [];
  for (const f of anim.frames) {
    const cell = cellOfFrame[f];
    const last = out[out.length - 1];
    if (last && last.cell === cell) last.frames++;
    else out.push({ cell, frames: 1 });
  }
  return out;
}

// ---------------------------------------------------------------- JSON atlas

export interface AtlasInput {
  image: string;
  layout: Layout;
  cells: Cell[];
  cellOfFrame: number[];
  animations: Animation[];
  fps: number;
  scale: number;
  frameCount: number;
}

/** A generic atlas any engine or script can read: where each frame is on the picture, and how the animations use them. */
export function buildAtlas(a: AtlasInput) {
  return {
    meta: { app: 'Frameling', format: 'frameling-atlas', version: 1, image: a.image, size: { w: a.layout.width, h: a.layout.height }, scale: a.scale, fps: a.fps, frameCount: a.frameCount },
    frames: a.cells.map((c, i) => ({
      index: i,
      frame: { x: a.layout.positions[i].x, y: a.layout.positions[i].y, w: c.image.width, h: c.image.height },
      rotated: false,
      trimmed: c.image.width !== c.source.w || c.image.height !== c.source.h,
      spriteSourceSize: { ...c.trim },
      sourceSize: { w: c.source.w, h: c.source.h },
      duration: Math.round((c.held * 1000) / a.fps),
    })),
    animations: Object.fromEntries(
      a.animations.map((an) => [an.name, { fps: an.fps, loop: an.loop, frames: an.frames.map((f) => a.cellOfFrame[f]) }]),
    ),
  };
}

// ---------------------------------------------------------------- Godot

const gdString = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';
const gdFloat = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n * 10000) / 10000));

/** Where the sheet's picture will live in a Godot project. */
export function godotTexturePath(custom: string, docName: string): string {
  const c = custom.trim().replace(/\\/g, '/');
  if (!c) return `res://sprites/${slug(docName)}.png`;
  return c.startsWith('res://') ? c : 'res://' + c.replace(/^\/+/, '');
}

/** The .tres path next to the picture. */
export function godotResourcePath(texturePath: string): string {
  return texturePath.replace(/\.[^./]+$/, '') + '.tres';
}

export interface GodotInput {
  texturePath: string;
  layout: Layout;
  cells: Cell[];
  cellOfFrame: number[];
  animations: Animation[];
}

/** A Godot 4 SpriteFrames resource: every frame is an AtlasTexture cut from the sheet, every animation lists them. */
export function godotSpriteFrames(g: GodotInput): string {
  // Only cells some animation actually shows need a texture.
  const runs = g.animations.map((a) => animationRuns(a, g.cellOfFrame));
  const used = [...new Set(runs.flat().map((r) => r.cell))].sort((a, b) => a - b);
  const subId = (cell: number) => `AtlasTexture_${cell}`;
  const out: string[] = [];
  out.push(`[gd_resource type="SpriteFrames" load_steps=${used.length + 2} format=3]`, '');
  out.push(`[ext_resource type="Texture2D" path=${gdString(g.texturePath)} id="1_sheet"]`, '');
  for (const cell of used) {
    const c = g.cells[cell];
    const at = g.layout.positions[cell];
    out.push(`[sub_resource type="AtlasTexture" id="${subId(cell)}"]`);
    out.push('atlas = ExtResource("1_sheet")');
    out.push(`region = Rect2(${at.x}, ${at.y}, ${c.image.width}, ${c.image.height})`);
    // A trimmed frame is told how much was cut off, so it still sits where it was drawn.
    if (c.image.width !== c.source.w || c.image.height !== c.source.h) out.push(`margin = Rect2(${c.trim.x}, ${c.trim.y}, ${c.source.w - c.image.width}, ${c.source.h - c.image.height})`);
    out.push('filter_clip = true', '');
  }
  out.push('[resource]');
  const anims = g.animations.map((a, ai) => {
    const frames = runs[ai].map((r) => `{\n"duration": ${gdFloat(r.frames)},\n"texture": SubResource("${subId(r.cell)}")\n}`).join(', ');
    return `{\n"frames": [${frames}],\n"loop": ${a.loop},\n"name": &${gdString(a.name)},\n"speed": ${gdFloat(a.fps)}\n}`;
  });
  out.push(`animations = [${anims.join(', ')}]`, '');
  return out.join('\n');
}

/** A small scene with an AnimatedSprite2D that is ready to drop into a Godot project. */
export function godotScene(o: { resourcePath: string; nodeName: string; animation: string }): string {
  const name = o.nodeName.replace(/[^A-Za-z0-9_ -]/g, '').trim() || 'Sprite';
  return [
    '[gd_scene load_steps=2 format=3]',
    '',
    `[ext_resource type="SpriteFrames" path=${gdString(o.resourcePath)} id="1_frames"]`,
    '',
    `[node name=${gdString(name)} type="AnimatedSprite2D"]`,
    'sprite_frames = ExtResource("1_frames")',
    `animation = &${gdString(o.animation)}`,
    `autoplay = ${gdString(o.animation)}`,
    '',
  ].join('\n');
}

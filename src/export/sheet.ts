// Sprite sheets: trimming, packing frames into a grid, the JSON atlas, and the Godot files. Pure maths and text, so
// it is all tested without a canvas.
import type { Clip, ClipDirection } from '../core/format';
import { bakeFrames, clipDirection, clipPlays, isBackAndForth, stillPositions } from '../core/clipPlay';
import type { RawImage } from '../io/png';
import { slug } from './plan';
import { packSheet } from './pack';

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
  /** Edge pixels repeated around each frame (inside the padding). */
  extrude: number;
  /** Packed tightly rather than on a grid (columns, rows and slot size then mean nothing). */
  packed: boolean;
  /** The whole sheet. */
  width: number;
  height: number;
  /** Top left of each frame's picture (after any extrude). */
  positions: { x: number; y: number }[];
}

export function layoutGrid(opts: { count: number; cellW: number; cellH: number; columns?: number; padding?: number; pot?: boolean; extrude?: number }): Layout {
  const count = Math.max(1, opts.count);
  const padding = Math.max(0, Math.round(opts.padding ?? 0));
  const e = Math.max(0, Math.round(opts.extrude ?? 0));
  const slotW = opts.cellW + 2 * e;
  const slotH = opts.cellH + 2 * e;
  const columns = opts.columns && opts.columns > 0 ? Math.min(Math.round(opts.columns), count) : autoColumns(count, slotW + padding, slotH + padding);
  const rows = Math.ceil(count / columns);
  let width = columns * slotW + (columns + 1) * padding;
  let height = rows * slotH + (rows + 1) * padding;
  if (opts.pot) {
    width = nextPow2(width);
    height = nextPow2(height);
  }
  const positions = Array.from({ length: count }, (_, i) => ({
    x: padding + (i % columns) * (slotW + padding) + e,
    y: padding + Math.floor(i / columns) * (slotH + padding) + e,
  }));
  return { columns, rows, cellW: opts.cellW, cellH: opts.cellH, padding, extrude: e, packed: false, width, height, positions };
}

/** The layout for a set of cells: the slot is as big as the biggest cell. */
export function layoutCells(cells: Cell[], o: { columns?: number; padding?: number; pot?: boolean; extrude?: number }): Layout {
  const cellW = Math.max(1, ...cells.map((c) => c.image.width));
  const cellH = Math.max(1, ...cells.map((c) => c.image.height));
  return layoutGrid({ count: cells.length, cellW, cellH, ...o });
}

/**
 * Packs cells of different sizes tightly (best with trimming on). Padding goes around every frame and the sheet's
 * edge, the same as on a grid. Null when they can't fit inside `maxSide`.
 */
export function layoutPacked(cells: Cell[], o: { padding?: number; pot?: boolean; extrude?: number; maxSide: number }): Layout | null {
  const padding = Math.max(0, Math.round(o.padding ?? 0));
  const e = Math.max(0, Math.round(o.extrude ?? 0));
  const items = cells.map((c) => ({ w: c.image.width + 2 * e + padding, h: c.image.height + 2 * e + padding }));
  // The far edge's padding comes from each item; the near edge gets one more strip.
  const packed = packSheet(items, { maxSide: o.maxSide - padding, pot: o.pot && padding === 0 });
  if (!packed) return null;
  let width = packed.width + padding;
  let height = packed.height + padding;
  if (o.pot) {
    width = nextPow2(width);
    height = nextPow2(height);
  }
  const positions = packed.positions.map((p) => ({ x: padding + p.x + e, y: padding + p.y + e }));
  const cellW = Math.max(1, ...cells.map((c) => c.image.width));
  const cellH = Math.max(1, ...cells.map((c) => c.image.height));
  return { columns: 0, rows: 0, cellW, cellH, padding, extrude: e, packed: true, width, height, positions };
}

/** Paints the cells onto one transparent picture, with each frame's edge repeated outward when the layout extrudes. */
export function composeSheet(cells: Cell[], layout: Layout): RawImage {
  const W = layout.width;
  const pixels = new Uint8ClampedArray(W * layout.height * 4);
  const e = layout.extrude ?? 0;
  cells.forEach((c, i) => {
    const at = layout.positions[i];
    const { width: w, height: h } = c.image;
    for (let y = 0; y < h; y++) {
      const from = y * w * 4;
      pixels.set(c.image.pixels.subarray(from, from + w * 4), ((at.y + y) * W + at.x) * 4);
    }
    if (!e) return;
    // Each pixel of the ring copies the nearest edge pixel of the frame.
    for (let y = -e; y < h + e; y++) {
      const sy = Math.min(h - 1, Math.max(0, y));
      for (let x = -e; x < w + e; x++) {
        if (y >= 0 && y < h && x >= 0 && x < w) continue;
        const sx = Math.min(w - 1, Math.max(0, x));
        const from = (sy * w + sx) * 4;
        pixels.set(c.image.pixels.subarray(from, from + 4), ((at.y + y) * W + at.x + x) * 4);
      }
    }
  });
  return { width: W, height: layout.height, pixels };
}

// ---------------------------------------------------------------- animations

export interface Animation {
  name: string;
  fps: number;
  loop: boolean;
  /**
   * Document frames in the order they play, as indexes into the exported range: the clip's direction and repeat
   * are already in it (one pass when it loops, every pass when it plays N times), so a player that knows nothing
   * about directions just plays the list.
   */
  frames: number[];
  /** What the clip says (missing = forward, once), for engines that can say it themselves. */
  direction?: ClipDirection;
  /** How many times it plays when it does not loop. */
  repeat?: number;
  /** One pass, in the order it plays (missing = `frames`). Phaser repeats this itself. */
  pass?: number[];
  /** The clip's frames in the order it was made (missing = `frames`), which is what names its pictures. */
  clip?: number[];
  /**
   * For a back and forth clip an engine could bounce by itself: `leg` is one direction of it (the way it starts),
   * `trips` how many times it goes there and back (Infinity when it loops). Missing when it cannot (an odd count of
   * directions ends half way round a trip). Engines use it only when asked to (the "Back-and-forth clips in game engines"
   * preference); `frames` already holds the baked order for everyone else.
   */
  bounce?: { leg: number[]; trips: number };
}

/** Puts a clip's frames in order and says what is left to say: only what differs from forward, once, is added. */
export function playing(frames: number[], c: { loop: boolean; direction?: ClipDirection; repeat?: number } | undefined): Pick<Animation, 'frames' | 'direction' | 'repeat' | 'pass' | 'clip' | 'bounce'> {
  if (!c) return { frames };
  const dir = clipDirection(c);
  const plays = clipPlays(c);
  if (dir === 'forward' && (plays === 1 || plays === Infinity)) return { frames };
  const out: Pick<Animation, 'frames' | 'direction' | 'repeat' | 'pass' | 'clip' | 'bounce'> = { frames: bakeFrames(frames, dir, plays), clip: frames };
  if (isBackAndForth(dir) && frames.length > 1 && (plays === Infinity || (plays > 1 && plays % 2 === 0))) {
    out.bounce = { leg: stillPositions(frames.length, dir).map((p) => frames[p]), trips: plays === Infinity ? Infinity : plays / 2 };
  }
  if (dir !== 'forward') out.direction = dir;
  if (plays !== Infinity && plays > 1) out.repeat = plays;
  if (plays !== Infinity) out.pass = bakeFrames(frames, dir, Infinity);
  return out;
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
    return [{ name: unique(clip?.name ?? 'default'), fps: opts.fps, loop: clip?.loop ?? true, ...playing(Array.from({ length: n }, (_, i) => i), clip) }];
  }
  const out = opts.clips
    .map((c) => ({ name: unique(c.name), fps: opts.fps, loop: c.loop, ...playing(clipFrames(c), c) }))
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
  /** A name per cell. With names, each frame also gets a `filename`. */
  names?: string[];
  /** `hash` keys frames by name (and animations list names); `array` lists them in order (animations list indexes). */
  style?: 'array' | 'hash';
}

/** One frame's entry in the common JSON atlas shape. */
export function atlasFrame(c: Cell, at: { x: number; y: number }) {
  return {
    frame: { x: at.x, y: at.y, w: c.image.width, h: c.image.height },
    rotated: false,
    trimmed: c.image.width !== c.source.w || c.image.height !== c.source.h,
    spriteSourceSize: { ...c.trim },
    sourceSize: { w: c.source.w, h: c.source.h },
  };
}

/** The direction and repeat count a clip has, when it has them. `frames` already follows them. */
const extras = (a: Animation): { direction?: ClipDirection; repeat?: number } => ({ ...(a.direction ? { direction: a.direction } : {}), ...(a.repeat ? { repeat: a.repeat } : {}) });

/** A generic atlas any engine or script can read: where each frame is on the picture, and how the animations use them. */
export function buildAtlas(a: AtlasInput) {
  const meta = { app: 'Frameling', format: 'frameling-atlas', version: 1, image: a.image, size: { w: a.layout.width, h: a.layout.height }, scale: a.scale, fps: a.fps, frameCount: a.frameCount };
  const duration = (c: Cell) => Math.round((c.held * 1000) / a.fps);
  if (a.style === 'hash' && a.names) {
    const names = a.names;
    return {
      meta,
      frames: Object.fromEntries(a.cells.map((c, i) => [names[i], { ...atlasFrame(c, a.layout.positions[i]), duration: duration(c) }])),
      animations: Object.fromEntries(a.animations.map((an) => [an.name, { fps: an.fps, loop: an.loop, ...extras(an), frames: an.frames.map((f) => names[a.cellOfFrame[f]]) }])),
    };
  }
  return {
    meta,
    frames: a.cells.map((c, i) => ({
      index: i,
      ...(a.names ? { filename: a.names[i] } : {}),
      ...atlasFrame(c, a.layout.positions[i]),
      duration: duration(c),
    })),
    animations: Object.fromEntries(
      a.animations.map((an) => [an.name, { fps: an.fps, loop: an.loop, ...extras(an), frames: an.frames.map((f) => a.cellOfFrame[f]) }]),
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
  /** Let Godot bounce a back and forth clip that loops itself (loop mode 2): one direction is listed and the ends show twice. */
  nativeBounce?: boolean;
}

/** An animation as the engine plays it: with its own bounce, just one direction of a looping back and forth clip. */
export const withNativeBounce = (a: Animation, on: boolean | undefined): { anim: Animation; bounces: boolean } =>
  on && a.loop && a.bounce?.trips === Infinity ? { anim: { ...a, frames: a.bounce.leg }, bounces: true } : { anim: a, bounces: false };

/** A Godot 4 SpriteFrames resource: every frame is an AtlasTexture cut from the sheet, every animation lists them. */
export function godotSpriteFrames(g: GodotInput): string {
  const chosen = g.animations.map((a) => withNativeBounce(a, g.nativeBounce));
  // Only cells some animation actually shows need a texture.
  const runs = chosen.map((c) => animationRuns(c.anim, g.cellOfFrame));
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
  const anims = chosen.map(({ anim: a, bounces }, ai) => {
    const frames = runs[ai].map((r) => `{\n"duration": ${gdFloat(r.frames)},\n"texture": SubResource("${subId(r.cell)}")\n}`).join(', ');
    return `{\n"frames": [${frames}],\n"loop": ${bounces ? 2 : a.loop},\n"name": &${gdString(a.name)},\n"speed": ${gdFloat(a.fps)}\n}`;
  });
  out.push(`animations = [${anims.join(', ')}]`, '');
  return out.join('\n');
}

/** A small scene with an AnimatedSprite2D that is ready to drop into a Godot project. */
export function godotScene(o: { resourcePath: string; nodeName: string; animation: string; pixelArt?: boolean }): string {
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
    // Nearest-neighbour, so pixel art stays crisp without touching the project settings.
    ...(o.pixelArt ? ['texture_filter = 1'] : []),
    '',
  ].join('\n');
}

// From a picture and the choices about it to a pixel sprite: the frames (cut by a grid, by gutters, by a JSON or taken as
// they are from a GIF), then a new document or layers and boards added to the open one, in one of the four ways
// (src/pixel/way.ts). Pure data in and out, no DOM, so it is all tested.
import type { Draft } from 'immer';
import { MAX_FRAMES, planTiming } from '../../aseprite/convert';
import { newDoc, newPixelLayer, uid } from '../../core/doc';
import type { Clip, Doc, DocPalette, PixelDrawing, PixelLayer, Slice, SliceKey, SpriteWay } from '../../core/format';
import { addArtboard, artboardsOf, ensureArtboards } from '../../artboards/model';
import { trimPixels } from '../../core/pixelBounds';
import type { RawImage } from '../../io/png';
import { paletteFromPixels } from '../palette-io';
import { docPalette } from '../palette';
import type { Picture } from './picture';
import { autoCells, cutCell, gridCells, isBlank, onEqualFrames, orderCells, unrotate, type Align, type AutoSpec, type Cell, type CellOrder, type GridSpec } from './slicing';
import type { SheetData, SheetSlice, SheetTag } from './sheetJson';

export type Cutting = { how: 'whole' } | { how: 'grid'; grid: GridSpec } | { how: 'auto'; auto: AutoSpec } | { how: 'json'; data: SheetData };

export interface CutOptions {
  cutting: Cutting;
  order: CellOrder;
  align: Align;
  /** Leave out cells with nothing in them (the empty end of a grid). */
  skipBlank: boolean;
}

export const defaultCut = (): CutOptions => ({ cutting: { how: 'whole' }, order: 'rows', align: 'bottom', skipBlank: true });

export interface SpriteFrame {
  image: RawImage;
  /** Milliseconds, when the file says. */
  delay?: number;
  name?: string;
  /** The row of the picture it came from. */
  row: number;
}

/** The result of cutting: equal-sized frames, and what came along with them. */
export interface Sprite {
  width: number;
  height: number;
  frames: SpriteFrame[];
  tags: SheetTag[];
  slices: SheetSlice[];
  /** Frame numbers grouped by the row (or tag) they came from, for "a sprite for each row". */
  groups: { name: string; frames: number[] }[];
  notes: string[];
}

const MAX_SIDE = 4096;

/** Cuts a picture into the frames of a sprite. A GIF's frames are taken as they are. */
export function cutPicture(pic: Picture, o: CutOptions): Sprite {
  const notes = [...pic.notes];
  if (pic.width > MAX_SIDE || pic.height > MAX_SIDE) notes.push(`The picture is ${pic.width} x ${pic.height}, which is very big for pixel art.`);
  const whole = (): Sprite => {
    const frames: SpriteFrame[] = pic.frames.map((f, i) => ({ image: { width: pic.width, height: pic.height, pixels: f.pixels }, ...(f.delay ? { delay: f.delay } : {}), row: i }));
    return { width: pic.width, height: pic.height, frames, tags: [], slices: [], groups: frames.map((_, i) => ({ name: `Frame ${i + 1}`, frames: [i] })), notes };
  };
  if (o.cutting.how === 'whole' || pic.frames.length > 1) return whole();

  const img: RawImage = { width: pic.width, height: pic.height, pixels: pic.frames[0].pixels };
  let cells: Cell[];
  let tags: SheetTag[] = [];
  let slices: SheetSlice[] = [];
  if (o.cutting.how === 'json') {
    cells = o.cutting.data.cells.filter((c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= img.width && c.y + c.h <= img.height);
    if (cells.length < o.cutting.data.cells.length) notes.push(`${o.cutting.data.cells.length - cells.length} frames in the JSON are outside this picture and were left out.`);
    tags = o.cutting.data.tags;
    slices = o.cutting.data.slices;
    notes.push(...o.cutting.data.notes);
  } else {
    cells = o.cutting.how === 'grid' ? gridCells(img.width, img.height, o.cutting.grid) : autoCells(img, o.cutting.auto);
    cells = orderCells(cells, o.order);
  }
  if (!cells.length) return { ...whole(), frames: [], groups: [], width: img.width, height: img.height, notes: [...notes, 'No cells to cut with these settings.'] };

  let pieces = cells.map((c) => {
    const cut = cutCell(img, c);
    return c.rotated ? unrotate(cut) : cut;
  });
  const keep: number[] = [];
  pieces.forEach((p, i) => {
    if (!(o.skipBlank && o.cutting.how !== 'json' && isBlank(p))) keep.push(i);
  });
  if (keep.length < cells.length) {
    const dropped = cells.length - keep.length;
    notes.push(`${dropped} empty ${dropped === 1 ? 'cell was' : 'cells were'} left out.`);
    // Tags count frames, so they follow the frames that stay.
    const newIndex = new Map(keep.map((k, n) => [k, n]));
    tags = tags
      .map((t) => {
        const inside = keep.filter((k) => k >= t.from && k <= t.to);
        return inside.length ? { ...t, from: newIndex.get(inside[0])!, to: newIndex.get(inside[inside.length - 1])! } : null;
      })
      .filter((t): t is SheetTag => !!t);
    cells = keep.map((k) => cells[k]);
    pieces = keep.map((k) => pieces[k]);
  }

  // Frames cut down by a packing tool go back on the full frame they came from.
  const sourced = cells.some((c) => c.source);
  let frames: RawImage[];
  let width: number;
  let height: number;
  if (sourced) {
    width = Math.max(1, ...cells.map((c, i) => c.source?.w ?? pieces[i].width));
    height = Math.max(1, ...cells.map((c, i) => c.source?.h ?? pieces[i].height));
    frames = pieces.map((p, i) => placeAt(p, width, height, cells[i].offset ?? { x: 0, y: 0 }));
  } else {
    const sizes = new Set(pieces.map((p) => `${p.width}x${p.height}`));
    if (sizes.size > 1) notes.push(`The cells are not all the same size, so smaller ones sit on a frame as big as the biggest (${o.align === 'bottom' ? 'bottom middle' : o.align === 'centre' ? 'middle' : 'top left'}).`);
    frames = onEqualFrames(pieces, o.align);
    width = frames[0].width;
    height = frames[0].height;
  }

  const sprite: Sprite = {
    width,
    height,
    frames: frames.map((image, i) => ({ image, row: cells[i].row, ...(cells[i].delay ? { delay: cells[i].delay } : {}), ...(cells[i].name ? { name: cells[i].name } : {}) })),
    tags,
    slices,
    groups: [],
    notes,
  };
  sprite.groups = groupsOf(sprite, o.cutting.how === 'json');
  return sprite;
}

function placeAt(img: RawImage, w: number, h: number, at: { x: number; y: number }): RawImage {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < img.height; y++) {
    const ty = y + at.y;
    if (ty < 0 || ty >= h) continue;
    for (let x = 0; x < img.width; x++) {
      const tx = x + at.x;
      if (tx < 0 || tx >= w) continue;
      out.set(img.pixels.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (ty * w + tx) * 4);
    }
  }
  return { width: w, height: h, pixels: out };
}

/** Which frames go together as one sprite: a row of the picture, or an animation the JSON names. */
function groupsOf(s: Sprite, fromJson: boolean): Sprite['groups'] {
  if (fromJson && s.tags.length) {
    const groups: Sprite['groups'] = s.tags.map((t) => ({ name: t.name, frames: Array.from({ length: t.to - t.from + 1 }, (_, i) => t.from + i) }));
    const used = new Set(groups.flatMap((g) => g.frames));
    const rest = s.frames.map((_, i) => i).filter((i) => !used.has(i));
    if (rest.length) groups.push({ name: 'Other frames', frames: rest });
    return groups;
  }
  if (fromJson) return s.frames.map((f, i) => ({ name: f.name ?? `Frame ${i + 1}`, frames: [i] }));
  const rows = new Map<number, number[]>();
  s.frames.forEach((f, i) => rows.set(f.row, [...(rows.get(f.row) ?? []), i]));
  return [...rows.keys()].sort((a, b) => a - b).map((r, n) => ({ name: `Row ${n + 1}`, frames: rows.get(r)! }));
}

// ---------------------------------------------------------------- timing and colours

export const DEFAULT_FPS = 12;

/** How the frames' delays become a frame rate and how long each frame is held. */
export function timingOf(s: Sprite, fixedFps?: number): ReturnType<typeof planTiming> {
  const n = s.frames.length;
  if (!s.frames.some((f) => f.delay)) {
    // No delays at all: one tick each at the chosen rate.
    return { fps: fixedFps ?? DEFAULT_FPS, starts: s.frames.map((_, i) => i), holds: s.frames.map(() => 1), length: Math.max(1, n), off: 0, worst: 0 };
  }
  const fallback = Math.round(1000 / (fixedFps ?? DEFAULT_FPS));
  return planTiming(s.frames.map((f) => f.delay ?? fallback), fixedFps);
}

/** Palette colours of a sprite: every solid colour it uses (up to 256, the most used kept exactly). Null for no colours. */
export function spritePalette(s: Sprite, name: string): DocPalette | null {
  // A long animation has few new colours after the first frames, so a sample of the frames is enough.
  const use = s.frames.length > 64 ? s.frames.filter((_, i) => i % Math.ceil(s.frames.length / 64) === 0) : s.frames;
  const pixels = new Uint8ClampedArray(use.reduce((n, f) => n + f.image.pixels.length, 0));
  let at = 0;
  for (const f of use) {
    pixels.set(f.image.pixels, at);
    at += f.image.pixels.length;
  }
  try {
    return paletteFromPixels(pixels, name, 256);
  } catch {
    return null;
  }
}

/** How many different solid colours the frames use (counting stops at `cap`). */
export function colourCount(s: Sprite, cap = 9999): number {
  const seen = new Set<number>();
  const use = s.frames.length > 64 ? s.frames.filter((_, i) => i % Math.ceil(s.frames.length / 64) === 0) : s.frames;
  for (const f of use) {
    const p = f.image.pixels;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] < 128) continue;
      seen.add((p[i] << 16) | (p[i + 1] << 8) | p[i + 2]);
      if (seen.size >= cap) return cap;
    }
  }
  return seen.size;
}

/** Adds the colours not there yet to a palette, keeping what is there (to 256). */
export function mergePalette(have: DocPalette | undefined, add: DocPalette): DocPalette {
  const colors = have?.colors ?? [];
  const seen = new Set(colors.map((c) => c.toLowerCase()));
  const extra = add.colors.filter((c) => !seen.has(c.toLowerCase()));
  return { ...(have ?? { name: add.name }), colors: [...colors, ...extra].slice(0, 256) };
}

// ---------------------------------------------------------------- building

export interface BuildOptions {
  way: SpriteWay;
  name: string;
  /** Sheet: a sprite for each row (its cells are its frames), or for each cell. */
  rowsAsSprites: boolean;
  /** Put the picture's colours in the palette. */
  palette: boolean;
}

/** A drawing holding only the painted block of a whole-grid picture (what the app keeps in memory and saves). */
export const drawingOf = (doc: Doc, img: RawImage): PixelDrawing => {
  const t = trimPixels(img.pixels, img.width, img.height);
  const d: PixelDrawing = { id: uid('p'), kind: 'pixel', width: t.width, height: t.height, pixels: t.pixels };
  if (t.x) d.x = t.x;
  if (t.y) d.y = t.y;
  doc.drawings[d.id] = d;
  return d;
};

/** Slices land on the layer, so they follow it. The Slice type has ids and optional parts; the sheet's has neither. */
export function slicesOf(list: SheetSlice[], at?: { starts: readonly number[]; from?: number; ox?: number; oy?: number }): Slice[] {
  const ox = at?.ox ?? 0;
  const oy = at?.oy ?? 0;
  // Keys of a sheet's slices are at sheet frames; they go to where those frames start on the timeline (animation only).
  const keysOf = (s: SheetSlice): SliceKey[] | undefined => {
    if (!s.keys?.length || !at?.starts.length) return undefined;
    const out: SliceKey[] = [];
    for (const k of s.keys) {
      const key: SliceKey = { frame: (at.from ?? 0) + at.starts[Math.min(k.frame, at.starts.length - 1)], x: k.x + ox, y: k.y + oy, w: k.w, h: k.h };
      if (k.center) key.center = { ...k.center, x: k.center.x + ox, y: k.center.y + oy };
      if (k.pivot) key.pivot = { x: k.pivot.x + ox, y: k.pivot.y + oy };
      if (out.length && out[out.length - 1].frame === key.frame) out[out.length - 1] = key;
      else out.push(key);
    }
    return out;
  };
  return list.map((s) => ({
    id: uid('sl'),
    name: s.name,
    x: s.x + ox,
    y: s.y + oy,
    w: s.w,
    h: s.h,
    ...(s.center ? { center: { ...s.center, x: s.center.x + ox, y: s.center.y + oy } } : {}),
    ...(s.pivot ? { pivot: { x: s.pivot.x + ox, y: s.pivot.y + oy } } : {}),
    ...(s.color ? { color: s.color } : {}),
    ...(keysOf(s) ? { keys: keysOf(s) } : {}),
  }));
}

/** Lays frames on a layer, one cel each, holding each for its `holds`. Equal neighbours share a drawing. */
function layFrames(doc: Doc, layer: PixelLayer, frames: SpriteFrame[], starts: number[], holds: number[], from: number, canvas: { w: number; h: number }, place: (img: RawImage) => RawImage): void {
  let prev: PixelDrawing | null = null;
  let prevImg: RawImage | null = null;
  frames.forEach((f, i) => {
    const img = place(f.image);
    let d: PixelDrawing;
    if (prev && prevImg && sameImage(prevImg, img)) d = prev;
    else d = drawingOf(doc, { width: canvas.w, height: canvas.h, pixels: img.pixels });
    const start = from + starts[i];
    const last = layer.cels[layer.cels.length - 1];
    if (last && last.drawingId === d.id && last.start + last.length === start) last.length += holds[i];
    else layer.cels.push({ id: uid('c'), start, length: holds[i], drawingId: d.id });
    prev = d;
    prevImg = img;
  });
}

function sameImage(a: RawImage, b: RawImage): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  const p = a.pixels;
  const q = b.pixels;
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
  return true;
}

const clipOf = (name: string, start: number, end: number, loop = true, extra: Partial<Clip> = {}): Clip => ({ id: uid('k'), name, start, end, loop, ...extra });

/** Clips for the tags of a sprite laid on a timeline from `from`. */
function tagClips(s: Sprite, starts: number[], holds: number[], from: number): Clip[] {
  return s.tags.map((t) =>
    clipOf(t.name, from + starts[t.from], from + starts[t.to] + holds[t.to] - 1, t.loop, { ...(t.direction ? { direction: t.direction } : {}), ...(t.repeat ? { repeat: t.repeat } : {}) }),
  );
}

const nameFor = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim().slice(0, 80);

/** One frame's worth of a board: its own layer, drawings and a clip when it has several frames. */
function boardContent(doc: Doc, s: Sprite, ids: number[], label: string, withClip: boolean, fps: number): { content: NonNullable<ReturnType<typeof artboardsOf>[number]['content']>; length: number } {
  const layer = newPixelLayer('Sprite', 1);
  const frames = ids.map((i) => s.frames[i]);
  const t = timingOf({ ...s, frames }, fps);
  const holds = frames.length > 1 && withClip ? t.holds : frames.map(() => 1);
  const starts = holds.map((_, i) => holds.slice(0, i).reduce((a, b) => a + b, 0));
  const length = Math.max(1, holds.reduce((a, b) => a + b, 0));
  layFrames(doc, layer, frames, starts, holds, 0, { w: s.width, h: s.height }, (x) => x);
  const clips = withClip && frames.length > 1 ? [clipOf(nameFor(label) || 'idle', 0, length - 1)] : [];
  return { content: { width: s.width, height: s.height, background: null, length, layers: [layer], clips, markers: [] }, length };
}

/** A new document: the sprite in one of the four ways. */
export function spriteDoc(s: Sprite, o: BuildOptions): { doc: Doc; notes: string[] } {
  const notes = [...s.notes];
  if (!s.frames.length) throw new Error('There is nothing to import.');
  const way = o.way;
  const timing = timingOf(s);
  const doc = newDoc({ name: o.name, width: s.width, height: s.height, fps: timing.fps, length: 1, background: null, pixel: { pixelSize: 1 } });
  const layer = doc.layers[0] as PixelLayer;
  layer.name = 'Sprite';
  doc.sprite = { way };
  if (way === 'picture') {
    layFrames(doc, layer, s.frames.slice(0, 1), [0], [1], 0, { w: s.width, h: s.height }, (x) => x);
    doc.length = 1;
    if (s.frames.length > 1) notes.push('Only the first picture was used.');
  } else if (way === 'animation') {
    layFrames(doc, layer, s.frames, timing.starts, timing.holds, 0, { w: s.width, h: s.height }, (x) => x);
    doc.length = Math.max(1, timing.length);
    doc.clips = tagClips(s, timing.starts, timing.holds, 0);
    if (!doc.clips.length && s.frames.length > 1) doc.clips = [clipOf('idle', 0, doc.length - 1)];
  } else if (way === 'boards') {
    const list = ensureArtboards(doc);
    // Boards play one frame each, so the frame rate is the one that fits the delays best.
    const first = boardContent(doc, s, [0], 'Frame 1', false, timing.fps);
    doc.layers = first.content.layers;
    list[0].name = 'Frame 1';
    for (let i = 1; i < s.frames.length; i++) {
      const id = addArtboard(doc, { name: `Frame ${i + 1}`, width: s.width, height: s.height, length: 1, background: null });
      const a = artboardsOf(doc).find((b) => b.id === id)!;
      a.content = boardContent(doc, s, [i], `Frame ${i + 1}`, false, timing.fps).content;
    }
    doc.length = 1;
    doc.clips = [];
  } else {
    const groups = o.rowsAsSprites ? s.groups : s.frames.map((f, i) => ({ name: f.name ?? `Sprite ${i + 1}`, frames: [i] }));
    const list = ensureArtboards(doc);
    const names = groups.map((g, i) => nameFor(g.name) || `Sprite ${i + 1}`);
    groups.forEach((g, i) => {
      const made = boardContent(doc, s, g.frames, names[i], true, timing.fps);
      if (i === 0) {
        doc.layers = made.content.layers;
        doc.length = made.length;
        doc.clips = made.content.clips;
        list[0].name = names[0];
      } else {
        const id = addArtboard(doc, { name: names[i], width: s.width, height: s.height, length: made.length, background: null });
        const a = artboardsOf(doc).find((b) => b.id === id)!;
        a.content = made.content;
      }
    });
  }
  // Slices go on the first board's layer.
  if (s.slices.length) (doc.layers.find((l) => l.kind === 'pixel') as PixelLayer | undefined)!.slices = slicesOf(s.slices, way === 'animation' ? { starts: timing.starts } : undefined);
  if (o.palette) {
    const p = spritePalette(s, o.name);
    if (p) doc.palette = p;
  }
  if (doc.length > MAX_FRAMES) doc.length = MAX_FRAMES;
  return { doc, notes };
}

/**
 * Adds a sprite to an open document (a draft): `picture` and `animation` make a new layer on the open board from
 * frame `from`, `boards` and `sheet` add boards. Pixels that fall outside the stage are cut off. Returns what to tell.
 */
export function spriteInto(d: Draft<Doc>, s: Sprite, o: BuildOptions, from = 0): string[] {
  const notes = [...s.notes];
  const doc = d as Doc;
  if (!s.frames.length) return notes;
  const way = o.way;
  if (way === 'boards' || way === 'sheet') {
    const groups = way === 'boards' ? s.frames.map((_, i) => ({ name: `${o.name} ${i + 1}`, frames: [i] })) : o.rowsAsSprites ? s.groups.map((g) => ({ ...g, name: `${o.name} ${g.name}` })) : s.frames.map((f, i) => ({ name: f.name ?? `${o.name} ${i + 1}`, frames: [i] }));
    ensureArtboards(doc);
    for (const g of groups) {
      const made = boardContent(doc, s, g.frames, g.name, way === 'sheet', doc.fps);
      const id = addArtboard(doc, { name: nameFor(g.name), width: s.width, height: s.height, length: made.length, background: null });
      artboardsOf(doc).find((b) => b.id === id)!.content = made.content;
    }
    if (s.slices.length) notes.push('Slices were not added to the new boards.');
    return notes;
  }
  const px = doc.layers.find((l) => l.kind === 'pixel') as PixelLayer | undefined;
  const ps = px?.pixelSize ?? 1;
  const cw = Math.max(1, Math.round(doc.width / ps));
  const ch = Math.max(1, Math.round(doc.height / ps));
  const layer = newPixelLayer(nameFor(o.name) || 'Imported', ps);
  const frames = way === 'picture' ? s.frames.slice(0, 1) : s.frames;
  const t = timingOf({ ...s, frames }, doc.fps);
  const holds = way === 'picture' ? [1] : t.holds;
  const starts = way === 'picture' ? [0] : t.starts;
  const place = (img: RawImage) => placeAt(img, cw, ch, { x: Math.floor((cw - img.width) / 2), y: Math.floor((ch - img.height) / 2) });
  layFrames(doc, layer, frames, starts, holds, from, { w: cw, h: ch }, place);
  if (s.width > cw || s.height > ch) notes.push(`The picture is bigger than the stage (${s.width} x ${s.height} against ${cw} x ${ch}), so the edges were cut off.`);
  doc.layers.push(layer);
  const end = from + (starts[starts.length - 1] ?? 0) + (holds[holds.length - 1] ?? 1);
  doc.length = Math.min(MAX_FRAMES, Math.max(doc.length, end));
  if (way === 'animation') doc.clips.push(...tagClips({ ...s, frames }, starts, holds, from));
  if (s.slices.length) {
    const ox = Math.floor((cw - s.width) / 2);
    const oy = Math.floor((ch - s.height) / 2);
    layer.slices = slicesOf(s.slices, { starts: way === 'animation' ? starts : [], from, ox, oy });
  }
  if (o.palette) {
    const p = spritePalette(s, o.name);
    if (p) doc.palette = mergePalette(doc.palette ?? docPalette(doc), p);
  }
  return notes;
}


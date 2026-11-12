/**
 * Variations in the `.frameling` file: the overrides read back with every part checked (a file can be hand-edited or
 * damaged, and an override ends up drawn), and the helpers saving needs. Pure, no DOM.
 *
 * What is written: a variation is `{ id, name, x, y, exportName?, variationOf, overrides }` with no content. Drawings a
 * variation made are ordinary entries in `drawings`; the ones it redrew (pixels, tiles) are saved as `<id>~<variation>`.
 * Everything else about it is worked out from its original when the file opens.
 */
import { LAYER_LABELS, type Artboard, type AudioClip, type DiffRect, type DrawingDiff, type PixelDrawing, type Cel, type Doc, type Drawing, type DrawingOverride, type Id, type Layer, type ListOverride, type Patch, type Shape, type VariationOverrides } from '../core/format';
import { readClip } from '../core/clipPlay';
import { packAudio, unpackAudio } from '../io/audio-file';
import { decodePng } from '../io/png';
import type { Zippable } from 'fflate';
import { activeId, findArtboard, switchArtboard, takeContent } from './model';
import { aliasId, normalize, resolveContent, sourceOf, splitAlias, STAGE_KEYS } from './variations';
import type { ArtboardReaders } from './io';
import { produce } from 'immer';

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const int = (v: unknown, min: number): v is number => num(v) && Number.isInteger(v) && v >= min;
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !BAD.has(x)) : []);

type Check = (v: unknown) => boolean;
const bool: Check = (v) => typeof v === 'boolean';
const str: Check = (v) => typeof v === 'string';
const obj: Check = (v) => isObj(v) || Array.isArray(v);

const LAYER_KEYS: Record<string, Check> = {
  name: str,
  visible: bool,
  locked: bool,
  opacity: (v) => num(v) && v >= 0 && v <= 1,
  onion: bool,
  reference: bool,
  label: (v) => (LAYER_LABELS as readonly unknown[]).includes(v),
  depth: (v) => num(v) && v >= -0.9 && v <= 100,
  blend: str,
  effects: Array.isArray,
  clipToBelow: bool,
  mask: (v) => v === 'show' || v === 'hide',
  folder: str,
  bind: obj,
  pixelSize: (v) => int(v, 1),
  drawMode: (v) => v === 'object' || v === 'merge',
  paletteLock: bool,
  rig: obj,
  ext: obj,
};
const SOUND_KEYS: Record<string, Check> = { name: str, start: (v) => num(v), volume: (v) => num(v) && v >= 0 && v <= 1, muted: bool };
const CEL_KEYS: Record<string, Check> = { start: (v) => int(v, 0), length: (v) => int(v, 1), tween: obj, autoHold: bool, drawingId: str };
const VIEW_KEYS: Record<string, Check> = { x: num, y: num, zoom: (v) => num(v) && v > 0, rotation: num };
const STAGE_CHECKS: Record<string, Check> = {
  width: (v) => int(v, 1) && v <= 16384,
  height: (v) => int(v, 1) && v <= 16384,
  background: (v) => v === null || str(v),
  length: (v) => int(v, 1) && v <= 1_000_000,
  clips: (v) => Array.isArray(v) && v.every((c) => isObj(c) && str(c.id)),
  markers: (v) => Array.isArray(v) && v.every((m) => isObj(m) && str(m.id)),
  flow: obj,
  guides: Array.isArray,
  inOut: (v) => isObj(v) && num(v.start) && num(v.end),
  perspective: (v) => isObj(v) && Array.isArray(v.points),
};

/** A patch with only the allowed keys whose values pass their check (`checks` null allows any key but id and kind). */
function readPatch(raw: unknown, checks: Record<string, Check> | null, skip: readonly string[] = []): Patch | undefined {
  if (!isObj(raw)) return undefined;
  const ok = (k: string) => !BAD.has(k) && !skip.includes(k) && (checks ? k in checks : k !== 'id' && k !== 'kind');
  const set: Record<string, unknown> = {};
  if (isObj(raw.set)) for (const [k, v] of Object.entries(raw.set)) if (ok(k) && (!checks || checks[k](v))) set[k] = v;
  const del = strs(raw.del).filter(ok);
  if (!Object.keys(set).length && !del.length) return undefined;
  return { ...(Object.keys(set).length ? { set } : {}), ...(del.length ? { del } : {}) };
}

type Item<S> = { patch?: Patch; sub?: S };

function readList<T extends { id: Id }, S = never>(raw: unknown, o: { item?: (raw: any) => Item<S> | undefined; added?: (raw: unknown[]) => T[] }): ListOverride<T, S> | undefined {
  if (!isObj(raw)) return undefined;
  const out: ListOverride<T, S> = {};
  if (isObj(raw.items) && o.item) {
    const items: Record<Id, Item<S>> = {};
    for (const [k, v] of Object.entries(raw.items)) {
      if (BAD.has(k) || !isObj(v)) continue;
      const it = o.item(v);
      if (it) items[k] = it;
    }
    if (Object.keys(items).length) out.items = items;
  }
  const removed = strs(raw.removed);
  if (removed.length) out.removed = removed;
  if (Array.isArray(raw.added) && o.added) {
    const added = o.added(raw.added);
    if (added.length) out.added = added;
  }
  const order = strs(raw.order);
  if (Array.isArray(raw.order) && order.length) out.order = order;
  return Object.keys(out).length ? out : undefined;
}

const SHAPE_TYPES = new Set(['stroke', 'fill', 'path', 'instance', 'text', 'particles']);

/**
 * The overrides in a file, checked. `layerKind` says what kind of layer an original layer id is (to read the keys
 * added to it); `readLayers` is the file reader's, so layers made in the variation get the same repairs as any.
 */
export function readOverrides(raw: unknown, r: Pick<ArtboardReaders, 'readLayers' | 'readGuides' | 'readPalette'>, layerKind: (id: Id) => Layer['kind'] | undefined, io?: { entries: Record<string, Uint8Array>; warnings: string[] }): VariationOverrides {
  if (!isObj(raw)) return {};
  const out: VariationOverrides = {};
  const stage = readPatch(raw.stage, STAGE_CHECKS);
  if (stage) {
    const set = stage.set;
    if (set) {
      if (Array.isArray(set.clips)) set.clips = (set.clips as any[]).map((c) => readClip(c));
      if (Array.isArray(set.guides)) {
        const g = r.readGuides(set.guides);
        if (g) set.guides = g;
        else delete set.guides;
      }
    }
    out.stage = stage;
  }
  const readCels = (rawCels: unknown[], kind: Layer['kind']): Cel[] => {
    try {
      return r.readLayers([{ id: 'tmp', name: 'tmp', kind, cels: rawCels }])[0].cels;
    } catch {
      return [];
    }
  };
  const layers = readList<Layer, ListOverride<Cel>>(raw.layers, {
    item: (v) => {
      const patch = readPatch(v.patch, LAYER_KEYS);
      const sub = readList<Cel>(v.sub, { item: (c) => ({ patch: readPatch(c.patch, CEL_KEYS) }), added: () => [] });
      return patch || sub ? { ...(patch ? { patch } : {}), ...(sub ? { sub } : {}) } : undefined;
    },
    added: (rawLayers) => {
      const ok = rawLayers.filter((l) => isObj(l) && typeof l.id === 'string' && !BAD.has(l.id));
      try {
        return r.readLayers(ok);
      } catch {
        return [];
      }
    },
  });
  if (layers) {
    // Keys added to an original layer need that layer's kind to be read.
    for (const [lid, it] of Object.entries(layers.items ?? {})) {
      const rawIt = (raw.layers as any)?.items?.[lid];
      const kind = layerKind(lid);
      const added = isObj(rawIt?.sub) && Array.isArray(rawIt.sub.added) && kind ? readCels(rawIt.sub.added, kind) : [];
      if (added.length) {
        it.sub = { ...(it.sub ?? {}), added };
      }
    }
    out.layers = layers;
  }
  if (isObj(raw.drawings)) {
    const drawings: Record<Id, DrawingOverride> = {};
    for (const [k, v] of Object.entries(raw.drawings)) {
      if (BAD.has(k) || !isObj(v)) continue;
      const d: DrawingOverride = {};
      if (v.replaced === true) d.replaced = true;
      const diff = d.replaced && io ? readDiff(v.diff, io) : undefined;
      if (diff) d.diff = diff;
      const patch = readPatch(v.patch, null, ['shapes', 'view']);
      if (patch) d.patch = patch;
      const view = readPatch(v.view, VIEW_KEYS);
      if (view) d.view = view;
      const shapes = readList<Shape>(v.shapes, {
        item: (s) => {
          const p = readPatch(s.patch, null, ['type']);
          return p ? { patch: p } : undefined;
        },
        added: (list) => list.filter((s): s is Shape => isObj(s) && typeof s.id === 'string' && SHAPE_TYPES.has(s.type) && !BAD.has(s.id)),
      });
      if (shapes) d.shapes = shapes;
      if (Object.keys(d).length) drawings[k] = d;
    }
    if (Object.keys(drawings).length) out.drawings = drawings;
  }
  if (isObj(raw.audio)) {
    const audio = readList<AudioClip>(raw.audio, {
      item: (c) => {
        const p = readPatch(c.patch, SOUND_KEYS);
        return p ? { patch: p } : undefined;
      },
      added: (list) => (io ? (unpackAudio(list, io.entries, io.warnings) ?? []) : []),
    });
    if (audio) out.audio = audio;
  }
  const pal = r.readPalette?.(raw.palette)?.palette;
  if (pal?.colors.length) out.palette = pal;
  return normalize(out);
}

const BIG = 1 << 24;

/** Most rectangles one stored change can have (a file asking for more is cut there). */
const MAX_READ_RECTS = 64;

/** One stored rectangle, checked: its PNG decoded. Null when it cannot be read. */
function readRect(r: unknown, io: { entries: Record<string, Uint8Array> }): DiffRect | null {
  if (!(isObj(r) && int(r.x, 0) && int(r.y, 0) && int(r.w, 0) && int(r.h, 0) && r.x < BIG && r.y < BIG && r.w < BIG && r.h < BIG)) return null;
  if (r.w === 0 || r.h === 0) return { x: r.x, y: r.y, w: 0, h: 0, pixels: new Uint8ClampedArray(0) };
  if (typeof r.pixels === 'string' && /^pixels\/[A-Za-z0-9_-]+\.png$/.test(r.pixels) && io.entries[r.pixels]) {
    try {
      const img = decodePng(io.entries[r.pixels]);
      if (img.width === r.w && img.height === r.h) return { x: r.x, y: r.y, w: r.w, h: r.h, pixels: img.pixels };
    } catch {
      // Left out, with a warning from the caller.
    }
  }
  return null;
}

/** A redrawn drawing's stored changes, checked: the rectangles' PNGs decoded, the tile pairs as whole numbers. */
function readDiff(raw: unknown, io: { entries: Record<string, Uint8Array>; warnings: string[] }): DrawingDiff | undefined {
  if (!isObj(raw)) return undefined;
  const out: DrawingDiff = {};
  if (raw.rect !== undefined) {
    const r = readRect(raw.rect, io);
    if (r) out.rect = r;
    else io.warnings.push('A variation has a changed picture that could not be read, so it shows the original there.');
  }
  if (Array.isArray(raw.rects)) {
    const rects = raw.rects.slice(0, MAX_READ_RECTS).map((r) => readRect(r, io));
    const good = rects.filter((r): r is DiffRect => !!r);
    if (good.length) out.rects = good;
    if (good.length < raw.rects.length) io.warnings.push('A variation has a changed picture that could not be read, so it shows the original there.');
  }
  if (Array.isArray(raw.cells) && raw.cells.length % 2 === 0 && raw.cells.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0)) out.cells = raw.cells as number[];
  return out.rect || out.rects || out.cells ? out : undefined;
}

/** The part of a pixel drawing that differs from another of the same size: its bounding rectangle, or null when they are the same. */
export function changedRect(a: PixelDrawing, b: PixelDrawing): { x: number; y: number; w: number; h: number } | null {
  if (a.width !== b.width || a.height !== b.height) return null;
  const { width: W, height: H } = a;
  const p = a.pixels;
  const q = b.pixels;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      const i = row + x * 4;
      if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2] || p[i + 3] !== q[i + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Most rectangles one drawing's change is split into. */
export const MAX_DIFF_RECTS = 8;
/** What one more rectangle costs in a file (a zip entry and PNG headers), in pixels of RGBA data: nearer ones are joined. */
const RECT_COST = 400;
const BLOCK = 8;
/** Beyond this many separate spots the change is scattered like noise, and one rectangle is as good as any. */
const MAX_SPOTS = 200;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const boxArea = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0);
const joined = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

/**
 * The parts of a pixel drawing that differ from another of the same size, as a few rectangles: changes close together
 * share one, far apart ones get their own (two distant edits stay small instead of spanning everything between them).
 * Rectangles are joined while that costs less than another entry in a file, and until there are at most `max`.
 * Empty when they are the same, null when the sizes differ.
 */
export function changedRects(a: PixelDrawing, b: PixelDrawing, max = MAX_DIFF_RECTS): { x: number; y: number; w: number; h: number }[] | null {
  if (a.width !== b.width || a.height !== b.height) return null;
  const { width: W, height: H } = a;
  const p = a.pixels;
  const q = b.pixels;
  const bw = Math.ceil(W / BLOCK);
  const bh = Math.ceil(H / BLOCK);
  // The tight box of the changes in each block of the picture.
  const cell: (Box | undefined)[] = new Array(bw * bh);
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      const i = row + x * 4;
      if (p[i] === q[i] && p[i + 1] === q[i + 1] && p[i + 2] === q[i + 2] && p[i + 3] === q[i + 3]) continue;
      const k = ((y / BLOCK) | 0) * bw + ((x / BLOCK) | 0);
      const c = cell[k];
      if (!c) cell[k] = { x0: x, y0: y, x1: x + 1, y1: y + 1 };
      else {
        if (x < c.x0) c.x0 = x;
        if (x + 1 > c.x1) c.x1 = x + 1;
        if (y + 1 > c.y1) c.y1 = y + 1;
      }
    }
  }
  // Blocks that touch (corners too) are one spot.
  const spot = new Int32Array(bw * bh).fill(-1);
  const boxes: Box[] = [];
  for (let k0 = 0; k0 < cell.length; k0++) {
    if (!cell[k0] || spot[k0] >= 0) continue;
    const id = boxes.length;
    let box = cell[k0]!;
    spot[k0] = id;
    const stack = [k0];
    while (stack.length) {
      const k = stack.pop()!;
      const bx = k % bw;
      const by = (k / bw) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = bx + dx;
          const ny = by + dy;
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const n = ny * bw + nx;
          if (!cell[n] || spot[n] >= 0) continue;
          spot[n] = id;
          box = joined(box, cell[n]!);
          stack.push(n);
        }
    }
    boxes.push(box);
  }
  if (!boxes.length) return [];
  let list = boxes;
  if (list.length > MAX_SPOTS) list = [list.reduce(joined)];
  // Join the pair that wastes least, while that is cheaper than a rectangle of its own, or while there are too many.
  for (;;) {
    if (list.length < 2) break;
    let bi = 0;
    let bj = 1;
    let best = Infinity;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const waste = boxArea(joined(list[i], list[j])) - boxArea(list[i]) - boxArea(list[j]);
        if (waste < best) {
          best = waste;
          bi = i;
          bj = j;
        }
      }
    if (best >= RECT_COST && list.length <= max) break;
    const m = joined(list[bi], list[bj]);
    list = list.filter((_, k) => k !== bi && k !== bj);
    list.push(m);
  }
  return list.map((c) => ({ x: c.x0, y: c.y0, w: c.x1 - c.x0, h: c.y1 - c.y0 })).sort((u, v) => u.y - v.y || u.x - v.x);
}

const safe = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * For saving: the drawings variations redrew (pixels, tiles) that are cheaper to store as what changed. Their PNG
 * rectangles go in the zip; the result says, by the drawing's own id (`<original>~<variation>`), what to write in the
 * override instead of the whole drawing. Drawings that changed nearly everywhere are left to be stored whole.
 */
export function variationDiffs(doc: Doc, files: Zippable, png: (d: { width: number; height: number; pixels: Uint8ClampedArray }) => Uint8Array): Map<Id, DrawingDiff> {
  const out = new Map<Id, DrawingDiff>();
  const used = new Set<string>();
  for (const a of doc.artboards ?? []) {
    if (!a.variationOf) continue;
    for (const [orig, o] of Object.entries(a.overrides?.drawings ?? {})) {
      if (!o.replaced) continue;
      const alias = aliasId(orig, a.id);
      const mine = doc.drawings[alias];
      const base = doc.drawings[orig];
      if (!mine || !base || mine.kind !== base.kind) continue;
      if (mine.kind === 'pixel' && base.kind === 'pixel') {
        const rs = changedRects(base, mine);
        if (!rs || rs.reduce((n, r) => n + r.w * r.h, 0) > mine.width * mine.height * 0.8) continue;
        if (!rs.length) {
          out.set(alias, { rect: { x: 0, y: 0, w: 0, h: 0, pixels: '' } });
          continue;
        }
        const stored = rs.map((r): DiffRect => {
          const crop = new Uint8ClampedArray(r.w * r.h * 4);
          for (let y = 0; y < r.h; y++) crop.set(mine.pixels.subarray(((r.y + y) * mine.width + r.x) * 4, ((r.y + y) * mine.width + r.x + r.w) * 4), y * r.w * 4);
          let name = `pixels/diff_${safe(alias)}.png`;
          while (used.has(name) || files[name]) name = name.replace(/\.png$/, '_.png');
          used.add(name);
          files[name] = [png({ width: r.w, height: r.h, pixels: crop }), { level: 0 }];
          return { ...r, pixels: name };
        });
        out.set(alias, stored.length === 1 ? { rect: stored[0] } : { rects: stored });
      } else if (mine.kind === 'tilemap' && base.kind === 'tilemap' && mine.cells.length === base.cells.length) {
        const cells: number[] = [];
        for (let i = 0; i < mine.cells.length; i++) if (mine.cells[i] !== base.cells[i]) cells.push(i, mine.cells[i]);
        if (cells.length <= mine.cells.length) out.set(alias, { cells });
      }
    }
  }
  return out;
}

/** After reading: the whole redrawn drawings made from the original's and each stored change, which are then dropped. */
function applyDiffs(doc: Doc, a: Artboard): void {
  for (const [orig, o] of Object.entries(a.overrides?.drawings ?? {})) {
    const diff = o.diff;
    if (!diff) continue;
    delete o.diff;
    const base = doc.drawings[orig];
    const alias = aliasId(orig, a.id);
    const rects = [...(diff.rect ? [diff.rect] : []), ...(diff.rects ?? [])].filter((r) => r.pixels instanceof Uint8ClampedArray);
    if (base?.kind === 'pixel' && rects.length) {
      const px = new Uint8ClampedArray(base.pixels);
      for (const r of rects) {
        const { x, y, w, h } = r;
        const pixels = r.pixels as Uint8ClampedArray;
        if (x + w > base.width || y + h > base.height) continue;
        for (let row = 0; row < h; row++) px.set(pixels.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * base.width + x) * 4);
      }
      doc.drawings[alias] = { ...base, id: alias, pixels: px };
    } else if (base?.kind === 'tilemap' && diff.cells) {
      const cells = new Uint32Array(base.cells);
      for (let i = 0; i + 1 < diff.cells.length; i += 2) if (diff.cells[i] < cells.length) cells[diff.cells[i]] = diff.cells[i + 1] >>> 0;
      doc.drawings[alias] = { ...base, id: alias, cells };
    }
  }
}

/** For saving: the document with a variation that is open closed first, so the file's own fields are a real artboard. */
export function closedForSave(doc: Doc): { doc: Doc; reopen?: Id } {
  if (!doc.artboards?.some((a) => a.variationOf)) return { doc };
  const open = findArtboard(doc, activeId(doc));
  const src = open && sourceOf(doc, open);
  if (!open?.variationOf || !src) return { doc };
  return { doc: produce(doc, (d) => void switchArtboard(d as Doc, src.id)), reopen: open.id };
}

/** True for a drawing that is worked out from the original (an alias nothing needs to store). */
export function isDerivedDrawing(doc: Doc, id: Id): boolean {
  const sp = splitAlias(id);
  if (!sp) return false;
  const a = findArtboard(doc, sp.vid);
  if (!a?.variationOf) return false;
  return !a.overrides?.drawings?.[sp.orig]?.replaced;
}

/** The artboard entries for doc.json: a variation without its content. */
export function variationForSave(a: Artboard, files?: Zippable, diffs?: Map<Id, DrawingDiff>): Artboard {
  if (!a.variationOf) return a;
  const { content: _c, ...rest } = a;
  let ov = a.overrides ?? {};
  if (diffs?.size && ov.drawings) {
    const drawings = { ...ov.drawings };
    for (const [orig, o] of Object.entries(drawings)) {
      const diff = diffs.get(aliasId(orig, a.id));
      if (diff) drawings[orig] = { ...o, diff };
    }
    ov = { ...ov, drawings };
  }
  // Sounds the variation added carry their bytes in the zip, like any sound.
  if (files && ov.audio?.added?.length) {
    const added = packAudio({ audio: ov.audio.added } as Doc, files);
    return { ...rest, overrides: { ...ov, audio: { ...ov.audio, added } } } as unknown as Artboard;
  }
  return { ...rest, overrides: ov };
}

/**
 * After a file is read: each variation gets its content worked out from its original. A variation whose original is
 * missing is dropped (with a warning), since it has no content of its own to fall back on.
 */
export function resolveAfterLoad(doc: Doc, warnings: string[]): void {
  const list = doc.artboards;
  if (!list?.some((a) => a.variationOf)) return;
  const open = activeId(doc);
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (!a.variationOf) continue;
    const src = sourceOf(doc, a);
    const base = src && (src.id === open ? takeContent(doc) : src.content);
    if (!src || !base) {
      warnings.push(`The variation "${a.name}" lost the artboard it followed and was left out.`);
      list.splice(i, 1);
      continue;
    }
    applyDiffs(doc, a);
    const r = resolveContent(base, doc.drawings, a.overrides, a.id);
    Object.assign(doc.drawings, r.drawings);
    a.content = r.content;
  }
}

export { STAGE_KEYS };
export type { Drawing };

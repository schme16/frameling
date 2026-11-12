/**
 * Variations in the `.frameling` file: the overrides read back with every part checked (a file can be hand-edited or
 * damaged, and an override ends up drawn), and the helpers saving needs. Pure, no DOM.
 *
 * What is written: a variation is `{ id, name, x, y, exportName?, variationOf, overrides }` with no content. Drawings a
 * variation made are ordinary entries in `drawings`; the ones it redrew (pixels, tiles) are saved as `<id>~<variation>`.
 * Everything else about it is worked out from its original when the file opens.
 */
import { LAYER_LABELS, type Artboard, type AudioClip, type Cel, type Doc, type Drawing, type DrawingOverride, type Id, type Layer, type ListOverride, type Patch, type Shape, type VariationOverrides } from '../core/format';
import { readClip } from '../core/clipPlay';
import { packAudio, unpackAudio } from '../io/audio-file';
import type { Zippable } from 'fflate';
import { activeId, findArtboard, switchArtboard, takeContent } from './model';
import { normalize, resolveContent, sourceOf, splitAlias, STAGE_KEYS } from './variations';
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
export function variationForSave(a: Artboard, files?: Zippable): Artboard {
  if (!a.variationOf) return a;
  const { content: _c, ...rest } = a;
  const ov = a.overrides ?? {};
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
    const r = resolveContent(base, doc.drawings, a.overrides, a.id);
    Object.assign(doc.drawings, r.drawings);
    a.content = r.content;
  }
}

export { STAGE_KEYS };
export type { Drawing };

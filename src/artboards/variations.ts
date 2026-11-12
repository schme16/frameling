/**
 * Variations: linked copies of an artboard. A variation follows its original and keeps only what it changes
 * (`Artboard.overrides`): size, colours, timing, a layer's look, a drawing's shapes. Pure functions, no DOM.
 *
 * How it fits the artboards model: the open artboard's content is the document's own fields, so a variation that is
 * open is edited like any other artboard. While it is open its cels point at its own drawings in `doc.drawings`, named
 * `<original id>~<variation id>` (the same object as the original's until an edit changes it, with its own `id`, so a
 * tool that writes by `drawing.id` never reaches the original's). While it is closed only the drawings it overrides
 * have such a copy; its other keys point straight at the original's drawings, so editing the original copies no
 * per-variation table. Opening aliases every key, closing drops the copies nobody overrides. After every edit
 * `settleVariations` (run by the
 * store, in the same undo step) does the bookkeeping in both directions:
 *   - the open variation's overrides are worked out again from what is on the stage (`diffContent`);
 *   - a variation that is not open gets its content worked out from its original and its overrides
 *     (`resolveContent`), so playing, exporting and the pasteboard read it like any artboard, and edits to the
 *     original flow into it except where it overrides them.
 * Resolving and diffing keep the unchanged parts as the very same objects, so both are cheap.
 */
import { current, isDraft, produce, type Draft, type Patch as ImmerPatch } from 'immer';
import type { Artboard, ArtboardContent, AudioClip, Cel, Doc, DocPalette, Drawing, DrawingOverride, Id, Layer, ListOverride, Patch, Shape, VariationOverrides } from '../core/format';
import { uid } from '../core/doc';
import { registerChoice } from '../core/choices';
import { registerGuard, registerSettler, type SettleContext } from '../core/store';
import { activeId, artboardsOf, boxes, ensureArtboards, findArtboard, gapFor, nextSpot, putContent, switchArtboard, takeContent } from './model';
import { fitPlacement, type FitMode } from './fit';

registerChoice<FitMode>({
  id: 'variations.frame',
  title: 'A variation of a different size',
  question: 'When a variation has a different size, how should it frame the original?',
  category: 'Artboards',
  default: 'fill',
  help: 'A camera is added to the variation to frame the original. You can move it like any camera.',
  options: [
    { value: 'fill', label: 'Fill (crop)', detail: 'The picture is filled, and what hangs over the edges is cropped. Good for a square or tall cut of a wide shot.' },
    { value: 'bars', label: 'Fit (show it all)', detail: 'The whole original shows, with the stage colour round it where it does not fill the picture.' },
  ],
});

// ---------------------------------------------------------------- names

const SEP = '~';

/** The id of a variation's own copy of one of its original's drawings. */
export const aliasId = (orig: Id, vid: Id): Id => `${orig}${SEP}${vid}`;

/** The original drawing and variation an alias id names, or null when it is not one. */
export function splitAlias(id: Id): { orig: Id; vid: Id } | null {
  const i = id.lastIndexOf(SEP);
  if (i <= 0 || i === id.length - 1) return null;
  return { orig: id.slice(0, i), vid: id.slice(i + 1) };
}

/** The layer a variation makes to frame a different size when its original has no camera. */
export const framingLayerId = (vid: Id): Id => `frame-${vid}`;

/** The parts of an artboard's content a variation can change as a whole (layers are done item by item). */
export const STAGE_KEYS = ['width', 'height', 'background', 'length', 'clips', 'markers', 'flow', 'guides', 'inOut', 'perspective'] as const;

export const isVariation = (a: Artboard | undefined): boolean => !!a?.variationOf;

/** The original a variation follows (undefined when it is not one or the original is gone). */
export function sourceOf(doc: Doc, a: Artboard): Artboard | undefined {
  if (!a.variationOf) return undefined;
  const s = findArtboard(doc, a.variationOf);
  return s && !s.variationOf ? s : undefined;
}

/** The variations of an artboard, in list order. */
export function variationsOf(doc: Doc, id: Id): Artboard[] {
  return artboardsOf(doc).filter((a) => a.variationOf === id);
}

/** An artboard and its variations (a variation gives its original's family). */
export function familyOf(doc: Doc, id: Id): Artboard[] {
  const a = findArtboard(doc, id);
  if (!a) return [];
  const root = a.variationOf ?? a.id;
  return artboardsOf(doc).filter((x) => x.id === root || x.variationOf === root);
}

// ---------------------------------------------------------------- plain data helpers

/** Equal as plain data. Typed arrays (pixels) only count as equal when they are the same array. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  for (const k of Object.keys(x)) if (x[k] !== undefined && !deepEqual(x[k], y[k])) return false;
  for (const k of Object.keys(y)) if (y[k] !== undefined && x[k] === undefined) return false;
  return true;
}

function applyPatch<T extends object>(o: T, p: Patch | undefined): T {
  if (!p || (!p.set && !p.del)) return o;
  const out = { ...o } as Record<string, unknown>;
  if (p.set) for (const [k, v] of Object.entries(p.set)) if (k !== '__proto__') out[k] = v;
  for (const k of p.del ?? []) delete out[k];
  return out as T;
}

function diffPatch(b: object, c: object, skip: readonly string[] = []): Patch | undefined {
  const x = b as Record<string, unknown>;
  const y = c as Record<string, unknown>;
  let set: Record<string, unknown> | undefined;
  let del: string[] | undefined;
  for (const k of Object.keys(y)) {
    if (skip.includes(k) || y[k] === undefined) continue;
    if (!deepEqual(x[k], y[k])) (set ??= {})[k] = y[k];
  }
  for (const k of Object.keys(x)) {
    if (skip.includes(k) || x[k] === undefined) continue;
    if (y[k] === undefined) (del ??= []).push(k);
  }
  if (!set && !del) return undefined;
  return { ...(set ? { set } : {}), ...(del ? { del } : {}) };
}

type Item<S> = { patch?: Patch; sub?: S };

function diffList<T extends { id: Id }, S = never>(
  base: readonly T[],
  cur: readonly T[],
  o: { skip?: readonly string[]; sub?: (b: T, c: T) => S | undefined; item?: (b: T, c: T) => Item<S> | undefined; mapAdded?: (t: T) => T } = {},
): ListOverride<T, S> | undefined {
  const bm = new Map(base.map((x) => [x.id, x] as const));
  const cm = new Set(cur.map((x) => x.id));
  const items: Record<Id, Item<S>> = {};
  const added: T[] = [];
  for (const c of cur) {
    const b = bm.get(c.id);
    if (!b) {
      added.push(o.mapAdded ? o.mapAdded(c) : c);
      continue;
    }
    if (b === c) continue;
    let it: Item<S> | undefined;
    if (o.item) it = o.item(b, c);
    else {
      const patch = diffPatch(b, c, ['id', ...(o.skip ?? [])]);
      const sub = o.sub?.(b, c);
      if (patch || sub) it = { ...(patch ? { patch } : {}), ...(sub ? { sub } : {}) };
    }
    if (it) items[c.id] = it;
  }
  const removed = base.filter((b) => !cm.has(b.id)).map((b) => b.id);
  const natural = [...base.filter((b) => cm.has(b.id)).map((b) => b.id), ...added.map((a) => a.id)];
  const ids = cur.map((c) => c.id);
  const same = natural.length === ids.length && natural.every((id, i) => id === ids[i]);
  const out: ListOverride<T, S> = {};
  if (Object.keys(items).length) out.items = items;
  if (removed.length) out.removed = removed;
  if (added.length) out.added = added;
  if (!same) out.order = ids;
  return Object.keys(out).length ? out : undefined;
}

/** `natural` put in `order`; items `order` does not know (new in the original) go after the one before them. */
function mergeOrder<T extends { id: Id }>(natural: T[], order: readonly Id[]): T[] {
  const byId = new Map(natural.map((x) => [x.id, x] as const));
  const out: T[] = [];
  const seen = new Set<Id>();
  for (const id of order) {
    const x = byId.get(id);
    if (x && !seen.has(id)) {
      out.push(x);
      seen.add(id);
    }
  }
  for (let i = 0; i < natural.length; i++) {
    const x = natural[i];
    if (seen.has(x.id)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.indexOf(natural[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, x);
    seen.add(x.id);
  }
  return out;
}

function applyList<T extends { id: Id }, S>(base: readonly T[], ov: ListOverride<T, S> | undefined, mk: (b: T, it: Item<S> | undefined) => T, mapAdded: (t: T) => T = (t) => t): T[] {
  if (!ov) return base.map((b) => mk(b, undefined));
  const gone = new Set(ov.removed ?? []);
  const out: T[] = [];
  for (const b of base) if (!gone.has(b.id)) out.push(mk(b, ov.items?.[b.id]));
  const have = new Set(out.map((x) => x.id));
  for (const a of ov.added ?? []) if (!have.has(a.id)) out.push(mapAdded(a));
  return ov.order ? mergeOrder(out, ov.order) : out;
}

// ---------------------------------------------------------------- diffing (what the stage holds, against the original)

const unaliasCel = (c: Cel, vid: Id): Cel => {
  const sp = splitAlias(c.drawingId);
  return sp && sp.vid === vid ? { ...c, drawingId: sp.orig } : c;
};

const unaliasLayer = (l: Layer, vid: Id): Layer => (l.cels.some((c) => splitAlias(c.drawingId)?.vid === vid) ? ({ ...l, cels: l.cels.map((c) => unaliasCel(c, vid)) } as Layer) : l);

const layerMemo = new WeakMap<Layer, { base: Layer; vid: Id; out: Item<ListOverride<Cel>> | undefined }>();

function diffLayer(b: Layer, c: Layer, vid: Id): Item<ListOverride<Cel>> | undefined {
  const hit = layerMemo.get(c);
  if (hit && hit.base === b && hit.vid === vid) return hit.out;
  const patch = diffPatch(b, c, ['id', 'cels']);
  const cels = diffList<Cel>(b.cels, c.cels.map((x) => unaliasCel(x, vid)));
  const out = patch || cels ? { ...(patch ? { patch } : {}), ...(cels ? { sub: cels } : {}) } : undefined;
  layerMemo.set(c, { base: b, vid, out });
  return out;
}

/** Same drawing apart from its id (an alias that nothing has changed). */
export function sameDrawing(a: Drawing, b: Drawing): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  for (const k of Object.keys(x)) if (k !== 'id' && x[k] !== y[k]) return false;
  for (const k of Object.keys(y)) if (k !== 'id' && x[k] !== y[k]) return false;
  return true;
}

function diffDrawing(b: Drawing, c: Drawing): DrawingOverride | undefined {
  if (sameDrawing(b, c)) return undefined;
  if (b.kind !== c.kind || b.kind === 'pixel' || b.kind === 'tilemap') return { replaced: true };
  if (b.kind === 'camera' && c.kind === 'camera') {
    const view = diffPatch(b.view, c.view);
    const patch = diffPatch(b, c, ['id', 'kind', 'view']);
    return view || patch ? { ...(view ? { view } : {}), ...(patch ? { patch } : {}) } : undefined;
  }
  if (b.kind === 'vector' && c.kind === 'vector') {
    const patch = diffPatch(b, c, ['id', 'kind', 'shapes']);
    const shapes = diffList<Shape, never>(b.shapes, c.shapes);
    return patch || shapes ? { ...(patch ? { patch } : {}), ...(shapes ? { shapes } : {}) } : undefined;
  }
  return { replaced: true };
}

const aliasMemoByLayer = new WeakMap<Layer, { vid: Id; pairs: [Id, Id][] }>();

/** The distinct own drawings (alias id, original id) a layer's keys point at, worked out once per layer object. */
function aliasesOf(l: Layer, vid: Id): [Id, Id][] {
  const hit = aliasMemoByLayer.get(l);
  if (hit && hit.vid === vid) return hit.pairs;
  const seen = new Set<Id>();
  const pairs: [Id, Id][] = [];
  for (const c of l.cels) {
    if (seen.has(c.drawingId)) continue;
    seen.add(c.drawingId);
    const sp = splitAlias(c.drawingId);
    if (sp && sp.vid === vid) pairs.push([c.drawingId, sp.orig]);
  }
  aliasMemoByLayer.set(l, { vid, pairs });
  return pairs;
}

const drawingDiffMemo = new WeakMap<Drawing, { base: Drawing; out: DrawingOverride | undefined }>();

function diffDrawingMemo(b: Drawing, c: Drawing): DrawingOverride | undefined {
  const hit = drawingDiffMemo.get(c);
  if (hit && hit.base === b) return hit.out;
  const out = diffDrawing(b, c);
  drawingDiffMemo.set(c, { base: b, out });
  return out;
}

const clean = <T extends object>(o: T): T | undefined => (Object.keys(o).length ? o : undefined);

/** For `diffContent` when only some drawings can have changed: the overrides' drawings so far, and the aliases to look at again. */
export interface IncrementalDiff {
  prev: Record<Id, DrawingOverride> | undefined;
  check: Set<Id>;
}

/**
 * What `cur` (a variation's content, its cels pointing at `<id>~<vid>` drawings) changes from `base` (its original).
 * The inverse of `resolveContent`: resolving the result against `base` gives `cur` back.
 */
export function diffContent(base: ArtboardContent, baseDrawings: Record<Id, Drawing>, cur: ArtboardContent, curDrawings: Record<Id, Drawing>, vid: Id, inc?: IncrementalDiff): VariationOverrides {
  const out: VariationOverrides = {};
  const stage = diffPatch(pick(base), pick(cur));
  if (stage) out.stage = stage;
  const layers = diffList<Layer, ListOverride<Cel>>(base.layers, cur.layers, { item: (b, c) => diffLayer(b, c, vid), mapAdded: (l) => unaliasLayer(l, vid) });
  if (layers) out.layers = layers;
  const audio = diffList<AudioClip>(base.audio ?? [], cur.audio ?? [], { skip: ['data', 'mime', 'duration'] });
  if (audio) out.audio = audio;
  const drawings: Record<Id, DrawingOverride> = inc ? { ...inc.prev } : {};
  if (inc) {
    // Only the drawings that were touched are looked at again; the rest keep what they had.
    for (const alias of inc.check) {
      const sp = splitAlias(alias);
      if (!sp) continue;
      const b = baseDrawings[sp.orig];
      const d = curDrawings[alias];
      const o = b && d ? diffDrawingMemo(b, d) : undefined;
      if (o) drawings[sp.orig] = o;
      else delete drawings[sp.orig];
    }
  }
  const seen = new Set<Id>();
  for (const l of inc ? [] : cur.layers)
    for (const [alias, orig] of aliasesOf(l, vid)) {
      if (seen.has(alias)) continue;
      seen.add(alias);
      const b = baseDrawings[orig];
      const d = curDrawings[alias];
      if (!b || !d) continue;
      const o = diffDrawingMemo(b, d);
      if (o) drawings[orig] = o;
    }
  const dr = clean(drawings);
  if (dr) out.drawings = dr;
  return out;
}

function pick(c: ArtboardContent): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of STAGE_KEYS) if (c[k] !== undefined) o[k] = c[k];
  return o;
}

// ---------------------------------------------------------------- resolving (the original with the overrides on)

const drawingMemo = new WeakMap<DrawingOverride, WeakMap<Drawing, Drawing>>();

function applyDrawing(b: Drawing, o: DrawingOverride): Drawing {
  let m = drawingMemo.get(o);
  if (!m) drawingMemo.set(o, (m = new WeakMap()));
  const hit = m.get(b);
  if (hit) return hit;
  let out: Drawing = b;
  if (!o.replaced) {
    if (b.kind === 'vector') {
      const base = applyPatch(b, o.patch);
      out = { ...base, shapes: applyList(b.shapes, o.shapes, (s, it) => applyPatch(s, it?.patch)) };
    } else if (b.kind === 'camera') {
      out = { ...applyPatch(b, o.patch), view: applyPatch(b.view, o.view) };
    }
  }
  m.set(b, out);
  return out;
}

const aliasMemo = new WeakMap<Drawing, Map<Id, Drawing>>();

function aliasObject(d: Drawing, alias: Id): Drawing {
  let m = aliasMemo.get(d);
  if (!m) aliasMemo.set(d, (m = new Map()));
  let hit = m.get(alias);
  if (!hit) m.set(alias, (hit = { ...d, id: alias } as Drawing));
  return hit;
}

/** No overrides: a closed variation with no changed drawings aliases nothing. */
const NO_DRAWINGS: Record<Id, DrawingOverride> = {};

/** The key with its own drawing id, when the drawing exists and (for a closed variation, `only` set) the variation overrides it. */
const aliasCel = (c: Cel, vid: Id, baseDrawings: Record<Id, Drawing>, only?: Record<Id, DrawingOverride>): Cel => (baseDrawings[c.drawingId] && (!only || only[c.drawingId]) ? { ...c, drawingId: aliasId(c.drawingId, vid) } : c);

const resolvedLayerMemo = new WeakMap<Layer, Map<Id, { item: Item<ListOverride<Cel>> | undefined; only: Record<Id, DrawingOverride> | undefined; out: Layer }>>();

function resolveLayer(b: Layer, item: Item<ListOverride<Cel>> | undefined, vid: Id, baseDrawings: Record<Id, Drawing>, only?: Record<Id, DrawingOverride>): Layer {
  let m = resolvedLayerMemo.get(b);
  if (!m) resolvedLayerMemo.set(b, (m = new Map()));
  const hit = m.get(vid);
  if (hit && hit.item === item && hit.only === only) return hit.out;
  let out: Layer;
  // Nothing of this layer is changed or aliased: it is the original's own layer.
  if (!item && only && !b.cels.some((c) => only[c.drawingId])) out = b;
  else {
    const cels = applyList(b.cels, item?.sub, (c, it) => applyPatch(c, it?.patch)).map((c) => aliasCel(c, vid, baseDrawings, only));
    cels.sort((x, y) => x.start - y.start);
    out = { ...applyPatch(b, item?.patch), cels } as Layer;
    out.id = b.id;
  }
  m.set(vid, { item, only, out });
  return out;
}

const addedLayerMemo = new WeakMap<Layer, Map<Id, { only: Record<Id, DrawingOverride> | undefined; out: Layer }>>();

function resolveAdded(l: Layer, vid: Id, baseDrawings: Record<Id, Drawing>, only?: Record<Id, DrawingOverride>): Layer {
  let m = addedLayerMemo.get(l);
  if (!m) addedLayerMemo.set(l, (m = new Map()));
  let hit = m.get(vid);
  if (!hit || hit.only !== only) {
    const cels = l.cels.map((c) => aliasCel(c, vid, baseDrawings, only));
    cels.sort((x, y) => x.start - y.start);
    m.set(vid, (hit = { only, out: { ...l, cels } as Layer }));
  }
  return hit.out;
}

export interface Resolved {
  content: ArtboardContent;
  /** The variation's own drawings (by alias id) that its cels point at. */
  drawings: Record<Id, Drawing>;
}

const NO_SOUND: AudioClip[] = [];
const audioMemo = new WeakMap<AudioClip[], WeakMap<ListOverride<AudioClip>, AudioClip[]>>();

/** The original's sound clips with a variation's changes (volume, mute, start, left out, added). The same array for the same input. */
function resolveAudio(base: AudioClip[] | undefined, o: ListOverride<AudioClip> | undefined): AudioClip[] | undefined {
  if (!o) return base;
  const b = base ?? NO_SOUND;
  let m = audioMemo.get(b);
  if (!m) audioMemo.set(b, (m = new WeakMap()));
  let hit = m.get(o);
  if (!hit) m.set(o, (hit = applyList(b, o, (c, it) => applyPatch(c, it?.patch))));
  return hit;
}

/** A variation's own object for one of its original's drawings (the redrawn copy when it has one). */
function aliasDrawing(baseDrawings: Record<Id, Drawing>, ov: VariationOverrides, orig: Id, alias: Id, have: Record<Id, Drawing>): Drawing | undefined {
  const b = baseDrawings[orig];
  if (!b) return undefined;
  const dov = ov.drawings?.[orig];
  const mine = have[alias];
  return dov?.replaced && mine && mine.kind === b.kind ? mine : aliasObject(dov && !dov.replaced ? applyDrawing(b, dov) : b, alias);
}

/** For `resolveContent` when most of it is known: the content it made last time and the original drawings that were touched. */
export interface IncrementalResolve {
  prev: ArtboardContent;
  touched: Set<Id>;
}

/**
 * A variation's content: the original's with the overrides on. `have` is where the drawings that are the variation's
 * own copies (pixels, tiles) are looked up, normally `doc.drawings`. With `inc` only the drawings that can have changed
 * are returned (the ones in layers that are new since `inc.prev`, and the touched ones the variation has already).
 * Only the drawings the variation overrides get their own id, unless `all` (the open variation, whose tools write by
 * drawing id): then every key does.
 */
export function resolveContent(base: ArtboardContent, baseDrawings: Record<Id, Drawing>, ov: VariationOverrides | undefined, vid: Id, have: Record<Id, Drawing> = baseDrawings, inc?: IncrementalResolve, all = false): Resolved {
  const o = ov ?? {};
  const only = all ? undefined : (o.drawings ?? NO_DRAWINGS);
  const content: ArtboardContent = { ...base };
  if (o.stage) {
    const c = content as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(o.stage.set ?? {})) if ((STAGE_KEYS as readonly string[]).includes(k)) c[k] = v;
    for (const k of o.stage.del ?? []) if ((STAGE_KEYS as readonly string[]).includes(k)) delete c[k];
  }
  content.layers = applyList(
    base.layers,
    o.layers,
    (b, it) => resolveLayer(b, it, vid, baseDrawings, only),
    (l) => resolveAdded(l, vid, baseDrawings, only),
  );
  const sound = resolveAudio(base.audio, o.audio);
  if (sound?.length) content.audio = sound;
  else delete content.audio;
  const drawings: Record<Id, Drawing> = {};
  const scan = (l: Layer) => {
    for (const [alias, orig] of aliasesOf(l, vid)) {
      if (drawings[alias]) continue;
      const d = aliasDrawing(baseDrawings, o, orig, alias, have);
      if (d) drawings[alias] = d;
    }
  };
  if (!inc) content.layers.forEach(scan);
  else {
    const old = new Map(inc.prev.layers.map((l) => [l.id, l] as const));
    for (const l of content.layers) if (old.get(l.id) !== l) scan(l);
    for (const orig of inc.touched) {
      const alias = aliasId(orig, vid);
      const d = have[alias] && aliasDrawing(baseDrawings, o, orig, alias, have);
      if (d) drawings[alias] = d;
    }
  }
  return { content, drawings };
}

const openLayerMemo = new WeakMap<Layer, Map<Id, Layer>>();

/** A layer with every key at the variation's own drawing id (what the open variation needs), or the same layer when it is. */
function aliasOpenLayer(l: Layer, vid: Id, drawings: Record<Id, Drawing>): Layer {
  let m = openLayerMemo.get(l);
  if (!m) openLayerMemo.set(l, (m = new Map()));
  let hit = m.get(vid);
  if (!hit) {
    const need = (c: Cel) => !!drawings[c.drawingId] && splitAlias(c.drawingId)?.vid !== vid;
    hit = l.cels.some(need) ? ({ ...l, cels: l.cels.map((c) => (need(c) ? { ...c, drawingId: aliasId(c.drawingId, vid) } : c)) } as Layer) : l;
    m.set(vid, hit);
  }
  return hit;
}

/**
 * What the open variation needs so that every key has its own drawing (the tools write by drawing id, so a key that
 * still pointed at the original's drawing would change the original): the layers, and the copies to put in
 * `doc.drawings` for the keys that just got one. Null when it is all there already.
 */
function openAliasing(doc: Doc, a: Artboard): { layers: Layer[]; drawings: [Id, Drawing][] } | null {
  const layers = doc.layers.map((l) => aliasOpenLayer(l, a.id, doc.drawings));
  if (!layers.some((l, i) => l !== doc.layers[i])) return null;
  const ov = a.overrides ?? {};
  const drawings: [Id, Drawing][] = [];
  const seen = new Set<Id>();
  layers.forEach((l, i) => {
    if (l === doc.layers[i]) return;
    l.cels.forEach((c, j) => {
      if (c === doc.layers[i].cels[j] || seen.has(c.drawingId)) return;
      seen.add(c.drawingId);
      const sp = splitAlias(c.drawingId);
      const d = sp && aliasDrawing(doc.drawings, ov, sp.orig, c.drawingId, doc.drawings);
      if (d && doc.drawings[c.drawingId] !== d) drawings.push([c.drawingId, d]);
    });
  });
  return { layers, drawings };
}

function sameContent(a: ArtboardContent | undefined, b: ArtboardContent): boolean {
  if (!a) return false;
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (k === 'layers') {
      if (a.layers.length !== b.layers.length || a.layers.some((l, i) => l !== b.layers[i])) return false;
    } else if (x[k] !== y[k]) return false;
  }
  return true;
}

// ---------------------------------------------------------------- keeping it all in step

/** The original's content, whether it is open or not. */
function baseOf(doc: Doc, src: Artboard): ArtboardContent | undefined {
  return src.id === activeId(doc) ? takeContent(doc) : src.content;
}

const CONTENT_KEYS = new Set<string>(['width', 'height', 'background', 'length', 'layers', 'clips', 'markers', 'flow', 'audio', 'guides', 'inOut', 'perspective']);

/** What a change touched, read from its patches. Anything not clearly small counts as everything (`full`). */
export interface Touch {
  full: boolean;
  /** Ids of the drawings written to. */
  drawings: Set<Id>;
  /** The open artboard's own fields (layers, size, clips, sound...) changed. */
  content: boolean;
  /** Key lists changed on the open artboard, or layers were added, removed or swapped. */
  cels: boolean;
  /** Set-aside artboards (list positions) whose content changed. */
  closed: Set<number>;
  /** Artboards (list positions) whose overrides were written directly. */
  own: Set<number>;
}

export function touchOf(patches: readonly ImmerPatch[]): Touch {
  const t: Touch = { full: false, drawings: new Set(), content: false, cels: false, closed: new Set(), own: new Set() };
  for (const p of patches) {
    const path = p.path;
    const k = path[0] as string;
    if (k === 'drawings') {
      if (path.length === 1) t.full = true;
      else t.drawings.add(String(path[1]));
    } else if (k === 'layers') {
      t.content = true;
      if (path.length <= 2 || path[2] === 'cels') t.cels = true;
    } else if (CONTENT_KEYS.has(k)) {
      t.content = true;
    } else if (k === 'artboards') {
      if (path.length <= 2) t.full = true;
      else if (path[2] === 'content') t.closed.add(path[1] as number);
      else if (path[2] === 'overrides') t.own.add(path[1] as number);
      else if (path[2] === 'variationOf') t.full = true;
    } else if (k === 'activeArtboard') t.full = true;
  }
  return t;
}

/** The aliases of a variation among the touched drawing ids (its own, and its original's drawings it has a copy of). */
function aliasesTouched(ids: Set<Id>, vid: Id): Set<Id> {
  const out = new Set<Id>();
  for (const id of ids) {
    const sp = splitAlias(id);
    if (!sp) out.add(aliasId(id, vid));
    else if (sp.vid === vid) out.add(id);
  }
  return out;
}

/** Adds and drops entries of `doc.drawings` (one patch each: immer walks a table put in whole, which costs far more). */
function editDrawings(d: Draft<Doc>, add: [Id, Drawing][], drop: Id[]): void {
  for (const k of drop) delete d.drawings[k];
  for (const [k, v] of add) if (d.drawings[k] !== v) d.drawings[k] = v as never;
}

/**
 * What to change in the document so that every variation is in step: the open variation's overrides follow what is on
 * the stage, and the others' content follows their original. Null when everything already is. The store runs this
 * after every change and keeps the result in the same undo step. Given the change's patches it looks only at what the
 * change touched (a variation whose original did not change is left alone, and so are drawings nobody wrote to);
 * without them it checks everything.
 */
export function settleVariations(doc: Doc, ctx?: { patches: readonly ImmerPatch[] }): ((d: Draft<Doc>) => void) | null {
  const list = doc.artboards;
  if (!list?.some((a) => a.variationOf) || doc.editing?.length) return null;
  const t = ctx ? touchOf(ctx.patches) : null;
  const everything = !t || t.full;
  const open = activeId(doc);
  const jobs: ((d: Draft<Doc>, a: Draft<Artboard>) => void)[] = [];
  const ids: Id[] = [];
  const addDrawings: [Id, Drawing][] = [];
  const dropDrawings: Id[] = [];
  // Whole-table scans (the copies a closed variation no longer needs) only when everything is checked.
  let copies: Map<Id, Id[]> | undefined;
  const copiesOf = (vid: Id): Id[] => {
    if (!copies) {
      copies = new Map();
      for (const k of Object.keys(doc.drawings)) {
        const sp = k.includes(SEP) ? splitAlias(k) : null;
        if (sp) (copies.get(sp.vid) ?? copies.set(sp.vid, []).get(sp.vid)!).push(k);
      }
    }
    return copies.get(vid) ?? [];
  };
  for (let ai = 0; ai < list.length; ai++) {
    const a = list[ai];
    if (!a.variationOf) continue;
    const src = sourceOf(doc, a);
    const base = src && baseOf(doc, src);
    if (!src || !base) {
      // The original is gone: what it has is all it has, as a plain artboard.
      ids.push(a.id);
      jobs.push((_d, x) => {
        delete x.variationOf;
        delete x.overrides;
      });
      continue;
    }
    const srcTouched = everything || (src.id === open ? t!.content : t!.closed.has(list.indexOf(src)));
    const mine = everything ? null : aliasesTouched(t!.drawings, a.id);
    if (a.id === open) {
      if (!everything && !srcTouched && !t!.content && !mine!.size) continue;
      // Opened (or keys added): every key gets its own drawing, so no tool can write to the original's.
      const own = everything || srcTouched || t!.cels ? openAliasing(doc, a) : null;
      const cur = own ? { ...takeContent(doc), layers: own.layers } : takeContent(doc);
      const curDrawings = own?.drawings.length ? { ...doc.drawings, ...Object.fromEntries(own.drawings) } : doc.drawings;
      const inc: IncrementalDiff | undefined = everything || srcTouched || t!.cels ? undefined : { prev: a.overrides?.drawings, check: mine! };
      const ov = diffContent(base, doc.drawings, cur, curDrawings, a.id, inc);
      if (a.overrides?.palette) ov.palette = a.overrides.palette;
      const changed = !deepEqual(ov, a.overrides ?? {});
      if (changed || own) {
        ids.push(a.id);
        if (own) addDrawings.push(...own.drawings);
        jobs.push((d, x) => {
          if (own) d.layers = own.layers as never;
          if (changed) x.overrides = ov;
        });
      }
    } else {
      const touched = everything ? undefined : touchedOriginals(t!.drawings, a.id);
      // Only drawings the variation overrides have a copy of its own; the others are the original's and follow it by themselves.
      if (touched) for (const o of [...touched]) if (!a.overrides?.drawings?.[o]) touched.delete(o);
      if (!everything && !srcTouched && !t!.own.has(ai) && !touched!.size) continue;
      const inc: IncrementalResolve | undefined = everything || !a.content ? undefined : { prev: a.content, touched: touched! };
      const r = resolveContent(base, doc.drawings, a.overrides, a.id, doc.drawings, inc);
      const stale = Object.entries(r.drawings).filter(([k, v]) => doc.drawings[k] !== v);
      const unused = everything ? copiesOf(a.id).filter((k) => !a.overrides?.drawings?.[splitAlias(k)!.orig]) : [];
      if (!sameContent(a.content, r.content) || stale.length || unused.length) {
        ids.push(a.id);
        const same = sameContent(a.content, r.content);
        dropDrawings.push(...unused);
        addDrawings.push(...(stale as [Id, Drawing][]));
        jobs.push((_d, x) => {
          if (!same) x.content = r.content as never;
        });
      }
    }
  }
  if (!jobs.length) return null;
  return (d) => {
    if (addDrawings.length || dropDrawings.length) editDrawings(d, addDrawings, dropDrawings);
    jobs.forEach((j, i) => {
      const a = d.artboards?.find((x) => x.id === ids[i]);
      if (a) j(d, a);
    });
  };
}

/** The original drawing ids behind the touched ids, for one variation. */
function touchedOriginals(ids: Set<Id>, vid: Id): Set<Id> {
  const out = new Set<Id>();
  for (const id of ids) {
    const sp = splitAlias(id);
    if (!sp) out.add(id);
    else if (sp.vid === vid) out.add(sp.orig);
  }
  return out;
}

registerSettler((doc, ctx) => settleVariations(doc, ctx));

// ---------------------------------------------------------------- what a variation shares

/** What stays shared with the original (not overridable), and the plain sentence for when someone tries to change it from a variation. */
const SHARED: Record<string, string> = {
  symbols: 'Symbols are shared with the original. Change them there, or detach this variation.',
  swatches: 'Swatches are shared with the original. Change them there, or detach this variation.',
  folders: 'Layer folders are shared with the original. Change them there, or detach this variation.',
  tileset: 'Tiles are shared with the original. Change them there, or detach this variation.',
  palette: 'The palette is shared with the original. Change it there, or detach this variation.',
};

/** The open artboard when it is a variation. */
function openVariation(doc: Doc): Artboard | undefined {
  if (!doc.artboards?.some((a) => a.variationOf)) return undefined;
  const a = findArtboard(doc, activeId(doc));
  return a?.variationOf ? a : undefined;
}

/** The sentence to say when the open artboard is a variation and something it shares is about to be changed, else null. */
export function sharedEditNote(doc: Doc, what: 'symbols' | 'swatches' | 'folders' | 'tileset' | 'palette'): string | null {
  return openVariation(doc) ? SHARED[what] : null;
}

// A change that writes what a variation shares is refused whole, with the sentence, so no edit is lost or leaks into the original.
registerGuard((_before, next, patches) => {
  if (!openVariation(next)) return null;
  for (const p of patches) {
    const note = SHARED[p.path[0] as string];
    if (note) return note;
  }
  return null;
});

/** The palette the open artboard has of its own (a variation with a colourway), or undefined for the shared one. */
export function variationPalette(doc: Doc): DocPalette | undefined {
  return openVariation(doc)?.overrides?.palette;
}

/** Gives the open variation its own palette (null = the original's again). False when the open artboard is not a variation. */
export function setVariationPalette(d: Doc, p: DocPalette | null): boolean {
  const a = openVariation(snap(d));
  if (!a) return false;
  const t = findArtboard(d, a.id)!;
  const ov = { ...(t.overrides ?? {}) };
  if (p) ov.palette = p;
  else delete ov.palette;
  t.overrides = ov as never;
  return true;
}

/**
 * Which drawings a palette colour change recolours. In an open variation: the ones its keys show (its colourway is its
 * own). Anywhere else: every drawing but the copies of variations that have a palette of their own.
 */
export function paletteScope(doc: Doc): (id: Id) => boolean {
  const open = openVariation(doc);
  if (open) {
    const used = new Set<Id>();
    for (const l of doc.layers) for (const c of l.cels) used.add(c.drawingId);
    return (id) => used.has(id);
  }
  if (!doc.artboards?.some((a) => a.overrides?.palette)) return () => true;
  return (id) => {
    const sp = splitAlias(id);
    return !(sp && findArtboard(doc, sp.vid)?.overrides?.palette);
  };
}

// ---------------------------------------------------------------- actions on a document (call them inside store.update)

/** The document as plain data (a recipe's draft is read through this, so memoising never sees proxies). */
const snap = (d: Doc): Doc => (isDraft(d) ? (current(d) as Doc) : d);

/** The variation, its original and the original's content, read from the document. */
function parts(d: Doc, vid: Id): { s: Doc; a: Artboard; src: Artboard; base: ArtboardContent; open: boolean } | null {
  const s = snap(d);
  const a = findArtboard(s, vid);
  if (!a?.variationOf) return null;
  const src = sourceOf(s, a);
  const base = src && baseOf(s, src);
  if (!src || !base) return null;
  return { s, a, src, base, open: !a.content };
}

/** Puts a variation's overrides in place and makes its content match (the open one's stage included). */
function install(d: Doc, vid: Id, ov: VariationOverrides, dropAliases: Id[] = []): void {
  const p = parts(d, vid);
  const target = findArtboard(d, vid);
  if (!p || !target) return;
  const next = normalize(ov);
  target.overrides = next;
  // The open variation has a drawing of its own for every key; a closed one only for the drawings it overrides.
  const r = resolveContent(p.base, p.s.drawings, next, vid, p.s.drawings, undefined, p.open);
  const drop = [...dropAliases];
  if (!p.open) {
    // Copies a closed variation no longer needs.
    for (const k of Object.keys(p.s.drawings)) {
      const sp = k.includes(SEP) ? splitAlias(k) : null;
      if (sp?.vid === vid && !next.drawings?.[sp.orig]) drop.push(k);
    }
  }
  editDrawings(d, Object.entries(r.drawings), drop);
  if (p.open) putContent(d, r.content);
  else target.content = r.content;
}

/** The overrides with empty parts left out. */
export function normalize(ov: VariationOverrides): VariationOverrides {
  const out: VariationOverrides = {};
  if (ov.stage && (ov.stage.set || ov.stage.del?.length)) out.stage = ov.stage;
  const l = ov.layers;
  if (l) {
    const lo: ListOverride<Layer, ListOverride<Cel>> = {};
    const items: NonNullable<typeof l.items> = {};
    for (const [k, it] of Object.entries(l.items ?? {})) {
      const sub = it.sub && (Object.keys(it.sub.items ?? {}).length || it.sub.removed?.length || it.sub.added?.length) ? it.sub : undefined;
      const patch = it.patch && (it.patch.set || it.patch.del?.length) ? it.patch : undefined;
      if (patch || sub) items[k] = { ...(patch ? { patch } : {}), ...(sub ? { sub } : {}) };
    }
    if (Object.keys(items).length) lo.items = items;
    if (l.removed?.length) lo.removed = l.removed;
    if (l.added?.length) lo.added = l.added;
    if (l.order) lo.order = l.order;
    if (Object.keys(lo).length) out.layers = lo;
  }
  if (ov.drawings && Object.keys(ov.drawings).length) out.drawings = ov.drawings;
  const au = ov.audio;
  if (au && (Object.keys(au.items ?? {}).length || au.removed?.length || au.added?.length || au.order)) out.audio = au;
  if (ov.palette) out.palette = ov.palette;
  return out;
}

/** Where a copy of an artboard goes: beside it when there's room, else after everything. */
function spotBeside(d: Doc, src: Artboard, w: number, h: number): { x: number; y: number } {
  const right = src.x + w + gapFor(w);
  const clash = boxes(d).some((b) => b.id !== src.id && right < b.x + b.w && right + w > b.x && src.y < b.y + b.h && src.y + h > b.y);
  if (!clash) return { x: right, y: src.y };
  return nextSpot(d, w);
}

/** "Hero, variation 2": a name not used yet. */
export function variationName(doc: Doc, of: string): string {
  const names = new Set(artboardsOf(doc).map((a) => a.name.toLowerCase()));
  for (let k = 1; ; k++) {
    const n = `${of}, variation ${k}`;
    if (!names.has(n.toLowerCase())) return n;
  }
}

export interface NewVariation {
  name?: string;
  /** A different size to start with. */
  size?: { width: number; height: number };
  /** How a different size frames the original's picture (default: fill). */
  frame?: FitMode;
}

/**
 * Adds a variation of an artboard (of the original, when given a variation: the new one starts with the same
 * changes). It is placed beside the one it came from and not opened. Returns its id.
 */
export function makeVariation(d: Doc, from: Id, o: NewVariation = {}): Id | null {
  if (d.editing?.length) return null;
  const list = ensureArtboards(d);
  const s = snap(d);
  const src = findArtboard(s, from);
  if (!src) return null;
  const root = src.variationOf ? sourceOf(s, src) : src;
  const base = root && baseOf(s, root);
  if (!root || !base) return null;
  const id = uid('ab');
  const ov: VariationOverrides = src.variationOf ? cloneOverrides(d, s, src, id) : {};
  const size = src.content ?? takeContent(s);
  const at = spotBeside(s, src, size.width, size.height);
  const art: Artboard = { id, name: o.name ?? variationName(s, root.name), x: at.x, y: at.y, variationOf: root.id, overrides: ov };
  // After the last of its family, so the variations stay in the order they were made.
  let last = list.findIndex((a) => a.id === src.id);
  list.forEach((a, k) => void (a.variationOf === root.id && k > last && (last = k)));
  list.splice(last + 1, 0, art);
  const r = resolveContent(base, s.drawings, ov, id);
  for (const [k, v] of Object.entries(r.drawings)) d.drawings[k] = v as never;
  findArtboard(d, id)!.content = r.content as never;
  if (o.size) setVariationSize(d, id, o.size.width, o.size.height, o.frame ?? 'fill');
  return id;
}

/** A copy of a variation's overrides for another variation of the same original, with its own drawings. */
function cloneOverrides(d: Doc, s: Doc, from: Artboard, to: Id): VariationOverrides {
  const ov = structuredClone(from.overrides ?? {});
  for (const [orig, o] of Object.entries(ov.drawings ?? {})) {
    const src = s.drawings[aliasId(orig, from.id)];
    if (o.replaced && src) d.drawings[aliasId(orig, to)] = { ...src, id: aliasId(orig, to) } as never;
  }
  // Drawings the variation drew itself get copies, so editing one never changes the other.
  const root = sourceOf(s, from);
  const baseUse = new Set<Id>();
  for (const l of (root && baseOf(s, root))?.layers ?? []) for (const c of l.cels) baseUse.add(c.drawingId);
  const remap = new Map<Id, Id>();
  const own = (id: Id): Id => {
    const src = s.drawings[id];
    if (!src || baseUse.has(id)) return id;
    let n = remap.get(id);
    if (!n) {
      n = uid(src.id.charAt(0) || 'v');
      remap.set(id, n);
      d.drawings[n] = { ...structuredClone(src), id: n } as never;
    }
    return n;
  };
  for (const l of ov.layers?.added ?? []) for (const c of l.cels) c.drawingId = own(c.drawingId);
  for (const it of Object.values(ov.layers?.items ?? {})) {
    for (const c of it.sub?.added ?? []) c.drawingId = own(c.drawingId);
    for (const x of Object.values(it.sub?.items ?? {})) {
      const v = x.patch?.set?.drawingId;
      if (typeof v === 'string') (x.patch!.set as Record<string, unknown>).drawingId = own(v);
    }
  }
  return ov;
}

/**
 * Makes a variation a plain artboard: it keeps what it shows now and stops following its original.
 * The drawings it shares stay shared until one is changed, as with any copy.
 */
export function detachVariation(d: Doc, vid: Id): boolean {
  const a = findArtboard(d, vid);
  if (!a?.variationOf) return false;
  delete a.variationOf;
  delete a.overrides;
  return true;
}

/** Detaches every variation of an artboard (before it goes). */
export function detachVariationsOf(d: Doc, id: Id): void {
  for (const a of artboardsOf(d)) if (a.variationOf === id) detachVariation(d, a.id);
}

/** Back to the original: every change this variation made is dropped. */
export function resetVariation(d: Doc, vid: Id): boolean {
  const p = parts(d, vid);
  if (!p) return false;
  install(d, vid, {}, replacedAliases(p.a.overrides, vid));
  return true;
}

function replacedAliases(ov: VariationOverrides | undefined, vid: Id): Id[] {
  return Object.entries(ov?.drawings ?? {})
    .filter(([, o]) => o.replaced)
    .map(([k]) => aliasId(k, vid));
}

/**
 * Changes a variation's content (open or not) by returning the content it should have: the overrides are worked out
 * from the result. For things that edit a set-aside variation directly, such as its background.
 */
export function changeVariation(d: Doc, vid: Id, fn: (c: ArtboardContent) => ArtboardContent): boolean {
  const p = parts(d, vid);
  if (!p) return false;
  const cur = p.open ? takeContent(p.s) : p.a.content!;
  const next = fn(cur);
  install(d, vid, diffContent(p.base, p.s.drawings, next, p.s.drawings, vid));
  return true;
}

/** What a reset can take back (see `listDifferences`). */
export type ResetKey =
  | { t: 'stage'; keys: string[] }
  | { t: 'layer'; id: Id }
  | { t: 'layerGone'; id: Id }
  | { t: 'layerNew'; id: Id }
  | { t: 'order' }
  | { t: 'cel'; layer: Id; id: Id }
  | { t: 'celGone'; layer: Id; id: Id }
  | { t: 'celNew'; layer: Id; id: Id }
  | { t: 'drawing'; id: Id }
  | { t: 'sound'; id: Id }
  | { t: 'soundGone'; id: Id }
  | { t: 'soundNew'; id: Id }
  | { t: 'soundOrder' }
  | { t: 'palette' }
  /** Several drawings at once (a recolour that ran across a layer's keys). */
  | { t: 'drawings'; ids: Id[] };

/** The overrides without one thing: that item follows the original again. Pure. */
export function withoutOverride(ov: VariationOverrides, k: ResetKey): VariationOverrides {
  const o = plainOv(ov);
  const layers = o.layers;
  const celList = (lid: Id) => layers?.items?.[lid]?.sub;
  switch (k.t) {
    case 'stage':
      for (const key of k.keys) {
        if (o.stage?.set) delete o.stage.set[key];
        if (o.stage?.del) o.stage.del = o.stage.del.filter((x) => x !== key);
      }
      if (o.stage && !Object.keys(o.stage.set ?? {}).length) delete o.stage.set;
      break;
    case 'layer':
      if (layers?.items?.[k.id]) delete layers.items[k.id].patch;
      break;
    case 'layerGone':
      if (layers?.removed) layers.removed = layers.removed.filter((x) => x !== k.id);
      break;
    case 'layerNew':
      if (layers?.added) layers.added = layers.added.filter((x) => x.id !== k.id);
      if (layers?.order) layers.order = layers.order.filter((x) => x !== k.id);
      break;
    case 'order':
      if (layers) delete layers.order;
      break;
    case 'cel': {
      const s = celList(k.layer);
      if (s?.items) delete s.items[k.id];
      break;
    }
    case 'celGone': {
      const s = celList(k.layer);
      if (s?.removed) s.removed = s.removed.filter((x) => x !== k.id);
      break;
    }
    case 'celNew': {
      const s = celList(k.layer);
      if (s?.added) s.added = s.added.filter((x) => x.id !== k.id);
      break;
    }
    case 'sound':
      if (o.audio?.items) delete o.audio.items[k.id];
      break;
    case 'soundGone':
      if (o.audio?.removed) o.audio.removed = o.audio.removed.filter((x) => x !== k.id);
      break;
    case 'soundNew':
      if (o.audio?.added) o.audio.added = o.audio.added.filter((x) => x.id !== k.id);
      if (o.audio?.order) o.audio.order = o.audio.order.filter((x) => x !== k.id);
      break;
    case 'soundOrder':
      if (o.audio) delete o.audio.order;
      break;
    case 'palette':
      delete o.palette;
      break;
    case 'drawing':
      if (o.drawings) delete o.drawings[k.id];
      break;
    case 'drawings':
      for (const id of k.ids) if (o.drawings) delete o.drawings[id];
      break;
  }
  return normalize(o);
}

const plainOv = (ov: VariationOverrides): VariationOverrides => {
  // Typed arrays never live in overrides (own pixel drawings are in doc.drawings), so cloning is safe.
  return structuredClone(ov);
};

/** Takes one change back: that item follows the original again. */
export function resetDifference(d: Doc, vid: Id, k: ResetKey): boolean {
  const p = parts(d, vid);
  if (!p) return false;
  const next = withoutOverride(p.a.overrides ?? {}, k);
  const ids = k.t === 'drawing' ? [k.id] : k.t === 'drawings' ? k.ids : [];
  install(d, vid, next, ids.filter((id) => p.a.overrides?.drawings?.[id]?.replaced).map((id) => aliasId(id, vid)));
  return true;
}

/**
 * Gives a variation another size, and frames the original's picture in it with a camera (the original's own camera
 * keys are zoomed to fit, or a camera layer is added). 'fill' covers the new picture and crops what hangs over; 'bars'
 * shows the whole original. The original's own size brings the framing back off. Returns false if it isn't a variation.
 */
export function setVariationSize(d: Doc, vid: Id, w: number, h: number, mode: FitMode = 'fill'): boolean {
  const p = parts(d, vid);
  if (!p) return false;
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  // Worked on with a drawing of its own for every key, which is what the camera keys below are changed through.
  const r = resolveContent(p.base, p.s.drawings, p.a.overrides, vid, p.s.drawings, undefined, true);
  const cur = p.open ? takeContent(p.s) : { ...p.a.content!, layers: r.content.layers };
  const content: ArtboardContent = { ...cur, width: W, height: H };
  const drawings: Record<Id, Drawing> = { ...p.s.drawings, ...r.drawings };
  const fid = framingLayerId(vid);
  const same = W === p.base.width && H === p.base.height;
  const k = same ? 1 : fitPlacement(p.base.width, p.base.height, W, H, mode).k;
  let layers = content.layers.filter((l) => l.id !== fid);
  const ownCam = p.base.layers.find((l) => l.kind === 'camera' && l.visible);
  if (ownCam) {
    // The original's camera: every key zoomed by the fit (a ratio, so in-betweens come out right too).
    for (const c of ownCam.cels) {
      const alias = aliasId(c.drawingId, vid);
      const b = p.s.drawings[c.drawingId];
      if (!b || b.kind !== 'camera' || !drawings[alias] || drawings[alias].kind !== 'camera') continue;
      drawings[alias] = { ...drawings[alias], view: { ...(drawings[alias] as { view: object }).view, zoom: b.view.zoom * k } } as Drawing;
    }
  } else if (!same) {
    const old = content.layers.find((l) => l.id === fid);
    const dId = old?.cels[0]?.drawingId ?? uid('v');
    drawings[dId] = { id: dId, kind: 'camera', view: { x: p.base.width / 2, y: p.base.height / 2, zoom: k, rotation: 0 } };
    layers = [...layers, { id: fid, name: 'Framing', kind: 'camera', visible: true, locked: false, opacity: 1, cels: [{ id: `${fid}-key`, start: 0, length: Math.max(1, content.length), drawingId: dId }] } as Layer];
  }
  content.layers = layers;
  const ov = diffContent(p.base, p.s.drawings, content, drawings, vid);
  // Drawings made here (the framing key) live in doc.drawings under their own id; the changed aliases come with them.
  for (const l of ov.layers?.added ?? []) for (const c of l.cels) if (drawings[c.drawingId] && !p.s.drawings[c.drawingId]) d.drawings[c.drawingId] = drawings[c.drawingId] as never;
  for (const [key, v] of Object.entries(drawings)) {
    const sp = splitAlias(key);
    if (sp?.vid === vid && ov.drawings?.[sp.orig] && p.s.drawings[key] !== v) d.drawings[key] = v as never;
  }
  install(d, vid, ov);
  return true;
}

// ---------------------------------------------------------------- the list of differences

export interface DiffItem {
  /** Stable, for lists. */
  key: string;
  /** What to take back to follow the original again. */
  reset: ResetKey;
  /** What it belongs to: a layer's name, or "Whole artboard". */
  group: string;
  /** In plain words. */
  label: string;
  layer?: Id;
  frame?: number;
  /** Shapes to select when jumping to it. */
  shapes?: Id[];
}

const LAYER_WORDS: Record<string, string> = {
  visible: 'shown or hidden',
  locked: 'locked',
  opacity: 'opacity',
  name: 'name',
  blend: 'blend mode',
  effects: 'effects',
  depth: 'depth',
  label: 'colour label',
  folder: 'folder',
  mask: 'mask',
  clipToBelow: 'clip to below',
  reference: 'reference',
  onion: 'onion skin',
  bind: 'bone',
  pixelSize: 'pixel size',
  drawMode: 'draw mode',
  rig: 'bones',
};

const CEL_WORDS: Record<string, string> = { start: 'moved', length: 'held for a different time', tween: 'in-between', drawingId: 'drawing', autoHold: 'hold' };

const STAGE_WORDS: Record<string, string> = { background: 'Background colour', clips: 'Clips', markers: 'Markers', flow: 'Clip flow', guides: 'Guides', inOut: 'In and out points', perspective: 'Perspective guides', length: 'Length' };

const COLOUR_KEYS = new Set(['fill', 'color', 'stroke', 'gradient', 'strokeColor', 'strokeGradient', 'fillGradient', 'palette']);

const list = (words: string[]): string => {
  const u = [...new Set(words)];
  return u.length <= 1 ? (u[0] ?? '') : `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
};

const keysOf = (p: Patch | undefined): string[] => [...Object.keys(p?.set ?? {}), ...(p?.del ?? [])];

/** Everything a variation changes from its original, as a list a person can read, jump to and reset. */
export function listDifferences(doc: Doc, vid: Id): DiffItem[] {
  const a = findArtboard(doc, vid);
  const ov = a?.overrides;
  const src = a && sourceOf(doc, a);
  const base = src && baseOf(doc, src);
  if (!a || !ov || !src || !base) return [];
  const cur = a.content ?? takeContent(doc);
  const out: DiffItem[] = [];
  const add = (it: Omit<DiffItem, 'key'>) => out.push({ ...it, key: JSON.stringify(it.reset) });
  const whole = 'Whole artboard';

  // The stage.
  const sk = new Set([...keysOf(ov.stage)]);
  if (sk.has('width') || sk.has('height')) add({ reset: { t: 'stage', keys: ['width', 'height'] }, group: whole, label: `Size ${cur.width} x ${cur.height} (the original is ${base.width} x ${base.height})` });
  for (const k of sk) {
    if (k === 'width' || k === 'height') continue;
    const extra = k === 'length' ? ` ${cur.length} frames (the original has ${base.length})` : '';
    add({ reset: { t: 'stage', keys: [k] }, group: whole, label: `${STAGE_WORDS[k] ?? k}${extra ? ':' + extra : ''}` });
  }

  // Layers.
  const nameOf = (id: Id) => cur.layers.find((l) => l.id === id)?.name ?? base.layers.find((l) => l.id === id)?.name ?? 'Layer';
  const frameOf = (lid: Id, cid: Id): number | undefined => cur.layers.find((l) => l.id === lid)?.cels.find((c) => c.id === cid)?.start ?? base.layers.find((l) => l.id === lid)?.cels.find((c) => c.id === cid)?.start;
  const L = ov.layers;
  for (const id of L?.removed ?? []) add({ reset: { t: 'layerGone', id }, group: nameOf(id), label: 'Left out of this variation' });
  for (const l of L?.added ?? []) add({ reset: { t: 'layerNew', id: l.id }, group: l.name, label: 'A layer only this variation has', layer: l.id });
  if (L?.order) add({ reset: { t: 'order' }, group: whole, label: 'Layers in a different order' });
  for (const [lid, it] of Object.entries(L?.items ?? {})) {
    const name = nameOf(lid);
    if (it.patch) add({ reset: { t: 'layer', id: lid }, group: name, label: `Layer: ${list(keysOf(it.patch).map((k) => LAYER_WORDS[k] ?? k))} changed`, layer: lid });
    for (const [cid, ci] of Object.entries(it.sub?.items ?? {})) {
      const f = frameOf(lid, cid);
      add({ reset: { t: 'cel', layer: lid, id: cid }, group: name, label: `Key${f === undefined ? '' : ` at frame ${f + 1}`}: ${list(keysOf(ci.patch).map((k) => CEL_WORDS[k] ?? k))}`, layer: lid, frame: f });
    }
    for (const cid of it.sub?.removed ?? []) {
      const f = frameOf(lid, cid);
      add({ reset: { t: 'celGone', layer: lid, id: cid }, group: name, label: `Key${f === undefined ? '' : ` at frame ${f + 1}`} left out`, layer: lid, frame: f });
    }
    for (const c of it.sub?.added ?? []) add({ reset: { t: 'celNew', layer: lid, id: c.id }, group: name, label: `New key at frame ${c.start + 1}`, layer: lid, frame: c.start });
  }

  // Sound and palette.
  const A = ov.audio;
  const sound = 'Sound';
  const clipName = (id: Id) => cur.audio?.find((c) => c.id === id)?.name ?? base.audio?.find((c) => c.id === id)?.name ?? 'Sound';
  const SOUND_WORDS: Record<string, string> = { volume: 'volume', muted: 'muted', start: 'moved', name: 'name' };
  for (const id of A?.removed ?? []) add({ reset: { t: 'soundGone', id }, group: sound, label: `${clipName(id)}: left out of this variation` });
  for (const c of A?.added ?? []) add({ reset: { t: 'soundNew', id: c.id }, group: sound, label: `${c.name}: a sound only this variation has` });
  for (const [id, it] of Object.entries(A?.items ?? {})) add({ reset: { t: 'sound', id }, group: sound, label: `${clipName(id)}: ${list(keysOf(it.patch).map((k) => SOUND_WORDS[k] ?? k))} changed` });
  if (A?.order) add({ reset: { t: 'soundOrder' }, group: sound, label: 'Sounds in a different order' });
  if (ov.palette) add({ reset: { t: 'palette' }, group: whole, label: `Palette: its own colours (${ov.palette.colors.length}), the original's stay as they are` });

  // Drawings: found through the first key that shows them, and joined up per layer (a recolour across 24 keys is one line).
  interface Tally {
    ids: Id[];
    recoloured: number;
    changed: number;
    removed: number;
    added: number;
    flags: Set<string>;
    shapes: Id[];
    first: { layer: Layer; cel: Cel } | null;
  }
  const tallies = new Map<string, Tally>();
  for (const [orig, d] of Object.entries(ov.drawings ?? {})) {
    const alias = aliasId(orig, vid);
    let where: { layer: Layer; cel: Cel } | null = null;
    for (const l of cur.layers) {
      const c = l.cels.find((x) => x.drawingId === alias);
      if (c) {
        where = { layer: l, cel: c };
        break;
      }
    }
    const key = where?.layer.id ?? '';
    let t = tallies.get(key);
    if (!t) tallies.set(key, (t = { ids: [], recoloured: 0, changed: 0, removed: 0, added: 0, flags: new Set(), shapes: [], first: null }));
    t.ids.push(orig);
    if (where && (!t.first || where.cel.start < t.first.cel.start)) {
      t.first = where;
      t.shapes = [];
    }
    if (d.replaced) t.flags.add('redrawn');
    if (d.view) t.flags.add('camera view');
    if (d.patch) t.flags.add('drawing settings');
    const items = Object.entries(d.shapes?.items ?? {});
    t.recoloured += items.filter(([, it]) => keysOf(it.patch).some((k) => COLOUR_KEYS.has(k))).length;
    t.changed += items.filter(([, it]) => keysOf(it.patch).some((k) => !COLOUR_KEYS.has(k))).length;
    t.removed += d.shapes?.removed?.length ?? 0;
    t.added += d.shapes?.added?.length ?? 0;
    if (d.shapes?.order) t.flags.add('shapes in a different order');
    if (t.first === where) t.shapes = [...items.map(([sid]) => sid), ...(d.shapes?.added ?? []).map((x) => x.id)];
  }
  const n = (c: number, w: string) => `${c} ${w}${c === 1 ? '' : 's'}`;
  for (const [, t] of tallies) {
    const words = [...t.flags];
    if (t.recoloured) words.push(`${n(t.recoloured, 'shape')} recoloured`);
    if (t.changed) words.push(`${n(t.changed, 'shape')} changed`);
    if (t.removed) words.push(`${n(t.removed, 'shape')} left out`);
    if (t.added) words.push(`${n(t.added, 'shape')} added`);
    const where = t.first;
    const many = t.ids.length > 1;
    add({
      reset: many ? { t: 'drawings', ids: t.ids } : { t: 'drawing', id: t.ids[0] },
      group: where ? where.layer.name : whole,
      label: `${many ? `Drawings on ${t.ids.length} keys` : `Drawing${where ? ` at frame ${where.cel.start + 1}` : ''}`}: ${list(words) || 'changed'}`,
      layer: where?.layer.id,
      frame: where?.cel.start,
      shapes: t.shapes,
    });
  }
  return out;
}

/** How many differences a variation has (for a badge). */
export function differenceCount(doc: Doc, vid: Id): number {
  return listDifferences(doc, vid).length;
}

/** Other artboards to show in the export picker: the artboard's family, original first. */
export function familyIds(doc: Doc, id: Id): Id[] {
  const f = familyOf(doc, id);
  return f.length > 1 ? f.map((a) => a.id) : [];
}

/** The document with a variation open (used when a file is opened on the variation it was saved on). */
export function switchOpenVariation(doc: Doc, id: Id): Doc {
  const a = findArtboard(doc, id);
  if (!a?.variationOf || !a.content) return doc;
  return produce(doc, (d) => {
    if (!switchArtboard(d as Doc, id)) return;
    // Same as the store's settler does on any switch: every key of the open variation gets its own drawing.
    const s = snap(d as Doc);
    const own = openAliasing(s, findArtboard(s, id)!);
    if (!own) return;
    d.layers = own.layers as never;
    editDrawings(d, own.drawings, []);
  });
}

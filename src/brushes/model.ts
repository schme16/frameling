// Named brushes: pure functions, no DOM. A preset is one BrushSettings with a name and the tool it came from. The
// starters come with Frameling and never change; yours are kept in the browser's storage (store.ts) and can be shared
// as a small file or as text.
import { DEFAULT_BRUSH } from '../core/doc';
import type { BrushSettings } from '../core/format';
import { brushFrom } from '../core/uiMemory';
import { defaultTip, sameTip } from '../geometry/tip';
import { cleanSpec, sameSpec, specTool, type PixelSpec } from '../dab/spec';
import { cleanGroup } from './library';
import { isMergedAway, MERGED_PAIRS } from './pairs';
import { PIXEL_STARTERS } from './pixelStarters';
import { STARTERS } from './starters';
import { toPixel, toVector } from './translate';

/** Which tool a brush came from: the vector Brush, or one of the pixel brush tools (the Pixel brush, soft paint, Chalk and charcoal). */
export type PresetTool = 'brush' | 'pixel';

export interface BrushPreset {
  id: string;
  name: string;
  tool: PresetTool;
  /** The vector brush. A pixel brush keeps the standard one here, which nothing reads, so the vector side needs no branches. */
  brush: BrushSettings;
  /** What a pixel brush (tool 'pixel') holds: the tool and its settings. Left out on a vector brush. */
  pixel?: PixelSpec;
  /** One of the starters that come with Frameling: it can be picked and copied, never changed or deleted. */
  builtin?: boolean;
  /** The group it sits in in the picker (see library.ts). Left out means "My brushes". */
  group?: string;
  /**
   * The other half, when the brush was made on both sides: a pixel brush for a vector brush (`tool` 'brush'), a vector
   * brush for a pixel brush (`tool` 'pixel'). Left out, the other half is worked out from this one when a layer of that
   * kind needs it (translate.ts), and this brush never changes for it.
   */
  pair?: PixelSpec | BrushSettings;
}

const isSpec = (x: PixelSpec | BrushSettings | undefined): x is PixelSpec => !!x && 'kind' in x;

/** The pixel half a vector brush was made with, if it was made with one. */
export const madePixel = (p: BrushPreset): PixelSpec | undefined => (p.tool === 'pixel' ? p.pixel : isSpec(p.pair) ? p.pair : undefined);
/** The vector half a pixel brush was made with, if it was made with one. */
export const madeVector = (p: BrushPreset): BrushSettings | undefined => (p.tool === 'brush' ? p.brush : p.pair && !isSpec(p.pair) ? p.pair : undefined);

const vectorCache = new WeakMap<BrushPreset, BrushSettings>();
const pixelCache = new WeakMap<BrushPreset, PixelSpec>();

/** The brush as it is drawn on a vector layer: its own vector half, or the pixel one worked out as a vector brush. The same object each time. */
export function vectorHalf(p: BrushPreset): BrushSettings {
  const made = madeVector(p);
  if (made) return made;
  let v = vectorCache.get(p);
  if (!v) {
    v = p.pixel ? toVector(p.pixel) : p.brush;
    vectorCache.set(p, v);
  }
  return v;
}

/** The brush as it is drawn on a pixel layer: its own pixel half, or the vector one worked out as a pixel brush. The same object each time. */
export function pixelHalf(p: BrushPreset): PixelSpec {
  const made = madePixel(p);
  if (made) return made;
  let v = pixelCache.get(p);
  if (!v) {
    v = toPixel(p.brush);
    pixelCache.set(p, v);
  }
  return v;
}

/** True when this side's half of the brush was made, not worked out. */
export const madeOn = (p: BrushPreset, side: 'vector' | 'pixel'): boolean => (side === 'pixel' ? !!madePixel(p) : !!madeVector(p));

/** How many brushes of your own you can keep. A paid brush pack runs to a few hundred; the picker only draws open groups. */
export const MAX_PRESETS = 1000;
export const MAX_NAME = 40;
export const BRUSHES_FORMAT = 'frameling-brushes';
export const BRUSHES_VERSION = 1;
export const BRUSHES_EXT = '.frameling-brushes.json';
/** Bigger than this isn't a brush file (1000 brushes with names and groups come to about 400 KB). */
export const MAX_BRUSHES_BYTES = 1024 * 1024;

export { STARTERS } from './starters';
export { PIXEL_STARTERS } from './pixelStarters';

/** A name as it is kept: spaces tidied, cut to length. Empty when there is nothing in it. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** A name that isn't taken (capitals ignored): "Ink", then "Ink 2", "Ink 3". */
export function uniqueName(name: string, taken: readonly string[]): string {
  const base = cleanName(name) || 'My brush';
  if (!taken.some((t) => same(t, base))) return base;
  for (let n = 2; ; n++) {
    const tail = ` ${n}`;
    const tryName = base.slice(0, MAX_NAME - tail.length).trim() + tail;
    if (!taken.some((t) => same(t, tryName))) return tryName;
  }
}

/** True when two brushes are the same brush (numbers within a hair, since a slider can leave rounding behind). */
export function sameBrush(a: BrushSettings, b: BrushSettings): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  return close(a.size, b.size) && close(a.thinning, b.thinning) && close(a.smoothing, b.smoothing) && close(a.streamline, b.streamline) && close(a.taperStart, b.taperStart) && close(a.taperEnd, b.taperEnd) && a.capStart === b.capStart && a.capEnd === b.capEnd && sameTip(a.tip, b.tip);
}

const pixelStarter = new Map(PIXEL_STARTERS.map((p) => [p.id, p]));
const pairOf = new Map(MERGED_PAIRS);

/**
 * The starters as the one list has them: a vector starter and a pixel starter that draw the same thing are one brush with
 * two halves, and the rest are on their own (their other half is worked out). The look-alikes are still two brushes.
 */
export const LISTED_STARTERS: readonly BrushPreset[] = [
  ...STARTERS.map((s) => {
    const mate = pixelStarter.get(pairOf.get(s.id) ?? '');
    return mate?.pixel ? { ...s, pair: mate.pixel } : s;
  }),
  ...PIXEL_STARTERS.filter((p) => !isMergedAway(p.id)),
];

/** Every brush to show: the starters, then yours. */
export const allPresets = (mine: readonly BrushPreset[]): BrushPreset[] => [...LISTED_STARTERS, ...mine];

/** The brushes a kind of layer lists. The same for both: one list, and a brush made for the other kind is drawn through its translation. */
export const onSide = (all: readonly BrushPreset[], _side: 'vector' | 'pixel'): BrushPreset[] => [...all];

/** Reads one preset out of saved or shared data. Anything off about a field falls back to the standard brush for it. */
export function sanitizePreset(raw: unknown, id: string): BrushPreset | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = cleanName(r.name);
  if (!name) return null;
  if (r.tool !== undefined && r.tool !== 'brush' && r.tool !== 'pixel') return null;
  const group = cleanGroup(r.group);
  if (r.tool === 'pixel') {
    const pixel = cleanSpec(r.pixel);
    if (!pixel) return null;
    const mate = r.pair === undefined ? undefined : brushFrom(r.pair, DEFAULT_BRUSH);
    const one: BrushPreset = { id, name, tool: 'pixel', brush: DEFAULT_BRUSH, pixel };
    if (mate) one.pair = mate;
    if (group) one.group = group;
    return one;
  }
  const brush = brushFrom(r.brush, DEFAULT_BRUSH);
  if (!brush) return null;
  const mate = r.pair === undefined ? undefined : cleanSpec(r.pair);
  const one: BrushPreset = { id, name, tool: 'brush', brush };
  if (mate) one.pair = mate;
  if (group) one.group = group;
  return one;
}

/** A preset as it is written to storage or a file: its own half, the other half when it was made, and its group. */
export function presetBody(p: BrushPreset, withId = false): Record<string, unknown> {
  const own = p.tool === 'pixel' ? { name: p.name, tool: p.tool, pixel: p.pixel } : { name: p.name, tool: p.tool, brush: p.brush };
  const body: Record<string, unknown> = withId ? { id: p.id, ...own } : own;
  if (p.pair) body.pair = p.pair;
  if (p.group) body.group = p.group;
  return body;
}

/** Reads a saved list. Damaged entries are left out, names are made unique, and the list is held to its limit. */
export function sanitizeList(raw: unknown): BrushPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: BrushPreset[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_PRESETS) break;
    const idIn = item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : '';
    const id = idIn && !idIn.startsWith('starter:') && !ids.has(idIn) ? idIn : `b${out.length}x${ids.size}`;
    const p = sanitizePreset(item, id);
    if (!p) continue;
    p.name = uniqueName(p.name, allPresets(out).map((x) => x.name));
    ids.add(p.id);
    out.push(p);
  }
  return out;
}

export type SaveResult = { list: BrushPreset[]; preset: BrushPreset; replaced: boolean };

/**
 * Saves a brush under a name. A name you already used replaces that brush (the same id, so it stays where it was);
 * a name a starter has gets a number after it. Returns null when the name is empty or the list is full.
 */
export function savePreset(list: readonly BrushPreset[], name: string, brush: BrushSettings, newId: string, group?: string): SaveResult | null {
  return saveAny(list, name, newId, group, 'brush', (p) => ({ ...p, brush: { ...brush } }), { brush: { ...brush } });
}

/** Saves a pixel brush under a name, with the same rules as savePreset. A vector brush with that name is left alone (the new one gets a number). */
export function savePixelPreset(list: readonly BrushPreset[], name: string, pixel: PixelSpec, newId: string, group?: string): SaveResult | null {
  return saveAny(list, name, newId, group, 'pixel', (p) => ({ ...p, pixel }), { brush: DEFAULT_BRUSH, pixel });
}

function saveAny(list: readonly BrushPreset[], name: string, newId: string, group: string | undefined, tool: PresetTool, change: (p: BrushPreset) => BrushPreset, fields: Pick<BrushPreset, 'brush' | 'pixel'>): SaveResult | null {
  const clean = cleanName(name);
  if (!clean) return null;
  const mineSame = list.find((p) => same(p.name, clean) && p.tool === tool);
  if (mineSame) {
    const preset = change(mineSame);
    if (group !== undefined) setGroup(preset, group);
    return { list: list.map((p) => (p === mineSame ? preset : p)), preset, replaced: true };
  }
  if (list.length >= MAX_PRESETS) return null;
  const taken = [...STARTERS, ...PIXEL_STARTERS, ...list.filter((p) => p.tool !== tool)].map((s) => s.name);
  const preset: BrushPreset = { id: newId, name: uniqueName(clean, taken), tool, ...fields };
  setGroup(preset, group);
  return { list: [...list, preset], preset, replaced: false };
}

/** Puts a brush in a group (or back in "My brushes" when the group is empty or is that name). */
function setGroup(p: BrushPreset, raw: string | undefined): void {
  const g = cleanGroup(raw);
  if (g) p.group = g;
  else delete p.group;
}

/** Moves a saved brush to a group. An empty group puts it back in "My brushes". Starters stay where they are. */
export function movePreset(list: readonly BrushPreset[], id: string, group: string): BrushPreset[] {
  return list.map((p) => {
    if (p.id !== id) return p;
    const next = { ...p };
    setGroup(next, group);
    return next;
  });
}

/** Puts a brush into a saved one, keeping its name. Starters are left alone. */
export function updatePreset(list: readonly BrushPreset[], id: string, brush: BrushSettings): BrushPreset[] {
  // A brush made as a pixel brush keeps this as the vector half it now has made.
  return list.map((p) => (p.id === id ? (p.tool === 'brush' ? { ...p, brush: { ...brush } } : { ...p, pair: { ...brush } }) : p));
}

/** Puts a pixel brush into a saved one, keeping its name. */
export function updatePixelPreset(list: readonly BrushPreset[], id: string, pixel: PixelSpec): BrushPreset[] {
  return list.map((p) => (p.id === id ? (p.tool === 'pixel' ? { ...p, pixel } : { ...p, pair: pixel }) : p));
}

/** Gives a saved brush a new name (a number after it if another has it). Unchanged when the name is empty. */
export function renamePreset(list: readonly BrushPreset[], id: string, name: string): BrushPreset[] {
  const clean = cleanName(name);
  const at = list.find((p) => p.id === id);
  if (!clean || !at) return [...list];
  const taken = allPresets(list.filter((p) => p.id !== id)).map((p) => p.name);
  return list.map((p) => (p.id === id ? { ...p, name: uniqueName(clean, taken) } : p));
}

export function deletePreset(list: readonly BrushPreset[], id: string): BrushPreset[] {
  return list.filter((p) => p.id !== id);
}

/** The brush the one in use matches, if any (yours first, so a copy of a starter reads as yours). */
export function matchPreset(brush: BrushSettings, mine: readonly BrushPreset[]): BrushPreset | undefined {
  const is = (p: BrushPreset) => !!madeVector(p) && sameBrush(vectorHalf(p), brush);
  return mine.find(is) ?? LISTED_STARTERS.find(is);
}

/** The pixel brush the one in use matches, if any (yours first). */
export function matchPixelPreset(spec: PixelSpec, mine: readonly BrushPreset[]): BrushPreset | undefined {
  const is = (p: BrushPreset) => !!madePixel(p) && sameSpec(pixelHalf(p), spec);
  return mine.find(is) ?? LISTED_STARTERS.find(is);
}

export interface PresetState {
  /** The brush that is lit in the row (none when the brush matches nothing and nothing was picked). */
  activeId: string | null;
  /** The one you picked, but you have moved a slider since. */
  changed: boolean;
}

/** Which brush is lit, and whether you have changed it since picking it. `pickedId` is the last one picked this session. */
export function presetState(brush: BrushSettings, mine: readonly BrushPreset[], pickedId: string | null): PresetState {
  const picked = pickedId ? allPresets(mine).find((p) => p.id === pickedId) : undefined;
  if (picked) return { activeId: picked.id, changed: !sameBrush(vectorHalf(picked), brush) };
  const m = matchPreset(brush, mine);
  return { activeId: m ? m.id : null, changed: false };
}

/** Which pixel brush is lit, and whether you have changed it since picking it. `spec` is the pixel brush in use (null when none is). */
export function pixelPresetState(spec: PixelSpec | null, mine: readonly BrushPreset[], pickedId: string | null): PresetState {
  if (!spec) return { activeId: null, changed: false };
  // The one you picked only stays lit while you are still on its tool (a charcoal brush is not lit on the airbrush).
  const picked = pickedId ? allPresets(mine).find((p) => p.id === pickedId && specTool(pixelHalf(p)) === specTool(spec)) : undefined;
  if (picked) return { activeId: picked.id, changed: !sameSpec(pixelHalf(picked), spec) };
  const m = matchPixelPreset(spec, mine);
  return { activeId: m ? m.id : null, changed: false };
}

/** The next (or previous) brush in the row, wrapping round. From a brush that matches nothing, the first (or the last). */
export function stepPreset(all: readonly BrushPreset[], activeId: string | null, by: 1 | -1): BrushPreset | undefined {
  if (!all.length) return undefined;
  const at = all.findIndex((p) => p.id === activeId);
  if (at < 0) return by === 1 ? all[0] : all[all.length - 1];
  return all[(at + by + all.length) % all.length];
}

// ---------------------------------------------------------------- sharing

/** The text to save or copy for these brushes (the starters are never in it: everyone has them). */
export function brushesToText(list: readonly BrushPreset[]): string {
  const presets = list
    .filter((p) => !p.builtin)
    .map((p) => presetBody(p));
  return JSON.stringify({ format: BRUSHES_FORMAT, version: BRUSHES_VERSION, presets }, null, 2);
}

/** A file name for a shared set: "my-brushes.frameling-brushes.json". */
export const brushesFileName = (): string => `my-brushes${BRUSHES_EXT}`;

/** A brush as it arrives in a shared file: a vector one has `brush`, a pixel one has `pixel`. */
export interface SharedBrush {
  name: string;
  brush: BrushSettings;
  group?: string;
  pixel?: PixelSpec;
  /** The other half, when it was made (see BrushPreset.pair). */
  pair?: PixelSpec | BrushSettings;
}

export type ParseResult = { ok: true; presets: SharedBrush[]; skipped: number } | { ok: false; error: string };

/** Reads brushes out of text (a file's or what was pasted). Nothing in it is trusted. */
export function parseBrushesText(text: unknown): ParseResult {
  if (typeof text !== 'string') return { ok: false, error: 'That is not a set of brushes.' };
  if (text.length > MAX_BRUSHES_BYTES) return { ok: false, error: 'That is too big to be a set of brushes.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'That is not a set of brushes. It should be a file or text copied from Frameling.' };
  }
  const f = raw as Record<string, unknown> | null;
  if (!f || typeof f !== 'object' || f.format !== BRUSHES_FORMAT) return { ok: false, error: 'That is not a set of Frameling brushes.' };
  if (typeof f.version === 'number' && f.version > BRUSHES_VERSION) return { ok: false, error: 'Those brushes are from a newer Frameling. Update Frameling to use them.' };
  if (!Array.isArray(f.presets)) return { ok: false, error: 'There are no brushes in that.' };
  const presets: SharedBrush[] = [];
  let skipped = 0;
  for (const item of f.presets) {
    const p = presets.length < MAX_PRESETS ? sanitizePreset(item, 'in') : null;
    if (p) {
      const one: SharedBrush = { name: p.name, brush: p.brush };
      if (p.pixel) one.pixel = p.pixel;
      if (p.pair) one.pair = p.pair;
      if (p.group) one.group = p.group;
      presets.push(one);
    } else skipped++;
  }
  if (!presets.length) return { ok: false, error: 'There are no brushes in that.' };
  return { ok: true, presets, skipped };
}

/** Adds shared brushes to your list under fresh ids, with names that don't clash. Stops at the limit. */
export function addShared(list: readonly BrushPreset[], incoming: readonly SharedBrush[], newId: () => string): { list: BrushPreset[]; added: number } {
  const out = [...list];
  let added = 0;
  for (const it of incoming) {
    if (out.length >= MAX_PRESETS) break;
    const p: BrushPreset = { id: newId(), name: uniqueName(it.name, allPresets(out).map((p) => p.name)), tool: it.pixel ? 'pixel' : 'brush', brush: { ...it.brush } };
    if (it.pixel) p.pixel = it.pixel;
    if (it.pair) p.pair = it.pair;
    setGroup(p, it.group);
    out.push(p);
    added++;
  }
  return { list: out, added };
}

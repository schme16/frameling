// Named brushes: pure functions, no DOM. A preset is one BrushSettings with a name and the tool it came from. The
// starters come with Frameling and never change; yours are kept in the browser's storage (store.ts) and can be shared
// as a small file or as text.
import { DEFAULT_BRUSH } from '../core/doc';
import type { BrushSettings } from '../core/format';
import { brushFrom } from '../core/uiMemory';

/** Which tool a brush came from. Only the brush for now; the field is there so more can follow without a new format. */
export type PresetTool = 'brush';

export interface BrushPreset {
  id: string;
  name: string;
  tool: PresetTool;
  brush: BrushSettings;
  /** One of the starters that come with Frameling: it can be picked and copied, never changed or deleted. */
  builtin?: boolean;
}

export const MAX_PRESETS = 100;
export const MAX_NAME = 40;
export const BRUSHES_FORMAT = 'frameling-brushes';
export const BRUSHES_VERSION = 1;
export const BRUSHES_EXT = '.frameling-brushes.json';
/** Bigger than this isn't a brush file. */
export const MAX_BRUSHES_BYTES = 256 * 1024;

const make = (id: string, name: string, brush: Partial<BrushSettings>): BrushPreset => ({ id: `starter:${id}`, name, tool: 'brush', builtin: true, brush: { ...DEFAULT_BRUSH, ...brush } });

/** The few good brushes that come with Frameling. */
export const STARTERS: readonly BrushPreset[] = [
  make('ink', 'Ink', { size: 5, thinning: 0.5, smoothing: 0.7, streamline: 0.7 }),
  make('marker', 'Marker', { size: 28, thinning: 0, smoothing: 0.5, streamline: 0.4 }),
  make('pencil', 'Pencil', { size: 2, thinning: 0.25, smoothing: 0.3, streamline: 0.25 }),
  make('tapered', 'Tapered brush', { size: 14, thinning: 0.6, smoothing: 0.6, streamline: 0.6, taperStart: 40, taperEnd: 60 }),
];

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
  return close(a.size, b.size) && close(a.thinning, b.thinning) && close(a.smoothing, b.smoothing) && close(a.streamline, b.streamline) && close(a.taperStart, b.taperStart) && close(a.taperEnd, b.taperEnd) && a.capStart === b.capStart && a.capEnd === b.capEnd;
}

/** Every brush to show: the starters, then yours. */
export const allPresets = (mine: readonly BrushPreset[]): BrushPreset[] => [...STARTERS, ...mine];

/** Reads one preset out of saved or shared data. Anything off about a field falls back to the standard brush for it. */
export function sanitizePreset(raw: unknown, id: string): BrushPreset | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = cleanName(r.name);
  if (!name) return null;
  if (r.tool !== undefined && r.tool !== 'brush') return null;
  const brush = brushFrom(r.brush, DEFAULT_BRUSH);
  if (!brush) return null;
  return { id, name, tool: 'brush', brush };
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
export function savePreset(list: readonly BrushPreset[], name: string, brush: BrushSettings, newId: string): SaveResult | null {
  const clean = cleanName(name);
  if (!clean) return null;
  const mineSame = list.find((p) => same(p.name, clean));
  if (mineSame) {
    const preset = { ...mineSame, brush: { ...brush } };
    return { list: list.map((p) => (p === mineSame ? preset : p)), preset, replaced: true };
  }
  if (list.length >= MAX_PRESETS) return null;
  const preset: BrushPreset = { id: newId, name: uniqueName(clean, STARTERS.map((s) => s.name)), tool: 'brush', brush: { ...brush } };
  return { list: [...list, preset], preset, replaced: false };
}

/** Puts a brush into a saved one, keeping its name. Starters are left alone. */
export function updatePreset(list: readonly BrushPreset[], id: string, brush: BrushSettings): BrushPreset[] {
  return list.map((p) => (p.id === id ? { ...p, brush: { ...brush } } : p));
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
  return mine.find((p) => sameBrush(p.brush, brush)) ?? STARTERS.find((p) => sameBrush(p.brush, brush));
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
  if (picked) return { activeId: picked.id, changed: !sameBrush(picked.brush, brush) };
  const m = matchPreset(brush, mine);
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
  const presets = list.filter((p) => !p.builtin).map((p) => ({ name: p.name, tool: p.tool, brush: p.brush }));
  return JSON.stringify({ format: BRUSHES_FORMAT, version: BRUSHES_VERSION, presets }, null, 2);
}

/** A file name for a shared set: "my-brushes.frameling-brushes.json". */
export const brushesFileName = (): string => `my-brushes${BRUSHES_EXT}`;

export type ParseResult = { ok: true; presets: { name: string; brush: BrushSettings }[]; skipped: number } | { ok: false; error: string };

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
  const presets: { name: string; brush: BrushSettings }[] = [];
  let skipped = 0;
  for (const item of f.presets) {
    const p = presets.length < MAX_PRESETS ? sanitizePreset(item, 'in') : null;
    if (p) presets.push({ name: p.name, brush: p.brush });
    else skipped++;
  }
  if (!presets.length) return { ok: false, error: 'There are no brushes in that.' };
  return { ok: true, presets, skipped };
}

/** Adds shared brushes to your list under fresh ids, with names that don't clash. Stops at the limit. */
export function addShared(list: readonly BrushPreset[], incoming: readonly { name: string; brush: BrushSettings }[], newId: () => string): { list: BrushPreset[]; added: number } {
  const out = [...list];
  let added = 0;
  for (const it of incoming) {
    if (out.length >= MAX_PRESETS) break;
    out.push({ id: newId(), name: uniqueName(it.name, allPresets(out).map((p) => p.name)), tool: 'brush', brush: { ...it.brush } });
    added++;
  }
  return { list: out, added };
}

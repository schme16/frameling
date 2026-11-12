// Registers feature descriptors and keeps which optional ones are on. A feature that is off has nothing registered:
// its things are taken away by owner (core/owners.ts) and put back when it is turned on again.
import type { Doc } from '../core/format';
import { registerChoice } from '../core/choices';
import { registerCommand, registerHelp, registerPanel, registerTool, type HelpTopic } from '../core/registry';
import { removeOwned, withOwner } from '../core/owners';
import { registerQuest } from '../quests/registry';
import { registerMenuItems } from '../ui/menus';
import { registerPanelInfo } from '../ui/panelInfo';
import { isSwitchable, type FeatureDescriptor } from './feature';

const KEY = 'frameling.features.v1';

const features = new Map<string, FeatureDescriptor>();
/** Ids the person turned off (kept in localStorage). Only switchable ones count. */
const turnedOff = new Set<string>();
/** Ids whose registrations are in right now. */
const live = new Set<string>();
export interface FeatureChange {
  id: string;
  on: boolean;
}
type Listener = (e: FeatureChange) => void;
const listeners = new Set<Listener>();
let version = 0;

function readOff(): string[] {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function writeOff(): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify([...turnedOff]));
  } catch {
    // Private windows and blocked storage: the choice lasts for this session only.
  }
}

function activate(d: FeatureDescriptor): void {
  live.add(d.id);
  withOwner(d.id, () => {
    for (const c of d.commands ?? []) registerCommand(c);
    for (const p of d.panels ?? []) registerPanel(p);
    for (const t of d.tools ?? []) registerTool(t);
    for (const h of d.help ?? []) registerHelp(h);
    for (const q of d.quests ?? []) registerQuest(q);
    for (const c of d.choices ?? []) registerChoice(c);
    for (const m of d.menus ?? []) registerMenuItems(m.menu, m.items);
    for (const [id, info] of Object.entries(d.sections ?? {})) registerPanelInfo(id, info);
    d.activate?.();
  });
}

function deactivate(d: FeatureDescriptor): void {
  live.delete(d.id);
  try {
    d.deactivate?.();
  } finally {
    removeOwned(d.id);
  }
}

/** Orders descriptors so each comes after the ones it requires. Throws, in words, on a missing requirement or a cycle. */
export function orderFeatures(list: FeatureDescriptor[]): FeatureDescriptor[] {
  const ids = new Map(list.map((d) => [d.id, d]));
  if (ids.size !== list.length) throw new Error('Two features share an id.');
  const out: FeatureDescriptor[] = [];
  const state = new Map<string, 'doing' | 'done'>();
  const visit = (d: FeatureDescriptor, path: string[]) => {
    if (state.get(d.id) === 'done') return;
    if (state.get(d.id) === 'doing') throw new Error(`Features need each other in a circle: ${[...path, d.id].join(' > ')}.`);
    state.set(d.id, 'doing');
    for (const r of d.requires ?? []) {
      const need = ids.get(r) ?? features.get(r);
      if (!need) throw new Error(`The ${d.name} feature needs "${r}", which does not exist.`);
      if (ids.has(r)) visit(need, [...path, d.id]);
    }
    state.set(d.id, 'done');
    out.push(d);
  };
  for (const d of list) visit(d, []);
  return out;
}

/** Registers features (once, at start-up). Optional ones the person turned off stay out. */
export function registerFeatures(list: FeatureDescriptor[]): void {
  if (!features.size) for (const id of readOff()) turnedOff.add(id);
  for (const d of orderFeatures(list)) {
    if (features.has(d.id)) continue;
    features.set(d.id, d);
    const needsOff = (d.requires ?? []).some((r) => !live.has(r) && isSwitchable(features.get(r)!));
    if (isSwitchable(d) && (turnedOff.has(d.id) || needsOff)) {
      if (needsOff) turnedOff.add(d.id);
      continue;
    }
    activate(d);
  }
  version++;
}

export const allFeatures = (): FeatureDescriptor[] => [...features.values()];
export const getFeature = (id: string): FeatureDescriptor | undefined => features.get(id);
/** The ones Preferences > Features lists. */
export const switchableFeatures = (): FeatureDescriptor[] => allFeatures().filter(isSwitchable);
/** True unless it is an optional feature that is turned off. Ids nobody registered count as on. */
export const isFeatureOn = (id: string): boolean => !features.has(id) || live.has(id);
export const featuresVersion = (): number => version;

export function onFeaturesChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const notify = (e: FeatureChange) => {
  version++;
  for (const fn of [...listeners]) fn(e);
};

export type SwitchResult = { ok: true } | { ok: false; reason: string };

/** Turns an optional feature on or off. `remember: false` leaves the saved choice alone (tests). */
export function setFeatureOn(id: string, on: boolean, opts: { remember?: boolean } = {}): SwitchResult {
  const d = features.get(id);
  if (!d || !isSwitchable(d)) return { ok: false, reason: 'That feature cannot be turned off.' };
  if (on === live.has(id)) return { ok: true };
  if (on) {
    // What it needs comes on first.
    for (const r of d.requires ?? []) {
      const need = features.get(r);
      if (need && !live.has(r)) {
        const res = setFeatureOn(r, true, opts);
        if (!res.ok) return res;
      }
    }
    turnedOff.delete(id);
    activate(d);
  } else {
    const user = [...features.values()].find((x) => live.has(x.id) && (x.requires ?? []).includes(id));
    if (user) return { ok: false, reason: `${user.name} needs ${d.name}. Turn off ${user.name} first.` };
    turnedOff.add(id);
    deactivate(d);
  }
  if (opts.remember !== false) writeOff();
  notify({ id, on });
  return { ok: true };
}

/** Optional features that are off, with a help topic or template or anything else of theirs hidden. */
export const offFeatures = (): FeatureDescriptor[] => switchableFeatures().filter((d) => !live.has(d.id));

/** Features that are off but that `doc` holds data of. */
export function offFeaturesUsedBy(doc: Doc): FeatureDescriptor[] {
  return offFeatures().filter((d) => {
    try {
      return !!d.usedBy?.(doc);
    } catch {
      return false;
    }
  });
}

/** Help topics of features that are off, each with its feature: for finding them in a search and offering to turn them on. */
export function hiddenHelp(): { topic: HelpTopic; feature: FeatureDescriptor }[] {
  return offFeatures().flatMap((feature) => (feature.help ?? []).map((topic) => ({ topic, feature })));
}

/** Ids of built-in templates whose feature is off. */
export function hiddenTemplateIds(): Set<string> {
  return new Set(offFeatures().flatMap((d) => d.templates ?? []));
}

/** Every help topic id a feature owns, whether it is on or off (the help audit counts hidden ones as used). */
export const featureHelpIds = (): Set<string> => new Set(allFeatures().flatMap((d) => (d.help ?? []).map((h) => h.id)));

/** For tests: forget everything. */
export function _resetFeaturesForTests(): void {
  for (const d of features.values()) if (live.has(d.id)) deactivate(d);
  features.clear();
  turnedOff.clear();
  live.clear();
  listeners.clear();
}

/**
 * The clip flow (state graph): which clip plays first and what follows what. Pure functions on the format.
 *
 * States are the document's clips. A transition goes from one clip to another when the first ends, or when a named
 * trigger fires. Exports write it by clip name, the way game engines and Interactives refer to animations.
 */
import type { Clip, ClipFlow, ClipTransition, Doc, Id } from './format';
import { uid } from './doc';

/** The flow as exports write it: names, not ids. */
export interface FlowManifest {
  /** The clip that plays first. */
  start: string;
  states: { name: string; loop: boolean; frames: number }[];
  transitions: { from: string; to: string; on: 'end' | 'trigger'; trigger?: string }[];
}

/** The flow with anything pointing at a missing clip left out (clips can be deleted after the flow was made). */
export function cleanFlow(doc: Pick<Doc, 'clips' | 'flow'>): ClipFlow {
  const ids = new Set(doc.clips.map((c) => c.id));
  const f = doc.flow;
  return {
    ...(f?.start && ids.has(f.start) ? { start: f.start } : {}),
    transitions: (f?.transitions ?? []).filter((t) => ids.has(t.from) && ids.has(t.to)),
    ...(f?.positions ? { positions: f.positions } : {}),
  };
}

/** The clip that plays first: the chosen one, else the first clip. */
export function startClip(doc: Pick<Doc, 'clips' | 'flow'>): Clip | undefined {
  const f = cleanFlow(doc);
  return doc.clips.find((c) => c.id === f.start) ?? doc.clips[0];
}

/** Where a clip goes next: on `trigger` (a name) or, with none, when it ends. Undefined = stay (loop or hold). */
export function nextClip(doc: Pick<Doc, 'clips' | 'flow'>, from: Id, trigger?: string): Clip | undefined {
  const t = cleanFlow(doc).transitions.find((x) => x.from === from && (trigger === undefined ? x.when === 'end' : x.when === 'trigger' && x.trigger === trigger));
  return t ? doc.clips.find((c) => c.id === t.to) : undefined;
}

/** Every trigger name used, sorted. */
export function triggerNames(doc: Pick<Doc, 'clips' | 'flow'>): string[] {
  return [...new Set(cleanFlow(doc).transitions.filter((t) => t.when === 'trigger' && t.trigger).map((t) => t.trigger!))].sort();
}

/**
 * The flow by name for exports, or undefined when there is nothing to say (no transitions). `nameOf` gives each
 * clip's name in the export (engines make names unique and drop clips outside the range): undefined leaves it out.
 */
export function flowManifest(doc: Pick<Doc, 'clips' | 'flow'>, nameOf: (c: Clip) => string | undefined = (c) => c.name): FlowManifest | undefined {
  const named = new Map<Id, { clip: Clip; name: string }>();
  for (const c of doc.clips) {
    const name = nameOf(c);
    if (name !== undefined) named.set(c.id, { clip: c, name });
  }
  const f = cleanFlow(doc);
  const transitions = f.transitions.filter((t) => named.has(t.from) && named.has(t.to));
  if (!named.size || !transitions.length) return undefined;
  const start = (f.start && named.get(f.start)) || [...named.values()][0];
  return {
    start: start.name,
    states: [...named.values()].map(({ clip, name }) => ({ name, loop: clip.loop, frames: Math.abs(clip.end - clip.start) + 1 })),
    transitions: transitions.map((t) => ({ from: named.get(t.from)!.name, to: named.get(t.to)!.name, on: t.when, ...(t.when === 'trigger' ? { trigger: t.trigger || 'go' } : {}) })),
  };
}

/** Clip names the way sheet exports make them: trimmed, never empty, unique in clip order. */
export function exportClipNames(clips: Clip[], keep: (c: Clip) => boolean = () => true, countAll = true): Map<Id, string> {
  const out = new Map<Id, string>();
  const used = new Set<string>();
  for (const c of clips) {
    const k = keep(c);
    if (!k && !countAll) continue;
    let s = c.name.trim() || 'clip';
    while (used.has(s)) s += '_';
    used.add(s);
    if (k) out.set(c.id, s);
  }
  return out;
}

// ---------------------------------------------------------------- changes (on a draft)

function flowOf(doc: Doc): ClipFlow {
  return (doc.flow ??= { transitions: [] });
}

export function addTransition(doc: Doc, from: Id, to: Id, when: ClipTransition['when'] = 'end', trigger?: string): Id | undefined {
  if (!doc.clips.some((c) => c.id === from) || !doc.clips.some((c) => c.id === to)) return undefined;
  const f = flowOf(doc);
  const same = f.transitions.find((t) => t.from === from && t.to === to && t.when === when && (when === 'end' || t.trigger === trigger));
  if (same) return same.id;
  const id = uid('t');
  f.transitions.push({ id, from, to, when, ...(when === 'trigger' ? { trigger: (trigger ?? 'go').trim() || 'go' } : {}) });
  return id;
}

export function updateTransition(doc: Doc, id: Id, patch: Partial<Omit<ClipTransition, 'id'>>): boolean {
  const t = doc.flow?.transitions.find((x) => x.id === id);
  if (!t) return false;
  Object.assign(t, patch);
  if (t.when === 'end') delete t.trigger;
  else t.trigger = (t.trigger ?? 'go').trim() || 'go';
  return true;
}

export function removeTransition(doc: Doc, id: Id): boolean {
  const f = doc.flow;
  const i = f?.transitions.findIndex((t) => t.id === id) ?? -1;
  if (!f || i < 0) return false;
  f.transitions.splice(i, 1);
  return true;
}

export function setStartClip(doc: Doc, id: Id): void {
  if (doc.clips.some((c) => c.id === id)) flowOf(doc).start = id;
}

export function moveFlowBox(doc: Doc, id: Id, x: number, y: number): void {
  const f = flowOf(doc);
  (f.positions ??= {})[id] = { x: Math.round(x), y: Math.round(y) };
}

/** Boxes laid out in rows when they haven't been placed by hand. */
export function flowLayout(doc: Pick<Doc, 'clips' | 'flow'>, width = 520): Record<Id, { x: number; y: number }> {
  const out: Record<Id, { x: number; y: number }> = {};
  const per = Math.max(1, Math.floor(width / 170));
  doc.clips.forEach((c, i) => {
    out[c.id] = doc.flow?.positions?.[c.id] ?? { x: 20 + (i % per) * 170, y: 20 + Math.floor(i / per) * 90 };
  });
  return out;
}

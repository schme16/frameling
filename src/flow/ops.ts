/**
 * Clip flow actions (each one undo step) and "Try it", which plays the flow on the canvas: the start clip first,
 * then on along the transitions as clips end or as you press trigger buttons.
 */
import type { ClipTransition, Doc, Id } from '../core/format';
import { store } from '../core/store';
import { addTransition, moveFlowBox, nextClip, removeTransition, setStartClip, startClip, updateTransition } from '../core/flow';
import { setTl } from '../timeline/state';
import { toast } from '../ui/toast';

export function connectClips(from: Id, to: Id): Id | undefined {
  const doc = store().get().doc;
  const a = doc.clips.find((c) => c.id === from);
  const b = doc.clips.find((c) => c.id === to);
  if (!a || !b || from === to) return undefined;
  // A clip that loops never ends on its own, so it waits for a trigger, named after where it goes.
  const when: ClipTransition['when'] = a.loop ? 'trigger' : 'end';
  let id: Id | undefined;
  store().update(`Go from ${a.name} to ${b.name}`, (d) => {
    id = addTransition(d as Doc, from, to, when, when === 'trigger' ? b.name.trim().split(/\s+/)[0]?.toLowerCase() || 'go' : undefined);
  });
  return id;
}

export function editTransition(id: Id, patch: Partial<Omit<ClipTransition, 'id'>>, coalesce?: string): void {
  store().update('Change how a clip moves on', (d) => void updateTransition(d as Doc, id, patch), coalesce ? { coalesce } : {});
}

export function deleteTransition(id: Id): void {
  store().update('Remove a transition', (d) => void removeTransition(d as Doc, id));
}

export function makeStart(id: Id): void {
  store().update('Choose the first clip', (d) => void setStartClip(d as Doc, id));
}

export function placeBox(id: Id, x: number, y: number, coalesce: string): void {
  store().update('Move a clip box', (d) => void moveFlowBox(d as Doc, id, Math.max(0, x), Math.max(0, y)), { coalesce });
}

// ---------------------------------------------------------------- try it

let trying: { clipId: Id; last: number } | null = null;
let unsub: (() => void) | null = null;
const listeners = new Set<() => void>();

export function tryingClip(): Id | null {
  return trying?.clipId ?? null;
}

export function subscribeTry(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function emit(): void {
  for (const fn of listeners) fn();
}

function play(id: Id): void {
  const doc = store().get().doc;
  const c = doc.clips.find((x) => x.id === id);
  if (!c) return stopTrying();
  trying = { clipId: id, last: c.start };
  setTl({ clipId: id });
  store().setUi({ frame: Math.min(c.start, c.end), playing: true });
  emit();
}

/** Plays the flow from its first clip, following it as clips end. */
export function startTrying(): void {
  const doc = store().get().doc;
  const first = startClip(doc);
  if (!first) {
    toast('Make some clips first: drag across the clip row at the top of the timeline.', { kind: 'warn' });
    return;
  }
  unsub?.();
  unsub = store().subscribe(() => {
    if (!trying) return;
    const s = store().get();
    const c = s.doc.clips.find((x) => x.id === trying!.clipId);
    if (!c) return stopTrying();
    const f = s.ui.frame;
    const end = Math.max(c.start, c.end);
    // The clip ended: it stopped on its last frame, or a looping one wrapped round.
    const ended = (f === end && !s.ui.playing) || (f < trying.last && trying.last >= end - 1);
    trying.last = f;
    if (!ended) return;
    const next = nextClip(s.doc, c.id);
    if (next) play(next.id);
  });
  play(first.id);
}

/** Follows a trigger from the clip playing now. */
export function fireTrigger(name: string): void {
  if (!trying) return;
  const next = nextClip(store().get().doc, trying.clipId, name);
  if (next) play(next.id);
}

export function stopTrying(): void {
  unsub?.();
  unsub = null;
  if (trying) store().setUi({ playing: false });
  trying = null;
  emit();
}

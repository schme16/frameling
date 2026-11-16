/**
 * Clip flow actions (each one undo step) and "Try it", which plays the flow on the canvas: the start clip first,
 * then on along the transitions as clips end or as you press trigger buttons.
 */
import { FLOW_ANY, type ClipTransition, type Doc, type FlowCondition, type FlowInput, type Id } from '../core/format';
import { store } from '../core/store';
import { addCondition, addInput, addTransition, cleanFlow, editCondition, editInput, inputDefaults, moveFlowBox, pickTransition, removeCondition, removeInput, removeTransition, setAnyFirst, setStartClip, startClip, updateTransition, type FlowValues } from '../core/flow';
import { withChoice } from '../core/choices';
import { setTl } from '../timeline/state';
import { onPlayPass } from '../timeline/playback';
import { holdFrame, entryFrame } from '../core/clipPlay';
import { toast } from '../ui/toast';
import { onFreshDrawing } from '../core/fresh';

export function connectClips(from: Id, to: Id): Id | undefined {
  const doc = store().get().doc;
  const a = from === FLOW_ANY ? undefined : doc.clips.find((c) => c.id === from);
  const b = doc.clips.find((c) => c.id === to);
  if ((from !== FLOW_ANY && !a) || !b || from === to) return undefined;
  // A clip that loops never ends on its own, so it waits for a trigger, named after where it goes. So does "Any clip".
  const when: ClipTransition['when'] = !a || a.loop ? 'trigger' : 'end';
  const firstAny = from === FLOW_ANY && !cleanFlow(doc).transitions.some((t) => t.from === FLOW_ANY);
  const hasOwn = cleanFlow(doc).transitions.some((t) => t.from !== FLOW_ANY);
  let id: Id | undefined;
  store().update(`Go from ${a?.name ?? 'any clip'} to ${b.name}`, (d) => {
    id = addTransition(d as Doc, from, to, when, when === 'trigger' ? b.name.trim().split(/\s+/)[0]?.toLowerCase() || 'go' : undefined);
  });
  // Two arrows can be ready at once (hurt from anywhere, and the clip's own way on): the first Any clip arrow in a document asks which goes first.
  if (firstAny && id) {
    withChoice<'any' | 'own'>('flow.anyFirst', (v) => store().update('Choose which arrow goes first', (d) => void setAnyFirst(d as Doc, v === 'any')), { matters: hasOwn, gently: true });
  }
  return id;
}

export function editTransition(id: Id, patch: Partial<Omit<ClipTransition, 'id'>>, coalesce?: string): void {
  store().update('Change how a clip moves on', (d) => void updateTransition(d as Doc, id, patch), coalesce ? { coalesce } : {});
}

/** Changes a check on an arrow (coalesced while a number is being typed). */
export function editFlowCondition(id: Id, index: number, patch: Partial<FlowCondition>, coalesce?: string): void {
  store().update('Change a check', (d) => void editCondition(d as Doc, id, index, patch), coalesce ? { coalesce } : {});
}

export function addFlowCondition(id: Id): void {
  store().update('Add a check to an arrow', (d) => void addCondition(d as Doc, id));
}

export function deleteFlowCondition(id: Id, index: number): void {
  store().update('Remove a check', (d) => void removeCondition(d as Doc, id, index));
}

/** Adds an input and returns the name it got. */
export function addFlowInput(kind: FlowInput['kind']): string {
  let name = '';
  store().update(kind === 'toggle' ? 'Add an on/off input' : 'Add a number input', (d) => void (name = addInput(d as Doc, kind)));
  return name;
}

export function editFlowInput(name: string, patch: { name?: string; kind?: FlowInput['kind']; start?: boolean | number }, coalesce?: string): void {
  store().update('Change an input', (d) => void editInput(d as Doc, name, patch), coalesce ? { coalesce } : {});
}

export function deleteFlowInput(name: string): void {
  store().update('Remove an input', (d) => void removeInput(d as Doc, name));
}

export function setAnyFirstNow(first: boolean): void {
  store().update('Choose which arrow goes first', (d) => void setAnyFirst(d as Doc, first));
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

let trying: { clipId: Id } | null = null;
let values: FlowValues = {};
let unsub: (() => void) | null = null;
let offPass: (() => void) | null = null;
const listeners = new Set<() => void>();

export function tryingClip(): Id | null {
  return trying?.clipId ?? null;
}

/** The inputs' values while trying (a new object whenever one changes, so a panel can watch it). */
export function tryValues(): FlowValues {
  return values;
}

export function subscribeTry(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function emit(): void {
  for (const fn of listeners) fn();
}

/** Switches to a clip and plays it from its first frame. */
function enter(id: Id): void {
  const doc = store().get().doc;
  const c = doc.clips.find((x) => x.id === id);
  if (!c) return stopTrying();
  trying = { clipId: id };
  setTl({ clipId: id });
  store().setUi({ frame: entryFrame(c), playing: true });
  emit();
}

/** Takes "as soon as" arrows that are ready, one after another (a few at most, so two pointing at each other can't spin). */
function settle(): void {
  for (let i = 0; i < 8 && trying; i++) {
    const t = pickTransition(store().get().doc, trying.clipId, { kind: 'check' }, values);
    if (!t) return;
    enter(t.to);
  }
}

function play(id: Id): void {
  enter(id);
  settle();
}

/** Plays the flow from its first clip, following it as clips end. */
export function startTrying(): void {
  const doc = store().get().doc;
  const first = startClip(doc);
  if (!first) {
    toast('Make some clips first: drag across the clip row at the top of the timeline.', { kind: 'warn' });
    return;
  }
  values = inputDefaults(doc.flow);
  unsub?.();
  unsub = store().subscribe(() => {
    if (!trying) return;
    const s = store().get();
    const c = s.doc.clips.find((x) => x.id === trying!.clipId);
    if (!c) return stopTrying();
    // The clip ended: it stopped on the frame it holds (a looping one is caught by `onPlayPass`).
    const ended = s.ui.frame === holdFrame(c) && !s.ui.playing;
    if (!ended) return;
    const next = pickTransition(s.doc, c.id, { kind: 'end' }, values);
    if (next) play(next.to);
  });
  offPass?.();
  offPass = onPlayPass(() => {
    if (!trying) return;
    const next = pickTransition(store().get().doc, trying.clipId, { kind: 'end' }, values);
    if (next) play(next.to);
  });
  play(first.id);
}

/** Follows a trigger from the clip playing now. */
export function fireTrigger(name: string): void {
  if (!trying) return;
  const next = pickTransition(store().get().doc, trying.clipId, { kind: 'trigger', name }, values);
  if (next) play(next.to);
}

/** Sets an input while trying, and takes any "as soon as" arrow that is now ready. */
export function setTryInput(name: string, value: boolean | number): void {
  if (!trying) return;
  values = { ...values, [name]: value };
  emit();
  settle();
}

export function stopTrying(): void {
  unsub?.();
  unsub = null;
  offPass?.();
  offPass = null;
  if (trying) store().setUi({ playing: false });
  trying = null;
  emit();
}

// A different drawing ends a flow being tried.
onFreshDrawing(() => {
  if (trying) stopTrying();
});

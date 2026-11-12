/**
 * "Ask the first time, then remember": behaviours where people reasonably differ (does N copy the last drawing or
 * start blank? does a tap of Space play?). The first time it matters, Frameling asks with a friendly dialog; the
 * answer is remembered and can be changed any time in Preferences > Behaviour, which lists every registered choice.
 *
 * Any area can register a choice and call `choose(id)`. The UI provides the dialog through `setChoiceAsker`; without
 * one (tests, or before the UI loads) `choose` returns the default without remembering it.
 */
import { ownedUndo } from './owners';
import { useSyncExternalStore } from 'react';

export interface ChoiceOption<V extends string = string> {
  value: V;
  label: string;
  detail?: string;
}

export interface ChoiceDef<V extends string = string> {
  id: string;
  /** Short name for Preferences ("New drawing (N)"). */
  title: string;
  /** The question in the dialog, in plain words. */
  question: string;
  options: ChoiceOption<V>[];
  /** Used when nobody has answered yet and there's no way to ask (and highlighted in the dialog). */
  default: V;
  /** Groups it in Preferences > Behaviour. */
  category: string;
  help?: string;
  /** Quill asks it: his face sits beside the question in the dialog (and it stays a plain question with Quill off). */
  quill?: boolean;
  /** Never ask: just use the remembered answer or the default (for choices that are preferences, not questions). */
  silent?: boolean;
}

export type ChoiceAsker = (def: ChoiceDef) => Promise<{ value: string; remember: boolean } | null>;

const KEY = 'frameling.choices.v1';
const defs = new Map<string, ChoiceDef>();
let answers: Record<string, string> = load();
let asker: ChoiceAsker | null = null;
const listeners = new Set<() => void>();
// One question at a time: a second ask for the same choice waits for the first.
const pending = new Map<string, Promise<string>>();

function load(): Record<string, string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    // No storage (private window, tests): answers last for this session only.
  }
}

function emit(): void {
  for (const fn of listeners) fn();
}

export function registerChoice<V extends string>(def: ChoiceDef<V>): void {
  const before = defs.get(def.id);
  const mine = def as unknown as ChoiceDef;
  defs.set(def.id, mine);
  ownedUndo(() => {
    if (defs.get(def.id) !== mine) return;
    if (before) defs.set(def.id, before);
    else defs.delete(def.id);
    emit();
  });
}

export function getChoiceDef(id: string): ChoiceDef | undefined {
  return defs.get(id);
}

export function allChoices(): ChoiceDef[] {
  return [...defs.values()];
}

/** The remembered answer, if there is one. */
export function rememberedChoice(id: string): string | undefined {
  return answers[id];
}

/** The answer to use right now without asking: remembered, or the default. */
export function currentChoice<V extends string = string>(id: string): V {
  return (answers[id] ?? defs.get(id)?.default) as V;
}

/** Sets (or with undefined, forgets, so it will be asked again) the remembered answer. */
export function setChoice(id: string, value: string | undefined): void {
  if (value === undefined) delete answers[id];
  else answers = { ...answers, [id]: value };
  if (value === undefined) answers = { ...answers };
  save();
  emit();
}

/** Forgets every answer, so each will be asked again. */
export function resetChoices(): void {
  answers = {};
  save();
  emit();
}

export function setChoiceAsker(fn: ChoiceAsker | null): void {
  asker = fn;
}

/**
 * The answer for a choice, asking the person the first time. Resolves with the default if they close the dialog
 * without picking, and doesn't remember that.
 */
export function choose<V extends string = string>(id: string): Promise<V> {
  const def = defs.get(id);
  if (!def) throw new Error(`Unknown choice ${id}`);
  const known = answers[id];
  if (known !== undefined) return Promise.resolve(known as V);
  if (def.silent || !asker) return Promise.resolve(def.default as V);
  const waiting = pending.get(id);
  if (waiting) return waiting as Promise<V>;
  const p = asker(def)
    .then((r) => {
      if (!r) return def.default;
      if (r.remember) setChoice(id, r.value);
      return r.value;
    })
    .finally(() => pending.delete(id));
  pending.set(id, p);
  return p as Promise<V>;
}

/**
 * Runs `fn` with the answer: straight away (same tick) when it's already known or can't be asked, otherwise after
 * the person answers. Prefer this over `choose` in event handlers, so remembered choices act instantly.
 */
export function withChoice<V extends string = string>(id: string, fn: (value: V) => void): void {
  const def = defs.get(id);
  if (answers[id] !== undefined || !asker || def?.silent) {
    fn(currentChoice<V>(id));
    return;
  }
  void choose<V>(id).then(fn);
}

/** Calls `fn` whenever a remembered answer changes, with the choice and its new value (undefined = forgotten). */
export function onChoiceChange(fn: (id: string, value: string | undefined) => void): () => void {
  let seen = { ...answers };
  const check = () => {
    for (const id of new Set([...Object.keys(seen), ...Object.keys(answers)])) if (seen[id] !== answers[id]) fn(id, answers[id]);
    seen = { ...answers };
  };
  listeners.add(check);
  return () => void listeners.delete(check);
}

/** React: the current answer (remembered or default), re-rendering when it changes. */
export function useChoice<V extends string = string>(id: string): V {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => currentChoice<V>(id),
  );
}

/** React: re-render when any remembered answer changes (for Preferences). */
export function useChoices(): Record<string, string> {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => answers,
  );
}

/** For tests. */
export function _resetChoicesForTests(): void {
  answers = {};
  defs.clear();
  pending.clear();
  asker = null;
}

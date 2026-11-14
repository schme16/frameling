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
  /** An answer for this time only ("Not now"): never remembered, and not offered in Preferences. */
  once?: boolean;
  /** What was done when this answer was used without asking, in the past tense, for the toast ("Started a blank drawing."). */
  did?: string;
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
  /** Used instead of the default when the dialog is closed without picking (when closing should not mean the default). */
  dismiss?: V;
  /** The option the dialog starts on, when that should differ from the default (an offer starts on "Yes" but does nothing unasked). */
  highlight?: V;
  /** Groups it in Preferences > Behaviour. */
  category: string;
  help?: string; // a help topic id, with #heading to land on one part ("behaviour#dialogs")
  /** Quill asks it: his face sits beside the question in the dialog (and it stays a plain question with Quill off). */
  quill?: boolean;
  /** Never ask: just use the remembered answer or the default (for choices that are preferences, not questions). */
  silent?: boolean;
  /** Always a sheet that stops and asks, never a toast, and left alone by "Answer all the questions the usual way" (it can change or lose something that Undo does not bring back). */
  mustAsk?: boolean;
}

/** What a call can say about the moment it is asked in. */
export interface AskOpts {
  /** False when every answer would do the same thing right now (one layer, nothing after the drawing): nothing is asked, nothing is remembered. */
  matters?: boolean;
  /**
   * Do the usual thing and say so in a toast with a Change button, instead of a sheet that stops the hand. `undo` takes
   * the thing back so another answer can be applied; without it the last undo step is used.
   */
  gently?: boolean | { undo?: () => void };
}

/** The part of a call that decides how a choice is put. A pure function of what is known, so it can be tested on its own. */
export type AskPlan = 'remembered' | 'usual' | 'weary' | 'toast' | 'sheet';

export interface AskFacts {
  remembered: boolean;
  /** There is a way to ask at all (the sheet is mounted). */
  canAsk: boolean;
  /** A preference rather than a question, or questions are being held back (a lesson is playing). */
  silent: boolean;
  matters: boolean;
  gently: boolean;
  mustAsk: boolean;
  /** There is a way to show a toast with a Change button. */
  canTell: boolean;
  /** The sheet has been closed without an answer enough times this session (see `isWeary`). */
  weary?: boolean;
}

export function planAsk(f: AskFacts): AskPlan {
  if (f.remembered) return 'remembered';
  if (f.silent || !f.canAsk || !f.matters) return 'usual';
  if (f.weary && !f.mustAsk) return 'weary';
  if (f.gently && f.canTell && !f.mustAsk) return 'toast';
  return 'sheet';
}

/**
 * How many times the sheet for a choice can be closed without an answer, in one session, before Frameling stops putting
 * it. After that it does what closing already did (`dismiss`, else the default), says so with a Change button, and
 * asks again next session. Never for a `mustAsk` choice.
 */
export const WEARY_AFTER = 2;

/** True once `closed` closes without an answer is enough, for a choice that is allowed to stop asking. */
export function isWeary(closed: number, def: Pick<ChoiceDef, 'mustAsk' | 'silent'> | undefined): boolean {
  return closed >= WEARY_AFTER && !!def && !def.mustAsk && !def.silent;
}

/** The answer used once Frameling stops asking: what closing the sheet did anyway, which is never the risky one. */
export function wearyAnswer(def: Pick<ChoiceDef, 'dismiss' | 'default'>): string {
  return def.dismiss ?? def.default;
}

/** Tells the person what was done the usual way and lets them change it. Provided by the UI; without one the usual answer is just used. */
export type GentleTeller = (def: ChoiceDef, value: string, run: (value: string) => void, undo: (() => void) | undefined, notRemembered?: boolean) => void;

export type ChoiceAsker = (def: ChoiceDef) => Promise<{ value: string; remember: boolean } | null>;

const KEY = 'frameling.choices.v1';
const defs = new Map<string, ChoiceDef>();
let answers: Record<string, string> = load();
let asker: ChoiceAsker | null = null;
const listeners = new Set<() => void>();
// One question at a time: a second ask for the same choice waits for the first.
const pending = new Map<string, Promise<string>>();
// Times each sheet was closed without an answer this session. In memory only: a new session starts asking again.
const closed = new Map<string, number>();

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

/**
 * Folds the remembered answers of retired choices into a new one: `pick` gets the old answers (in the order of `olds`,
 * undefined where there was none) and returns the new answer, or undefined for none. Does nothing once the new choice
 * has an answer. The old answers are always dropped.
 */
export function migrateChoices(newId: string, olds: string[], pick: (answers: (string | undefined)[]) => string | undefined): void {
  if (!olds.some((o) => answers[o] !== undefined)) return;
  const next = answers[newId] === undefined ? pick(olds.map((o) => answers[o])) : undefined;
  const rest = { ...answers };
  for (const o of olds) delete rest[o];
  answers = next === undefined ? rest : { ...rest, [newId]: next };
  save();
  emit();
}

/** Forgets every answer, so each will be asked again. */
export function resetChoices(): void {
  answers = {};
  closed.clear();
  save();
  emit();
}

export function setChoiceAsker(fn: ChoiceAsker | null): void {
  asker = fn;
}

let teller: GentleTeller | null = null;

let wearyNotice: ((def: ChoiceDef, value: string) => void) | null = null;

/** Says (in a toast) that a question was not put because it was closed twice. Provided by the UI. */
export function setWearyNotice(fn: ((def: ChoiceDef, value: string) => void) | null): void {
  wearyNotice = fn;
}

/** Puts a question that stopped asking back, for the rest of the session (the toast's "Ask me again"). */
export function askMeAgain(id: string): void {
  closed.delete(id);
}

export function setGentleTeller(fn: GentleTeller | null): void {
  teller = fn;
}

/** Puts one choice to the person with its sheet, whatever is remembered (the Change button on a toast). */
export function askAgain(id: string, startOn?: string): Promise<{ value: string; remember: boolean } | null> {
  const def = defs.get(id);
  if (!def || !asker) return Promise.resolve(null);
  return asker(startOn ? { ...def, highlight: startOn } : def).then((r) => {
    if (r) closed.delete(id);
    return r;
  });
}

/** The choices "Answer them all the usual way" would set: not the ones that must always ask, nor the already answered. */
export function usualAnswerIds(): string[] {
  return [...defs.values()].filter((d) => !d.mustAsk && !d.silent && answers[d.id] === undefined).map((d) => d.id);
}

/**
 * Sets every choice to its usual answer, so nothing asks again ("Answer all the questions the usual way"). Choices that
 * must always ask, and the ones already answered, are left alone. Every choice is still listed in Preferences > Behaviour.
 * Returns the ids it set, which `forgetAnswers` takes back.
 */
export function setUsualAnswers(): string[] {
  const ids = usualAnswerIds();
  const next = { ...answers };
  for (const id of ids) next[id] = defs.get(id)!.default;
  answers = next;
  save();
  emit();
  return ids;
}

/** Forgets just these answers, so they are asked again (the Undo of `setUsualAnswers`). */
export function forgetAnswers(ids: string[]): void {
  const next = { ...answers };
  for (const id of ids) delete next[id];
  answers = next;
  save();
  emit();
}

let deferral: (() => boolean) | null = null;

/**
 * While `fn` says true (a lesson is playing), a choice nobody has answered yet takes its default without a question and
 * without remembering it, so it is asked the first time it matters after the lesson.
 */
export function setChoiceDeferral(fn: (() => boolean) | null): void {
  deferral = fn;
}

const deferred = (): boolean => !!deferral?.();

/** Whether a question can be put to the person at all right now (there is an asker, and nothing is holding questions). */
export function canAsk(id: string): boolean {
  return !!asker && !defs.get(id)?.silent && !deferred();
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
  if (def.silent || !asker || deferred()) return Promise.resolve(def.default as V);
  if (isWeary(closed.get(id) ?? 0, def)) {
    // Closed twice already: do what closing does, and say so, without a sheet.
    wearyNotice?.(def, wearyAnswer(def));
    return Promise.resolve(wearyAnswer(def) as V);
  }
  const waiting = pending.get(id);
  if (waiting) return waiting as Promise<V>;
  const p = asker(def)
    .then((r) => {
      if (!r) {
        closed.set(id, (closed.get(id) ?? 0) + 1);
        return def.dismiss ?? def.default;
      }
      closed.delete(id);
      if (r.remember && !def.options.find((o) => o.value === r.value)?.once) setChoice(id, r.value);
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
export function withChoice<V extends string = string>(id: string, fn: (value: V) => void, opts: AskOpts = {}): void {
  const def = defs.get(id);
  const gently = !!opts.gently;
  const plan = planAsk({
    remembered: answers[id] !== undefined,
    canAsk: !!asker,
    silent: !!def?.silent || deferred(),
    matters: opts.matters !== false,
    gently,
    mustAsk: !!def?.mustAsk,
    canTell: !!teller,
    weary: isWeary(closed.get(id) ?? 0, def),
  });
  if (plan === 'remembered' || plan === 'usual') {
    fn(currentChoice<V>(id));
  } else if (plan === 'weary' && def) {
    // Closed twice already: do what closing does, say so with a Change button, and remember nothing.
    const value = wearyAnswer(def);
    const undo = typeof opts.gently === 'object' ? opts.gently.undo : undefined;
    if (teller) teller(def, value, fn as (value: string) => void, undo, true);
    else fn(value as V);
  } else if (plan === 'toast' && def) {
    // Do the usual thing now, say so, and remember it so the toast is a one-off (Preferences still lists it).
    const undo = typeof opts.gently === 'object' ? opts.gently.undo : undefined;
    setChoice(id, def.default);
    teller!(def, def.default, fn as (value: string) => void, undo);
  } else {
    void choose<V>(id).then(fn);
  }
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
  teller = null;
  wearyNotice = null;
  closed.clear();
  deferral = null;
}

// The flash: when a part of the brush changes (the brush, the tip, the stick, the paper), the top preview carries a tag
// naming it and the changed rows light for about two seconds, so cause and effect are seen. What counts as a change is in
// parts.ts (flashFor). It costs nothing while drawing: the watcher only looks when the brush, the picked brush or the
// paper is a different object from last time, and only the preview and the rows listen for the flash.
import { useSyncExternalStore } from 'react';
import { store } from '../core/store';
import { getDry, subscribeDry } from '../dry/settings';
import { flashFor, type Flash, type Moment } from './parts';
import { everyBrush, pickedBrushId, subscribeBrushes } from './presets';

/** How long the tag and the lit rows stay. */
export const FLASH_MS = 2200;

export interface Lit extends Flash {
  /** A new number for each flash, so a repeat of the same one starts over. */
  n: number;
}
const NOTHING: Lit = { parts: [], text: '', n: 0 };
let lit: Lit = NOTHING;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const say = (next: Lit) => {
  lit = next;
  for (const fn of listeners) fn();
};

export const currentFlash = (): Lit => lit;
export const useFlash = (): Lit => useSyncExternalStore(subscribe, currentFlash);
export const flashHas = (l: Lit, part: Flash['parts'][number]): boolean => l.parts.includes(part);

/** Shows a flash now, and puts it away again after FLASH_MS. */
export function showFlash(f: Flash): void {
  if (timer) clearTimeout(timer);
  say({ ...f, n: lit.n + 1 });
  timer = setTimeout(() => say({ ...NOTHING, n: lit.n }), FLASH_MS);
}

/** Starts noticing changes. Called once at launch (with the saved brushes). Returns what stops it. */
export function startBrushFlash(): () => void {
  const moment = (): Moment => {
    const id = pickedBrushId();
    return { id, name: id ? (everyBrush().find((p) => p.id === id)?.name ?? '') : '', brush: store().get().ui.brush, paper: getDry().paper };
  };
  let prev = moment();
  const look = () => {
    // Almost every call is nothing new (drawing, a slider drag and a list change all land here), so look cheaply first.
    if (pickedBrushId() === prev.id && store().get().ui.brush === prev.brush && getDry().paper === prev.paper) return;
    const now = moment();
    const f = flashFor(prev, now);
    prev = now;
    if (f) showFlash(f);
  };
  const offs = [store().subscribe(look), subscribeBrushes(look), subscribeDry(look)];
  return () => {
    for (const off of offs) off();
    if (timer) clearTimeout(timer);
  };
}

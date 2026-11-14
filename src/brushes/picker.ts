// What the brush picker remembers: your favourites, the brushes you used lately, how big you made the rows and the panel,
// and which groups are open. Kept in the browser's storage under `frameling.brushPicker`, so the settings backup carries
// it too. The row style (one column or two) is a choice, so it shows in Preferences as well as on the picker's button.
import { useSyncExternalStore } from 'react';
import { currentChoice, registerChoice, setChoice, useChoice } from '../core/choices';
import { pushRecent, ROW_SCALE, sanitizeMemory, toggleId, type PickerMemory, type RowStyle } from './library';

const KEY = 'frameling.brushPicker';

registerChoice<RowStyle>({
  id: 'brushes.rows',
  title: 'How the brush picker lists brushes',
  question: 'How should the brush picker list your brushes?',
  options: [
    { value: 'tip', label: 'One column', detail: 'Each brush gets a wide row: its tip and size, a long stroke, and its name.' },
    { value: 'two', label: 'Two columns, denser', detail: 'Two brushes side by side, so more fit before you scroll.' },
  ],
  default: 'tip',
  category: 'Drawing',
  help: 'brush-picker',
  silent: true,
});

let memory: PickerMemory = sanitizeMemory(null);
try {
  if (typeof localStorage !== 'undefined') memory = sanitizeMemory(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
} catch {
  // unreadable: start fresh
}

let opened: string[] | null = null;
let openAsked = 0;
const listeners = new Set<() => void>();

function change(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify({ version: 1, ...memory }));
  } catch {
    // not remembered this time
  }
  poke();
}
function poke(): void {
  version++;
  for (const fn of listeners) fn();
}
let version = 0;

export const pickerVersion = (): number => version;
export function subscribePicker(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export const usePicker = <T,>(selector: () => T): T => useSyncExternalStore(subscribePicker, selector);

export const favouriteIds = (): readonly string[] => memory.favourites;
export const recentIds = (): readonly string[] => memory.recent;
export const isFavourite = (id: string): boolean => memory.favourites.includes(id);
export const rowScale = (): number => memory.rowScale;
export const panelBox = (): PickerMemory['box'] => memory.box;
export const openGroups = (): readonly string[] | null => opened;

export function toggleFavourite(id: string): boolean {
  memory = { ...memory, favourites: toggleId(memory.favourites, id) };
  change();
  return isFavourite(id);
}

/** A brush was used: it goes to the front of Recent. */
export function noteRecent(id: string): void {
  if (memory.recent[0] === id) return;
  memory = { ...memory, recent: pushRecent(memory.recent, id) };
  change();
}

export function setRowScale(v: number): void {
  const n = Math.min(ROW_SCALE.max, Math.max(ROW_SCALE.min, Math.round(v * 20) / 20));
  if (n === memory.rowScale) return;
  memory = { ...memory, rowScale: n };
  change();
}

export function setPanelBox(box: { w: number; h: number }): void {
  memory = { ...memory, box: { w: Math.round(box.w), h: Math.round(box.h) } };
  change();
}

/** Which sections are open. Not kept between sessions: a fresh start shows the group your brush is in. */
export function setOpenGroups(keys: string[] | null): void {
  opened = keys;
  poke();
}

export const rowStyle = (): RowStyle => currentChoice<RowStyle>('brushes.rows');
export const useRowStyle = (): RowStyle => useChoice<RowStyle>('brushes.rows');
export function setRowStyle(v: RowStyle): void {
  setChoice('brushes.rows', v);
}
export const flipRowStyle = (): RowStyle => {
  const next: RowStyle = rowStyle() === 'tip' ? 'two' : 'tip';
  setRowStyle(next);
  return next;
};

// ---------------------------------------------------------------- "open the picker" from a command

let askedAt = 0;
let taken = 0;
/** A command (or a key) wants the picker open. The brush row takes it up when it is on screen, within a second. */
export function requestPicker(): void {
  openAsked++;
  askedAt = Date.now();
  poke();
}
/** For the brush row: true once per fresh request. */
export function takePickerRequest(): boolean {
  const fresh = openAsked !== taken && Date.now() - askedAt < 1000;
  taken = openAsked;
  return fresh;
}
export const pickerRequests = (): number => openAsked;

export function _resetPickerForTests(): void {
  memory = sanitizeMemory(null);
  opened = null;
  poke();
}

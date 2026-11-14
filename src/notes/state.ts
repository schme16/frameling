// What the notes area remembers between launches (whether notes show, whether finished ones are hidden, the name that
// goes on the notes you write) and what is open right now (which note's card is showing, and the note that has been
// started but has no words yet, so nothing is added to the file until you type).
import { useSyncExternalStore } from 'react';
import type { CanvasNote, Id } from '../core/format';

interface Saved {
  /** One switch for every note on the canvas. */
  show: boolean;
  /** Leave finished notes out of sight. */
  hideDone: boolean;
  /** The name that goes on notes and answers (empty = none). */
  name: string;
}

const KEY = 'frameling.notes';
let saved: Saved = { show: true, hideDone: false, name: '' };

try {
  if (typeof localStorage !== 'undefined') {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      if (typeof raw.show === 'boolean') saved.show = raw.show;
      if (typeof raw.hideDone === 'boolean') saved.hideDone = raw.hideDone;
      if (typeof raw.name === 'string') saved.name = raw.name.slice(0, 80);
    }
  }
} catch {
  // storage can be unavailable; the defaults are fine
}

interface Live {
  /** The note whose card is open. */
  openId: Id | null;
  /** A note that has been started and has no words yet. It is in no document until it does. */
  draft: CanvasNote | null;
}

let live: Live = { openId: null, draft: null };
let snapshot = { ...saved, ...live };
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { ...saved, ...live };
  listeners.forEach((f) => f());
}

function persist(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // not saved; it still works for now
  }
}

export const getNotesState = () => snapshot;

export function setNotesSaved(patch: Partial<Saved>): void {
  const next = { ...saved, ...patch };
  if (next.name !== undefined) next.name = next.name.slice(0, 80);
  if (next.show === saved.show && next.hideDone === saved.hideDone && next.name === saved.name) return;
  saved = next;
  persist();
  emit();
}

export function setNotesLive(patch: Partial<Live>): void {
  const next = { ...live, ...patch };
  if (next.openId === live.openId && next.draft === live.draft) return;
  live = next;
  emit();
}

/** Opens a note's card (null closes it). A draft that is still empty goes away when another card opens. */
export function openNote(id: Id | null): void {
  setNotesLive({ openId: id, draft: live.draft && live.draft.id === id ? live.draft : null });
}

export function useNotesState() {
  return useSyncExternalStore(
    (f) => (listeners.add(f), () => void listeners.delete(f)),
    () => snapshot,
  );
}

export const notesShown = (): boolean => saved.show;
export const noteName = (): string => saved.name.trim();

/** Forgets everything (for tests). */
export function _resetNotesState(): void {
  saved = { show: true, hideDone: false, name: '' };
  live = { openId: null, draft: null };
  emit();
}

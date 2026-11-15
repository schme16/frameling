// Stream-safe mode: one switch that swaps what should not be seen on a shared screen for friendly stand-ins.
// DISPLAY ONLY. Nothing here touches a document, a saved path or a setting: the real value is always kept and used,
// and only the words and pictures that are drawn change. Every screen that shows a file path, a profile or author
// name, or a key goes through the helpers below, so there is exactly one place that decides what they look like.
// test/streamSafe/audit.test.ts reads the source and fails when a screen shows one of them raw.
import { useSyncExternalStore } from 'react';
import { hasPath as hasPathText, kindOfPath, scrubPathsAlways, standInPath } from './streamSafePure';

export { kindOfPath };

let on = false;
const listeners = new Set<() => void>();

/** Whether stream-safe mode is on right now. */
export const streamSafe = (): boolean => on;

/** The switch (the Stream-safe preference calls this). Same value again does nothing. */
export function setStreamSafe(next: boolean): void {
  if (on === next) return;
  on = next;
  for (const f of [...listeners]) f();
}

export const subscribeStreamSafe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** For a component that draws stand-ins: it draws again when the switch flips. */
export const useStreamSafe = (): boolean => useSyncExternalStore(subscribeStreamSafe, streamSafe, streamSafe);

/** The `type` for a box where someone types a name or a contact: dots while stream-safe, so what is typed or kept cannot be read. */
export const useMaskedType = (): 'text' | 'password' => (useStreamSafe() ? 'password' : 'text');

/** What a hidden key, token or contact shows as. */
export const HIDDEN = '••••••••';
/** What a hidden profile or author name shows as. */
export const MY_NAME = 'Me';

/**
 * The stand-in for a file or folder. Off, it is the path, untouched. On, it is "My drawing", "My picture", "A file",
 * or "A folder" (say `kind: 'folder'`). A list can give each row `n` (1, 2, ...) so the rows stay apart.
 */
export function displayPath(path: string, opts: { kind?: 'file' | 'folder'; n?: number } = {}): string {
  if (!on || !path) return path;
  return standInPath(path, opts);
}

/** A file as a short name: its own name (without the folders) when off, the stand-in when on. For toasts and small labels. */
export function displayFile(path: string): string {
  if (!on) return path.split(/[\\/]/).pop() || path;
  return displayPath(path);
}

/** Just the folder part of a place: "A folder" when stream-safe, else the folder path as given. */
export const displayFolder = (path: string): string => displayPath(path, { kind: 'folder' });

/** The stand-in for a person's own name (profile, author, byline). */
export function displayName(name: string): string {
  if (!on || !name.trim()) return name;
  return MY_NAME;
}

/** The stand-in for a key, token, password or contact detail. */
export function displaySecret(value: string): string {
  if (!on || !value) return value;
  return HIDDEN;
}

/** True when the text holds something that looks like a place on a computer (a path). */
export const hasPath = hasPathText;

/**
 * Makes a sentence safe to show: every path in it (a toast, an error from the computer, a dialog's words) becomes
 * its stand-in. Words with no path in them come back exactly as they were.
 */
export function scrubText(text: string): string {
  if (!on || !text) return text;
  return scrubPathsAlways(text);
}

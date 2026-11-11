// Gentle messages that appear at the bottom of the window and go away on their own.
import type { QuillAnim, Script } from './mascot/timing';
import { createStore } from './mini';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastOptions {
  kind?: ToastKind;
  /** A button on the toast, usually "Undo". Pressing it dismisses the toast. */
  action?: ToastAction;
  /** How long it stays, in ms. Default 4000, or 7000 when there's an action. 0 keeps it until dismissed. */
  duration?: number;
  /** A tiny Quill on the toast doing this. Refusals and errors get `oops` unless this says otherwise; null means none. */
  quill?: Script | null;
  /** Quill's goodbye: he shows even though Show Quill is now off, plays `quill` once, then goes. */
  farewell?: boolean;
}

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
  duration: number;
  quill: Script | null;
  farewell?: boolean;
}

export const toasts = createStore<ToastItem[]>([]);

let nextId = 1;
const MAX_VISIBLE = 4;

export function toast(message: string, opts: ToastOptions = {}): number {
  const id = nextId++;
  const item: ToastItem = { id, message, kind: opts.kind ?? 'info', action: opts.action, duration: opts.duration ?? (opts.action ? 7000 : 4000), quill: opts.quill !== undefined ? opts.quill : quillFor(opts.kind ?? 'info'), farewell: opts.farewell };
  toasts.set((list) => [...list, item].slice(-MAX_VISIBLE));
  return id;
}

/** Quill only turns up on toasts that say no or that something went wrong. Everything else is plain. */
export function quillFor(kind: ToastKind): QuillAnim | null {
  return kind === 'warn' || kind === 'error' ? 'oops' : null;
}

export function dismissToast(id: number): void {
  toasts.set((list) => list.filter((t) => t.id !== id));
}

export function clearToasts(): void {
  toasts.set([]);
}

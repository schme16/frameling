// Gentle messages that appear at the bottom of the window and go away on their own.
import type { QuillAnim, Script } from './mascot/timing';
import { createStore } from './mini';
import { playCue, type SoundCue } from './sounds';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface ToastAction {
  label: string;
  run: () => void;
  /** A stable name for tests (`toast.<id>`). Default: the label in lower case with dashes. */
  id?: string;
}

/** The test id of a toast button: stays put when the wording changes, if the action has an `id`. */
export function toastTestId(a: ToastAction): string {
  return `toast.${a.id ?? (a.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'action')}`;
}

export interface ToastOptions {
  kind?: ToastKind;
  /** A button on the toast, usually "Undo". Pressing it dismisses the toast. */
  action?: ToastAction;
  /** A second button beside `action`, for a question ("Yes" / "No"). Pressing it dismisses the toast. */
  decline?: ToastAction;
  /** How long it stays, in ms. Default 4000, or 7000 when there's an action. 0 keeps it until dismissed. */
  duration?: number;
  /** A tiny Quill on the toast doing this. Refusals and errors get `oops` unless this says otherwise; null means none. */
  quill?: Script | null;
  /** Quill's goodbye: he shows even though Show Quill is now off, plays `quill` once, then goes. */
  farewell?: boolean;
  /** The sound with it (when Sounds is on). Default: the "can't do that" one for refusals and errors, else none. */
  sound?: SoundCue | null;
  /** The words are on a little sign Quill holds up (audience signs), so they are set apart from his own. */
  sign?: boolean;
  /**
   * Words from chat that nobody has read yet. This is what the toast says in their place while they are covered (see
   * src/audience/spoilers.ts), with a **Read it** button; `message` holds the words and is only drawn once they are read.
   * Any `action` waits behind the reading too, so "Put it up" is never pressed on words you have not seen.
   */
  covered?: string;
}

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
  decline?: ToastAction;
  duration: number;
  quill: Script | null;
  farewell?: boolean;
  sign?: boolean;
  covered?: string;
}

export const toasts = createStore<ToastItem[]>([]);

let nextId = 1;
const MAX_VISIBLE = 4;

export function toast(message: string, opts: ToastOptions = {}): number {
  const id = nextId++;
  const item: ToastItem = { id, message, kind: opts.kind ?? 'info', action: opts.action, decline: opts.decline, duration: opts.duration ?? (opts.action ? 7000 : 4000), quill: opts.quill !== undefined ? opts.quill : quillFor(opts.kind ?? 'info'), farewell: opts.farewell, sign: opts.sign, covered: opts.covered };
  toasts.set((list) => [...list, item].slice(-MAX_VISIBLE));
  const sound = opts.sound !== undefined ? opts.sound : opts.farewell ? 'goodbye' : item.kind === 'warn' || item.kind === 'error' ? 'refused' : null;
  if (sound) playCue(sound);
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

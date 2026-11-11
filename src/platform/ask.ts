// Questions the platform layer asks in the page (the browser has no native dialogs worth using): "Save changes?" and
// "Replace these files?". The UI shows them through AskDialog; without it (tests) window.confirm stands in.
import { createStore } from '../ui/mini';

export interface AskButton {
  value: string;
  label: string;
  primary?: boolean;
}

export interface Question {
  title: string;
  message: string;
  detail?: string;
  buttons: AskButton[];
  /** What Esc or closing the dialog means. */
  cancel: string;
}

interface Pending {
  q: Question;
  resolve: (value: string) => void;
}

export const asking = createStore<Pending | null>(null);
let mounted = false;

/** Called by AskDialog when it mounts, so questions go to it instead of window.confirm. */
export function setAskMounted(on: boolean): void {
  mounted = on;
}

export function ask(q: Question): Promise<string> {
  if (!mounted) {
    // Two-way fallback: OK picks the first (primary) button, Cancel the cancel value.
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function' && window.confirm(`${q.message}${q.detail ? `\n\n${q.detail}` : ''}`);
    return Promise.resolve(ok ? q.buttons[0].value : q.cancel);
  }
  return new Promise((resolve) => {
    const before = asking.get();
    // One question at a time; a new one answers the old one with its cancel value.
    if (before) before.resolve(before.q.cancel);
    asking.set(() => ({ q, resolve }));
  });
}

export function answer(value: string): void {
  const p = asking.get();
  asking.set(() => null);
  p?.resolve(value);
}

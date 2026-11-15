// How a dare that lasts gets put back. Every lasting effect (a flipped view, a grey screen, a banner) is a CLAIM on one
// resource: it says how to apply itself and, by returning a function, how to undo itself. The rules this keeps:
//   - One claim per resource at a time. A new one takes over: the old one is put back first, so effects never stack.
//   - A claim ends three ways, all of which put everything back: its time runs out, the audience gate aborts it (kill,
//     the switch off, the dare switched off), or the streamer presses Put it back. Releasing twice is harmless.
//   - Abort runs the undo at once, in the same breath as kill, not a moment later.
import { createStore } from '../ui/mini';
import { lasts } from '../audience';

/** The things a dare can hold. Only one dare may hold each at a time. */
export type Resource = 'view' | 'banner' | 'countdown' | 'colour';

export interface Held {
  resource: Resource;
  /** The dare's id (`dare.flip`). */
  id: string;
  /** Plain words for the chip: "Flipped view". */
  label: string;
  startedAt: number;
  endsAt: number;
}

/** What the screen shows about dares: what is held now, and the words of a banner or a countdown. */
export interface DareScreen {
  held: Held[];
  banner: { text: string } | null;
  countdown: { text: string; over: boolean } | null;
}

export const dareScreen = createStore<DareScreen>({ held: [], banner: null, countdown: null });

interface Claim {
  held: Held;
  release: () => void;
}
const claims = new Map<Resource, Claim>();

const refresh = () => dareScreen.set((s) => ({ ...s, held: [...claims.values()].map((c) => c.held) }));

/**
 * Takes a resource for `ms`, applies the effect, and returns the way to let go. `apply` returns its own undo.
 * Whoever held the resource before is let go first.
 */
export function claim(resource: Resource, info: { id: string; label: string; ms: number }, apply: () => () => void): () => void {
  claims.get(resource)?.release();
  const now = Date.now();
  const undo = apply();
  let done = false;
  const c: Claim = {
    held: { resource, id: info.id, label: info.label, startedAt: now, endsAt: now + info.ms },
    release: () => {
      if (done) return;
      done = true;
      try {
        undo();
      } finally {
        if (claims.get(resource) === c) claims.delete(resource);
        refresh();
      }
    },
  };
  claims.set(resource, c);
  refresh();
  return c.release;
}

/**
 * Holds a resource for `ms`, then lets go. Lets go at once when `signal` aborts (kill). Resolves when it is all put back.
 */
export async function hold(resource: Resource, info: { id: string; label: string; ms: number }, signal: AbortSignal, apply: () => () => void): Promise<void> {
  if (signal.aborted) return;
  const release = claim(resource, info, apply);
  // The abort listener is synchronous on purpose: kill must put things back in the same call, not on the next tick.
  signal.addEventListener('abort', release, { once: true });
  try {
    await lasts(info.ms, signal);
  } finally {
    signal.removeEventListener('abort', release);
    release();
  }
}

/** Puts every lasting effect back right now. Kill, the switch and Put it back all end here. */
export function releaseAll(): void {
  for (const c of [...claims.values()]) c.release();
  dareScreen.set((s) => (s.held.length || s.banner || s.countdown ? { held: [], banner: null, countdown: null } : s));
}

export const isHeld = (resource: Resource): boolean => claims.has(resource);

// ---------------------------------------------------------------- the page's own marks

const flags = new Set<string>();

/**
 * Marks the page with a word (`grey`, `shake`) that dares.css reacts to. Returns the way to take it off. The mark lives
 * on the root element as `data-dare`, so a stray one is easy to find, and it is gone when the last one is.
 */
export function markPage(flag: string): () => void {
  flags.add(flag);
  write();
  return () => {
    flags.delete(flag);
    write();
  };
}

function write(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (flags.size) root.setAttribute('data-dare', [...flags].join(' '));
  else root.removeAttribute('data-dare');
}

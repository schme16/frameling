// Updates, the page's side: a quiet check of this project's releases, an offer that waits for a calm moment, and the
// three answers. The thinking is in logic.ts; the asking and the putting in are in src/main/update.ts.
//
// No network call happens unless Preferences > Look for new versions is on (the Check for updates command is you
// asking, so it goes ahead either way), and nothing is downloaded until you press Update now.
import { anyOverlayOpen } from '../ui/overlays';
import { createStore } from '../ui/mini';
import { getPrefs, setPrefs } from '../ui/prefs';
import { toast } from '../ui/toast';
import { restartFrameling } from '../io/restart';
import type { FramelingApi } from '../preload/api';
import { applyAnswer, decide, notesLines, quietEnough, versionText, type Answer, type Memory, type Release, type UpdateFacts } from './logic';

export type Phase = { kind: 'asking' } | { kind: 'getting'; pct: number } | { kind: 'ready'; next: 'restart' | 'installer' } | { kind: 'failed'; text: string };

export interface Offer {
  release: Release;
  facts: UpdateFacts;
  phase: Phase;
}

/** The offer on show, or null. */
export const offer = createStore<Offer | null>(null);

// Put off for this run only ("Not right now"); the version someone skipped lives in the settings file.
let later = '';

const bridge = (): FramelingApi['update'] | undefined => (typeof window === 'undefined' ? undefined : (window as { frameling?: FramelingApi }).frameling?.update);

const memory = (): Memory => ({ skipped: getPrefs().updateSkipped, later });

/** The release's notes as a few plain lines (the card shows these). */
export const offerNotes = (r: Release) => notesLines(r.notes);

/** Shows the offer for a release. Also used by the ?debug hook for pictures. */
export function showOffer(release: Release, facts: UpdateFacts): void {
  offer.set({ release, facts, phase: { kind: 'asking' } });
}

/** One of the three answers. Update now starts the update; the other two are remembered (skip for good, not now for this run). */
export async function answer(a: Answer): Promise<void> {
  const o = offer.get();
  if (!o) return;
  const r = applyAnswer(memory(), a, o.release.tag);
  later = r.mem.later;
  if (r.mem.skipped !== getPrefs().updateSkipped) setPrefs({ updateSkipped: r.mem.skipped });
  if (!r.install) {
    offer.set(null);
    if (a === 'skip') toast(`Skipped ${versionText(o.release.tag)}. A newer one will still be offered.`, { kind: 'info', action: { label: 'Undo', run: () => setPrefs({ updateSkipped: '' }) } });
    return;
  }
  const b = bridge();
  if (!b) return;
  offer.set({ ...o, phase: { kind: 'getting', pct: 0 } });
  const off = b.onProgress((pct) => offer.set((cur) => (cur && cur.phase.kind === 'getting' ? { ...cur, phase: { kind: 'getting', pct } } : cur)));
  try {
    const res = await b.install(o.release.tag);
    offer.set((cur) => (cur ? { ...cur, phase: res.ok ? { kind: 'ready', next: res.next } : { kind: 'failed', text: res.message } } : cur));
  } catch {
    offer.set((cur) => (cur ? { ...cur, phase: { kind: 'failed', text: "Something went wrong while getting the update. Try again, or get it from the page." } } : cur));
  } finally {
    off();
  }
}

/** The release's page, for the copies that can't swap themselves (and when an update fails). Counts as putting it off for now. */
export function openReleasePage(): void {
  const o = offer.get();
  if (!o) return;
  void bridge()?.openPage(o.release.page);
  later = versionText(o.release.tag);
  offer.set(null);
}

/** The new copy is in: restart into it (the same restart as everywhere, so it asks about unsaved work and comes back to your drawing), or close so the installer can run. */
export function finishUpdate(): void {
  const o = offer.get();
  if (o?.phase.kind === 'ready' && o.phase.next === 'restart') void restartFrameling();
  else void bridge()?.finish();
}

/** Closes the card after "Update now" went through but you'd rather carry on drawing: the new copy is used next time. */
export function carryOn(): void {
  offer.set(null);
}

// ---------------------------------------------------------------- the check

/** Looks at the releases. `manual` is the command: it says plainly what it found, and it ignores a skip (you did ask). */
export async function checkForUpdates(o: { manual?: boolean } = {}): Promise<void> {
  const manual = !!o.manual;
  const b = bridge();
  if (!b) {
    if (manual) toast('Updates are for the desktop app. This is the web version, so it is always the newest.', { kind: 'info' });
    return;
  }
  if (!manual && !getPrefs().updateCheck) return;
  try {
    const facts = await b.facts();
    if (!facts.canCheck) {
      if (manual) toast("This copy is running from the source folder, so it doesn't look for updates.", { kind: 'info' });
      return;
    }
    const got = await b.releases();
    if (!got.ok) {
      if (manual) toast(`Couldn't check for updates. ${got.message}`, { kind: 'warn' });
      return;
    }
    const v = decide(got.releases, { current: facts.version, beta: facts.beta, skipped: getPrefs().updateSkipped, later, manual });
    if (v.kind === 'newest') {
      if (manual) toast(`You're on the newest version (${versionText(facts.version)}).`, { kind: 'success' });
      return;
    }
    if (v.kind !== 'offer') return;
    if (offer.get()) return;
    if (manual) showOffer(v.release, facts);
    else waitThenShow(v.release, facts);
  } catch {
    if (manual) toast("Couldn't check for updates just now. Try again in a moment.", { kind: 'warn' });
  }
}

// ---------------------------------------------------------------- the calm moment

let lastInput = 0;
let pointerDown = false;
let waiting: ReturnType<typeof setInterval> | null = null;

function trackInput(): () => void {
  lastInput = Date.now();
  const touch = () => (lastInput = Date.now());
  const down = () => {
    pointerDown = true;
    touch();
  };
  const up = () => {
    pointerDown = false;
    touch();
  };
  const opts = { capture: true, passive: true } as const;
  window.addEventListener('pointerdown', down, opts);
  window.addEventListener('pointerup', up, opts);
  window.addEventListener('pointercancel', up, opts);
  window.addEventListener('pointermove', touch, opts);
  window.addEventListener('keydown', touch, opts);
  window.addEventListener('wheel', touch, opts);
  return () => {
    window.removeEventListener('pointerdown', down, opts);
    window.removeEventListener('pointerup', up, opts);
    window.removeEventListener('pointercancel', up, opts);
    window.removeEventListener('pointermove', touch, opts);
    window.removeEventListener('keydown', touch, opts);
    window.removeEventListener('wheel', touch, opts);
  };
}

/** Shows the offer at the first moment nobody is drawing and nothing else is asking something. */
function waitThenShow(release: Release, facts: UpdateFacts): void {
  if (waiting) clearInterval(waiting);
  const tryNow = () => {
    if (offer.get()) return stop();
    if (!getPrefs().onboarded || anyOverlayOpen() || !quietEnough(Date.now(), lastInput, pointerDown)) return;
    stop();
    showOffer(release, facts);
  };
  const stop = () => {
    if (waiting) clearInterval(waiting);
    waiting = null;
  };
  waiting = setInterval(tryNow, 2000);
}

const FIRST_LOOK_MS = 20_000;
const EVERY_MS = 12 * 3_600_000;
let started = false;

/** Starts the quiet checking: once a little after start-up (so it never competes with opening a drawing), then twice a day. Safe to call twice. */
export function startUpdateWatch(): () => void {
  if (started || typeof window === 'undefined' || !bridge()) return () => {};
  started = true;
  const untrack = trackInput();
  const first = setTimeout(() => void checkForUpdates(), FIRST_LOOK_MS);
  const again = setInterval(() => void checkForUpdates(), EVERY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(again);
    if (waiting) clearInterval(waiting);
    waiting = null;
    untrack();
    started = false;
  };
}

/** For tests: forget what was put off in this run. */
export function resetUpdateMemory(): void {
  later = '';
  offer.set(null);
}

// The sharer's side of a live review in the drawing window: what is going on (the code, who is in, who is knocking), the inbox
// of what reviewers said, and their pointers. The link itself is in the main process (src/main/review*.ts); this listens to
// it and tells it what the sharer decided. A reviewer's comments go into the drawing by `landWaiting` (no step in Undo, see
// src/core/quiet.ts) unless the sharer chose to see them first, and then only Keep writes them, as one undo step.
import { useSyncExternalStore } from 'react';
import { audience } from '../audience/index';
import { currentChoice, onChoiceChange, useChoice, withChoice } from '../core/choices';
import { store } from '../core/store';
import { streamSafe, subscribeStreamSafe, useStreamSafe } from '../core/streamSafe';
import { documentTitle } from '../io/document';
import { stopReviewFollowing } from '../popout/link';
import { obs, useObsState } from '../streamsafe/obs';
import { toast } from '../ui/toast';
import { createStore } from '../ui/mini';
import { REVEAL_MS, VIEW_CHOICE } from '../audience/spoilers';
import { Inbox, driftOf, keepInto, type InboxEntry } from '../review/inbox';
import { Pointers } from '../review/pointer';
import { readComments } from '../review/commentsFile';
import { coverReviewers, landsAtOnce } from './cover';
import { addedSummary, keepSummary } from './words';

export type Phase = 'off' | 'starting' | 'live' | 'offline' | 'burned';

export interface ReviewState {
  phase: Phase;
  code: string;
  knocks: { conn: number; name: string }[];
  seats: { seat: number; name: string; linked: boolean }[];
  /** Wrong tries made so far by strangers (never who). */
  wrong: number;
  /** The card (code, who is in, the inbox) is open. */
  card: boolean;
  /** Counts up whenever the inbox or the pointers change, so the screen draws again. */
  tick: number;
}

const OFF: ReviewState = { phase: 'off', code: '', knocks: [], seats: [], wrong: 0, card: false, tick: 0 };
export const review = createStore<ReviewState>(OFF);
export const inbox = new Inbox();
export const pointers = new Pointers();

const bump = () => review.set((s) => ({ ...s, tick: s.tick + 1 }));
const api = () => window.frameling?.review;

export const isLive = (): boolean => review.get().phase !== 'off';

/** Whether names and words are covered right now. */
export const covered = (): boolean => coverReviewers({ streamSafe: streamSafe(), audienceOn: audience.isOn(), obsOnAir: obs.state.streaming || obs.state.recording }, currentChoice(VIEW_CHOICE));

/** The same, for a screen: draws again when Stream-safe, audience features, OBS or the answer about your viewers changes. */
export function useCovered(): boolean {
  const safe = useStreamSafe();
  const aud = useSyncExternalStore(audience.subscribe, () => audience.isOn());
  const o = useObsState();
  const answer = useChoice(VIEW_CHOICE);
  review.use((s) => s.tick);
  return coverReviewers({ streamSafe: safe, audienceOn: aud, obsOnAir: o.streaming || o.recording }, answer);
}

// ------------------------------------------------------------------ reading a covered comment

const revealed = new Map<string, ReturnType<typeof setTimeout>>();
export const isRevealed = (key: string): boolean => revealed.has(key);
/** Shows one comment's words for a few seconds, then covers them again by itself. */
export function reveal(key: string): void {
  if (revealed.has(key)) clearTimeout(revealed.get(key));
  revealed.set(
    key,
    setTimeout(() => {
      revealed.delete(key);
      bump();
    }, REVEAL_MS),
  );
  inbox.markRead(key);
  bump();
}

// ------------------------------------------------------------------ comments going into the drawing

/** Comments are waiting only because a tile or symbol was open: they go in as soon as it is closed. */
let deferred = false;
let addedNow = 0;
let addedTimer: ReturnType<typeof setTimeout> | null = null;

/** The usual answer ("add them as they come") and nothing covered. */
export const addsAtOnce = (): boolean => landsAtOnce(currentChoice('review.keep'), covered());

/**
 * Puts every waiting comment into the drawing, when the sharer chose to have them as they come and nothing is covered. They
 * go in without a step in Undo, so the sharer's Redo and their next Undo are untouched. Returns how many went in.
 */
export function landWaiting(): number {
  if (!addsAtOnce() || inbox.waiting === 0) return 0;
  const entries = inbox.entries.filter((e) => !e.kept);
  let wrote = 0;
  const went = store().updateQuiet((d) => void (wrote = keepInto(d, entries, true)));
  // Nothing changed because a tile or symbol is open: try again when the store next moves.
  if (!went && store().nestedTag()) {
    deferred = true;
    return 0;
  }
  deferred = false;
  // Whatever was already there (or too many) is done with too, so it is not tried again every time.
  inbox.markKept(entries.map((e) => e.key));
  addedNow += wrote;
  if (wrote && !addedTimer) {
    addedTimer = setTimeout(() => {
      addedTimer = null;
      const n = addedNow;
      addedNow = 0;
      if (n) toast(addedSummary(n), { kind: 'info' });
    }, 900);
  }
  bump();
  return wrote;
}

let watching = false;
/** Lands what is waiting whenever the cover lifts, the answer changes, or a tile that was open is closed. */
function watchForLanding(): void {
  if (watching) return;
  watching = true;
  const again = () => void (inbox.waiting > 0 && landWaiting());
  subscribeStreamSafe(again);
  audience.subscribe(again);
  obs.subscribe(again);
  onChoiceChange(again);
  store().subscribe(() => void (deferred && landWaiting()));
}

// ------------------------------------------------------------------ the events from the desktop side

let off: (() => void) | null = null;

function onEvent(e: import('../main/reviewHost').HostUiEvent): void {
  switch (e.type) {
    case 'starting':
      return;
    case 'ready':
      review.set((s) => ({ ...s, phase: 'live', code: e.code, card: true }));
      return;
    case 'offline':
      review.set((s) => ({ ...s, phase: 'offline' }));
      return;
    case 'burned':
      review.set((s) => ({ ...s, phase: 'burned' }));
      return;
    case 'wrong':
      review.set((s) => ({ ...s, wrong: e.tries }));
      return;
    case 'knock':
      review.set((s) => ({ ...s, knocks: [...s.knocks.filter((k) => k.conn !== e.conn), { conn: e.conn, name: e.name }], card: true }));
      return;
    case 'turnedAway':
      review.set((s) => ({ ...s, knocks: s.knocks.filter((k) => k.name !== e.name || e.why === 'full') }));
      return;
    case 'seated':
      review.set((s) => ({
        ...s,
        knocks: s.knocks.filter((k) => k.name !== e.name),
        seats: [...s.seats.filter((x) => x.seat !== e.seat), { seat: e.seat, name: e.name, linked: true }].sort((a, b) => a.seat - b.seat),
      }));
      return;
    case 'left':
      pointers.forget(e.seat);
      review.set((s) => ({ ...s, seats: s.seats.map((x) => (x.seat === e.seat ? { ...x, linked: false } : x)) }));
      return;
    case 'pointer':
      pointers.see(e.seat, e, performance.now());
      bump();
      return;
    case 'item': {
      const id = inbox.add(e.seat, e.name, e.item, Date.now(), driftOf((e.item as { sig?: string }).sig, store().get().doc));
      // The inbox has it: tell the reviewer, so their outbox can let go. Refused (a full inbox) is not acknowledged.
      if (id) void api()?.ack(e.seat, [id]);
      landWaiting();
      bump();
      return;
    }
    case 'done':
      toast(covered() ? 'A reviewer is finished.' : `${e.name} is finished reviewing.`, { kind: 'info' });
      return;
    case 'stopped':
      return;
  }
}

// ------------------------------------------------------------------ what the sharer does

/** Makes a code and waits for reviewers. Asks first what your viewers can see, when you are streaming and have not said. */
export function startReview(): void {
  const bridge = api();
  if (!bridge) {
    toast('Live review needs the Frameling desktop app.', { kind: 'info' });
    return;
  }
  if (isLive()) {
    review.set((s) => ({ ...s, card: true }));
    return;
  }
  const go = () => {
    off ??= bridge.onEvent(onEvent);
    watchForLanding();
    review.set({ ...OFF, phase: 'starting', card: true });
    void bridge.start(documentTitle());
  };
  // A review while you stream puts names and words near your screen: say once what your viewers can see, so the cover is right.
  if (covered() || audience.isOn() || streamSafe() || obs.state.streaming || obs.state.recording) withChoice(VIEW_CHOICE, go);
  else go();
}

/** Ends the review. What reviewers wrote and you have not kept is dealt with the way you said, or asked about once. */
export function stopReview(): void {
  const bridge = api();
  void bridge?.stop();
  stopReviewFollowing();
  review.set((s) => ({ ...s, phase: 'off', code: '', knocks: [], seats: s.seats.map((x) => ({ ...x, linked: false })) }));
  if (inbox.waiting > 0) {
    withChoice<'all' | 'none' | 'look'>('review.keep', (v) => {
      // Anything still waiting is waiting for a reason (covered while you stream, or a tile open): it goes in when that lifts.
      if (v === 'all') landWaiting();
      else if (v === 'none') inbox.clear();
      review.set((s) => ({ ...s, card: v === 'none' ? false : inbox.waiting > 0 || s.card }));
      bump();
    });
  } else review.set((s) => ({ ...s, card: false, seats: [] }));
}

export const admit = (conn: number): void => void api()?.admit(conn);
export const refuse = (conn: number): void => {
  void api()?.refuse(conn);
  review.set((s) => ({ ...s, knocks: s.knocks.filter((k) => k.conn !== conn) }));
};
export const removeSeat = (seat: number): void => {
  void api()?.remove(seat);
  pointers.forget(seat);
  review.set((s) => ({ ...s, seats: s.seats.filter((x) => x.seat !== seat) }));
};

/** Writes comments into the drawing as one undo step, and marks them kept. With no list, everything waiting. */
export function keepNow(keys?: readonly string[]): number {
  const set = keys ? new Set(keys) : null;
  const entries = inbox.entries.filter((e) => !e.kept && (!set || set.has(e.key)));
  if (!entries.length) return 0;
  let wrote = 0;
  store().update('Keep reviewers\' comments', (d) => void (wrote = keepInto(d, entries)));
  inbox.markKept(entries.map((e) => e.key));
  toast(keepSummary(wrote), { kind: 'success' });
  bump();
  return wrote;
}

export function goToFrame(e: InboxEntry): void {
  const f = e.item.t === 'note' ? e.item.frame : e.item.t === 'mark' ? e.item.mark.frame : undefined;
  if (f !== undefined) store().setUi({ frame: Math.max(0, Math.min(store().get().doc.length - 1, f)) });
}

export function setCard(open: boolean): void {
  review.set((s) => ({ ...s, card: open }));
}

/** Test and harness hook: feeds an event as if the desktop side had sent it. */
export const feedEvent = onEvent;

let files = 0;
/** Puts a comments file's contents in the inbox as a reviewer of its own. Returns how many arrived, or null when it was not a comments file. */
export function bringInComments(text: string): number | null {
  const f = readComments(text, Date.now());
  if (!f) return null;
  // A file is a reviewer who is not here: a seat past the four, so it can never meet a live one's ids.
  const seat = 10 + files++;
  let n = 0;
  for (const item of f.items) if (inbox.add(seat, f.from, item, Date.now(), driftOf((item as { sig?: string }).sig, store().get().doc))) n++;
  watchForLanding();
  landWaiting();
  // They went straight in, or they wait in the card (to keep, or because something is covered).
  review.set((s) => ({ ...s, card: n > 0 && inbox.waiting > 0 ? true : s.card }));
  bump();
  return n;
}

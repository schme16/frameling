// What the reviewer's window knows beyond the picture: how the link is doing, who the sharer is, the sharer's pointer, and what
// is waiting to be handed over. The page feeds it every message that is not a picture message and the review layer reads it.
// Plain data and a subscription, so it is tested without a window.
import { Pointers } from '../review/pointer';
import { isToReviewer } from '../review/wire';
import type { Replica } from './replica';

export type LinkState = 'starting' | 'looking' | 'checking' | 'knocking' | 'in' | 'offline' | 'noOne' | 'wrong' | 'refused' | 'full' | 'dropped' | 'lost' | 'stopped' | 'ended' | 'removed';

export interface BusState {
  link: LinkState;
  /** The sharer's name for the drawing (the window title). */
  name: string;
  seat: number;
  /** Seconds left of trying again after a drop. */
  secondsLeft: number | null;
  /** How many of the reviewer's things are waiting to be handed over. */
  waiting: number;
  /** Counts up on every change so the screen draws again. */
  tick: number;
  /** The last answer to Save my comments: null until asked. */
  saved: boolean | null;
  /** The last answer to Save picture: null until asked. */
  pictureSaved: boolean | null;
}

export class ReviewBus {
  say: (m: unknown) => void = () => {};
  /** The window's way of saving the picture it holds (set by the review layer); the desktop side can ask for it too. */
  onSavePicture: () => void = () => {};
  replica: Replica | null = null;
  repaint: () => void = () => {};
  /** The sharer's pointer, as one dot. */
  readonly sharer = new Pointers();
  /** Ids of what this reviewer sent that the sharer has acknowledged (for ticking things "arrived"). */
  readonly arrived = new Set<string>();
  private s: BusState = { link: 'starting', name: '', seat: -1, secondsLeft: null, waiting: 0, tick: 0, saved: null, pictureSaved: null };
  private subs = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  };
  snapshot = (): BusState => this.s;

  private set(p: Partial<BusState>): void {
    this.s = { ...this.s, ...p, tick: this.s.tick + 1 };
    for (const f of [...this.subs]) f();
  }

  /** True when the message was one of ours (so the picture's replica must not see it). */
  handle(m: unknown): boolean {
    if (typeof m !== 'object' || m === null) return false;
    const t = (m as { t?: unknown }).t;
    if (t === 'status') {
      const x = m as { state: LinkState; seat?: number; secondsLeft?: number };
      this.set({ link: x.state, secondsLeft: x.secondsLeft ?? null, ...(x.seat !== undefined ? { seat: x.seat } : {}) });
      return true;
    }
    if (t === 'waiting') {
      this.set({ waiting: (m as { count: number }).count });
      return true;
    }
    if (t === 'savePictureNow') {
      this.onSavePicture();
      return true;
    }
    if (t === 'pictureSaved') {
      this.set({ pictureSaved: (m as { ok: boolean | null }).ok ?? null });
      return true;
    }
    if (t === 'saved') {
      this.set({ saved: (m as { ok: boolean }).ok });
      return true;
    }
    if (!isToReviewer(m)) return t === 'bye';
    if (m.t === 'pointer') {
      this.sharer.see(0, m, performance.now());
      this.set({});
      return true;
    }
    if (m.t === 'admitted') {
      this.set({ name: m.name, seat: m.seat, link: 'in' });
      return true;
    }
    if (m.t === 'ack') {
      for (const id of m.ids) this.arrived.add(id);
      this.set({});
      return true;
    }
    if (m.t === 'bye') {
      this.set({ link: m.why === 'removed' ? 'removed' : 'ended' });
      return true;
    }
    return false;
  }
}

/** The words of the bar across the top, or null when the link needs no words. Plain, with what to do next. */
export function linkWords(s: Pick<BusState, 'link' | 'secondsLeft' | 'name' | 'waiting'>): { text: string; tone: 'info' | 'warn' } | null {
  switch (s.link) {
    case 'starting':
    case 'looking':
      return { text: 'Looking for them. They need to still have the code showing.', tone: 'info' };
    case 'checking':
      return { text: 'Checking the code…', tone: 'info' };
    case 'knocking':
      return { text: 'Waiting for them to let you in…', tone: 'info' };
    case 'in':
      return null;
    case 'dropped':
      return { text: s.secondsLeft ? `The link dropped. Trying again for ${s.secondsLeft} seconds.${s.waiting ? ` ${s.waiting} of your notes are waiting to send.` : ''}` : 'The link dropped. Trying again.', tone: 'warn' };
    case 'lost':
      return { text: `Lost the link.${s.waiting ? ` ${s.waiting} of your notes did not get through.` : ''} You can save your comments as a file and send it another way.`, tone: 'warn' };
    case 'refused':
      return { text: 'They did not let you in this time.', tone: 'warn' };
    case 'full':
      return { text: 'This review already has four people in it.', tone: 'warn' };
    case 'wrong':
      return { text: 'That code did not work. Check it with them and try again.', tone: 'warn' };
    case 'noOne':
      return { text: 'Could not find them. Check the code, and that their live review is still on. Two people on strict networks may not be able to connect.', tone: 'warn' };
    case 'offline':
      return { text: 'Could not reach the peer network. Check your connection.', tone: 'warn' };
    case 'ended':
      return { text: 'The review has ended. Nothing more will arrive. This is the last picture they sent.', tone: 'info' };
    case 'removed':
      return { text: 'You were taken out of this review. Nothing more will arrive. This is the last picture they sent.', tone: 'warn' };
    case 'stopped':
      return { text: 'You left the review.', tone: 'info' };
  }
}

/** The review is over for good: the sharer stopped, or sent this reviewer away. Nothing more will arrive and nothing more can be sent. */
export const isOver = (link: LinkState): boolean => link === 'ended' || link === 'removed';

/** What the window is called: it says so in the title bar when the review is over, so it cannot be mistaken for a live one. */
export function reviewTitle(link: LinkState, name: string): string {
  const what = name || 'a drawing';
  if (link === 'ended') return `Review ended: ${what}`;
  if (link === 'removed') return `Removed from the review: ${what}`;
  return `Live review: ${what}`;
}

/** The headline and the line under it across the top of a window whose review is over, or null while it is not. */
export function overWords(link: LinkState): { title: string; text: string } | null {
  if (link === 'ended') return { title: 'This review has ended', text: 'They stopped sharing, so nothing more will arrive. You are looking at the last picture they sent.' };
  if (link === 'removed') return { title: 'You were taken out of this review', text: 'Nothing more will arrive. You are looking at the last picture they sent.' };
  return null;
}

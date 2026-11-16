// The page's end of the stream overlay: while the overlay is wanted and the actions door is open, it tells the desktop
// side the overlay is on, sends what is going on whenever it changes (a little after, so a burst is one message), and
// again every few seconds so the desktop side knows the app is still there. Off, it says so and goes quiet. The pieces
// are handed in, so it is tested with a pretend desktop side.
import type { OverlayBridge } from '../preload/api';

export const BEAT_MS = 4000;
export const SETTLE_MS = 120;

export interface OverlayLinkDeps {
  bridge(): OverlayBridge | null;
  /** What is going on now. */
  build(): unknown;
  /** Calls the function whenever anything may have changed. Returns the way to stop. */
  watch(fn: () => void): () => void;
  /** Is the actions door open right now, and tells when that changes. */
  door: { running(): boolean; watch(fn: () => void): () => void };
}

export interface OverlayLink {
  /** The feature is on: follow the door. */
  start(): void;
  /** The feature is off: say so and stop. */
  stop(): void;
  /** For tests: send now. */
  flush(): void;
}

export function createOverlayLink(d: OverlayLinkDeps): OverlayLink {
  let wanted = false;
  let active = false;
  let offDoor: (() => void) | null = null;
  let offWatch: (() => void) | null = null;
  let settle: ReturnType<typeof setTimeout> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = (fn: () => Promise<unknown> | void) => {
    chain = chain.then(fn).catch(() => undefined);
  };

  const send = () => {
    const b = d.bridge();
    if (b && active) enqueue(() => b.push(d.build()));
  };
  const later = () => {
    if (settle !== undefined) return;
    settle = setTimeout(() => {
      settle = undefined;
      send();
    }, SETTLE_MS);
  };

  const engage = () => {
    if (active) return;
    const b = d.bridge();
    if (!b) return;
    active = true;
    enqueue(() => b.setOn(true));
    send();
    offWatch = d.watch(later);
    beat = setInterval(send, BEAT_MS);
  };
  const disengage = (tell: boolean) => {
    if (!active) return;
    active = false;
    offWatch?.();
    offWatch = null;
    clearTimeout(settle);
    settle = undefined;
    clearInterval(beat);
    beat = undefined;
    const b = d.bridge();
    if (tell && b) enqueue(() => b.setOn(false));
  };
  const follow = () => {
    if (wanted && d.door.running()) engage();
    // A closed door already switched the overlay off on the desktop side, so there is nothing to tell it.
    else disengage(false);
  };

  return {
    start() {
      wanted = true;
      offDoor ??= d.door.watch(follow);
      follow();
    },
    stop() {
      wanted = false;
      offDoor?.();
      offDoor = null;
      disengage(true);
    },
    flush: send,
  };
}

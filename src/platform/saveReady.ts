/**
 * Downloads that finish long after the click that started them (a long export). Safari only lets a page start a
 * download shortly after a real click or key press, so a file that is ready later is held back and offered with a Save
 * button; pressing it is a fresh click, so the download goes through. Only Safari (and the iOS browsers, which are
 * Safari underneath) is held back: Chrome, Edge and Firefox download straight away however long it took, and an extra
 * click there would be pointless. The rule is "Safari and more than a second since the last click or key press": a
 * single time limit that is shorter than Safari's own, so it never guesses wrong the dangerous way.
 */

/** Safari's window for starting a download after a click is short; stay well inside it. */
export const FRESH_CLICK_MS = 1000;

/** Clicks and key presses that count as the person doing something. */
export const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'keydown', 'click', 'touchend'] as const;

/** Safari and the iOS browsers (all WebKit); not Chrome, Edge, Opera or Android browsers, which carry "Safari" in their name too. */
export function isSafariLike(ua: string): boolean {
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua);
}

/** Whether a finished file should wait for a fresh click. `sinceGesture` is in ms (Infinity if there never was one). */
export function needsFreshClick(safari: boolean, sinceGesture: number): boolean {
  return safari && !(sinceGesture <= FRESH_CLICK_MS);
}

/** What the "ready" message says, in plain words. */
export function readyMessage(names: string[]): string {
  if (names.length === 1) return `Your file "${names[0]}" is ready. Press Save to keep it.`;
  return `Your ${names.length} files are ready. Press Save to keep them.`;
}

interface Held {
  name: string;
  bytes: Uint8Array;
}

export interface OfferDeps {
  /** Starts the browser download (run from the Save button, so it is a fresh click). */
  save(name: string, bytes: Uint8Array): void;
  /** Shows the message with a Save button; returns what `hide` needs. */
  show(message: string, onSave: () => void): number;
  hide(id: number): void;
}

/** Files waiting for their Save press. One message covers all of them. */
export function createSaveOffers(deps: OfferDeps) {
  let held: Held[] = [];
  let shown: number | null = null;
  const saveAll = (): number => {
    const list = held;
    held = [];
    if (shown !== null) deps.hide(shown);
    shown = null;
    for (const f of list) deps.save(f.name, f.bytes);
    return list.length;
  };
  return {
    offer(name: string, bytes: Uint8Array): void {
      held.push({ name, bytes });
      if (shown !== null) deps.hide(shown);
      shown = deps.show(readyMessage(held.map((f) => f.name)), saveAll);
    },
    saveAll,
    pending: (): number => held.length,
  };
}

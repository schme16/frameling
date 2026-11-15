// The pure side of review links: what gets copied, and when an arriving link may be joined. No screen in here, so it is tested plainly.
import { reviewLink } from '../share/link';

export type LinkShape = 'link' | 'message';

/** What the Copy the link button puts on the clipboard. A message carries the words too, for chats that do not make frameling:// clickable. */
export function textToCopy(code: string, shape: LinkShape): string {
  const link = reviewLink(code);
  if (shape === 'link') return link;
  return `Come and look at my drawing in Frameling: ${link}\nIf the link does not open, choose File > Join a live review in Frameling and type: ${code}`;
}

/** How long a link's question stays unanswerable after it appears, in ms. A key being pressed for something else a moment ago must not join a stranger's review. */
export const GUARD_MS = 900;

/** Whether Join may be pressed yet. Pure, so the rule is tested without a clock. */
export const joinReady = (shownAt: number, now: number): boolean => now - shownAt >= GUARD_MS;

export type LinkVerdict = 'ask' | 'yours' | 'busy';

/**
 * What to do with a link that has arrived. `yours` is your own review's code (nobody joins their own review), `busy` is a question
 * already on screen (a second link must not swap the code under a finger that is about to press Join).
 */
export function linkVerdict(code: string, myCode: string, asking: boolean): LinkVerdict {
  if (asking) return 'busy';
  if (myCode && code === myCode) return 'yours';
  return 'ask';
}

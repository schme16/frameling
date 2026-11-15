// Review links, the drawing window's side. Sending: Copy the link (a button on the card, and a command). Receiving: a link that
// arrives from outside only ever puts a question on screen (LinkDialog); nothing connects until the person presses Join, and the
// sharer still has to press Let in. The words and rules are in linkLogic.ts and src/share/link.ts.
import { withChoice } from '../core/choices';
import { toast } from '../ui/toast';
import { LinkDialog } from './LinkDialog';
import { linkVerdict, textToCopy, type LinkShape } from './linkLogic';
import { isLive, review } from './state';
import { mountModal } from '../io/mount';

/** Copies the link for the review that is on. The link is never shown on screen (it is a code, and this may be a stream). */
export function copyReviewLink(): void {
  const { phase, code } = review.get();
  if (phase !== 'live' || !code) {
    toast('There is no code to link to yet.', { kind: 'info' });
    return;
  }
  withChoice<LinkShape>('review.linkShape', (shape) => {
    void navigator.clipboard.writeText(textToCopy(code, shape)).then(
      () => toast(shape === 'link' ? 'Link copied. Anybody who opens it is asked first, and you still let them in.' : 'Message copied, with the link and the four words.', { kind: 'success' }),
      () => toast('Could not copy. Copy the four words from the card instead.', { kind: 'warn' }),
    );
  });
}

let closeAsk: (() => void) | null = null;

/** For the harnesses only (?debug): one window is both the sharer and the friend, so it can say the link came from somewhere else. */
export const pretend = { elsewhere: false };

/** A review link has come in: ask. Never joins by itself. */
export function askAboutLink(code: string): void {
  const v = linkVerdict(code, isLive() && !pretend.elsewhere ? review.get().code : '', closeAsk !== null);
  if (v === 'busy') return;
  if (v === 'yours') {
    toast('That link is for your own review. Send it to somebody else.', { kind: 'info' });
    return;
  }
  closeAsk = mountModal((close) => (
    <LinkDialog
      code={code}
      close={() => {
        closeAsk = null;
        close();
      }}
    />
  ));
}

/** Listens for links from the desktop side and picks up one that came before the page was ready. Called once. */
export function listenForLinks(): void {
  const api = typeof window === 'undefined' ? undefined : window.frameling?.review;
  if (!api?.onLink || !api.takeLink) return;
  const pull = () => void api.takeLink().then((c) => c && askAboutLink(c)).catch(() => {});
  api.onLink(pull);
  pull();
}

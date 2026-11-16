// Send with a code and Receive with a code: the page's side. It makes the copy exactly as Send a copy does, then hands it
// to the desktop side, which makes the code and holds the connection (src/main/share.ts). Nothing is saved here.
import { currentChoice, registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';
import { desktop } from './desktop';
import { notify } from './notify';
import { makeCopyBytes } from './sendCopy';

/** How many minutes a code lasts when nobody uses it. */
export type ShareExpiryChoice = '5' | '10' | '30';

registerChoice<ShareExpiryChoice>({
  id: 'share.expiry',
  title: choiceWord('choice.share.expiry.title'),
  question: choiceWord('choice.share.expiry.question'),
  options: [
    { value: '5', label: choiceWord('choice.share.expiry.5.label'), detail: choiceWord('choice.share.expiry.5.detail') },
    { value: '10', label: choiceWord('choice.share.expiry.10.label'), detail: choiceWord('choice.share.expiry.10.detail') },
    { value: '30', label: choiceWord('choice.share.expiry.30.label'), detail: choiceWord('choice.share.expiry.30.detail') },
  ],
  default: '10',
  category: 'Files',
  silent: true,
  help: 'share-with-a-code',
});

let open = false;

/** Makes a copy and opens the window that shows its code. */
export async function sendWithCode(): Promise<boolean> {
  const api = desktop();
  if (!api?.share) {
    notify('Sending with a code works in the Frameling desktop app.', 'info');
    return false;
  }
  if (open) return false;
  open = true;
  try {
    // The same copy as Send a copy: your name comes off, and the undo history question is asked the first time.
    const { bytes } = await makeCopyBytes(api);
    const minutes = Number(currentChoice<ShareExpiryChoice>('share.expiry')) || 10;
    const { openSendDialog } = await import('./ShareDialog');
    // The window closing is what ends the share, so this is free again when it does.
    openSendDialog(bytes, minutes, () => (open = false));
    return true;
  } catch {
    open = false;
    return false;
  }
}

/** Opens the window that takes somebody else's code. */
export async function receiveWithCode(): Promise<boolean> {
  const api = desktop();
  if (!api?.share) {
    notify('Receiving with a code works in the Frameling desktop app.', 'info');
    return false;
  }
  const { openReceiveDialog } = await import('./ShareDialog');
  openReceiveDialog();
  return true;
}

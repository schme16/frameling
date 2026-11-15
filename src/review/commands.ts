// The commands for reviews without servers: send a page to look at, bring the comments back in.
import { registerCommands } from '../core/registry';
import { bringInFromClipboard, bringInFromFile } from './bring';
import { sendForReview } from './send';

const HELP = 'review-page';

registerCommands([
  {
    id: 'review.send',
    label: 'Send for review...',
    category: 'File',
    keys: ['Mod+Alt+Shift+E'],
    description: 'Save one web page with your drawing on it that somebody can open in any browser, look at, and leave notes on. No Frameling, no account, nobody has to be online.',
    help: HELP,
    keywords: ['review', 'send for review', 'share', 'feedback', 'comments', 'critique', 'look at', 'show someone', 'html', 'web page', 'read only', 'read-only', 'collaborate', 'note', 'notes'],
    global: true,
    run: () => void sendForReview(),
  },
  {
    id: 'review.bring',
    label: 'Bring in comments...',
    category: 'File',
    keys: ['Mod+Alt+Shift+I'],
    description: "Pick the comments file somebody sent back from a review page. Their notes, answers and marks join yours, with their name on them. Nothing of yours is replaced.",
    help: HELP,
    keywords: ['review', 'comments', 'bring in', 'import comments', 'feedback', 'notes', 'merge', 'reviewer', 'come back', 'open comments'],
    global: true,
    run: () => void bringInFromFile(),
  },
  {
    id: 'review.bringPaste',
    label: 'Bring in comments from the clipboard',
    category: 'File',
    description: 'Somebody sent their comments as text instead of a file? Copy it, then use this. It does the same as Bring in comments.',
    help: HELP,
    keywords: ['review', 'comments', 'paste', 'clipboard', 'text', 'bring in', 'import comments', 'notes'],
    global: true,
    run: () => void bringInFromClipboard(),
  },
]);

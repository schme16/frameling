// Live review's commands. Starting a review is itself the switch: nothing is on until you press it, and it ends when you press
// Stop, close the window or quit.
import { registerCommands } from '../core/registry';
import { openJoinDialog } from './JoinDialog';
import { toast } from '../ui/toast';
import { desktop } from '../io/desktop';
import { bringInComments, inbox, isLive, keepNow, review, setCard, startReview, stopReview } from './state';

const HELP = 'live-review';
const bridge = () => window.frameling?.review;
const needsDesktop = () => (bridge() ? undefined : 'Live review needs the Frameling desktop app.');

registerCommands([
  {
    id: 'review.toggle',
    label: 'Start a live review...',
    category: 'File',
    keys: ['Mod+Alt+L'],
    description: 'Get a code for up to four people to look at your drawing as you draw it, point at things, and leave notes that come straight back to you. They cannot change your drawing. It is off until you press this, and ends when you press it again.',
    help: HELP,
    keywords: ['live review', 'review', 'feedback', 'critique', 'comments', 'notes', 'share', 'code', 'friend', 'client', 'watch', 'follow', 'pointer', 'cursor', 'collaborate', 'online', 'live', 'stop'],
    global: true,
    checked: () => isLive(),
    enabled: () => !!bridge(),
    reason: needsDesktop,
    run: () => (isLive() ? stopReview() : startReview()),
  },
  {
    id: 'review.join',
    label: 'Join a live review...',
    category: 'File',
    description: 'Type in the code somebody gave you to look at their drawing live, point at things, and leave notes for them. You cannot change their drawing.',
    help: HELP,
    keywords: ['live review', 'review', 'join', 'code', 'feedback', 'critique', 'comments', 'look', 'watch', 'friend'],
    global: true,
    enabled: () => !!bridge(),
    reason: needsDesktop,
    run: () => void openJoinDialog(),
  },
  {
    id: 'review.card',
    label: 'Show the live review card',
    category: 'File',
    description: 'Opens the card with the code, who is here, and what reviewers have said, so you can let people in and keep their comments.',
    help: HELP,
    keywords: ['live review', 'review', 'comments', 'inbox', 'code', 'card', 'who is here'],
    enabled: () => review.get().phase !== 'off' || inbox.waiting > 0,
    reason: () => (review.get().phase !== 'off' || inbox.waiting > 0 ? undefined : 'There is no live review, and no comments waiting.'),
    run: () => setCard(true),
  },
  {
    id: 'review.bringIn',
    label: 'Bring in review comments...',
    category: 'File',
    description: 'Opens a comments file a reviewer saved (Save my comments) and puts what they wrote in the inbox, to keep or leave. Use it when a live review could not connect or dropped for good.',
    help: HELP,
    keywords: ['live review', 'review', 'comments', 'file', 'import', 'bring in', 'offline', 'inbox', 'feedback', 'critique'],
    global: true,
    enabled: () => !!desktop()?.files.openOther,
    reason: () => (desktop()?.files.openOther ? undefined : 'Bringing in comments needs the Frameling desktop app.'),
    run: () => void bringInFile(),
  },
  {
    id: 'review.keep',
    label: 'Keep reviewers\' comments in my drawing',
    category: 'File',
    description: 'Writes every comment reviewers left, as notes and marks with their name on, into your drawing. It is one step, so Undo takes them all back.',
    help: HELP,
    keywords: ['live review', 'review', 'comments', 'keep', 'save', 'notes', 'marks', 'inbox', 'merge'],
    enabled: () => inbox.waiting > 0,
    reason: () => (inbox.waiting > 0 ? undefined : 'No reviewer comments are waiting.'),
    run: () => void keepNow(),
  },
]);


async function bringInFile(): Promise<void> {
  const r = await desktop()?.files.openOther?.({ title: 'Bring in review comments', filters: [{ name: 'Review comments', extensions: ['json'] }] });
  if (!r) return;
  if ('error' in r) return void toast(r.error, { kind: 'warn' });
  const n = bringInComments(new TextDecoder().decode(r.bytes));
  toast(n === null ? 'That is not a review comments file.' : n === 0 ? 'There was nothing new in that file.' : n === 1 ? '1 comment is in your inbox.' : `${n} comments are in your inbox.`, { kind: n ? 'success' : 'warn' });
}

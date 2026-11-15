// Live review's commands. Starting a review is itself the switch: nothing is on until you press it, and it ends when you press
// Stop, close the window or quit.
import { registerCommands } from '../core/registry';
import { openJoinDialog } from './JoinDialog';
import { copyReviewLink } from './link';
import { toast } from '../ui/toast';
import { desktop } from '../io/desktop';
import { currentChoice, setChoice } from '../core/choices';
import { bringInComments, inbox, isLive, keepNow, landWaiting, review, setCard, startReview, stopReview } from './state';

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
    id: 'review.copyLink',
    label: 'Copy the live review link',
    category: 'File',
    description: 'Copies a frameling:// link to your live review. Whoever opens it is asked whether to join, then you let them in. The four word code still works for anybody who would rather type it.',
    help: 'review-link',
    keywords: ['live review', 'review', 'link', 'copy', 'url', 'invite', 'share', 'join', 'send', 'frameling://', 'code'],
    enabled: () => review.get().phase === 'live',
    reason: () => (review.get().phase === 'live' ? undefined : 'Start a live review first, then there is a link to copy.'),
    run: copyReviewLink,
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
    id: 'review.savePicture',
    label: 'Save the picture from a live review...',
    category: 'File',
    description: 'In a live review you joined: saves the picture you can see as one flat PNG. It works while the review is on and after it has ended, and it is not their layered drawing. In the review window, press Ctrl+S.',
    help: 'review-ended',
    keywords: ['live review', 'review', 'save', 'picture', 'image', 'png', 'final', 'last picture', 'ended', 'reviewer', 'export'],
    enabled: () => !!bridge(),
    reason: needsDesktop,
    run: () => void savePictureNow(),
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
    id: 'review.addAsTheyCome',
    label: 'Add reviewers\' comments to my drawing as they come',
    category: 'File',
    description: 'On: a note or mark a reviewer leaves goes straight into your drawing with their name on, and your Undo is not touched. Off: comments wait in the live review card until you keep them. While you stream they stay covered either way.',
    help: HELP,
    keywords: ['live review', 'review', 'comments', 'notes', 'inbox', 'keep', 'add', 'automatic', 'as they come', 'show me first', 'stream'],
    checked: () => currentChoice('review.keep') === 'all',
    run: () => {
      const on = currentChoice('review.keep') === 'all';
      setChoice('review.keep', on ? 'look' : 'all');
      if (!on) landWaiting();
      toast(on ? 'Comments will wait in the card until you keep them.' : 'Comments will go straight into your drawing.', { kind: 'info' });
    },
  },
  {
    id: 'review.keep',
    label: 'Keep reviewers\' comments in my drawing',
    category: 'File',
    description: 'Writes every comment still waiting in the card, as notes and marks with the reviewer\'s name on, into your drawing. It is one step, so Undo takes them all back. Comments go in by themselves unless you chose to see them first.',
    help: HELP,
    keywords: ['live review', 'review', 'comments', 'keep', 'save', 'notes', 'marks', 'inbox', 'merge'],
    enabled: () => inbox.waiting > 0,
    reason: () => (inbox.waiting > 0 ? undefined : 'No reviewer comments are waiting.'),
    run: () => void keepNow(),
  },
]);


async function savePictureNow(): Promise<void> {
  const r = await bridge()?.savePicture();
  if (!r?.ok) toast('There is no live review window open to save from. Join one first.', { kind: 'info' });
}

async function bringInFile(): Promise<void> {
  const r = await desktop()?.files.openOther?.({ title: 'Bring in review comments', filters: [{ name: 'Review comments', extensions: ['json'] }] });
  if (!r) return;
  if ('error' in r) return void toast(r.error, { kind: 'warn' });
  const n = bringInComments(new TextDecoder().decode(r.bytes));
  toast(n === null ? 'That is not a review comments file.' : n === 0 ? 'There was nothing new in that file.' : n === 1 ? '1 comment is in your inbox.' : `${n} comments are in your inbox.`, { kind: n ? 'success' : 'warn' });
}

// Bring in comments: reads the small comments file (or the text) a reviewer sent back, checks it is for this drawing,
// warns when frames have moved since the page was sent, and merges it in as one undo step. Nothing is replaced: it is a
// union by id, so bringing the same file in twice changes nothing, and `done` stays ticked if either side ticked it.
import { choose, registerChoice, rememberedChoice } from '../core/choices';
import { store } from '../core/store';
import { choiceWord } from '../words/choices';
import { desktop } from '../io/desktop';
import { notify } from '../io/notify';
import { setNotesSaved } from '../notes/state';
import { setMarksSaved } from '../notes/marksState';
import { driftOf, isEmptyReview, mergeReview, mergedAnything, momentWords, readReview, summaryWords, type Drift, type ReviewFile } from './model';

export type ReviewDriftChoice = 'bring' | 'skip';

/** What the question says about the version, while it is open. */
let asking: Drift | null = null;

registerChoice<ReviewDriftChoice>({
  id: 'review.drift',
  title: choiceWord('choice.review.drift.title'),
  question: choiceWord('choice.review.drift.question'),
  options: [
    {
      value: 'bring',
      label: choiceWord('choice.review.drift.bring.label'),
      get detail() {
        return asking?.sent && asking.was
          ? choiceWord('choice.review.drift.bring.sized', { sent: momentWords(asking.sent), was: String(asking.was), now: String(asking.now) })
          : choiceWord('choice.review.drift.bring.detail');
      },
    },
    { value: 'skip', label: choiceWord('choice.review.drift.skip.label'), detail: choiceWord('choice.review.drift.skip.detail'), once: true },
  ],
  default: 'bring',
  dismiss: 'skip',
  category: 'Files',
  help: 'review-page',
});

/** The note about the version a review looked at, in plain words. Empty when the file does not say. */
export function versionWords(r: Pick<ReviewFile, 'sent'>, d: Drift): string {
  if (!r.sent) return '';
  const when = momentWords(r.sent);
  return d.drifted
    ? `It was made on the version you sent on ${when}, and frames have moved since${d.was ? ` (${d.was} then, ${d.now} now)` : ''}, so notes pinned to a frame may be a frame off.`
    : `It was made on the version you sent on ${when}.`;
}

/** Merges a comments file (or its text) into the open drawing. Resolves true when something came in. */
export async function bringInReview(input: unknown): Promise<boolean> {
  const read = readReview(input);
  if (!read.ok) {
    notify(read.why, 'error');
    return false;
  }
  const review = read.review;
  if (isEmptyReview(review)) {
    notify(`${review.from} sent no comments in that file.`, 'info');
    return false;
  }
  const doc = store().rootDoc();
  const drift = driftOf(doc, review);
  if (drift.otherDoc) {
    notify('Those comments are for a different drawing. Open the drawing the review page was made from, or send a new page from this one.', 'error', undefined, 9000);
    return false;
  }
  if (drift.drifted) {
    const known = rememberedChoice('review.drift');
    asking = drift;
    let answer: string;
    try {
      answer = known ?? (await choose<ReviewDriftChoice>('review.drift'));
    } finally {
      asking = null;
    }
    if (answer === 'skip') return false;
  }
  const merged = mergeReview(store().rootDoc(), review);
  if (!mergedAnything(merged.summary)) {
    notify(`Nothing new: ${review.from}'s comments are all here already.`, 'info');
    return false;
  }
  store().update(`Bring in ${review.from}'s comments`, (d) => {
    d.notes = merged.notes as never;
    if (merged.marks.length) d.marks = merged.marks as never;
  });
  // They are no use hidden.
  setNotesSaved({ show: true });
  setMarksSaved({ show: true });
  const orphans = merged.summary.orphans ? ` ${merged.summary.orphans} answer${merged.summary.orphans === 1 ? '' : 's'} belonged to notes this drawing no longer has, so they were left out.` : '';
  notify(`Brought in ${summaryWords(merged.summary)} from ${review.from}. ${versionWords(review, drift)}${orphans}`.replace(/ +/g, ' ').trim(), drift.drifted ? 'warn' : 'success', undefined, drift.drifted ? 14000 : 9000, 'cheer');
  return true;
}

/** Asks for a comments file and brings it in. */
export async function bringInFromFile(): Promise<boolean> {
  const bytes = await pickBytes();
  if (bytes === null) return false;
  if (!bytes) {
    notify('That file could not be read.', 'error');
    return false;
  }
  return bringInReview(bytes);
}

/** Brings in comments that were pasted, from whatever is on the clipboard. */
export async function bringInFromClipboard(): Promise<boolean> {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    notify('Frameling cannot read the clipboard here. Save the comments as a file and use Bring in comments from a file instead.', 'info');
    return false;
  }
  if (!text.trim()) {
    notify('Nothing on the clipboard. Copy the comments text first.', 'info');
    return false;
  }
  return bringInReview(text);
}

async function pickBytes(): Promise<Uint8Array | null | undefined> {
  const api = desktop();
  if (api?.files.openOther) {
    const r = await api.files.openOther({ filters: [{ name: 'Review comments', extensions: ['json'] }], title: 'Bring in comments' });
    if (!r) return null;
    return 'error' in r ? undefined : r.bytes;
  }
  return new Promise<Uint8Array | null | undefined>((done) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json,.txt,text/plain';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return done(null);
      void f.arrayBuffer().then((b) => done(new Uint8Array(b)), () => done(undefined));
    };
    input.oncancel = () => done(null);
    input.click();
  });
}

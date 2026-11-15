// Send for review: makes one HTML page with the drawing, your notes and marks on it, and a comment tool, saves it where
// you pick, and tells you how big it came out. Whoever gets it opens it in a browser (no Frameling, no account, nobody
// has to be online) and sends a small comments file back; see bring.ts. The page never holds a file path.
import { choose, registerChoice, rememberedChoice } from '../core/choices';
import { store } from '../core/store';
import { displayFile, displayPath, streamSafe } from '../core/streamSafe';
import { choiceWord } from '../words/choices';
import { can } from '../platform';
import { desktop } from '../io/desktop';
import { notify, notifySaved } from '../io/notify';
import { sizeWords } from '../io/sendCopyPlan';
import { renderReviewPictures } from './frames';
import { buildReviewPage } from './page';
import { reviewItems, reviewFileName, structureSig, type PageData } from './model';
import { boardOf } from '../notes/model';

export type ReviewOwnChoice = 'show' | 'clean';

registerChoice<ReviewOwnChoice>({
  id: 'review.own',
  title: choiceWord('choice.review.own.title'),
  question: choiceWord('choice.review.own.question'),
  options: [
    { value: 'show', label: choiceWord('choice.review.own.show.label'), detail: choiceWord('choice.review.own.show.detail') },
    { value: 'clean', label: choiceWord('choice.review.own.clean.label'), detail: choiceWord('choice.review.own.clean.detail') },
  ],
  default: 'show',
  dismiss: 'clean',
  category: 'Files',
  help: 'review-page',
});

let sending = false;

/** Makes the page and saves it. Resolves true when it was written. */
export async function sendForReview(): Promise<boolean> {
  if (sending) return false;
  sending = true;
  try {
    // The drawing is taken once, before anything waits, so the page is one moment of it.
    const doc = store().rootDoc();
    const items = reviewItems(doc);
    let keep = true;
    if (items.notes.length || items.marks.length) {
      const known = rememberedChoice('review.own');
      keep = (known ?? (await choose<ReviewOwnChoice>('review.own'))) !== 'clean';
    }
    notify('Making the review page...', 'info', undefined, 2500);
    const pics = await renderReviewPictures(doc);
    const data: PageData = {
      v: 1,
      doc: { id: doc.id, name: doc.name, width: doc.width, height: doc.height, length: doc.length, fps: doc.fps },
      sent: Date.now(),
      sig: structureSig(doc),
      images: pics.images,
      frames: pics.frames,
      notes: keep ? items.notes : [],
      marks: keep ? items.marks : [],
    };
    const board = boardOf(doc);
    if (board) data.board = board;
    if (pics.pixelated) data.pixelated = true;
    const bytes = new TextEncoder().encode(buildReviewPage(data));
    const name = reviewFileName(doc.name);

    const api = desktop();
    if (!api) {
      // A browser tab has no folder to pick: it downloads the page instead.
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notifySaved(`Made the review page (${sizeWords(bytes.length)}). Send it to whoever should look.`, 'success', undefined, 9000, 'cheer');
      return true;
    }
    const target = await api.files.pickExportFile({ suggestedName: name, filters: [{ name: 'Review page', extensions: ['html'] }], title: 'Save the review page' });
    if (!target) return false;
    const w = await api.files.write(target, bytes);
    if ('error' in w) {
      notify(w.error, 'error');
      return false;
    }
    const size = sizeWords(bytes.length);
    const small = pics.tooBig ? ' It came out big for a message, so a link or a shared folder may suit it better.' : '';
    const shown = can('showInFolder');
    // The file manager opens on the file, unless you are streaming: then it would show your folders, so it waits for the button.
    if (shown && !streamSafe()) {
      void api.files.showInFolder(target);
      notifySaved(`Saved the review page as ${displayFile(target)} (${size}), showing in your file manager now. Send it to whoever should look.${small}`, 'success', undefined, 10000, 'cheer');
    } else {
      const action = shown ? { label: 'Show in folder', run: () => void api.files.showInFolder(target) } : undefined;
      notifySaved(`Saved the review page as ${displayPath(target)} (${size}). Send it to whoever should look.${small}`, 'success', action, 10000, 'cheer');
    }
    return true;
  } finally {
    sending = false;
  }
}

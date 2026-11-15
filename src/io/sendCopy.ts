// Send a copy: saves a copy of the drawing where you pick, asks once whether your undo history goes with it, then shows
// the file in your file manager. The drawing you are working on is not touched: its file, its place in memory, its
// "unsaved" mark and the recent list stay exactly as they were. It saves what you see now, saved or not.
import { choose, registerChoice, rememberedChoice } from '../core/choices';
import { historyFitsFile } from '../core/historyFile';
import { store } from '../core/store';
import { rootDoc } from '../core/symbols';
import { displayFile, displayPath, streamSafe } from '../core/streamSafe';
import { choiceWord } from '../words/choices';
import { can } from '../platform';
import { desktop } from './desktop';
import { notify, notifySaved } from './notify';
import { previewBytes } from './preview';
import { packCopy, sizeWords, extraBytes, type CopySizes } from './sendCopyPlan';

export type SendHistoryChoice = 'plain' | 'keep';

/** The two sizes of the copy being sent, while the question is open, so the answers can say the real numbers. */
let asking: CopySizes | null = null;

registerChoice<SendHistoryChoice>({
  id: 'send.history',
  title: choiceWord('choice.send.history.title'),
  question: choiceWord('choice.send.history.question'),
  options: [
    {
      value: 'plain',
      label: choiceWord('choice.send.history.plain.label'),
      get detail() {
        return asking ? choiceWord('choice.send.history.plain.sized', { plain: sizeWords(asking.plain) }) : choiceWord('choice.send.history.plain.detail');
      },
    },
    {
      value: 'keep',
      label: choiceWord('choice.send.history.keep.label'),
      get detail() {
        return asking ? choiceWord('choice.send.history.keep.sized', { full: sizeWords(asking.full), plain: sizeWords(asking.plain) }) : choiceWord('choice.send.history.keep.detail');
      },
    },
  ],
  // Smallest by default: history is what makes a file big, and what lets somebody find what you took out.
  default: 'plain',
  dismiss: 'plain',
  category: 'Files',
  help: 'send-a-copy',
});

let sending = false;

/** Saves a copy to send. Resolves true when the copy was written. */
export async function sendCopy(): Promise<boolean> {
  const api = desktop();
  if (!api) {
    notify('Sending a copy works in the Frameling desktop app.', 'info');
    return false;
  }
  if (sending) return false;
  sending = true;
  try {
    // The drawing and its steps are taken together, before anything waits, so they stay a matching pair.
    const doc = store().rootDoc();
    const frame = store().get().ui.frame;
    const original = store().get().ui.filePath;
    const steps = store().historyForSave();
    const history = steps && historyFitsFile(steps.doc) ? steps : null;
    const preview = await previewBytes(rootDoc(doc), frame);
    const version = api.versions.app;
    const pack = (h: typeof history) => packCopy(doc, version, { preview, history: h });

    let bytes: Uint8Array;
    // Set only when both sizes were made so a plain copy can say what the history would have added.
    let measured: CopySizes | null = null;
    const known = rememberedChoice('send.history');
    if (!history) {
      bytes = await pack(null);
    } else if (known) {
      bytes = await pack(known === 'keep' ? history : null);
    } else {
      // Not asked yet: pack both, so the question can say the real sizes.
      const [plain, full] = [await pack(null), await pack(history)];
      measured = { plain: plain.length, full: full.length };
      asking = measured;
      let answer: string;
      try {
        answer = await choose<SendHistoryChoice>('send.history');
      } finally {
        asking = null;
      }
      bytes = answer === 'keep' ? full : plain;
      if (answer === 'keep') measured = null;
    }

    const r = await api.files.save({ bytes, path: null, suggestedName: doc.name || 'Untitled', copy: { avoid: original } });
    if (!r) return false;
    if ('error' in r) {
      notify(r.error, 'error');
      return false;
    }

    const size = sizeWords(bytes.length);
    const more = measured && extraBytes(measured) > 0 ? ` Your undo history would have made it ${sizeWords(measured.full)}.` : '';
    // The file manager opens on the file, unless you are streaming: then it would show your folders, so it waits for the button.
    const shown = can('showInFolder');
    if (shown && !streamSafe()) {
      void api.files.showInFolder(r.path);
      notifySaved(`Saved a copy as ${displayFile(r.path)} (${size}), showing in your file manager now.${more}`, 'success', undefined, 9000, 'cheer');
    } else {
      const action = shown
        ? { label: 'Show in folder', run: () => void api.files.showInFolder(r.path) }
        : { label: 'Copy where it is', run: () => void copyText(r.path) };
      notifySaved(`Saved a copy as ${displayPath(r.path)} (${size}).${more}`, 'success', action, 9000, 'cheer');
    }
    return true;
  } finally {
    sending = false;
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notify('Copied. Paste it wherever you need it.', 'info', undefined, 2500);
  } catch {
    // No clipboard here: the message already said where it went.
  }
}

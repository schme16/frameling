// Restart Frameling: the one thing everything that says "restart" calls (the update's Restart now, the hardware drawing
// switch, the plugin memory switch, the command). Unsaved work is set aside in the autosave copy, so nothing is at risk and
// nothing is asked: the desktop side closes, opens again, and this side opens that copy, still marked unsaved, at the
// same frame, layer and view. Where the work can't be set aside it asks the usual question first (see restartFrameling).
import { store } from '../core/store';
import { registerCommand } from '../core/registry';
import { desktop } from './desktop';
import { notify } from './notify';
import { choose, registerChoice } from '../core/choices';
import { closeSheet } from '../ui/overlays';
import { handOverUnsavedWork, loadBytes, openPath } from './document';

export interface RestartView {
  frame?: number;
  layerId?: string;
  zoom?: number;
  panX?: number;
  panY?: number;
  /** There was Undo history, which can't come across. */
  hadUndo?: boolean;
}

/** Where you are in the drawing right now. */
export function currentView(): RestartView {
  const { ui } = store().get();
  return { frame: ui.frame, ...(ui.activeLayerId ? { layerId: ui.activeLayerId } : {}), zoom: ui.zoom, panX: ui.panX, panY: ui.panY, ...(store().canUndo() ? { hadUndo: true } : {}) };
}

/** Said when this copy can't open itself again. Nothing is closed, so no work is at risk, and the person decides when. */
export function cannotRestartText(why: string): string {
  return `${why} Nothing was closed, so your drawing is still here.`;
}

export const UNDO_CHOICE = 'restart.undo';

// The one thing a restart can't carry is Undo: those steps live in memory. Said once, before the first restart that
// has some, then remembered (and changeable in Preferences, Behaviour).
registerChoice({
  id: UNDO_CHOICE,
  title: 'Restarting with Undo steps',
  question: "Frameling will restart and come back to your drawing just as it is, unsaved changes and all. The one thing that can't come across is Undo: it starts fresh. Restart?",
  category: 'Files',
  help: 'restart',
  default: 'go',
  options: [
    { value: 'go', label: 'Restart', detail: 'Your drawing comes back as it is. Undo starts fresh.', did: 'Restarted, and Undo started fresh.' },
    { value: 'wait', label: 'Not now', detail: 'Stay here and keep Undo.', once: true },
  ],
});

/** What is said when the unsaved work can't be carried across, so the old way (ask first) is used. */
export function fallbackText(why: 'big' | 'failed'): string {
  return why === 'big'
    ? 'Your unsaved changes are too big to carry across, so Frameling asks about saving first, then comes back to the saved drawing.'
    : "Couldn't set your unsaved changes aside to carry across, so Frameling asks about saving first, then comes back to the saved drawing.";
}

/**
 * Restarts Frameling. Unsaved work goes across in the autosave copy and comes back still unsaved, so nothing is asked.
 * Where it can't (too big, no room to write it) it asks the usual question first and says so. Resolves true when the
 * restart is under way, false when it can't happen or you said not now: then it stays open, so nothing is lost.
 */
export async function restartFrameling(): Promise<boolean> {
  const api = desktop();
  if (!api?.app.restart) {
    notify('Restarting works in the Frameling desktop app. Here, reload the page.', 'info');
    return false;
  }
  try {
    // Undo can't come across: say so before it goes.
    if (store().canUndo() && (await choose<string>(UNDO_CHOICE)) === 'wait') return false;
    let carry = false;
    if (store().get().ui.dirty) {
      const h = await handOverUnsavedWork();
      carry = h.ok;
      if (!h.ok) notify(fallbackText(h.why), 'info', undefined, 9000);
    }
    const r = await api.app.restart(currentView(), carry);
    if (r.ok) return true;
    notify(cannotRestartText(r.message), 'warn', undefined, 12000);
  } catch {
    notify("Frameling couldn't restart itself. Close it and start it again yourself. Nothing was closed, so your drawing is still here.", 'warn', undefined, 12000);
  }
  return false;
}

/** Puts you back where you were once the drawing is open again: the same frame, layer and view. What no longer exists is left alone. */
export function applyRestoredView(view: RestartView): void {
  const s = store();
  const { doc, ui } = s.get();
  const patch: Record<string, unknown> = {};
  if (typeof view.frame === 'number') patch.frame = Math.min(Math.max(0, view.frame), Math.max(0, doc.length - 1));
  if (view.layerId && doc.layers.some((l) => l.id === view.layerId)) patch.activeLayerId = view.layerId;
  if (typeof view.zoom === 'number' && typeof view.panX === 'number' && typeof view.panY === 'number') Object.assign(patch, { zoom: view.zoom, panX: view.panX, panY: view.panY });
  if (Object.keys(patch).length && ui) s.setUi(patch);
}

export interface Restore {
  file: string | null;
  view: RestartView;
  carry?: boolean;
}

/**
 * The start after a restart: opens the drawing again where you were. Carried work opens from the autosave copy and is
 * marked unsaved, exactly as it was (closing still asks); otherwise the saved file opens. Resolves true when the
 * carried work is back, so the start doesn't also offer to restore it.
 */
export async function bringBack(r: Restore): Promise<boolean> {
  const api = desktop();
  if (!api) return false;
  let carried = false;
  if (r.carry) {
    try {
      const found = await api.autosave.read();
      if (found) {
        closeSheet();
        carried = await loadBytes(found.bytes, found.meta.filePath, { dirty: true, confirm: false });
      }
    } catch {
      carried = false;
    }
    if (!carried) {
      notify("Couldn't bring back your unsaved changes just as they were. They are kept: the next message offers them.", 'warn', undefined, 9000);
      if (r.file) await openPath(r.file);
    }
  } else if (r.file) {
    await openPath(r.file);
  }
  if (r.file === null && !r.carry) return false;
  applyRestoredView(r.view);
  if (r.view.hadUndo) notify(carried ? 'Back where you were, with your unsaved changes. Undo starts fresh.' : 'Back where you were. Undo starts fresh.', 'info', undefined, 5000);
  return carried;
}

registerCommand({
  id: 'app.restart',
  label: 'Restart Frameling',
  category: 'File',
  description: 'Close Frameling and open it again where you were. It asks about unsaved work first, like closing does.',
  help: 'restart',
  keywords: ['relaunch', 'reopen', 'reload', 'quit and open', 'start again'],
  run: () => void restartFrameling(),
});

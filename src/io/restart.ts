// Restart Frameling: the one thing everything that says "restart" calls (the update's Restart now, the hardware drawing
// switch, the plugin memory switch, the command). The desktop side closes the way closing does (Save, Don't save or
// Cancel for unsaved work, the same question), then opens again; this side says where you are so it can put you back.
import { store } from '../core/store';
import { registerCommand } from '../core/registry';
import { desktop } from './desktop';
import { notify } from './notify';

export interface RestartView {
  frame?: number;
  layerId?: string;
  zoom?: number;
  panX?: number;
  panY?: number;
}

/** Where you are in the drawing right now. */
export function currentView(): RestartView {
  const { ui } = store().get();
  return { frame: ui.frame, ...(ui.activeLayerId ? { layerId: ui.activeLayerId } : {}), zoom: ui.zoom, panX: ui.panX, panY: ui.panY };
}

/** Said when this copy can't open itself again. Nothing is closed, so no work is at risk, and the person decides when. */
export function cannotRestartText(why: string): string {
  return `${why} Nothing was closed, so your drawing is still here.`;
}

/**
 * Restarts Frameling. Resolves true when the restart is under way (the window may still be asking about unsaved
 * work), false when it can't happen: then it says so plainly and stays open, so you can close and start it yourself.
 */
export async function restartFrameling(): Promise<boolean> {
  const api = desktop();
  if (!api?.app.restart) {
    notify('Restarting works in the Frameling desktop app. Here, reload the page.', 'info');
    return false;
  }
  try {
    const r = await api.app.restart(currentView());
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

registerCommand({
  id: 'app.restart',
  label: 'Restart Frameling',
  category: 'File',
  description: 'Close Frameling and open it again where you were. It asks about unsaved work first, like closing does.',
  help: 'restart',
  keywords: ['relaunch', 'reopen', 'reload', 'quit and open', 'start again'],
  run: () => void restartFrameling(),
});

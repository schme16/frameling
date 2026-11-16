// The `app` power on the host's side: listing, pressing and choosing, for a plugin or a script that was allowed it.
// The rules (what may be pressed, what may be chosen) are in appRules.ts.
import { allCommands, getCommand } from '../core/registry';
import { reasonFor } from '../core/commandReasons';
import { store } from '../core/store';
import { findLayer } from '../core/doc';
import { effectiveKeys } from '../ui/keys';
import { isRunnable, type AppCommandInfo, type AppSet } from './appRules';

function enabledNow(c: { enabled?: (s: ReturnType<ReturnType<typeof store>['get']>) => boolean }): boolean {
  try {
    return c.enabled ? c.enabled(store().get()) : true;
  } catch {
    return false;
  }
}

/** Every command a script may press, with what Frameling calls it and whether it can run just now. */
export function appCommands(): AppCommandInfo[] {
  return allCommands()
    .filter((c) => isRunnable(c.id))
    .map((c) => ({ id: c.id, label: c.label, category: c.category, description: c.description ?? '', keys: effectiveKeys(c), enabled: enabledNow(c) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Presses one command and waits until it is done. Says why in plain words when it can't be pressed. */
export async function appRun(id: string): Promise<void> {
  const c = getCommand(id);
  if (!c || !isRunnable(id)) throw new Error(`Frameling has no command "${id.slice(0, 60)}" a script can press.`);
  if (!enabledNow(c)) {
    const why = reasonFor(c, store().get());
    throw new Error(`"${c.label}" can't run right now${why ? `: ${why}` : '.'}`);
  }
  await c.run();
}

/** Chooses the frame, layer, shapes and colours the commands act on. */
export function appSet(what: AppSet): void {
  const s = store();
  const st = s.get();
  if (what.layerId !== undefined) {
    if (!findLayer(st.doc, what.layerId)) throw new Error(`There's no layer "${what.layerId.slice(0, 40)}".`);
    s.setUi({ activeLayerId: what.layerId });
  }
  if (what.frame !== undefined) s.setUi({ frame: Math.min(Math.max(0, what.frame), s.get().doc.length - 1) });
  if (what.selection !== undefined) s.setUi({ selection: what.selection });
  if (what.color !== undefined) s.setUi({ color: what.color });
  if (what.fillColor !== undefined) s.setUi({ fillColor: what.fillColor });
}

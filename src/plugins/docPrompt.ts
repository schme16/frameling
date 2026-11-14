// A drawing can hold shapes a plugin made. They are ordinary shapes, so the drawing always opens and looks right; but
// to change one with the plugin's own settings the plugin has to be on. This says so when such a drawing opens.
import type { Doc } from '../core/format';
import { notify } from '../io/notify';
import { plugins, setEnabled, whenPluginsLoaded } from './manager';
import { pluginsUsedBy } from './shapes';

/** What to tell the person, one line each, for the plugins a document uses that are not running. Pure given the lists. */
export function missingPluginNotes(used: Map<string, Set<string>>, installed: { id: string; name: string; enabled: boolean }[]): { id: string; name: string; installed: boolean; message: string }[] {
  const out: { id: string; name: string; installed: boolean; message: string }[] = [];
  for (const [id] of used) {
    const have = installed.find((p) => p.id === id);
    if (have?.enabled) continue;
    out.push(
      have
        ? { id, name: have.name, installed: true, message: `This drawing has shapes from the "${have.name}" plugin, which is turned off. They still show and move; turn it on to change their settings.` }
        : { id, name: id, installed: false, message: `This drawing has shapes from a plugin called "${id}", which isn't installed. They still show and move, but their settings can't be changed here.` },
    );
  }
  return out;
}

export async function offerPluginsForDoc(doc: Doc): Promise<void> {
  const used = pluginsUsedBy(doc);
  if (!used.size) return;
  // A drawing opened as the app starts waits for the plugins to be read first.
  await Promise.race([whenPluginsLoaded(), new Promise((r) => setTimeout(r, 3000))]);
  const list = plugins.get().map((p) => ({ id: p.manifest.id, name: p.manifest.name, enabled: p.enabled && p.status !== 'off' }));
  for (const n of missingPluginNotes(used, list)) {
    notify(n.message, 'info', n.installed ? { label: 'Turn it on', run: () => void setEnabled(n.id, true) } : undefined, 12000);
  }
}

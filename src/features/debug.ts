// With ?debug in the page address, expose the features so scripts/e2e/features.cjs can switch them in the real app.
// Never on in normal use.
import { allCommands, allPanels } from '../core/registry';
import { saveFile, loadFile } from '../io/file';
import { loadBytes } from '../io/document';
import { store } from '../core/store';
import { isFeatureOn, setFeatureOn, switchableFeatures } from './host';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingFeatures: unknown }).__framelingFeatures = {
    list: () => switchableFeatures().map((f) => ({ id: f.id, name: f.name, on: isFeatureOn(f.id) })),
    set: (id: string, on: boolean) => setFeatureOn(id, on, { remember: false }),
    has: (command: string) => allCommands().some((c) => c.id === command),
    hasPanel: (id: string) => allPanels().some((p) => p.id === id),
    /** Opens the open document again from its saved bytes, the way a file opens. */
    reopen: () => loadBytes(saveFile(store().get().doc), null, { confirm: false }),
    roundTrip: () => loadFile(saveFile(store().get().doc)).doc.ext ?? null,
  };
}

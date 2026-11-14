// With ?debug in the page address, expose save, open and autosave so scripts/e2e/export.cjs can run them in the real
// app. These are the same functions the commands call. Never on in normal use.
import { autosaveNow, offerRecovery } from './autosave';
import { takeVersion } from './versions';
import { keepUnsavedWork, openPath, saveDocument, saveDocumentAs } from './document';
import { rootDoc } from '../core/symbols';
import { store } from '../core/store';
import { desktop } from './desktop';
import { previewBytes } from './preview';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  // For pictures of Open recent: puts these starter drawings on the recent list with their little pictures, as if they had been saved. `none` are left without one (an older file).
  const demoRecent = async (items: { template: string; name: string; none?: boolean }[]) => {
    const api = desktop();
    const run = (window as unknown as { __frameling: { template(id: string): void } }).__frameling;
    // Oldest first, so the first one given ends up on top.
    for (const it of [...items].reverse()) {
      run.template(it.template);
      await new Promise((r) => setTimeout(r, 400));
      const path = `/home/you/Drawings/${it.name}.frameling`;
      await api?.recent.add(path);
      if (!it.none) {
        const png = await previewBytes(rootDoc(store().rootDoc()));
        if (png) await api?.recent.keepPreview?.(path, png);
      }
    }
  };
  (window as unknown as { __framelingIo: unknown }).__framelingIo = { demoRecent, saveDocument, saveDocumentAs, openPath, autosaveNow, offerRecovery, keepUnsavedWork, takeVersion, versionsDialog: (layout?: 'list' | 'strip') => import('./VersionsDialog').then((m) => m.openVersionsDialog(layout)) };
}

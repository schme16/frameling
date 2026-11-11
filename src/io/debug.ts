// With ?debug in the page address, expose save, open and autosave so scripts/e2e/export.cjs can run them in the real
// app. These are the same functions the commands call. Never on in normal use.
import { autosaveNow, offerRecovery } from './autosave';
import { keepUnsavedWork, openPath, saveDocument, saveDocumentAs } from './document';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingIo: unknown }).__framelingIo = { saveDocument, saveDocumentAs, openPath, autosaveNow, offerRecovery, keepUnsavedWork };
}

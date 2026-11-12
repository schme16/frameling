// Runs first in the page (src/renderer/main.tsx): puts the browser bridge in place when there's no desktop one, and
// in the web build adds the web-only bits (offline support, "Install as an app"). Its help topic is in features.ts.
import { toast } from '../ui/toast';
import { openHelp } from '../ui/overlays';
import { installPlatform, isWeb, setSavedHook } from './index';
import { createStorageKeeper, noticeMemory, STORAGE_NOTICE } from './web/keepStorage';
import { installFileDrop } from './drop';
import { registerWebCommands, startPwa } from './pwa';

function safeLocalStorage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

installPlatform();
if (isWeb()) {
  registerWebCommands();
  const keep = createStorageKeeper({
    storage: typeof navigator !== 'undefined' ? navigator.storage : undefined,
    seen: noticeMemory(safeLocalStorage()),
    tell: () => {
      toast(STORAGE_NOTICE, { kind: 'info', duration: 20000, quill: null, action: { label: 'Tell me more', run: () => openHelp('web-browser') }, decline: { label: 'Okay', run: () => undefined } });
    },
  });
  setSavedHook(() => void keep());
  startPwa();
  // After the picture and Aseprite handlers (they install on the next turn), so they get first say.
  setTimeout(() => installFileDrop(), 50);
}

// Runs first in the page (src/renderer/main.tsx): puts the browser bridge in place when there's no desktop one, and
// in the web build adds the web-only bits (offline support, "Install as an app"). Its help topic is in features.ts.
import { installPlatform, isWeb } from './index';
import { installFileDrop } from './drop';
import { registerWebCommands, startPwa } from './pwa';

installPlatform();
if (isWeb()) {
  registerWebCommands();
  startPwa();
  // After the picture and Aseprite handlers (they install on the next turn), so they get first say.
  setTimeout(() => installFileDrop(), 50);
}

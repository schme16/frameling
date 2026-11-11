// Runs first in the page (src/renderer/main.tsx): puts the browser bridge in place when there's no desktop one, and
// in the web build adds the web-only bits (offline support, "Install as an app", its help topic).
import { installPlatform, isWeb } from './index';
import './help';
import { registerWebCommands, startPwa } from './pwa';

installPlatform();
if (isWeb()) {
  registerWebCommands();
  startPwa();
}

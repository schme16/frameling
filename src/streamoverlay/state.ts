// The overlay's address, as far as the settings screen and the commands need it. Never held here: the address carries
// the token, so it is asked for at the moment it is revealed or copied and then let go, like the actions door key.
import { createStore } from '../ui/mini';
import { doorStatus } from '../streamdoor/state';
import { OVERLAY_PREFIX } from '../shared/streamOverlay';
import { HIDDEN } from '../core/streamSafe';

/** True while an overlay address exists to copy: the actions door is open. */
export const overlayReady = createStore(false);
doorStatus.subscribe(() => overlayReady.set(doorStatus.get().running));

/** The address with its token hidden, for the screen: "http://127.0.0.1:47213/overlay/••••••••/". */
export const maskedAddress = (base: string, port: number): string => `${base || `http://127.0.0.1:${port}`}${OVERLAY_PREFIX}/${HIDDEN}/`;

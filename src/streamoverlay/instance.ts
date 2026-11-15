// The page's one link to the stream overlay, wired to the app's sources and the actions door's status.
import { desktop } from '../io/desktop';
import { doorStatus } from '../streamdoor/state';
import { createOverlayLink } from './link';
import { buildOverlay, subscribeSources } from './sources';

export const overlayLink = createOverlayLink({
  bridge: () => desktop()?.overlay ?? null,
  build: () => buildOverlay(),
  watch: subscribeSources,
  door: { running: () => doorStatus.get().running, watch: (fn) => doorStatus.subscribe(fn) },
});

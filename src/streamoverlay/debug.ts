// Hooks for the shot scripts and local checks, only with ?debug in the page address (see src/renderer/debug.ts).
import { buildOverlay, overlayVote, startOverlayTest } from './sources';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingOverlay: unknown }).__framelingOverlay = { build: buildOverlay, vote: overlayVote, test: startOverlayTest };
}

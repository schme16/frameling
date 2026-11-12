import { useEffect, useState, useSyncExternalStore } from 'react';
import { helpBodiesLoaded, loadHelpBodies, onHelpBodies } from '../../core/registry';

/** How long to wait before saying "Loading": a chunk that arrives in this time shows no flash at all. */
const SHOW_AFTER_MS = 160;

/**
 * Starts fetching the help words (they are a separate chunk) and says when they are in. `slow` turns true only if
 * the wait goes past a moment, so a quick load never flashes a placeholder.
 */
export function useHelpBodies(): { ready: boolean; slow: boolean } {
  const ready = useSyncExternalStore(onHelpBodies, helpBodiesLoaded);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    void loadHelpBodies();
    if (ready) return;
    const t = setTimeout(() => setSlow(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [ready]);
  return { ready, slow: slow && !ready };
}

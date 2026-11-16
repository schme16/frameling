// With ?debug in the page address, expose the retouch brushes' settings and the clone source, for help pictures and A/B shots.
import { cloneAim, resetCloneAim, setCloneSource } from './aim';
import { retouchStore } from './settings';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingRetouch: unknown }).__framelingRetouch = {
    store: retouchStore,
    source: setCloneSource,
    aim: cloneAim,
    forget: resetCloneAim,
  };
}

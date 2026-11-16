// With ?debug in the page address, expose the pixel brush's settings, for help pictures and A/B shots.
import { getDab, resetDab, setDab, setWholeDab } from './settings';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingDab: unknown }).__framelingDab = { settings: getDab, set: setDab, whole: setWholeDab, reset: resetDab };
}

// With ?debug in the page address, expose the chalk and charcoal settings, for help pictures and A/B shots.
import { getDry, resetDry, setDryTool, setMedium, setPaper } from './settings';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingDry: unknown }).__framelingDry = { settings: getDry, medium: setMedium, paper: setPaper, set: setDryTool, reset: resetDry };
}

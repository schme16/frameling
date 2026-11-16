// With ?debug in the page address, expose soft paint's settings and its edge answer, for help pictures and A/B shots.
import { setChoice } from '../core/choices';
import { SOFT_EDGE_CHOICE } from './choices';
import { getSoft, resetSoft, setHoldBuilds, setSoftTool } from './settings';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingSoft: unknown }).__framelingSoft = {
    settings: getSoft,
    set: setSoftTool,
    holdBuilds: setHoldBuilds,
    reset: resetSoft,
    /** Answers the Pixel perfect question: 'crisp' (dither the edge) or 'smooth'. */
    edge: (v: 'crisp' | 'smooth') => setChoice(SOFT_EDGE_CHOICE, v),
  };
}

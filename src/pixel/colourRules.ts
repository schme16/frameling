// What see-through means for the colours you paint with on a pixel layer. A layer locked to the palette paints every
// pixel as the palette colour nearest to what you picked, with that palette colour's own opacity, so an opacity
// slider on the paint colour would do nothing there: the picker says so, and where to change it, instead.
import { findLayer } from '../core/doc';
import { useStore, type State } from '../core/store';
import type { ColourRules } from '../ui/colour/ColourPicker';

export const LOCKED_WHY = "This layer is locked to the palette, so paint takes the opacity of the palette colour it snaps to. Change a palette colour's opacity in the Palette panel.";

/** True when the layer you are painting on is a pixel layer locked to the palette. */
export function paletteLockedNow(s: Pick<State, 'doc' | 'ui'>): boolean {
  const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
  return l?.kind === 'pixel' && !!l.paletteLock;
}

/** The opacity rules for the paint colours right now. */
export function usePaintRules(): ColourRules {
  const locked = useStore((s) => paletteLockedNow(s));
  return locked ? { alpha: false, why: LOCKED_WHY } : { alpha: true };
}

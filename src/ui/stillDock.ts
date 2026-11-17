// The docked zones and floating windows as the drawing in front of you shows them: with the panels that need animation
// left out while it is a still (see stillZone.ts). Every place that draws a zone asks here, so it is decided once.
import { useMemo } from 'react';
import { isAnimated } from '../core/animation';
import { animationOnlyPanels } from '../core/animationOnly';
import { useStore } from '../core/store';
import type { DockZone } from '../core/registry';
import { dock } from './dock';
import type { FloatWin, ZoneState } from './dockModel';
import { floatsWithout, zoneWithout } from './stillZone';

/** True while panels that need animation are out of sight. */
export const useStill = (): boolean => !useStore((s) => isAnimated(s.doc));

export function useStillZone(zone: DockZone): ZoneState {
  const z = dock.use((d) => d.layout.zones[zone]);
  const still = useStill();
  return useMemo(() => (still ? zoneWithout(z, animationOnlyPanels()) : z), [z, still]);
}

export function useStillFloats(): readonly FloatWin[] {
  const floats = dock.use((d) => d.layout.floats);
  const still = useStill();
  return useMemo(() => (still ? floatsWithout(floats, animationOnlyPanels()) : floats), [floats, still]);
}

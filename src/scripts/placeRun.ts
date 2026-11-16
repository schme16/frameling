// The dock calls behind Scripts' place: open it (in the drawer, tall enough to write in), give it a window, put it back.
import { dock, dockFloatBack, floatPlacement, resizeZone, showPanel } from '../ui/dock';
import { refuseIfLocked } from '../ui/lockState';
import { drawerHeightToOpen, scriptsPlace, windowBox, type ScriptsPlace } from './place';

export const placeNow = (): ScriptsPlace => scriptsPlace(dock.get().layout);

/** Opens Scripts where it lives. A closed drawer that is too short to write in grows to fit. */
export function openScriptsPanel(): void {
  const before = placeNow();
  showPanel('scripts');
  const h = drawerHeightToOpen(dock.get().layout, before);
  if (h !== null && placeNow() === 'drawer') resizeZone('bottom', h);
}

/** Gives Scripts a window of its own, wide enough for a long script. */
export function scriptsToWindow(): void {
  if (refuseIfLocked('panels', 'move')) return;
  floatPlacement('scripts', windowBox(typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : null));
}

/** Puts Scripts back in the drawer. */
export function scriptsToDrawer(): void {
  if (refuseIfLocked('panels', 'move')) return;
  const l = dock.get().layout;
  const f = l.floats.find((x) => x.tabs.includes('scripts'));
  if (f) dockFloatBack(f.id);
}

export function toggleScriptsWindow(): void {
  if (placeNow() === 'window') scriptsToDrawer();
  else scriptsToWindow();
}

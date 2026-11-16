// A drawing with no animation has no use for a drawer of frames across the bottom. This is the pure rule for when a zone
// is left out of view for that reason. Only what is shown changes: the saved layout is untouched, so adding animation puts
// the timeline back exactly where it was.
import type { DockZone } from '../core/registry';

/** Panels that are only about frames. A zone holding nothing else is not shown for a still picture. */
export const ANIMATION_PANELS: readonly string[] = ['timeline', 'clip-play', 'clip-drawings'];

/**
 * True when the zone should not be shown: the drawing is a still, and everything docked there is about frames. The
 * Animate room is the exception, so it can show the Add animation card where its timeline goes.
 */
export function leftOutForStill(zone: DockZone, tabs: readonly string[], animated: boolean, workspaceId: string): boolean {
  if (animated || workspaceId === 'animate') return false;
  return tabs.length > 0 && tabs.every((id) => ANIMATION_PANELS.includes(id)) && (zone === 'bottom' || zone === 'top');
}

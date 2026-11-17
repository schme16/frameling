// What a drawing with no animation leaves out of view in the docked zones. Only what is shown changes: the saved layout
// is untouched, so adding animation puts every panel back exactly where it was.
//
// Two rules, both pure:
//  - a zone that holds nothing but frame panels (the timeline) is left out whole (leftOutForStill);
//  - panels that only mean something with animation (the lip sync panel, Draw on, Clip flow) are taken out of the tabs
//    they sit in, and out of floating windows (zoneWithout, floatsWithout). The list is in src/core/animationOnly.ts.
import type { DockZone } from '../core/registry';
import { groupsOf, sharesOf, type DockGroup, type FloatWin, type ZoneState } from './dockModel';

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

/**
 * A zone as a still picture shows it: the hidden panels are out of every group. A group left with nothing goes, the
 * rest share its room out in the proportions they had, and a group whose front tab was hidden shows its first tab. The
 * same object comes back when nothing is hidden, so nothing re-renders for no reason.
 */
export function zoneWithout(z: ZoneState, hide: ReadonlySet<string>): ZoneState {
  if (!groupsOf(z).some((g) => g.tabs.some((t) => hide.has(t)))) return z;
  const shares = sharesOf(z);
  const kept: { g: DockGroup; share: number }[] = [];
  groupsOf(z).forEach((g, i) => {
    const tabs = g.tabs.filter((t) => !hide.has(t));
    if (tabs.length) kept.push({ g: { tabs, active: g.active && tabs.includes(g.active) ? g.active : tabs[0] }, share: shares[i] ?? 0 });
  });
  const [first, ...rest] = kept;
  if (!first) return { ...z, tabs: [], active: null, more: undefined, shares: undefined };
  const total = kept.reduce((n, k) => n + k.share, 0) || 1;
  const next: ZoneState = { ...z, tabs: first.g.tabs, active: first.g.active };
  if (rest.length) {
    next.more = rest.map((k) => k.g);
    next.shares = kept.map((k) => k.share / total);
  } else {
    delete next.more;
    delete next.shares;
  }
  return next;
}

/** Floating windows as a still picture shows them: hidden panels out, and a window with none left gone. */
export function floatsWithout(floats: readonly FloatWin[], hide: ReadonlySet<string>): readonly FloatWin[] {
  if (!floats.some((f) => f.tabs.some((t) => hide.has(t)))) return floats;
  return floats.flatMap((f) => {
    const tabs = f.tabs.filter((t) => !hide.has(t));
    if (!tabs.length) return [];
    return [tabs.length === f.tabs.length ? f : { ...f, tabs, active: f.active && tabs.includes(f.active) ? f.active : tabs[0] }];
  });
}

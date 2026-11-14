// Which docked zones are shown folded to their slim rail right now for lack of room (see dockFit.ts). Only how a zone is
// shown: the saved layout and the zone's size are untouched, so the room coming back brings the panels back.
import { useMemo } from 'react';
import type { DockZone } from '../core/registry';
import { createStore } from './mini';
import { fitZoneSize, useCompact } from './screenFit';

export type RoomFolds = Record<DockZone, boolean>;
export const roomFolds = createStore<RoomFolds>({ left: false, right: false, bottom: false, top: false });

/** True while the zone is shown folded for lack of room. */
export const isRoomFolded = (zone: DockZone): boolean => roomFolds.get()[zone];

/** Sets what is folded, telling listeners only when something changed. */
export function setRoomFolds(next: Partial<RoomFolds>): void {
  const cur = roomFolds.get();
  const merged = { ...cur, ...next };
  if (merged.left === cur.left && merged.right === cur.right && merged.top === cur.top && merged.bottom === cur.bottom) return;
  roomFolds.set(merged);
}

/**
 * A zone as it is shown: the saved state, with `collapsed` also true while it is folded for lack of room, and on a small
 * screen a size the workspace started with a little smaller (see screenFit.ts). The saved layout is never changed.
 */
export function shownZone<Z extends { collapsed: boolean; size: number }>(z: Z, folded: boolean, zone: DockZone, compact = false): Z {
  const size = fitZoneSize(zone, z.size, compact);
  const shown = size === z.size ? z : { ...z, size };
  return folded && !shown.collapsed ? { ...shown, collapsed: true } : shown;
}

/** Re-renders when the zone's room-fold changes, and gives the zone as it is shown. */
export function useShownZone<Z extends { collapsed: boolean; size: number }>(z: Z, zone: DockZone): Z {
  const folded = roomFolds.use((f) => f[zone]);
  const compact = useCompact();
  return useMemo(() => shownZone(z, folded, zone, compact), [z, folded, zone, compact]);
}

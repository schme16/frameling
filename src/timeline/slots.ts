// Places a feature can put its own rows and buttons in the timeline without the timeline knowing about it: the layer
// side, the grid, and the header. Sound rows and the Sound button use it. Taken away with the feature that added them.
import { createElement, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import { ownedUndo } from '../core/owners';

/** What each place hands its parts. The grid gives the columns on screen, so a row can draw only those. */
export interface TimelineSlotProps {
  side: Record<never, never>;
  header: Record<never, never>;
  main: { cw: number; from: number; to: number };
}
export type TimelineSlotName = keyof TimelineSlotProps;

export interface TimelineSlotPart<S extends TimelineSlotName = TimelineSlotName> {
  id: string;
  slot: S;
  component: ComponentType<TimelineSlotProps[S]>;
  /** Lower first (missing = 50). */
  order?: number;
  /** For the header: the fold step it belongs to, so it folds into the "more" menu with its siblings. */
  step?: string;
}

const parts: TimelineSlotPart[] = [];
let snapshot: readonly TimelineSlotPart[] = [];
const listeners = new Set<() => void>();
const changed = () => {
  snapshot = [...parts].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  for (const fn of [...listeners]) fn();
};

export function registerTimelinePart<S extends TimelineSlotName>(p: TimelineSlotPart<S>): void {
  const part = p as unknown as TimelineSlotPart;
  parts.push(part);
  changed();
  ownedUndo(() => {
    const i = parts.indexOf(part);
    if (i < 0) return;
    parts.splice(i, 1);
    changed();
  });
}

/** The parts in a place, in order. Changes only when one is added or taken away. */
export function timelineParts(slot: TimelineSlotName): TimelineSlotPart[] {
  return snapshot.filter((p) => p.slot === slot);
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const version = () => snapshot;

/** Draws the parts features put in a place. Draws nothing when there are none. */
export function TimelineSlot<S extends TimelineSlotName>({ slot, ...props }: { slot: S } & TimelineSlotProps[S]): ReactNode {
  const all = useSyncExternalStore(subscribe, version);
  const here = all.filter((p) => p.slot === slot);
  if (!here.length) return null;
  return here.map((p) => {
    const part = createElement(p.component as ComponentType<unknown>, { key: p.id, ...props });
    return slot === 'header' && p.step ? createElement('span', { key: p.id, 'data-step': p.step }, part) : part;
  });
}

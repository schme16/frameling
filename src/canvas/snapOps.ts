// Changing the snapping choices (the master switch and each tick), and the little bit of state for the options popover.
import { store } from '../core/store';
import { findLayer } from '../core/doc';
import { createStore } from '../ui/mini';
import { targetInfo, withChosen, type SnapContext, type SnapTarget } from './snapModel';
import { getViewSettings, setViewSettings } from './viewSettings';

// Menus read their ticks from the store's state, so give them a nudge to look again.
const nudge = () => store().setUi({});

export function setSnapOn(on: boolean): void {
  setViewSettings({ snap: on });
  nudge();
}

export function setSnapPick(ctx: SnapContext, id: SnapTarget, on: boolean): void {
  setViewSettings({ snapChosen: withChosen(getViewSettings().snapChosen, ctx, id, on) });
  nudge();
}

export function resetSnapPicks(): void {
  setViewSettings({ snapChosen: {} });
  nudge();
}

/** The kind of work the open layer is: pixel layers have their own ticks (artboards, being a tool, have theirs). */
export function currentSnapContext(): SnapContext {
  const { doc, ui } = store().get();
  const l = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  return l?.kind === 'pixel' ? 'pixel' : 'vector';
}

/** The kind of work a target's palette command is about: where it means something, preferring the layer in hand. */
export function contextFor(id: SnapTarget): SnapContext {
  const at = targetInfo(id).contexts;
  const here = currentSnapContext();
  return at.includes(here) ? here : at[0];
}

export const isPicked = (id: SnapTarget, ctx: SnapContext = contextFor(id)): boolean => !!getViewSettings().snapPicks[ctx][id];

/** Flips one target for the layer in hand (a pixel layer has its own set). */
export function toggleSnapPick(id: SnapTarget): void {
  const ctx = contextFor(id);
  setSnapPick(ctx, id, !isPicked(id, ctx));
}

// The popover is shown by the status bar's Snap button; commands open it from anywhere.
const popover = createStore<{ open: boolean }>({ open: false });
export const snapPopover = popover;
export const openSnapOptions = (): void => popover.set({ open: true });
export const closeSnapOptions = (): void => popover.set({ open: false });
export const toggleSnapOptions = (): void => popover.set((o) => ({ open: !o.open }));

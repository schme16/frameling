// UI state for bones that isn't part of the document: the selected bone, what dragging does with the Pose tool and the bone look.
import { useSyncExternalStore } from 'react';
import type { Id } from '../core/format';
import { onFreshDrawing } from '../core/fresh';

/** What a drag or click with the Pose tool does. Shift (stretch) and Alt (pin) still switch for a moment. */
export type PoseGrab = 'turn' | 'stretch' | 'pin';
export type BoneLook = 'kite' | 'capsule';

interface RigUi {
  selected: Id | null;
  grab: PoseGrab;
  look: BoneLook;
}

let ui: RigUi = { selected: null, grab: 'turn', look: 'kite' };
const listeners = new Set<() => void>();

export function rigUi(): RigUi {
  return ui;
}

export function setRigUi(p: Partial<RigUi>): void {
  ui = { ...ui, ...p };
  for (const fn of listeners) fn();
}

export function subscribeRigUi(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useRigUi(): RigUi {
  return useSyncExternalStore(subscribeRigUi, rigUi);
}

// A new drawing has no bone picked. The grab and look are choices, so they stay.
onFreshDrawing(() => {
  if (ui.selected) setRigUi({ selected: null });
});

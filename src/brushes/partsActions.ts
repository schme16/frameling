// Putting a brush, its tip or its stick back as it came. What "as it came" means is the saved brush that was picked (see
// parts.ts for the pure part); these read it and write the brush in use.
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { everyBrush, pickedBrushId, revertActive } from './presets';
import { NONE_CHANGED, partsOf, withStickOf, withTipOf, type Parts } from './parts';
import type { BrushPreset } from './model';

/** The saved brush that is picked on the vector Brush, as it was saved. */
export const savedBrush = (): BrushPreset | undefined => {
  const id = pickedBrushId();
  return id ? everyBrush().find((p) => p.id === id && p.tool === 'brush') : undefined;
};

/** What differs from how the picked brush came, part by part. */
export const partsNow = (): Parts => {
  const was = savedBrush();
  return was ? partsOf(was.brush, store().get().ui.brush) : NONE_CHANGED;
};

const none = (what: string): false => {
  toast(`The ${what} is already as the brush comes.`, { duration: 1600 });
  return false;
};

export function backToHowItCame(): boolean {
  if (!partsNow().changed) return none('brush');
  return revertActive();
}

export function resetTip(): boolean {
  const was = savedBrush();
  if (!was || !partsNow().tip) return none('tip');
  store().setUi((u) => ({ brush: withTipOf(u.brush, was.brush) }));
  return true;
}

export function resetStick(): boolean {
  const was = savedBrush();
  if (!was || !partsNow().stick) return none('stick');
  store().setUi((u) => ({ brush: withStickOf(u.brush, was.brush) }));
  return true;
}

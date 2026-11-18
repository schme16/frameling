// Putting a brush, its tip or its stick back as it came. What "as it came" means is the saved brush that was picked (see
// parts.ts for the pure part); these read it and write the brush in use.
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { currentSpec, putSpec } from '../dab/live';
import { specTool } from '../dab/spec';
import { currentSide, everyBrush, pickedBrushId, revertActive } from './presets';
import { NONE_CHANGED, partsOf, withPaperOf, withStickOf, withTipOf, type Parts } from './parts';
import { pixelPartsOf, withPixelPaperOf, withPixelStickOf, withPixelTipOf } from './pixelParts';
import { pixelHalf, vectorHalf, type BrushPreset } from './model';

/** The brush that is picked, for the vector Brush: its vector half as it came (made, or worked out from its pixel half). */
export const savedBrush = (): BrushPreset | undefined => {
  const id = pickedBrushId();
  return id ? everyBrush().find((p) => p.id === id) : undefined;
};

/** The brush that is picked, for a pixel brush tool: it counts while you are on a tool of the kind its pixel half is. */
export const savedPixelBrush = (): BrushPreset | undefined => {
  const id = pickedBrushId();
  const live = currentSpec();
  return id && live ? everyBrush().find((p) => p.id === id && specTool(pixelHalf(p)) === specTool(live)) : undefined;
};

/** The saved brush to compare with on the side you are on (the vector Brush's or a pixel brush's). */
export const savedForSide = (): BrushPreset | undefined => (currentSide() === 'pixel' ? savedPixelBrush() : savedBrush());

/** What differs from how the picked brush came, part by part, on the side you are on. */
export const partsNow = (): Parts => {
  if (currentSide() === 'pixel') {
    const was = savedPixelBrush();
    return was ? pixelPartsOf(pixelHalf(was), currentSpec()) : NONE_CHANGED;
  }
  const was = savedBrush();
  return was ? partsOf(vectorHalf(was), store().get().ui.brush) : NONE_CHANGED;
};

/** Puts one part of a pixel brush back: its spec changes with `back`, and the settings go where they live. */
function backPixel(back: (live: NonNullable<ReturnType<typeof currentSpec>>, was: NonNullable<BrushPreset['pixel']>) => NonNullable<BrushPreset['pixel']>): void {
  const saved = savedPixelBrush();
  const was = saved ? pixelHalf(saved) : undefined;
  const live = currentSpec();
  if (was && live) putSpec(back(live, was));
}

const none = (what: string): false => {
  toast(`The ${what} is already as the brush comes.`, { duration: 1600 });
  return false;
};

export function backToHowItCame(): boolean {
  if (!partsNow().changed) return none('brush');
  return revertActive();
}

export function resetTip(): boolean {
  if (currentSide() === 'pixel') {
    if (!partsNow().tip) return none('tip');
    backPixel(withPixelTipOf);
    return true;
  }
  const was = savedBrush();
  if (!was || !partsNow().tip) return none('tip');
  store().setUi((u) => ({ brush: withTipOf(u.brush, vectorHalf(was)) }));
  return true;
}

export function resetStick(): boolean {
  if (currentSide() === 'pixel') {
    if (!partsNow().stick) return none('stick');
    backPixel(withPixelStickOf);
    return true;
  }
  const was = savedBrush();
  if (!was || !partsNow().stick) return none('stick');
  store().setUi((u) => ({ brush: withStickOf(u.brush, vectorHalf(was)) }));
  return true;
}

export function resetPaper(): boolean {
  if (currentSide() === 'pixel') {
    if (!partsNow().paper) return none('paper');
    backPixel(withPixelPaperOf);
    return true;
  }
  const was = savedBrush();
  if (!was || !partsNow().paper) return none('paper');
  store().setUi((u) => ({ brush: withPaperOf(u.brush, vectorHalf(was)) }));
  return true;
}

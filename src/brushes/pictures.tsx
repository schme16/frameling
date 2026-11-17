// The pictures on the Tip and Stick pickers: each shows only itself, as a plain stroke. A tip is drawn on a neutral brush
// with no paper; a stick is drawn at its own width on the smoothest paper, so what shows is the stick and not the sheet.
// The same picture sits on the button and on the rows of its list. The big preview at the top is the one place that shows
// the final result. They are drawn through the picture cache (thumbs.ts), so a list opened again costs copies.
import type { BrushSettings, BrushTip } from '../core/format';
import { DEFAULT_BRUSH } from '../core/doc';
import { mediumInfo, type DryId } from '../dry/maths';
import { Stroke } from './Stroke';

/** The brush every tip is drawn on: plain, steady and the same size for all of them. */
const NEUTRAL: BrushSettings = { ...DEFAULT_BRUSH, size: 10, thinning: 0, smoothing: 0.3, streamline: 0.25, taperStart: 0, taperEnd: 0 };

/** The brush a tip's picture is drawn with: the neutral one with this tip and nothing of the paper (no tooth, no matte). */
export function tipPictureBrush(tip: BrushTip | undefined): BrushSettings {
  if (!tip) return { ...NEUTRAL };
  const { dry: _d, matte: _m, ...bare } = tip;
  return { ...NEUTRAL, tip: bare };
}

/** The brush a stick's picture is drawn with: a dry tip on this stick at the stick's own width. */
export function stickPictureBrush(dry: DryId): BrushSettings {
  const m = mediumInfo(dry);
  const kind = dry === 'vine-charcoal' || dry === 'compressed-charcoal' ? 'charcoal' : 'chalk';
  return { ...NEUTRAL, size: Math.max(5, m.size * 0.9), tip: { kind, amount: 0.3, grain: 1, dry } };
}

/** The paper a stick is pictured on. */
export const STICK_PICTURE_PAPER = 'smooth';

export function TipPicture({ tip, h }: { tip: BrushTip | undefined; h: number }) {
  return <Stroke brush={tipPictureBrush(tip)} h={h} />;
}

export function StickPicture({ dry, h }: { dry: DryId; h: number }) {
  return <Stroke brush={stickPictureBrush(dry)} h={h} paper={STICK_PICTURE_PAPER} />;
}

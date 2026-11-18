// The Tip and the Stick pickers on the pixel side: the same two pickers as the vector Brush's, listing what the pixel
// engine has. The tips are the shapes a dab can be (Round, Square, a Picture of your own); the sticks are the nine dry media
// of Chalk and charcoal, the same nine the vector Brush has. Each is a row with a stroke across it, drawn by the pixel engine
// on its own (the tip on a plain brush, the stick on the smoothest paper). Pure functions, no DOM; picking one is in tips.ts.
import { DEFAULT_BRUSH } from '../core/doc';
import { cleanDab, type DabBrush, type TipShape } from '../dab/maths';
import type { PixelSpec } from '../dab/spec';
import { MEDIA, mediumInfo, type DryId } from '../dry/maths';
import { stampPicture } from './pixelStarters';
import { STICK_GROUPS, stickGroupOf } from './stickList';
import type { BrushPreset } from './model';

/** What the pixel pickers need to know about the brush in use. */
export interface PixelLive {
  dab: DabBrush;
  medium: DryId;
}

/** The ids of the pixel tip and stick rows: `ptip:round`, `pstick:chalk`. */
export const pixelTipId = (tip: TipShape): string => `ptip:${tip}`;
export const pixelStickId = (dry: DryId): string => `pstick:${dry}`;
export const parsePixelTipId = (id: string): TipShape | null => (id === 'ptip:round' || id === 'ptip:square' || id === 'ptip:picture' ? (id.slice(5) as TipShape) : null);
export const parsePixelStickId = (id: string): DryId | null => {
  if (!id.startsWith('pstick:')) return null;
  const m = MEDIA.find((x) => x.id === id.slice(7));
  return m ? m.id : null;
};

const TIP_NAME: Record<TipShape, string> = { round: 'Round', square: 'Square', picture: 'Picture' };
const TIP_GROUP: Record<TipShape, string> = { round: 'Pen and paintbrush', square: 'Pen and paintbrush', picture: 'Your own drawing' };
const TIP_HINT: Record<TipShape, string> = {
  round: 'A round dab. Hardness sets how firm its edge is.',
  square: 'A square dab, with corners. Turn it with Angle for a diamond or a chisel.',
  picture: 'A little picture of your own, stamped along the line. Draw one, or start from a picture file or a selection.',
};

/** The plain brush every tip is drawn on: steady, smooth edged, the same size for all of them. */
const NEUTRAL = { size: 10, spacing: 0.1, aliased: false, hardness: 1 } as const;

const tipPreset = (tip: TipShape, live: DabBrush): BrushPreset => {
  const picture = live.picture ?? stampPicture('star');
  const dab = cleanDab({ ...NEUTRAL, tip, ...(tip === 'picture' ? { picture, size: 12, spacing: 1.2 } : {}) });
  return { id: pixelTipId(tip), name: TIP_NAME[tip], tool: 'pixel', builtin: true, group: TIP_GROUP[tip], brush: DEFAULT_BRUSH, pixel: { kind: 'dab', dab } };
};

/** Every pixel tip as a row, each drawn on its own. */
export const pixelTipRows = (live: PixelLive): BrushPreset[] => (['round', 'square', 'picture'] as const).map((t) => tipPreset(t, live.dab));

/** Every stick as a row: a dry stroke at the stick's own width on the smoothest paper, so what shows is the stick. */
export function pixelStickRows(): BrushPreset[] {
  const rows = MEDIA.map<BrushPreset>((m) => {
    const spec: PixelSpec = { kind: 'dry', medium: m.id, paper: 'smooth', size: Math.max(5, Math.round(m.size * 0.9)), hardness: m.hardness, press: m.press };
    return { id: pixelStickId(m.id), name: m.label, tool: 'pixel', builtin: true, group: stickGroupOf(m.id), brush: DEFAULT_BRUSH, pixel: spec };
  });
  return rows.sort((a, b) => STICK_GROUPS.indexOf(a.group as (typeof STICK_GROUPS)[number]) - STICK_GROUPS.indexOf(b.group as (typeof STICK_GROUPS)[number]));
}

export const pixelActiveId = (side: 'tip' | 'stick', live: PixelLive): string => (side === 'tip' ? pixelTipId(live.dab.tip) : pixelStickId(live.medium));

/** One plain line about a tip or a stick, for the row's tooltip. */
export function pixelHint(id: string): string {
  const tip = parsePixelTipId(id);
  if (tip) return TIP_HINT[tip];
  const dry = parsePixelStickId(id);
  return dry ? mediumInfo(dry).hint : '';
}

/** The name of the tip or stick in use, for the picker's button. */
export const pixelNameOf = (side: 'tip' | 'stick', live: PixelLive): string => (side === 'tip' ? TIP_NAME[live.dab.tip] : mediumInfo(live.medium).label);

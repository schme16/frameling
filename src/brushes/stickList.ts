// The nine sticks as the brush picker lists them: each a row with a stroke across it, drawn by the tip in use with that
// stick (so the picture is the real paper-catching line, not a lookalike). Same idea as tipList.ts, same picker. Pure
// functions, no DOM; picking one is in tips.ts.
import type { BrushSettings, BrushTip } from '../core/format';
import { MEDIA, isMedium, mediumInfo, type DryId } from '../dry/maths';
import { defaultTip } from '../geometry/tip';
import type { BrushPreset } from './model';

/** The groups the sticks sit in, in the order the picker lists them. */
export const STICK_GROUPS = ['Charcoal', 'Chalk and pastel', 'Drawing pencils'] as const;
export type StickGroup = (typeof STICK_GROUPS)[number];

const GROUP_OF: Record<DryId, StickGroup> = {
  'vine-charcoal': 'Charcoal',
  'compressed-charcoal': 'Charcoal',
  chalk: 'Chalk and pastel',
  'soft-pastel': 'Chalk and pastel',
  'oil-pastel': 'Chalk and pastel',
  crayon: 'Chalk and pastel',
  'sketch-pencil': 'Drawing pencils',
  'soft-pencil': 'Drawing pencils',
  'colour-pencil': 'Drawing pencils',
};

export const stickGroupOf = (id: DryId): StickGroup => GROUP_OF[id];

/** The id of a stick row: `stick:chalk`, `stick:soft-pencil`. */
export const stickIdOf = (dry: DryId): string => `stick:${dry}`;

/** What an id means: the stick, or null for anything that is not a stick id. */
export function parseStickId(id: string): DryId | null {
  if (!id.startsWith('stick:')) return null;
  const dry = id.slice(6);
  return isMedium(dry) ? dry : null;
}

/** The stick a tip catches paper with, or null when it is off (or the tip is not chalk or charcoal). */
export const stickOf = (tip: BrushTip | undefined): DryId | null => (tip && (tip.kind === 'chalk' || tip.kind === 'charcoal') && isMedium(tip.dry) ? tip.dry : null);

/** The tip each row draws with: the one in use (so its grain size shows) with the row's stick, or Chalk's own when there is none. */
const tipWith = (tip: BrushTip | undefined, dry: DryId): BrushTip => ({ ...(tip && (tip.kind === 'chalk' || tip.kind === 'charcoal') ? tip : defaultTip('chalk')), dry });

/** Every stick as a row, drawn with the brush in use so the sample has your size and grain. */
export function stickRows(live: BrushSettings): BrushPreset[] {
  const out = MEDIA.map<BrushPreset>((m) => ({ id: stickIdOf(m.id), name: m.label, tool: 'brush', builtin: true, group: GROUP_OF[m.id], brush: { ...live, tip: tipWith(live.tip, m.id) } }));
  return out.sort((a, b) => STICK_GROUPS.indexOf(a.group as StickGroup) - STICK_GROUPS.indexOf(b.group as StickGroup));
}

/** The stick in use, or what you get when Catch on paper is switched on (the tip's usual one). */
export const activeStick = (tip: BrushTip | undefined): DryId => stickOf(tip) ?? (tip?.kind === 'charcoal' ? 'compressed-charcoal' : 'chalk');

/** One plain line about a stick, for the row's tooltip. */
export function stickHint(id: string): string {
  const dry = parseStickId(id);
  return dry ? mediumInfo(dry).hint : '';
}

// The pen tips as the brush picker lists them: Plain, the kinds and every stamp shape, each as a row with a stroke
// across it. A tip is dressed up as a brush (the brush in use, with that tip), so the picker's rows, search, groups and
// keyboard work on tips with nothing of their own. Pure functions, no DOM; picking one is in tips.ts.
import type { BrushSettings, BrushTip, StampShape, TipKind } from '../core/format';
import { defaultTip, resolveTip, STAMPS, TIPS } from '../geometry/tip';
import type { BrushPreset } from './model';

/** What a picker lists: the vector brushes, the pixel brushes, or the pen tips. */
export type PickerSide = 'vector' | 'pixel' | 'tip';

/** The groups the tips sit in, in the order the picker lists them. */
export const TIP_GROUPS = ['Pen and paintbrush', 'Dry and wet', 'Stamps', 'Your own drawing'] as const;
export type TipGroup = (typeof TIP_GROUPS)[number];

const GROUP_OF: Record<Exclude<TipKind, 'stamp'>, TipGroup> = {
  nib: 'Pen and paintbrush',
  bristle: 'Pen and paintbrush',
  chalk: 'Dry and wet',
  charcoal: 'Dry and wet',
  watercolour: 'Dry and wet',
  along: 'Your own drawing',
  edged: 'Your own drawing',
};

export const PLAIN_ID = 'tip:plain';

/** The id of a tip: `tip:plain`, `tip:chalk`, `tip:stamp:leaf`. A stamp is its shape, so the shapes need no second row. */
export function tipIdOf(tip: BrushTip | undefined): string {
  if (!tip) return PLAIN_ID;
  if (tip.kind === 'stamp') return `tip:stamp:${tip.shape ?? 'leaf'}`;
  return `tip:${tip.kind}`;
}

/** What an id means: a kind (null for plain), and a shape when it is a stamp. Null for anything that isn't a tip id. */
export function parseTipId(id: string): { kind: TipKind | null; shape?: StampShape } | null {
  if (id === PLAIN_ID) return { kind: null };
  const m = /^tip:([a-z]+)(?::([a-z]+))?$/.exec(id);
  if (!m) return null;
  if (m[1] === 'stamp') return m[2] && (m[2] === 'custom' || STAMPS.some((s) => s.id === m[2])) ? { kind: 'stamp', shape: m[2] as StampShape } : null;
  const info = TIPS.find((t) => t.id === m[1]);
  return info && !m[2] ? { kind: info.id } : null;
}

const row = (id: string, name: string, group: TipGroup, brush: BrushSettings): BrushPreset => ({ id, name, tool: 'brush', builtin: true, group, brush });

/** Every tip as a row, drawn with the brush in use so the sample has your size and pressure. `custom` is a stamp of your own, when there is one. */
export function tipRows(live: BrushSettings, custom?: number[][]): BrushPreset[] {
  const { tip: _t, ...base } = live;
  const out: BrushPreset[] = [row(PLAIN_ID, 'Plain', 'Pen and paintbrush', base)];
  for (const t of TIPS) {
    if (t.id === 'stamp') {
      for (const s of STAMPS) out.push(row(`tip:stamp:${s.id}`, s.label, 'Stamps', { ...base, tip: { ...defaultTip('stamp'), shape: s.id, angle: s.angle } }));
      if (custom?.length) out.push(row('tip:stamp:custom', 'Yours', 'Stamps', { ...base, tip: { ...defaultTip('stamp'), shape: 'custom', custom, angle: 'upright' } }));
    } else {
      out.push(row(`tip:${t.id}`, t.label, GROUP_OF[t.id], { ...base, tip: defaultTip(t.id) }));
    }
  }
  return out.sort((a, b) => TIP_GROUPS.indexOf(a.group as TipGroup) - TIP_GROUPS.indexOf(b.group as TipGroup));
}

/** The stamp of your own on the brush in use, if it has one (so "Yours" shows up beside the built-in shapes). */
export const customOf = (tip: BrushTip | undefined): number[][] | undefined => (tip && tip.kind === 'stamp' ? resolveTip(tip).custom : undefined);

/** One plain line about a tip, for the row's tooltip. */
export function tipHint(id: string): string {
  const p = parseTipId(id);
  if (!p || !p.kind) return 'A smooth, solid line.';
  if (p.kind === 'stamp') return p.shape === 'custom' ? 'Scatters the drawing you made along the line.' : `Scatters a ${(STAMPS.find((s) => s.id === p.shape)?.label ?? 'leaf').toLowerCase()} along the line, a little off it and a little turned.`;
  return TIPS.find((t) => t.id === p.kind)?.hint ?? '';
}

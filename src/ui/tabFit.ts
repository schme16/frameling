/**
 * How a dock zone's tabs fit their bar, so tabs never scroll out of sight:
 *   full     every tab shows its icon and name
 *   compact  the open tab keeps its name, the others shrink to just their icon
 *   overflow as compact, and the tabs that still don't fit go behind a "+N" button
 * Widths are in CSS pixels, measured from the real tabs.
 */
export interface TabFitInput {
  /** Room for tabs (the bar's inner width minus the fold button). */
  avail: number;
  gap: number;
  /** Width of each tab with its name, in bar order (the open tab's includes its close button). */
  full: number[];
  /** Width of each tab as just its icon. */
  icon: number[];
  /** Index of the open tab. */
  active: number;
  /** Width of the "+N" button. */
  more: number;
}

export interface TabFit {
  mode: 'full' | 'compact' | 'overflow';
  /** Indices shown in the bar, in bar order. */
  shown: number[];
  /** Indices behind the "+N" button, in bar order. */
  hidden: number[];
}

const total = (ws: number[], gap: number) => ws.reduce((a, w) => a + w, 0) + gap * Math.max(0, ws.length - 1);

export function fitTabs(p: TabFitInput): TabFit {
  const n = p.full.length;
  const all = [...Array(n).keys()];
  if (total(p.full, p.gap) <= p.avail) return { mode: 'full', shown: all, hidden: [] };
  const compact = all.map((i) => (i === p.active ? p.full[i] : p.icon[i]));
  if (total(compact, p.gap) <= p.avail) return { mode: 'compact', shown: all, hidden: [] };
  // The open tab always shows; then as many others as fit, nearest to it first so the neighbourhood stays put.
  let used = compact[p.active] + p.gap + p.more;
  const keep = new Set([p.active]);
  const order = all.filter((i) => i !== p.active).sort((a, b) => Math.abs(a - p.active) - Math.abs(b - p.active) || a - b);
  for (const i of order) {
    if (used + compact[i] + p.gap > p.avail) break;
    used += compact[i] + p.gap;
    keep.add(i);
  }
  return { mode: 'overflow', shown: all.filter((i) => keep.has(i)), hidden: all.filter((i) => !keep.has(i)) };
}

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
  /** Tabs that keep their names too when there's room (Colours: a beginner looks for it by name first). */
  pinned?: number[];
}

/** Panels whose tab keeps its name whenever the bar has room for it. */
export const NAMED_PANELS = new Set(['colors']);

export interface TabFit {
  mode: 'full' | 'compact' | 'overflow';
  /** Indices shown in the bar, in bar order. */
  shown: number[];
  /** Indices behind the "+N" button, in bar order. */
  hidden: number[];
  /** Indices that show their name (every shown tab in full mode). */
  named: number[];
}

const total = (ws: number[], gap: number) => ws.reduce((a, w) => a + w, 0) + gap * Math.max(0, ws.length - 1);

export function fitTabs(p: TabFitInput): TabFit {
  const n = p.full.length;
  const all = [...Array(n).keys()];
  if (total(p.full, p.gap) <= p.avail) return { mode: 'full', shown: all, hidden: [], named: all };
  const pinned = (p.pinned ?? []).filter((i) => i >= 0 && i < n && i !== p.active);
  const widths = (named: Set<number>) => all.map((i) => (named.has(i) ? p.full[i] : p.icon[i]));
  // Names for the open tab and the pinned ones if they fit, else just the open one.
  for (const named of [new Set([p.active, ...pinned]), new Set([p.active])]) {
    if (named.size > 1 && !pinned.length) continue;
    if (total(widths(named), p.gap) <= p.avail) return { mode: 'compact', shown: all, hidden: [], named: [...named].sort((a, b) => a - b) };
  }
  // The open tab always shows; then the pinned ones (named if they fit), then as many others as fit, nearest to it
  // first so the neighbourhood stays put.
  const compact = widths(new Set([p.active]));
  let used = compact[p.active] + p.gap + p.more;
  const keep = new Set([p.active]);
  const named = new Set([p.active]);
  for (const i of pinned) {
    const w = used + p.full[i] + p.gap <= p.avail ? p.full[i] : compact[i];
    if (used + w + p.gap > p.avail) continue;
    used += w + p.gap;
    keep.add(i);
    if (w === p.full[i]) named.add(i);
  }
  const order = all.filter((i) => !keep.has(i)).sort((a, b) => Math.abs(a - p.active) - Math.abs(b - p.active) || a - b);
  for (const i of order) {
    if (used + compact[i] + p.gap > p.avail) break;
    used += compact[i] + p.gap;
    keep.add(i);
  }
  return { mode: 'overflow', shown: all.filter((i) => keep.has(i)), hidden: all.filter((i) => !keep.has(i)), named: [...named].sort((a, b) => a - b) };
}

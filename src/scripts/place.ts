// Where Scripts lives: the bottom drawer, beside the timeline, because a line of code is wide. It can also have a window
// of its own (a long script in a wide window), and one press puts it back. The decisions are pure so they can be tested.
import type { Layout } from '../ui/dockModel';

/** Tall enough for the buttons row, the name and a few lines of code, and the wide window's size when it floats. */
export const DRAWER_LEAST = 300;
export const WINDOW_SIZE = { w: 820, h: 440 };

/** Where the panel is now, in the words the buttons need. */
export type ScriptsPlace = 'closed' | 'drawer' | 'window' | 'elsewhere';

export function scriptsPlace(l: Layout): ScriptsPlace {
  for (const f of l.floats) if (f.tabs.includes('scripts')) return 'window';
  for (const z of ['bottom', 'top', 'left', 'right'] as const) {
    if (l.zones[z].tabs.includes('scripts')) return z === 'bottom' ? 'drawer' : 'elsewhere';
  }
  return 'closed';
}

/** The drawer's height to open at: as it is, unless that is too short to write in. Null leaves it alone. */
export function drawerHeightToOpen(l: Layout, before: ScriptsPlace): number | null {
  if (before !== 'closed') return null;
  return l.zones.bottom.size < DRAWER_LEAST ? DRAWER_LEAST : null;
}

/** Where a new window for the panel goes: near the middle, clear of the edges, and no bigger than the screen. */
export function windowBox(screen: { w: number; h: number } | null): { x: number; y: number; w: number; h: number } {
  const sw = screen?.w ?? 1280;
  const sh = screen?.h ?? 800;
  const w = Math.min(WINDOW_SIZE.w, Math.max(380, sw - 80));
  const h = Math.min(WINDOW_SIZE.h, Math.max(320, sh - 120));
  return { x: Math.max(20, Math.round((sw - w) / 2)), y: Math.max(40, Math.round((sh - h) / 2)), w, h };
}

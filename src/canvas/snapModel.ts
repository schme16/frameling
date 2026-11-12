/**
 * Snapping choices: what things can snap to, which of those are on for each kind of work, and which ones are in force
 * right now. Pure, so the choosing is tested; the canvas code (guides.ts) only asks `activeTargets`.
 *
 * There are three kinds of work (a "context"): drawing on a vector layer, drawing on a pixel layer, and moving or
 * sizing artboards. Each has its own ticks, because they want different things (pixel art wants the pixels and nothing
 * pulling points off them; vector work wants guides and the page).
 */

export type SnapTarget = 'page' | 'centre' | 'guides' | 'grid' | 'shapes' | 'perspective' | 'cells' | 'angles' | 'artboards';
export type SnapContext = 'vector' | 'pixel' | 'artboard';

export interface SnapTargetInfo {
  id: SnapTarget;
  /** Plain words first. */
  label: string;
  /** The industry word, shown second. */
  term?: string;
  /** One line for the tooltip and the help. */
  tip: string;
  /** Where it means something. */
  contexts: SnapContext[];
  /** Word for the "Snapped to ..." note. */
  note: string;
}

/** The list the popover, Preferences and the commands all use, in order. */
export const SNAP_TARGETS: SnapTargetInfo[] = [
  { id: 'page', label: 'Page edges', tip: 'The four edges of the page.', contexts: ['vector', 'pixel'], note: 'page edge' },
  { id: 'centre', label: 'Page middle', term: 'centre', tip: 'The middle of the page, across and down.', contexts: ['vector', 'pixel'], note: 'page middle' },
  { id: 'guides', label: 'Guides', tip: 'The guide lines you dragged out of the rulers.', contexts: ['vector', 'pixel'], note: 'guide' },
  { id: 'grid', label: 'Grid', tip: 'The square or isometric grid, while it shows.', contexts: ['vector', 'pixel'], note: 'grid' },
  { id: 'shapes', label: 'Other shapes', term: 'edges and points', tip: "The edges, middles and corner points of the other shapes in this drawing.", contexts: ['vector'], note: 'another shape' },
  { id: 'perspective', label: 'Perspective lines', term: 'vanishing points', tip: 'Lines and boxes follow the perspective guides, while they show.', contexts: ['vector', 'pixel'], note: 'perspective line' },
  { id: 'cells', label: 'Pixel cells', term: 'pixel-perfect', tip: 'Drawing stays on whole pixels, so guides, the grid and the page stay out of the way. Untick it to let pixel layers snap to those too.', contexts: ['pixel'], note: 'pixel cell' },
  { id: 'angles', label: 'Angle steps', term: 'hold Shift', tip: 'Holding Shift turns lines and rotations to neat angles (45 degree steps for lines).', contexts: ['vector', 'pixel'], note: 'angle step' },
  { id: 'artboards', label: 'Other artboards', term: 'edges and middles', tip: "Artboards line up with each other's edges and middles when you move or size them.", contexts: ['artboard'], note: 'artboard edge' },
];

export const targetInfo = (id: SnapTarget): SnapTargetInfo => SNAP_TARGETS.find((t) => t.id === id)!;

/** Does this target mean anything in this kind of work? */
export const appliesIn = (id: SnapTarget, ctx: SnapContext): boolean => targetInfo(id).contexts.includes(ctx);

/** The ticks, for every kind of work. */
export type SnapPicks = Record<SnapContext, Partial<Record<SnapTarget, boolean>>>;

/**
 * What a new person has: today's behaviour. Vector work snaps to the page, guides, grid and perspective lines, and
 * Shift gives angle steps, and the edges of other shapes pull too. Pixel layers keep to their cells (with perspective
 * and angle steps). Artboards line up with each other. Ticks someone already saved are kept as they are.
 */
export function defaultPicks(): SnapPicks {
  return {
    vector: { page: true, centre: true, guides: true, grid: true, shapes: true, perspective: true, angles: true },
    pixel: { page: false, centre: false, guides: false, grid: false, cells: true, perspective: true, angles: true },
    artboard: { artboards: true },
  };
}

/** Saved ticks made safe: anything missing or odd takes the default, unknown targets are dropped. */
export function sanitizePicks(raw: unknown): SnapPicks {
  const out = defaultPicks();
  if (!raw || typeof raw !== 'object') return out;
  for (const ctx of Object.keys(out) as SnapContext[]) {
    const saved = (raw as Record<string, unknown>)[ctx];
    if (!saved || typeof saved !== 'object') continue;
    for (const id of Object.keys(out[ctx]) as SnapTarget[]) {
      const v = (saved as Record<string, unknown>)[id];
      if (typeof v === 'boolean') out[ctx][id] = v;
    }
  }
  return out;
}

/** Only the ticks someone chose, over the defaults (so a default that changes later still reaches everyone who never chose). */
export type SnapChosen = Partial<Record<SnapContext, Partial<Record<SnapTarget, boolean>>>>;

/** A sparse set of chosen ticks made safe: only known targets with true or false in them. */
export function sanitizeChosen(raw: unknown): SnapChosen {
  const out: SnapChosen = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const ctx of Object.keys(defaultPicks()) as SnapContext[]) {
    const saved = (raw as Record<string, unknown>)[ctx];
    if (!saved || typeof saved !== 'object') continue;
    for (const id of Object.keys(defaultPicks()[ctx]) as SnapTarget[]) {
      const v = (saved as Record<string, unknown>)[id];
      if (typeof v === 'boolean') out[ctx] = { ...out[ctx], [id]: v };
    }
  }
  return out;
}

/** What the defaults were before other shapes and other artboards came on by default. */
function oldDefaultPicks(): SnapPicks {
  const d = defaultPicks();
  return { ...d, vector: { ...d.vector, shapes: false }, artboard: { artboards: false } };
}

/**
 * Ticks saved by the first versions of the options were the whole set, written whenever anything changed, so a person who
 * never touched Other shapes still had it stored as off. Any saved tick equal to the old default counts as not chosen.
 */
export function migrateSavedPicks(raw: unknown): SnapChosen {
  const chosen = sanitizeChosen(raw);
  const old = oldDefaultPicks();
  const out: SnapChosen = {};
  for (const ctx of Object.keys(chosen) as SnapContext[]) {
    for (const [id, v] of Object.entries(chosen[ctx] ?? {}) as [SnapTarget, boolean][]) {
      if (old[ctx][id] === v) continue;
      out[ctx] = { ...out[ctx], [id]: v };
    }
  }
  return out;
}

/** The chosen ticks with one set. */
export function withChosen(chosen: SnapChosen, ctx: SnapContext, id: SnapTarget, on: boolean): SnapChosen {
  if (!appliesIn(id, ctx)) return chosen;
  return { ...chosen, [ctx]: { ...chosen[ctx], [id]: on } };
}

/** The ticks with one changed (a new object; the old one is left alone). */
export function withPick(picks: SnapPicks, ctx: SnapContext, id: SnapTarget, on: boolean): SnapPicks {
  if (!appliesIn(id, ctx)) return picks;
  return { ...picks, [ctx]: { ...picks[ctx], [id]: on } };
}

/** What is showing, since a target only has something to snap to while its lines are there. */
export interface SnapScene {
  guides: boolean;
  grid: 'off' | 'square' | 'iso';
  perspective: boolean;
}

/**
 * The targets in force for one gesture. Off, or Ctrl held, means nothing snaps to lines and points. The angle steps are
 * a Shift choice rather than a pull, so only their own tick turns them off. On a pixel layer, Pixel cells wins: only
 * cells, perspective and angles apply, however the guide, grid and page ticks are set.
 */
export function activeTargets(on: boolean, picks: SnapPicks, ctx: SnapContext, bypass: boolean, scene: SnapScene): Set<SnapTarget> {
  const p = picks[ctx];
  const out = new Set<SnapTarget>();
  if (p.angles && appliesIn('angles', ctx)) out.add('angles');
  if (!on || bypass) return out;
  const cells = ctx === 'pixel' && !!p.cells;
  for (const t of SNAP_TARGETS) {
    if (t.id === 'angles' || !p[t.id] || !t.contexts.includes(ctx)) continue;
    if (cells && t.id !== 'cells' && t.id !== 'perspective') continue;
    if (t.id === 'guides' && !scene.guides) continue;
    if (t.id === 'grid' && scene.grid === 'off') continue;
    if (t.id === 'perspective' && !scene.perspective) continue;
    out.add(t.id);
  }
  return out;
}

/** Is every target ticked for this kind of work off? (The master switch can be on and still do nothing.) */
export const nothingTicked = (picks: SnapPicks, ctx: SnapContext): boolean => !SNAP_TARGETS.some((t) => t.id !== 'angles' && t.contexts.includes(ctx) && picks[ctx][t.id]);

/** "Snapped to guide and page edge", for the little note while something snaps. Empty for nothing. */
export function describeSnap(kinds: readonly SnapTarget[]): string {
  const words = [...new Set(kinds.map((k) => targetInfo(k).note))];
  if (!words.length) return '';
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  return `Snapped to ${list}`;
}

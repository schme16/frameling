// What each panel is for, in a sentence, and how the right side treats it: as a section of Properties (settings for
// what you're doing now) or as its own place on the rail (Library, Quests, Help...). Plain data plus pure helpers so
// it can be tested. Panels not listed here (plugins) get a place on the rail.
import { celAt, findLayer } from '../core/doc';
import type { Layer, Shape } from '../core/format';
import { getTool, type PanelDef } from '../core/registry';
import type { State } from '../core/store';
import { ownedUndo } from '../core/owners';
import { allSliceCount } from '../pixel/slices/model';
import { tl } from '../timeline/state';
import { RAIL_GROUPS, type RailGroup } from './dockModel';

/** Where a panel sits on the rail. Properties first, then the rest in this order with a line between groups. */
export { RAIL_GROUPS, type RailGroup };
export const GROUP_NAMES: Record<RailGroup, string> = { properties: 'Properties', make: 'Make', animate: 'Animate', learn: 'Learn', more: 'More' };

export interface PanelInfo {
  /** A short name for the rail (two short words at most). Defaults to the title. */
  short?: string;
  /** One sentence: what it's for. Shown in tooltips and the panel list. */
  blurb: string;
  group: RailGroup;
  /** Shown as a section of Properties rather than on the rail. */
  section?: boolean;
  /** For sections: does it apply right now? Missing means always. */
  relevant?: (s: State) => boolean;
  /** For sections: what makes it apply, when it doesn't ("Select some text"). */
  idle?: string;
  /** For sections: about the selected things, so it moves to the top while something is selected. */
  selection?: boolean;
  /** For sections: a word or two after the title saying what it's set to now ("Brush"). */
  detail?: (s: State) => string | undefined;
  /** Extra search words. */
  keywords?: string[];
}

export const layerOf = (s: State): Layer | undefined => findLayer(s.doc, s.ui.activeLayerId);

/** The selected shapes on the active layer's drawing at this frame. */
export function picked(s: State): Shape[] {
  const l = layerOf(s);
  const cel = l ? celAt(l, s.ui.frame) : undefined;
  const d = cel ? s.doc.drawings[cel.drawingId] : undefined;
  if (d?.kind !== 'vector' || !s.ui.selection.length) return [];
  const sel = new Set(s.ui.selection);
  return d.shapes.filter((x) => sel.has(x.id));
}

export const toolIs = (...ids: string[]) => (s: State) => ids.includes(s.ui.tool);

export const PANEL_INFO: Record<string, PanelInfo> = {
  'tool-options': {
    blurb: 'Settings for the tool you have picked: size, smoothing, shape and more.',
    group: 'properties',
    section: true,
    detail: (s) => getTool(s.ui.tool)?.label,
    keywords: ['brush size', 'options', 'settings'],
  },
  colors: {
    blurb: 'The fill and outline colours you draw with, a colour picker and swatches.',
    group: 'properties',
    section: true,
    relevant: (s) => layerOf(s)?.kind !== 'camera',
    idle: 'Pick a drawing layer',
    keywords: ['colour', 'color', 'swatch', 'fill', 'stroke', 'picker'],
  },
  palette: {
    short: 'Palette',
    blurb: 'The pixel art palette: a fixed set of colours for pixel layers.',
    group: 'properties',
    section: true,
    relevant: (s) => layerOf(s)?.kind === 'pixel',
    idle: 'Pick a pixel layer',
    keywords: ['pixel', 'colours', 'indexed'],
  },
  slices: {
    blurb: 'Named rectangles on a pixel layer, with a 9-patch middle and a pivot, for your game engine. Lists the slices of every board and layer.',
    group: 'properties',
    section: true,
    relevant: (s) => layerOf(s)?.kind === 'pixel' || allSliceCount(s.doc) > 0,
    idle: 'Pick a pixel layer',
    keywords: ['slice', 'slices', '9-patch', 'nine patch', 'pivot', 'hitbox', 'region'],
  },
  'clip-play': {
    short: 'Clip',
    blurb: 'How the clip you clicked on the timeline plays: forward, backward or back and forth, and how many times.',
    group: 'properties',
    section: true,
    relevant: () => !!tl().clipId,
    idle: 'Click a clip on the timeline',
    keywords: ['clip', 'direction', 'repeat', 'back and forth', 'backward', 'loop', 'once', 'times'],
  },
  'symbol-props': {
    short: 'Motion',
    blurb: 'The selected symbol: size, turn, fade and colour wash, and the in-betweens (tweens) that move it.',
    group: 'properties',
    section: true,
    selection: true,
    relevant: (s) => {
      const l = layerOf(s);
      if (!l || (l.kind !== 'vector' && l.kind !== 'camera')) return false;
      return l.kind === 'camera' || picked(s).length > 0 || !!celAt(l, s.ui.frame)?.tween;
    },
    idle: 'Select something on the canvas',
    keywords: ['tween', 'in-between', 'instance', 'symbol', 'motion', 'move'],
  },
  effects: {
    blurb: 'Glow, shadow, blur, outline and blend modes for the whole layer or folder.',
    group: 'properties',
    section: true,
    selection: true,
    relevant: (s) => {
      const l = layerOf(s);
      return !!l && (picked(s).length > 0 || !!l.effects?.length || (!!l.blend && l.blend !== 'normal'));
    },
    idle: 'Select something, or open it for this layer',
    detail: (s) => layerOf(s)?.name,
    keywords: ['glow', 'shadow', 'blur', 'blend', 'filter', 'fx'],
  },
  library: {
    blurb: 'Your symbols: reusable drawings and animations to place again and again.',
    group: 'make',
    keywords: ['symbols', 'assets', 'reuse'],
  },
  layers: {
    blurb: 'The sheets your drawing is stacked from: add, rename, reorder, hide and lock them. The same list the timeline shows.',
    group: 'make',
    keywords: ['layer', 'layers', 'vector', 'pixel', 'hide', 'lock', 'reorder', 'folder', 'stack'],
  },
  'draw-on': {
    short: 'Draw on',
    blurb: 'Make a picked line draw itself: Start, End and Offset for how much of it shows, and a one-click Draw it on.',
    group: 'animate',
    keywords: ['trim', 'trim path', 'draw on', 'write on', 'reveal', 'progress ring', 'signature', 'line draws itself'],
  },
  notes: {
    blurb: 'Notes you leave on the canvas, for you or whoever opens the file next. They stay in the file and never come out in an export.',
    group: 'more',
    keywords: ['notes', 'comments', 'review', 'feedback', 'annotations', 'to do'],
  },
  artboards: {
    blurb: 'Several canvases in one file: a sprite each, or a shot each, side by side.',
    group: 'make',
    keywords: ['artboard', 'canvases', 'sprites', 'shots', 'scenes', 'pages'],
  },
  timeline: {
    blurb: 'Your frames and layers over time: draw a frame, then the next, and play them back.',
    group: 'animate',
    keywords: ['frames', 'layers', 'keys', 'animation'],
  },
  preview: {
    blurb: 'Your animation playing at its real size, as it will look in a game.',
    group: 'animate',
    keywords: ['real size', 'actual size', 'play', 'sprite'],
  },
  quests: {
    blurb: 'Short guided lessons that teach a skill step by step.',
    group: 'learn',
    keywords: ['tutorial', 'lessons', 'learn'],
  },
  help: {
    blurb: 'Every help topic, with search.',
    group: 'learn',
    keywords: ['docs', 'manual', 'how to'],
  },
};

/** A feature adds the rail name, blurb and Properties placement of its panels (and takes them away when it is turned off). */
export function registerPanelInfo(id: string, info: PanelInfo): void {
  PANEL_INFO[id] = info;
  ownedUndo(() => {
    if (PANEL_INFO[id] === info) delete PANEL_INFO[id];
  });
}

/** Info for any panel, with a fallback for ones this file doesn't know (plugins). */
export function infoFor(p: Pick<PanelDef, 'id' | 'title'>): PanelInfo {
  return PANEL_INFO[p.id] ?? { blurb: p.id.startsWith('plugin') ? 'Added by a plugin.' : `The ${p.title} panel.`, group: 'more' };
}

export const shortName = (p: Pick<PanelDef, 'id' | 'title'>): string => infoFor(p).short ?? p.title;

export const isSection = (id: string): boolean => !!PANEL_INFO[id]?.section;

/** A zone's tabs split into Properties sections and rail places. With `merge` off every panel is a rail place. */
export function splitZone(tabs: string[], merge: boolean): { sections: string[]; rail: string[] } {
  if (!merge) return { sections: [], rail: tabs };
  return { sections: tabs.filter(isSection), rail: tabs.filter((t) => !isSection(t)) };
}

/** Rail places grouped, groups in RAIL_GROUPS order, the zone's own order inside each. */
export function railGroups(ids: string[], groupOf: (id: string) => RailGroup = (id) => PANEL_INFO[id]?.group ?? 'more'): { group: RailGroup; ids: string[] }[] {
  return RAIL_GROUPS.map((group) => ({ group, ids: ids.filter((id) => groupOf(id) === group) })).filter((g) => g.ids.length > 0);
}

/** The plain name for a stacked group of the right side, by where it sits: Top group, Upper group, Lower group, Bottom group. */
export function groupWord(index: number, count: number): string {
  if (count <= 1) return 'Right side';
  if (index === 0) return 'Top group';
  if (index === count - 1) return 'Bottom group';
  return count === 3 ? 'Middle group' : index === 1 ? 'Upper group' : 'Lower group';
}

/** One stacked group of the right side, ready to draw: its Properties sections (the first group only), its rail places and its front panel. */
export interface RightGroupPlan {
  index: number;
  /** Every panel in the group, in the group's own order. */
  tabs: string[];
  sections: string[];
  places: { group: RailGroup; ids: string[] }[];
  active: string | null;
  /** The front panel is one of the Properties sections. */
  onProps: boolean;
}

/** The right side's groups as the rail draws them. Only the first group folds its sections into Properties. */
export function planRight(groups: { tabs: string[]; active: string | null }[], merge: boolean, railAt?: Record<string, RailGroup>): RightGroupPlan[] {
  const groupOf = (id: string): RailGroup => railAt?.[id] ?? PANEL_INFO[id]?.group ?? 'more';
  return groups.map((g, index) => {
    const { sections, rail } = splitZone(g.tabs, merge && index === 0);
    const active = g.active && g.tabs.includes(g.active) ? g.active : (g.tabs[0] ?? null);
    return { index, tabs: g.tabs, sections, places: railGroups(rail, groupOf), active, onProps: sections.length > 0 && !!active && sections.includes(active) };
  });
}

/**
 * Which sections Properties shows now, and which wait below as "also here". A section shows when it applies, or when
 * it's the one asked for (`active`), so asking for Effects with nothing selected still brings it up. With something
 * selected, the sections about it lead.
 */
export function sectionsNow(sections: string[], s: State, active: string | null): { shown: string[]; idle: string[] } {
  const shown: string[] = [];
  const idle: string[] = [];
  for (const id of sections) {
    const rel = PANEL_INFO[id]?.relevant;
    let on = true;
    try {
      on = !rel || rel(s);
    } catch {
      on = true;
    }
    (on || id === active ? shown : idle).push(id);
  }
  // Like Illustrator's Properties: with something selected, what's about it comes first, the tool and colours after.
  // A clip you just clicked leads: its settings are what you came for.
  if (shown.includes('clip-play')) shown.splice(0, 0, ...shown.splice(shown.indexOf('clip-play'), 1));
  if (s.ui.selection.length) {
    const first = shown.filter((id) => PANEL_INFO[id]?.selection);
    return { shown: [...first, ...shown.filter((id) => !first.includes(id))], idle };
  }
  return { shown, idle };
}

/** Search for the panel list: every word must start a word of the title, short name, blurb or keywords. */
export function matchPanel(p: Pick<PanelDef, 'id' | 'title'>, query: string): boolean {
  const q = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!q.length) return true;
  const info = infoFor(p);
  const hay = [p.title, info.short ?? '', info.blurb, ...(info.keywords ?? []), GROUP_NAMES[info.group]].join(' ').toLowerCase();
  const words = hay.split(/[^a-z0-9]+/).filter(Boolean);
  return q.every((w) => words.some((x) => x.startsWith(w)) || hay.includes(w));
}

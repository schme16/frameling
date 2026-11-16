// What each panel is for, in a sentence, and how the right side treats it: as a section of Properties (settings for
// what you're doing now) or as its own place on the rail (Library, Quests, Help...). Plain data plus pure helpers so
// it can be tested. Panels not listed here (plugins) get a place on the rail.
import { celAt, findLayer } from '../core/doc';
import { isInstance } from '../core/symbols';
import { canRepeat } from '../core/repeats';
import { hasPixelSelection } from '../select/pixel-state';
import type { Layer, Shape } from '../core/format';
import { getTool, type PanelDef } from '../core/registry';
import type { State } from '../core/store';
import { ownedUndo } from '../core/owners';
import { allSliceCount } from '../pixel/slices/model';
import { leadKeyOf, tl } from '../timeline/state';
import { currentChoice } from '../core/choices';
import { COLOURS, PROPS_ORDER_CHOICE, type PropsOrder } from './propsOrder';
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
  /** For sections: what makes it apply, when it doesn't ("Select some text"). The Panels list shows it as "Shows up when you ...". */
  idle?: string;
  /** For sections: about the selected things, so it moves to the top while something is selected (a function says when). */
  selection?: boolean | ((s: State) => boolean);
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

/** Something is selected that Position and size and Align can work on: shapes on a vector layer, or pixels. */
export function hasSelected(s: State): boolean {
  const l = layerOf(s);
  if (!l) return false;
  if (l.kind === 'pixel') return hasPixelSelection();
  return l.kind === 'vector' && picked(s).length > 0;
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
  // Position and size, and Align and space out, are about whatever is selected (shapes, a symbol or pixels), so they
  // are sections of their own. They lead the selection group, straight after Colours (see sectionsNow).
  'selection-numbers': {
    short: 'Position',
    blurb: 'Where the selection sits and how big it is: X, Y, Width, Height, Turn by and Slant by, or whole pixels for selected pixels.',
    group: 'properties',
    section: true,
    selection: true,
    relevant: (s) => hasSelected(s),
    idle: 'Select something on the canvas',
    detail: (s) => (layerOf(s)?.kind === 'pixel' ? 'pixels' : undefined),
    keywords: ['position', 'size', 'x y', 'coordinates', 'width', 'height', 'resize', 'turn', 'rotate', 'slant', 'skew', 'exact', 'numbers', 'transform', 'move'],
  },
  align: {
    short: 'Align',
    blurb: 'Line up the selection on its edges or middles, or space three or more out evenly.',
    group: 'properties',
    section: true,
    selection: true,
    relevant: (s) => hasSelected(s),
    idle: 'Select something on the canvas',
    keywords: ['align', 'line up', 'distribute', 'space out', 'spread', 'centre', 'center', 'left', 'right', 'top', 'bottom', 'middle', 'gap', 'even'],
  },
  repeat: {
    blurb: 'Make rows and columns of the picked shape, a ring of it round a centre you can snap, or a mirror image across a line. Change the original and every copy follows.',
    group: 'properties',
    section: true,
    selection: true,
    relevant: (s) => layerOf(s)?.kind === 'vector' && picked(s).some(canRepeat),
    idle: 'Select a shape on a vector layer',
    detail: (s) => {
      const r = picked(s).find((x) => canRepeat(x) && 'repeat' in x && x.repeat);
      const k = r && 'repeat' in r ? r.repeat?.kind : undefined;
      return k === 'grid' ? 'rows and columns' : k === 'ring' ? 'ring' : k === 'mirror' ? 'mirror' : undefined;
    },
    keywords: ['repeat', 'pattern', 'array', 'grid', 'ring', 'circle', 'mirror', 'symmetry', 'copies', 'rows', 'columns', 'petals', 'fan'],
  },
  'symbol-props': {
    short: 'Motion',
    blurb: 'A symbol\'s fade, colour wash and how it plays its own animation, and the in-betweens (tweens) that move what is on the key.',
    group: 'properties',
    section: true,
    // Leads with the selection only when a symbol is in it: for a plain shape this is just the in-betweens.
    selection: (s) => picked(s).some((x) => isInstance(x)),
    relevant: (s) => {
      const l = layerOf(s);
      if (!l || (l.kind !== 'vector' && l.kind !== 'camera')) return false;
      return l.kind === 'camera' || picked(s).length > 0 || !!celAt(l, s.ui.frame)?.tween;
    },
    idle: 'Select something on the canvas',
    keywords: ['tween', 'in-between', 'instance', 'symbol', 'motion', 'move', 'fade', 'tint', 'see-through'],
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
  scripts: {
    blurb: 'Write a few lines of JavaScript, run them, and keep them as a command you can put on a key.',
    group: 'more',
    keywords: ['script', 'scripts', 'javascript', 'macro', 'automate', 'code', 'repeat', 'batch'],
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
  'clip-drawings': {
    short: 'Drawings',
    blurb: 'Every drawing in the clip you are in, once each with held frames skipped, with its name underneath. Click one to go there, or search by name.',
    group: 'animate',
    keywords: ['drawings', 'poses', 'keys', 'keyframes', 'contact sheet', 'thumbnails', 'names', 'find', 'jump', 'overview', 'clip'],
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

/** The sections about a selection that come first among them, in this order. */
const ABOUT_FIRST = ['selection-numbers', 'align', 'repeat'];

/**
 * Which sections Properties shows now, and which are left out (the Panels list says when each turns up). A section shows when it applies, or when
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
  // Colours lead by default, so the colours you draw with are always in the same place. The other way round (what's
  // about the selection first, like Illustrator's Properties) is a choice in Preferences > Behaviour. A clip you just
  // clicked leads either way: its settings are what you came for. Once you press on the canvas, or pick another layer
  // or tool, what you picked last leads instead, and the clip's settings stay below (it is still picked).
  // What is about the selection comes right after Colours. Position and size, then Align and space out, always come
  // first among them (a saved layout may hold them anywhere), then the rest in the layout's order.
  const aboutIt = (id: string) => {
    const v = PANEL_INFO[id]?.selection;
    try {
      return typeof v === 'function' ? v(s) : !!v;
    } catch {
      return false;
    }
  };
  const about = s.ui.selection.length || hasPixelSelection() ? shown.filter((id) => aboutIt(id)) : [];
  const aboutOrdered = [...ABOUT_FIRST.filter((id) => about.includes(id)), ...about.filter((id) => !ABOUT_FIRST.includes(id))];
  let out: string[];
  if (about.length && currentChoice<PropsOrder>(PROPS_ORDER_CHOICE) === 'selection') {
    out = [...aboutOrdered, ...shown.filter((id) => !about.includes(id))];
  } else {
    const lead = shown.filter((id) => id === COLOURS);
    const after = aboutOrdered.filter((id) => id !== COLOURS);
    out = [...lead, ...after, ...shown.filter((id) => !lead.includes(id) && !after.includes(id))];
  }
  if (out.includes('clip-play') && tl().clipLead === leadKeyOf(s)) out = ['clip-play', ...out.filter((id) => id !== 'clip-play')];
  return { shown: out, idle };
}

/**
 * The line the Panels list gives a Properties section that only turns up sometimes: "Shows up when you pick a pixel
 * layer". Made from the section's `idle` words, so there is one wording. Sections that are always there have none.
 */
export function whenShown(p: Pick<PanelDef, 'id' | 'title'>): string | undefined {
  const idle = PANEL_INFO[p.id]?.idle?.trim();
  if (!idle) return undefined;
  return `Shows up when you ${idle[0].toLowerCase()}${idle.slice(1)}`;
}

/** Search for the panel list: every word must start a word of the title, short name, blurb or keywords. */
export function matchPanel(p: Pick<PanelDef, 'id' | 'title'>, query: string): boolean {
  const q = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!q.length) return true;
  const info = infoFor(p);
  const hay = [p.title, info.short ?? '', info.blurb, whenShown(p) ?? '', ...(info.keywords ?? []), GROUP_NAMES[info.group]].join(' ').toLowerCase();
  const words = hay.split(/[^a-z0-9]+/).filter(Boolean);
  return q.every((w) => words.some((x) => x.startsWith(w)) || hay.includes(w));
}

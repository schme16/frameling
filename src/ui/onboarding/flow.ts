// The first-run hello from Quill, as plain data and a reducer: which step shows, what was picked, and what to suggest
// afterwards. No DOM and no stores, so it's all easy to test. Onboarding.tsx draws it. Quill's words are in
// ../mascot/lines.json.
import { interactivesEnabled } from '../../features/flags';
import { line, lines } from '../mascot/lines';

// Five steps. The name for the first animation is asked on the last page, where there is room for it, and the
// settings a person can't judge before they have drawn anything (units, the mouse wheel, less motion) are left to
// Preferences, the wheel's own ask-once question, and the computer's own "reduce motion" setting.
export type StepId = 'hello' | 'make' | 'themes' | 'prefs' | 'done';

export const STEPS: StepId[] = ['hello', 'make', 'themes', 'prefs', 'done'];

export type Interest = 'cartoons' | 'sprites' | 'tiles' | 'motion' | 'interactives' | 'play';

export interface InterestInfo {
  id: Interest;
  title: string;
  blurb: string;
  icon: string;
  /** What Quill says when it's picked. */
  reaction: string;
}

/** The cards on "What would you like to make?". The Interactives one is left out while Interactives is hidden (src/features/flags.ts). */
export const INTERESTS: InterestInfo[] = ([
  { id: 'cartoons', title: 'Sketches and cartoons', blurb: 'Doodles that wiggle, blink and bounce.', icon: 'brush', reaction: line('onboarding.make.cartoons') },
  { id: 'sprites', title: 'Game sprites and pixel art', blurb: 'Heroes, baddies and chunky little pixels.', icon: 'pixel', reaction: line('onboarding.make.sprites') },
  { id: 'tiles', title: 'Tiles and levels', blurb: 'Grass, walls and whole worlds to explore.', icon: 'tiles', reaction: line('onboarding.make.tiles') },
  { id: 'motion', title: 'Explainers and motion graphics', blurb: 'Logos, titles and smooth moves.', icon: 'tween', reaction: line('onboarding.make.motion') },
  { id: 'interactives', title: 'Things for Interactives', blurb: 'Art you can poke!', icon: 'play', reaction: line('onboarding.make.interactives') },
  { id: 'play', title: 'Just playing', blurb: 'No plan at all. The best kind of plan.', icon: 'heart', reaction: line('onboarding.make.play') },
] as InterestInfo[]).filter((i) => i.id !== 'interactives' || interactivesEnabled());

export interface FlowState {
  step: StepId;
  interests: Interest[];
  /** The name for the first animation. */
  name: string;
  /** Set when the flow ends: finished properly, or skipped part way. */
  ended: null | 'done' | 'skipped';
  /** The last interest picked, for Quill's reaction. */
  lastPick: Interest | null;
  /** Put away the areas none of the picks need, when the flow finishes. On unless the person turns it off. */
  tuck: boolean;
}

export type FlowAction =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'goto'; step: StepId }
  | { type: 'toggle'; interest: Interest }
  | { type: 'name'; name: string }
  | { type: 'tuck'; on: boolean };

export const MAX_NAME = 80;

export function startFlow(name = ''): FlowState {
  return { step: 'hello', interests: [], name, ended: null, lastPick: null, tuck: true };
}

export const stepIndex = (s: StepId): number => STEPS.indexOf(s);

export function reduceFlow(s: FlowState, a: FlowAction): FlowState {
  if (s.ended) return s;
  switch (a.type) {
    case 'next': {
      const i = stepIndex(s.step);
      if (i >= STEPS.length - 1) return { ...s, ended: 'done' };
      return { ...s, step: STEPS[i + 1] };
    }
    case 'back': {
      const i = stepIndex(s.step);
      return i <= 0 ? s : { ...s, step: STEPS[i - 1] };
    }
    case 'skip':
      return { ...s, ended: 'skipped' };
    case 'goto':
      return STEPS.includes(a.step) ? { ...s, step: a.step } : s;
    case 'toggle': {
      if (!INTERESTS.some((x) => x.id === a.interest)) return s;
      const on = s.interests.includes(a.interest);
      // Kept in the order of the cards, so the suggestion doesn't depend on click order.
      const interests = INTERESTS.map((x) => x.id).filter((id) => (id === a.interest ? !on : s.interests.includes(id)));
      return { ...s, interests, lastPick: on ? null : a.interest };
    }
    case 'name':
      return { ...s, name: a.name.slice(0, MAX_NAME) };
    case 'tuck':
      return { ...s, tuck: a.on };
  }
}

/** What Quill says on the "what would you like to make" step. */
export function makeReaction(s: Pick<FlowState, 'interests' | 'lastPick'>): string {
  if (s.lastPick) return INTERESTS.find((x) => x.id === s.lastPick)!.reaction;
  if (s.interests.length >= 4) return line('onboarding.make.lots');
  if (s.interests.length) return line('onboarding.make.some');
  return line('onboarding.make.none');
}

// ---------------------------------------------------------------- what to suggest

export interface Plan {
  /** Built-in workspace id (draw, animate, pixel). */
  workspace: 'draw' | 'animate' | 'pixel';
  /** Template id to open. */
  template: string;
  /** Quest id to offer. */
  quest: string;
  /** Help topic ids worth a look, best first. */
  help: string[];
  /** Template for "Just a blank page", when the plain starting page doesn't suit (pixel art wants a pixel grid). */
  blank?: string;
  /** A panel to bring to the front, when the workspace's first one isn't where this kind of work starts. */
  panel?: string;
}

/** Interests whose own quest makes a better first one than the 60-second animation (a pixel sprite, a tile). */
const OWN_FIRST: readonly Interest[] = ['sprites', 'tiles'];

const PLANS: Record<Interest, Plan> = {
  cartoons: { workspace: 'animate', template: 'bouncing-ball', quest: 'bouncing-ball', help: ['timeline-onion', 'tool-brush', 'timeline-frames'] },
  sprites: { workspace: 'pixel', template: 'hero-sprites', quest: 'pixel-pal', help: ['pixel-art', 'palette', 'export-sprite-sheets'], blank: 'blank-pixel' },
  tiles: { workspace: 'pixel', template: 'tileset', quest: 'tiles', help: ['tileset', 'tilemaps', 'export-godot'], blank: 'blank-level', panel: 'tileset' },
  motion: { workspace: 'animate', template: 'bouncing-logo', quest: 'bouncing-ball', help: ['tweens', 'easing', 'motion-paths'] },
  interactives: { workspace: 'animate', template: 'blink', quest: 'share-it', help: ['export-interactives', 'timeline-clips', 'symbols'] },
  play: { workspace: 'draw', template: 'blank-vector', quest: 'fill-it-in', help: ['tool-brush', 'command-palette', 'examples'] },
};

/** Interests that need a feature which is off, so the plan leaves them out. Each is a feature id. */
export const INTEREST_FEATURE: Partial<Record<Interest, string>> = { tiles: 'tiles' };

/** The picked interests whose feature is off (so `planFor` should not see them), in card order. */
export function pickedButOff(interests: readonly Interest[], isOn: (feature: string) => boolean): Interest[] {
  return interests.filter((i) => INTEREST_FEATURE[i] !== undefined && !isOn(INTEREST_FEATURE[i]!));
}

/** Everyone starts with this one: the others open up after it. */
export const FIRST_QUEST = 'first-animation';

/**
 * What to suggest for the picks: the first pick (in card order) picks the workspace and the template, help topics
 * come from every pick, and the quest is the 60-second one until that's done (sprite and tile people get their own first).
 */
export function planFor(interests: readonly Interest[], completedQuests: readonly string[] = []): Plan {
  const picks = INTERESTS.map((x) => x.id).filter((id) => interests.includes(id));
  const lead = PLANS[picks[0] ?? 'play'];
  const help: string[] = [];
  for (const id of picks.length ? picks : (['play'] as Interest[])) for (const h of PLANS[id].help) if (!help.includes(h)) help.push(h);
  let quest = FIRST_QUEST;
  // Sprite and tile people start with a quest in their own kind of art.
  const leadId = picks[0];
  if (leadId && OWN_FIRST.includes(leadId) && !completedQuests.includes(lead.quest)) quest = lead.quest;
  else if (completedQuests.includes(FIRST_QUEST)) quest = picks.map((id) => PLANS[id].quest).find((q) => !completedQuests.includes(q)) ?? lead.quest;
  return { workspace: lead.workspace, template: lead.template, quest, help: help.slice(0, 4), ...(lead.blank ? { blank: lead.blank } : {}), ...(lead.panel ? { panel: lead.panel } : {}) };
}

// ---------------------------------------------------------------- tucking away what was not asked for

/**
 * The optional areas (Preferences > Features) each kind of making keeps on show. Anything in the table that none of
 * the picks keeps is tucked away when the hello finishes, and Preferences > Features brings it back. Areas that are
 * not in the table (Quill's own, Interactives) are never touched.
 */
export const INTEREST_KEEPS: Record<Interest, string[]> = {
  cartoons: ['audio', 'text'],
  sprites: ['audio', 'particles', 'flow', 'godot-export'],
  tiles: ['tiles', 'audio', 'particles', 'flow', 'godot-export'],
  motion: ['audio', 'text', 'camera', 'particles'],
  interactives: ['audio', 'text', 'particles', 'flow'],
  // No plan at all, so nothing is put away.
  play: [],
};

/**
 * Every area the hello may put away: the ones above, plus Rig and Lip sync, which no pick keeps (a person who wants
 * a puppet or a talking mouth turns them on, and the Features page says where).
 */
export const TUCKABLE: readonly string[] = [...new Set([...Object.values(INTEREST_KEEPS).flat(), 'rig', 'lipsync'])];

export interface TuckFeature {
  id: string;
  on: boolean;
  /** Ids of the areas this one needs. */
  requires?: readonly string[];
}

/**
 * The areas to put away for these picks, in the order to switch them off. Nothing for no picks or for "Just
 * playing", and an area that a kept area needs stays on (Lip sync needs Audio, say).
 */
export function featuresToTuck(interests: readonly Interest[], features: readonly TuckFeature[]): string[] {
  if (!interests.length || interests.includes('play')) return [];
  const keep = new Set(interests.flatMap((i) => INTEREST_KEEPS[i]));
  let away = features.filter((f) => f.on && TUCKABLE.includes(f.id) && !keep.has(f.id));
  // Whatever stays on keeps what it needs on too, so keep going until that settles.
  for (let again = true; again; ) {
    again = false;
    const stay = features.filter((f) => f.on && !away.includes(f));
    for (const f of [...away]) {
      if (stay.some((o) => o.requires?.includes(f.id))) {
        away = away.filter((a) => a !== f);
        again = true;
      }
    }
  }
  // One that needs another goes first, so the other is free to go.
  const needsOther = (f: TuckFeature) => !!f.requires?.some((r) => away.some((x) => x.id === r));
  return [...away.filter(needsOther), ...away.filter((f) => !needsOther(f))].map((f) => f.id);
}

/** "Rig", "Rig and Lip sync", "Rig, Lip sync and Clip flow". */
export function nameList(names: readonly string[]): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------- silly names

const ADJECTIVES = lines('sillyNames.adjectives');
const NOUNS = lines('sillyNames.nouns');
const FALLBACK = lines('sillyNames.fallback');

/** A silly name for a first animation, like "The Wobbly Pancake". Pass a random source for tests. */
export function sillyName(rand: () => number = Math.random, not?: string): string {
  const pick = <T,>(list: T[]) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  for (let i = 0; i < 6; i++) {
    const name = line('sillyNames.pattern', { adjective: pick(ADJECTIVES), noun: pick(NOUNS) });
    if (name !== not) return name;
  }
  return not === FALLBACK[0] ? FALLBACK[1] : FALLBACK[0];
}

// ---------------------------------------------------------------- Quill's favourite theme

export interface ThemeLike {
  id: string;
  name: string;
  mode: 'dark' | 'light';
}

/** Quill's favourite for a mode: the Strawberry theme if there is one (by id, then by name). Null when there isn't. */
export function strawberryFor<T extends ThemeLike>(themes: readonly T[], mode: 'dark' | 'light'): T | null {
  const ofMode = themes.filter((t) => t.mode === mode);
  const exact = ofMode.find((t) => t.id === (mode === 'light' ? 'strawberry' : 'strawberry-night'));
  if (exact) return exact;
  return ofMode.find((t) => /strawberry/i.test(t.id)) ?? ofMode.find((t) => /strawberry/i.test(t.name)) ?? null;
}

export const isStrawberry = (t: ThemeLike | null | undefined): boolean => !!t && (/strawberry/i.test(t.id) || /strawberry/i.test(t.name));

// ---------------------------------------------------------------- dozing off

/** How long a step can sit untouched before Quill nods off. */
export const DOZE_MS = 20_000;

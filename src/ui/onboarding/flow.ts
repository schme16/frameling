// The first-run hello from Quill, as plain data and a reducer: which step shows, what was picked, and what to suggest
// afterwards. No DOM and no stores, so it's all easy to test. Onboarding.tsx draws it.

export type StepId = 'hello' | 'make' | 'themes' | 'prefs' | 'name' | 'done';

export const STEPS: StepId[] = ['hello', 'make', 'themes', 'prefs', 'name', 'done'];

export type Interest = 'cartoons' | 'sprites' | 'tiles' | 'motion' | 'interactives' | 'play';

export interface InterestInfo {
  id: Interest;
  title: string;
  blurb: string;
  icon: string;
  /** What Quill says when it's picked. */
  reaction: string;
}

export const INTERESTS: InterestInfo[] = [
  { id: 'cartoons', title: 'Sketches and cartoons', blurb: 'Doodles that wiggle, blink and bounce.', icon: 'brush', reaction: 'Cartoons! I love a good wobbly line.' },
  { id: 'sprites', title: 'Game sprites and pixel art', blurb: 'Heroes, baddies and chunky little pixels.', icon: 'pixel', reaction: 'Pixel heroes! Chunky and charming, just like me.' },
  { id: 'tiles', title: 'Tiles and levels', blurb: 'Grass, walls and whole worlds to explore.', icon: 'tiles', reaction: 'Levels! I will pack snacks for the explorers.' },
  { id: 'motion', title: 'Explainers and motion graphics', blurb: 'Logos, titles and smooth moves.', icon: 'tween', reaction: 'Smooth moves! Tweens draw the in-between bits for you.' },
  { id: 'interactives', title: 'Things for Interactives', blurb: 'Art people can click, poke and play with.', icon: 'play', reaction: 'Interactives! Your art gets clicked, poked and played with.' },
  { id: 'play', title: 'Just playing', blurb: 'No plan at all. The best kind of plan.', icon: 'heart', reaction: 'Just playing is my favourite kind of making.' },
];

export interface FlowState {
  step: StepId;
  interests: Interest[];
  /** The name for the first animation. */
  name: string;
  /** Set when the flow ends: finished properly, or skipped part way. */
  ended: null | 'done' | 'skipped';
  /** The last interest picked, for Quill's reaction. */
  lastPick: Interest | null;
}

export type FlowAction =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'goto'; step: StepId }
  | { type: 'toggle'; interest: Interest }
  | { type: 'name'; name: string };

export const MAX_NAME = 80;

export function startFlow(name = ''): FlowState {
  return { step: 'hello', interests: [], name, ended: null, lastPick: null };
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
  }
}

/** What Quill says on the "what would you like to make" step. */
export function makeReaction(s: Pick<FlowState, 'interests' | 'lastPick'>): string {
  if (s.lastPick) return INTERESTS.find((x) => x.id === s.lastPick)!.reaction;
  if (s.interests.length >= 4) return 'All of it? Yes! Big plans, I love it.';
  if (s.interests.length) return 'Great picks. Add more if you like.';
  return 'Pick as many as you like, or none at all. No wrong answers here!';
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
}

const PLANS: Record<Interest, Plan> = {
  cartoons: { workspace: 'animate', template: 'bouncing-ball', quest: 'bouncing-ball', help: ['timeline-onion', 'tool-brush', 'timeline-frames'] },
  sprites: { workspace: 'pixel', template: 'hero-sprites', quest: 'pixel-pal', help: ['pixel-art', 'palette', 'export-sprite-sheets'] },
  tiles: { workspace: 'pixel', template: 'tileset', quest: 'tiles', help: ['tileset', 'tilemaps', 'export-godot'] },
  motion: { workspace: 'animate', template: 'bouncing-logo', quest: 'bouncing-ball', help: ['tweens', 'easing', 'motion-paths'] },
  interactives: { workspace: 'animate', template: 'blink', quest: 'share-it', help: ['export-interactives', 'timeline-clips', 'symbols'] },
  play: { workspace: 'draw', template: 'blank-vector', quest: 'fill-it-in', help: ['tool-brush', 'command-palette', 'examples'] },
};

/** Everyone starts with this one: the others open up after it. */
export const FIRST_QUEST = 'first-animation';

/**
 * What to suggest for the picks: the first pick (in card order) picks the workspace and the template, help topics
 * come from every pick, and the quest is the 60-second one until that's done.
 */
export function planFor(interests: readonly Interest[], completedQuests: readonly string[] = []): Plan {
  const picks = INTERESTS.map((x) => x.id).filter((id) => interests.includes(id));
  const lead = PLANS[picks[0] ?? 'play'];
  const help: string[] = [];
  for (const id of picks.length ? picks : (['play'] as Interest[])) for (const h of PLANS[id].help) if (!help.includes(h)) help.push(h);
  let quest = FIRST_QUEST;
  if (completedQuests.includes(FIRST_QUEST)) quest = picks.map((id) => PLANS[id].quest).find((q) => !completedQuests.includes(q)) ?? lead.quest;
  return { workspace: lead.workspace, template: lead.template, quest, help: help.slice(0, 4) };
}

// ---------------------------------------------------------------- silly names

const ADJECTIVES = ['Wobbly', 'Sleepy', 'Brave', 'Bouncy', 'Sneaky', 'Fluffy', 'Tiny', 'Dizzy', 'Grumpy', 'Sparkly', 'Jolly', 'Squishy', 'Zippy', 'Curious', 'Fancy'];
const NOUNS = ['Pancake', 'Teacup', 'Dragon', 'Turnip', 'Comet', 'Noodle', 'Penguin', 'Muffin', 'Robot', 'Jellybean', 'Cactus', 'Snail', 'Pickle', 'Cloud', 'Biscuit'];

/** A silly name for a first animation, like "The Wobbly Pancake". Pass a random source for tests. */
export function sillyName(rand: () => number = Math.random, not?: string): string {
  const pick = <T,>(list: T[]) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  for (let i = 0; i < 6; i++) {
    const name = `The ${pick(ADJECTIVES)} ${pick(NOUNS)}`;
    if (name !== not) return name;
  }
  return not === 'The Dancing Spoon' ? 'The Humming Kettle' : 'The Dancing Spoon';
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

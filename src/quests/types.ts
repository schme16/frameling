// What a quest is. Plain data plus a few predicates, so the engine can run it without knowing anything about the
// app, and the tests can feed it hand-built states.
import type { State } from '../core/store';

/** Things the app knows that aren't in the store: read from module state or the DOM by the runtime, faked in tests. */
export interface Probe {
  /** The paint bucket's "Close gaps" choice (none, small, medium, large). */
  fillGap: string | null;
  /** Is the export dialog on screen? */
  exportOpen: boolean;
  /** The format card chosen in the export dialog (`gif`, `mp4`...), or null when it isn't open. */
  exportFormat: string | null;
}

export const NO_PROBE: Probe = { fillGap: null, exportOpen: false, exportFormat: null };

/** Everything a step's check gets to look at. */
export interface StepCtx {
  state: State;
  /** The state before the change that made us look. Equal to `state` on a poll. */
  prev: State;
  /** How things stood when this step began, for "has it changed since" checks. */
  entry: { state: State; probe: Probe };
  probe: Probe;
  /** Command ids that ran since this step began. */
  ran: ReadonlySet<string>;
  /** Undo labels of new edits since this step began ("Draw stroke", "Fill"...). */
  edits: readonly string[];
  /** Frames the playhead has been on since this step began (including the one it began on). */
  frames: ReadonlySet<number>;
  /** Milliseconds since this step began. */
  elapsed: number;
}

/** Something that points at a control: a CSS selector, a list of them (first one on screen wins), or a finder. */
export type QuestTarget = string | string[] | (() => Element | null);

export interface QuestStep {
  id: string;
  /** What the guide says, in plain words ("Pick the brush and draw a wobbly circle"). */
  say: string;
  /** An extra line saying why, shown quietly under the instruction. */
  why?: string;
  /** The thing to ring while this step is on. */
  target?: QuestTarget;
  /** Becomes true when the step is done. A step without one is finished by its Next button. */
  done?: (c: StepCtx) => boolean;
  /** "Show me how": a command id to run, or a function that does it. */
  show?: string | (() => void | Promise<void>);
  /** Runs once when the step begins (turn onion skin on, say). */
  enter?: () => void;
  /** Said when nothing has happened for a while. */
  hint?: string;
  /** Seconds of quiet before the hint (default 20). */
  hintAfter?: number;
  /** Help topic for "Tell me more". */
  help?: string;
}

export interface Badge {
  id: string;
  name: string;
  /** Icon name from the icon set. */
  icon: string;
  /** A theme colour token, e.g. `--grape`. */
  color: string;
}

export interface Quest {
  id: string;
  title: string;
  /** One friendly sentence for the welcome card and the panel. */
  summary: string;
  /** Roughly how long it takes. */
  minutes: number;
  /** Icon name from the icon set. */
  icon: string;
  steps: QuestStep[];
  /** Said when the last step is done. */
  finish?: string;
  badge?: Badge;
  /** Quests to do first. The panel shows the quest as locked until they're done (with a way round it). */
  requires?: string[];
  /** Gets the document ready (a template, a pixel page). Resolves false when the person said no to losing their work. */
  prepare?: () => boolean | Promise<boolean>;
  /** Is the open document suitable for picking this quest up half way? */
  ready?: (s: State) => boolean;
}

export interface QuestProgress {
  /** The quest being played right now, or null. */
  active: string | null;
  /** Index of the current step of the active quest. */
  step: number;
  /** Step ids done so far, per quest. */
  done: Record<string, string[]>;
  /** Quests finished, in order. */
  completed: string[];
  /** Badge ids earned. */
  badges: string[];
  /** A quest put down half way, so Resume has somewhere to go back to. */
  paused: { id: string; step: number } | null;
  /** The quiet hint is showing. */
  hint: boolean;
}

export const FRESH_PROGRESS: QuestProgress = { active: null, step: 0, done: {}, completed: [], badges: [], paused: null, hint: false };

export type QuestEvent =
  | { kind: 'start'; quest: Quest }
  | { kind: 'step'; quest: Quest; step: QuestStep; index: number; skipped: boolean }
  | { kind: 'finish'; quest: Quest; badge: Badge | null }
  | { kind: 'stop'; quest: Quest };

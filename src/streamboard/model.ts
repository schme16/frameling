// What the drawing window tells the board, built from plain facts, and what happens when a button is pressed. Pure: the
// registry, the stores and the window are all handed in, so the rules are tested without any of them
// (test/streamboard/model.test.ts).
//
// The covering rules are the same ones the main window keeps (src/audience/spoilers.ts): a pulled prompt is held back at
// the source while it is covered, so its words are never in a message and cannot reach the board's page at all.
import { STOP_COMMAND, STOP_LABEL, TILES, tileById, type Situation, type TileTone } from './tiles';
import { defaultLayout, MIN_TILE_PX, sameLayout, type Layout } from './layout';

/** What the registry says about one command. */
export interface CommandInfo {
  exists: boolean;
  enabled: boolean;
  /** What would turn it on, from the command's own `reason`. */
  reason?: string;
}

export interface TileView {
  id: string;
  command: string;
  label: string;
  caption: string;
  on: boolean | null;
  tone: TileTone;
  enabled: boolean;
  /** Why it will not work now, in plain words. Empty when it will. */
  why: string;
}

export interface TrayView {
  id: string;
  name: string;
  about: string;
}

/** The theme colours the board wears, so it matches the drawing window in dark and light. */
export interface BoardTheme {
  dark: boolean;
  bg: string;
  panel: string;
  text: string;
  muted: string;
  accent: string;
  raised: string;
  line: string;
}

export type ObsWord = { word: string; colour: 'green' | 'red' | 'plain' | 'fix' } | null;

export interface PromptView {
  /** Which slip, so Read it says which one. */
  id: number;
  covered: boolean;
  /** The words, or null while they are covered. Never sent while covered. */
  text: string | null;
}

export interface BoardView {
  tiles: TileView[];
  /** Put away, shown in the tray while arranging. */
  tray: TrayView[];
  /** Where the buttons sit, so the board can move them and send the new layout back. */
  layout: Layout;
  size: number;
  minTile: number;
  /** The red button: same place every time. */
  stop: { label: string; why: string };
  obs: ObsWord;
  audience: { on: boolean; waiting: number };
  prompt: PromptView | null;
  /** True when the layout is the one the board starts with (so there is nothing to put back). */
  isDefault: boolean;
  theme: BoardTheme;
}

export const MISSING_WHY = 'That button has nothing to run. Streaming tools may be switched off: turn them on in Preferences > Streaming.';

/** The words for a command that cannot run now. Empty when it can. */
export function whyNot(info: CommandInfo | undefined): string {
  if (!info || !info.exists) return MISSING_WHY;
  if (info.enabled) return '';
  return info.reason?.trim() || 'Not available right now.';
}

/** The pulled prompt as the board may see it. Covered words are left out here, not hidden later. */
export function promptView(hand: { id: number; text: string } | null, covers: boolean, readId: number | null, scrub: (t: string) => string = (t) => t): PromptView | null {
  if (!hand) return null;
  const covered = covers && readId !== hand.id;
  return { id: hand.id, covered, text: covered ? null : scrub(hand.text) };
}

export interface ViewInput {
  situation: Situation;
  layout: Layout;
  info: (command: string) => CommandInfo | undefined;
  covers: boolean;
  hand: { id: number; text: string } | null;
  readId: number | null;
  scrub?: (t: string) => string;
  obs: ObsWord;
  theme: BoardTheme;
}

export function boardView(i: ViewInput): BoardView {
  const tiles: TileView[] = [];
  for (const id of i.layout.shown) {
    const def = tileById(id);
    if (!def) continue;
    const f = def.face(i.situation);
    const why = whyNot(i.info(f.command));
    tiles.push({ id, command: f.command, label: f.label, caption: f.caption, on: f.on, tone: def.tone, enabled: why === '', why });
  }
  const tray: TrayView[] = [];
  for (const id of i.layout.hidden) {
    const def = tileById(id);
    if (def) tray.push({ id, name: def.name, about: def.about });
  }
  return {
    tiles,
    tray,
    layout: i.layout,
    size: i.layout.size,
    minTile: MIN_TILE_PX[i.layout.size] ?? MIN_TILE_PX[0],
    stop: { label: STOP_LABEL, why: whyNot(i.info(STOP_COMMAND)) },
    obs: i.obs,
    audience: { on: i.situation.audienceOn, waiting: i.situation.waiting },
    prompt: promptView(i.hand, i.covers, i.readId, i.scrub),
    isDefault: sameLayout(i.layout, defaultLayout()),
    theme: i.theme,
  };
}

/** When a button that opens a setup dialog is pressed, should the drawing window come forward? */
export type FrontChoice = 'front' | 'stay';

export type PressPlan = { kind: 'say'; say: string } | { kind: 'run'; raise: boolean; /** Ask the setup-window question before running (it has not been answered yet). */ ask: boolean };

/**
 * What pressing a button does. A command that is not there, or not usable now, says why on the board instead of nothing
 * happening. A button that opens a setup dialog brings the drawing window forward unless the streamer said to leave it
 * (`front` is undefined until they have been asked, and then it comes forward so the question can be seen).
 */
export function pressPlan(tile: string, situation: Situation, info: CommandInfo | undefined, front: FrontChoice | undefined): PressPlan {
  const def = tileById(tile);
  if (!def) return { kind: 'say', say: MISSING_WHY };
  const why = whyNot(info);
  if (why) return { kind: 'say', say: why };
  const face = def.face(situation);
  // A first-time question must be seen, so the window comes forward whatever the streamer will later choose.
  return { kind: 'run', raise: face.asks === true || (face.needsWindow && front !== 'stay'), ask: face.needsWindow && front === undefined };
}

export const ALL_TILE_IDS: readonly string[] = TILES.map((t) => t.id);

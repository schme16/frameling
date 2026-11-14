/**
 * Fitting the interface to a small screen. On a laptop screen the usual layout leaves the canvas little room and the tool
 * rail runs past the bottom of the window (it needs 902 px of height with the group names showing, and a 1080p screen at
 * 125% is only 864 units high). So on a small screen Frameling tightens up by itself: smaller tool buttons, a few more
 * buttons across the rail, panels and a timeline that start a little smaller, and slimmer bars. It is only how things are
 * shown: the saved layout and your own sizes are left alone, so a bigger screen brings the roomy layout straight back.
 *
 * Whether a screen is small comes from its size in the interface's own units (after the computer's scaling and Frameling's
 * interface size), so a 4k laptop panel at 250% counts as the 1536 x 864 it really feels like. The first time on a screen
 * it says so once, in a toast with a Change button (the choices system); the answer is remembered per screen and can be
 * changed in Preferences, Behaviour.
 *
 * The decisions are pure so they can be tested; the watching and the store are at the bottom.
 */
import { useSyncExternalStore } from 'react';
import { currentChoice, onChoiceChange, registerChoice, setChoice, withChoice } from '../core/choices';
import type { DockZone } from '../core/registry';
import type { DisplayInfo } from '../preload/api';
import { MIN_SIZE } from './dockModel';
import { getPrefs, subscribePrefs, type ToolSizePref } from './prefs';
import { anyOverlayOpen } from './overlays';
import { browserDisplay, currentDisplay, screenKey } from './screenSize';
import { toast } from './toast';
import type { RailSizes } from './toolRailWidth';

/**
 * A screen is small when it is under this many units across or down. Worked out from the real interface (scripts/e2e/screen-fit.cjs):
 * the tool rail with names showing needs 902 px, plus the top bar, status bar and gaps (84), so under about 990 units of
 * height it scrolls; and the usual side panels take 552 px across, so under about 1450 the canvas is narrower than 900.
 */
export const SMALL_BELOW = { width: 1450, height: 990 };

/** True when a screen of this many units (across, down) is small enough to tighten up for. Unknown sizes are not small. */
export function isSmallScreen(units: { width: number; height: number }): boolean {
  if (!(units.width > 0 && units.height > 0)) return false;
  return units.width < SMALL_BELOW.width || units.height < SMALL_BELOW.height;
}

/** The screen's size in the interface's own units: what the computer reports, divided by Frameling's interface size. */
export function interfaceUnits(d: Pick<DisplayInfo, 'width' | 'height'>, uiScale: number): { width: number; height: number } {
  const s = uiScale > 0 ? uiScale : 1;
  return { width: Math.round(d.width / s), height: Math.round(d.height / s) };
}

/** Medium tool buttons (the usual) become small on a small screen. A size you picked (small or large) is kept. */
export function fitToolSize(size: ToolSizePref, compact: boolean): ToolSizePref {
  return compact && size === 'medium' ? 'small' : size;
}

/** How many buttons across the rail starts with on a small screen, so every group is a row or two and the rail does not scroll. */
export const COMPACT_ACROSS = 4;

/** The rail's starting width on a small screen: four buttons across. A width you pulled to yourself is kept (see `fitRailSaved`). */
export const compactRailWidth = (s: RailSizes): number => s.tool * COMPACT_ACROSS + s.gap * (COMPACT_ACROSS - 1) + s.pad;

/** The rail width saved for the workspace, or on a small screen the compact starting width when none is saved. */
export function fitRailSaved(saved: number | undefined, sizes: RailSizes, compact: boolean): number | undefined {
  return saved === undefined && compact ? compactRailWidth(sizes) : saved;
}

/** The sizes the built-in workspaces start their panels at (src/ui/dock.ts), the only ones that give way on a small screen. */
export const STARTING_SIZES: Record<DockZone, number[]> = { left: [260, 280], right: [316, 264], bottom: [230, 260, 330], top: [160] };
const COMPACT_SHARE: Record<DockZone, number> = { left: 0.9, right: 0.86, bottom: 0.94, top: 0.9 };

/**
 * The size a zone is shown at. On a small screen a zone still at a size a workspace starts with gets a bit smaller; a size you
 * dragged it to is yours and is kept as it is.
 */
export function fitZoneSize(zone: DockZone, size: number, compact: boolean): number {
  if (!compact || !STARTING_SIZES[zone].includes(size)) return size;
  return Math.max(MIN_SIZE[zone], Math.round(size * COMPACT_SHARE[zone]));
}

// ---------------------------------------------------------------- the choice

const choiceId = (key: string): string => `ui.screenFit.${key}`;

/** Quill's words for the screen's choice. */
export function fitWords(units: { width: number; height: number }): { title: string; question: string; did: string } {
  const size = `${units.width} x ${units.height}`;
  return {
    title: `Tight layout on the ${size} screen`,
    question: `This screen is on the small side (${size}). Shall I tighten Frameling up a little, with smaller tool buttons and slimmer panels, so your drawing gets the room?`,
    did: 'This screen is on the small side, so Frameling is tightened up to give your drawing the room.',
  };
}

const registered = new Set<string>();

function registerFit(key: string, units: { width: number; height: number }): string {
  const id = choiceId(key);
  if (registered.has(id)) return id;
  registered.add(id);
  const w = fitWords(units);
  registerChoice<'tight' | 'roomy'>({
    id,
    title: w.title,
    question: w.question,
    category: 'Interface size',
    quill: true,
    default: 'tight',
    dismiss: 'tight',
    help: 'small-screens',
    options: [
      { value: 'tight', label: 'Yes, tighten up', detail: 'Smaller tool buttons, slimmer panels and bars. Your own sizes are left alone, and a bigger screen gets the roomy layout back.', did: w.did },
      { value: 'roomy', label: 'No, keep it roomy', detail: 'The usual layout, even if it is a squeeze here.', did: 'Kept the roomy layout for this screen.' },
    ],
  });
  return id;
}

// ---------------------------------------------------------------- the live state

interface Fit {
  /** The screen is small (see `isSmallScreen`). */
  small: boolean;
  /** The choice for this screen, '' while it is not small. */
  id: string;
}
let fit: Fit = { small: false, id: '' };
let compact = false;
const listeners = new Set<() => void>();

/** True while the interface is tightened for a small screen: the screen is small and its answer is not "keep it roomy". */
export const isCompact = (): boolean => compact;

function recompute(): void {
  const next = fit.small && currentChoice(fit.id) !== 'roomy';
  if (next === compact) return;
  compact = next;
  if (typeof document !== 'undefined') {
    if (compact) document.documentElement.dataset.fit = 'compact';
    else delete document.documentElement.dataset.fit;
  }
  for (const fn of [...listeners]) fn();
}

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** React: true while the interface is tightened for a small screen. */
export const useCompact = (): boolean => useSyncExternalStore(subscribe, isCompact);

/** The screen the app last looked at, for the palette command and for a size change. */
let lastDisplay: DisplayInfo | null = null;

/**
 * Looks at a screen: works out whether it is small, registers its choice, and (the first time) says so in a toast with a
 * Change button. `quiet` leaves the toast out. `provisional` is the page's own first guess before the computer has said which
 * screen it is: it tightens up at once (so nothing jumps later) but has no choice of its own yet.
 */
export function considerFit(d: DisplayInfo, o: { quiet?: boolean; provisional?: boolean } = {}): void {
  lastDisplay = d;
  const units = interfaceUnits(d, getPrefs().uiScale);
  if (!isSmallScreen(units)) {
    fit = { small: false, id: '' };
    recompute();
    return;
  }
  if (o.provisional) {
    fit = { small: true, id: '' };
    recompute();
    return;
  }
  const id = registerFit(screenKey(d), units);
  fit = { small: true, id };
  recompute();
  if (!o.quiet) withChoice<'tight' | 'roomy'>(id, () => undefined, { gently: { undo: () => undefined } });
}

/** The palette command: tighten up or relax for this screen, whichever it is not now. */
export function toggleFit(): void {
  const d = lastDisplay;
  if (!d || !isSmallScreen(interfaceUnits(d, getPrefs().uiScale))) {
    toast('This screen is roomy already, so there is nothing to tighten.');
    return;
  }
  const id = registerFit(screenKey(d), interfaceUnits(d, getPrefs().uiScale));
  const wasCompact = isCompact();
  fit = { small: true, id };
  setChoice(id, wasCompact ? 'roomy' : 'tight');
  recompute();
  toast(wasCompact ? 'Back to the roomy layout.' : 'Tightened up for this screen.');
}

let started = false;

/**
 * Starts the watching: a first guess at once from what the page can see, the real look a little after Frameling opens
 * (when Quill's hello is done), and a new look whenever the window lands on another screen or the interface size changes.
 */
export function startFitWatch(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const guess = browserDisplay();
  if (guess) considerFit(guess, { provisional: true });
  let scale = getPrefs().uiScale;
  subscribePrefs(() => {
    const now = getPrefs().uiScale;
    if (now === scale) return;
    scale = now;
    if (lastDisplay) considerFit(lastDisplay, { quiet: true, provisional: !fit.id });
  });
  onChoiceChange((id) => {
    if (id === fit.id) recompute();
  });
  const first = async (tries: number) => {
    if (!getPrefs().onboarded || anyOverlayOpen()) {
      if (tries < 40) setTimeout(() => void first(tries + 1), 3000);
      return;
    }
    const d = await currentDisplay();
    if (d) considerFit(d);
  };
  setTimeout(() => void first(0), 2500);
  const api = (window as { frameling?: { app?: { onDisplayChanged?: (h: (d: DisplayInfo) => void) => () => void } } }).frameling;
  api?.app?.onDisplayChanged?.((d) => considerFit(d));
}

/** For tests: forget what was seen. */
export function _resetFitForTests(): void {
  fit = { small: false, id: '' };
  compact = false;
  lastDisplay = null;
  registered.clear();
  started = false;
}

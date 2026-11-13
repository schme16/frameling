/**
 * Quill offers a better interface size for the screen Frameling is on, and again when the window is dragged onto a
 * different screen. The answer is remembered per screen (the choices system), so moving back and forth asks nothing.
 *
 * Electron reports each screen's size in its own units, after the computer's own scaling. A 4k tablet panel left at 100%
 * shows 3840 x 2160 of them, so the interface looks tiny; the same panel set to 200% shows 1920 x 1080 and needs
 * nothing from us. So the size we suggest comes from how many units the screen holds, not its raw pixels.
 */
import { choose, registerChoice, rememberedChoice, setChoice } from '../core/choices';
import type { DisplayInfo } from '../preload/api';
import { getPrefs, setPrefs, UI_SCALE_RANGE } from './prefs';
import { anyOverlayOpen } from './overlays';
import { toast } from './toast';

export type { DisplayInfo };

/** A screen is "dense" when its short side holds at least this many units. A 1440p monitor (1440) is not. */
export const DENSE_SHORT_SIDE = 1800;
/** What a comfortable screen holds across and down, in units. The interface is sized to feel like this. */
const COMFY = { width: 1920, height: 1080 };
/** The smallest layout (in units, after the interface size) the window should still have room for. */
const MIN_LAYOUT = { width: 1100, height: 700 };
/** A difference smaller than this is not worth a question. */
export const WORTH_ASKING = 0.1;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A stable name for one screen: its id, size and scale, so the same panel on the same setting is the same screen. */
export function screenKey(d: Pick<DisplayInfo, 'id' | 'width' | 'height' | 'scaleFactor'>): string {
  return `${d.id}-${d.width}x${d.height}@${Math.round(d.scaleFactor * 100) / 100}`;
}

/** The screen's size in real pixels, for words like "3840 x 2160". */
export function screenPixels(d: Pick<DisplayInfo, 'width' | 'height' | 'scaleFactor'>): { width: number; height: number } {
  return { width: Math.round(d.width * d.scaleFactor), height: Math.round(d.height * d.scaleFactor) };
}

/**
 * The interface size this screen wants, on the slider's scale (75% to 200%, in steps of 25% that the slider can land
 * on). 1 for an ordinary screen. Never so big the window can't hold a usable layout.
 */
export function suggestUiScale(d: Pick<DisplayInfo, 'width' | 'height' | 'workWidth' | 'workHeight'>): number {
  const short = Math.min(d.width, d.height);
  if (!(short >= DENSE_SHORT_SIDE)) return 1;
  // How many times a comfortable screen this one holds, then three quarters of the way to matching it.
  const ratio = Math.min(d.width / COMFY.width, d.height / COMFY.height);
  const want = 1 + (ratio - 1) * 0.75;
  // The window can't be bigger than the usable part of the screen: keep room for a real layout inside it.
  const room = Math.min(d.workWidth / MIN_LAYOUT.width, d.workHeight / MIN_LAYOUT.height);
  let stepped = Math.round(want * 4) / 4;
  if (stepped > room) stepped = Math.floor(room * 4) / 4;
  return clamp(stepped, 1, UI_SCALE_RANGE.max);
}

export type ScreenAction = { kind: 'none' } | { kind: 'keep' } | { kind: 'ask'; wanted: number } | { kind: 'apply'; wanted: number };

/**
 * What to do about a screen. `remembered` is the answer already given for this screen ('yes' or 'no'). `atStart` is the
 * check made when Frameling opens: a size the person set themselves is left alone then, but on arriving at a new
 * screen Quill still offers.
 */
export function screenAction(o: { wanted: number; current: number; remembered?: string; atStart: boolean }): ScreenAction {
  if (Math.abs(o.wanted - o.current) < WORTH_ASKING) return { kind: 'none' };
  if (o.remembered === 'no') return { kind: 'none' };
  // They said yes to this size here before: back on this screen it comes back (but never on top of a size set since).
  if (o.remembered === 'yes') return o.atStart ? { kind: 'none' } : { kind: 'apply', wanted: o.wanted };
  // A size they set by hand before Quill ever looked here is their answer: record it, don't ask.
  if (o.atStart && o.current !== 1) return { kind: 'keep' };
  return { kind: 'ask', wanted: o.wanted };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const choiceId = (d: DisplayInfo) => `ui.screenSize.${screenKey(d)}`;

/** Quill's words for the offer: which way it goes, and the numbers. */
export function offerWords(d: DisplayInfo, wanted: number, current: number): { title: string; question: string; yes: string; yesDetail: string; no: string; noDetail: string } {
  const px = screenPixels(d);
  const size = `${px.width} x ${px.height}`;
  const bigger = wanted > current;
  return {
    title: `Interface size on the ${size} screen`,
    question: bigger
      ? `Ooh, a big, sharp screen! Everything looks quite small on it. Shall I draw Frameling at ${pct(wanted)}?`
      : `This screen doesn't need everything drawn at ${pct(current)}. Shall I use ${pct(wanted)} here?`,
    yes: `Yes, use ${pct(wanted)}`,
    yesDetail: `Menus, panels and the timeline are drawn at ${pct(wanted)}, and it comes back whenever Frameling is on this screen.`,
    no: 'No thanks',
    noDetail: `Keep it at ${pct(current)}. The slider in Preferences, General changes it any time.`,
  };
}

function registerOffer(d: DisplayInfo, wanted: number, current: number): string {
  const id = choiceId(d);
  const w = offerWords(d, wanted, current);
  registerChoice<'yes' | 'no'>({
    id,
    title: w.title,
    question: w.question,
    category: 'Interface size',
    quill: true,
    default: 'no',
    dismiss: 'no',
    highlight: 'yes',
    help: 'interface-size',
    options: [
      { value: 'yes', label: w.yes, detail: w.yesDetail },
      { value: 'no', label: w.no, detail: w.noDetail },
    ],
  });
  return id;
}

let started = false;
let lastKey = '';

function setScale(n: number): void {
  setPrefs({ uiScale: clamp(n, UI_SCALE_RANGE.min, UI_SCALE_RANGE.max) });
}

/** Looks at a screen and does what `screenAction` says. `force` ignores what was answered before (the palette command). */
export async function considerScreen(d: DisplayInfo, o: { atStart?: boolean; force?: boolean } = {}): Promise<void> {
  const wanted = suggestUiScale(d);
  const current = getPrefs().uiScale;
  const id = choiceId(d);
  if (o.force) setChoice(id, undefined);
  const remembered = rememberedChoice(id);
  const action = screenAction({ wanted, current, remembered, atStart: !!o.atStart });
  if (action.kind === 'keep') {
    registerOffer(d, wanted, current);
    setChoice(id, 'no');
    return;
  }
  if (action.kind === 'none') {
    if (o.force) toast(`This screen is already at a good size (${pct(current)}). You can change it on the slider in Preferences, General.`);
    return;
  }
  if (action.kind === 'apply') {
    setScale(action.wanted);
    toast(`Welcome back: the interface is at ${pct(action.wanted)} again for this screen.`);
    return;
  }
  // Something else is open (a dialog, the welcome sheet): the next screen change or a restart asks again.
  if (!o.force && anyOverlayOpen()) return;
  registerOffer(d, action.wanted, current);
  const answer = await choose<'yes' | 'no'>(id);
  if (answer === 'yes') setScale(action.wanted);
}

/** What the page can see of its own screen when there is no desktop shell (a browser tab). */
function browserDisplay(): DisplayInfo | null {
  if (typeof window === 'undefined' || !window.screen) return null;
  const s = window.screen;
  return {
    id: 0,
    width: s.width,
    height: s.height,
    scaleFactor: 1,
    workWidth: s.availWidth || s.width,
    workHeight: s.availHeight || s.height,
    windowWidth: window.outerWidth,
    windowHeight: window.outerHeight,
  };
}

async function currentDisplay(): Promise<DisplayInfo | null> {
  const api = (window as { frameling?: { app?: { getDisplay?: () => Promise<DisplayInfo | null> } } }).frameling;
  try {
    if (api?.app?.getDisplay) return await api.app.getDisplay();
  } catch {
    // Fall through to what the page can see.
  }
  return browserDisplay();
}

/** The palette command: Quill looks at this screen again, whatever was said before. */
export async function suggestForThisScreen(): Promise<void> {
  const d = await currentDisplay();
  if (d) await considerScreen(d, { force: true });
}

/**
 * Starts the checks: once a little after Frameling opens (when the first-run hello has finished), and whenever the
 * window lands on another screen. Safe to call more than once.
 */
export function startScreenWatch(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const first = async (tries: number) => {
    // Quill's first-run hello comes first; ask once it's done and nothing is open.
    if (!getPrefs().onboarded || anyOverlayOpen()) {
      if (tries < 40) setTimeout(() => void first(tries + 1), 3000);
      return;
    }
    const d = await currentDisplay();
    if (!d) return;
    lastKey = screenKey(d);
    await considerScreen(d, { atStart: true });
  };
  setTimeout(() => void first(0), 2500);
  const api = (window as { frameling?: { app?: { onDisplayChanged?: (h: (d: DisplayInfo) => void) => () => void } } }).frameling;
  api?.app?.onDisplayChanged?.((d) => {
    const key = screenKey(d);
    if (key === lastKey) return;
    lastKey = key;
    void considerScreen(d);
  });
}

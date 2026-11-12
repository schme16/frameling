// What a press with a pen means: the tip, the eraser end, or one of the two buttons on the barrel. Pure, so the canvas
// and the tests read presses the same way.

/** What a barrel button does while it is held. */
export type BarrelAction = 'none' | 'eyedropper' | 'pan' | 'eraser' | 'back';

export const BARREL_ACTIONS: { id: BarrelAction; label: string }[] = [
  { id: 'eyedropper', label: 'Pick a colour' },
  { id: 'pan', label: 'Move the page' },
  { id: 'eraser', label: 'Erase' },
  { id: 'back', label: 'Paint with Back colour' },
  { id: 'none', label: 'Nothing' },
];

export interface PressLike {
  pointerType: string;
  /** The button that changed (0 tip, 1 middle, 2 right or the first barrel button, 5 eraser). */
  button: number;
  /** Every button down now (1 tip, 2 first barrel button, 4 second barrel button, 32 eraser). */
  buttons: number;
}

/**
 * How this system hands a pen's buttons to the page. The standard says the barrel button is bit 2 and a second one is bit
 * 4. On Linux (X11 and Wayland, seen with libinput tablets) the button nearest the tip arrives as bit 4 (a middle click)
 * and the other as bit 2 (a right click), so there the two are swapped back. Windows and macOS follow the standard.
 */
export interface PenHost {
  swapBarrels: boolean;
}

let host: PenHost = { swapBarrels: false };
export const setPenHost = (h: Partial<PenHost>): void => void (host = { ...host, ...h });
export const getPenHost = (): PenHost => host;

/** True for Chromium on a Linux desktop (not Android), from the platform name or, with no shell, the user agent. */
export function isLinuxDesktop(platform: string | undefined, userAgent: string): boolean {
  if (platform) return platform === 'linux';
  return /Linux|X11/.test(userAgent) && !/Android/.test(userAgent);
}

/** The pen buttons' raw bits (2 and 4) that a press carries: the buttons held, plus the one that made the event. */
export function barrelBits(e: Pick<PressLike, 'button' | 'buttons'>): number {
  return ((e.button === 2 ? 2 : 0) | (e.buttons & 2)) | ((e.button === 1 ? 4 : 0) | (e.buttons & 4));
}

export interface PenPress {
  /** The eraser end of the pen. */
  eraser: boolean;
  /** The barrel button nearest the tip (Wacom's "right click"), and the other one (the "middle click"). */
  barrel1: boolean;
  barrel2: boolean;
}

/**
 * Which parts of a pen are down. A barrel button held while the tip touches counts, as does one that made the press.
 * `eraser` says the eraser end was worked out another way (see tool.ts) when no eraser bit came.
 */
export function penPress(e: PressLike, extra: { eraser?: boolean; swapBarrels?: boolean } = {}): PenPress {
  if (e.pointerType !== 'pen') return { eraser: false, barrel1: false, barrel2: false };
  const bits = barrelBits(e);
  const swap = extra.swapBarrels ?? host.swapBarrels;
  const first = swap ? 4 : 2;
  return {
    eraser: e.button === 5 || (e.buttons & 32) !== 0 || !!extra.eraser,
    barrel1: (bits & first) !== 0,
    barrel2: (bits & (6 - first)) !== 0,
  };
}

export interface PenButtonSettings {
  eraserEnd: boolean;
  barrel1: BarrelAction;
  barrel2: BarrelAction;
}

/** What a pen press does: draw with the tool (or erase), pick a colour, pan, or paint with Back. */
export interface PressMeaning {
  /** The button as the canvas should read it: 0 to draw, 1 to pan, 2 to paint with Back. */
  button: 0 | 1 | 2;
  /** Use the eraser for this press and go back to the tool afterwards. */
  eraser: boolean;
  /** Pick a colour instead of drawing. */
  pick: boolean;
}

export function meaningOfPress(e: PressLike, s: PenButtonSettings, extra: { eraser?: boolean } = {}): PressMeaning {
  const press = penPress(e, extra);
  const draw: PressMeaning = { button: 0, eraser: false, pick: false };
  if (press.eraser) return s.eraserEnd ? { ...draw, eraser: true } : draw;
  const action = press.barrel1 ? s.barrel1 : press.barrel2 ? s.barrel2 : 'none';
  switch (action) {
    case 'pan':
      return { ...draw, button: 1 };
    case 'back':
      return { ...draw, button: 2 };
    case 'eraser':
      return { ...draw, eraser: true };
    case 'eyedropper':
      return { ...draw, pick: true };
    default:
      return draw;
  }
}

// The capture view: the second window dressed for a streaming program (OBS and the like) that captures it as a plain
// window. Nothing in this file touches the DOM or Electron, so the desktop side, the page and the tests all share it.

/** What the window is called. A fixed name on purpose: a title with the drawing's name or path in it would show in the window list of any capture program, and on stream. */
export const CAPTURE_TITLE = 'Frameling capture';

/** The title of the plain second window. The capture view never uses the drawing's name. */
export function windowTitle(capture: boolean, drawingName: string): string {
  return capture ? CAPTURE_TITLE : `${drawingName} - second window`;
}

export interface CaptureSize {
  /** The remembered answer: `free`, or `<width>x<height>`. */
  id: string;
  width: number;
  height: number;
  /** Plain words, then the usual name. */
  label: string;
}

/** The sizes streamers ask for, in pixels. */
export const CAPTURE_SIZES: CaptureSize[] = [
  { id: '1920x1080', width: 1920, height: 1080, label: '1920 x 1080 (full HD)' },
  { id: '1280x720', width: 1280, height: 720, label: '1280 x 720 (HD)' },
  { id: '2560x1440', width: 2560, height: 1440, label: '2560 x 1440 (QHD)' },
  { id: '3840x2160', width: 3840, height: 2160, label: '3840 x 2160 (4K)' },
  { id: '1080x1080', width: 1080, height: 1080, label: '1080 x 1080 (1:1)' },
  { id: '1080x1920', width: 1080, height: 1920, label: '1080 x 1920 (tall, for phones)' },
];

export type CaptureSizeChoice = 'free' | '1920x1080' | '1280x720' | '2560x1440' | '3840x2160' | '1080x1080' | '1080x1920';

export interface PixelSize {
  width: number;
  height: number;
}

/** The size a remembered answer means, or null for "free" (drag the window to any size) and for anything unknown. */
export function sizeOf(choice: string): PixelSize | null {
  const s = CAPTURE_SIZES.find((x) => x.id === choice);
  return s ? { width: s.width, height: s.height } : null;
}

/** A size sent from a page: whole numbers inside what a window can sensibly be, or null. */
export function readSize(raw: unknown): PixelSize | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { width, height } = raw as Record<string, unknown>;
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 240 && v <= 8192;
  return ok(width) && ok(height) ? { width: Math.round(width), height: Math.round(height) } : null;
}

/**
 * A window is sized in device-independent units, so a size in real pixels is divided by the screen's scale (a screen
 * set to 200% needs half the units for the same pixels). Never smaller than 1.
 */
export function windowUnits(size: PixelSize, scale: number): PixelSize {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return { width: Math.max(1, Math.round(size.width / s)), height: Math.max(1, Math.round(size.height / s)) };
}

export type BackgroundChoice = 'green' | 'blue' | 'magenta' | 'dark' | 'black' | 'white';

/** The colours behind the drawing. The first three are for keying out (Chroma Key in OBS); pick the one your drawing does not use. */
export const BACKGROUNDS: Record<BackgroundChoice, string> = {
  green: '#00b140',
  blue: '#0047bb',
  magenta: '#ff00ff',
  dark: '#121019',
  black: '#000000',
  white: '#ffffff',
};

export const FALLBACK_BACKGROUND = BACKGROUNDS.green;

/** Is this a plain #rrggbb colour? Anything else is not trusted as a colour on the page. */
export const isHexColour = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** The colour a remembered answer means. An unknown answer gives the key green rather than nothing. */
export function backgroundColour(choice: string): string {
  return (BACKGROUNDS as Record<string, string>)[choice] ?? FALLBACK_BACKGROUND;
}

/** A colour sent from a page, or the fallback when it is not a plain #rrggbb. */
export function safeBackground(raw: unknown, fallback = FALLBACK_BACKGROUND): string {
  return isHexColour(raw) ? raw.toLowerCase() : fallback;
}

/** How the capture view looks, as the drawing window tells the page. */
export interface CaptureLook {
  /** The colour behind (and, where the page is see-through, in) the drawing. */
  bg: string;
  hideCursor: boolean;
}

export function sameCapture(a: CaptureLook | null | undefined, b: CaptureLook | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.bg === b.bg && a.hideCursor === b.hideCursor;
}

/** What the desktop side is asked to open. */
export interface OpenOpts {
  capture: boolean;
  /** Capture view only: a fixed size in pixels, or null to let the window be dragged to any size. */
  size: PixelSize | null;
  /** Capture view only: the colour the window starts with, so there is no flash of another colour. */
  background: string;
}

export const SECOND_WINDOW: OpenOpts = { capture: false, size: null, background: BACKGROUNDS.dark };

/** What was asked, cleaned: anything missing or odd means the plain second window. */
export function readOpen(raw: unknown): OpenOpts {
  if (typeof raw !== 'object' || raw === null) return { ...SECOND_WINDOW };
  const r = raw as Record<string, unknown>;
  if (r.capture !== true) return { ...SECOND_WINDOW };
  return { capture: true, size: readSize(r.size), background: safeBackground(r.background) };
}

export const sameOpen = (a: OpenOpts, b: OpenOpts): boolean =>
  a.capture === b.capture && a.size?.width === b.size?.width && a.size?.height === b.size?.height;

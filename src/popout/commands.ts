// The commands for the picture window.
import { registerCommands } from '../core/registry';
import { askAgain, currentChoice, onChoiceChange, setChoice, withChoice } from '../core/choices';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { isCaptureOpen, isPopoutOpen, subscribePopout } from './link';
import { backgroundColour, CAPTURE_SIZES, sizeOf, type CaptureSizeChoice } from './capture';
import type { CaptureCursorChoice } from './choices';
import { pageOf } from './show';
import { cameraLayerOf } from '../core/camera';

const HELP = 'canvas-popout';
const bridge = () => window.frameling?.popout;

// A menu tick is read from the command, so tell the menus when the window comes or goes.
subscribePopout(() => store().setUi({}));

const ask = <V extends string>(id: string, matters: boolean) => new Promise<V>((res) => withChoice<V>(id, res, { matters }));

/** The two questions about what to show (the camera, and marks): asked once, and only when the drawing has them. */
async function askWhatToShow(): Promise<void> {
  const { doc } = store().get();
  await ask('popout.camera', !!cameraLayerOf(pageOf(doc))?.visible);
  await ask('popout.marks', !!doc.marks?.length);
}

const noDesktop = () => toast('The second window needs the Frameling desktop app.', { kind: 'info' });

/** Opens the second window (asking the two questions the first time, if they matter), or brings it forward. */
export async function openPopout(): Promise<void> {
  const api = bridge();
  if (!api) {
    noDesktop();
    return;
  }
  await askWhatToShow();
  await api.open();
}

/** What the capture view is opened with: the size and colour that were chosen. */
const captureRequest = () => ({
  capture: true,
  size: sizeOf(currentChoice<CaptureSizeChoice>('popout.captureSize')),
  background: backgroundColour(currentChoice('popout.captureBackground')),
});

/** Opens the capture view (the first time, asking what colour to put behind the drawing), or brings it forward. */
export async function openCapture(): Promise<void> {
  const api = bridge();
  if (!api) {
    noDesktop();
    return;
  }
  await ask('popout.captureBackground', true);
  await askWhatToShow();
  await api.open(captureRequest());
}

/** Brings whichever window is open forward. */
async function bringForward(): Promise<void> {
  if (isCaptureOpen()) await bridge()?.open(captureRequest());
  else await openPopout();
}

// A new size chosen in Preferences or a command reaches a capture view that is already open.
onChoiceChange((id) => {
  if (id === 'popout.captureSize' && isCaptureOpen()) void bridge()?.open(captureRequest());
});

export async function closePopout(): Promise<void> {
  await bridge()?.close();
}

registerCommands([
  {
    id: 'popout.toggle',
    label: 'Second window',
    category: 'View',
    keys: ['Mod+Alt+P'],
    description: 'Shows your drawing big in a window of its own, to put on a second screen. It follows what you draw and plays along when you play. You cannot draw in it, so nothing there can change your drawing.',
    help: HELP,
    keywords: ['second window', 'second screen', 'second monitor', 'extra screen', 'preview', 'pop out', 'popout', 'picture window', 'tablet', 'mirror', 'external display', 'big picture', 'presentation'],
    checked: () => isPopoutOpen() && !isCaptureOpen(),
    enabled: () => !!bridge(),
    run: () => void (isPopoutOpen() && !isCaptureOpen() ? closePopout() : openPopout()),
  },
  {
    id: 'popout.front',
    label: 'Bring the second window forward',
    category: 'View',
    description: 'Puts the second window on top, if it has got lost behind other windows.',
    help: HELP,
    keywords: ['second window', 'find', 'lost', 'forward', 'focus', 'popout'],
    enabled: () => isPopoutOpen(),
    run: () => void bringForward(),
  },
]);

// ---- The capture view: the same window, with nothing on it but the drawing, for a streaming program to capture.
const CAPTURE_HELP = 'stream-capture';
const needsDesktop = () => (bridge() ? undefined : 'The capture view needs the desktop app.');

registerCommands([
  {
    id: 'capture.toggle',
    label: 'Capture view',
    category: 'View',
    keys: ['Mod+Alt+Shift+P'],
    description: 'Shows your drawing alone in a window with no title bar, on a flat colour, for OBS or another streaming program to capture. The window never shows the drawing\'s name. Like the second window, it only watches.',
    help: CAPTURE_HELP,
    keywords: ['capture view', 'obs', 'stream', 'streaming', 'streamer', 'twitch', 'youtube', 'window capture', 'chroma key', 'green screen', 'clean view', 'broadcast', 'no interface', 'overlay', 'record', 'screen share'],
    checked: () => isCaptureOpen(),
    enabled: () => !!bridge(),
    reason: needsDesktop,
    run: () => void (isCaptureOpen() ? closePopout() : openCapture()),
  },
  {
    id: 'capture.background',
    label: 'Capture view background colour',
    category: 'View',
    description: 'Pick the flat colour behind your drawing in the capture view: a key green, blue or magenta to key out in OBS, or a plain dark, black or white.',
    help: CAPTURE_HELP,
    keywords: ['capture view', 'background', 'colour', 'color', 'chroma key', 'green screen', 'key colour', 'obs', 'stream'],
    run: () => {
      void askAgain('popout.captureBackground', currentChoice('popout.captureBackground')).then((r) => r && setChoice('popout.captureBackground', r.value));
    },
  },
  {
    id: 'capture.cursor',
    label: 'Hide the mouse pointer over the capture view',
    category: 'View',
    description: 'Keeps the mouse pointer from showing over the picture in the capture view.',
    help: CAPTURE_HELP,
    keywords: ['capture view', 'cursor', 'mouse pointer', 'hide cursor', 'obs', 'stream'],
    checked: () => currentChoice<CaptureCursorChoice>('popout.captureCursor') === 'hide',
    run: () => setChoice('popout.captureCursor', currentChoice<CaptureCursorChoice>('popout.captureCursor') === 'hide' ? 'show' : 'hide'),
  },
  ...[{ id: 'free', label: 'any size you drag it to' }, ...CAPTURE_SIZES].map((s) => ({
    id: `capture.size.${s.id}`,
    label: `Capture view size: ${s.label}`,
    category: 'View',
    description: s.id === 'free' ? 'Lets you drag the capture view to any size.' : `Makes the capture view exactly ${s.label.replace(/ \(.*/, '')} pixels, and keeps it that size, so a streaming program always sees the same picture.`,
    help: CAPTURE_HELP,
    keywords: ['capture view', 'size', 'resolution', 'obs', 'stream', 'fixed size', '1080p', '720p', '1440p', '4k'],
    checked: () => currentChoice('popout.captureSize') === s.id,
    run: () => setChoice('popout.captureSize', s.id),
  })),
]);

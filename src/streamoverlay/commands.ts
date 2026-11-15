import type { Command } from '../core/registry';
import { desktop } from '../io/desktop';
import { ask } from '../platform/ask';
import { openPrefs } from '../ui/overlays';
import { toast } from '../ui/toast';
import { copyOverlayUrl } from './copy';
import { overlayReady } from './state';
import { startOverlayTest } from './sources';

const hasOverlay = () => !!desktop()?.overlay;
const common = { category: 'Audience', help: 'stream-overlay', global: true } as const;
const KEYS = ['obs', 'overlay', 'browser source', 'stream', 'streaming', 'transparent', 'quill', 'dare', 'prompt', 'vote', 'viewers', 'audience', 'twitch', 'youtube'];

/** Makes a new overlay address, after saying what it breaks. Returns whether it did. */
export async function rollOverlay(): Promise<boolean> {
  const o = desktop()?.overlay;
  if (!o) return false;
  const a = await ask({
    id: 'streamoverlay.roll',
    title: 'Make a new overlay address?',
    message: 'The old address stops working at once. In OBS, open the browser source and paste in the new one.',
    buttons: [
      { value: 'roll', label: 'Make a new address', primary: true },
      { value: 'keep', label: 'Keep the old one' },
    ],
    cancel: 'keep',
  });
  if (a !== 'roll') return false;
  await o.roll();
  toast('Made a new overlay address. Copy it with Copy the stream overlay address.', { kind: 'success' });
  return true;
}

export const streamOverlayCommands: Command[] = [
  {
    id: 'streamoverlay.settings',
    label: 'Stream overlay settings',
    description: 'The address to paste into OBS as a browser source, and how to add it. The overlay shows Quill, dares and prompts to your viewers, with nothing else.',
    keywords: [...KEYS, 'settings', 'url', 'address', 'add', 'setup'],
    ...common,
    run: () => openPrefs('features'),
  },
  {
    id: 'streamoverlay.copyAddress',
    label: 'Copy the stream overlay address',
    description: 'Copies the address you paste into OBS as a browser source. It stays hidden on screen. It is only there while audience features are on.',
    keywords: [...KEYS, 'copy', 'url', 'address', 'link', 'paste'],
    ...common,
    enabled: () => hasOverlay() && overlayReady.get(),
    reason: () => (hasOverlay() ? 'Switch audience features on first (Preferences > Features).' : 'The stream overlay needs the desktop app.'),
    run: () => void copyOverlayUrl(),
  },
  {
    id: 'streamoverlay.test',
    label: 'Show a test on the stream overlay',
    description: 'Puts a made-up Quill, banner and prompt on the overlay for a few seconds, so you can check OBS is showing it. Nothing from your audience is used.',
    keywords: [...KEYS, 'test', 'check', 'try', 'preview', 'working'],
    ...common,
    enabled: () => hasOverlay() && overlayReady.get(),
    reason: () => (hasOverlay() ? 'Switch audience features on first (Preferences > Features).' : 'The stream overlay needs the desktop app.'),
    run: () => startOverlayTest(),
  },
  {
    id: 'streamoverlay.roll',
    label: 'Make a new stream overlay address',
    description: 'Changes the address. Use it if the old one was seen on a stream. The browser source in OBS needs the new one pasted in.',
    keywords: [...KEYS, 'roll', 'new', 'regenerate', 'reset', 'leaked', 'seen on stream', 'change', 'rotate', 'token'],
    ...common,
    enabled: hasOverlay,
    reason: () => 'The stream overlay needs the desktop app.',
    run: () => void rollOverlay(),
  },
];

export const streamOverlayMenuItems = ['streamoverlay.settings', 'streamoverlay.copyAddress', 'streamoverlay.test', 'streamoverlay.roll'];

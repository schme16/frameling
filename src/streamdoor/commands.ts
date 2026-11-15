import type { Command } from '../core/registry';
import { desktop } from '../io/desktop';
import { ask } from '../platform/ask';
import { openPrefs } from '../ui/overlays';
import { toast } from '../ui/toast';
import { copyAddress, copyKey } from './copy';
import { doorStatus } from './state';

/** Makes a new key, after saying what it breaks. Returns whether it did. */
export async function rollKey(): Promise<boolean> {
  const d = desktop()?.door;
  if (!d) return false;
  const a = await ask({
    id: 'streamdoor.roll',
    title: 'Make a new key?',
    message: 'The old key stops working at once. Every stream tool you set up needs the new one pasted in.',
    buttons: [
      { value: 'roll', label: 'Make a new key', primary: true },
      { value: 'keep', label: 'Keep the old one' },
    ],
    cancel: 'keep',
  });
  if (a !== 'roll') return false;
  await d.roll();
  toast('Made a new key. Copy it from Preferences > Streaming, or with Copy the actions door key.', { kind: 'success' });
  return true;
}

const hasDoor = () => !!desktop()?.door;

export const streamDoorCommands: Command[] = [
  {
    id: 'streamdoor.settings',
    label: 'Actions door settings',
    category: 'Audience',
    description: 'The address and key your stream tool needs, and the list of things it can ask Frameling to do.',
    help: 'actions-door',
    keywords: ['streamer.bot', 'streamerbot', 'firebot', 'stream deck', 'http', 'endpoint', 'api', 'token', 'key', 'port', 'address', 'channel points', 'redeem', 'obs', 'local'],
    global: true,
    run: () => openPrefs('streaming'),
  },
  {
    id: 'streamdoor.copyAddress',
    label: 'Copy the actions door address',
    category: 'Audience',
    description: 'Copies the address your stream tool calls. It is only there while audience features are on.',
    help: 'actions-door',
    keywords: ['streamer.bot', 'firebot', 'stream deck', 'url', 'address', 'port', 'copy', 'http', 'local'],
    global: true,
    enabled: () => hasDoor() && doorStatus.get().running,
    reason: () => (hasDoor() ? 'Switch audience features on first (Preferences > Streaming).' : 'The actions door needs the desktop app.'),
    run: () => void copyAddress(),
  },
  {
    id: 'streamdoor.copyKey',
    label: 'Copy the actions door key',
    category: 'Audience',
    description: 'Copies the key (the token) your stream tool sends with every request. It never appears on screen.',
    help: 'actions-door',
    keywords: ['token', 'key', 'secret', 'password', 'copy', 'streamer.bot', 'firebot', 'stream deck', 'authorization', 'bearer'],
    global: true,
    enabled: hasDoor,
    reason: () => 'The actions door needs the desktop app.',
    run: () => void copyKey(),
  },
  {
    id: 'streamdoor.roll',
    label: 'Make a new actions door key',
    category: 'Audience',
    description: 'Changes the key. Use it if the old one was seen on a stream. Tools set up with the old key stop working.',
    help: 'actions-door',
    keywords: ['roll', 'new token', 'regenerate', 'reset', 'leaked', 'seen on stream', 'change key', 'rotate', 'token', 'key'],
    global: true,
    enabled: hasDoor,
    reason: () => 'The actions door needs the desktop app.',
    run: () => void rollKey(),
  },
];

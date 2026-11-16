import type { Command } from '../core/registry';
import { openPrefs } from '../ui/overlays';
import { copyRemoteAddress, copyRemoteKey } from './copy';
import { remoteCardOpen } from './card';
import { hasRemote, remoteOn, rollRemoteKey, setRemoteOn } from './switch';

const needsDesktop = () => 'The remote door needs the desktop app.';

export const remoteDoorCommands: Command[] = [
  {
    id: 'remote.toggle',
    label: 'Remote door',
    category: 'Remote door',
    description: 'Let another program on this computer drive Frameling, for testing and automation. Off until you switch it on, and every time Frameling starts. A pill at the top says while it is open.',
    help: 'remote-door',
    keywords: ['remote', 'api', 'http', 'rest', 'automation', 'automate', 'drive', 'control', 'test', 'testing', 'another program', 'curl', 'python', 'script from outside', 'external', 'local server', 'port', 'key', 'token', 'switch'],
    global: true,
    checked: () => remoteOn(),
    enabled: hasRemote,
    reason: needsDesktop,
    run: () => void setRemoteOn(!remoteOn()),
  },
  {
    id: 'remote.log',
    label: 'Show what the remote door has done',
    category: 'Remote door',
    description: 'The list of what other programs drove, and when. Kept only while Frameling is open, and never sent anywhere.',
    help: 'remote-door',
    keywords: ['remote', 'log', 'history', 'what happened', 'driven', 'automation', 'api', 'activity'],
    global: true,
    run: () => (remoteOn() ? remoteCardOpen.set(true) : openPrefs('plugins', undefined, 'What it has done')),
  },
  {
    id: 'remote.settings',
    label: 'Remote door settings',
    category: 'Remote door',
    description: 'The switch, the address, the key and the port for the remote door.',
    help: 'remote-door',
    keywords: ['remote', 'api', 'port', 'address', 'key', 'token', 'automation', 'preferences'],
    global: true,
    run: () => openPrefs('plugins', undefined, 'Remote door'),
  },
  {
    id: 'remote.copyKey',
    label: 'Copy the remote door key',
    category: 'Remote door',
    description: 'Copies the key a program sends with every request. It never appears on screen.',
    help: 'remote-door',
    keywords: ['remote', 'token', 'key', 'secret', 'password', 'copy', 'authorization', 'bearer', 'api'],
    global: true,
    enabled: hasRemote,
    reason: needsDesktop,
    run: () => void copyRemoteKey(),
  },
  {
    id: 'remote.copyAddress',
    label: 'Copy the remote door address',
    category: 'Remote door',
    description: 'Copies the address a program calls. It is only there while the door is open.',
    help: 'remote-door',
    keywords: ['remote', 'url', 'address', 'port', 'copy', 'http', 'localhost', 'api'],
    global: true,
    enabled: () => hasRemote() && remoteOn(),
    reason: () => (hasRemote() ? 'Switch the remote door on first (Preferences > Plugins).' : needsDesktop()),
    run: () => void copyRemoteAddress(),
  },
  {
    id: 'remote.roll',
    label: 'Make a new remote door key',
    category: 'Remote door',
    description: 'Changes the key. Use it if the old one was seen, or leaked. Programs set up with the old key stop working.',
    help: 'remote-door',
    keywords: ['roll', 'new token', 'regenerate', 'reset', 'leaked', 'change key', 'rotate', 'token', 'key', 'remote'],
    global: true,
    enabled: hasRemote,
    reason: needsDesktop,
    run: () => void rollRemoteKey(),
  },
];

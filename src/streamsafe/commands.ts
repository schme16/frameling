import { registerCommands } from '../core/registry';
import { streamSafe } from '../core/streamSafe';
import { setPrefs } from '../ui/prefs';
import { toast } from '../ui/toast';

/** Turns the switch on or off, and says so in words (the badge in the top bar says it all the time). */
export function setStreamSafeMode(on: boolean): void {
  setPrefs({ streamSafe: on });
  toast(on ? "Stream-safe is on. File paths, names and keys show as stand-ins until you turn it off." : 'Stream-safe is off. Everything shows as it really is.', { kind: 'info', quill: null });
}

registerCommands([
  {
    id: 'view.streamSafe',
    label: 'Stream-safe mode on or off',
    category: 'View',
    description: 'Hides file paths, your name and keys behind friendly stand-ins, so you can share your screen or stream without giving anything away. Only what shows changes, never your drawing.',
    help: 'stream-safe',
    keys: ['Mod+Alt+Shift+H'],
    keywords: ['stream', 'streaming', 'streamer', 'twitch', 'share screen', 'screen share', 'present', 'privacy', 'private', 'hide', 'paths', 'name', 'safe', 'recording', 'obs', 'demo'],
    checked: () => streamSafe(),
    run: () => setStreamSafeMode(!streamSafe()),
  },
]);

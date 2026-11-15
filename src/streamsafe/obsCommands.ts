import { registerCommands } from '../core/registry';
import { openPrefs } from '../ui/overlays';
import { getPrefs } from '../ui/prefs';
import { obs, setObsLink } from './obs';

const HELP = 'obs-golive';
const needsDesktop = () => (obs.available ? undefined : 'Going live with OBS needs the desktop app.');
const needsLink = () => (!obs.available ? needsDesktop() : 'Turn on Going live with OBS first.');

registerCommands([
  {
    id: 'stream.obsLink',
    label: 'Going live with OBS on or off',
    category: 'View',
    description: 'Frameling watches OBS on your own computer, and turns Stream-safe on by itself when you start streaming or recording. It asks before turning it off again. Off until you switch it on.',
    help: HELP,
    keys: ['Mod+Alt+Shift+O'],
    keywords: ['obs', 'obs studio', 'websocket', 'stream', 'streaming', 'streamer', 'twitch', 'youtube', 'kick', 'go live', 'going live', 'record', 'recording', 'connect', 'automatic', 'stream-safe', 'broadcast'],
    checked: () => getPrefs().obsLink,
    enabled: () => obs.available,
    reason: needsDesktop,
    run: () => setObsLink(!getPrefs().obsLink),
  },
  {
    id: 'stream.obsLook',
    label: 'Look for OBS now',
    category: 'View',
    description: 'Tries OBS again straight away, instead of waiting for the next quiet try. Handy right after you start OBS or fix its password.',
    help: HELP,
    keywords: ['obs', 'reconnect', 'connect', 'retry', 'try again', 'find obs', 'websocket', 'stream'],
    enabled: () => obs.available && getPrefs().obsLink && obs.state.link !== 'connected' && obs.state.link !== 'connecting',
    reason: needsLink,
    run: () => obs.lookNow(),
  },
  {
    id: 'stream.obsSettings',
    label: 'OBS connection settings',
    category: 'View',
    description: "Opens the Going live with OBS settings: OBS's address, its password, and the switch.",
    help: HELP,
    keywords: ['obs', 'websocket', 'password', 'address', 'port', 'connection', 'stream', 'settings'],
    run: () => openPrefs('general', 'stream.obsLink'),
  },
]);

// Lip sync: guess mouths from a sound, write them on a mouth layer, fix them by hand. Registers its commands, panel and help.
import { lazyPanel } from '../core/lazy';
import { registerPanel } from '../core/registry';
import './commands';
import './help';

registerPanel({ id: 'lipsync', title: 'Lip sync', icon: 'mouth', component: lazyPanel(() => import('./LipSyncPanel').then((m) => m.LipSyncPanel)), zone: 'right', order: 70, help: 'lip-sync' });

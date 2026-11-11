// Lip sync: guess mouths from a sound, write them on a mouth layer, fix them by hand. Registers its commands, panel and help.
import { registerPanel } from '../core/registry';
import './commands';
import './help';
import { LipSyncPanel } from './LipSyncPanel';

registerPanel({ id: 'lipsync', title: 'Lip sync', icon: 'mouth', component: LipSyncPanel, zone: 'right', order: 70, help: 'lip-sync' });

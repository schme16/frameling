// Effects: blend modes, the effects stack, clipping, masks and layer folders, and the Effects panel.
import { registerPanel } from '../core/registry';
import './commands';
import './help';
import './debug';
import { EffectsPanel } from './EffectsPanel';

registerPanel({ id: 'effects', title: 'Effects', icon: 'effects', component: EffectsPanel, zone: 'right', order: 35, help: 'effects' });

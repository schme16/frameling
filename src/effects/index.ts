// Effects: blend modes, the effects stack, clipping, masks and layer folders, and the Effects panel.
import { lazyPanel } from '../core/lazy';
import { registerPanel } from '../core/registry';
import './commands';
import './help';

registerPanel({ id: 'effects', title: 'Effects', icon: 'effects', component: lazyPanel(() => import('./EffectsPanel').then((m) => m.EffectsPanel)), zone: 'right', order: 35, help: 'effects' });

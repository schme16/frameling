// Text shapes: the Text tool, typing on the canvas, the Text panel, text animations and Convert to shapes.
import { lazyPanel } from '../core/lazy';
import { registerPanel } from '../core/registry';
import { store } from '../core/store';
import './kind';
import './tool';
import './commands';
import './help';
import { preloadFonts } from './fonts';

registerPanel({ id: 'text', title: 'Text', icon: 'text', component: lazyPanel(() => import('./TextPanel').then((m) => m.TextPanel)), zone: 'right', order: 37, help: 'text' });

preloadFonts(() => store().setUi({}));

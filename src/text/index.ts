// Text shapes: the Text tool, typing on the canvas, the Text panel, text animations and Convert to shapes.
import { registerPanel } from '../core/registry';
import { store } from '../core/store';
import './tool';
import './commands';
import './help';
import { TextPanel } from './TextPanel';
import { preloadFonts } from './fonts';

registerPanel({ id: 'text', title: 'Text', icon: 'text', component: TextPanel, zone: 'right', order: 37, help: 'text' });

preloadFonts(() => store().setUi({}));

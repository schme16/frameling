// Registers the canvas area's commands, panels and help topics.
import { registerPanel } from '../core/registry';
import { ColorsPanel } from './panels/ColorsPanel';
import { ToolOptionsPanel } from './panels/ToolOptionsPanel';
import './canvas.css';
import './choices';
import './commands';
import './guides';
import './snapCommands';
import './gridView';
import './lightTable';
import './help';
import { installLostHint } from './lostHint';

registerPanel({ id: 'tool-options', title: 'Tool options', icon: 'sliders', component: ToolOptionsPanel, zone: 'right', order: 10, help: 'tool-options' });
registerPanel({ id: 'colors', title: 'Colours', icon: 'palette', component: ColorsPanel, zone: 'right', order: 20, help: 'colours' });

installLostHint();

export { CanvasView } from './CanvasView';

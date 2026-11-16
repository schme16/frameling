// Registers selecting on pixel layers (the pixel Select tools, their commands and help) and the lasso. Loaded after
// the pixel area, since it takes over some of the Edit menu's commands. Each way of picking is its own tool now
// (src/select/ways.ts), so there is no icon to keep in step with a mode any more.
import './pixel-tool';
import './commands';
import './help';
import './align-commands';
import './align-help';
import { lazyPanel } from '../core/lazy';
import { registerPanel } from '../core/registry';

// Position and size, and Align and space out, are sections of Properties about whatever is selected (shapes, a symbol
// or pixels). Their placement and wording are in src/ui/panelInfo.ts. They sit just before Symbol and motion (35).
registerPanel({ id: 'selection-numbers', title: 'Position and size', icon: 'transform', component: lazyPanel(() => import('../symbols/SelectionNumbers').then((m) => m.PositionPanel)), zone: 'right', order: 33, help: 'selection-numbers' });
registerPanel({ id: 'align', title: 'Align and space out', icon: 'grid', component: lazyPanel(() => import('./AlignSection').then((m) => m.AlignPanel)), zone: 'right', order: 34, help: 'align-space-out' });

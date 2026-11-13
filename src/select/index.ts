// Registers selecting on pixel layers (the pixel Select tool, its commands and help) and the lasso. Loaded after the
// pixel area, since it takes over some of the Edit menu's commands.
import './pixel-tool';
import './commands';
import './help';
import { getTool } from '../core/registry';
import { store } from '../core/store';
import { pixelSelectTool } from './pixel-tool';
import { getSelectSettings, onSelectSettings } from './settings';

// The Select button in the toolbar shows how it picks: an arrow for a box, a lasso, or a wand.
function syncIcons(): void {
  const mode = getSelectSettings().mode;
  const shape = mode === 'wand' ? 'wand' : mode === 'polygon' ? 'polygon' : mode === 'lasso' ? 'lasso' : 'select';
  pixelSelectTool.icon = shape;
  const vector = getTool('select');
  // The vector tool has no wand of its own, so it shows the box arrow for that one.
  if (vector) vector.icon = shape === 'wand' ? 'select' : shape;
}
syncIcons();
onSelectSettings(() => {
  syncIcons();
  // Nothing in the document changed; this just redraws the toolbar.
  store().setUi({});
});
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
  pixelSelectTool.icon = mode === 'wand' ? 'wand' : mode === 'lasso' ? 'lasso' : 'select';
  const vector = getTool('select');
  if (vector) vector.icon = mode === 'lasso' ? 'lasso' : 'select';
}
syncIcons();
onSelectSettings(() => {
  syncIcons();
  // Nothing in the document changed; this just redraws the toolbar.
  store().setUi({});
});
// What the rest of the app does when a feature is turned on or off: tool and panel commands follow, the dock puts
// panels away or back, and a tool that went is swapped for the brush.
import { getTool } from '../core/registry';
import { store } from '../core/store';
import { pickTool } from '../tools/pick';
import { replacePanels, syncPanels } from '../ui/dock';
import { syncDynamicCommands } from '../ui/dynamic';
import { getFeature, onFeaturesChange } from './host';

onFeaturesChange(({ id, on }) => {
  syncDynamicCommands();
  if (on) replacePanels((getFeature(id)?.panels ?? []).map((p) => p.id));
  else syncPanels();
  if (!on && !getTool(store().get().ui.tool)) pickTool('brush');
});

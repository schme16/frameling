// The Properties section for plugin shapes. It exists while some installed plugin may make shapes, so people who use no
// such plugin never see it in "Also here".
import { lazyPanel } from '../core/lazy';
import { registerPanel, unregisterPanel } from '../core/registry';
import { syncPanels } from '../ui/dock';
import { syncDynamicCommands } from '../ui/dynamic';
import { PANEL_INFO, registerPanelInfo } from '../ui/panelInfo';
import { plugins } from './state';
import { pickedPluginShape } from './shapeProps';

export const SHAPE_SECTION = 'plugin-shape';
let shown = false;

/** Adds or takes away the section to match the installed plugins. */
export function syncShapeSection(): void {
  const wanted = plugins.get().some((p) => p.manifest.permissions.includes('shapes'));
  if (wanted === shown) return;
  shown = wanted;
  if (wanted) {
    registerPanel({ id: SHAPE_SECTION, title: 'Plugin shape', icon: 'plugin', component: lazyPanel(() => import('./PluginShapePanel').then((m) => m.PluginShapePanel)), zone: 'right', order: 37, help: 'plugin-shapes' });
    registerPanelInfo(SHAPE_SECTION, {
      short: 'Plugin shape',
      blurb: 'A shape a plugin made: change its settings, or turn the plugin on.',
      group: 'properties',
      section: true,
      selection: true,
      relevant: (s) => !!pickedPluginShape(s),
      idle: 'Select a shape a plugin made',
      detail: (s) => pickedPluginShape(s)?.kind,
      keywords: ['plugin', 'shape', 'settings', 'star'],
    });
  } else {
    unregisterPanel(SHAPE_SECTION);
    delete PANEL_INFO[SHAPE_SECTION];
  }
  syncPanels();
  syncDynamicCommands();
}

plugins.subscribe(syncShapeSection);
syncShapeSection();

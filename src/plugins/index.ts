// Plugins: small add-ons that run sandboxed and add commands, exports and panels. See docs/plugins.md.
import './commands';
import './help';
import './PluginPanel';
import './shapeSection';
import './plugins.css';
import { requestOverlay } from '../canvas/controller';
import { loadPlugins, plugins, setApprover, setExporterOpener, setOverlayRequester } from './manager';
import { approveWithDialog } from './ApproveDialog';
import { lazyModule } from '../core/lazy';

const loadPluginExport = lazyModule(() => import('./PluginExportDialog'));

setApprover(approveWithDialog);
setOverlayRequester(requestOverlay);
setExporterOpener((pluginId, def) => void loadPluginExport().then((m) => m.openPluginExport({ pluginId, pluginName: plugins.get().find((p) => p.manifest.id === pluginId)?.manifest.name ?? 'plugin', def })));

// Start the plugins that are on once the app is up (a tick later, so the dock and menus are ready for them).
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !import.meta.env?.VITEST) setTimeout(() => void loadPlugins(), 0);

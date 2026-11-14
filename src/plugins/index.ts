// Plugins: small add-ons that run sandboxed and add commands, exports and panels. See docs/plugins.md.
import './commands';
import './help';
import './shapeSection';
import './plugins.css';
import { requestOverlay } from '../canvas/controller';
import { lazyModule } from '../core/lazy';
import { plugins } from './state';

// The plugin runner (manager, sandbox, panel) loads after the first frame, not before it, so the start-up chunk stays small.
const loadRunner = lazyModule(async () => {
  const [m, { approveWithDialog }] = await Promise.all([import('./manager'), import('./ApproveDialog'), import('./PluginPanel')]);
  const loadPluginExport = lazyModule(() => import('./PluginExportDialog'));
  m.setApprover(approveWithDialog);
  m.setOverlayRequester(requestOverlay);
  m.setExporterOpener((pluginId, def) => void loadPluginExport().then((x) => x.openPluginExport({ pluginId, pluginName: plugins.get().find((p) => p.manifest.id === pluginId)?.manifest.name ?? 'plugin', def })));
  return m;
});

// Start the plugins that are on once the app is up (idle time, so the dock and menus are ready for them and the first frame is not held up).
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !import.meta.env?.VITEST) {
  const go = () => void loadRunner().then((m) => m.loadPlugins());
  const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(go, { timeout: 1500 });
  else setTimeout(go, 200);
}

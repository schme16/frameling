// With ?debug in the page address, let scripts install plugins and run their exports without dialogs (screenshots and
// the sandbox check in scripts/e2e/plugins.cjs). Never on in normal use.
import { strToU8 } from 'fflate';
import { installFrom, plugins, runtimeOf, setEnabled } from './manager';
import { WATCHDOG } from './watchdog';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingPlugins: unknown }).__framelingPlugins = {
    /** Files as text, e.g. { 'manifest.json': '...', 'main.js': '...' }. */
    install: (files: Record<string, string>) => installFrom(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))),
    list: () => plugins.get().map((p) => ({ id: p.manifest.id, status: p.status, enabled: p.enabled, problem: p.problem })),
    runtime: runtimeOf,
    setEnabled,
    /** The watchdog's limits, so a check can use short ones. */
    watchdog: WATCHDOG,
  };
}

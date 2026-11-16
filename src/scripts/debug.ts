// With ?debug in the page address, let a check make, run and stop scripts without going through the panel (scripts/e2e/scripts.cjs).
// Never on in normal use.
import type { PathShape } from '../core/format';
import { store } from '../core/store';
import { editActiveDrawing } from '../tools/edit';
import { ellipseSubPath } from '../tools/shapes';
import { WATCHDOG } from '../plugins/watchdog';
import { lastRun, newScript, runScript, stopRunning } from './control';
import { running, scripts, openId, findScript } from './state';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingScripts: unknown }).__framelingScripts = {
    state: () => scripts.get(),
    running: () => running.get(),
    lastRun: () => lastRun.get(),
    open: (id: string | null) => openId.set(id),
    make: (name: string, code: string, reviewed = true, home: 'app' | 'doc' = 'app') => newScript(name, code, reviewed, home),
    run: (id: string) => {
      const s = findScript(id);
      return s ? runScript(s) : Promise.resolve(null);
    },
    stop: stopRunning,
    /** Puts some round shapes on the drawing (in the colours given) and picks them all, so a script has something to work on. */
    seed: (colours: string[], at: { x: number; y: number } = { x: 330, y: 300 }, pick = true) => {
      const shapes: PathShape[] = colours.map((c, i) => ({ id: `seed-${Date.now().toString(36)}-${i}`, type: 'path', paths: [ellipseSubPath({ x: at.x + i * 210, y: at.y, w: 160, h: 160 })], fill: c, stroke: null, opacity: 1 }));
      editActiveDrawing('Add shapes', 'vector', (d) => void d.shapes.push(...shapes));
      store().setUi({ selection: pick ? shapes.map((s) => s.id) : [] });
      return shapes.map((s) => s.id);
    },
    watchdog: WATCHDOG,
  };
}

// Scripts: a few lines of JavaScript that run in the same sandbox as plugins, with the same checked changes, and one Undo
// step for a whole run. A saved script is a command, so it is in the palette, on a key if you like, and in the menus.
// See docs/scripting.md. The panel and the runner load when first used; what start-up needs is here.
import './choices';
import './help';
import './scripts.css';
import { registerCommands, registerPanel } from '../core/registry';
import { lazyModule, lazyPanel } from '../core/lazy';
import { store } from '../core/store';
import { loadAppScripts, running } from './state';

const loadControl = lazyModule(() => import('./control'));

registerPanel({
  id: 'scripts',
  title: 'Scripts',
  icon: 'script',
  component: lazyPanel(() => import('./ScriptsPanel').then((m) => m.ScriptsPanel)),
  // The bottom drawer, beside the timeline: a line of code is wide. Closed until asked for, so a drawing that is only a
  // picture has no drawer until Scripts opens in it (see src/ui/stillZone.ts), and one with frames keeps its timeline.
  zone: 'bottom',
  order: 91,
  startsAway: true,
  help: 'scripts',
});

registerCommands([
  {
    id: 'scripts.open',
    label: 'Write a script',
    category: 'Scripts',
    description: 'Open Scripts in the drawer along the bottom: write a few lines of JavaScript, run them, and keep them as a command.',
    keys: ['Mod+Shift+J'],
    help: 'scripts',
    keywords: ['script', 'scripts', 'scripting', 'javascript', 'macro', 'automate', 'code', 'js', 'repeat', 'batch'],
    run: () => void loadControl().then(() => import('./placeRun').then((p) => p.openScriptsPanel())),
  },
  {
    id: 'scripts.window',
    label: 'Scripts in their own window',
    category: 'Scripts',
    description: 'Give Scripts a wide window of its own over the canvas, for a long script. Run it again to put it back in the drawer.',
    help: 'scripts',
    keywords: ['script', 'scripts', 'window', 'float', 'wide', 'bigger', 'pop out', 'detach', 'undock', 'long'],
    run: () => void import('./placeRun').then((p) => p.toggleScriptsWindow()),
  },
  {
    id: 'scripts.new',
    label: 'New script',
    category: 'Scripts',
    description: 'Start a new script in the Scripts panel, with a line or two to get you going.',
    help: 'scripts',
    keywords: ['script', 'scripts', 'new', 'write', 'macro', 'javascript'],
    run: () =>
      void Promise.all([loadControl(), import('./examples')]).then(async ([c, ex]) => {
        const s = await c.newScript('My script', ex.BLANK);
        if (s) c.openScript(s.id);
      }),
  },
  {
    id: 'scripts.stop',
    label: 'Stop the running script',
    category: 'Scripts',
    description: 'Stop a script that is running. Your drawing goes back how it was before the run.',
    help: 'scripts',
    keywords: ['script', 'stop', 'cancel', 'halt', 'kill', 'loop', 'stuck'],
    global: true,
    enabled: () => !!running.get(),
    reason: () => 'No script is running right now.',
    run: () => void loadControl().then((c) => c.stopRunning()),
  },
]);

// Saved scripts become commands once the app is up (idle time, so the first frame is not held up). The ones inside a drawing
// follow the drawing: they are read when it opens, and run only once the person has said so.
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !import.meta.env?.VITEST) {
  const go = () =>
    void loadControl().then((c) => {
      loadAppScripts();
      store().onLoad(() => void c.onDrawingOpened());
      void c.onDrawingOpened();
    });
  const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(go, { timeout: 2000 });
  else setTimeout(go, 300);
}

// The web build as an installable, offline-capable app: the service worker (dist/web/sw.js, written at build time by
// vite.web.config.ts) and the browser's "install this app" prompt.
import { registerCommands } from '../core/registry';
import { notify } from '../io/notify';
import { openHelp } from '../ui/overlays';
import { saveWaitingFiles } from './index';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: InstallPrompt | null = null;

export function startPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep it for the Help menu entry instead of letting the browser show its own bar.
    e.preventDefault();
    installPrompt = e as InstallPrompt;
  });
  window.addEventListener('appinstalled', () => (installPrompt = null));
  // Only the built web app has a service worker; the dev server and the desktop app don't.
  if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
  }
}

export async function installApp(): Promise<void> {
  if (!installPrompt) {
    notify('Your browser has nothing to install right now. It may already be installed, or this browser does not install web apps (look for "Install" or "Add to Home Screen" in its menu).', 'info', undefined, 9000);
    return;
  }
  const p = installPrompt;
  installPrompt = null;
  await p.prompt();
  const r = await p.userChoice.catch(() => null);
  if (r?.outcome === 'accepted') notify('Frameling is installed. Find it with your other apps.', 'success', undefined, 6000, 'cheer');
}

export function registerWebCommands(): void {
  registerCommands([
    {
      id: 'app.installWeb',
      label: 'Install Frameling as an app...',
      category: 'Help',
      description: 'Add Frameling to your apps, so it opens in its own window and works offline.',
      help: 'web-browser',
      keywords: ['pwa', 'offline', 'install', 'shortcut', 'home screen', 'web app'],
      run: () => installApp(),
    },
    {
      id: 'file.saveWaiting',
      label: 'Save the finished file',
      category: 'File',
      description: 'Downloads a file that finished exporting while you were away, when the browser held it back.',
      help: 'web-browser',
      keywords: ['download', 'ready', 'export', 'safari', 'save'],
      run: () => {
        if (!saveWaitingFiles()) notify('There is no finished file waiting to be saved.', 'info');
      },
    },
    {
      id: 'help.webBrowser',
      label: 'Frameling in a web browser',
      category: 'Help',
      description: 'What works differently when Frameling runs in a browser tab.',
      help: 'web-browser',
      keywords: ['browser', 'web', 'online', 'chrome', 'firefox', 'safari', 'download'],
      run: () => openHelp('web-browser'),
    },
  ]);
}

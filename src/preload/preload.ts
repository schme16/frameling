import { contextBridge } from 'electron';

// The page's only window into the desktop side. It grows as features need it (files, export, preferences);
// the page never gets Node itself.
contextBridge.exposeInMainWorld('frameling', {
  platform: process.platform,
  versions: {
    app: process.argv.find((a) => a.startsWith('--frameling-version='))?.split('=')[1] ?? '',
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
});

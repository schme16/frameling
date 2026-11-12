import { contextBridge, ipcRenderer } from 'electron';
import type { FramelingApi } from './api';

// The page's only window into the desktop side. It grows as features need it; the page never gets Node itself.
// Every call is one named message to the main process, and nothing else crosses over.
const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api: FramelingApi = {
  kind: 'desktop',
  platform: process.platform,
  versions: {
    app: process.argv.find((a) => a.startsWith('--frameling-version='))?.split('=')[1] ?? '',
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  files: {
    open: () => call('files:open'),
    read: (path) => call('files:read', path),
    save: (opts) => call('files:save', opts),
    pickExportFile: (opts) => call('files:pickExportFile', opts),
    pickExportFolder: (opts) => call('files:pickExportFolder', opts),
    write: (path, bytes) => call('files:write', path, bytes),
    writeMany: (folder, files) => call('files:writeMany', folder, files),
    showInFolder: (path) => call('files:showInFolder', path),
    openOther: (opts) => call('files:openOther', opts),
    readFolder: (opts) => call('files:readFolder', opts),
    linkPlayable: (path) => call('files:linkPlayable', path),
  },
  library: {
    list: (kind) => call('library:list', kind),
    read: (kind, id) => call('library:read', kind, id),
    write: (kind, id, bytes) => call('library:write', kind, id, bytes),
    remove: (kind, id) => call('library:remove', kind, id),
    showFolder: (kind) => call('library:showFolder', kind),
  },
  plugins: {
    memory: () => call('plugins:memory'),
    isolated: () => call('plugins:isolated'),
    setDiagnostics: (on) => call('plugins:setDiagnostics', on),
  },
  fonts: {
    psNames: (wants) => call('fonts:psNames', wants),
  },
  media: {
    aacAvailable: () => call('media:aacAvailable'),
    toAac: (bytes) => call('media:toAac', bytes),
  },
  recent: {
    list: () => call('recent:list'),
    add: (path) => call('recent:add', path),
    remove: (path) => call('recent:remove', path),
    clear: () => call('recent:clear'),
  },
  autosave: {
    write: (bytes, meta) => call('autosave:write', bytes, meta),
    read: () => call('autosave:read'),
    clear: () => call('autosave:clear'),
    keep: (thumb) => call('autosave:keep', thumb),
    listKept: () => call('autosave:listKept'),
    readKept: (id) => call('autosave:readKept', id),
    removeKept: (id) => call('autosave:removeKept', id),
  },
  video: {
    probe: () => call('video:probe'),
    start: (path, opts) => call('video:start', path, opts),
    frame: (id, rgba) => call('video:frame', id, rgba),
    finish: (id) => call('video:finish', id),
    cancel: (id) => call('video:cancel', id),
  },
  app: {
    setDocumentState: (state) => ipcRenderer.send('app:documentState', state),
    getLaunchFile: () => call('app:launchFile'),
    onOpenFile: (handler) => {
      const fn = (_: unknown, path: string) => handler(path);
      ipcRenderer.on('app:openFile', fn);
      return () => void ipcRenderer.removeListener('app:openFile', fn);
    },
    onSaveBeforeClose: (handler) => {
      const fn = async () => {
        let ok = false;
        try {
          ok = await handler();
        } catch {
          ok = false;
        }
        ipcRenderer.send('app:saveBeforeCloseDone', ok);
      };
      ipcRenderer.on('app:saveBeforeClose', fn);
      return () => void ipcRenderer.removeListener('app:saveBeforeClose', fn);
    },
    onKeepUnsaved: (handler) => {
      const fn = async () => {
        try {
          await handler();
        } catch {
          // Closing goes ahead either way.
        }
        ipcRenderer.send('app:keepUnsavedDone');
      };
      ipcRenderer.on('app:keepUnsaved', fn);
      return () => void ipcRenderer.removeListener('app:keepUnsaved', fn);
    },
    askSaveChanges: (name) => call('app:askSaveChanges', name),
  },
};

contextBridge.exposeInMainWorld('frameling', api);

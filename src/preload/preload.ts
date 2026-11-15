import { contextBridge, ipcRenderer, webFrame } from 'electron';
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
  // Not personal: only the kind of desktop, which decides how a pen reaches the app on Linux.
  ...(process.platform === 'linux'
    ? {
        session: {
          type: process.env.XDG_SESSION_TYPE ?? '',
          desktop: process.env.XDG_CURRENT_DESKTOP ?? '',
          wayland: !!process.env.WAYLAND_DISPLAY,
          x11: !!process.env.DISPLAY,
          // What the launcher was told with FRAMELING_OZONE (empty: Electron's own choice, which is Wayland on a Wayland session).
          ozone: process.env.FRAMELING_OZONE ?? process.argv.find((a) => a.startsWith('--ozone-platform='))?.split('=')[1] ?? '',
        },
      }
    : {}),
  // FRAMELING_EXPORT_READBACK=1 puts willReadFrequently back on export canvases; measured, it costs more than it saves (src/export/readback.ts).
  tuning: { exportReadback: process.env.FRAMELING_EXPORT_READBACK === '1' },
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
    preview: (path) => call('recent:preview', path),
    keepPreview: (path, png) => call('recent:keepPreview', path, png),
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
  beta: { request: (req) => call('beta:request', req) },
  obs: {
    status: () => call('obs:status'),
    setPassword: (password, remember) => call('obs:setPassword', password, remember),
    connect: (address) => call('obs:connect', address),
    disconnect: () => call('obs:disconnect'),
    onEvent: (handler) => {
      const fn = (_: unknown, m: Parameters<typeof handler>[0]) => handler(m);
      ipcRenderer.on('obs:event', fn);
      return () => void ipcRenderer.removeListener('obs:event', fn);
    },
  },
  share: {
    send: (bytes, opts) => call('share:send', bytes, opts),
    receive: (code) => call('share:receive', code),
    cancel: () => call('share:cancel'),
    onEvent: (handler) => {
      const fn = (_: unknown, e: Parameters<typeof handler>[0]) => handler(e);
      ipcRenderer.on('share:event', fn);
      return () => void ipcRenderer.removeListener('share:event', fn);
    },
  },
  review: {
    start: (name) => call('review:start', { name }),
    stop: () => call('review:stop'),
    admit: (conn) => call('review:admit', conn),
    refuse: (conn) => call('review:refuse', conn),
    remove: (seat) => call('review:remove', seat),
    pointer: (x, y, off) => call('review:pointer', x, y, off),
    ack: (seat, ids) => call('review:ack', seat, ids),
    join: (code, name) => call('review:join', code, name),
    onEvent: (handler) => {
      const fn = (_: unknown, e: Parameters<typeof handler>[0]) => handler(e);
      ipcRenderer.on('review:event', fn);
      return () => void ipcRenderer.removeListener('review:event', fn);
    },
  },
  twitch: {
    status: () => call('twitch:status'),
    signIn: (kinds) => call('twitch:signIn', kinds),
    code: () => call('twitch:code'),
    openApproval: () => call('twitch:openApproval'),
    copyApproval: () => call('twitch:copyApproval'),
    cancelSignIn: () => call('twitch:cancelSignIn'),
    signOut: () => call('twitch:signOut'),
    listen: (kinds, names) => call('twitch:listen', kinds, names),
    stop: () => call('twitch:stop'),
    rewards: () => call('twitch:rewards'),
    setApp: (clientId) => call('twitch:setApp', clientId),
    onStatus: (handler) => {
      const fn = (_: unknown, s: Parameters<typeof handler>[0]) => handler(s);
      ipcRenderer.on('twitch:status', fn);
      return () => void ipcRenderer.removeListener('twitch:status', fn);
    },
    onEvent: (handler) => {
      const fn = (_: unknown, e: Parameters<typeof handler>[0]) => handler(e);
      ipcRenderer.on('twitch:event', fn);
      return () => void ipcRenderer.removeListener('twitch:event', fn);
    },
  },
  clipboard: { readPicture: () => call('clipboard:readPicture'), writePicture: (png) => call('clipboard:writePicture', png), writeText: (text) => call('clipboard:writeText', text) },
  update: {
    facts: () => call('update:facts'),
    releases: () => call('update:releases'),
    install: (tag) => call('update:install', tag),
    openPage: (url) => call('update:openPage', url),
    finish: () => call('update:finish'),
    onProgress: (handler) => {
      const fn = (_: unknown, pct: number) => handler(pct);
      ipcRenderer.on('update:progress', fn);
      return () => void ipcRenderer.removeListener('update:progress', fn);
    },
  },
  door: {
    open: (port, fallback) => call('door:open', port, fallback === true),
    close: () => call('door:close'),
    status: () => call('door:status'),
    key: () => call('door:key'),
    roll: () => call('door:roll'),
    onAsk: (handler) => {
      const fn = (_: unknown, id: number, op: Parameters<typeof handler>[1]) => handler(id, op);
      ipcRenderer.on('door:ask', fn);
      return () => void ipcRenderer.removeListener('door:ask', fn);
    },
    answer: (id, answer) => call('door:answer', id, answer),
  },
  overlay: {
    setOn: (on) => call('overlay:on', on === true),
    push: (state) => call('overlay:push', state),
    url: () => call('overlay:url'),
    roll: () => call('overlay:roll'),
  },
  popout: {
    open: (o) => call('popout:open', o),
    onMode: (handler) => {
      const fn = (_e: unknown, m: unknown) => handler(m === 'capture' ? 'capture' : 'second');
      ipcRenderer.on('popout:mode', fn);
      return () => void ipcRenderer.removeListener('popout:mode', fn);
    },
    close: () => call('popout:close'),
    isOpen: () => call('popout:isOpen'),
    onClosed: (handler) => {
      const fn = () => handler();
      ipcRenderer.on('popout:closed', fn);
      return () => void ipcRenderer.removeListener('popout:closed', fn);
    },
  },
  streamboard: {
    open: (top) => call('streamboard:open', top === true),
    close: () => call('streamboard:close'),
    isOpen: () => call('streamboard:isOpen'),
    raiseMain: () => call('streamboard:raiseMain'),
    apart: () => call('streamboard:apart'),
    onApart: (handler) => {
      const fn = (_e: unknown, apart: unknown) => handler(apart === true);
      ipcRenderer.on('streamboard:apart', fn);
      return () => void ipcRenderer.removeListener('streamboard:apart', fn);
    },
    onClosed: (handler) => {
      const fn = () => handler();
      ipcRenderer.on('streamboard:closed', fn);
      return () => void ipcRenderer.removeListener('streamboard:closed', fn);
    },
  },
  gpu: { report: () => call('gpu:report'), setHardware: (on) => call('gpu:setHardware', on) },
  app: {
    // How big everything is drawn. Chromium's own page zoom, so text, panels and the canvas all stay crisp.
    setUiScale: (factor) => webFrame.setZoomFactor(Math.min(3, Math.max(0.5, factor))),
    getLastCrash: () => call('app:lastCrash'),
    crashOffered: () => ipcRenderer.send('app:crashOffered'),
    getDisplay: () => call('app:display'),
    onDisplayChanged: (handler) => {
      const fn = (_: unknown, d: Parameters<typeof handler>[0]) => handler(d);
      ipcRenderer.on('app:displayChanged', fn);
      return () => void ipcRenderer.removeListener('app:displayChanged', fn);
    },
    setDocumentState: (state) => ipcRenderer.send('app:documentState', state),
    getLaunchFile: () => call('app:launchFile'),
    restart: (view, carry) => call('app:restart', view, carry === true),
    getRestore: () => call('app:restore'),
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
    askSaveChanges: (name, neverSaved) => call('app:askSaveChanges', name, neverSaved),
    setPanicKey: (on) => call('app:panicKey', on === true),
    onPanicKey: (handler) => {
      const fn = () => handler();
      ipcRenderer.on('app:panicKey', fn);
      return () => void ipcRenderer.removeListener('app:panicKey', fn);
    },
    onCloseQuestion: (handler) => {
      // What to do if the desktop side withdraws a question (it gave up on the page and asked another way).
      const withdrawals = new Map<number, () => void>();
      const ask = (_e: unknown, id: number, q: { name?: unknown; neverSaved?: unknown }) => {
        Promise.resolve()
          .then(() => handler({ name: String(q?.name ?? 'Untitled'), neverSaved: q?.neverSaved === true }, () => ipcRenderer.send('app:closeQuestionShown', id), (fn) => void withdrawals.set(id, fn)))
          .then(
            (choice) => ipcRenderer.send('app:closeQuestionAnswer', id, choice),
            // The page can't ask: say so, and the desktop side asks with the system box.
            () => ipcRenderer.send('app:closeQuestionAnswer', id, 'unavailable'),
          )
          .finally(() => withdrawals.delete(id));
      };
      const withdraw = (_e: unknown, id: number) => withdrawals.get(id)?.();
      ipcRenderer.on('app:closeQuestion', ask);
      ipcRenderer.on('app:closeQuestionWithdraw', withdraw);
      return () => {
        ipcRenderer.removeListener('app:closeQuestion', ask);
        ipcRenderer.removeListener('app:closeQuestionWithdraw', withdraw);
      };
    },
  },
};

// The port to the picture window arrives here and is passed on to the page as a window message (ports cannot go across the bridge).
ipcRenderer.on('popout:port', (e) => window.postMessage('frameling-popout-port', '*', e.ports));
// The same for the live review you are sharing: the port the drawing window's mirror talks to.
ipcRenderer.on('review:port', (e) => window.postMessage('frameling-review-port', '*', e.ports));

ipcRenderer.on('streamboard:port', (e) => window.postMessage('frameling-streamboard-port', '*', e.ports));

contextBridge.exposeInMainWorld('frameling', api);

// Going live with OBS, the electron side: the IPC the page calls, the key store, and the real obs-websocket-js client.
// The connection logic is in obsSession.ts and the password in obsSecret.ts, both tested without Electron.
import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import OBSWebSocket from 'obs-websocket-js/json';
import { ObsSecret } from './obsSecret';
import { ObsSession, type ObsClientLike, type ObsMessage } from './obsSession';

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;

export function registerObsIpc(handle: Handle, win: () => Electron.BrowserWindow | null): void {
  const file = () => path.join(app.getPath('userData'), 'obs-link.json');
  const secret = new ObsSecret(safeStorage, {
    read: () => {
      try {
        return fs.readFileSync(file(), 'utf8');
      } catch {
        return null;
      }
    },
    write: (text) => fs.writeFileSync(file(), text, { mode: 0o600 }),
    remove: () => fs.rmSync(file(), { force: true }),
  });
  const session = new ObsSession({
    make: () => new OBSWebSocket() as unknown as ObsClientLike,
    emit: (m: ObsMessage) => {
      const w = win();
      if (w && !w.isDestroyed()) w.webContents.send('obs:event', m);
    },
  });

  handle('obs:status', () => ({ canSave: secret.canSave, hasPassword: secret.has() }));
  handle('obs:setPassword', (_e, password: unknown, remember: unknown) => {
    if (password === null || password === '') {
      secret.forget();
      session.setPassword('');
      return { hasPassword: false, saved: false };
    }
    if (typeof password !== 'string') return { hasPassword: secret.has(), saved: false };
    const saved = secret.set(password.slice(0, 500), remember === true);
    session.setPassword(secret.get());
    return { hasPassword: true, saved };
  });
  handle('obs:connect', async (_e, address: unknown) => {
    session.setPassword(secret.get());
    return session.connect(typeof address === 'string' ? address : '');
  });
  handle('obs:disconnect', () => session.disconnect());
  app.on('before-quit', () => void session.disconnect());
}

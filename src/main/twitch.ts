// Connect Twitch, the Electron side: the IPC the page calls, the key store for the sign-in, the real socket and fetch.
// The logic is in twitchSession.ts (and twitchAuth, twitchEventSub, twitchTokens), all tested without Electron.
import fs from 'node:fs';
import path from 'node:path';
import { app, clipboard, safeStorage, shell } from 'electron';
import { cleanKinds } from '../shared/twitch';
import { realClock } from './twitchAuth';
import type { SocketLike } from './twitchEventSub';
import { looksLikeClientId, TwitchSession } from './twitchSession';
import { TwitchTokens } from './twitchTokens';

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;

// The Twitch app (public client, no secret) this build signs in with. From the build environment, never the repository.
declare const __FRAMELING_TWITCH_CLIENT__: string | undefined;
const BUILT_IN = typeof __FRAMELING_TWITCH_CLIENT__ === 'undefined' ? '' : __FRAMELING_TWITCH_CLIENT__;

export function registerTwitchIpc(handle: Handle, win: () => Electron.BrowserWindow | null): void {
  const dir = () => app.getPath('userData');
  const tokenFile = () => path.join(dir(), 'twitch-link.json');
  const appFile = () => path.join(dir(), 'twitch-app.json');
  const readOwn = (): string => {
    try {
      const id = (JSON.parse(fs.readFileSync(appFile(), 'utf8')) as { clientId?: unknown }).clientId;
      return typeof id === 'string' && looksLikeClientId(id) ? id : '';
    } catch {
      return '';
    }
  };
  let own = readOwn();
  const tokens = new TwitchTokens(safeStorage, {
    read: () => {
      try {
        return fs.readFileSync(tokenFile(), 'utf8');
      } catch {
        return null;
      }
    },
    write: (text) => fs.writeFileSync(tokenFile(), text, { mode: 0o600 }),
    remove: () => fs.rmSync(tokenFile(), { force: true }),
  });
  const send = (channel: string, payload: unknown) => {
    const w = win();
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  };
  const session = new TwitchSession({
    fetch: (url, init) => fetch(url, init),
    socket: (url) => new WebSocket(url) as unknown as SocketLike,
    clock: {
      ...realClock,
      later: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
    },
    tokens,
    clientId: () => own || BUILT_IN,
    app: () => (own ? 'own' : BUILT_IN ? 'built-in' : 'none'),
    setOwnApp: (id) => {
      own = id ?? '';
      if (id) fs.writeFileSync(appFile(), JSON.stringify({ clientId: id }), { mode: 0o600 });
      else fs.rmSync(appFile(), { force: true });
    },
    emit: (m) => send(m.type === 'status' ? 'twitch:status' : 'twitch:event', m.type === 'status' ? m.status : m.event),
    openExternal: (u) => void shell.openExternal(u),
    writeClipboard: (t) => clipboard.writeText(t),
  });

  handle('twitch:status', () => session.status());
  handle('twitch:signIn', (_e, kinds: unknown) => session.signIn(cleanKinds(kinds)));
  handle('twitch:code', () => session.code());
  handle('twitch:openApproval', () => session.openApproval());
  handle('twitch:copyApproval', () => session.copyApproval());
  handle('twitch:cancelSignIn', () => session.cancelSignIn());
  handle('twitch:signOut', () => session.signOut());
  handle('twitch:listen', (_e, kinds: unknown) => session.listen(cleanKinds(kinds)));
  handle('twitch:stop', () => session.stopListening());
  handle('twitch:rewards', () => session.rewards());
  handle('twitch:setApp', (_e, id: unknown) => session.setApp(typeof id === 'string' ? id.slice(0, 80) : null));
  app.on('before-quit', () => session.stopListening());
}

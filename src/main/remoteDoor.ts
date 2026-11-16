// The remote door, the desktop side: a small web server on 127.0.0.1 and nothing else (never a public address), the key
// it needs, and the bridge to the page, where the work is done. The rules for a request are in remoteHandler.ts.
//
// Nothing here runs until the page asks for the door to open, and the page asks only when the person has switched it on
// (Preferences, or the command). No server exists before that: no port is open, not even one that refuses. It is closed
// when the page goes, when the app quits and when the person (or Stop everything) says so.
//
// Files, both in the app's own data folder:
//   remote-door-key.txt   the key, readable by this user only. Kept so a tool you set up keeps working after a restart.
//   remote-door.json      { app, address, port, pid }: written while the door is open, removed when it closes, so a
//                         script on this computer can find the port if it had to move. It never holds the key.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { askTimeoutMs, closedRemote, REMOTE_DEFAULT_PORT, REMOTE_MAX_BODY, REMOTE_PORT_TRIES, validRemotePort, type RemoteAsk, type RemoteStatus } from '../shared/remoteDoor';
import type { DoorResponse } from './doorHandler';
import { handleRemoteRequest } from './remoteHandler';

export const REMOTE_KEY_FILE = 'remote-door-key.txt';
export const REMOTE_FOUND_FILE = 'remote-door.json';

/** A new key: long enough to be unguessable, safe to paste into a header, and not mistakable for the actions door's (fld_). */
export const makeRemoteKey = (): string => 'frd_' + randomBytes(24).toString('base64url');

/** The key kept in `dir`, made (and written, readable by this user only) the first time. */
export function readOrMakeRemoteKey(dir: string): string {
  const file = path.join(dir, REMOTE_KEY_FILE);
  try {
    const k = fs.readFileSync(file, 'utf8').trim();
    if (/^frd_[A-Za-z0-9_-]{20,}$/.test(k)) return k;
  } catch {
    // None yet.
  }
  return writeRemoteKey(dir, makeRemoteKey());
}

export function writeRemoteKey(dir: string, key: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, REMOTE_KEY_FILE);
  fs.writeFileSync(file, key + '\n', { mode: 0o600 });
  // A file that already existed keeps its old mode on write, so say it again.
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows has no such modes.
  }
  return key;
}

export interface RemoteServerDeps {
  dir: string;
  /** Asks the page. Resolves to whatever it said, or null when it did not say in time. */
  ask(op: RemoteAsk): Promise<unknown>;
}

export interface RemoteServer {
  open(port: number, fallback: boolean): Promise<RemoteStatus>;
  close(): Promise<void>;
  status(): RemoteStatus;
  key(): string;
  /** Makes a new key. The old one stops working at once. */
  roll(): string;
}

export function createRemoteServer(deps: RemoteServerDeps): RemoteServer {
  let server: http.Server | null = null;
  let current: RemoteStatus = closedRemote();
  let key: string | null = null;
  const getKey = () => (key ??= readOrMakeRemoteKey(deps.dir));
  const foundFile = path.join(deps.dir, REMOTE_FOUND_FILE);

  const forget = () => {
    try {
      fs.rmSync(foundFile, { force: true });
    } catch {
      // Nothing to remove.
    }
  };

  const listenOn = (srv: http.Server, port: number) =>
    new Promise<'ok' | 'busy' | 'failed'>((resolve) => {
      const onError = (e: NodeJS.ErrnoException) => resolve(e.code === 'EADDRINUSE' || e.code === 'EACCES' ? 'busy' : 'failed');
      srv.once('error', onError);
      // 127.0.0.1 only: not 0.0.0.0, not localhost (which may also mean ::1 or a LAN name), so nothing else on the network can reach it.
      srv.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
        srv.removeListener('error', onError);
        resolve('ok');
      });
    });

  const answer = (res: http.ServerResponse, r: DoorResponse) => {
    res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...r.headers });
    res.end(JSON.stringify(r.body));
  };

  const make = (portOf: () => number): http.Server => {
    const srv = http.createServer((req, res) => {
      let body = '';
      let tooBig = false;
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        if (tooBig) return;
        body += chunk;
        if (body.length > REMOTE_MAX_BODY) {
          tooBig = true;
          body = body.slice(0, REMOTE_MAX_BODY + 1);
        }
      });
      req.on('error', () => res.destroy());
      req.on('end', () => {
        void handleRemoteRequest(
          { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body, port: portOf() },
          {
            key: getKey,
            ask: (op) => Promise.race([deps.ask(op), new Promise<null>((r) => setTimeout(() => r(null), askTimeoutMs(op.op)).unref?.())]),
          },
        ).then((r) => answer(res, r));
      });
    });
    srv.requestTimeout = 15_000;
    srv.headersTimeout = 5_000;
    srv.keepAliveTimeout = 2_000;
    srv.maxHeadersCount = 40;
    return srv;
  };

  const door: RemoteServer = {
    async open(port, fallback) {
      const want = validRemotePort(port) ? port : REMOTE_DEFAULT_PORT;
      if (server && current.running) return current;
      getKey();
      let result: 'ok' | 'busy' | 'failed' = 'busy';
      for (let i = 0; i <= (fallback ? REMOTE_PORT_TRIES : 0); i++) {
        const p = want + i;
        if (p > 65535) break;
        const srv = make(() => p);
        result = await listenOn(srv, p);
        if (result === 'ok') {
          server = srv;
          current = { running: true, port: p, address: `http://127.0.0.1:${p}`, moved: p !== want, problem: '' };
          try {
            fs.mkdirSync(deps.dir, { recursive: true });
            fs.writeFileSync(foundFile, JSON.stringify({ app: 'frameling', door: 'remote', address: current.address, port: p, pid: process.pid }) + '\n');
          } catch {
            // The address is on the screen anyway.
          }
          return current;
        }
        srv.close();
        if (result === 'failed') break;
      }
      current = closedRemote(want, result === 'failed' ? 'failed' : 'port-busy');
      return current;
    },
    async close() {
      const s = server;
      server = null;
      current = closedRemote(current.port);
      forget();
      if (!s) return;
      await new Promise<void>((resolve) => {
        s.close(() => resolve());
        // A caller holding a connection open must not keep the door open.
        s.closeAllConnections();
      });
    },
    status: () => current,
    key: getKey,
    roll() {
      key = writeRemoteKey(deps.dir, makeRemoteKey());
      return key;
    },
  };
  return door;
}

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;

/**
 * The page's side of the door: it opens and closes it (the person's switch, from the page), reads the key to show or copy,
 * and answers the questions the door asks it. A question goes out as `remote:ask` with a number and comes back as `remote:answer`.
 */
export function registerRemoteIpc(handle: Handle, win: () => Electron.BrowserWindow | null, dir: () => string): { close(): Promise<void> } {
  const waiting = new Map<number, (v: unknown) => void>();
  let n = 0;
  let door: RemoteServer | null = null;
  const get = (): RemoteServer =>
    (door ??= createRemoteServer({
      dir: dir(),
      ask: (op) =>
        new Promise((resolve) => {
          const w = win();
          if (!w || w.isDestroyed() || w.webContents.isDestroyed()) return resolve(null);
          const id = ++n;
          waiting.set(id, resolve);
          // Gone when it answers, or when the wait for it runs out (the door gives up first and ignores a late one).
          setTimeout(() => waiting.delete(id), askTimeoutMs(op.op) + 1000).unref?.();
          w.webContents.send('remote:ask', id, op);
        }),
    }));

  handle('remote:open', (_e, port: unknown, fallback: unknown) => get().open(validRemotePort(port) ? port : REMOTE_DEFAULT_PORT, fallback === true));
  handle('remote:close', () => get().close());
  // Asking the status or the key must not make the server object, let alone open anything: `get` only builds the closed shell.
  handle('remote:status', () => get().status());
  handle('remote:key', () => get().key());
  handle('remote:roll', () => get().roll());
  handle('remote:answer', (_e, id: unknown, answer: unknown) => {
    const r = typeof id === 'number' ? waiting.get(id) : undefined;
    if (r) {
      waiting.delete(id as number);
      r(answer);
    }
  });
  return {
    close: async () => {
      if (door) await door.close();
    },
  };
}

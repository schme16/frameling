// The actions door, the desktop side: a small web server on 127.0.0.1 and nothing else (never a public address), the
// key it needs, and the bridge to the page, where the gate lives. The rules for a request are in doorHandler.ts.
//
// Files, both in the app's own data folder:
//   stream-door-key.txt   the key, readable by this user only. Kept so tools you set up keep working after a restart.
//   stream-door.json      { app, address, port, pid }: written while the door is open, removed when it closes, so a
//                         script on this computer can find the port if it had to move. It never holds the key.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { handleDoorRequest, MAX_BODY, type DoorResponse } from './doorHandler';
import { handleOverlayRequest, isOverlayPath, type OverlayDeps } from './overlayHandler';
import { createOverlayHub, privateWordsOf } from './overlayHub';
import os from 'node:os';
import { OVERLAY_PREFIX } from '../shared/streamOverlay';
import { closedStatus, DEFAULT_DOOR_PORT, DOOR_PORT_TRIES, validDoorPort, type DoorAsk, type DoorStatus } from '../shared/streamDoor';

export const KEY_FILE = 'stream-door-key.txt';
export const FOUND_FILE = 'stream-door.json';
/** How long to wait for the page to answer before telling the caller Frameling is not ready. */
export const ASK_TIMEOUT_MS = 4000;

/** A new key: long enough to be unguessable, and safe to paste into a header. */
export const makeKey = (): string => 'fld_' + randomBytes(24).toString('base64url');

/** The key kept in `dir`, made (and written, readable by this user only) the first time. */
export function readOrMakeKey(dir: string): string {
  const file = path.join(dir, KEY_FILE);
  try {
    const k = fs.readFileSync(file, 'utf8').trim();
    if (/^fld_[A-Za-z0-9_-]{20,}$/.test(k)) return k;
  } catch {
    // None yet.
  }
  return writeKey(dir, makeKey());
}

/** Replaces the key kept in `dir`. */
export function writeKey(dir: string, key: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, KEY_FILE);
  fs.writeFileSync(file, key + '\n', { mode: 0o600 });
  // A file that already existed keeps its old mode on write, so say it again.
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows has no such modes.
  }
  return key;
}

export interface DoorServerDeps {
  dir: string;
  /** Asks the page. Resolves to whatever it said, or null when it did not say in time. */
  ask(op: DoorAsk): Promise<unknown>;
  /**
   * The stream overlay (src/main/overlayHandler.ts), served on its own path by this same server. It has its own rules
   * and shares none of the door's: a request for /overlay never reaches the door's handler, and no other path reaches
   * the overlay's. Left out, the server has no overlay at all.
   */
  overlay?: OverlayDeps;
}

export interface DoorServer {
  /** Opens on `port`. `fallback`: when it is busy try the next ones. Safe to call while open (it answers with how things are). */
  open(port: number, fallback: boolean): Promise<DoorStatus>;
  close(): Promise<void>;
  status(): DoorStatus;
  key(): string;
  /** Makes a new key. The old one stops working at once. */
  roll(): string;
}

export function createDoorServer(deps: DoorServerDeps): DoorServer {
  let server: http.Server | null = null;
  let current: DoorStatus = closedStatus();
  let key: string | null = null;
  const getKey = () => (key ??= readOrMakeKey(deps.dir));
  const foundFile = path.join(deps.dir, FOUND_FILE);

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
    const text = JSON.stringify(r.body);
    res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...r.headers });
    res.end(text);
  };

  const make = (portOf: () => number): http.Server => {
    const srv = http.createServer((req, res) => {
      if (deps.overlay && isOverlayPath(req.url ?? '')) {
        // A read-only page with a token of its own. Never the door's handler, so the door's Origin rule is untouched.
        req.resume();
        const r = handleOverlayRequest({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, port: portOf() }, deps.overlay);
        res.writeHead(r.status, r.headers);
        res.end(req.method === 'HEAD' ? undefined : r.body);
        return;
      }
      let body = '';
      let tooBig = false;
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        if (tooBig) return;
        body += chunk;
        if (body.length > MAX_BODY) {
          tooBig = true;
          body = body.slice(0, MAX_BODY + 1);
        }
      });
      req.on('error', () => res.destroy());
      req.on('end', () => {
        void handleDoorRequest(
          { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body, port: portOf() },
          {
            key: getKey,
            ask: (op) =>
              Promise.race([deps.ask(op), new Promise<null>((r) => setTimeout(() => r(null), ASK_TIMEOUT_MS).unref?.())]),
          },
        ).then((r) => answer(res, r));
      });
    });
    srv.requestTimeout = 10_000;
    srv.headersTimeout = 5_000;
    srv.keepAliveTimeout = 2_000;
    srv.maxHeadersCount = 40;
    return srv;
  };

  const door: DoorServer = {
    async open(port, fallback) {
      const want = validDoorPort(port) ? port : DEFAULT_DOOR_PORT;
      if (server && current.running) return current;
      // Made now, not on the first request, so the key is there as soon as the door is.
      getKey();
      let result: 'ok' | 'busy' | 'failed' = 'busy';
      for (let i = 0; i <= (fallback ? DOOR_PORT_TRIES : 0); i++) {
        const p = want + i;
        if (p > 65535) break;
        const srv = make(() => p);
        result = await listenOn(srv, p);
        if (result === 'ok') {
          server = srv;
          current = { running: true, port: p, address: `http://127.0.0.1:${p}`, moved: p !== want, problem: '' };
          try {
            fs.mkdirSync(deps.dir, { recursive: true });
            fs.writeFileSync(foundFile, JSON.stringify({ app: 'frameling', address: current.address, port: p, pid: process.pid }) + '\n');
          } catch {
            // The address is on the screen anyway.
          }
          return current;
        }
        srv.close();
        if (result === 'failed') break;
      }
      current = closedStatus(want, result === 'failed' ? 'failed' : 'port-busy');
      return current;
    },
    async close() {
      const s = server;
      server = null;
      current = closedStatus(current.port);
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
      key = writeKey(deps.dir, makeKey());
      return key;
    },
  };
  return door;
}

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;

/**
 * The page's side of the door: it opens and closes it (the gate does, from the page), reads the key to show or copy,
 * and answers the questions the door asks it. A question goes out as `door:ask` with a number and comes back as `door:answer`.
 */
export function registerDoorIpc(handle: Handle, win: () => Electron.BrowserWindow | null, dir: () => string, mascotDir: () => string | null = () => null): { close(): Promise<void> } {
  const waiting = new Map<number, (v: unknown) => void>();
  let n = 0;
  let door: DoorServer | null = null;
  const hub = createOverlayHub({
    dir: dir(),
    mascotDir: mascotDir(),
    privateWords: (() => {
      try {
        return privateWordsOf(os.userInfo().username, os.hostname());
      } catch {
        return [];
      }
    })(),
  });
  const get = (): DoorServer =>
    (door ??= createDoorServer({
      dir: dir(),
      overlay: hub,
      ask: (op) =>
        new Promise((resolve) => {
          const w = win();
          if (!w || w.isDestroyed() || w.webContents.isDestroyed()) return resolve(null);
          const id = ++n;
          waiting.set(id, resolve);
          // Gone when it answers, or when the wait for it runs out (the door gives up first and ignores a late one).
          setTimeout(() => waiting.delete(id), ASK_TIMEOUT_MS + 1000).unref?.();
          w.webContents.send('door:ask', id, op);
        }),
    }));

  handle('door:open', (_e, port: unknown, fallback: unknown) => get().open(validDoorPort(port) ? port : DEFAULT_DOOR_PORT, fallback === true));
  handle('door:close', async () => {
    await get().close();
    hub.setOn(false);
  });
  handle('door:status', () => get().status());
  handle('door:key', () => get().key());
  handle('door:roll', () => get().roll());
  handle('door:answer', (_e, id: unknown, answer: unknown) => {
    const r = typeof id === 'number' ? waiting.get(id) : undefined;
    if (r) {
      waiting.delete(id as number);
      r(answer);
    }
  });
  // The stream overlay's side of the page's link: it says whether the overlay is wanted, and what is going on for it to show.
  handle('overlay:on', (_e, on: unknown) => {
    hub.setOn(on === true);
  });
  handle('overlay:push', (_e, raw: unknown) => {
    hub.push(raw);
  });
  // The full address, or '' while the door is closed. The token is in it: the page draws it hidden, and copies it.
  handle('overlay:url', () => {
    const a = get().status().address;
    return a ? `${a}${OVERLAY_PREFIX}/${hub.token()}/` : '';
  });
  handle('overlay:roll', () => {
    hub.roll();
  });
  return {
    close: async () => {
      hub.setOn(false);
      if (door) await door.close();
    },
  };
}

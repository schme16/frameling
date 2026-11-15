// Sharing with a code, the electron side: the IPC the page calls, and the real Hyperswarm. The conversation itself is in
// src/share, tested without Electron or a network. Nothing is written to disk here, and the code is never logged.
import { parseCode } from '../share/code';
import { MAX_BYTES } from '../share/protocol';
import { startReceive, startSend, type MakeSwarm, type ShareJob, type SwarmLike } from '../share/swarm';
import type { ShareEvent } from '../share/types';

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;

/** Joins the real peer network. Loaded only when somebody actually shares, so a start-up never touches the native parts. */
export function hyperswarmMaker(opts: Record<string, unknown> = {}): MakeSwarm {
  return async () => {
    // A plain require: the main bundle is CommonJS, and this keeps the native parts loading the way they were proven to.
    const Hyperswarm = require('hyperswarm');
    const swarm = new Hyperswarm(opts);
    // A swarm that cannot reach anybody errors on a socket now and then; that is "offline", not a crash.
    swarm.on('error', () => {});
    const like: SwarmLike = {
      join: (topic, o) => swarm.join(topic, o),
      on: (event, fn) => swarm.on(event, fn),
      destroy: () => swarm.destroy(),
      // Got through to the bootstrap nodes and learned about at least one other.
      reachable: () => !!swarm.dht?.bootstrapped && (swarm.dht?.nodes?.length ?? 0) > 0,
    };
    return like;
  };
}

export const makeHyperswarm: MakeSwarm = hyperswarmMaker();

export function registerShareIpc(handle: Handle, win: () => Electron.BrowserWindow | null, makeSwarm: MakeSwarm = makeHyperswarm): void {
  let job: ShareJob | null = null;
  // Each start gets a number, so a late event from a job that was already replaced cannot be mistaken for the new one.
  let serial = 0;

  const emit = (n: number) => (e: ShareEvent) => {
    if (n !== serial) return;
    const w = win();
    if (w && !w.isDestroyed()) w.webContents.send('share:event', e);
  };
  const stop = () => {
    serial++;
    job?.cancel();
    job = null;
  };

  handle('share:send', async (_e, bytes: unknown, opts: unknown) => {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_BYTES) return { ok: false };
    const minutes = typeof (opts as { minutes?: unknown })?.minutes === 'number' ? (opts as { minutes: number }).minutes : 10;
    stop();
    const n = serial;
    const send = emit(n);
    job = startSend({
      bytes: new Uint8Array(bytes),
      makeSwarm,
      expiryMs: Math.min(60, Math.max(1, minutes)) * 60_000,
      emit: (e) => send({ side: 'send', ...e }),
    });
    return { ok: true };
  });

  handle('share:receive', async (_e, text: unknown) => {
    const parsed = typeof text === 'string' ? parseCode(text) : null;
    if (!parsed?.ok) return { ok: false };
    stop();
    const n = serial;
    const send = emit(n);
    job = startReceive({ code: parsed.code, makeSwarm, emit: (e) => send({ side: 'receive', ...e }) });
    return { ok: true };
  });

  handle('share:cancel', () => {
    stop();
  });
}

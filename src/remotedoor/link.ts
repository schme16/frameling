// The page's end of the remote door: opens and closes the server in the desktop side when the person switches it, in
// order (an open followed at once by a close ends closed, whatever order the answers come back in), and answers the
// questions the door asks. The pieces are handed in, so it is tested with a pretend desktop side.
import type { RemoteBridge } from '../preload/api';
import type { RemoteAnswer, RemoteAsk, RemoteStatus } from '../shared/remoteDoor';

export interface LinkDeps {
  bridge(): RemoteBridge | null;
  port(): number;
  /** Shows what the desktop side said. */
  setStatus(s: RemoteStatus): void;
  /** Answers one question from the door (the driver). */
  answer(op: RemoteAsk): Promise<RemoteAnswer>;
  /** Says what happened in plain words (the log and a message). */
  said(what: 'opened' | 'closed' | 'busy' | 'failed', why?: string): void;
  /** Things to do only while the door is open (listening for pointers, the Stop-everything watch). Returns the way to undo them. */
  whileOpen(): () => void;
}

export interface RemoteLink {
  /** The person switched it on. Resolves to whether it is open now. */
  open(): Promise<boolean>;
  /** The person (or Stop everything, or the app) switched it off. */
  close(why?: string): Promise<void>;
  isWanted(): boolean;
}

export function createRemoteLink(d: LinkDeps): RemoteLink {
  let wanted = false;
  let chain: Promise<unknown> = Promise.resolve();
  let stopAsking: (() => void) | null = null;
  let undoOpen: (() => void) | null = null;
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };

  const detach = () => {
    stopAsking?.();
    stopAsking = null;
    undoOpen?.();
    undoOpen = null;
  };

  return {
    isWanted: () => wanted,
    open() {
      wanted = true;
      return enqueue(async () => {
        const b = d.bridge();
        if (!b || !wanted) return false;
        const st = await b.open(d.port(), false);
        d.setStatus(st);
        if (!wanted) {
          // Switched off again while it was opening.
          await b.close();
          d.setStatus(await b.status());
          return false;
        }
        if (!st.running) {
          wanted = false;
          d.said(st.problem === 'port-busy' ? 'busy' : 'failed');
          return false;
        }
        detach();
        stopAsking = b.onAsk((id, op) => {
          void d.answer(op).then(
            (a) => b.answer(id, a),
            () => b.answer(id, null),
          ).catch(() => undefined);
        });
        undoOpen = d.whileOpen();
        d.said('opened');
        return true;
      });
    },
    close(why) {
      wanted = false;
      return enqueue(async () => {
        const b = d.bridge();
        detach();
        if (!b) return;
        const was = (await b.status()).running;
        await b.close();
        d.setStatus(await b.status());
        if (was) d.said('closed', why);
      });
    },
  };
}

// The page's end of the door: opens and closes the server in the desktop side when the gate says so, in order (an open
// followed at once by a close ends closed, whatever order the answers come back in), and answers its questions.
// The pieces are handed in, so it is tested with a pretend desktop side.
import type { DoorBridge } from '../preload/api';
import type { DoorStatus } from '../shared/streamDoor';
import { answerAsk, type GateLike } from './answer';

export interface LinkDeps {
  bridge(): DoorBridge | null;
  port(): number;
  gate: GateLike;
  /** Shows what the desktop side said. */
  setStatus(s: DoorStatus): void;
  /** The remembered answer to "port taken: next or stay" (asking the first time). Calls `then` with it. */
  portBusy(then: (answer: string) => void): void;
  /** Tells the person the door could not open and what to do. */
  tell(message: string): void;
}

export interface DoorLink {
  /** The gate opened the door. */
  open(): void;
  /** The gate closed it (switch off, Stop, the feature going). */
  close(): void;
  /** Close and open again on the port now preferred. */
  reopen(): void;
  /** Starts answering the door's questions. Returns the way to stop. */
  listen(): () => void;
}

export function createDoorLink(d: LinkDeps): DoorLink {
  let wanted = false;
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = (fn: () => Promise<void>) => {
    chain = chain.then(fn).catch(() => undefined);
  };

  const doOpen = async (fallback: boolean): Promise<DoorStatus | null> => {
    const b = d.bridge();
    if (!b || !wanted) return null;
    const st = await b.open(d.port(), fallback);
    d.setStatus(st);
    return st;
  };

  const link: DoorLink = {
    open() {
      wanted = true;
      enqueue(async () => {
        const st = await doOpen(false);
        if (st?.problem === 'port-busy' && wanted) {
          d.portBusy((answer) => {
            if (!wanted) return;
            if (answer === 'next') enqueue(async () => void (await doOpen(true)));
            else d.tell(`The actions door could not open: port ${st.port} is taken. Pick another in Preferences > Features.`);
          });
        } else if (st?.problem === 'failed') d.tell('The actions door could not open. Try again from Preferences > Features.');
      });
    },
    close() {
      wanted = false;
      enqueue(async () => {
        const b = d.bridge();
        if (!b) return;
        await b.close();
        d.setStatus(await b.status());
      });
    },
    reopen() {
      const was = wanted;
      link.close();
      if (was) link.open();
    },
    listen() {
      const b = d.bridge();
      if (!b) return () => undefined;
      return b.onAsk((id, op) => {
        void b.answer(id, answerAsk(op, d.gate)).catch(() => undefined);
      });
    },
  };
  return link;
}


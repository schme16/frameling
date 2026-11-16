// The page's link to the desktop side: nothing is asked to open until the person says so, order is kept, Stop everything closes it.
import { describe, expect, it, vi } from 'vitest';
import { createRemoteLink } from '../../src/remotedoor/link';
import { closedRemote, type RemoteStatus } from '../../src/shared/remoteDoor';
import type { RemoteBridge } from '../../src/preload/api';

const running = (port: number): RemoteStatus => ({ running: true, port, address: `http://127.0.0.1:${port}`, moved: false, problem: '' });

function make(openAnswer: RemoteStatus) {
  const log: string[] = [];
  const statuses: RemoteStatus[] = [];
  const said: string[] = [];
  let ask: (id: number, op: never) => void = () => undefined;
  let isOpen = false;
  const bridge = {
    open: async (port: number, fallback: boolean) => {
      log.push(`open ${port} ${fallback}`);
      isOpen = openAnswer.running;
      return openAnswer;
    },
    close: async () => void (log.push('close'), (isOpen = false)),
    status: async () => (isOpen ? openAnswer : closedRemote()),
    key: async () => '',
    roll: async () => '',
    onAsk: (h: typeof ask) => {
      ask = h;
      log.push('listen');
      return () => void log.push('unlisten');
    },
    answer: async (id: number, a: unknown) => void log.push(`answer ${id} ${JSON.stringify(a)}`),
  } as unknown as RemoteBridge;
  const whileOpen = vi.fn(() => () => void log.push('undo while open'));
  const link = createRemoteLink({
    bridge: () => bridge,
    port: () => 47231,
    setStatus: (s) => statuses.push(s),
    answer: async (op) => ({ status: 200, body: { ok: true, op: op.op } }),
    said: (w, why) => void said.push(why ? `${w}: ${why}` : w),
    whileOpen,
  });
  return { link, log, statuses, said, ask: (id: number) => ask(id, { op: 'hello' } as never), whileOpen };
}
const settle = () => new Promise((r) => setTimeout(r, 5));

describe('the remote link', () => {
  it('asks the desktop side for nothing until the person opens it', async () => {
    const t = make(running(47231));
    await settle();
    expect(t.log).toEqual([]);
    expect(t.whileOpen).not.toHaveBeenCalled();
  });
  it('opens on the preferred port without moving, then listens, and answers questions', async () => {
    const t = make(running(47231));
    expect(await t.link.open()).toBe(true);
    expect(t.log).toEqual(['open 47231 false', 'listen']);
    expect(t.said).toEqual(['opened']);
    t.ask(7);
    await settle();
    expect(t.log.at(-1)).toBe('answer 7 {"status":200,"body":{"ok":true,"op":"hello"}}');
  });
  it('stays off and says so when the port is taken', async () => {
    const t = make(closedRemote(47231, 'port-busy'));
    expect(await t.link.open()).toBe(false);
    expect(t.said).toEqual(['busy']);
    expect(t.link.isWanted()).toBe(false);
    expect(t.log).toEqual(['open 47231 false']);
  });
  it('closes: stops listening, undoes what was watched, and says why', async () => {
    const t = make(running(47231));
    await t.link.open();
    await t.link.close('Stop everything was pressed.');
    expect(t.log).toEqual(['open 47231 false', 'listen', 'unlisten', 'undo while open', 'close']);
    expect(t.said).toEqual(['opened', 'closed: Stop everything was pressed.']);
    expect(t.link.isWanted()).toBe(false);
  });
  it('an open followed at once by a close ends closed', async () => {
    const t = make(running(47231));
    const o = t.link.open();
    const c = t.link.close();
    await Promise.all([o, c]);
    expect(t.log.at(-1)).toBe('close');
    expect(t.statuses.at(-1)?.running).toBe(false);
  });
  it('closing when it was never open says nothing', async () => {
    const t = make(running(47231));
    await t.link.close();
    expect(t.said).toEqual([]);
  });
});

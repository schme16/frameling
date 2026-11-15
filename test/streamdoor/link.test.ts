import { describe, expect, it, vi } from 'vitest';
import { createDoorLink } from '../../src/streamdoor/link';
import { closedStatus, type DoorStatus } from '../../src/shared/streamDoor';
import type { DoorBridge } from '../../src/preload/api';

const running = (port: number, moved = false): DoorStatus => ({ running: true, port, address: `http://127.0.0.1:${port}`, moved, problem: '' });
const settle = () => new Promise((r) => setTimeout(r, 5));

function make(openAnswers: DoorStatus[], portBusy: 'next' | 'stay' = 'next') {
  const log: string[] = [];
  const statuses: DoorStatus[] = [];
  const told: string[] = [];
  const asked = vi.fn();
  let i = 0;
  const bridge = {
    open: async (port: number, fallback: boolean) => {
      log.push(`open ${port} ${fallback}`);
      return openAnswers[Math.min(i++, openAnswers.length - 1)];
    },
    close: async () => void log.push('close'),
    status: async () => closedStatus(),
    key: async () => '',
    roll: async () => '',
    onAsk: () => () => undefined,
    answer: async () => undefined,
  } as DoorBridge;
  const link = createDoorLink({
    bridge: () => bridge,
    port: () => 47213,
    gate: { snapshot: () => ({}) as never, submit: () => ({ ok: true, outcome: 'ran' }) },
    setStatus: (s) => statuses.push(s),
    portBusy: (then) => {
      asked();
      then(portBusy);
    },
    tell: (m) => told.push(m),
  });
  return { link, log, statuses, told, asked };
}

describe('the door link', () => {
  it('opens on the preferred port, shows what it got', async () => {
    const t = make([running(47213)]);
    t.link.open();
    await settle();
    expect(t.log).toEqual(['open 47213 false']);
    expect(t.statuses.at(-1)?.running).toBe(true);
  });

  it('asks what to do when the port is taken, and moves on when told to', async () => {
    const t = make([{ ...closedStatus(47213, 'port-busy') }, running(47214, true)], 'next');
    t.link.open();
    await settle();
    expect(t.asked).toHaveBeenCalledTimes(1);
    expect(t.log).toEqual(['open 47213 false', 'open 47213 true']);
    expect(t.statuses.at(-1)).toMatchObject({ running: true, port: 47214, moved: true });
  });

  it('stays closed and says so when told to stay', async () => {
    const t = make([closedStatus(47213, 'port-busy')], 'stay');
    t.link.open();
    await settle();
    expect(t.log).toEqual(['open 47213 false']);
    expect(t.told[0]).toContain('port 47213 is taken');
  });

  it('says when it could not start for another reason', async () => {
    const t = make([closedStatus(47213, 'failed')]);
    t.link.open();
    await settle();
    expect(t.told).toHaveLength(1);
    expect(t.asked).not.toHaveBeenCalled();
  });

  it('does not move on if the gate shut it while the question was open', async () => {
    const t = make([closedStatus(47213, 'port-busy'), running(47214, true)]);
    const log = t.log;
    t.link.open();
    t.link.close();
    await settle();
    expect(log.filter((l) => l.startsWith('open')).length).toBeLessThanOrEqual(1);
    expect(log.at(-1)).toBe('close');
  });

  it('reopen closes then opens again, only if it was wanted', async () => {
    const t = make([running(47213)]);
    t.link.reopen();
    await settle();
    expect(t.log).toEqual(['close']);
    t.link.open();
    await settle();
    t.link.reopen();
    await settle();
    expect(t.log).toEqual(['close', 'open 47213 false', 'close', 'open 47213 false']);
  });
});

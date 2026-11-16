// @vitest-environment jsdom
// The remote door and the stream safety work: Stop everything closes it, and a remote caller does not get a viewer's allowances.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/renderer/features';
import { audience } from '../../src/audience';
import { remoteLink } from '../../src/remotedoor/instance';
import { remoteLog } from '../../src/remotedoor/log';
import { remoteStatus } from '../../src/remotedoor/state';
import { closedRemote } from '../../src/shared/remoteDoor';
import { appCommands } from '../../src/plugins/appBridge';
import { getCommand } from '../../src/core/registry';

const calls: string[] = [];
let isOpen = false;
beforeEach(() => {
  calls.length = 0;
  isOpen = false;
  (window as unknown as { frameling: unknown }).frameling = {
    files: {},
    remote: {
      open: async (p: number) => ((isOpen = true), calls.push('open'), { running: true, port: p, address: `http://127.0.0.1:${p}`, moved: false, problem: '' }),
      close: async () => ((isOpen = false), void calls.push('close')),
      status: async () => (isOpen ? { running: true, port: 47231, address: 'http://127.0.0.1:47231', moved: false, problem: '' } : closedRemote()),
      onAsk: () => () => undefined,
      answer: async () => undefined,
    },
  };
});
afterEach(async () => {
  await remoteLink.close();
  remoteStatus.set(closedRemote());
  delete (window as unknown as { frameling?: unknown }).frameling;
});

describe('Stop everything', () => {
  it('closes the remote door too', async () => {
    expect(await remoteLink.open()).toBe(true);
    expect(remoteStatus.get().running).toBe(true);
    audience.kill();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual(['open', 'close']);
    expect(remoteStatus.get().running).toBe(false);
    expect(remoteLog.get()[0]).toMatchObject({ what: 'Remote door switched off', note: 'Stop everything was pressed.' });
  });
  it('and watching stops with the door: a kill after it is shut does nothing', async () => {
    await remoteLink.open();
    await remoteLink.close();
    calls.length = 0;
    audience.kill();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual([]);
  });
});

describe('what a remote caller can reach', () => {
  it('lists no audience, streaming, Stream-safe, remote door or file commands', () => {
    const ids = appCommands().map((c) => c.id);
    expect(ids.length).toBeGreaterThan(100);
    for (const id of ids) expect(id, id).not.toMatch(/^(audience\.|stream|view\.streamSafe|remote\.|file\.|settings\.|twitch\.|edit\.undo|edit\.redo)/);
  });
  it('has every one of its own commands off the list, though they exist', () => {
    for (const id of ['remote.toggle', 'remote.log', 'remote.copyKey', 'remote.roll', 'view.streamSafe', 'audience.kill']) expect(getCommand(id), id).toBeTruthy();
  });
});

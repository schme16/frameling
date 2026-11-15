// @vitest-environment jsdom
// The two sharing windows, driven by a pretend bridge: what each moment of the story says, and that every way it can end
// badly says what happened and points at Send a copy.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openReceiveDialog, openSendDialog } from '../../src/io/ShareDialog';
import { codeHint, nextReceive, nextSend, percent, sendIsLive, startReceiveState, startSendState, timeLeft } from '../../src/io/shareState';
import type { ShareEvent } from '../../src/share/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let handler: ((e: ShareEvent) => void) | null = null;
const calls: string[] = [];
let received: string | null = null;
let closeDialog: (() => void) | null = null;

beforeEach(() => {
  handler = null;
  calls.length = 0;
  received = null;
  (window as unknown as { frameling: unknown }).frameling = {
    versions: { app: 'test', electron: '', chrome: '' },
    files: {},
    share: {
      send: async () => {
        calls.push('send');
        return { ok: true };
      },
      receive: async (text: string) => {
        received = text;
        calls.push('receive');
        return { ok: true };
      },
      cancel: async () => void calls.push('cancel'),
      onEvent: (fn: (e: ShareEvent) => void) => {
        handler = fn;
        return () => void (handler = null);
      },
    },
  };
});

afterEach(() => {
  act(() => closeDialog?.());
  closeDialog = null;
  document.body.innerHTML = '';
  delete (window as unknown as { frameling?: unknown }).frameling;
});

const text = () => document.body.textContent ?? '';
const emit = (e: ShareEvent) => act(() => handler!(e));
const byId = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

function typeInto(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('the sender window', () => {
  it('shows the code with honest words once it is ready, and counts wrong tries', () => {
    act(() => {
      closeDialog = openSendDialog(new Uint8Array([1]), 10, () => {});
    });
    expect(calls).toContain('send');
    emit({ side: 'send', type: 'ready', code: 'ocean-tiger-maple-spoon', expiresAt: Date.now() + 9 * 60_000 + 59_000 });
    expect(byId('share.code')!.textContent).toBe('ocean-tiger-maple-spoon');
    expect(text()).toMatch(/Keep this window open/);
    expect(text()).toMatch(/at the same time/);
    expect(text()).toMatch(/Nothing is stored anywhere/);
    expect(byId('share.expires')!.textContent).toMatch(/9:5\d|10:00/);
    emit({ side: 'send', type: 'wrong', tries: 1, left: 2 });
    expect(byId('share.wrong')!.textContent).toMatch(/2 tries left/);
    emit({ side: 'send', type: 'wrong', tries: 2, left: 1 });
    expect(byId('share.wrong')!.textContent).toMatch(/One try left/);
  });

  it('offers Send a copy while waiting, and says plainly when it burns, runs out or cannot get online', () => {
    act(() => {
      closeDialog = openSendDialog(new Uint8Array([1]), 10, () => {});
    });
    emit({ side: 'send', type: 'ready', code: 'ocean-tiger-maple-spoon', expiresAt: Date.now() + 60_000 });
    expect(byId('share.instead')!.textContent).toBe('Send a copy instead');
    emit({ side: 'send', type: 'burned' });
    expect(text()).toMatch(/That code has stopped/);
    expect(text()).toMatch(/Nothing was sent/);
    expect(byId('share.again')).toBeTruthy();
    emit({ side: 'send', type: 'expired' });
    expect(text()).toMatch(/The code ran out/);
    emit({ side: 'send', type: 'offline' });
    expect(text()).toMatch(/couldn't get online/);
    expect(byId('share.fallback')!.textContent).toMatch(/Send a copy/);
    expect(byId('share.instead')).toBeTruthy();
  });

  it('tells the network to stop when the window closes, and says it is gone', () => {
    let gone = 0;
    act(() => {
      closeDialog = openSendDialog(new Uint8Array([1]), 10, () => gone++);
    });
    calls.length = 0;
    act(() => (byId('share.close') ?? [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!).click());
    expect(gone).toBe(1);
    expect(calls).toContain('cancel');
  });
});

describe('the receiver window', () => {
  const open = () =>
    act(() => {
      closeDialog = openReceiveDialog();
    });

  it('will not connect until four real words are typed, and says what is wrong in the meantime', () => {
    open();
    const input = byId('share.input') as HTMLInputElement;
    const go = byId('share.go') as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    typeInto(input, 'ocean-tiger');
    expect(byId('share.hint')!.textContent).toBe('A code is four words.');
    typeInto(input, 'ocean-tigre-maple-spoon');
    expect(byId('share.hint')!.textContent).toMatch(/"tigre" isn't one of the code words/);
    expect(go.disabled).toBe(true);
    typeInto(input, 'Ocean Tiger Maple Spoon');
    expect(byId('share.hint')!.textContent).toBe('');
    expect(go.disabled).toBe(false);
  });

  it('sends what was typed to the network side, and shows looking, then the failure with the way round', async () => {
    open();
    typeInto(byId('share.input') as HTMLInputElement, 'ocean-tiger-maple-spoon');
    await act(async () => (byId('share.go') as HTMLButtonElement).click());
    expect(received).toBe('ocean-tiger-maple-spoon');
    emit({ side: 'receive', type: 'looking' });
    expect(text()).toMatch(/Looking for them/);
    emit({ side: 'receive', type: 'noOne' });
    expect(text()).toMatch(/Couldn't connect/);
    expect(byId('share.fallback')!.textContent).toMatch(/Send a copy/);
    expect(byId('share.again')).toBeTruthy();
  });

  it('says a wrong code did not match, lets the network go, and offers another try', async () => {
    open();
    typeInto(byId('share.input') as HTMLInputElement, 'ocean-tiger-maple-spoon');
    await act(async () => (byId('share.go') as HTMLButtonElement).click());
    calls.length = 0;
    emit({ side: 'receive', type: 'wrong', tries: 1, left: 2 });
    expect(text()).toMatch(/That code didn't match/);
    expect(text()).toMatch(/three wrong tries/);
    expect(calls).toContain('cancel');
    act(() => byId('share.again')!.click());
    expect(byId('share.input')).toBeTruthy();
  });

  it('says it when it cannot get online, and points at Send a copy', () => {
    open();
    emit({ side: 'receive', type: 'offline' });
    expect(text()).toMatch(/couldn't get online/);
    expect(byId('share.fallback')!.textContent).toMatch(/Send a copy/);
  });
});

describe('the story, as a plain state', () => {
  it('walks a send from start to sent, and back to waiting when the right person drops', () => {
    let s = startSendState;
    s = nextSend(s, { type: 'ready', code: 'a-b-c-d', expiresAt: 5 });
    expect(s.kind).toBe('waiting');
    s = nextSend(s, { type: 'connected' });
    s = nextSend(s, { type: 'progress', done: 5, total: 10 });
    expect(s).toMatchObject({ kind: 'sending', done: 5, total: 10 });
    expect(sendIsLive(s)).toBe(true);
    s = nextSend(s, { type: 'dropped' });
    expect(s).toMatchObject({ kind: 'waiting', code: 'a-b-c-d' });
    s = nextSend(s, { type: 'sent' });
    expect(sendIsLive(s)).toBe(false);
  });

  it('walks a receive, and ignores a stop it asked for itself', () => {
    let s = startReceiveState;
    s = nextReceive(s, { type: 'looking' });
    s = nextReceive(s, { type: 'stopped' });
    expect(s.kind).toBe('looking');
    s = nextReceive(s, { type: 'noOne' });
    expect(s.kind).toBe('noOne');
  });

  it('formats time left and progress sensibly', () => {
    expect(timeLeft(61_000, 0)).toBe('1:01');
    expect(timeLeft(0, 5000)).toBe('0:00');
    expect(percent(5, 10)).toBe(50);
    expect(percent(0, 0)).toBe(0);
    expect(codeHint('empty')).toBe('');
  });
});

describe('the words', () => {
  it('have no em dashes anywhere a person might read them, and name Send a copy as the way round', () => {
    const files = ['src/io/ShareDialog.tsx', 'src/io/shareState.ts', 'src/io/share.ts'].map((f) => readFileSync(join(__dirname, '../..', f), 'utf8'));
    for (const f of files) expect(f).not.toMatch(/—/);
    expect(files[0]).toMatch(/Send a copy/);
  });
});

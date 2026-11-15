// @vitest-environment jsdom
// The "how do I get my viewers taking part" route: the links screen says which things come from Twitch events and which
// need a chat bot, with a button to the one page that walks the whole way; that page is a real help topic with a command,
// a menu entry and the same button at the top of the Streaming tab, and it leaves with the streaming tools.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp, loadHelpBodies, helpBody } from '../../src/core/registry';
import { installAudience, audience } from '../../src/audience';
import { setStreaming } from '../../src/features/streamFamily';
import { TwitchPrefsRow } from '../../src/twitch/PrefsRow';
import { StreamingPage } from '../../src/features/StreamingPage';
import { _resetTwitchState } from '../../src/twitch/state';
import { signedOutStatus } from '../../src/shared/twitch';
import { resolveMenus } from '../../src/ui/menus';
import '../../src/renderer/features';

const openHelp = vi.fn();
vi.mock('../../src/ui/overlays', async (orig) => ({ ...(await orig<typeof import('../../src/ui/overlays')>()), openHelp: (...a: unknown[]) => openHelp(...a) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installAudience();

const bridge = {
  status: async () => signedOutStatus(),
  listen: async () => signedOutStatus(),
  stop: async () => undefined,
  rewards: async () => ({ ok: false as const, why: 'signed-out' as const }),
  onStatus: () => () => undefined,
  onEvent: () => () => undefined,
};
let host: HTMLDivElement;
let root: Root;
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeAll(async () => {
  setChoiceAsker(null);
  await loadHelpBodies();
});
beforeEach(async () => {
  localStorage.clear();
  setChoice('audience.strictness', 'relaxed');
  setStreaming(true, { remember: false });
  (window as unknown as { frameling: unknown }).frameling = { files: {}, twitch: bridge };
  openHelp.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  audience.kill();
  await act(async () => root.unmount());
  host.remove();
  _resetTwitchState();
  delete (window as unknown as { frameling?: unknown }).frameling;
  setStreaming(true, { remember: false });
});

describe('the links screen', () => {
  it('says which things come from Twitch events and which need a bot, and opens the route page', async () => {
    await act(async () => root.render(<TwitchPrefsRow />));
    const text = q('twitch.split')!.textContent!;
    expect(text).toContain('From Twitch events, no other program');
    expect(text).toContain('Needs a chat bot');
    expect(text).toMatch(/votes, guesses/);
    expect(text).toContain('never reads your chat');
    await act(async () => q('twitch.chatHelp')!.click());
    expect(openHelp).toHaveBeenCalledWith('viewers-take-part');
  });
});

describe('the route page', () => {
  it('is a help topic with a picture, in the Streaming section, whose words name the steps and link on', () => {
    const t = getHelp('viewers-take-part')!;
    expect(t.section).toBe('Streaming');
    expect(t.media).toBe('viewers-take-part.png');
    const body = helpBody(t);
    for (const id of ['twitch', 'twitch-links', 'chat-commands', 'chat-commands-firebot', 'chat-commands-streamerbot', 'stream-overlay', 'votes', 'audience']) expect(body, id).toContain(`help:${id}`);
    expect(body).toContain('Save setup file');
    expect(body).toMatch(/never reads|doesn't read/);
  });

  it('has a palette command and the first entry of the Streaming menu', () => {
    const c = getCommand('audience.start')!;
    expect(c.help).toBe('viewers-take-part');
    c.run();
    expect(openHelp).toHaveBeenCalledWith('viewers-take-part');
    const items = JSON.stringify(resolveMenus().find((m) => m.menu.label === 'Streaming')!.items);
    expect(items).toContain('"audience.start"');
  });

  it('is on the Streaming tab too, and goes when the streaming tools are tucked away', async () => {
    await act(async () => root.render(<StreamingPage sharing={null} />));
    await act(async () => q('streaming-start-help')!.click());
    expect(openHelp).toHaveBeenCalledWith('viewers-take-part');
    setStreaming(false, { remember: false });
    await act(async () => undefined);
    expect(getHelp('viewers-take-part')).toBeUndefined();
    expect(getCommand('audience.start')).toBeUndefined();
    await act(async () => root.render(<StreamingPage sharing={null} />));
    expect(q('streaming-start')).toBeNull();
  });
});

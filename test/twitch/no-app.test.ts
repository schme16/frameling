// Connect Twitch with no Twitch app set used to do nothing at all: the problem was set and then deliberately left out
// of the message, so the button looked ready, failed, and said nothing. That is how the user found it.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { clearToasts, toasts } from '../../src/ui/toast';
import { twitchStatus } from '../../src/twitch/state';
import { signedOutStatus } from '../../src/shared/twitch';

const openPrefs = vi.fn();
vi.mock('../../src/ui/overlays', () => ({ openPrefs: (...a: unknown[]) => openPrefs(...a), openHelp: vi.fn() }));

const fakeDesktop = (problem: string) => ({
  twitch: {
    signIn: async () => ({ ...signedOutStatus(), problem }),
    status: async () => signedOutStatus(),
    cancelSignIn: async () => undefined,
  },
});
vi.mock('../../src/io/desktop', () => ({ desktop: () => fake }));
let fake: ReturnType<typeof fakeDesktop> | null = null;

describe('Connect Twitch with no Twitch app', () => {
  beforeEach(() => {
    clearToasts();
    openPrefs.mockClear();
    twitchStatus.set(signedOutStatus());
  });

  it('says what is wrong instead of failing in silence', async () => {
    fake = fakeDesktop('no-app');
    const { connect } = await import('../../src/twitch/actions');
    await connect();
    const said = toasts.get().map((t) => t.message).join(' ');
    expect(said).not.toBe('');
    expect(said).toContain('no Twitch app');
  });

  it('offers the way to fix it, which is the only thing that helps', async () => {
    fake = fakeDesktop('no-app');
    const { connect } = await import('../../src/twitch/actions');
    await connect();
    const t = toasts.get().find((x) => x.action?.id === 'twitch-no-app');
    expect(t).toBeTruthy();
    t!.action!.run();
    expect(openPrefs).toHaveBeenCalledWith('streaming', undefined, 'Use my own Twitch app');
  });

  it('says nothing extra when the sign-in starts properly', async () => {
    fake = fakeDesktop('');
    const { connect } = await import('../../src/twitch/actions');
    await connect();
    expect(toasts.get().filter((x) => x.action?.id === 'twitch-no-app')).toHaveLength(0);
  });
});

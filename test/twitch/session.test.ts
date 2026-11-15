// The whole desktop side against a pretend Twitch: signing in, the permissions asked for, listening, refreshing,
// subscribing, signing out for real, and what the page is and is not told.
import { beforeEach, describe, expect, it } from 'vitest';
import { TwitchSession, VALIDATE_EVERY_MS, type SessionMessage } from '../../src/main/twitchSession';
import { TwitchTokens } from '../../src/main/twitchTokens';
import type { TwitchKind } from '../../src/shared/twitch';
import { FakeClock, FakeSocket, FakeTwitch, fakeSafe, memoryFile, settle } from './fake';

let tw: FakeTwitch;
let clock: FakeClock;
let file: ReturnType<typeof memoryFile>;
let tokens: TwitchTokens;
let sockets: FakeSocket[];
let msgs: SessionMessage[];
let opened: string[];
let copied: string[];
let own: string | null;
let s: TwitchSession;

const make = (safe = fakeSafe()) => {
  tokens = new TwitchTokens(safe, file);
  return new TwitchSession({
    fetch: tw.fetch,
    socket: (u) => {
      const k = new FakeSocket(u);
      sockets.push(k);
      return k;
    },
    clock,
    tokens,
    clientId: () => own ?? 'BUILTIN',
    app: () => (own ? 'own' : 'built-in'),
    setOwnApp: (id) => void (own = id),
    emit: (m) => msgs.push(m),
    openExternal: (u) => opened.push(u),
    writeClipboard: (t) => copied.push(t),
  });
};

/** Signs in start to finish. */
const signIn = async (kinds: TwitchKind[] = ['redemption']) => {
  await s.signIn(kinds);
  await clock.advance(5000 * 4);
};

beforeEach(() => {
  tw = new FakeTwitch();
  clock = new FakeClock();
  file = memoryFile();
  sockets = [];
  msgs = [];
  opened = [];
  copied = [];
  own = null;
  s = make();
});

describe('signing in', () => {
  it('asks only for the permissions of what was ticked, once each', async () => {
    await s.signIn(['redemption', 'cheer', 'raid', 'sub', 'follow']);
    expect(tw.callsTo('/oauth2/device')[0].form.scopes).toBe('bits:read channel:read:redemptions channel:read:subscriptions moderator:read:followers');
    s.cancelSignIn();
    await s.signIn(['raid']);
    expect(tw.callsTo('/oauth2/device')[1].form.scopes).toBe('');
  });
  it('shows a waiting state with a code, then signed in once approved', async () => {
    const st = await s.signIn(['redemption']);
    expect(st.state).toBe('signing-in');
    expect(s.code()?.userCode).toBe('ABCDEFGH');
    await clock.advance(5000 * 4);
    const done = s.status();
    expect(done).toMatchObject({ state: 'signed-in', login: 'quilltest', scopes: ['channel:read:redemptions'], problem: '' });
    expect(s.code()).toBeNull();
    expect(tokens.get()?.accessToken).toBe('access-1');
  });
  it('never puts a token or the device code in a status, an event or anything sent to the page', async () => {
    await signIn();
    const sent = JSON.stringify(msgs) + JSON.stringify(s.status());
    for (const secret of ['access-1', 'refresh-1', 'DEV-SECRET-CODE', 'ABCDEFGH']) expect(sent).not.toContain(secret);
  });
  it('says no app when there is no client id', async () => {
    const bare = new TwitchSession({ fetch: tw.fetch, socket: () => new FakeSocket(''), clock, tokens, clientId: () => '', app: () => 'none', setOwnApp: () => undefined, emit: (m) => msgs.push(m), openExternal: () => undefined, writeClipboard: () => undefined });
    const st = await bare.signIn(['raid']);
    expect(st.problem).toBe('no-app');
    expect(tw.calls).toHaveLength(0);
  });
  it('reports a denied, expired or unreachable sign-in, and stays signed out', async () => {
    tw.deviceAnswer = 'denied';
    await signIn();
    expect(s.status()).toMatchObject({ state: 'signed-out', problem: 'denied' });
    tw.deviceAnswer = 'expired';
    await signIn();
    expect(s.status().problem).toBe('expired');
    tw.offline = true;
    await s.signIn(['raid']);
    expect(s.status().problem).toBe('failed');
  });
  it('cancel throws the code away and asks Twitch nothing more', async () => {
    await s.signIn(['raid']);
    s.cancelSignIn();
    const n = tw.calls.length;
    await clock.advance(60_000);
    expect(tw.calls).toHaveLength(n);
    expect(s.status().state).toBe('signed-out');
    expect(s.code()).toBeNull();
  });
  it('opens and copies the approval link only when it is Twitch, and only the one it was given', async () => {
    expect(s.openApproval()).toBe(false);
    await s.signIn(['raid']);
    expect(s.openApproval()).toBe(true);
    expect(s.copyApproval()).toBe(true);
    expect(opened).toEqual(['https://www.twitch.tv/activate?public=true&device-code=ABCDEFGH']);
    expect(copied).toEqual(opened);
  });
  it('will not open an address that is not Twitch', async () => {
    const orig = tw.fetch;
    tw.fetch = async (u, i) => {
      const r = await orig(u, i);
      return u.endsWith('/device') ? { status: 200, json: async () => ({ device_code: 'd', user_code: 'u', verification_uri: 'https://evil.example/activate', expires_in: 1800, interval: 5 }) } : r;
    };
    s = make();
    await s.signIn(['raid']);
    expect(s.openApproval()).toBe(false);
    expect(s.copyApproval()).toBe(false);
    expect(opened).toEqual([]);
  });
  it('keeps the sign-in across a restart where the computer has a key store, not where it has none', async () => {
    await signIn();
    expect(file.text).toBeTruthy();
    expect(make().status()).toMatchObject({ state: 'signed-in', login: 'quilltest', canSave: true });
    file.text = null;
    const none = make(fakeSafe(false));
    expect(none.status().canSave).toBe(false);
    await none.signIn(['redemption']);
    await clock.advance(5000 * 4);
    expect(none.status().state).toBe('signed-in');
    expect(file.text).toBeNull();
  });
  it('revokes the older token when a new sign-in replaces it', async () => {
    await signIn();
    await signIn(['redemption', 'cheer']);
    expect(tw.revoked).toEqual(['access-1']);
    expect(tokens.get()?.accessToken).toBe('access-2');
  });
});

describe('listening', () => {
  it('subscribes with the right type, version and filter for each kind the permissions cover', async () => {
    tw.scopes = ['channel:read:redemptions', 'bits:read', 'moderator:read:followers', 'channel:read:subscriptions'];
    await signIn(['redemption', 'cheer', 'follow', 'sub', 'raid']);
    await s.listen(['redemption', 'cheer', 'follow', 'sub', 'raid']);
    sockets[0].welcome('sess-9');
    await settle();
    const subs = tw.callsTo('/helix/eventsub/subscriptions').map((c) => c.json);
    expect(subs.map((x) => `${x.type}@${x.version}`)).toEqual([
      'channel.channel_points_custom_reward_redemption.add@1',
      'channel.cheer@1',
      'channel.follow@2',
      'channel.subscribe@1',
      'channel.subscription.message@1',
      'channel.raid@1',
    ]);
    expect(subs.every((x) => x.transport.method === 'websocket' && x.transport.session_id === 'sess-9')).toBe(true);
    expect(subs[0].condition).toEqual({ broadcaster_user_id: '4242' });
    expect(subs[2].condition).toEqual({ broadcaster_user_id: '4242', moderator_user_id: '4242' });
    expect(subs[5].condition).toEqual({ to_broadcaster_user_id: '4242' });
    expect(tw.callsTo('/helix/eventsub/subscriptions')[0].headers).toMatchObject({ 'Client-Id': 'BUILTIN', Authorization: 'Bearer access-1' });
    expect(s.status().listening).toBe('listening');
  });
  it('does not ask for a kind the sign-in has no permission for, and says so', async () => {
    await signIn(['redemption']);
    await s.listen(['redemption', 'cheer', 'raid']);
    sockets[0].welcome();
    await settle();
    const types = tw.callsTo('/helix/eventsub/subscriptions').map((c) => c.json.type);
    expect(types).toEqual(['channel.channel_points_custom_reward_redemption.add', 'channel.raid']);
    expect(s.status().refused).toEqual(['cheer']);
  });
  it('reports a kind Twitch refuses (a channel with no channel points)', async () => {
    tw.subStatus['channel.channel_points_custom_reward_redemption.add'] = 403;
    await signIn();
    await s.listen(['redemption', 'raid']);
    sockets[0].welcome();
    await settle();
    expect(s.status().refused).toEqual(['redemption']);
    expect(s.status().listening).toBe('listening');
  });
  it('passes events up to the page as they come, with no names', async () => {
    await signIn(['raid']);
    await s.listen(['raid']);
    sockets[0].welcome();
    await settle();
    sockets[0].notify('channel.raid', { viewers: 12, from_broadcaster_user_name: 'BigRaider' });
    const ev = msgs.filter((m) => m.type === 'event');
    expect(ev).toEqual([{ type: 'event', event: { kind: 'raid', viewers: 12 } }]);
    expect(JSON.stringify(msgs)).not.toContain('BigRaider');
  });
  it('does nothing when signed out, or with nothing ticked', async () => {
    await s.listen(['raid']);
    expect(sockets).toHaveLength(0);
    await signIn();
    await s.listen([]);
    expect(sockets).toHaveLength(0);
  });
  it('stopListening closes the line and keeps the sign-in', async () => {
    await signIn(['raid']);
    await s.listen(['raid']);
    sockets[0].welcome();
    await settle();
    s.stopListening();
    expect(sockets[0].closed).toBe(true);
    expect(s.status()).toMatchObject({ state: 'signed-in', listening: 'off' });
  });
  it('reconnects after the socket drops, and subscribes again on the new session', async () => {
    await signIn(['raid']);
    await s.listen(['raid']);
    sockets[0].welcome('a');
    await settle();
    sockets[0].drop();
    expect(s.status().listening).toBe('reconnecting');
    await clock.advance(1001);
    sockets[1].welcome('b');
    await settle();
    expect(s.status().listening).toBe('listening');
    expect(tw.callsTo('/helix/eventsub/subscriptions').map((c) => c.json.transport.session_id)).toEqual(['a', 'b']);
  });
});

describe('keeping the sign-in fresh', () => {
  it('refreshes a token that is about to run out before using it, and keeps the new refresh token', async () => {
    tw.tokenLife = 30;
    await signIn(['raid']);
    await s.listen(['raid']);
    expect(tw.callsTo('/oauth2/token').some((c) => c.form.grant_type === 'refresh_token')).toBe(true);
    expect(tokens.get()?.refreshToken).toBe('refresh-2');
    expect(new TwitchTokens(fakeSafe(), file).get()?.refreshToken).toBe('refresh-2');
  });
  it('refreshes only once when several things ask at the same time', async () => {
    tw.tokenLife = 30;
    await signIn(['redemption']);
    await Promise.all([s.rewards(), s.rewards(), s.rewards()]);
    expect(tw.callsTo('/oauth2/token').filter((c) => c.form.grant_type === 'refresh_token')).toHaveLength(1);
  });
  it('tries a refresh and one more time when Twitch turns the token down', async () => {
    await signIn();
    tw.validAccess.delete('access-1');
    const r = await s.rewards();
    expect(r.ok).toBe(true);
    expect(tokens.get()?.accessToken).toBe('access-2');
  });
  it('ends the sign-in, stops listening and says to sign in again when the refresh token is no good', async () => {
    tw.tokenLife = 30;
    await signIn(['raid']);
    tw.refreshAnswer = 'gone';
    await s.listen(['raid']);
    expect(s.status()).toMatchObject({ state: 'signed-out', problem: 'needs-sign-in' });
    expect(file.text).toBeNull();
    expect(sockets).toHaveLength(0);
  });
  it('checks the token about every hour while listening, and stops when Twitch has revoked it', async () => {
    tw.tokenLife = 86_400;
    await signIn(['raid']);
    await s.listen(['raid']);
    sockets[0].welcome();
    await settle();
    const before = tw.callsTo('/oauth2/validate').length;
    tw.validAccess.clear();
    await clock.advance(VALIDATE_EVERY_MS + 1000);
    expect(tw.callsTo('/oauth2/validate').length).toBeGreaterThan(before);
    expect(s.status()).toMatchObject({ state: 'signed-out', problem: 'needs-sign-in', listening: 'off' });
  });
  it('signs out when Twitch revokes it mid-session', async () => {
    await signIn(['raid']);
    await s.listen(['raid']);
    sockets[0].welcome();
    await settle();
    sockets[0].say('revocation', { subscription: { status: 'authorization_revoked' } });
    expect(s.status()).toMatchObject({ state: 'signed-out', problem: 'needs-sign-in' });
  });
});

describe('disconnecting', () => {
  it('stops listening, revokes the token with Twitch, and forgets it everywhere', async () => {
    await signIn(['raid']);
    await s.listen(['raid']);
    sockets[0].welcome();
    await settle();
    const r = await s.signOut();
    expect(r).toEqual({ revoked: true });
    expect(tw.revoked).toEqual(['access-1']);
    expect(sockets[0].closed).toBe(true);
    expect(file.text).toBeNull();
    expect(tokens.get()).toBeNull();
    expect(s.status()).toMatchObject({ state: 'signed-out', listening: 'off', login: '', scopes: [] });
  });
  it('still forgets it here when Twitch cannot be reached, and says it could not revoke', async () => {
    await signIn();
    tw.offline = true;
    expect(await s.signOut()).toEqual({ revoked: false });
    expect(tokens.get()).toBeNull();
    expect(file.text).toBeNull();
  });
  it('cancels a code that is waiting', async () => {
    await s.signIn(['raid']);
    await s.signOut();
    expect(s.code()).toBeNull();
    expect(s.status().state).toBe('signed-out');
  });
  it('using your own Twitch app signs out of the old one first, and checks the id looks right', async () => {
    await signIn();
    const bad = await s.setApp('nope');
    expect(bad.problem).toBe('failed');
    expect(tokens.get()).not.toBeNull();
    const id = 'a'.repeat(30);
    const st = await s.setApp(id);
    expect(tw.revoked).toEqual(['access-1']);
    expect(own).toBe(id);
    expect(st).toMatchObject({ state: 'signed-out', app: 'own' });
    await s.setApp(null);
    expect(own).toBeNull();
  });
});

describe('reading your own rewards', () => {
  it('lists their names and costs', async () => {
    await signIn();
    expect(await s.rewards()).toEqual({ ok: true, rewards: [{ id: 'rw1', title: 'Hydrate', cost: 100 }] });
    expect(tw.callsTo('/helix/channel_points/custom_rewards')[0].url).toContain('broadcaster_id=4242');
  });
  it('says so when the channel has no channel points', async () => {
    tw.rewards = 403;
    await signIn();
    expect(await s.rewards()).toEqual({ ok: false, why: 'not-affiliate' });
  });
  it('says signed out with no sign-in', async () => {
    expect(await s.rewards()).toEqual({ ok: false, why: 'signed-out' });
  });
});

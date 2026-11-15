// The device code flow against a pretend Twitch: asking for a code, waiting politely, every way it can end, refreshing, revoking.
import { describe, expect, it } from 'vitest';
import { collectTokens, refreshTokens, requestDeviceCode, revokeToken, validateToken, type Tokens } from '../../src/main/twitchAuth';
import { FakeClock, FakeTwitch } from './fake';

const run = async (tw: FakeTwitch, clock = new FakeClock()) => {
  const grant = (await requestDeviceCode(tw.fetch, 'CID', ['bits:read']))!;
  const ctl = new AbortController();
  const p = collectTokens(tw.fetch, 'CID', ['bits:read'], grant, clock, ctl.signal);
  return { grant, ctl, clock, p };
};

describe('asking for a code', () => {
  it('sends the app id and the permissions, and no secret, and keeps the device code to itself', async () => {
    const tw = new FakeTwitch();
    const g = await requestDeviceCode(tw.fetch, 'CID', ['bits:read', 'channel:read:redemptions']);
    expect(g?.userCode).toBe('ABCDEFGH');
    expect(g?.verificationUri).toContain('twitch.tv/activate');
    const c = tw.calls[0];
    expect(c.form).toEqual({ client_id: 'CID', scopes: 'bits:read channel:read:redemptions' });
    expect(JSON.stringify(c)).not.toMatch(/secret/i);
  });
  it('is null when Twitch says no or cannot be reached', async () => {
    const tw = new FakeTwitch();
    tw.offline = true;
    expect(await requestDeviceCode(tw.fetch, 'CID', [])).toBeNull();
  });
});

describe('waiting for the approval', () => {
  it('asks every interval until approved, then returns the token with who it belongs to', async () => {
    const tw = new FakeTwitch();
    tw.scopes = ['bits:read'];
    const { p, clock } = await run(tw);
    await clock.advance(5000 * 4);
    const t = (await p) as Tokens;
    expect(t.accessToken).toBe('access-1');
    expect(t.login).toBe('quilltest');
    expect(t.scopes).toEqual(['bits:read']);
    expect(tw.callsTo('/oauth2/token')).toHaveLength(3);
    expect(tw.callsTo('/oauth2/token')[0].form.device_code).toBe('DEV-SECRET-CODE');
  });
  it('slows down when Twitch says so', async () => {
    const tw = new FakeTwitch();
    tw.deviceAnswer = 'slow';
    tw.pendingAnswers = 0;
    const { p, clock } = await run(tw);
    await clock.advance(5000);
    expect(tw.callsTo('/oauth2/token')).toHaveLength(1);
    await clock.advance(5000);
    expect(tw.callsTo('/oauth2/token')).toHaveLength(1);
    await clock.advance(5000);
    expect(((await p) as Tokens).accessToken).toBe('access-1');
  });
  it('says denied when the person says no', async () => {
    const tw = new FakeTwitch();
    tw.deviceAnswer = 'denied';
    const { p, clock } = await run(tw);
    await clock.advance(5000);
    expect(await p).toBe('denied');
  });
  it('says expired when Twitch no longer knows the code', async () => {
    const tw = new FakeTwitch();
    tw.deviceAnswer = 'expired';
    const { p, clock } = await run(tw);
    await clock.advance(5000);
    expect(await p).toBe('expired');
  });
  it('gives up when the code runs out of time', async () => {
    const tw = new FakeTwitch();
    tw.pendingAnswers = 10_000;
    const { p, clock } = await run(tw);
    await clock.advance(1800_000 + 10_000);
    expect(await p).toBe('expired');
  });
  it('stops at once when cancelled, and asks nothing more', async () => {
    const tw = new FakeTwitch();
    tw.pendingAnswers = 10_000;
    const { p, clock, ctl } = await run(tw);
    await clock.advance(5000);
    const asked = tw.callsTo('/oauth2/token').length;
    ctl.abort();
    expect(await p).toBe('cancelled');
    await clock.advance(60_000);
    expect(tw.callsTo('/oauth2/token')).toHaveLength(asked);
  });
  it('keeps trying through a blink of the network', async () => {
    const tw = new FakeTwitch();
    tw.pendingAnswers = 0;
    const { p, clock } = await run(tw);
    tw.offline = true;
    await clock.advance(5000);
    tw.offline = false;
    await clock.advance(5000);
    expect(((await p) as Tokens).accessToken).toBe('access-1');
  });
});

describe('keeping the sign-in alive', () => {
  const old: Tokens = { accessToken: 'a', refreshToken: 'r', expiresAt: 0, scopes: [], userId: '1', login: 'x' };
  it('trades the refresh token for a new pair, and sends no secret', async () => {
    const tw = new FakeTwitch();
    const r = (await refreshTokens(tw.fetch, 'CID', old, 10)) as Tokens;
    expect(r.refreshToken).toBe('refresh-1');
    expect(tw.callsTo('/oauth2/token')[0].form).toEqual({ client_id: 'CID', grant_type: 'refresh_token', refresh_token: 'r' });
  });
  it('says gone when Twitch will not, and offline when it cannot be reached', async () => {
    const tw = new FakeTwitch();
    tw.refreshAnswer = 'gone';
    expect(await refreshTokens(tw.fetch, 'CID', old, 0)).toBe('gone');
    tw.refreshAnswer = 'offline';
    expect(await refreshTokens(tw.fetch, 'CID', old, 0)).toBe('offline');
    tw.offline = true;
    expect(await refreshTokens(tw.fetch, 'CID', old, 0)).toBe('offline');
  });
  it('validates: who it is, null when Twitch does not know the token', async () => {
    const tw = new FakeTwitch();
    tw.validAccess.add('good');
    expect(await validateToken(tw.fetch, 'good')).toMatchObject({ userId: '4242', login: 'quilltest' });
    expect(await validateToken(tw.fetch, 'bad')).toBeNull();
    tw.offline = true;
    expect(await validateToken(tw.fetch, 'good')).toBe('offline');
  });
  it('revokes, and reports whether Twitch said so', async () => {
    const tw = new FakeTwitch();
    expect(await revokeToken(tw.fetch, 'CID', 'tok')).toBe(true);
    expect(tw.revoked).toEqual(['tok']);
    tw.offline = true;
    expect(await revokeToken(tw.fetch, 'CID', 'tok')).toBe(false);
  });
});

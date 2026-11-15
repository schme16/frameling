// The EventSub connection against a pretend Twitch socket: welcome, subscribing, notices, repeats, the line dropping,
// going quiet, Twitch moving us to a new address, being signed out, and stopping.
import { beforeEach, describe, expect, it } from 'vitest';
import { backoff, EventSubClient, QUIET_MARGIN_MS, STALE_MS, type SubscribeOutcome } from '../../src/main/twitchEventSub';
import type { TwitchEvent } from '../../src/shared/twitch';
import { FakeClock, FakeSocket, settle } from './fake';

let clock: FakeClock;
let sockets: FakeSocket[];
let events: TwitchEvent[];
let states: string[];
let subscribed: { id: string; kinds: string[] }[];
let outcome: SubscribeOutcome;
let authLost: number;
let client: EventSubClient;
const last = () => sockets[sockets.length - 1];

beforeEach(() => {
  clock = new FakeClock();
  sockets = [];
  events = [];
  states = [];
  subscribed = [];
  outcome = { refused: [] };
  authLost = 0;
  client = new EventSubClient({
    socket: (u) => {
      const s = new FakeSocket(u);
      sockets.push(s);
      return s;
    },
    later: clock.later,
    now: clock.now,
    subscribe: async (id, kinds) => (subscribed.push({ id, kinds }), outcome),
    onEvent: (e) => events.push(e),
    onState: (s) => states.push(s.listening),
    onAuthLost: () => authLost++,
  });
});

describe('listening', () => {
  it('opens the line, subscribes to the kinds on welcome, and says it is listening', async () => {
    client.start(['redemption', 'raid']);
    expect(sockets[0].url).toBe('wss://eventsub.wss.twitch.tv/ws');
    expect(client.state).toBe('connecting');
    sockets[0].welcome('s1');
    await settle();
    expect(subscribed).toEqual([{ id: 's1', kinds: ['redemption', 'raid'] }]);
    expect(client.state).toBe('listening');
  });
  it('does nothing for an empty list', () => {
    client.start([]);
    expect(sockets).toHaveLength(0);
  });
  it('turns each notice into a small event with no name in it', async () => {
    client.start(['redemption', 'cheer', 'follow', 'sub', 'raid']);
    sockets[0].welcome();
    await settle();
    const who = { user_id: '777', user_login: 'viewerlogin', user_name: 'ViewerName', from_broadcaster_user_name: 'RaiderName' };
    sockets[0].notify('channel.channel_points_custom_reward_redemption.add', { ...who, user_input: 'a frog', reward: { id: 'rw1', title: 'Draw', cost: 50, prompt: 'p' } });
    sockets[0].notify('channel.cheer', { ...who, bits: 300, message: 'hello there', is_anonymous: false });
    sockets[0].notify('channel.follow', { ...who, followed_at: 'now' });
    sockets[0].notify('channel.subscribe', { ...who, tier: '1000', is_gift: false });
    sockets[0].notify('channel.subscription.message', { ...who, message: { text: 'hi' } });
    sockets[0].notify('channel.raid', { ...who, viewers: 40 });
    expect(events).toEqual([
      { kind: 'redemption', rewardId: 'rw1', rewardTitle: 'Draw', text: 'a frog' },
      { kind: 'cheer', bits: 300 },
      { kind: 'follow' },
      { kind: 'sub', resub: false },
      { kind: 'sub', resub: true },
      { kind: 'raid', viewers: 40 },
    ]);
    const text = JSON.stringify(events);
    for (const leak of ['777', 'viewerlogin', 'ViewerName', 'RaiderName', 'hello there']) expect(text).not.toContain(leak);
  });
  it('ignores kinds it was not asked for', async () => {
    client.start(['raid']);
    sockets[0].welcome();
    await settle();
    sockets[0].notify('channel.cheer', { bits: 5 });
    expect(events).toEqual([]);
  });
  it('throws away a repeat of the same notice, and one that is far too old', async () => {
    client.start(['cheer']);
    sockets[0].welcome();
    await settle();
    sockets[0].notify('channel.cheer', { bits: 5 }, { message_id: 'same' });
    sockets[0].notify('channel.cheer', { bits: 5 }, { message_id: 'same' });
    expect(events).toHaveLength(1);
    sockets[0].notify('channel.cheer', { bits: 6 }, { message_id: 'old', message_timestamp: new Date(clock.now() - STALE_MS - 1000).toISOString() });
    expect(events).toHaveLength(1);
  });
  it('remembers only the last 200 ids', async () => {
    client.start(['cheer']);
    sockets[0].welcome();
    await settle();
    for (let i = 0; i < 250; i++) sockets[0].notify('channel.cheer', { bits: 1 }, { message_id: `id${i}` });
    expect(events).toHaveLength(250);
    sockets[0].notify('channel.cheer', { bits: 1 }, { message_id: 'id0' });
    expect(events).toHaveLength(251);
    sockets[0].notify('channel.cheer', { bits: 1 }, { message_id: 'id249' });
    expect(events).toHaveLength(251);
  });
  it('shrugs off rubbish', async () => {
    client.start(['cheer']);
    sockets[0].onmessage?.({ data: 'not json' });
    sockets[0].onmessage?.({ data: '{}' });
    sockets[0].welcome();
    await settle();
    expect(client.state).toBe('listening');
  });
});

describe('when the line drops', () => {
  it('tries again after a growing wait, and subscribes afresh', async () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(backoff)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    client.start(['raid']);
    sockets[0].welcome('s1');
    await settle();
    sockets[0].drop();
    expect(client.state).toBe('reconnecting');
    expect(sockets).toHaveLength(1);
    await clock.advance(999);
    expect(sockets).toHaveLength(1);
    await clock.advance(2);
    expect(sockets).toHaveLength(2);
    // That one fails too: the wait doubles.
    sockets[1].drop();
    await clock.advance(1999);
    expect(sockets).toHaveLength(2);
    await clock.advance(2);
    expect(sockets).toHaveLength(3);
    sockets[2].welcome('s3');
    await settle();
    expect(subscribed.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(client.state).toBe('listening');
    // A good connection resets the wait.
    sockets[2].drop();
    await clock.advance(1001);
    expect(sockets).toHaveLength(4);
  });
  it('counts a line that goes quiet as dropped', async () => {
    client.start(['raid']);
    sockets[0].welcome('s1', 10);
    await settle();
    await clock.advance(10_000 + QUIET_MARGIN_MS - 100);
    expect(client.state).toBe('listening');
    sockets[0].say('session_keepalive');
    await clock.advance(10_000 + QUIET_MARGIN_MS - 100);
    expect(client.state).toBe('listening');
    await clock.advance(200);
    expect(client.state).toBe('reconnecting');
    expect(sockets[0].closed).toBe(true);
  });
  it('tries again when Twitch could not be reached to subscribe', async () => {
    outcome = { refused: [], offline: true };
    client.start(['raid']);
    sockets[0].welcome('s1');
    await settle();
    expect(client.state).toBe('reconnecting');
    outcome = { refused: [] };
    await clock.advance(1001);
    sockets[1].welcome('s2');
    await settle();
    expect(client.state).toBe('listening');
  });
  it('reports the kinds Twitch refused', async () => {
    outcome = { refused: ['redemption'] };
    let seen: unknown;
    const c = new EventSubClient({ socket: (u) => (sockets.push(new FakeSocket(u)), last()), later: clock.later, now: clock.now, subscribe: async () => outcome, onEvent: () => undefined, onState: (s) => (seen = s), onAuthLost: () => undefined });
    c.start(['redemption']);
    last().welcome();
    await settle();
    expect(seen).toEqual({ listening: 'listening', refused: ['redemption'] });
  });
});

describe('Twitch moving us', () => {
  it('opens the new address, swaps over on its welcome without subscribing again, and closes the old line', async () => {
    client.start(['raid']);
    sockets[0].welcome('s1');
    await settle();
    sockets[0].say('session_reconnect', { session: { id: 's1', reconnect_url: 'wss://moved.example/ws' } });
    expect(sockets[1].url).toBe('wss://moved.example/ws');
    sockets[1].welcome('s1');
    await settle();
    expect(subscribed).toHaveLength(1);
    expect(sockets[0].closed).toBe(true);
    expect(client.state).toBe('listening');
    sockets[1].notify('channel.raid', { viewers: 3 });
    expect(events).toEqual([{ kind: 'raid', viewers: 3 }]);
    // The old line closing later is not a drop.
    sockets[0].drop();
    expect(client.state).toBe('listening');
  });
  it('will not follow an address that is not a secure socket', async () => {
    client.start(['raid']);
    sockets[0].welcome();
    await settle();
    sockets[0].say('session_reconnect', { session: { reconnect_url: 'ws://plain.example/ws' } });
    expect(sockets).toHaveLength(1);
  });
});

describe('signed out and stopped', () => {
  it('stops and says so when Twitch revokes the sign-in', async () => {
    client.start(['raid']);
    sockets[0].welcome();
    await settle();
    sockets[0].say('revocation', { subscription: { status: 'authorization_revoked' } });
    expect(authLost).toBe(1);
    expect(client.state).toBe('off');
    expect(sockets[0].closed).toBe(true);
  });
  it('stops and says so when subscribing finds the token no good', async () => {
    outcome = { refused: [], authLost: true };
    client.start(['raid']);
    sockets[0].welcome();
    await settle();
    expect(authLost).toBe(1);
    expect(client.state).toBe('off');
  });
  it('stop closes the line, cancels every wait and never reconnects', async () => {
    client.start(['raid']);
    sockets[0].welcome();
    await settle();
    sockets[0].drop();
    client.stop();
    await clock.advance(120_000);
    expect(sockets).toHaveLength(1);
    expect(client.state).toBe('off');
    expect(clock.timers).toHaveLength(0);
  });
  it('is safe to stop twice, and to start again after', async () => {
    client.start(['raid']);
    client.stop();
    client.stop();
    client.start(['cheer']);
    expect(sockets).toHaveLength(2);
    sockets[1].welcome();
    await settle();
    expect(subscribed[0].kinds).toEqual(['cheer']);
  });
});

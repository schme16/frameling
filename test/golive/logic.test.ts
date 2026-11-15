// The Go live quest's checks as plain functions: each step needs something to have happened, and the order is the order
// a streamer sets things up in.
import { describe, expect, it } from 'vitest';
import { doneCount, firstUndone, GO_LIVE_STEPS, stepDone, type GoLiveSnapshot } from '../../src/golive/logic';

const none: GoLiveSnapshot = { audienceOn: false, setupFileSaved: false, doorAddressCopied: false, obsConnected: false, streamSafeOn: false, twitchSignedIn: false, overlayAddressCopied: false, overlayTested: false };
const all: GoLiveSnapshot = { audienceOn: true, setupFileSaved: true, doorAddressCopied: true, obsConnected: true, streamSafeOn: true, twitchSignedIn: true, overlayAddressCopied: true, overlayTested: true };

describe('the Go live checks', () => {
  it('has the seven steps in setup order', () => {
    expect(GO_LIVE_STEPS).toEqual(['audience', 'door', 'obs', 'safe', 'twitch', 'overlay', 'test']);
  });

  it('counts nothing as done to begin with, and everything once it all happened', () => {
    expect(GO_LIVE_STEPS.filter((s) => stepDone(s, none))).toEqual([]);
    expect(firstUndone(none)).toBe('audience');
    expect(doneCount(none)).toBe(0);
    expect(GO_LIVE_STEPS.every((s) => stepDone(s, all))).toBe(true);
    expect(firstUndone(all)).toBeNull();
    expect(doneCount(all)).toBe(7);
  });

  it('each step looks at its own thing and nothing else', () => {
    const only = (patch: Partial<GoLiveSnapshot>) => GO_LIVE_STEPS.filter((s) => stepDone(s, { ...none, ...patch }));
    expect(only({ audienceOn: true })).toEqual(['audience']);
    expect(only({ obsConnected: true })).toEqual(['obs']);
    expect(only({ streamSafeOn: true })).toEqual(['safe']);
    expect(only({ twitchSignedIn: true })).toEqual(['twitch']);
    expect(only({ overlayAddressCopied: true })).toEqual(['overlay']);
    expect(only({ overlayTested: true })).toEqual(['test']);
  });

  it('counts the actions door as done for a Firebot user (the file) and for anybody else (the address)', () => {
    expect(stepDone('door', { ...none, setupFileSaved: true })).toBe(true);
    expect(stepDone('door', { ...none, doorAddressCopied: true })).toBe(true);
    expect(stepDone('door', none)).toBe(false);
  });

  it('points at the first thing left, skipping what is done', () => {
    expect(firstUndone({ ...none, audienceOn: true, doorAddressCopied: true })).toBe('obs');
    expect(firstUndone({ ...all, overlayTested: false })).toBe('test');
  });
});

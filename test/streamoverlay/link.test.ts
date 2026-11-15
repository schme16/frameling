// The page's end of the overlay, with a pretend desktop side: it says on and off in order, sends what is going on a
// moment after it changes (a burst is one message), keeps telling the desktop side the app is alive, and goes quiet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEAT_MS, createOverlayLink, SETTLE_MS } from '../../src/streamoverlay/link';

let calls: string[];
let running: boolean;
let changed: (() => void) | null;
let doorChanged: (() => void) | null;
let n: number;
let hasBridge: boolean;

const link = () =>
  createOverlayLink({
    bridge: () =>
      hasBridge
        ? {
            setOn: async (on) => void calls.push(`on ${on}`),
            push: async (s) => void calls.push(`push ${JSON.stringify(s)}`),
            url: async () => '',
            roll: async () => undefined,
          }
        : null,
    build: () => ({ n: ++n }),
    watch: (fn) => {
      changed = fn;
      return () => void (changed = null);
    },
    door: {
      running: () => running,
      watch: (fn) => {
        doorChanged = fn;
        return () => void (doorChanged = null);
      },
    },
  });

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  running = true;
  changed = null;
  doorChanged = null;
  n = 0;
  hasBridge = true;
});
afterEach(() => vi.useRealTimers());

describe('the overlay link', () => {
  it('says it is on, sends what is going on, and watches', async () => {
    link().start();
    await flush();
    expect(calls).toEqual(['on true', 'push {"n":1}']);
    expect(changed).not.toBeNull();
  });
  it('sends a burst of changes as one message, a moment after', async () => {
    link().start();
    await flush();
    calls.length = 0;
    changed!();
    changed!();
    changed!();
    await vi.advanceTimersByTimeAsync(SETTLE_MS - 1);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(calls).toEqual(['push {"n":2}']);
  });
  it('keeps telling the desktop side the app is still there', async () => {
    link().start();
    await flush();
    calls.length = 0;
    await vi.advanceTimersByTimeAsync(BEAT_MS * 2 + 10);
    expect(calls.filter((c) => c.startsWith('push'))).toHaveLength(2);
  });
  it('waits for the door: nothing is said while it is closed, and it says on when it opens', async () => {
    running = false;
    link().start();
    await flush();
    expect(calls).toEqual([]);
    expect(changed).toBeNull();
    running = true;
    doorChanged!();
    await flush();
    expect(calls).toEqual(['on true', 'push {"n":1}']);
  });
  it('goes quiet when the door closes (it is already off on the other side) and comes back when it reopens', async () => {
    link().start();
    await flush();
    calls.length = 0;
    running = false;
    doorChanged!();
    await vi.advanceTimersByTimeAsync(BEAT_MS * 3);
    expect(calls).toEqual([]);
    expect(changed).toBeNull();
    running = true;
    doorChanged!();
    await flush();
    expect(calls[0]).toBe('on true');
  });
  it('says off when the feature goes, stops sending, and stops following the door', async () => {
    const l = link();
    l.start();
    await flush();
    calls.length = 0;
    l.stop();
    await vi.advanceTimersByTimeAsync(BEAT_MS * 3);
    expect(calls).toEqual(['on false']);
    expect(changed).toBeNull();
    expect(doorChanged).toBeNull();
  });
  it('does nothing in a build with no desktop side', async () => {
    hasBridge = false;
    link().start();
    await vi.advanceTimersByTimeAsync(BEAT_MS * 2);
    expect(calls).toEqual([]);
  });
  it('starting twice does not double anything', async () => {
    const l = link();
    l.start();
    l.start();
    await flush();
    expect(calls.filter((c) => c === 'on true')).toHaveLength(1);
  });
});

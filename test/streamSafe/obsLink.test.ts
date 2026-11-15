// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsLink, SAID, type ObsDeps } from '../../src/streamsafe/obsLink';
import type { ObsBridge } from '../../src/preload/api';

type Reply = Awaited<ReturnType<ObsBridge['connect']>>;

/** A pretend OBS and a pretend clock: nothing real is touched. */
function rig(opts: { bridge?: boolean; address?: string } = {}) {
  const said: string[] = [];
  const timers: { fn: () => void; ms: number; id: number; on: boolean }[] = [];
  const offers: ((turnOff: boolean) => void)[] = [];
  let safe = false;
  const safeListeners = new Set<() => void>();
  let handler: Parameters<ObsBridge['onEvent']>[0] | null = null;
  const replies: Reply[] = [];
  const calls = { connect: 0, disconnect: 0, setPassword: [] as (string | null)[] };
  const bridge: ObsBridge = {
    status: async () => ({ canSave: true, hasPassword: false }),
    setPassword: async (p) => {
      calls.setPassword.push(p);
      return { hasPassword: !!p, saved: !!p };
    },
    connect: async () => {
      calls.connect++;
      return replies.shift() ?? { ok: false, why: 'unreachable' };
    },
    disconnect: async () => void calls.disconnect++,
    onEvent: (h) => {
      handler = h;
      return () => void (handler = null);
    },
  };
  const deps: ObsDeps = {
    bridge: opts.bridge === false ? null : bridge,
    address: () => opts.address ?? 'localhost:4455',
    isSafe: () => safe,
    setSafe: (on) => {
      safe = on;
      for (const f of [...safeListeners]) f();
    },
    onSafe: (f) => {
      safeListeners.add(f);
      return () => void safeListeners.delete(f);
    },
    offerOff: (run) => void offers.push(run),
    say: (t) => void said.push(t),
    setTimer: (fn, ms) => {
      const t = { fn, ms, id: timers.length, on: true };
      timers.push(t);
      return t.id;
    },
    clearTimer: (h) => {
      const t = timers[h as number];
      if (t) t.on = false;
    },
  };
  const link = new ObsLink(deps);
  link.attach();
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const fire = () => {
    const t = timers.filter((x) => x.on).pop();
    if (!t) throw new Error('no timer waiting');
    t.on = false;
    t.fn();
  };
  return {
    link,
    said,
    offers,
    calls,
    replies,
    timers,
    flush,
    fire,
    isSafe: () => safe,
    flipSafe: (on: boolean) => deps.setSafe(on),
    send: (m: Parameters<ObsBridge['onEvent']>[0] extends (e: infer E) => void ? E : never) => handler?.(m),
    waiting: () => timers.filter((t) => t.on),
  };
}
const ok = (streaming = false, recording = false): Reply => ({ ok: true, streaming, recording });

describe('OBS not being there', () => {
  it('is quiet: no message, a waiting state, one retry queued', async () => {
    const r = rig();
    r.link.enable();
    await r.flush();
    expect(r.link.state.link).toBe('waiting');
    expect(r.said).toEqual([]);
    expect(r.waiting()).toHaveLength(1);
    expect(r.isSafe()).toBe(false);
  });
  it('keeps looking, finds OBS when it starts, and says nothing when it was a quiet retry', async () => {
    const r = rig();
    r.link.enable({ quiet: true });
    await r.flush();
    r.fire();
    await r.flush();
    expect(r.link.state.link).toBe('waiting');
    r.replies.push(ok());
    r.fire();
    await r.flush();
    expect(r.link.state.link).toBe('connected');
    expect(r.said).toEqual([]);
    expect(r.waiting()).toHaveLength(0);
  });
  it('says "Connected" when the person switched it on and OBS is there', async () => {
    const r = rig();
    r.replies.push(ok());
    r.link.enable();
    await r.flush();
    expect(r.said).toEqual([SAID.connected]);
  });
  it('a bridge that throws is just OBS not being there', async () => {
    const r = rig();
    r.link.useBridge({ ...({} as ObsBridge), status: async () => ({ canSave: false, hasPassword: false }), connect: async () => Promise.reject(new Error('boom')), disconnect: async () => undefined, onEvent: () => () => undefined });
    r.link.enable();
    await r.flush();
    expect(r.link.state.link).toBe('waiting');
    expect(r.said).toEqual([]);
  });
  it('a bad address never reaches OBS and waits for the person', async () => {
    const r = rig({ address: 'example.com' });
    r.link.enable();
    await r.flush();
    expect(r.link.state.link).toBe('address');
    expect(r.calls.connect).toBe(0);
    expect(r.waiting()).toHaveLength(0);
  });
  it('without a desktop side it says so once and does nothing', async () => {
    const r = rig({ bridge: false });
    r.link.enable();
    expect(r.said).toEqual([SAID.noDesktop]);
    expect(r.link.state.link).toBe('off');
    expect(r.link.available).toBe(false);
  });
  it('a wrong password stops retrying; giving the right one connects', async () => {
    const r = rig();
    r.replies.push({ ok: false, why: 'password' });
    r.link.enable();
    await r.flush();
    expect(r.link.state.link).toBe('password');
    expect(r.waiting()).toHaveLength(0);
    r.replies.push(ok());
    await r.link.setPassword('hunter2', true);
    await r.flush();
    expect(r.calls.setPassword).toEqual(['hunter2']);
    expect(r.link.state.link).toBe('connected');
  });
  it('the password is never held by the controller', async () => {
    const r = rig();
    await r.link.setPassword('hunter2', true);
    expect(JSON.stringify(r.link.password)).not.toContain('hunter2');
    expect(JSON.stringify(r.link.state)).not.toContain('hunter2');
  });
  it('switching off while a try is in flight drops its answer', async () => {
    const r = rig();
    r.replies.push(ok(true, false));
    r.link.enable();
    r.link.disable();
    await r.flush();
    expect(r.link.state.link).toBe('off');
    expect(r.isSafe()).toBe(false);
  });
});

describe('going live and stopping', () => {
  const live = async () => {
    const r = rig();
    r.replies.push(ok());
    r.link.enable();
    await r.flush();
    r.said.length = 0;
    return r;
  };
  it('starting to stream turns Stream-safe on and tells you', async () => {
    const r = await live();
    r.send({ type: 'output', kind: 'stream', active: true });
    expect(r.isSafe()).toBe(true);
    expect(r.said).toEqual([SAID.streamOn]);
  });
  it('recording says recording', async () => {
    const r = await live();
    r.send({ type: 'output', kind: 'record', active: true });
    expect(r.said).toEqual([SAID.recordOn]);
  });
  it('stopping asks, and does not switch off by itself', async () => {
    const r = await live();
    r.send({ type: 'output', kind: 'stream', active: true });
    r.send({ type: 'output', kind: 'stream', active: false });
    expect(r.offers).toHaveLength(1);
    expect(r.isSafe()).toBe(true);
  });
  it('"turn it off" switches it off and says so; "leave it on" does nothing', async () => {
    const r = await live();
    r.send({ type: 'output', kind: 'stream', active: true });
    r.send({ type: 'output', kind: 'stream', active: false });
    r.offers[0](false);
    expect(r.isSafe()).toBe(true);
    r.offers[0](true);
    expect(r.isSafe()).toBe(false);
    expect(r.said.at(-1)).toBe(SAID.off);
  });
  it('going live again while the question is open keeps it on', async () => {
    const r = await live();
    r.send({ type: 'output', kind: 'stream', active: true });
    r.send({ type: 'output', kind: 'stream', active: false });
    r.send({ type: 'output', kind: 'stream', active: true });
    r.offers[0](true);
    expect(r.isSafe()).toBe(true);
  });
  it('already on by hand: nothing is switched or offered, and your own choice is left alone', async () => {
    const r = await live();
    r.flipSafe(true);
    r.send({ type: 'output', kind: 'stream', active: true });
    r.send({ type: 'output', kind: 'stream', active: false });
    expect(r.said).toEqual([]);
    expect(r.offers).toHaveLength(0);
    expect(r.isSafe()).toBe(true);
  });
  it('already live when Frameling connects', async () => {
    const r = rig();
    r.replies.push(ok(true, false));
    r.link.enable();
    await r.flush();
    expect(r.isSafe()).toBe(true);
    expect(r.said).toEqual([SAID.streamOn]);
  });
  it('OBS quitting mid-stream offers to turn it off, then looks for OBS again', async () => {
    const r = await live();
    r.send({ type: 'output', kind: 'stream', active: true });
    r.send({ type: 'closed' });
    expect(r.offers).toHaveLength(1);
    expect(r.link.state.link).toBe('waiting');
    expect(r.waiting()).toHaveLength(1);
  });
  it('switching the link off mid-stream leaves Stream-safe as it is', async () => {
    const r = await live();
    r.send({ type: 'output', kind: 'stream', active: true });
    r.link.disable();
    expect(r.isSafe()).toBe(true);
    expect(r.offers).toHaveLength(0);
  });
  it('a changed address looks again', async () => {
    const r = await live();
    r.replies.push(ok());
    r.link.addressChanged();
    await r.flush();
    expect(r.calls.connect).toBe(2);
    expect(r.link.state.link).toBe('connected');
  });
});

describe('the "when OBS stops" question uses the ask-once choices', () => {
  beforeEach(() => localStorage.clear());
  afterEach(async () => {
    const c = await import('../../src/core/choices');
    c.setChoiceAsker(null);
    c.setChoice('stream.golive.stop', undefined);
  });
  it('is registered with the safe answer as the usual one', async () => {
    await import('../../src/streamsafe/obs');
    const { getChoiceDef } = await import('../../src/core/choices');
    const d = getChoiceDef('stream.golive.stop')!;
    expect(d.default).toBe('keep');
    expect(d.dismiss).toBe('keep');
    expect(d.options.map((o) => o.value)).toEqual(['off', 'keep', 'wait']);
    expect(d.options.find((o) => o.value === 'wait')?.once).toBe(true);
  });
  it('asks the first time, and a remembered "off" then acts at once', async () => {
    const { obs } = await import('../../src/streamsafe/obs');
    const c = await import('../../src/core/choices');
    const asked: string[] = [];
    c.setChoiceAsker(async (def) => {
      asked.push(def.id);
      return { value: 'off', remember: true };
    });
    // The real controller's deps, driven through the same question the person would see.
    const turned: boolean[] = [];
    c.withChoice<'off' | 'keep' | 'wait'>('stream.golive.stop', (v) => turned.push(v === 'off'));
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toEqual(['stream.golive.stop']);
    expect(turned).toEqual([true]);
    c.withChoice<'off' | 'keep' | 'wait'>('stream.golive.stop', (v) => turned.push(v === 'off'));
    expect(turned).toEqual([true, true]);
    expect(asked).toHaveLength(1);
    expect(obs.available).toBe(false);
  });
  it('closing the question counts as leaving it on, and is not remembered', async () => {
    await import('../../src/streamsafe/obs');
    const c = await import('../../src/core/choices');
    c.setChoiceAsker(async () => null);
    const turned: boolean[] = [];
    c.withChoice<'off' | 'keep' | 'wait'>('stream.golive.stop', (v) => turned.push(v === 'off'));
    await new Promise((r) => setTimeout(r, 0));
    expect(turned).toEqual([false]);
    expect(c.rememberedChoice('stream.golive.stop')).toBeUndefined();
  });
});

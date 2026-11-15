import { beforeEach, describe, expect, it } from 'vitest';
import { cooldownLeft, createGate, DEFAULT_COOLDOWN_MS, lasts, limitsFor, nextRunAt, STRICTNESS, type AudienceActionDef, type Gate, type GateLimits } from '../../src/audience/gate';

// A clock we move by hand, and timers that only fire when we say.
function world(limits: Partial<GateLimits> = {}, edits: string[] = []) {
  let t = 1_000_000;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  const lim: GateLimits = { ...STRICTNESS.balanced, ...limits };
  const gate = createGate({
    now: () => t,
    later: (fn, ms) => {
      const x = { at: t + ms, fn, live: true };
      timers.push(x);
      return () => void (x.live = false);
    },
    limits: () => lim,
    edit: (label, recipe) => {
      edits.push(label);
      recipe({} as never);
    },
  });
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      const next = timers.filter((x) => x.live && x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      next.live = false;
      t = Math.max(t, next.at);
      next.fn();
    }
    t = end;
  };
  return { gate, lim, advance, now: () => t, pending: () => timers.filter((x) => x.live).length };
}

const act = (id: string, kind = 'quill', over: Partial<AudienceActionDef> = {}, log: string[] = []): AudienceActionDef => ({ id, label: id, kind, cooldown: 0, run: () => void log.push(id), ...over });

describe('registering', () => {
  let g: Gate;
  beforeEach(() => (g = world().gate));

  it('takes a well formed action and lists it', () => {
    g.registerAction(act('quill.cheer'));
    expect(g.snapshot().actions).toEqual([{ id: 'quill.cheer', label: 'quill.cheer', kind: 'quill', cooldown: 0, touchesDrawing: false, available: true }]);
  });
  it('lists the default cooldown for one that did not say', () => {
    g.registerAction(act('quill.cheer', 'quill', { cooldown: undefined }));
    expect(g.snapshot().actions[0].cooldown).toBe(DEFAULT_COOLDOWN_MS);
  });
  it('refuses bad ids, kinds, labels, cooldowns and a missing run', () => {
    expect(() => g.registerAction(act('cheer'))).toThrow(/area\.name/);
    expect(() => g.registerAction(act('Quill.Cheer'))).toThrow(/area\.name/);
    expect(() => g.registerAction(act('quill.cheer', 'Quill'))).toThrow(/kind/);
    expect(() => g.registerAction(act('quill.cheer', 'quill', { label: '  ' }))).toThrow(/label/);
    expect(() => g.registerAction(act('quill.cheer', 'quill', { cooldown: -1 }))).toThrow(/cooldown/);
    expect(() => g.registerAction(act('quill.cheer', 'quill', { cooldown: NaN }))).toThrow(/cooldown/);
    expect(() => g.registerAction({ ...act('quill.cheer'), run: undefined as never })).toThrow(/run/);
  });
  it('refuses an id twice, so two features cannot share one', () => {
    g.registerAction(act('quill.cheer'));
    expect(() => g.registerAction(act('quill.cheer'))).toThrow(/already/);
  });
  it('takes an action back, and it can be registered again', () => {
    const off = g.registerAction(act('quill.cheer'));
    off();
    expect(g.snapshot().actions).toEqual([]);
    expect(() => g.registerAction(act('quill.cheer'))).not.toThrow();
  });
  it('an old unregister does not remove a newer registration of the same id', () => {
    const off = g.registerAction(act('quill.cheer'));
    off();
    g.registerAction(act('quill.cheer'));
    off();
    expect(g.snapshot().actions).toHaveLength(1);
  });
});

describe('the master switch and the allowlist', () => {
  it('starts off, and refuses everything while off', () => {
    const { gate } = world();
    const log: string[] = [];
    gate.registerAction(act('quill.cheer', 'quill', {}, log));
    expect(gate.isOn()).toBe(false);
    expect(gate.submit('quill.cheer')).toEqual({ ok: false, reason: 'off' });
    expect(log).toEqual([]);
    expect(gate.snapshot().counts.rejected.off).toBe(1);
  });
  it('runs a registered action once on', () => {
    const { gate } = world();
    const log: string[] = [];
    gate.registerAction(act('quill.cheer', 'quill', {}, log));
    gate.setOn(true);
    expect(gate.submit('quill.cheer')).toEqual({ ok: true, outcome: 'ran' });
    expect(log).toEqual(['quill.cheer']);
  });
  it('turns away an id nobody registered', () => {
    const { gate } = world();
    gate.setOn(true);
    expect(gate.submit('dare.deleteEverything')).toEqual({ ok: false, reason: 'unknown' });
    expect(gate.submit('')).toEqual({ ok: false, reason: 'unknown' });
    expect(gate.submit(undefined as never)).toEqual({ ok: false, reason: 'unknown' });
    expect(gate.submit('constructor')).toEqual({ ok: false, reason: 'unknown' });
    expect(gate.submit('__proto__')).toEqual({ ok: false, reason: 'unknown' });
    expect(gate.snapshot().counts.rejected.unknown).toBe(5);
  });
  it('turns away an action that was taken off the allowlist', () => {
    const { gate } = world();
    const off = gate.registerAction(act('quill.cheer'));
    gate.setOn(true);
    off();
    expect(gate.submit('quill.cheer')).toEqual({ ok: false, reason: 'unknown' });
  });
  it('says nothing of what is registered while off (off comes before unknown)', () => {
    const { gate } = world();
    expect(gate.submit('nothing.here')).toEqual({ ok: false, reason: 'off' });
  });
});

describe('payloads', () => {
  it('passes no payload unless the action parses it', () => {
    const { gate } = world();
    let seen: unknown = 'unset';
    gate.registerAction({ ...act('quill.say'), run: (p: unknown) => void (seen = p) } as AudienceActionDef);
    gate.setOn(true);
    gate.submit('quill.say', { text: 'hi', who: 'someone' });
    expect(seen).toBeUndefined();
  });
  it('passes what parse returns, not what came in', () => {
    const { gate } = world();
    let seen: unknown;
    gate.registerAction<{ word: string }>({ id: 'prompt.add', label: 'Add a prompt', kind: 'prompt', cooldown: 0, parse: (raw) => (typeof (raw as { word?: unknown })?.word === 'string' ? { word: (raw as { word: string }).word.slice(0, 20) } : null), run: (p) => void (seen = p) });
    gate.setOn(true);
    expect(gate.submit('prompt.add', { word: 'dragon', user: 'viewer42' })).toEqual({ ok: true, outcome: 'ran' });
    expect(seen).toEqual({ word: 'dragon' });
  });
  it('turns away a payload that does not parse, before it waits in line or costs a cooldown', () => {
    const { gate } = world();
    let ran = 0;
    gate.registerAction<number>({ id: 'vote.cast', label: 'Vote', kind: 'vote', cooldown: 5000, parse: (r) => (typeof r === 'number' ? r : null), run: () => void ran++ });
    gate.setOn(true);
    expect(gate.submit('vote.cast', 'nope')).toEqual({ ok: false, reason: 'invalid' });
    expect(gate.submit('vote.cast')).toEqual({ ok: false, reason: 'invalid' });
    expect(gate.submit('vote.cast', 1)).toEqual({ ok: true, outcome: 'ran' });
    expect(ran).toBe(1);
  });
  it('treats a parse that throws as invalid', () => {
    const { gate } = world();
    gate.registerAction({ ...act('vote.cast', 'vote'), parse: () => { throw new Error('boom'); } } as AudienceActionDef);
    gate.setOn(true);
    expect(gate.submit('vote.cast', 1)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('cooldowns', () => {
  it('pure: time left', () => {
    expect(cooldownLeft(100, undefined, 5000)).toBe(0);
    expect(cooldownLeft(1000, 0, 5000)).toBe(4000);
    expect(cooldownLeft(5000, 0, 5000)).toBe(0);
    expect(cooldownLeft(9000, 0, 5000)).toBe(0);
  });
  it('holds a kind back, saying how long', () => {
    const w = world({ minGapMs: 0, maxPerMinute: 100 });
    w.gate.registerAction(act('quill.cheer', 'quill', { cooldown: 8000 }));
    w.gate.setOn(true);
    expect(w.gate.submit('quill.cheer').ok).toBe(true);
    w.advance(3000);
    expect(w.gate.submit('quill.cheer')).toEqual({ ok: false, reason: 'cooldown', retryInMs: 5000 });
    w.advance(5000);
    expect(w.gate.submit('quill.cheer')).toEqual({ ok: true, outcome: 'ran' });
  });
  it('is shared by every action of a kind, and not by other kinds', () => {
    const w = world({ minGapMs: 0, maxPerMinute: 100 });
    w.gate.registerAction(act('quill.cheer', 'quill', { cooldown: 8000 }));
    w.gate.registerAction(act('quill.hop', 'quill', { cooldown: 8000 }));
    w.gate.registerAction(act('dare.flip', 'dare', { cooldown: 8000 }));
    w.gate.setOn(true);
    expect(w.gate.submit('quill.cheer').ok).toBe(true);
    expect(w.gate.submit('quill.hop')).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(w.gate.submit('dare.flip').ok).toBe(true);
  });
  it('is scaled by how strict the streamer is', () => {
    const w = world({ minGapMs: 0, maxPerMinute: 100, cooldownScale: 2 });
    w.gate.registerAction(act('quill.cheer', 'quill', { cooldown: 4000 }));
    w.gate.setOn(true);
    w.gate.submit('quill.cheer');
    w.advance(5000);
    expect(w.gate.submit('quill.cheer')).toMatchObject({ reason: 'cooldown', retryInMs: 3000 });
  });
  it('uses the default for an action that did not say', () => {
    const w = world({ minGapMs: 0, maxPerMinute: 100 });
    w.gate.registerAction(act('quill.cheer', 'quill', { cooldown: undefined }));
    w.gate.setOn(true);
    w.gate.submit('quill.cheer');
    expect(w.gate.submit('quill.cheer')).toMatchObject({ reason: 'cooldown', retryInMs: DEFAULT_COOLDOWN_MS });
  });
  it('starts at once for a queued request too, so spam of one kind cannot fill the queue', () => {
    const w = world({ minGapMs: 5000, maxPerMinute: 100 });
    w.gate.registerAction(act('quill.cheer', 'quill', { cooldown: 20_000 }));
    w.gate.registerAction(act('dare.flip', 'dare', { cooldown: 0 }));
    w.gate.setOn(true);
    w.gate.submit('dare.flip');
    expect(w.gate.submit('quill.cheer')).toMatchObject({ outcome: 'queued' });
    expect(w.gate.submit('quill.cheer')).toMatchObject({ reason: 'cooldown' });
    expect(w.gate.snapshot().queue).toHaveLength(1);
  });
  it('a refused request costs no cooldown', () => {
    const w = world({ minGapMs: 0, maxPerMinute: 100, maxQueue: 1 });
    w.gate.registerAction(act('quill.cheer', 'quill', { cooldown: 1000 }));
    w.gate.setOn(true);
    w.gate.submit('quill.cheer');
    w.gate.submit('quill.cheer');
    expect(w.gate.snapshot().counts.rejected.cooldown).toBe(1);
    expect(w.gate.snapshot().counts.ran).toBe(1);
  });
});

describe('the global rate limit and the queue', () => {
  it('pure: when may the next one start', () => {
    const lim = { minGapMs: 3000, maxPerMinute: 2 };
    expect(nextRunAt(100, null, [], lim)).toBe(-Infinity);
    expect(nextRunAt(1000, 0, [0], lim)).toBe(3000);
    expect(nextRunAt(10_000, 0, [0, 5000], lim)).toBe(60_000);
    expect(nextRunAt(70_000, 5000, [0, 5000], lim)).toBe(8000); // the minute passed
    expect(nextRunAt(10_000, null, [], { minGapMs: 0, maxPerMinute: 0 })).toBe(-Infinity); // zero is read as one, not none
  });

  function two() {
    const w = world({ minGapMs: 3000, maxPerMinute: 100, maxQueue: 3 });
    const log: string[] = [];
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) w.gate.registerAction(act(`x.${k}`, `kind-${k}`, {}, log));
    w.gate.setOn(true);
    return { ...w, log };
  }

  it('lets the first go and queues what comes inside the gap', () => {
    const { gate, log } = two();
    expect(gate.submit('x.a')).toEqual({ ok: true, outcome: 'ran' });
    expect(gate.submit('x.b')).toEqual({ ok: true, outcome: 'queued', position: 1 });
    expect(gate.submit('x.c')).toEqual({ ok: true, outcome: 'queued', position: 2 });
    expect(log).toEqual(['x.a']);
    expect(gate.snapshot().queue.map((q) => q.label)).toEqual(['x.b', 'x.c']);
  });
  it('starts the queue in order, one gap apart, by itself', () => {
    const { gate, log, advance } = two();
    gate.submit('x.a');
    gate.submit('x.b');
    gate.submit('x.c');
    advance(2999);
    expect(log).toEqual(['x.a']);
    advance(2);
    expect(log).toEqual(['x.a', 'x.b']);
    advance(3000);
    expect(log).toEqual(['x.a', 'x.b', 'x.c']);
    expect(gate.snapshot().queue).toEqual([]);
    expect(gate.snapshot().counts).toMatchObject({ ran: 3, queued: 2 });
  });
  it('nothing jumps the queue, even when the gap has passed', () => {
    const { gate, log, advance } = two();
    gate.submit('x.a');
    gate.submit('x.b');
    advance(2000);
    gate.submit('x.c');
    expect(log).toEqual(['x.a']);
    advance(1100);
    expect(log).toEqual(['x.a', 'x.b']);
  });
  it('refuses when the queue is full', () => {
    const { gate } = two();
    gate.submit('x.a');
    gate.submit('x.b');
    gate.submit('x.c');
    gate.submit('x.d');
    expect(gate.submit('x.e')).toEqual({ ok: false, reason: 'queue-full' });
    expect(gate.snapshot().counts.rejected['queue-full']).toBe(1);
  });
  it('holds to most-per-minute even with no gap', () => {
    const w = world({ minGapMs: 0, maxPerMinute: 3, maxQueue: 5, maxWaitMs: 120_000 });
    const log: string[] = [];
    for (const k of 'abcde') w.gate.registerAction(act(`x.${k}`, `kind-${k}`, {}, log));
    w.gate.setOn(true);
    for (const k of 'abcde') w.gate.submit(`x.${k}`);
    expect(log).toEqual(['x.a', 'x.b', 'x.c']);
    expect(w.gate.snapshot().queue).toHaveLength(2);
    w.advance(59_000);
    expect(log).toHaveLength(3);
    w.advance(2000);
    expect(log).toEqual(['x.a', 'x.b', 'x.c', 'x.d', 'x.e']);
  });
  it('drops what waited too long', () => {
    const w = world({ minGapMs: 100_000, maxPerMinute: 100, maxQueue: 3, maxWaitMs: 10_000 });
    const log: string[] = [];
    for (const k of 'abc') w.gate.registerAction(act(`x.${k}`, `kind-${k}`, {}, log));
    w.gate.setOn(true);
    w.gate.submit('x.a');
    w.gate.submit('x.b');
    w.advance(11_000);
    expect(log).toEqual(['x.a']);
    expect(w.gate.snapshot().queue).toEqual([]);
    expect(w.gate.snapshot().counts.expired).toBe(1);
  });
  it('a new, stricter limit acts on the very next request', () => {
    const { gate, lim, advance } = two();
    gate.submit('x.a');
    advance(3500);
    lim.minGapMs = 10_000;
    expect(gate.submit('x.b')).toMatchObject({ outcome: 'queued' });
  });
  it('drops what waited on an action that was taken away', () => {
    const w = world({ minGapMs: 3000, maxPerMinute: 100 });
    const log: string[] = [];
    w.gate.registerAction(act('x.a', 'ka', {}, log));
    const off = w.gate.registerAction(act('x.b', 'kb', {}, log));
    w.gate.setOn(true);
    w.gate.submit('x.a');
    w.gate.submit('x.b');
    off();
    expect(w.gate.snapshot().queue).toEqual([]);
    w.advance(5000);
    expect(log).toEqual(['x.a']);
    expect(w.gate.snapshot().counts.cleared).toBe(1);
  });
  it('keeps no timer waiting when the queue is empty', () => {
    const w = two();
    w.gate.submit('x.a');
    w.gate.submit('x.b');
    expect(w.pending()).toBeGreaterThan(0);
    w.advance(4000);
    expect(w.pending()).toBe(0);
  });
});

describe('clearing and kill', () => {
  it('empties the queue only, and counts it', () => {
    const w = world({ minGapMs: 3000, maxPerMinute: 100 });
    for (const k of 'abc') w.gate.registerAction(act(`x.${k}`, `kind-${k}`));
    w.gate.setOn(true);
    w.gate.submit('x.a');
    w.gate.submit('x.b');
    w.gate.submit('x.c');
    expect(w.gate.clearQueue()).toBe(2);
    expect(w.gate.clearQueue()).toBe(0);
    expect(w.gate.isOn()).toBe(true);
    expect(w.gate.snapshot().counts.cleared).toBe(2);
    expect(w.pending()).toBe(0);
  });
  it('kill empties the queue, aborts running effects, closes the doors and switches off', async () => {
    const w = world({ minGapMs: 3000, maxPerMinute: 100 });
    const log: string[] = [];
    let aborted = false;
    let doorOpen = false;
    w.gate.registerDoor({ id: 'door.local', label: 'Local', open: () => (doorOpen = true), close: () => (doorOpen = false) });
    w.gate.registerAction(act('dare.flip', 'dare', { run: async (_p, { signal }) => { await lasts(60_000, signal); aborted = signal.aborted; } }));
    w.gate.registerAction(act('quill.cheer', 'quill', {}, log));
    w.gate.setOn(true);
    expect(doorOpen).toBe(true);
    w.gate.submit('dare.flip');
    w.gate.submit('quill.cheer');
    expect(w.gate.snapshot().running).toBe(1);
    expect(w.gate.snapshot().queue).toHaveLength(1);
    w.gate.kill();
    expect(w.gate.isOn()).toBe(false);
    expect(doorOpen).toBe(false);
    expect(w.gate.snapshot().queue).toEqual([]);
    expect(w.gate.snapshot().running).toBe(0);
    expect(w.gate.snapshot().counts).toMatchObject({ kills: 1, cleared: 1 });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(aborted).toBe(true);
    w.advance(10_000);
    expect(log).toEqual([]); // the queued one never runs
    expect(w.gate.submit('quill.cheer')).toEqual({ ok: false, reason: 'off' });
    expect(w.pending()).toBe(0);
  });
  it('switching off does the same as kill, without the kill count', () => {
    const w = world({ minGapMs: 3000, maxPerMinute: 100 });
    w.gate.registerAction(act('x.a', 'ka'));
    w.gate.registerAction(act('x.b', 'kb'));
    w.gate.setOn(true);
    w.gate.submit('x.a');
    w.gate.submit('x.b');
    w.gate.setOn(false);
    expect(w.gate.snapshot().queue).toEqual([]);
    expect(w.gate.snapshot().counts.kills).toBe(0);
    expect(w.gate.snapshot().counts.cleared).toBe(1);
  });
  it('kill works when already off and never throws', () => {
    const { gate } = world();
    expect(() => gate.kill()).not.toThrow();
    expect(gate.snapshot().counts.kills).toBe(1);
  });
  it('switching back on works after a kill', () => {
    const { gate } = world();
    gate.registerAction(act('x.a', 'ka'));
    gate.setOn(true);
    gate.kill();
    gate.setOn(true);
    expect(gate.submit('x.a')).toMatchObject({ ok: true });
  });
  it('a door added while on is opened at once, one added while off waits for the switch', () => {
    const { gate } = world();
    let a = 0;
    let b = 0;
    gate.registerDoor({ id: 'door.a', label: 'A', open: () => a++, close: () => void 0 });
    expect(a).toBe(0);
    gate.setOn(true);
    expect(a).toBe(1);
    gate.registerDoor({ id: 'door.b', label: 'B', open: () => b++, close: () => void 0 });
    expect(b).toBe(1);
    expect(gate.snapshot().doors.map((d) => d.id)).toEqual(['door.a', 'door.b']);
  });
  it('a door that throws on close does not stop the rest closing', () => {
    const { gate } = world();
    let closed = false;
    gate.registerDoor({ id: 'door.a', label: 'A', open: () => void 0, close: () => { throw new Error('stuck'); } });
    gate.registerDoor({ id: 'door.b', label: 'B', open: () => void 0, close: () => (closed = true) });
    gate.setOn(true);
    expect(() => gate.kill()).not.toThrow();
    expect(closed).toBe(true);
  });
  it('closes a door when it is taken away, and refuses the same id twice', () => {
    const { gate } = world();
    let closed = 0;
    const off = gate.registerDoor({ id: 'door.a', label: 'A', open: () => void 0, close: () => closed++ });
    expect(() => gate.registerDoor({ id: 'door.a', label: 'A', open: () => void 0, close: () => void 0 })).toThrow(/already/);
    off();
    expect(closed).toBe(1);
    expect(gate.snapshot().doors).toEqual([]);
  });
});

describe('failures and what is kept', () => {
  it('counts an action that throws, and carries on', () => {
    const { gate } = world();
    gate.registerAction(act('x.a', 'ka', { run: () => { throw new Error('nope'); } }));
    gate.setOn(true);
    expect(gate.submit('x.a')).toEqual({ ok: true, outcome: 'ran' });
    expect(gate.snapshot().counts.failed).toBe(1);
    expect(gate.isOn()).toBe(true);
  });
  it('counts an action whose promise rejects, and stops counting it as running', async () => {
    const { gate } = world();
    gate.registerAction(act('x.a', 'ka', { run: () => Promise.reject(new Error('nope')) }));
    gate.setOn(true);
    gate.submit('x.a');
    expect(gate.snapshot().running).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(gate.snapshot().running).toBe(0);
    expect(gate.snapshot().counts.failed).toBe(1);
  });
  it('keeps counts by kind and by reason, and nothing else', () => {
    const w = world({ minGapMs: 0, maxPerMinute: 100 });
    w.gate.registerAction(act('quill.cheer', 'quill', { cooldown: 1000 }));
    w.gate.registerAction(act('dare.flip', 'dare'));
    w.gate.setOn(true);
    w.gate.submit('quill.cheer', { user: 'viewer42' });
    w.gate.submit('quill.cheer');
    w.gate.submit('dare.flip');
    w.gate.submit('nope.nope');
    const c = w.gate.snapshot().counts;
    expect(c).toMatchObject({ received: 4, ran: 2, byKind: { quill: 1, dare: 1 }, rejected: { cooldown: 1, unknown: 1 } });
    // Nothing a payload carried is anywhere in what the gate shows.
    expect(JSON.stringify(w.gate.snapshot())).not.toContain('viewer42');
  });
  it('shows a queued item by its label only', () => {
    const w = world({ minGapMs: 3000, maxPerMinute: 100 });
    w.gate.registerAction({ ...act('prompt.add', 'prompt'), label: 'Add to the prompt jar', parse: (r: unknown) => r as string, run: () => undefined } as unknown as AudienceActionDef);
    w.gate.registerAction(act('x.a', 'ka'));
    w.gate.setOn(true);
    w.gate.submit('x.a');
    w.gate.submit('prompt.add', 'a secret name viewer42');
    const q = w.gate.snapshot().queue[0];
    expect(Object.keys(q).sort()).toEqual(['at', 'kind', 'label', 'ticket']);
    expect(JSON.stringify(w.gate.snapshot())).not.toContain('viewer42');
  });
  it('resets the counts', () => {
    const { gate } = world();
    gate.submit('x.a');
    gate.resetCounts();
    expect(gate.snapshot().counts.received).toBe(0);
  });
  it('gives a held snapshot that never changes underneath, and a new one after a change', () => {
    const { gate } = world();
    gate.registerAction(act('x.a', 'ka'));
    const before = gate.snapshot();
    expect(gate.snapshot()).toBe(before);
    gate.setOn(true);
    gate.submit('x.a');
    expect(before.counts.ran).toBe(0);
    expect(gate.snapshot()).not.toBe(before);
    expect(gate.snapshot().counts.ran).toBe(1);
  });
  it('tells listeners, and survives one that throws', () => {
    const { gate } = world();
    let n = 0;
    gate.subscribe(() => { throw new Error('bad view'); });
    const off = gate.subscribe(() => void n++);
    gate.setOn(true);
    expect(n).toBeGreaterThan(0);
    const seen = n;
    off();
    gate.setOn(false);
    expect(n).toBe(seen);
  });
});

describe('limits and lasts', () => {
  it('reads strictness by name, and anything odd as balanced', () => {
    expect(limitsFor('strict')).toBe(STRICTNESS.strict);
    expect(limitsFor('relaxed')).toBe(STRICTNESS.relaxed);
    expect(limitsFor('balanced')).toBe(STRICTNESS.balanced);
    expect(limitsFor(undefined)).toBe(STRICTNESS.balanced);
    expect(limitsFor('anything')).toBe(STRICTNESS.balanced);
  });
  it('strict is tighter than balanced, which is tighter than relaxed, in every way', () => {
    const { relaxed: r, balanced: b, strict: s } = STRICTNESS;
    expect(s.minGapMs).toBeGreaterThan(b.minGapMs);
    expect(b.minGapMs).toBeGreaterThan(r.minGapMs);
    expect(s.maxPerMinute).toBeLessThan(b.maxPerMinute);
    expect(b.maxPerMinute).toBeLessThan(r.maxPerMinute);
    expect(s.maxQueue).toBeLessThan(b.maxQueue);
    expect(s.cooldownScale).toBeGreaterThan(b.cooldownScale);
    expect(b.cooldownScale).toBeGreaterThan(r.cooldownScale);
  });
  it('lasts ends when the time is up or the signal aborts, whichever is first', async () => {
    const ctl = new AbortController();
    const t0 = Date.now();
    const p = lasts(60_000, ctl.signal);
    ctl.abort();
    await p;
    expect(Date.now() - t0).toBeLessThan(1000);
    await lasts(60_000, ctl.signal); // already aborted: ends at once
    await lasts(5, new AbortController().signal);
  });
});

describe('actions that reach the drawing', () => {
  const draws = (id: string, kind: string, over: Partial<AudienceActionDef> = {}): AudienceActionDef => ({ id, label: id, kind, cooldown: 0, touchesDrawing: true, run: (_p, ctx) => ctx.edit!('Audience smudge', () => undefined), ...over });

  it('is refused as unavailable while interruptions are off, and counted, and costs nothing', () => {
    const edits: string[] = [];
    const w = world({ minGapMs: 0, maxPerMinute: 100 }, edits);
    w.gate.registerAction(draws('dare.smudge', 'dare', { cooldown: 5000 }));
    w.gate.setOn(true);
    expect(w.gate.snapshot().drawingAllowed).toBe(false);
    expect(w.gate.submit('dare.smudge')).toEqual({ ok: false, reason: 'unavailable' });
    expect(edits).toEqual([]);
    expect(w.gate.snapshot().counts.rejected.unavailable).toBe(1);
    // No cooldown was spent, so it can go the moment it is allowed.
    w.gate.setDrawingAllowed(true);
    expect(w.gate.submit('dare.smudge')).toEqual({ ok: true, outcome: 'ran' });
    expect(edits).toEqual(['Audience smudge']);
  });
  it('does not say anything that tells it apart from a missing action beyond the reason', () => {
    const w = world();
    w.gate.registerAction(draws('dare.smudge', 'dare'));
    w.gate.setOn(true);
    expect(Object.keys(w.gate.submit('dare.smudge')).sort()).toEqual(['ok', 'reason']);
  });
  it('lists it as unavailable for a door, until allowed', () => {
    const w = world();
    w.gate.registerAction(draws('dare.smudge', 'dare'));
    w.gate.registerAction(act('quill.cheer'));
    expect(w.gate.snapshot().actions.map((a) => [a.id, a.touchesDrawing, a.available])).toEqual([
      ['dare.smudge', true, false],
      ['quill.cheer', false, true],
    ]);
    w.gate.setDrawingAllowed(true);
    expect(w.gate.snapshot().actions.every((a) => a.available)).toBe(true);
  });
  it('still waits its turn: the queue, the cooldown and the rate limit apply', () => {
    const edits: string[] = [];
    const w = world({ minGapMs: 3000, maxPerMinute: 100 }, edits);
    w.gate.registerAction(draws('dare.smudge', 'dare', { cooldown: 20_000 }));
    w.gate.registerAction(draws('pen.wobble', 'pen'));
    w.gate.setDrawingAllowed(true);
    w.gate.setOn(true);
    expect(w.gate.submit('dare.smudge')).toMatchObject({ outcome: 'ran' });
    expect(w.gate.submit('dare.smudge')).toMatchObject({ reason: 'cooldown' });
    expect(w.gate.submit('pen.wobble')).toMatchObject({ outcome: 'queued' });
    expect(edits).toHaveLength(1);
    w.advance(3000);
    expect(edits).toHaveLength(2);
  });
  it('gives a drawing action one edit, which is one undo step, and no more', () => {
    const edits: string[] = [];
    let second: unknown;
    const w = world({ minGapMs: 0, maxPerMinute: 100 }, edits);
    w.gate.registerAction(
      draws('dare.smudge', 'dare', {
        run: (_p, ctx) => {
          ctx.edit!('Audience smudge', () => undefined);
          try {
            ctx.edit!('Audience smudge again', () => undefined);
          } catch (e) {
            second = e;
            throw e;
          }
        },
      }),
    );
    w.gate.setDrawingAllowed(true);
    w.gate.setOn(true);
    w.gate.submit('dare.smudge');
    expect(edits).toEqual(['Audience smudge']);
    expect(String(second)).toMatch(/once/);
    expect(w.gate.snapshot().counts.failed).toBe(1);
  });
  it('gives no edit to an action that does not say it touches the drawing', () => {
    let got: unknown = 'unset';
    const w = world();
    w.gate.registerAction(act('quill.cheer', 'quill', { run: (_p, ctx) => void (got = ctx.edit) }));
    w.gate.setDrawingAllowed(true);
    w.gate.setOn(true);
    w.gate.submit('quill.cheer');
    expect(got).toBeUndefined();
  });
  it('refuses an edit after kill, so a long dare cannot change the drawing once stopped', async () => {
    const edits: string[] = [];
    let late: unknown = 'unset';
    const w = world({ minGapMs: 0, maxPerMinute: 100 }, edits);
    w.gate.registerAction(
      draws('dare.slow', 'dare', {
        run: async (_p, ctx) => {
          await lasts(60_000, ctx.signal);
          try {
            ctx.edit!('Late smudge', () => undefined);
            late = 'edited';
          } catch (e) {
            late = String(e);
          }
        },
      }),
    );
    w.gate.setDrawingAllowed(true);
    w.gate.setOn(true);
    w.gate.submit('dare.slow');
    w.gate.kill();
    await new Promise((r) => setTimeout(r, 0));
    expect(late).toMatch(/Stopped/);
    expect(edits).toEqual([]);
  });
  it('kill stops both kinds, and switching interruptions off drops only the drawing ones', async () => {
    const w = world({ minGapMs: 3000, maxPerMinute: 100 });
    const log: string[] = [];
    let abortedDrawing = false;
    w.gate.registerAction(draws('dare.slow', 'dare', { run: async (_p, ctx) => { await lasts(60_000, ctx.signal); abortedDrawing = ctx.signal.aborted; } }));
    w.gate.registerAction(draws('pen.wobble', 'pen', { run: () => void log.push('wobble') }));
    w.gate.registerAction(act('quill.cheer', 'quill', {}, log));
    w.gate.setDrawingAllowed(true);
    w.gate.setOn(true);
    w.gate.submit('dare.slow');
    w.gate.submit('pen.wobble');
    w.gate.submit('quill.cheer');
    expect(w.gate.snapshot().queue.map((q) => q.label)).toEqual(['pen.wobble', 'quill.cheer']);
    w.gate.setDrawingAllowed(false);
    expect(w.gate.snapshot().queue.map((q) => q.label)).toEqual(['quill.cheer']);
    expect(w.gate.snapshot().running).toBe(0);
    await new Promise((r) => setTimeout(r, 0));
    expect(abortedDrawing).toBe(true);
    expect(w.gate.isOn()).toBe(true);
    w.advance(5000);
    expect(log).toEqual(['quill.cheer']);
    // and kill still stops the rest
    w.gate.setDrawingAllowed(true);
    w.gate.submit('quill.cheer');
    w.gate.kill();
    expect(w.gate.snapshot().running).toBe(0);
    expect(w.gate.snapshot().queue).toEqual([]);
  });
  it('drops a waiting drawing action if interruptions were switched off while it waited', () => {
    const edits: string[] = [];
    const w = world({ minGapMs: 3000, maxPerMinute: 100 }, edits);
    w.gate.registerAction(act('quill.cheer'));
    w.gate.registerAction(draws('dare.smudge', 'dare'));
    w.gate.setDrawingAllowed(true);
    w.gate.setOn(true);
    w.gate.submit('quill.cheer');
    w.gate.submit('dare.smudge');
    w.gate.setDrawingAllowed(false);
    w.advance(10_000);
    expect(edits).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { OBS_START, classifyFailure, isOwnNetwork, obsLook, obsStep, outputActive, parseObsAddress, retryDelay, type ObsEvent, type ObsState } from '../../src/streamsafe/obsLogic';

const run = (events: ObsEvent[], from: ObsState = OBS_START) => {
  let state = from;
  const actions: string[] = [];
  for (const e of events) {
    const r = obsStep(state, e);
    state = r.state;
    actions.push(...r.actions.map((a) => a.do));
  }
  return { state, actions };
};
const up: ObsEvent[] = [{ t: 'enable' }, { t: 'connected', streaming: false, recording: false }];

describe('the OBS address', () => {
  it('takes the usual forms', () => {
    expect(parseObsAddress('localhost:4455')).toMatchObject({ ok: true, url: 'ws://localhost:4455', port: 4455 });
    expect(parseObsAddress('  ws://localhost:4456/ ')).toMatchObject({ ok: true, url: 'ws://localhost:4456' });
    expect(parseObsAddress('192.168.1.20')).toMatchObject({ ok: true, url: 'ws://192.168.1.20:4455' });
    expect(parseObsAddress('studio-pc.local:4460')).toMatchObject({ ok: true, port: 4460 });
    expect(parseObsAddress('[::1]:4455')).toMatchObject({ ok: true, url: 'ws://[::1]:4455' });
  });
  it('turns away the internet, with a reason', () => {
    for (const a of ['example.com', '8.8.8.8:4455', 'ws://obs.example.org']) {
      const r = parseObsAddress(a);
      expect(r.ok, a).toBe(false);
      if (!r.ok) expect(r.why).toMatch(/own computer or your own network/);
    }
  });
  it('turns away nonsense kindly', () => {
    for (const a of ['', '   ', 'localhost:abc', 'localhost:0', 'localhost:99999', 'a b', 'user@localhost']) expect(parseObsAddress(a).ok, a).toBe(false);
  });
  it('knows which places are your own', () => {
    expect(['localhost', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.9.9', '192.168.0.5', 'pc.local'].every(isOwnNetwork)).toBe(true);
    expect(['172.32.0.1', '11.0.0.1', '1.1.1.1', 'obs.com', '256.1.1.1'].some(isOwnNetwork)).toBe(false);
  });
});

describe('what OBS says about its outputs', () => {
  it('counts starting as on and stopped as off, and leaves stopping alone', () => {
    expect(outputActive('OBS_WEBSOCKET_OUTPUT_STARTING')).toBe(true);
    expect(outputActive('OBS_WEBSOCKET_OUTPUT_STARTED')).toBe(true);
    expect(outputActive('OBS_WEBSOCKET_OUTPUT_RECONNECTING')).toBe(true);
    expect(outputActive('OBS_WEBSOCKET_OUTPUT_PAUSED')).toBe(true);
    expect(outputActive('OBS_WEBSOCKET_OUTPUT_STOPPED')).toBe(false);
    expect(outputActive('OBS_WEBSOCKET_OUTPUT_STOPPING')).toBeUndefined();
    expect(outputActive('something new')).toBeUndefined();
  });
  it('sorts failures: only a password needs the person', () => {
    expect(classifyFailure({ code: 4009, message: 'Authentication failed.' })).toBe('password');
    expect(classifyFailure(new Error('Authentication failed'))).toBe('password');
    expect(classifyFailure({ code: 4010 })).toBe('refused');
    expect(classifyFailure({ code: 'ECONNREFUSED' })).toBe('unreachable');
    expect(classifyFailure(new Error('connect ETIMEDOUT'))).toBe('unreachable');
    expect(classifyFailure(null)).toBe('unreachable');
  });
  it('waits longer between tries, up to half a minute', () => {
    expect([1, 2, 3, 4, 5, 6, 40].map(retryDelay)).toEqual([3000, 5000, 8000, 13000, 20000, 30000, 30000]);
  });
});

describe('the connection', () => {
  it('starts off and does nothing until enabled', () => {
    expect(OBS_START.link).toBe('off');
    expect(run([{ t: 'retry' }, { t: 'closed' }, { t: 'output', kind: 'stream', active: true }]).actions).toEqual([]);
  });
  it('enable tries to connect, and a connection is quiet', () => {
    const r = run(up);
    expect(r.actions).toEqual(['connect']);
    expect(r.state.link).toBe('connected');
  });
  it('OBS not running is a quiet wait with a retry, and the waits grow', () => {
    const a = obsStep(obsStep(OBS_START, { t: 'enable' }).state, { t: 'failed', why: 'unreachable' });
    expect(a.state.link).toBe('waiting');
    expect(a.actions).toEqual([{ do: 'retryIn', ms: 3000 }]);
    const b = obsStep(obsStep(a.state, { t: 'retry' }).state, { t: 'failed', why: 'unreachable' });
    expect(b.actions).toEqual([{ do: 'retryIn', ms: 5000 }]);
  });
  it('a wrong password stops the retrying until the person fixes it, and trying again recovers', () => {
    const w = run([{ t: 'enable' }, { t: 'failed', why: 'password' }]);
    expect(w.state.link).toBe('password');
    expect(w.actions).toEqual(['connect']);
    const again = run([{ t: 'retry' }, { t: 'connected', streaming: false, recording: false }], w.state);
    expect(again.state.link).toBe('connected');
  });
  it('a bad address waits for the person too', () => {
    expect(run([{ t: 'enable' }, { t: 'failed', why: 'address' }]).state.link).toBe('address');
  });
  it('a refusing OBS is tried again slowly', () => {
    const r = obsStep(obsStep(OBS_START, { t: 'enable' }).state, { t: 'failed', why: 'refused' });
    expect(r.actions).toEqual([{ do: 'retryIn', ms: 30000 }]);
  });
  it('disable stops everything from any state', () => {
    const r = run([{ t: 'disable' }], run(up).state);
    expect(r.state.link).toBe('off');
    expect(r.actions).toEqual(['cancelRetry', 'disconnect']);
  });
  it('a late answer after disable changes nothing', () => {
    const r = run([{ t: 'enable' }, { t: 'disable' }, { t: 'connected', streaming: true, recording: false }, { t: 'failed', why: 'unreachable' }]);
    expect(r.state.link).toBe('off');
    expect(r.actions).not.toContain('safeOn');
  });
  it('OBS going away waits and looks again', () => {
    const r = run([{ t: 'closed' }], run(up).state);
    expect(r.state.link).toBe('waiting');
    expect(r.actions).toEqual(['retryIn']);
  });
});

describe('going live and stopping', () => {
  it('starting to stream turns Stream-safe on, once', () => {
    const r = run([{ t: 'output', kind: 'stream', active: true }, { t: 'output', kind: 'record', active: true }], run(up).state);
    expect(r.actions).toEqual(['safeOn']);
    expect(r.state).toMatchObject({ safe: true, owns: true, streaming: true, recording: true });
  });
  it('recording alone counts', () => {
    expect(run([{ t: 'output', kind: 'record', active: true }], run(up).state).actions).toEqual(['safeOn']);
  });
  it('stopping offers to turn it off, and only once everything has stopped', () => {
    const live = run([{ t: 'output', kind: 'stream', active: true }, { t: 'output', kind: 'record', active: true }], run(up).state).state;
    const one = run([{ t: 'output', kind: 'stream', active: false }], live);
    expect(one.actions).toEqual([]);
    const both = run([{ t: 'output', kind: 'record', active: false }], one.state);
    expect(both.actions).toEqual(['offerOff']);
    expect(both.state.owns).toBe(false);
  });
  it('already on before going live: nothing switched, nothing offered', () => {
    const start = { ...run(up).state, safe: true };
    const r = run([{ t: 'output', kind: 'stream', active: true }, { t: 'output', kind: 'stream', active: false }], start);
    expect(r.actions).toEqual([]);
  });
  it('switched off by hand while live: no offer later', () => {
    const r = run([{ t: 'output', kind: 'stream', active: true }, { t: 'safe', on: false }, { t: 'output', kind: 'stream', active: false }], run(up).state);
    expect(r.actions).toEqual(['safeOn']);
  });
  it('OBS already live when it connects turns it on', () => {
    const r = run([{ t: 'enable' }, { t: 'connected', streaming: true, recording: false }]);
    expect(r.actions).toEqual(['connect', 'safeOn']);
  });
  it('OBS closing mid-stream counts as the stream ending', () => {
    const live = run([{ t: 'output', kind: 'stream', active: true }], run(up).state).state;
    expect(run([{ t: 'closed' }], live).actions).toEqual(['offerOff', 'retryIn']);
  });
});

describe('what the pill says', () => {
  it('shows nothing while off, and says each state in plain words', () => {
    expect(obsLook(OBS_START)).toBeNull();
    const conn = run(up).state;
    expect(obsLook(conn)).toMatchObject({ tone: 'ready', label: 'OBS: connected' });
    expect(obsLook({ ...conn, streaming: true })).toMatchObject({ tone: 'live', label: 'OBS: live' });
    expect(obsLook({ ...conn, recording: true })).toMatchObject({ tone: 'live', label: 'OBS: recording' });
    expect(obsLook({ ...conn, link: 'waiting' })).toMatchObject({ tone: 'waiting', label: 'OBS: not found' });
    expect(obsLook({ ...conn, link: 'password' })?.tone).toBe('attention');
    for (const link of ['connecting', 'waiting', 'password', 'address', 'connected'] as const) {
      const l = obsLook({ ...conn, link })!;
      expect(l.label + l.detail).not.toMatch(/[–—]/);
    }
  });
});

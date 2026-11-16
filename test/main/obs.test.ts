import { describe, expect, it } from 'vitest';
import { ObsSecret, canKeepSecrets, type SafeStorageLike, type SecretFile } from '../../src/main/obsSecret';
import { ObsSession, type ObsClientLike, type ObsMessage } from '../../src/main/obsSession';

class FakeObs implements ObsClientLike {
  handlers = new Map<string, (d: any) => void>();
  connectedWith: { url?: string; password?: string; subs?: number } = {};
  failWith: unknown = null;
  hang = false;
  status = { stream: false, record: false };
  closed = false;
  async connect(url: string, password?: string, opts?: { eventSubscriptions?: number }) {
    this.connectedWith = { url, password, subs: opts?.eventSubscriptions };
    if (this.hang) return new Promise(() => undefined);
    if (this.failWith) throw this.failWith;
  }
  async disconnect() {
    this.closed = true;
  }
  async call(r: 'GetStreamStatus' | 'GetRecordStatus') {
    return { outputActive: r === 'GetStreamStatus' ? this.status.stream : this.status.record };
  }
  on(e: string, h: (d: any) => void) {
    this.handlers.set(e, h);
  }
  fire(e: string, d?: unknown) {
    this.handlers.get(e)?.(d);
  }
}

// The fake answers at once, so a long default limit costs nothing; only the test of a hanging connection wants a short one.
function session(configure: (c: FakeObs) => void = () => undefined, timeoutMs = 5000) {
  const sent: ObsMessage[] = [];
  const made: FakeObs[] = [];
  const s = new ObsSession({
    make: () => {
      const c = new FakeObs();
      configure(c);
      made.push(c);
      return c;
    },
    emit: (m) => void sent.push(m),
    timeoutMs,
  });
  return { s, sent, made };
}

describe('the OBS connection (desktop side)', () => {
  it('connects with the password and asks only for the outputs', async () => {
    const { s, made } = session();
    s.setPassword('pw');
    expect(await s.connect('localhost:4455')).toEqual({ ok: true, streaming: false, recording: false });
    expect(made[0].connectedWith).toEqual({ url: 'ws://localhost:4455', password: 'pw', subs: 64 });
  });
  it('no password is sent as none', async () => {
    const { s, made } = session();
    await s.connect('localhost');
    expect(made[0].connectedWith.password).toBeUndefined();
  });
  it('reports what is already going out', async () => {
    const { s } = session((c) => (c.status = { stream: true, record: false }));
    expect(await s.connect('localhost')).toEqual({ ok: true, streaming: true, recording: false });
  });
  it('refuses an address off your own network without touching the network', async () => {
    const { s, made } = session();
    expect(await s.connect('example.com:4455')).toEqual({ ok: false, why: 'address' });
    expect(made).toHaveLength(0);
  });
  it('OBS not running comes back as an answer, never a throw', async () => {
    const { s } = session((c) => (c.failWith = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4455'), { code: 'ECONNREFUSED' })));
    expect(await s.connect('localhost')).toEqual({ ok: false, why: 'unreachable' });
    expect(s.connected).toBe(false);
  });
  it('a wrong password is its own answer', async () => {
    const { s } = session((c) => (c.failWith = Object.assign(new Error('Authentication failed.'), { code: 4009 })));
    expect(await s.connect('localhost')).toEqual({ ok: false, why: 'password' });
  });
  it('no answer in time counts as not there', async () => {
    const { s, made } = session((c) => (c.hang = true), 20);
    expect(await s.connect('localhost')).toEqual({ ok: false, why: 'unreachable' });
    expect(made[0].closed).toBe(true);
  });
  it('passes on streaming and recording changing, and ignores stopping and the unknown', async () => {
    const { s, made, sent } = session();
    await s.connect('localhost');
    const c = made[0];
    c.fire('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
    c.fire('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPING' });
    c.fire('StreamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
    c.fire('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTING' });
    c.fire('RecordStateChanged', { outputActive: false, outputState: 'who knows' });
    expect(sent).toEqual([
      { type: 'output', kind: 'stream', active: true },
      { type: 'output', kind: 'stream', active: false },
      { type: 'output', kind: 'record', active: true },
    ]);
  });
  it('says when OBS goes away, once, and forgets the client', async () => {
    const { s, made, sent } = session();
    await s.connect('localhost');
    made[0].fire('ConnectionClosed');
    made[0].fire('ConnectionClosed');
    expect(sent).toEqual([{ type: 'closed' }]);
    expect(s.connected).toBe(false);
  });
  it('a deliberate disconnect is not reported as OBS going away', async () => {
    const { s, made, sent } = session();
    await s.connect('localhost');
    await s.disconnect();
    made[0].fire('ConnectionClosed');
    made[0].fire('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
    expect(sent).toEqual([]);
    expect(made[0].closed).toBe(true);
  });
  it('connecting again drops the old client', async () => {
    const { s, made } = session();
    await s.connect('localhost');
    await s.connect('localhost');
    expect(made[0].closed).toBe(true);
    expect(made).toHaveLength(2);
  });
});

const fakeSafe = (over: Partial<SafeStorageLike> = {}): SafeStorageLike => ({
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`enc:${s}`.split('').reverse().join('')),
  decryptString: (b) => b.toString().split('').reverse().join('').slice(4),
  ...over,
});
const fakeFile = () => {
  let text: string | null = null;
  const f: SecretFile & { peek: () => string | null } = { read: () => text, write: (t) => void (text = t), remove: () => void (text = null), peek: () => text };
  return f;
};

describe('where the password is kept', () => {
  it('is saved encrypted, never as the plain word, and read back', () => {
    const file = fakeFile();
    const a = new ObsSecret(fakeSafe(), file);
    expect(a.set('hunter2', true)).toBe(true);
    expect(file.peek()).not.toContain('hunter2');
    const b = new ObsSecret(fakeSafe(), file);
    expect(b.get()).toBe('hunter2');
    expect(b.has()).toBe(true);
  });
  it('not remembered: it lasts this session only and nothing is on disk', () => {
    const file = fakeFile();
    const a = new ObsSecret(fakeSafe(), file);
    expect(a.set('hunter2', false)).toBe(false);
    expect(file.peek()).toBeNull();
    expect(a.get()).toBe('hunter2');
    expect(new ObsSecret(fakeSafe(), file).has()).toBe(false);
  });
  it('a computer with no real key store keeps it in memory only', () => {
    for (const safe of [fakeSafe({ isEncryptionAvailable: () => false }), fakeSafe({ getSelectedStorageBackend: () => 'basic_text' }), null]) {
      const file = fakeFile();
      const a = new ObsSecret(safe, file);
      expect(a.canSave).toBe(false);
      expect(a.set('hunter2', true)).toBe(false);
      expect(file.peek()).toBeNull();
      expect(a.get()).toBe('hunter2');
    }
    expect(canKeepSecrets(fakeSafe({ getSelectedStorageBackend: () => 'gnome_libsecret' }))).toBe(true);
  });
  it('forget removes it everywhere', () => {
    const file = fakeFile();
    const a = new ObsSecret(fakeSafe(), file);
    a.set('hunter2', true);
    a.forget();
    expect(a.has()).toBe(false);
    expect(file.peek()).toBeNull();
  });
  it('a damaged file is no password, not an error', () => {
    const file = fakeFile();
    file.write('{nope');
    expect(new ObsSecret(fakeSafe(), file).get()).toBe('');
    file.write(JSON.stringify({ v: 9, password: 'x' }));
    expect(new ObsSecret(fakeSafe(), file).get()).toBe('');
  });
});
